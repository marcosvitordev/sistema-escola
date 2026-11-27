'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Award, RefreshCw, X } from 'lucide-react';
import { gradeKindLabels, gradeKinds, gradeNumber } from '@/lib/gradebook';
import { studentGradeStatus, type StudentClassGrades, type StudentGradesResponse } from '@/lib/student-grades-types';

export function StudentGrades({ classId, refreshKey }: { classId: string; refreshKey: number }) {
  const [data, setData] = useState<StudentGradesResponse | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [reload, setReload] = useState(0), [selected, setSelected] = useState('');
  useEffect(() => {
    let active = true, pending = false; const controller = new AbortController();
    async function load() {
      if (pending) return; pending = true;
      try { const response = await fetch('/api/student/grades', { cache: 'no-store', signal: controller.signal }), result = await response.json(); if (!response.ok) throw new Error(result.error); if (active) { setData(result); setError(''); } }
      catch (cause) { if (active && !(cause instanceof Error && cause.name === 'AbortError')) { setData(null); setError(cause instanceof Error ? cause.message : 'Não foi possível carregar suas notas.'); } }
      finally { pending = false; if (active) setLoading(false); }
    }
    setLoading(true); void load(); const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const interval = setInterval(refresh, 30_000); window.addEventListener('focus', refresh);
    return () => { active = false; controller.abort(); clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [refreshKey, reload]);
  const classes = data?.classes.filter(item => classId === 'all' || item.classId === classId) || [];
  const current = classes.find(item => item.classId === selected);
  return <section className="student-grades" aria-label="Minhas médias e notas"><div className="student-section-heading"><div><h2>Minhas médias e notas</h2><p>Acompanhe como você está em cada turma.</p></div><Award size={26} /></div>
    {loading && !data && <p role="status">Carregando suas notas…</p>}{error && <div className="error" role="alert">{error}<button className="student-outline" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} />Tentar novamente</button></div>}
    {classes.map(item => <article className="student-grade-card" key={item.classId}><div className="student-grade-heading"><div><span className="student-kicker">{item.course}</span><h3>{item.name}</h3></div><span className="student-icon green"><Award size={25} /></span></div><div className="student-grade-overall"><div><span>Média geral</span><strong>{gradeNumber(item.average)}<small> / 10</small></strong></div><span className={`student-status ${item.average === null ? 'pending' : item.provisional ? 'started' : 'done'}`}>{item.average === null ? 'Aguardando notas' : item.provisional ? 'Média parcial' : 'Notas disponíveis'}</span></div>
      <div className="student-grade-categories">{gradeKinds.map(kind => <div key={kind}><span>{gradeKindLabels[kind] === 'Apostila' ? 'Apostilas' : kind === 'ACTIVITY' ? 'Atividades' : 'Provas'}</span><strong>{gradeNumber(item.categories[kind].average)}</strong><small>Peso {item.weights[kind]} · {item.categories[kind].graded}/{item.categories[kind].total} com nota</small></div>)}</div>
      <p className="student-grade-explanation">Média ponderada com os pesos da turma, considerando apenas notas liberadas de materiais publicados. Entregas e correções pendentes deixam a média parcial.</p><div className="student-grade-bottom"><span>{item.graded} de {item.total} itens com nota{item.awaitingRelease ? ` · ${item.awaitingRelease} aguardam liberação` : ''}{item.awaitingCorrection ? ` · ${item.awaitingCorrection} aguardam correção` : ''}</span><button className="student-outline" onClick={() => setSelected(item.classId)}>Ver minhas notas<ArrowRight size={17} /></button></div>
    </article>)}
    {data && !classes.length && !error && <p className="help">Suas médias aparecerão quando houver uma turma disponível.</p>}{current && <StudentGradesDialog grades={current} onClose={() => setSelected('')} />}
  </section>;
}
function StudentGradesDialog({ grades, onClose }: { grades: StudentClassGrades; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { element?.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog ref={dialog} className="pdf-monitor-dialog student-grades-dialog" aria-label={`Minhas notas de ${grades.name}`} onCancel={event => { event.preventDefault(); onClose(); }}><header className="pdf-monitor-header"><div><span className="eyebrow">MINHAS NOTAS</span><h2>{grades.name}</h2><p>{grades.course} · Média geral {gradeNumber(grades.average)} / 10{grades.provisional ? ' · Parcial' : ''}</p></div><button className="icon-button" aria-label="Fechar minhas notas" onClick={onClose}><X size={22} /></button></header><div className="pdf-monitor-body"><p className="help">Confira as notas já liberadas pelo professor. Itens aguardando correção ou liberação não entram na média ainda.</p>{!grades.items.length ? <p>Suas notas aparecerão assim que os materiais forem publicados e corrigidos.</p> : <div className="student-grade-items">{grades.items.map(item => <article key={`${item.kind}:${item.id}`}><div><span className="student-resource-kind">{gradeKindLabels[item.kind]}</span><h3>{item.title}</h3><p>{item.lesson} · {item.date.split('-').reverse().join('/')}</p><span className={`student-status ${item.status === 'graded' ? 'done' : 'pending'}`}>{studentGradeStatus[item.status]}</span></div><div><strong>{gradeNumber(item.grade)}<small> / 10</small></strong><Link className="student-outline" href={item.href}>{item.status === 'graded' ? 'Ver correção' : item.kind === 'PDF' ? 'Abrir apostila' : 'Abrir avaliação'}<ArrowRight size={16} /></Link></div></article>)}</div>}</div><footer className="pdf-monitor-footer"><span>{grades.graded} de {grades.total} itens com nota</span><button className="secondary" onClick={onClose}>Fechar</button></footer></dialog>;
}
