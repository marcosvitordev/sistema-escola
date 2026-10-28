'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ArrowDownUp, ArrowLeftRight, Move, MoveDiagonal2 } from 'lucide-react';
import type { Annotation } from '@/lib/pdf-annotations';
import { PdfLinks } from './pdf-links';

export function PdfPage({ pdf, pageNumber, zoom, availableWidth, notes, readOnly, tool, selected, onSelect, update, add, onNavigate, controlsHeight }: { pdf: PDFDocumentProxy; pageNumber: number; zoom: number | 'fit'; availableWidth: number; notes: Annotation[]; readOnly: boolean; tool: string; selected: string; onSelect: (id: string) => void; update: (id: string, patch: Partial<Annotation>) => void; add: (page: number, x: number, y: number) => void; onNavigate: (page: number) => void; controlsHeight: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 612, height: 792 });
  const [renderError, setRenderError] = useState('');
  const [renderedKey, setRenderedKey] = useState('');
  const [near, setNear] = useState(pageNumber === 1);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const scale = zoom === 'fit' ? Math.max(.1, Math.min(1.25, availableWidth / size.width)) : zoom;
  const visible = near || notes.some(note => note.id === selected);
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const resize = useRef<{ id: string; kind: 'width' | 'height' | 'both'; startX: number; startY: number; width: number; height: number } | null>(null);
  function resizeNote(note: Annotation, kind: 'width' | 'height' | 'both', width: number, height: number) {
    if (!sheet.current || readOnly) return;
    const rect = sheet.current.getBoundingClientRect();
    const minWidth = Math.min(1 - note.x, Math.max(.02, 48 / rect.width));
    const minHeight = Math.min(1 - note.y, Math.max(.01, 28 / rect.height));
    update(note.id, { manualSize: true, ...(kind !== 'height' ? { width: Math.max(minWidth, Math.min(1 - note.x, width)) } : {}), ...(kind !== 'width' ? { height: Math.max(minHeight, Math.min(1 - note.y, height)) } : {}) });
  }
  const rendering = useRef<RenderTask | null>(null);
  useEffect(() => {
    let active = true;
    void pdf.getPage(pageNumber).then(page => { if (active) { const viewport = page.getViewport({ scale: 1 }); setSize({ width: viewport.width, height: viewport.height }); } }).catch(() => { if (active) setRenderError('Não foi possível carregar esta página.'); });
    const observer = new IntersectionObserver(entries => setNear(entries[0].isIntersecting), { rootMargin: '600px 0px' });
    if (sheet.current) observer.observe(sheet.current);
    return () => { active = false; observer.disconnect(); };
  }, [pdf, pageNumber]);
  useEffect(() => {
    if (!visible) return;
    let active = true; let render: RenderTask | undefined;
    setRenderError(''); setRenderedKey('');
    const target = canvas.current;
    async function draw() {
      try {
        const previous = rendering.current;
        previous?.cancel();
        if (previous) await previous.promise.catch(() => {});
        const page = await pdf.getPage(pageNumber);
        if (!active || !canvas.current) return;
        const base = page.getViewport({ scale: 1 }); setSize({ width: base.width, height: base.height });
        const viewport = page.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6_000_000 / (viewport.width * viewport.height)));
        canvas.current.width = viewport.width * ratio; canvas.current.height = viewport.height * ratio;
        render = page.render({ canvas: canvas.current, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        rendering.current = render;
        await render.promise;
        if (active) setRenderedKey(`${pageNumber}:${scale}`);
      } catch (e) { if (active && !(e instanceof Error && e.name === 'RenderingCancelledException')) { console.error('PDF rendering', e); setRenderError('Não foi possível desenhar esta página.'); } }
    }
    void draw();
    return () => { active = false; render?.cancel(); if (target) { target.width = 0; target.height = 0; } };
  }, [pdf, pageNumber, scale, visible]);
  return <section className="pdf-page-frame" aria-label={`Página ${pageNumber}`} style={{ scrollMarginTop: controlsHeight + 12 }}><div className="pdf-page-label">Página {pageNumber} de {pdf.numPages}</div><div className={`pdf-sheet ${tool !== 'select' && !readOnly ? 'is-placing-note' : ''}`} ref={sheet} data-testid="pdf-page" data-page-number={pageNumber} data-page-width={size.width} data-page-height={size.height} data-rendered={visible && renderedKey === `${pageNumber}:${scale}`} style={{ width: size.width * scale, height: size.height * scale }} onPointerDown={event => { pointer.current = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY } : null; }} onPointerCancel={() => { pointer.current = null; }} onClick={event => {
    if (readOnly || event.target !== sheet.current) return;
    if (tool === 'select') { onSelect(''); return; }
    const start = pointer.current; pointer.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
    const rect = event.currentTarget.getBoundingClientRect(); add(pageNumber, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  }}>{visible && <><canvas ref={canvas} aria-label={`Página ${pageNumber} da apostila`} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} /><PdfLinks pdf={pdf} pageNumber={pageNumber} onNavigate={onNavigate} /></>}{renderError && <p className="error">{renderError}</p>}{notes.map(note => <div key={note.id} className={`pdf-note ${note.id === selected ? 'selected' : ''} ${note.type}`} style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%`, width: `${note.width * 100}%`, height: `${note.height * 100}%`, ...(note.type === 'highlight' ? { backgroundColor: note.color } : {}) }} onClick={e => { e.stopPropagation(); onSelect(note.id); }}>
      {!readOnly && note.id === selected && <button className="move-handle" aria-label="Mover resposta" onPointerDown={e => { e.preventDefault(); drag.current = { id: note.id, startX: e.clientX, startY: e.clientY, x: note.x, y: note.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { const start = drag.current; if (!start || !sheet.current) return; const rect = sheet.current.getBoundingClientRect(); update(start.id, { x: Math.max(0, Math.min(1 - note.width, start.x + (e.clientX - start.startX) / rect.width)), y: Math.max(0, Math.min(1 - note.height, start.y + (e.clientY - start.startY) / rect.height)) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><Move size={12} /></button>}
      {!readOnly && note.id === selected && note.type === 'text' && ([{ kind: 'width', label: 'Alterar largura da resposta', icon: ArrowLeftRight }, { kind: 'height', label: 'Alterar altura da resposta', icon: ArrowDownUp }, { kind: 'both', label: 'Redimensionar resposta', icon: MoveDiagonal2 }] as const).map(handle => <button key={handle.kind} type="button" className={`resize-handle resize-${handle.kind}`} aria-label={handle.label} title={`${handle.label}: arraste ou use as setas do teclado`} onClick={event => event.stopPropagation()} onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        resize.current = { id: note.id, kind: handle.kind, startX: event.clientX, startY: event.clientY, width: note.width, height: note.height };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        const start = resize.current; if (!start || start.id !== note.id || !sheet.current) return;
        const rect = sheet.current.getBoundingClientRect();
        resizeNote(note, start.kind, start.width + (event.clientX - start.startX) / rect.width, start.height + (event.clientY - start.startY) / rect.height);
      }} onPointerUp={event => { resize.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { resize.current = null; }} onLostPointerCapture={() => { resize.current = null; }} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !sheet.current) return;
        event.preventDefault(); event.stopPropagation();
        const rect = sheet.current.getBoundingClientRect(), step = event.shiftKey ? 20 : 4;
        resizeNote(note, handle.kind, note.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) / rect.width, note.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) / rect.height);
      }}><handle.icon size={12} /></button>)}
      {note.type === 'text' && <textarea autoFocus={!readOnly && note.id === selected && !note.text} aria-label={`Resposta na página ${pageNumber}`} placeholder={readOnly ? undefined : 'Digite sua resposta…'} wrap="off" spellCheck lang="pt-BR" readOnly={readOnly} value={note.text} style={{ fontSize: note.fontSize * scale, color: note.color, lineHeight: 1.3, ...(note.manualSize ? { overflow: 'auto' } : {}) }} onFocus={() => onSelect(note.id)} onChange={e => {
        const text = e.target.value.slice(0, 5000);
        if (note.manualSize) { update(note.id, { text }); return; }
        const measure = document.createElement('canvas').getContext('2d')!; measure.font = `${note.fontSize}px Arial`;
        const textWidth = Math.max(80, ...text.split('\n').map(line => measure.measureText(line).width + 4));
        update(note.id, { text, width: Math.min(1 - note.x, textWidth / size.width), height: Math.min(1 - note.y, Math.max(note.fontSize * 1.3, text.split('\n').length * note.fontSize * 1.3) / size.height) });
      }} />}
    </div>)}</div></section>;
}
