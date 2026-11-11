import { z } from 'zod';
import { assessmentSchema, type QuestionDefinition } from './assessments';

export const questionsJsonExample = {
  titulo: 'Questões da apostila', tipo: 'atividade', instrucoes: 'Leia a apostila e responda.', tentativas: 1,
  questoes: [
    { tipo: 'multipla_escolha', enunciado: 'Qual dispositivo usamos para digitar?', pontos: 1, alternativas: ['Monitor', 'Teclado', 'Mouse'], resposta_correta: 2 },
    { tipo: 'verdadeiro_falso', enunciado: 'O mouse é um dispositivo de entrada.', pontos: 1, resposta_correta: true },
    { tipo: 'resposta_curta', enunciado: 'Qual dispositivo mostra as imagens?', pontos: 1, respostas_aceitas: ['monitor', 'tela'] },
    { tipo: 'discursiva', enunciado: 'Explique como criar uma pasta.', pontos: 2 },
  ],
};
const common = { enunciado: z.string().trim().min(3).max(5000), pontos: z.number().positive().max(100).default(1) };
const strings = z.array(z.string().trim().min(1).max(500)).min(1).max(20);
const manual = (tipo: 'discursiva' | 'arquivo' | 'pratica') => z.strictObject({ ...common, tipo: z.literal(tipo) });
const question = z.discriminatedUnion('tipo', [
  z.strictObject({ ...common, tipo: z.literal('multipla_escolha'), alternativas: strings.min(2), resposta_correta: z.number().int().min(1).max(20) }),
  z.strictObject({ ...common, tipo: z.literal('verdadeiro_falso'), resposta_correta: z.boolean() }),
  z.strictObject({ ...common, tipo: z.literal('resposta_curta'), respostas_aceitas: strings }),
  z.strictObject({ ...common, tipo: z.literal('lacunas'), respostas_aceitas: strings }),
  z.strictObject({ ...common, tipo: z.literal('associacao'), alternativas: strings.min(2), correspondencias: strings.min(2), resposta_correta: z.array(z.number().int().min(1).max(20)).min(2).max(20) }),
  manual('discursiva'), manual('arquivo'), manual('pratica'),
]);
const sourceSchema = z.strictObject({
  titulo: z.string().trim().min(3).max(150), tipo: z.enum(['atividade', 'prova']).default('atividade'),
  instrucoes: z.string().max(5000).default(''), tentativas: z.number().int().min(1).max(10).default(1),
  prazo: z.string().datetime({ offset: true }).nullable().default(null), questoes: z.array(question).min(1).max(100),
});
export class QuestionsJsonError extends Error {}
export function importQuestionsJson(source: unknown) {
  const parsed = sourceSchema.safeParse(source);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = issue.path[0] === 'questoes' && typeof issue.path[1] === 'number' ? `Questão ${issue.path[1] + 1}: ` : '';
    const field = issue.path.filter(part => typeof part === 'string').join('.');
    throw new QuestionsJsonError(`${index}Confira ${field || 'o formato do JSON'}. Use os campos e tipos do modelo; números e verdadeiro/falso não devem estar entre aspas.`);
  }
  const data = parsed.data;
  const questions: QuestionDefinition[] = data.questoes.map(q => ({
    id: crypto.randomUUID(), prompt: q.enunciado, points: q.pontos,
    type: ({ multipla_escolha: 'MULTIPLE_CHOICE', verdadeiro_falso: 'TRUE_FALSE', resposta_curta: 'SHORT', discursiva: 'ESSAY', lacunas: 'FILL_BLANK', associacao: 'MATCHING', arquivo: 'FILE', pratica: 'PRACTICAL' } as const)[q.tipo],
    options: 'alternativas' in q ? q.alternativas : [], matches: 'correspondencias' in q ? q.correspondencias : [],
    answerKey: 'respostas_aceitas' in q ? q.respostas_aceitas : q.tipo === 'multipla_escolha' ? String(q.resposta_correta - 1) : q.tipo === 'verdadeiro_falso' ? String(q.resposta_correta) : q.tipo === 'associacao' ? q.resposta_correta.map(value => String(value - 1)) : null,
  }));
  const result = assessmentSchema.safeParse({ lessonId: 'import', kind: data.tipo === 'prova' ? 'TEST' : 'ACTIVITY', title: data.titulo, instructions: data.instrucoes, maxAttempts: data.tentativas, dueAt: data.prazo, questions });
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new QuestionsJsonError(`${typeof issue.path[1] === 'number' ? `Questão ${issue.path[1] + 1}: ` : ''}${issue.message}`);
  }
  return result.data;
}
