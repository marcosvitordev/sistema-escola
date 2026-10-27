'use client';
import type { Answer, Answers, AttemptFile, AttemptView, QuestionView } from '@/lib/assessment-types';
import { questionTypes } from '@/lib/assessments';
import { QuestionCorrection } from './question-correction';

export function AssessmentResponses({ questions, answers, files, readOnly, correction, onChange, onUpload }: { questions: QuestionView[]; answers: Answers; files: AttemptFile[]; readOnly: boolean; correction?: Pick<AttemptView, 'autoScores' | 'review'>; onChange?: (id: string, answer: Answer) => void; onUpload?: (id: string, file: File) => void }) {
  function arrayChange(question: QuestionView, index: number, value: string, length: number) {
    const previous = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : [];
    onChange?.(question.id, Array.from({ length }, (_, i) => i === index ? value : previous[i] || ''));
  }
  return <div className="assessment-questions">{questions.map((q, index) => {
    const answer = answers[q.id]; const text = typeof answer === 'string' ? answer : ''; const values = Array.isArray(answer) ? answer : [];
    const file = files.find(f => f.id === text && f.questionId === q.id);
    const points = correction?.autoScores?.[q.id] ?? correction?.review?.[q.id]?.points;
    return <fieldset className="answer-question" key={q.id} disabled={readOnly}><legend>Questão {index + 1} <span>{q.points.toLocaleString('pt-BR')} pontos</span></legend><div className="question-kind">{questionTypes[q.type]}</div><p className="question-prompt">{q.prompt}</p>{q.imageId && <img className="question-image" src={`/api/assessments/files/${q.imageId}`} alt={`Imagem da questão ${index + 1}`} loading="lazy" />}
      {(q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') && <div className="answer-options">{(q.type === 'TRUE_FALSE' ? [{ value: 'true', text: 'Verdadeiro' }, { value: 'false', text: 'Falso' }] : q.options.map((option, i) => ({ value: String(i), text: `${String.fromCharCode(65 + i)}. ${option}` }))).map(option => <label key={option.value} className={text === option.value ? 'answer-option checked' : 'answer-option'}><input type="radio" name={q.id} value={option.value} checked={text === option.value} onChange={() => onChange?.(q.id, option.value)} />{option.text}</label>)}</div>}
      {['SHORT', 'ESSAY', 'PRACTICAL'].includes(q.type) && <label className="form-text-answer"><span className="sr-only">Sua resposta da questão {index + 1}</span>{q.type === 'SHORT' ? <input placeholder="Sua resposta" maxLength={10_000} value={text} onChange={e => onChange?.(q.id, e.target.value)} /> : <textarea rows={3} maxLength={10_000} value={text} onChange={e => onChange?.(q.id, e.target.value)} placeholder={q.type === 'PRACTICAL' ? 'Conte como você realizou a atividade prática.' : 'Sua resposta'} />}</label>}
      {q.type === 'MATCHING' && <div className="matching-answers">{q.options.map((left, i) => <label key={i}>{left}<select aria-label={`Associação ${i + 1} da questão ${index + 1}`} value={values[i] || ''} onChange={e => arrayChange(q, i, e.target.value, q.options.length)}><option value="">Selecione a associação</option>{q.matches.map((right, j) => <option key={j} value={String(j)}>{right}</option>)}</select></label>)}</div>}
      {q.type === 'FILL_BLANK' && <div className="matching-answers">{Array.from({ length: q.prompt.match(/\[___\]/g)?.length || 0 }, (_, i) => <label key={i}>Lacuna {i + 1} da questão {index + 1}<input maxLength={3000} value={values[i] || ''} onChange={e => arrayChange(q, i, e.target.value, q.prompt.match(/\[___\]/g)?.length || 0)} /></label>)}</div>}
      {q.type === 'FILE' && <div>{!readOnly && <label>Arquivo da questão {index + 1}<input type="file" accept="application/pdf,image/png,image/jpeg,text/plain" onChange={e => { const file = e.target.files?.[0]; if (file) onUpload?.(q.id, file); e.target.value = ''; }} /><small>PDF, PNG, JPEG ou TXT · até 3 MB por arquivo.</small></label>}{file ? <a className="attachment-link" href={`/api/assessments/files/${file.id}`} target="_blank" rel="noreferrer">Abrir arquivo: {file.name}</a> : <p className="help">Nenhum arquivo anexado nesta resposta.</p>}</div>}
      {!readOnly && text !== '' && ['MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(q.type) && <button type="button" className="text-button clear-answer" onClick={() => onChange?.(q.id, '')} aria-label={`Limpar seleção da questão ${index + 1}`}>Limpar seleção</button>}
      {points !== undefined && <QuestionCorrection question={q} index={index} answer={answer} points={points} feedback={correction?.review?.[q.id]?.feedback} />}
    </fieldset>;
  })}</div>;
}
