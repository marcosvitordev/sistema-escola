'use client';
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Save, Send } from 'lucide-react';
import { manualQuestion } from '@/lib/assessments';
import type { AttemptFile, AttemptResponse } from '@/lib/assessment-types';
import { AssessmentResponses } from './assessment-responses';
import { assessmentRequest } from './assessment-api';
import { useAssessmentAttempt } from './use-assessment-attempt';

export function AssessmentAttempt({ id, onClose, onReviewed }: { id: string; onClose: () => void; onReviewed: () => void }) {
  const work = useAssessmentAttempt(id);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  if (!work.data) return <section className="card"><p role="status">Carregando tentativa…</p>{work.error && <p className="error" role="alert">{work.error}</p>}<button className="secondary" onClick={onClose}>Voltar</button></section>;
  const { assessment, attempt, manage } = work.data;
  const overdue = assessment.dueAt !== null && new Date(assessment.dueAt).getTime() < Date.now();
  const readOnly = manage || !!attempt.submittedAt || overdue || work.conflict || work.submitting || uploading;
  const answered = assessment.questions.filter(q => { const value = work.answers[q.id]; if (q.type === 'MATCHING' || q.type === 'FILL_BLANK') { const count = q.type === 'MATCHING' ? q.options.length : q.prompt.match(/\[___\]/g)?.length || 0; return Array.isArray(value) && count > 0 && Array.from({ length: count }, (_, i) => value[i]?.trim()).every(Boolean); } return typeof value === 'string' && value.trim(); }).length;
  async function upload(questionId: string, file: File) {
    setUploading(true); setError('');
    try {
      if (!await work.flush() || work.pending()) throw new Error('Aguarde o salvamento das respostas antes de enviar o arquivo.');
      const form = new FormData(); form.set('questionId', questionId); form.set('file', file);
      const result = await assessmentRequest<AttemptFile>(`attempts/${id}/file`, form);
      work.addFile(result); work.change(questionId, result.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar o arquivo.'); }
    finally { setUploading(false); }
  }
  return <section className="attempt-session"><div className="attempt-toolbar"><div><strong>{manage ? attempt.student.name : `Tentativa ${attempt.number}`}</strong><small>{answered} de {assessment.questions.length} questões preenchidas</small><progress aria-label="Progresso de preenchimento" value={answered} max={assessment.questions.length || 1} /></div><span role="status" aria-live="polite">{uploading ? 'Enviando arquivo…' : work.status}</span><button className="secondary" onClick={onClose}>Voltar às tentativas</button></div>
    {(work.error || error) && <p className="error" role="alert">{work.error || error}</p>}
    {work.conflict && <div className="conflict-box"><strong>Seu rascunho foi preservado.</strong><p>Existe outra versão desta tentativa. Confira qual deseja manter antes de continuar.</p><button onClick={() => work.resolve(true)}>Manter meu rascunho</button><button className="secondary" onClick={() => work.resolve(false)}>Usar versão do servidor</button></div>}
    {attempt.submittedAt && <div className="submission-note"><CheckCircle2 size={20} /><div><strong>Tentativa entregue</strong><p>{new Date(attempt.submittedAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })}</p></div></div>}
    {overdue && !attempt.submittedAt && <p className="error">O prazo terminou. Consulte o professor para saber como continuar.</p>}
    {attempt.submittedAt && <section className="grade-card"><h2>{attempt.grade !== null ? `Pontuação: ${attempt.grade.toLocaleString('pt-BR')} / ${attempt.maxPoints.toLocaleString('pt-BR')}` : attempt.gradedAt ? 'Correção concluída · aguardando liberação da nota' : 'Aguardando correção do professor'}</h2>{attempt.grade !== null && <p>Nota equivalente: {(attempt.maxPoints ? attempt.grade / attempt.maxPoints * 10 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / 10</p>}{attempt.feedback && <p className="question-prompt">{attempt.feedback}</p>}{attempt.review && Object.entries(attempt.review).map(([questionId, review]) => <p key={questionId}><strong>Questão {assessment.questions.findIndex(q => q.id === questionId) + 1}: {review.points.toLocaleString('pt-BR')} pontos.</strong> {review.feedback}</p>)}</section>}
    <AssessmentResponses questions={assessment.questions} answers={work.answers} files={attempt.files} readOnly={readOnly} correction={attempt.submittedAt && attempt.grade !== null ? attempt : undefined} onChange={work.change} onUpload={(questionId, file) => { void upload(questionId, file); }} />
    {!manage && !attempt.submittedAt && !overdue && <div className="attempt-submit"><div className="form-submit-copy"><h2>Pronto para enviar?</h2><p>{answered < assessment.questions.length ? `Você preencheu ${answered} de ${assessment.questions.length} questões. Confira as respostas antes de entregar.` : 'Você preencheu todas as questões. Revise suas respostas antes de entregar.'}</p><p>Você pode salvar e continuar depois. Ao entregar, esta tentativa ficará bloqueada para edição.</p></div><button className="secondary" disabled={uploading || work.submitting || work.conflict} onClick={() => void work.flush()}><Save size={17} />Salvar rascunho</button><button disabled={uploading || work.submitting || work.conflict} onClick={() => void work.submit()}><Send size={17} />{work.submitting ? 'Entregando…' : `Entregar ${assessment.kind === 'TEST' ? 'prova' : 'atividade'}`}</button></div>}
    {manage && attempt.submittedAt && <Review data={work.data} onSaved={onReviewed} />}
  </section>;
}
function Review({ data, onSaved }: { data: AttemptResponse; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const manual = data.assessment.questions.filter(q => manualQuestion(q.type));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const review: Record<string, { points: number; feedback: string }> = {};
    for (const q of manual) { const value = String(form.get(`points_${q.id}`) ?? ''); if (value !== '') review[q.id] = { points: Number(value), feedback: String(form.get(`feedback_${q.id}`) ?? '') }; }
    try { await assessmentRequest(`attempts/${data.attempt.id}/review`, { version: data.attempt.version, review, feedback: String(form.get('feedback') ?? '') }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a correção.'); }
    finally { setBusy(false); }
  }
  return <section className="card assessment-review"><h2>Correção do professor</h2><p>As questões objetivas já foram corrigidas automaticamente. Deixe a pontuação em branco se ainda não terminou de corrigir uma questão manual.</p><form onSubmit={save}>{manual.map(q => <div className="review-question" key={q.id}><h3>Questão {data.assessment.questions.findIndex(item => item.id === q.id) + 1}</h3><p className="question-prompt">{q.prompt}</p><label>Pontuação da questão {data.assessment.questions.findIndex(item => item.id === q.id) + 1} (máximo {q.points})<input type="number" step="0.01" min="0" max={q.points} name={`points_${q.id}`} defaultValue={data.attempt.review?.[q.id]?.points ?? ''} /></label><label>Feedback desta questão<textarea name={`feedback_${q.id}`} defaultValue={data.attempt.review?.[q.id]?.feedback || ''} maxLength={2000} rows={2} /></label></div>)}<label>Feedback geral<textarea name="feedback" maxLength={5000} defaultValue={data.attempt.feedback || ''} rows={3} /></label>{error && <p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Salvando…' : 'Salvar correção'}</button><p className="help">As notas só aparecem para os alunos quando forem liberadas na avaliação.</p></form></section>;
}
