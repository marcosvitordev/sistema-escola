import { z } from 'zod';

export const questionTypes = {
  MULTIPLE_CHOICE: 'Múltipla escolha', TRUE_FALSE: 'Verdadeiro ou falso', SHORT: 'Resposta curta',
  ESSAY: 'Discursiva', MATCHING: 'Associação de colunas', FILL_BLANK: 'Preenchimento de lacunas',
  FILE: 'Envio de arquivo', PRACTICAL: 'Atividade prática',
} as const;
export type QuestionType = keyof typeof questionTypes;
const keySchema = z.union([z.string().max(3000), z.array(z.string().max(500)).max(20), z.null()]);
export const questionSchema = z.object({
  id: z.string().uuid(), type: z.enum(Object.keys(questionTypes) as [QuestionType, ...QuestionType[]]),
  prompt: z.string().trim().min(3, 'Escreva o enunciado de cada questão.').max(5000),
  points: z.number().positive().max(100),
  options: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  matches: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  answerKey: keySchema,
}).superRefine((q, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (q.type === 'MULTIPLE_CHOICE' && (q.options.length < 2 || typeof q.answerKey !== 'string' || !/^\d+$/.test(q.answerKey) || Number(q.answerKey) >= q.options.length)) issue('Informe as alternativas e selecione o gabarito.');
  if (q.type === 'TRUE_FALSE' && !['true', 'false'].includes(String(q.answerKey))) issue('Escolha verdadeiro ou falso no gabarito.');
  if (q.type === 'SHORT' && (!Array.isArray(q.answerKey) || !q.answerKey.length || q.answerKey.some(key => !key.trim()))) issue('Informe ao menos uma resposta aceita para a questão curta.');
  if (q.type === 'MATCHING' && (q.options.length < 2 || q.options.length !== q.matches.length || !Array.isArray(q.answerKey) || q.answerKey.length !== q.options.length || q.answerKey.some(key => !/^\d+$/.test(key) || Number(key) >= q.matches.length) || new Set(q.answerKey).size !== q.matches.length)) issue('Complete as duas colunas e associe cada item a uma opção diferente.');
  if (q.type === 'FILL_BLANK' && (!Array.isArray(q.answerKey) || !q.answerKey.length || q.answerKey.some(key => !key.trim()) || (q.prompt.match(/\[___\]/g)?.length ?? 0) !== q.answerKey.length)) issue('Use [___] para cada lacuna e informe um gabarito por lacuna.');
  if (['ESSAY', 'FILE', 'PRACTICAL'].includes(q.type) && q.answerKey !== null) issue('Esta questão terá correção manual.');
});
export const assessmentSchema = z.object({
  lessonId: z.string().min(1), kind: z.enum(['TEST', 'ACTIVITY']),
  title: z.string().trim().min(3).max(150), instructions: z.string().max(5000).default(''),
  dueAt: z.string().datetime({ offset: true }).nullable().default(null),
  maxAttempts: z.number().int().min(1).max(10),
  questions: z.array(questionSchema).min(1, 'Adicione pelo menos uma questão.').max(100),
}).refine(data => new Set(data.questions.map(q => q.id)).size === data.questions.length, 'Há questões duplicadas.');
export type QuestionDefinition = z.infer<typeof questionSchema>;
export type AssessmentDefinition = z.infer<typeof assessmentSchema>;
export type Answer = string | string[];
export type Answers = Record<string, Answer>;
export const answersSchema = z.record(z.string().max(100), z.union([z.string().max(10_000), z.array(z.string().max(3000)).max(20)])).refine(data => JSON.stringify(data).length <= 250_000, 'O limite de respostas foi atingido.');
export const manualQuestion = (type: string) => ['ESSAY', 'FILE', 'PRACTICAL'].includes(type);
export const normalizeAnswer = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

export function automaticScores(questions: Pick<QuestionDefinition, 'id' | 'type' | 'points' | 'answerKey'>[], answers: Answers) {
  const scores: Record<string, number> = {};
  for (const q of questions) {
    if (manualQuestion(q.type)) continue;
    const answer = answers[q.id];
    let fraction = 0;
    if (q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') fraction = typeof answer === 'string' && answer === q.answerKey ? 1 : 0;
    if (q.type === 'SHORT') fraction = typeof answer === 'string' && Array.isArray(q.answerKey) && q.answerKey.some(key => normalizeAnswer(key) === normalizeAnswer(answer)) ? 1 : 0;
    if ((q.type === 'MATCHING' || q.type === 'FILL_BLANK') && Array.isArray(q.answerKey)) {
      const values = Array.isArray(answer) ? answer : [];
      fraction = q.answerKey.reduce((total, key, i) => total + (q.type === 'MATCHING' ? values[i] === key ? 1 : 0 : normalizeAnswer(values[i] || '') === normalizeAnswer(key) ? 1 : 0), 0) / q.answerKey.length;
    }
    scores[q.id] = Math.round(q.points * fraction * 10_000) / 10_000;
  }
  return scores;
}
export function validateAnswers(questions: Pick<QuestionDefinition, 'id' | 'type' | 'options' | 'matches' | 'answerKey'>[], answers: Answers) {
  for (const [id, answer] of Object.entries(answers)) {
    const q = questions.find(question => question.id === id);
    if (!q) return 'Há uma resposta para uma questão inexistente.';
    if (q.type === 'MATCHING' || q.type === 'FILL_BLANK') {
      const count = q.type === 'MATCHING' ? q.options.length : Array.isArray(q.answerKey) ? q.answerKey.length : 0;
      if (!Array.isArray(answer) || answer.length > count) return 'Confira as respostas de associação ou lacunas.';
      if (q.type === 'MATCHING' && answer.some(value => value !== '' && (!/^\d+$/.test(value) || Number(value) >= q.matches.length))) return 'Associação inválida.';
    } else if (typeof answer !== 'string') return 'Formato de resposta inválido.';
    else if (answer && q.type === 'MULTIPLE_CHOICE' && (!/^\d+$/.test(answer) || Number(answer) >= q.options.length)) return 'Alternativa inválida.';
    else if (answer && q.type === 'TRUE_FALSE' && !['true', 'false'].includes(answer)) return 'Resposta inválida.';
  }
  return null;
}
