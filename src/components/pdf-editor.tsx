'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Highlighter, MousePointer2, Move, Trash2, Type, SlidersHorizontal, Maximize } from 'lucide-react';
import type { Annotation } from '@/lib/pdf-annotations';
import { Form } from './form';
import { useDocumentWork } from './use-document-work';
import { PdfLinks } from './pdf-links';

export function PdfEditor({ documentId, studentId, manage }: { documentId: string; studentId?: string; manage: boolean }) {
  const work = useDocumentWork(documentId, studentId);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState('');
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [tool, setTool] = useState<'select' | 'text' | 'highlight'>('text');
  const [selected, setSelected] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [color, setColor] = useState('#244f87');
  const [exporting, setExporting] = useState(false);
  const pdfArea = useRef<HTMLDivElement>(null);
  const readOnly = work.data?.readOnly ?? true;
  useEffect(() => {
    if (!work.data?.work?.feedback.length || window.location.hash !== '#correcao') return;
    const frame = requestAnimationFrame(() => {
      const feedback = document.getElementById('correcao');
      if (feedback) { feedback.style.scrollMarginTop = `${(document.querySelector('.editor-controls')?.getBoundingClientRect().height || 100) + 16}px`; feedback.scrollIntoView({ block: 'start' }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [work.data?.work?.feedback.length]);
  useEffect(() => {
    if (!work.data) return;
    let active = true;
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    async function load() {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        task = pdfjs.getDocument({ url: `${work.base}/file`, enableXfa: false });
        const document = await task.promise;
        if (active) setPdf(document);
      } catch { if (active) setPdfError('Não foi possível renderizar a apostila. Reabra a página ou peça ao professor para revisar o arquivo.'); }
    }
    void load();
    return () => { active = false; void task?.destroy(); };
  }, [work.base, !!work.data]);
  function update(id: string, patch: Partial<Annotation>) { work.change(work.notes.map(note => note.id === id ? { ...note, ...patch } : note)); }
  function navigate(next: number, followLink = false) {
    setPage(next); setSelected('');
    if (followLink && pdfArea.current) {
      pdfArea.current.scrollTop = 0;
      const controls = document.querySelector('.editor-controls')?.getBoundingClientRect().height || 0;
      window.scrollTo({ top: window.scrollY + pdfArea.current.getBoundingClientRect().top - controls });
    }
  }
  async function fitWidth() {
    if (!pdf || !pdfArea.current) return;
    const pdfPage = await pdf.getPage(page);
    const area = pdfArea.current;
    const style = getComputedStyle(area);
    const available = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    setScale(Math.max(.1, Math.min(2, Math.floor(available / pdfPage.getViewport({ scale: 1 }).width * 100) / 100)));
  }
  function addNote(x: number, y: number) {
    x = Math.min(.9, Math.max(0, x)); y = Math.min(.94, Math.max(0, y));
    const note: Annotation = { id: crypto.randomUUID(), page, type: tool === 'highlight' ? 'highlight' : 'text', x, y, width: Math.min(.4, 1 - x), height: .06, text: '', fontSize, color: tool === 'highlight' ? '#f2cc4d' : color };
    work.change([...work.notes, note]); setSelected(note.id);
  }
  async function download() {
    setExporting(true); setPdfError('');
    try {
      await work.flush();
      if (work.pending()) throw new Error('Aguarde a sincronização das alterações antes de exportar.');
      const response = await fetch(`${work.base}/export${work.query}`);
      if (!response.ok) { const result = await response.json(); throw new Error(result.error); }
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = 'apostila-respondida.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setPdfError(e instanceof Error ? e.message : 'Não foi possível exportar.'); } finally { setExporting(false); }
  }
  const selectedNote = work.notes.find(n => n.id === selected);
  return <main className="editor"><header className="editor-header"><Link href={manage ? '/' : '/?area=apostilas'} className="editor-back"><ArrowLeft size={19} />{manage ? 'Minhas turmas' : 'Minhas apostilas'}</Link><div className="editor-document-title"><h1>{work.data?.document.title || 'Apostila interativa'}</h1><small>{work.data?.document.lesson.title}</small></div>{work.data && (!manage || studentId) && <button className="secondary" disabled={exporting} onClick={download}><Download size={16} />{exporting ? 'Exportando…' : 'Exportar PDF'}</button>}{work.data && !readOnly && <button onClick={work.submit}>Entregar apostila</button>}</header>
    <div className="editor-controls">
      <div className="editor-toolbar" role="region" aria-label="Ferramentas do editor">
        <div className="reader-controls">
          <div className="tool-group page-controls">
            <button className="secondary" disabled={page <= 1} onClick={() => navigate(page - 1)} aria-label="Página anterior" title="Página anterior"><ChevronLeft size={19} /></button>
            <label>Página<select aria-label="Selecionar página" value={page} onChange={e => navigate(Number(e.target.value))}>{Array.from({ length: pdf?.numPages ?? 1 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
            <span>de {pdf?.numPages ?? '…'}</span>
            <button className="secondary" disabled={!pdf || page >= pdf.numPages} onClick={() => navigate(page + 1)} aria-label="Próxima página" title="Próxima página"><ChevronRight size={19} /></button>
          </div>
          <label>Zoom<select aria-label="Zoom" value={scale} onChange={e => setScale(Number(e.target.value))}>{Array.from(new Set([.5, .75, 1, 1.25, 1.5, 2, scale])).sort((a, b) => a - b).map(v => <option value={v} key={v}>{Math.round(v * 100)}%</option>)}</select></label>
          <button className="secondary fit-width" disabled={!pdf} onClick={() => void fitWidth()}><Maximize size={17} />Ajustar à largura</button>
        </div>
        {!readOnly && <div className="writing-controls">
          <div className="tool-group" aria-label="Modo de edição">{[{ id: 'text', label: 'Escrever resposta', icon: Type }, { id: 'select', label: 'Selecionar', icon: MousePointer2 }, { id: 'highlight', label: 'Destacar', icon: Highlighter }].map(item => <button aria-pressed={tool === item.id} className={tool === item.id ? 'tool active' : 'tool'} key={item.id} onClick={() => setTool(item.id as typeof tool)}><item.icon size={18} />{item.label}</button>)}</div>
          <details className="text-options"><summary><SlidersHorizontal size={17} />Fonte e cor</summary><div className="text-options-panel">
            <label>Tamanho da fonte<input type="number" min={8} max={40} aria-label="Tamanho da fonte" value={selectedNote?.fontSize ?? fontSize} onChange={e => { const value = Math.min(40, Math.max(8, Number(e.target.value))); setFontSize(value); if (selectedNote) update(selected, { fontSize: value, height: Math.min(1 - selectedNote.y, selectedNote.height * value / selectedNote.fontSize) }); }} /></label>
            <label>Cor<input aria-label="Cor da anotação" type="color" value={selectedNote?.color ?? color} onChange={e => { setColor(e.target.value); if (selectedNote) update(selected, { color: e.target.value }); }} /></label>
            <small>{selectedNote ? 'Aplica à resposta selecionada.' : 'Aplica às próximas respostas.'}</small>
          </div></details>
          {selectedNote && <button className="secondary delete-note" onClick={() => { work.change(work.notes.filter(n => n.id !== selected)); setSelected(''); }}><Trash2 size={16} />Apagar resposta</button>}
        </div>}
      </div>
      <div className="editor-guidance"><p className="editor-hint">{readOnly ? manage ? studentId ? 'Você está visualizando o trabalho do aluno.' : 'Prévia da apostila original.' : 'Apostila entregue. Seu professor poderá reabrir a edição.' : tool === 'text' ? 'Clique em um espaço da página e digite sua resposta.' : tool === 'highlight' ? 'Clique no trecho da página que deseja destacar.' : 'Clique em uma resposta para selecioná-la. Use a alça para mover.'}</p><span className="save-status" role="status" aria-live="polite">{work.status}</span></div>
    </div>
    {(work.error || pdfError) && <p className="error" role="alert">{work.error || pdfError}</p>}
    {work.conflict && <section className="conflict-box"><strong>Há outra versão salva no servidor.</strong><p>Seu rascunho foi preservado. Escolha qual versão deseja continuar usando. Manter o rascunho substituirá a versão atual após sua escolha.</p><button onClick={() => { if (confirm('Substituir as respostas do servidor pelo rascunho desta página?')) void work.resolve(true); }}>Manter meu rascunho</button><button className="secondary" onClick={() => { if (confirm('Descartar este rascunho local e carregar as respostas do servidor?')) void work.resolve(false); }}>Usar versão do servidor</button></section>}
    {work.data?.work?.feedback.length ? <details className="feedback card" id="correcao" open><summary>Correções e feedback</summary>{work.data.work.feedback.map(f => <article key={f.id}><strong>{f.grade !== null ? `Nota: ${f.grade.toLocaleString('pt-BR')} / 10` : 'Comentário do professor'}</strong><p>{f.comment}</p><small>{new Date(f.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })}</small></article>)}</details> : null}
    <div className="pdf-scroll" ref={pdfArea}>{pdf ? <PdfPage pdf={pdf} pageNumber={page} scale={scale} notes={work.notes.filter(n => n.page === page)} readOnly={readOnly || work.conflict} tool={tool} selected={selected} onSelect={setSelected} update={update} add={addNote} onNavigate={next => navigate(next, true)} /> : <div className="empty"><p>{pdfError || 'Abrindo páginas da apostila…'}</p></div>}</div>
    {manage && studentId && work.data?.work && <section className="feedback card"><h2>Corrigir trabalho</h2><Form endpoint={`learning/documents/${documentId}/feedback${work.query}`} label="Registrar correção" onSuccess={() => window.location.reload()} transform={d => ({ comment: d.comment, grade: d.grade === '' ? undefined : Number(d.grade), reopen: d.reopen === 'on' })}><label>Feedback para o aluno<textarea name="comment" required maxLength={5000} rows={3} /></label><label>Nota (0 a 10, opcional)<input name="grade" type="number" min="0" max="10" step="0.1" /></label><label className="checkbox-label"><input name="reopen" type="checkbox" />Reabrir a apostila para o aluno continuar</label></Form></section>}
  </main>;
}

function PdfPage({ pdf, pageNumber, scale, notes, readOnly, tool, selected, onSelect, update, add, onNavigate }: { pdf: PDFDocumentProxy; pageNumber: number; scale: number; notes: Annotation[]; readOnly: boolean; tool: string; selected: string; onSelect: (id: string) => void; update: (id: string, patch: Partial<Annotation>) => void; add: (x: number, y: number) => void; onNavigate: (page: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 612, height: 792 });
  const [renderError, setRenderError] = useState('');
  const [renderedKey, setRenderedKey] = useState('');
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const rendering = useRef<RenderTask | null>(null);
  useEffect(() => {
    let active = true; let render: RenderTask | undefined;
    setRenderError('');
    async function draw() {
      try {
        const previous = rendering.current;
        previous?.cancel();
        if (previous) await previous.promise.catch(() => {});
        const page = await pdf.getPage(pageNumber);
        if (!active || !canvas.current) return;
        const base = page.getViewport({ scale: 1 }); setSize({ width: base.width, height: base.height });
        const viewport = page.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.current.width = viewport.width * ratio; canvas.current.height = viewport.height * ratio;
        render = page.render({ canvas: canvas.current, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        rendering.current = render;
        await render.promise;
        if (active) setRenderedKey(`${pageNumber}:${scale}`);
      } catch (e) { if (active && !(e instanceof Error && e.name === 'RenderingCancelledException')) { console.error('PDF rendering', e); setRenderError('Não foi possível desenhar esta página.'); } }
    }
    void draw();
    return () => { active = false; render?.cancel(); };
  }, [pdf, pageNumber, scale]);
  return <div className="pdf-sheet" ref={sheet} data-testid="pdf-page" data-rendered={renderedKey === `${pageNumber}:${scale}`} style={{ width: size.width * scale, height: size.height * scale }} onClick={event => {
    if (readOnly || tool === 'select' || event.target !== sheet.current) return;
    const rect = event.currentTarget.getBoundingClientRect(); add((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  }}><canvas ref={canvas} aria-label={`Página ${pageNumber} da apostila`} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} /><PdfLinks pdf={pdf} pageNumber={pageNumber} onNavigate={onNavigate} />{renderError && <p className="error">{renderError}</p>}{notes.map(note => <div key={note.id} className={`pdf-note ${note.id === selected ? 'selected' : ''} ${note.type}`} style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%`, width: `${note.width * 100}%`, height: `${note.height * 100}%`, ...(note.type === 'highlight' ? { backgroundColor: note.color } : {}) }} onClick={e => { e.stopPropagation(); onSelect(note.id); }}>
      {!readOnly && note.id === selected && <button className="move-handle" aria-label="Mover resposta" onPointerDown={e => { e.preventDefault(); drag.current = { id: note.id, startX: e.clientX, startY: e.clientY, x: note.x, y: note.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { const start = drag.current; if (!start || !sheet.current) return; const rect = sheet.current.getBoundingClientRect(); update(start.id, { x: Math.max(0, Math.min(1 - note.width, start.x + (e.clientX - start.startX) / rect.width)), y: Math.max(0, Math.min(1 - note.height, start.y + (e.clientY - start.startY) / rect.height)) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><Move size={12} /></button>}
      {note.type === 'text' && <textarea autoFocus={!readOnly && note.id === selected && !note.text} aria-label={`Resposta na página ${pageNumber}`} placeholder={readOnly ? undefined : 'Digite sua resposta…'} wrap="off" spellCheck lang="pt-BR" readOnly={readOnly} value={note.text} style={{ fontSize: note.fontSize * scale, color: note.color, lineHeight: 1.3 }} onFocus={() => onSelect(note.id)} onChange={e => {
        const text = e.target.value.slice(0, 5000);
        const measure = document.createElement('canvas').getContext('2d')!; measure.font = `${note.fontSize}px Arial`;
        const textWidth = Math.max(80, ...text.split('\n').map(line => measure.measureText(line).width + 4));
        update(note.id, { text, width: Math.min(1 - note.x, textWidth / size.width), height: Math.min(1 - note.y, Math.max(note.fontSize * 1.3, text.split('\n').length * note.fontSize * 1.3) / size.height) });
      }} />}
    </div>)}</div>;
}
