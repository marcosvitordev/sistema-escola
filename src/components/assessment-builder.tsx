'use client';
import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { assessmentSchema, questionTypes, type QuestionType } from '@/lib/assessments';
import type { AssessmentView, LessonChoice, QuestionView } from '@/lib/assessment-types';
import { assessmentRequest } from './assessment-api';

type Draft = { id: string; type: QuestionType; prompt: string; points: string; optionsText: string; matchesText: string; keyText: string; correct: string; pairs: Record<string, string> };
const lines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);
function fromQuestion(q: QuestionView): Draft {
  return { id: q.id, type: q.type, prompt: q.prompt, points: String(q.points), optionsText: q.options.join('\n'), matchesText: q.matches.join('\n'), keyText: Array.isArray(q.answerKey) ? q.answerKey.join('\n') : '', correct: typeof q.answerKey === 'string' ? q.answerKey : '', pairs: q.type === 'MATCHING' && Array.isArray(q.answerKey) ? Object.fromEntries(q.answerKey.map((key, i) => [String(i), key])) : {} };
}
const localDate = (value: string | null) => value ? new Date(value).toLocaleString('sv-SE', { timeZone: 'America/Rio_Branco' }).slice(0, 16).replace(' ', 'T') : '';
export function AssessmentBuilder({ lessons, initial, seed, preferredLesson, onSaved, onCancel }: { lessons: LessonChoice[]; initial?: AssessmentView; seed?: Pick<AssessmentView, 'title' | 'instructions' | 'questions'>; preferredLesson?: string; onSaved: (id: string) => void; onCancel: () => void }) {
  const [lessonId, setLessonId] = useState(initial?.lessonId || preferredLesson || lessons[0]?.id || '');
  const [kind, setKind] = useState(initial?.kind || 'TEST');
  const [title, setTitle] = useState(initial?.title || seed?.title || '');
  const [instructions, setInstructions] = useState(initial?.instructions || seed?.instructions || '');
  const [due, setDue] = useState(localDate(initial?.dueAt ?? null));
  const [attempts, setAttempts] = useState(String(initial?.maxAttempts ?? 1));
  const [questions, setQuestions] = useState<Draft[]>((initial?.questions || seed?.questions || []).map(fromQuestion));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
  function edit(id: string, change: Partial<Draft>) { setQuestions(items => items.map(q => q.id === id ? { ...q, ...change } : q)); }
  function move(index: number, delta: number) { setQuestions(items => { const next = [...items]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); }
  function add() { setQuestions(items => [...items, { id: crypto.randomUUID(), type: 'MULTIPLE_CHOICE', prompt: '', points: '1', optionsText: '\n', matchesText: '', keyText: '', correct: '0', pairs: {} }]); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = assessmentSchema.parse({ lessonId, kind, title, instructions, maxAttempts: Number(attempts), dueAt: due ? new Date(`${due}:00-05:00`).toISOString() : null, questions: questions.map(q => ({ id: q.id, type: q.type, prompt: q.prompt, points: Number(q.points), options: q.type === 'MULTIPLE_CHOICE' ? q.optionsText.split('\n').map(option => option.trim()) : q.type === 'MATCHING' ? lines(q.optionsText) : [], matches: q.type === 'MATCHING' ? lines(q.matchesText) : [], answerKey: ['MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(q.type) ? q.correct : q.type === 'MATCHING' ? lines(q.optionsText).map((_, i) => q.pairs[String(i)] ?? '') : ['SHORT', 'FILL_BLANK'].includes(q.type) ? lines(q.keyText) : null })) });
      const result = await assessmentRequest<{ id?: string }>(initial ? `items/${initial.id}` : 'items', initial ? { ...data, revision: initial.revision } : data, initial ? 'PUT' : 'POST');
      onSaved(initial?.id || result.id!);
    } catch (e) {
      const issue = e && typeof e === 'object' && 'issues' in e ? (e.issues as { message: string }[])[0]?.message : null;
      setError(issue || (e instanceof Error ? e.message : 'Confira os dados da avaliação.'));
    } finally { setBusy(false); }
  }
  return <form className="assessment-builder" onSubmit={save}>
    <div className="builder-intro"><strong>Monte seu formulário</strong><p>Defina o título, adicione as perguntas e marque o gabarito. Salve o rascunho para revisar antes de publicar.</p></div>
    <div className="assessment-form-grid"><label>Formato<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="TEST">Prova</option><option value="ACTIVITY">Atividade</option></select></label><label>Aula<select value={lessonId} disabled={!!initial} onChange={e => setLessonId(e.target.value)} required><option value="">Selecione a aula</option>{lessons.map(l => <option key={l.id} value={l.id}>{l.title}{l.published ? '' : ' (rascunho)'}</option>)}</select></label></div>
    <label>Título<input value={title} onChange={e => setTitle(e.target.value)} minLength={3} maxLength={150} required placeholder="Ex.: Prova de Informática Básica" /></label>
    <label>Instruções<textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} maxLength={5000} placeholder="Explique o que o aluno deve fazer." /></label>
    <div className="assessment-form-grid"><label>Prazo de entrega (horário do Acre)<input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label><label>Tentativas permitidas<input type="number" min={1} max={10} required value={attempts} onChange={e => setAttempts(e.target.value)} /></label></div>
    <div className="section-heading"><h2>Questões</h2><span className="pill">{questions.length} questões · {total.toLocaleString('pt-BR')} pontos</span></div>
    {!questions.length && <div className="empty"><p>Adicione a primeira questão para começar.</p><button type="button" className="secondary" onClick={add}><Plus size={17} />Adicionar questão</button></div>}
    {questions.map((q, index) => <fieldset className="question-editor" key={q.id}><legend>Questão {index + 1}</legend><div className="question-controls"><button type="button" className="icon-button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover questão ${index + 1} para cima`}><ArrowUp size={17} /></button><button type="button" className="icon-button" disabled={index === questions.length - 1} onClick={() => move(index, 1)} aria-label={`Mover questão ${index + 1} para baixo`}><ArrowDown size={17} /></button><button type="button" className="text-button danger" onClick={() => { if (!q.prompt || confirm('Remover esta questão do rascunho?')) setQuestions(items => items.filter(item => item.id !== q.id)); }}><Trash2 size={15} />Remover questão</button></div>
      <div className="assessment-form-grid"><label>Tipo da questão {index + 1}<select value={q.type} onChange={e => edit(q.id, { type: e.target.value as QuestionType, correct: e.target.value === 'TRUE_FALSE' ? 'true' : '0', pairs: {}, keyText: '' })}>{Object.entries(questionTypes).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>Pontos da questão {index + 1}<input type="number" min="0.01" max="100" step="0.01" required value={q.points} onChange={e => edit(q.id, { points: e.target.value })} /></label></div>
      <label>Enunciado da questão {index + 1}<textarea required minLength={3} maxLength={5000} rows={3} value={q.prompt} onChange={e => edit(q.id, { prompt: e.target.value })} placeholder={q.type === 'FILL_BLANK' ? 'O [___] é usado para digitar textos.' : 'Escreva a pergunta ou as instruções da atividade.'} /></label>
      {q.type === 'MULTIPLE_CHOICE' && <div className="builder-options"><p className="help">Escreva as alternativas e marque o círculo da resposta correta.</p>{q.optionsText.split('\n').map((option, optionIndex, options) => <div className={`builder-option ${q.correct === String(optionIndex) ? 'is-correct' : ''}`} key={optionIndex}><input type="radio" required name={`correct-${q.id}`} aria-label={`Marcar alternativa ${optionIndex + 1} como correta da questão ${index + 1}`} checked={q.correct === String(optionIndex)} onChange={() => edit(q.id, { correct: String(optionIndex) })} /><input aria-label={`Alternativa ${optionIndex + 1} da questão ${index + 1}`} value={option} required maxLength={500} placeholder={`Alternativa ${optionIndex + 1}`} onChange={e => edit(q.id, { optionsText: options.map((value, i) => i === optionIndex ? e.target.value.replace(/[\r\n]/g, ' ') : value).join('\n') })} /><button type="button" className="icon-button" disabled={options.length <= 2} aria-label={`Remover alternativa ${optionIndex + 1} da questão ${index + 1}`} onClick={() => edit(q.id, { optionsText: options.filter((_, i) => i !== optionIndex).join('\n'), correct: q.correct === '' ? '' : Number(q.correct) === optionIndex ? '0' : String(Number(q.correct) > optionIndex ? Number(q.correct) - 1 : Number(q.correct)) })}><Trash2 size={16} /></button></div>)}{q.optionsText.split('\n').length < 20 && <button type="button" className="text-button" onClick={() => edit(q.id, { optionsText: `${q.optionsText}\n` })}><Plus size={16} />Adicionar alternativa à questão {index + 1}</button>}</div>}
      {q.type === 'TRUE_FALSE' && <label>Gabarito da questão {index + 1}<select required value={q.correct} onChange={e => edit(q.id, { correct: e.target.value })}><option value="">Selecione a resposta correta</option><option value="true">Verdadeiro</option><option value="false">Falso</option></select></label>}
      {['SHORT', 'FILL_BLANK'].includes(q.type) && <label>{q.type === 'SHORT' ? 'Respostas aceitas' : 'Respostas das lacunas, na ordem'} da questão {index + 1} (uma por linha)<textarea required value={q.keyText} onChange={e => edit(q.id, { keyText: e.target.value })} rows={3} /><small>{q.type === 'SHORT' ? 'A correção ignora maiúsculas e espaços extras, mas considera a acentuação.' : 'Use [___] no enunciado para marcar cada lacuna.'}</small></label>}
      {q.type === 'MATCHING' && <><div className="assessment-form-grid"><label>Coluna A da questão {index + 1} (um item por linha)<textarea required rows={4} value={q.optionsText} onChange={e => edit(q.id, { optionsText: e.target.value })} /></label><label>Coluna B da questão {index + 1} (um item por linha)<textarea required rows={4} value={q.matchesText} onChange={e => edit(q.id, { matchesText: e.target.value })} /></label></div>{lines(q.optionsText).map((left, i) => <label key={i}>Associar: {left}<select value={q.pairs[String(i)] ?? ''} onChange={e => edit(q.id, { pairs: { ...q.pairs, [String(i)]: e.target.value } })} required><option value="">Selecione o item da coluna B</option>{lines(q.matchesText).map((right, j) => <option key={j} value={String(j)}>{right}</option>)}</select></label>)}</>}
      {['ESSAY', 'FILE', 'PRACTICAL'].includes(q.type) && <p className="help">Esta questão será corrigida pelo professor. {q.type === 'FILE' ? 'O aluno poderá anexar PDF, PNG, JPEG ou TXT de até 5 MB.' : 'O aluno escreverá sua resposta ou relato de execução.'}</p>}
      <p className="help">Você poderá adicionar uma imagem à questão depois de salvar o rascunho.</p>
    </fieldset>)}
    {questions.length > 0 && questions.length < 100 && <button type="button" className="secondary" onClick={add}><Plus size={17} />Adicionar questão</button>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="assessment-actions"><button type="submit" disabled={busy}>{busy ? 'Salvando…' : initial ? 'Salvar alterações' : 'Salvar rascunho'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { if (confirm('Sair sem salvar as alterações deste formulário?')) onCancel(); }}>Cancelar</button></div>
  </form>;
}
