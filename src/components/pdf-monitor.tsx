'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3, FileText, RefreshCw, Search, X } from 'lucide-react';
import { request } from './form';
import { ReturnPdfWork } from './return-pdf-work';
type Row = { student: { id: string; name: string; works: { version: number; updatedAt: string; submittedAt: string | null; feedback: { grade: number | null }[] }[] } };
export function PdfMonitor({ documentId, title, onClose }: { documentId: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => { const element = dialog.current; element?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { element?.close(); document.body.style.overflow = previous; }; }, []);
  useEffect(() => {
    let active = true; setLoading(true);
    request(`learning/documents/${documentId}/monitor`).then(data => { if (active) { setRows(data.students); setError(''); } }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [documentId, reload]);
  const state = (row: Row) => row.student.works[0]?.submittedAt ? 'done' : row.student.works[0]?.version ? 'started' : 'pending';
  const counts = { all: rows.length, done: rows.filter(row => state(row) === 'done').length, started: rows.filter(row => state(row) === 'started').length, pending: rows.filter(row => state(row) === 'pending').length };
  const filtered = rows.filter(row => row.student.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')) && (filter === 'all' || state(row) === filter));
  return <dialog ref={dialog} className="pdf-monitor-dialog" aria-labelledby="pdf-monitor-title" aria-describedby="pdf-monitor-description" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose(); }}>
    <header className="pdf-monitor-header"><div><span className="eyebrow">ACOMPANHAMENTO DA APOSTILA</span><h2 id="pdf-monitor-title">{title}</h2><p id="pdf-monitor-description">Confira as entregas e abra o documento de cada aluno para editar ou corrigir.</p></div><button className="icon-button" aria-label="Fechar acompanhamento" onClick={onClose}><X size={22} /></button></header>
    <div className="pdf-monitor-body"><div className="pdf-monitor-summary"><article><FileText size={21} /><strong>{counts.all}</strong><span>Alunos</span></article><article><CheckCircle2 size={21} /><strong>{counts.done}</strong><span>Entregues</span></article><article><Clock3 size={21} /><strong>{counts.started + counts.pending}</strong><span>Aguardando entrega</span></article></div>
      <div className="pdf-monitor-tools"><label><Search size={18} /><input type="search" placeholder="Buscar aluno pelo nome" aria-label="Buscar aluno no acompanhamento" value={query} onChange={event => setQuery(event.target.value)} /></label><button className="secondary" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} />Atualizar</button></div>
      <div className="resource-filters" role="group" aria-label="Filtrar acompanhamento">{([{ id: 'all', label: 'Todos' }, { id: 'done', label: 'Entregues' }, { id: 'started', label: 'Em andamento' }, { id: 'pending', label: 'Não iniciadas' }] as const).map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{counts[item.id]}</span></button>)}</div>
      {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}{loading && <p role="status">Carregando acompanhamento…</p>}
      {!loading && !filtered.length && <div className="class-empty-state"><h3>{rows.length ? 'Nenhum aluno encontrado' : 'Esta turma ainda não tem alunos'}</h3><p>{rows.length ? 'Tente outro nome ou selecione Todos.' : 'Cadastre os alunos na turma para acompanhar as entregas.'}</p></div>}
      {!loading && filtered.length > 0 && <div className="table-scroll"><table className="pdf-monitor-table"><thead><tr><th>Aluno</th><th>Situação</th><th>Última edição</th><th>Trabalho</th></tr></thead><tbody>{filtered.map(row => { const { student } = row; const work = student.works[0]; return <tr key={student.id}><td data-label="Aluno"><strong>{student.name}</strong></td><td data-label="Situação"><span className={`student-status ${state(row) === 'done' ? 'done' : state(row) === 'started' ? 'started' : 'pending'}`}>{state(row) === 'done' ? 'Entregue' : state(row) === 'started' ? 'Em andamento' : 'Não iniciada'}</span></td><td data-label="Última edição">{work ? new Date(work.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Ainda não iniciou'}</td><td data-label="Trabalho"><div className="pdf-work-actions"><Link className="button-link" href={`/apostilas/${documentId}?aluno=${student.id}`}>Abrir trabalho</Link>{work?.submittedAt && <ReturnPdfWork documentId={documentId} studentId={student.id} studentName={student.name} version={work.version} onReturned={result => { setRows(items => items.map(item => item.student.id === student.id ? { student: { ...item.student, works: [{ ...work, ...result, submittedAt: null }] } } : item)); setNotice(`Apostila devolvida para ${student.name}. O aluno pode editar novamente.`); }} />}</div></td></tr>; })}</tbody></table></div>}
    </div><footer className="pdf-monitor-footer"><span>{filtered.length} de {rows.length} alunos</span><button className="secondary" onClick={onClose}>Fechar acompanhamento</button></footer>
  </dialog>;
}
