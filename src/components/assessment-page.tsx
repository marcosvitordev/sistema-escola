'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Copy, Pencil, Play, Upload } from 'lucide-react';
import type { AssessmentResponse } from '@/lib/assessment-types';
import { questionTypes } from '@/lib/assessments';
import { assessmentRequest } from './assessment-api';
import { AssessmentBuilder } from './assessment-builder';
import { AssessmentAttempt } from './assessment-attempt';
import { QuestionImages } from './question-images';

export function AssessmentPage({ id, initialAttemptId }: { id: string; initialAttemptId?: string }) {
  const [data, setData] = useState<AssessmentResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [attemptId, setAttemptId] = useState('');
  const [refresh, setRefresh] = useState(0);
  async function load() { try { setData(await assessmentRequest<AssessmentResponse>(`items/${id}`)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão.'); } }
  useEffect(() => { let active = true; assessmentRequest<AssessmentResponse>(`items/${id}`).then(response => { if (active) { setData(response); if (initialAttemptId && response.attempts.some(attempt => attempt.id === initialAttemptId)) setAttemptId(initialAttemptId); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [id, initialAttemptId]);
  async function settings(change: Record<string, unknown>) {
    if (!data) return; setBusy(true); setError('');
    try { await assessmentRequest(`items/${id}/settings`, { revision: data.assessment.revision, ...change }); await load(); setNotice('Configuração salva.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar.'); } finally { setBusy(false); }
  }
  async function start() { setBusy(true); setError(''); try { const result = await assessmentRequest<{ id: string }>(`items/${id}/start`, {}); setAttemptId(result.id); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível iniciar.'); } finally { setBusy(false); } }
  async function duplicate() {
    if (!data) return; setBusy(true); setError('');
    try { const result = await assessmentRequest<{ id: string }>(`items/${id}/duplicate`, { lessonId: data.assessment.lessonId }); window.location.assign(`/atividades/${result.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível duplicar.'); setBusy(false); }
  }
  async function image(questionId: string, file: File) {
    setBusy(true); setError('');
    try { const form = new FormData(); form.set('questionId', questionId); form.set('file', file); await assessmentRequest(`items/${id}/image`, form); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar a imagem.'); } finally { setBusy(false); }
  }
  if (!data) return <main className="assessment-page"><Link href="/">← Voltar às turmas</Link><p role="status">Carregando avaliação…</p>{error && <p role="alert" className="error">{error}</p>}</main>;
  const item = data.assessment;
  const totalPoints = item.questions.reduce((sum, q) => sum + q.points, 0);
  const overdue = item.dueAt !== null && new Date(item.dueAt).getTime() < Date.now();
  const draft = data.attempts.find(t => !t.submittedAt);
  const canStart = !overdue && (draft || data.attempts.length < item.maxAttempts);
  return <main className={`assessment-page forms-page ${data.manage ? 'forms-manage' : 'forms-student'}`}><Link className="editor-back" href={`/turmas/${item.lesson.classId}/atividades`}>← Provas e atividades da turma</Link><div className="page-heading forms-heading"><div><span className="eyebrow">{item.kind === 'TEST' ? 'PROVA' : 'ATIVIDADE'} · {item.lesson.title}</span><h1>{item.title}</h1><p>{item.questions.length} questões · {totalPoints.toLocaleString('pt-BR')} pontos · {item.maxAttempts} tentativa(s)</p></div>{data.manage && <span className="pill">{item.published ? 'Publicada' : 'Rascunho'}</span>}</div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {editing && data.manage ? <section className="card"><AssessmentBuilder initial={item} lessons={[{ id: item.lessonId, title: item.lesson.title, published: item.lesson.published }]} onSaved={() => { setEditing(false); void load(); }} onCancel={() => setEditing(false)} /></section> : <>
      <section className="card assessment-instructions"><h2>Instruções</h2><p className="question-prompt">{item.instructions || 'Leia cada questão com atenção e revise suas respostas antes de entregar.'}</p><p>{item.dueAt ? `Prazo: ${new Date(item.dueAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })} (horário do Acre)` : 'Sem prazo de entrega definido.'}</p>
        {data.manage && <><div className="assessment-actions"><button disabled={busy} onClick={() => { if (!item.published || confirm('Retirar esta avaliação da área dos alunos? As respostas serão preservadas.')) void settings({ published: !item.published }); }}>{item.published ? 'Voltar para rascunho' : 'Publicar avaliação'}</button><button className="secondary" disabled={busy} onClick={() => { if (confirm(item.gradesReleased ? 'Ocultar as notas dos alunos?' : 'Liberar as notas já corrigidas para os alunos?')) void settings({ gradesReleased: !item.gradesReleased }); }}>{item.gradesReleased ? 'Ocultar notas' : 'Liberar notas'}</button><button className="secondary" disabled={busy || data.attempts.length > 0} onClick={() => setEditing(true)}><Pencil size={16} />Editar questões</button><button className="secondary" disabled={busy} onClick={duplicate}><Copy size={16} />Duplicar avaliação</button></div>{!item.lesson.published && <p className="error">A aula também precisa estar publicada para os alunos acessarem esta avaliação.</p>}{data.attempts.length > 0 && <p className="help">As questões estão protegidas porque já existem tentativas. Duplique esta avaliação para reutilizar ou alterar as perguntas.</p>}<Schedule key={item.revision} dueAt={item.dueAt} maxAttempts={item.maxAttempts} busy={busy} onSave={settings} /></>}
        {!data.manage && !attemptId && <div className="assessment-actions"><button disabled={busy || !canStart} onClick={start}><Play size={17} />{busy ? 'Abrindo…' : draft ? 'Continuar resposta' : overdue ? 'Prazo encerrado' : data.attempts.length >= item.maxAttempts ? 'Tentativas utilizadas' : data.attempts.length ? 'Iniciar nova tentativa' : item.kind === 'TEST' ? 'Começar prova' : 'Começar atividade'}</button><small>As respostas são salvas durante o preenchimento.</small></div>}
      </section>
      {attemptId ? <AssessmentAttempt key={`${attemptId}:${refresh}`} id={attemptId} onClose={() => { setAttemptId(''); setNotice(''); void load(); }} onReviewed={() => { setRefresh(n => n + 1); setNotice('Correção salva. Libere as notas quando estiverem prontas.'); void load(); }} /> : data.manage ? <>
        <section className="card assessment-deliveries"><h2>Entregas e correções</h2><p>{data.attempts.filter(t => t.submittedAt).length} entregas · {data.attempts.filter(t => t.submittedAt && !t.gradedAt).length} aguardando correção · {item.gradesReleased ? 'Notas liberadas' : 'Notas ainda ocultas'}</p><div className="table-scroll"><table><thead><tr><th>Aluno</th><th>Tentativa</th><th>Situação</th><th>Entrega</th><th>Trabalho</th></tr></thead><tbody>{data.students.flatMap(({ student }) => { const attempts = data.attempts.filter(t => t.studentId === student.id); return attempts.length ? attempts.map(t => <tr key={t.id}><td>{student.name}</td><td>{t.number}</td><td>{!t.submittedAt ? 'Em andamento' : t.gradedAt ? 'Corrigida' : 'Aguardando correção'}</td><td>{t.submittedAt ? new Date(t.submittedAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' }) : '—'}</td><td><button className="text-button" onClick={() => { setAttemptId(t.id); setNotice(''); }}>{t.submittedAt ? 'Abrir e corrigir' : 'Acompanhar respostas'}</button></td></tr>) : [<tr key={student.id}><td>{student.name}</td><td>—</td><td>Não iniciada</td><td>—</td><td>—</td></tr>]; })}</tbody></table></div></section>
        <section className="card assessment-preview"><h2>Questões e gabarito</h2>{item.questions.map((q, i) => <article key={q.id}><span className="pill">{questionTypes[q.type]}</span><h3>Questão {i + 1} · {q.points} pontos</h3><p className="question-prompt">{q.prompt}</p>{q.options.length > 0 && <ol type="A">{q.options.map((option, j) => <li key={j}>{option}{q.type === 'MATCHING' && ` → ${q.matches[Number((q.answerKey as string[])[j])]}`}</li>)}</ol>}{q.type !== 'MATCHING' && q.answerKey !== null && <p className="help"><strong>Gabarito: </strong>{q.type === 'MULTIPLE_CHOICE' ? q.options[Number(q.answerKey)] : q.type === 'TRUE_FALSE' ? q.answerKey === 'true' ? 'Verdadeiro' : 'Falso' : Array.isArray(q.answerKey) ? q.answerKey.join(' · ') : 'Correção manual'}</p>}<QuestionImages question={q} index={i} />{!data.attempts.length && <label className="upload-label"><Upload size={16} />{q.images && q.images.length > 1 ? 'Substituir todas as imagens' : q.imageId ? 'Substituir imagem' : 'Adicionar imagem'}<input disabled={busy} type="file" accept="image/png,image/jpeg" onChange={e => { const file = e.target.files?.[0]; if (file) void image(q.id, file); e.target.value = ''; }} /></label>}</article>)}</section>
      </> : <section className="card"><h2>Minhas tentativas</h2>{!data.attempts.length ? <p>Você ainda não começou esta avaliação.</p> : data.attempts.map(t => <div className="assessment-history" key={t.id}><div><strong>Tentativa {t.number}</strong><p>{!t.submittedAt ? 'Em andamento' : !t.gradedAt ? 'Entregue · aguardando correção' : item.gradesReleased ? 'Correção disponível' : 'Corrigida · aguardando liberação da nota'}</p></div><button className="secondary" onClick={() => setAttemptId(t.id)}>{t.submittedAt ? 'Ver minhas respostas' : 'Continuar'}</button></div>)}</section>}
    </>}
  </main>;
}
function Schedule({ dueAt, maxAttempts, busy, onSave }: { dueAt: string | null; maxAttempts: number; busy: boolean; onSave: (data: Record<string, unknown>) => Promise<void> }) {
  function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const due = String(form.get('due') || ''); void onSave({ dueAt: due ? new Date(`${due}:00-05:00`).toISOString() : null, maxAttempts: Number(form.get('attempts')) }); }
  return <details className="assessment-schedule"><summary>Alterar prazo ou número de tentativas</summary><form onSubmit={save}><div className="assessment-form-grid"><label>Prazo de entrega (horário do Acre)<input type="datetime-local" name="due" defaultValue={dueAt ? new Date(dueAt).toLocaleString('sv-SE', { timeZone: 'America/Rio_Branco' }).slice(0, 16).replace(' ', 'T') : ''} /></label><label>Tentativas permitidas<input type="number" name="attempts" min="1" max="10" required defaultValue={maxAttempts} /></label></div><button className="secondary" disabled={busy}>Salvar prazo e tentativas</button></form></details>;
}
