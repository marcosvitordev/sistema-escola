'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, HelpCircle, Highlighter, MousePointer2, Trash2, Type } from 'lucide-react';
import type { Annotation } from '@/lib/pdf-annotations';
import { Form } from './form';
import { useDocumentWork } from './use-document-work';
import { PdfPage } from './pdf-page';
import { ReturnPdfWork } from './return-pdf-work';

export function PdfEditor({ documentId, studentId, manage }: { documentId: string; studentId?: string; manage: boolean }) {
  const work = useDocumentWork(documentId, studentId);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState('');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [tool, setTool] = useState<'select' | 'text' | 'highlight'>('select');
  const [selected, setSelected] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [color, setColor] = useState('#244f87');
  const [exporting, setExporting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pdfArea = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(612);
  const [controlsHeight, setControlsHeight] = useState(180);
  const readOnly = work.data?.readOnly ?? true;
  useEffect(() => {
    const measure = () => {
      if (pdfArea.current) { const style = getComputedStyle(pdfArea.current); setAvailableWidth(Math.max(60, pdfArea.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))); }
      if (controls.current) setControlsHeight(controls.current.offsetHeight);
    };
    const observer = new ResizeObserver(measure);
    if (pdfArea.current) observer.observe(pdfArea.current);
    if (controls.current) observer.observe(controls.current);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !pdfArea.current) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      const area = (element: Element) => { const rect = element.getBoundingClientRect(); return Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, controlsHeight)); };
      const current = [...visible].sort((a, b) => area(b) - area(a))[0];
      if (current) setPage(Number(current.getAttribute('data-page-number')));
    }, { rootMargin: `-${Math.min(controlsHeight, window.innerHeight - 1)}px 0px 0px 0px`, threshold: [0, .25, .5, .75, 1] });
    pdfArea.current.querySelectorAll('[data-page-number]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [pdf, controlsHeight]);
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
  function selectNote(id: string) {
    if (!readOnly && selected !== id) {
      const empty = work.notes.find(note => note.id === selected && note.type === 'text' && !note.text.trim());
      if (empty) work.change(work.notes.filter(note => note.id !== empty.id));
    }
    setSelected(id);
  }
  function navigate(next: number) {
    setPage(next); selectNote('');
    requestAnimationFrame(() => {
      const frame = pdfArea.current?.querySelector(`[data-page-number="${next}"]`)?.closest('.pdf-page-frame');
      if (frame) window.scrollTo({ top: window.scrollY + frame.getBoundingClientRect().top - (controls.current?.offsetHeight || 0) - 12 });
    });
  }
  function addNote(pageNumber: number, x: number, y: number) {
    x = Math.min(.9, Math.max(0, x)); y = Math.min(.94, Math.max(0, y));
    const note: Annotation = { id: crypto.randomUUID(), page: pageNumber, type: tool === 'highlight' ? 'highlight' : 'text', x, y, width: Math.min(.4, 1 - x), height: .06, text: '', fontSize, color: tool === 'highlight' ? '#f2cc4d' : color };
    work.change([...work.notes.filter(item => item.id !== selected || item.type !== 'text' || item.text.trim()), note]); setSelected(note.id); setTool('select'); setPage(pageNumber);
  }
  function changeFont(value: number) {
    if (!Number.isFinite(value)) return;
    value = Math.min(40, Math.max(8, value)); setFontSize(value);
    const note = work.notes.find(item => item.id === selected && item.type === 'text');
    if (note) {
      if (note.manualSize) { update(note.id, { fontSize: value }); return; }
      const measure = document.createElement('canvas').getContext('2d');
      if (measure) measure.font = `${value}px Arial`;
      const width = Math.max(80, ...note.text.split('\n').map(line => (measure?.measureText(line).width || 0) + 4));
      const sheet = pdfArea.current?.querySelector(`[data-page-number="${note.page}"]`);
      const pageWidth = Number(sheet?.getAttribute('data-page-width')) || 612;
      const pageHeight = Number(sheet?.getAttribute('data-page-height')) || 792;
      update(note.id, { fontSize: value, width: Math.min(1 - note.x, Math.max(.02, width / pageWidth)), height: Math.min(1 - note.y, Math.max(.01, note.text.split('\n').length * value * 1.3 / pageHeight)) });
    }
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
  return <main className="editor" onKeyDown={event => { if (event.key === 'Escape') { setTool('select'); selectNote(''); setHelpOpen(false); } }}><header className="editor-header"><Link href={manage ? '/' : '/?area=apostilas'} className="editor-back"><ArrowLeft size={19} />{manage ? 'Minhas turmas' : 'Minhas apostilas'}</Link><div className="editor-document-title"><h1>{work.data?.document.title || 'Apostila interativa'}</h1><small>{work.data?.document.lesson.title}</small></div>{work.data && (!manage || studentId) && <button className="secondary" disabled={exporting} onClick={download}><Download size={16} />{exporting ? 'Exportando…' : 'Exportar PDF'}</button>}</header>
    {manage && studentId && work.data?.work && <section className="card pdf-return-panel"><div><h2>{work.data.work.submittedAt ? 'Apostila entregue' : 'Apostila em andamento'}</h2><p>{work.data.work.submittedAt ? 'Devolva para o aluno corrigir ou completar as respostas. O conteúdo salvo será preservado.' : 'O aluno pode editar esta apostila e entregar quando concluir.'}</p></div>{work.data.work.submittedAt && <ReturnPdfWork documentId={documentId} studentId={studentId} version={work.data.work.version} />}</section>}
    <div className="editor-controls" ref={controls}>
      <div className="editor-toolbar" role="region" aria-label="Ferramentas do editor">
        <div className="editor-tool-strip" aria-label="Ferramentas; deslize para ver mais">
        {!readOnly && <div className="writing-controls">
          <div className="tool-group" aria-label="Modo de edição">{[{ id: 'select', label: 'Ler', name: 'Ler', icon: MousePointer2 }, { id: 'text', label: 'Escrever', name: 'Escrever resposta', icon: Type }, { id: 'highlight', label: 'Destacar', name: 'Destacar', icon: Highlighter }].map(item => <button aria-label={item.name} title={item.name} aria-pressed={tool === item.id} className={tool === item.id ? 'tool active' : 'tool'} key={item.id} onClick={() => { selectNote(''); setTool(item.id as typeof tool); }}><item.icon size={17} /><span className="editor-tool-label">{item.label}</span></button>)}</div>
          <div className="editor-format-controls">
            <label>Fonte<input type="number" min={8} max={40} aria-label="Tamanho da fonte" value={selectedNote?.type === 'text' ? selectedNote.fontSize : fontSize} onChange={e => changeFont(e.target.valueAsNumber)} /></label>
            <label className="editor-color"><span className="editor-visually-hidden">Cor</span><input aria-label="Cor da anotação" title="Cor da anotação" type="color" value={selectedNote?.color ?? color} onChange={e => { setColor(e.target.value); if (selectedNote) update(selected, { color: e.target.value }); }} /></label>
          </div>
          {selectedNote && <button className="secondary delete-note" aria-label="Apagar resposta" title="Apagar resposta" onClick={() => { work.change(work.notes.filter(n => n.id !== selected)); setSelected(''); }}><Trash2 size={17} /></button>}
        </div>}
        <div className="reader-controls">
          <div className="tool-group page-controls">
            <button className="secondary" disabled={page <= 1} onClick={() => navigate(page - 1)} aria-label="Página anterior" title="Página anterior"><ChevronLeft size={19} /></button>
            <label><span className="editor-visually-hidden">Página</span><select aria-label="Selecionar página" title="Ir para página" value={page} onChange={e => navigate(Number(e.target.value))}>{Array.from({ length: pdf?.numPages ?? 1 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
            <span>/{pdf?.numPages ?? '…'}</span>
            <button className="secondary" disabled={!pdf || page >= pdf.numPages} onClick={() => navigate(page + 1)} aria-label="Próxima página" title="Próxima página"><ChevronRight size={19} /></button>
          </div>
          <label><span className="editor-visually-hidden">Zoom</span><select aria-label="Zoom" title="Zoom da apostila" value={zoom} onChange={e => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}><option value="fit">Ajustar</option>{[.5, .75, 1, 1.25, 1.5, 2].map(v => <option value={v} key={v}>{Math.round(v * 100)}%</option>)}</select></label>
        </div>
        </div>
        <div className="editor-bar-actions"><span className="editor-save-indicator" role="status" aria-live="polite" title={work.status}>{work.status.includes('salvas') || work.status === 'Apostila entregue' ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}<span className="editor-visually-hidden">{work.status}</span></span><button className="secondary editor-help-button" aria-label="Como usar o editor" title="Como usar o editor" aria-expanded={helpOpen} aria-controls="editor-help" onClick={() => setHelpOpen(!helpOpen)}><HelpCircle size={18} /></button>{!readOnly && <button className="editor-submit" aria-label="Entregar apostila" title="Entregar apostila" disabled={work.pending()} onClick={work.submit}>Entregar</button>}</div>
      </div>
      {helpOpen && <div className="editor-help-panel" id="editor-help"><strong>Como usar</strong><p>{readOnly ? manage ? studentId ? 'Você está visualizando o trabalho do aluno.' : 'Prévia da apostila original.' : 'Apostila entregue. Seu professor poderá reabrir a edição.' : tool === 'text' ? 'Clique uma vez no local da resposta e digite. Depois, o modo Ler volta automaticamente.' : tool === 'highlight' ? 'Clique uma vez no trecho para inserir um destaque.' : selectedNote ? 'Use a alça de cima para mover. Arraste o canto inferior direito ou as alças laterais para ajustar o tamanho da caixa.' : 'Role para ler todas as páginas. Para responder, escolha Escrever resposta.'}</p><p>Fonte e cor alteram a resposta selecionada ou as próximas respostas. Em telas menores, deslize as ferramentas para os lados.</p><button className="text-button" onClick={() => setHelpOpen(false)}>Fechar ajuda</button></div>}
    </div>
    {(work.error || pdfError) && <p className="error" role="alert">{work.error || pdfError}</p>}
    {work.conflict && <section className="conflict-box"><strong>Há outra versão salva no servidor.</strong><p>Seu rascunho foi preservado. Escolha qual versão deseja continuar usando. Manter o rascunho substituirá a versão atual após sua escolha.</p><button onClick={() => { if (confirm('Substituir as respostas do servidor pelo rascunho desta página?')) void work.resolve(true); }}>Manter meu rascunho</button><button className="secondary" onClick={() => { if (confirm('Descartar este rascunho local e carregar as respostas do servidor?')) void work.resolve(false); }}>Usar versão do servidor</button></section>}
    {work.data?.work?.feedback.length ? <details className="feedback card" id="correcao" open><summary>Correções e feedback</summary>{work.data.work.feedback.map(f => <article key={f.id}><strong>{f.grade !== null ? `Nota: ${f.grade.toLocaleString('pt-BR')} / 10` : 'Comentário do professor'}</strong><p>{f.comment}</p><small>{new Date(f.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })}</small></article>)}</details> : null}
    <div className="pdf-scroll" ref={pdfArea}>{pdf ? <div className="pdf-pages">{Array.from({ length: pdf.numPages }, (_, i) => <PdfPage key={i + 1} pdf={pdf} pageNumber={i + 1} zoom={zoom} availableWidth={availableWidth} controlsHeight={controlsHeight} notes={work.notes.filter(n => n.page === i + 1)} readOnly={readOnly || work.conflict} tool={tool} selected={selected} onSelect={selectNote} update={update} add={addNote} onNavigate={navigate} />)}</div> : <div className="empty"><p>{pdfError || 'Abrindo páginas da apostila…'}</p></div>}</div>
    {manage && studentId && work.data?.work && <section className="feedback card"><h2>Corrigir trabalho</h2><Form endpoint={`learning/documents/${documentId}/feedback${work.query}`} label="Registrar correção" onSuccess={() => window.location.reload()} transform={d => ({ comment: d.comment, grade: d.grade === '' ? undefined : Number(d.grade), reopen: d.reopen === 'on' })}><label>Feedback para o aluno<textarea name="comment" required maxLength={5000} rows={3} /></label><label>Nota (0 a 10, opcional)<input name="grade" type="number" min="0" max="10" step="0.1" /></label><label className="checkbox-label"><input name="reopen" type="checkbox" />Reabrir a apostila para o aluno continuar</label></Form></section>}
  </main>;
}
