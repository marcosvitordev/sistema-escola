'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, Upload } from 'lucide-react';
import { Field, Form, request } from './form';
type Lesson = { id: string; title: string; module: string; description: string; published: boolean; scheduledAt: string | null; documents: { id: string; title: string; pageCount: number }[] };
type StudentWork = { student: { id: string; name: string; works: { version: number; updatedAt: string; submittedAt: string | null; feedback: { grade: number | null }[] }[] } };
export function ClassLearning({ classId, manage, showAssessmentsLink = true }: { classId: string; manage: boolean; showAssessmentsLink?: boolean }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [monitor, setMonitor] = useState<{ documentId: string; students: StudentWork[] } | null>(null);
  async function load() { try { const data = await request(`learning/classes/${classId}`); setLessons(data.lessons); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão.'); } }
  useEffect(() => { let active = true; request(`learning/classes/${classId}`).then(d => { if (active) setLessons(d.lessons); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [classId]);
  const filteredLessons = lessons.filter(lesson => `${lesson.title} ${lesson.module}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  async function publish(lesson: Lesson) { setBusy(true); try { await request(`learning/lessons/${lesson.id}/publish`, { published: !lesson.published }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao publicar.'); } finally { setBusy(false); } }
  async function upload(lessonId: string, file?: File) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.set('file', file);
      const response = await fetch(`/api/learning/lessons/${lessonId}/documents`, { method: 'POST', body });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha no upload.'); } finally { setBusy(false); }
  }
  async function showMonitor(documentId: string) { try { const data = await request(`learning/documents/${documentId}/monitor`); setMonitor({ documentId, students: data.students }); } catch { setError('Não foi possível carregar o acompanhamento.'); } }
  return <section className="learning"><div className="section-heading"><h3>Aulas e apostilas</h3>{manage && <button className="secondary" onClick={() => setCreating(!creating)}><Plus size={15} />{creating ? 'Fechar cadastro' : 'Nova aula'}</button>}</div>{showAssessmentsLink && <div className="assessment-class-entry"><div><strong>Provas e atividades</strong><p>{manage ? 'Crie questões e acompanhe as respostas dos alunos.' : 'Responda às avaliações publicadas para sua turma.'}</p></div><Link className="button-link" href={`/turmas/${classId}/atividades`}>Abrir provas e atividades</Link></div>}{error && <p className="error" role="alert">{error}</p>}{creating && <div className="card"><Form endpoint="learning/lessons" onSuccess={() => { setCreating(false); void load(); }} label="Criar aula em rascunho"><input type="hidden" name="classId" value={classId} /><Field name="title" label="Título da aula" placeholder="Aula 03 — Sistemas Operacionais" /><Field name="module" label="Módulo" placeholder="Sistemas Operacionais" /><label>Descrição<textarea name="description" rows={2} maxLength={3000} /></label><Field name="scheduledAt" label="Data prevista" type="date" required={false} /></Form></div>}
    {loading && <p role="status">Carregando aulas…</p>}
    {!loading && !error && !lessons.length && <div className="class-empty-state"><FileText size={32} /><h4>{manage ? 'Prepare a primeira aula' : 'Nenhuma aula publicada'}</h4><p>{manage ? 'Clique em Nova aula. Depois, envie a apostila PDF e publique para os alunos.' : 'Seu professor ainda não publicou aulas nesta turma.'}</p></div>}
    {lessons.length > 0 && <label className="class-lesson-search">Buscar aula ou módulo<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Digite o título da aula ou o módulo" /></label>}
    {lessons.length > 0 && !filteredLessons.length && <p>Nenhuma aula encontrada para esta busca.</p>}
    {filteredLessons.map(lesson => <article className="lesson-card" key={lesson.id}><div className="section-heading"><span className="pill">{lesson.module}</span><small>{lesson.published ? 'Publicada para os alunos' : 'Rascunho · somente professores'}</small></div><h3>{lesson.title}</h3>{lesson.scheduledAt && <small>{new Date(lesson.scheduledAt).toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco' })}</small>}{lesson.description && <p>{lesson.description}</p>}<h4 className="lesson-documents-label">Apostilas desta aula</h4>{!lesson.documents.length && <p className="help">{manage ? 'Nenhuma apostila enviada. Use o botão Enviar PDF abaixo.' : 'Nenhuma apostila anexada.'}</p>}{lesson.documents.map(doc => <div className="document-row" key={doc.id}><FileText size={21} /><div><strong>{doc.title}</strong><small>{doc.pageCount} páginas</small></div><Link className="button-link" href={`/apostilas/${doc.id}`}>Abrir apostila</Link>{manage && <button className="text-button" onClick={() => showMonitor(doc.id)}>Acompanhar</button>}</div>)}{manage && <div className="lesson-actions"><label className="upload-label"><Upload size={15} />Enviar PDF (até 5 MB)<input disabled={busy} type="file" accept="application/pdf" onChange={e => { void upload(lesson.id, e.target.files?.[0]); e.target.value = ''; }} /></label><button className="secondary" disabled={busy} onClick={() => publish(lesson)}>{busy ? 'Aguarde…' : lesson.published ? 'Voltar para rascunho' : 'Publicar aula'}</button></div>}</article>)}
    {monitor && <section className="card"><div className="section-heading"><h3>Acompanhamento da apostila</h3><button className="text-button" onClick={() => showMonitor(monitor.documentId)}>Atualizar</button></div><div className="table-scroll"><table><thead><tr><th>Aluno</th><th>Situação</th><th>Última edição</th><th>Trabalho</th></tr></thead><tbody>{monitor.students.map(({ student }) => { const work = student.works[0]; return <tr key={student.id}><td>{student.name}</td><td>{work?.submittedAt ? 'Entregue' : work?.version ? 'Em andamento' : 'Não iniciada'}</td><td>{work ? new Date(work.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' }) : '—'}</td><td><Link href={`/apostilas/${monitor.documentId}?aluno=${student.id}`}>Abrir trabalho</Link></td></tr>; })}</tbody></table></div></section>}
  </section>;
}
