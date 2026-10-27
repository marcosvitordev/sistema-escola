import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { manualQuestion, normalizeAnswer } from '@/lib/assessments';
import type { Answer, QuestionView } from '@/lib/assessment-types';

export function QuestionCorrection({ question: q, index, answer, points, feedback }: { question: QuestionView; index: number; answer?: Answer; points: number; feedback?: string }) {
  const full = Math.abs(points - q.points) < .00005;
  const partial = !full && points > 0;
  const manual = manualQuestion(q.type);
  const Icon = full ? CheckCircle2 : partial ? MinusCircle : XCircle;
  const status = manual ? 'Corrigida pelo professor' : full ? 'Você acertou' : partial ? 'Você acertou parcialmente' : 'Você errou';
  const key = q.answerKey;
  const correct = q.type === 'MULTIPLE_CHOICE' && typeof key === 'string' ? `${String.fromCharCode(65 + Number(key))}. ${q.options[Number(key)]}` : q.type === 'TRUE_FALSE' ? key === 'true' ? 'Verdadeiro' : 'Falso' : null;
  return <section className={`question-correction ${full ? 'correct' : partial ? 'partial' : 'incorrect'}`} aria-label={`Correção da questão ${index + 1}`}>
    <div className="correction-heading"><strong><Icon size={18} aria-hidden="true" />{status}</strong><span>{points.toLocaleString('pt-BR')} / {q.points.toLocaleString('pt-BR')} pontos</span></div>
    {!(Array.isArray(answer) ? answer.some(value => value.trim()) : answer?.trim()) && <p>Você deixou esta questão sem resposta.</p>}
    {correct !== null && <p><strong>Resposta correta:</strong> {correct}</p>}
    {q.type === 'SHORT' && Array.isArray(key) && <p><strong>Respostas aceitas:</strong> {key.join(' · ')}</p>}
    {(q.type === 'MATCHING' || q.type === 'FILL_BLANK') && Array.isArray(key) && <ul className="correction-items">{key.map((value, i) => {
      const submitted = Array.isArray(answer) ? answer[i] || '' : '';
      const matched = q.type === 'MATCHING' ? submitted === value : normalizeAnswer(submitted) === normalizeAnswer(value);
      const expected = q.type === 'MATCHING' ? q.matches[Number(value)] : value;
      const actual = q.type === 'MATCHING' ? submitted !== '' ? q.matches[Number(submitted)] : '' : submitted;
      return <li key={i}><strong>{q.type === 'MATCHING' ? q.options[i] : `Lacuna ${i + 1}`} — {matched ? 'Correto' : 'Incorreto'}</strong><span>Sua resposta: {actual || 'Sem resposta'}</span>{!matched && <span>Resposta correta: {expected}</span>}</li>;
    })}</ul>}
    {feedback && <p className="correction-feedback"><strong>Comentário do professor:</strong> {feedback}</p>}
  </section>;
}
