import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { QuestionView } from './assessment-types';

const text = z.string().max(20_000);
const choice = z.object({ type: z.string().max(100), shuffle: z.boolean().optional(), options: z.array(z.object({ value: text.optional(), isOther: z.boolean().optional(), image: z.unknown().optional(), goToAction: z.string().optional(), goToSectionId: z.string().optional() })).max(1000) });
const question = z.object({
  required: z.boolean().optional(),
  grading: z.object({ pointValue: z.number().finite().optional(), correctAnswers: z.object({ answers: z.array(z.object({ value: text })).max(1000) }).optional(), whenRight: z.unknown().optional(), whenWrong: z.unknown().optional(), generalFeedback: z.unknown().optional() }).optional(),
  choiceQuestion: choice.optional(), textQuestion: z.object({ paragraph: z.boolean().optional() }).optional(),
  rowQuestion: z.object({ title: text }).optional(), fileUploadQuestion: z.unknown().optional(),
  scaleQuestion: z.unknown().optional(), dateQuestion: z.unknown().optional(), timeQuestion: z.unknown().optional(), ratingQuestion: z.unknown().optional(),
  _aprenderType: z.string().max(100).optional(),
});
const sourceSchema = z.object({
  info: z.object({ title: text, description: text.optional() }),
  items: z.array(z.object({
    title: text.optional(), description: text.optional(),
    questionItem: z.object({ question, image: z.unknown().optional() }).optional(),
    questionGroupItem: z.object({ questions: z.array(question).max(500), grid: z.object({ columns: choice }).optional(), image: z.unknown().optional() }).optional(),
    pageBreakItem: z.unknown().optional(), textItem: z.unknown().optional(), imageItem: z.unknown().optional(), videoItem: z.unknown().optional(),
  })).max(500),
});

export class GoogleFormsImportError extends Error {}
export type GoogleFormsPreview = { title: string; instructions: string; questions: QuestionView[]; warnings: string[]; needsAnswerKey: number };

export function importGoogleForm(source: unknown): GoogleFormsPreview {
  const parsed = sourceSchema.safeParse(source);
  if (!parsed.success) throw new GoogleFormsImportError('Selecione o JSON do formulário, gerado pelo exportador ou pela API do Google Forms. Arquivos de respostas e links não são aceitos.');
  const form = parsed.data;
  const title = form.info.title.trim();
  const instructions = form.info.description?.trim() || '';
  if (title.length < 3 || title.length > 150) throw new GoogleFormsImportError('O título do formulário deve ter entre 3 e 150 caracteres. Ajuste o título e exporte novamente.');
  if (instructions.length > 5000) throw new GoogleFormsImportError('A descrição do formulário excede 5.000 caracteres. Reduza a descrição antes de importar.');
  const questions: QuestionView[] = [];
  const warnings = new Set<string>();
  let section = '';
  let needsAnswerKey = 0;
  function add(raw: z.infer<typeof question>, prompt: string, groupChoice?: z.infer<typeof choice>) {
    const number = questions.length + 1;
    if (number > 100) throw new GoogleFormsImportError('O formulário ultrapassa 100 questões após a conversão das grades. Divida-o em avaliações menores.');
    const warn = (message: string) => warnings.add(`Questão ${number}: ${message}`);
    const points = raw.grading?.pointValue;
    const q: QuestionView = { id: randomUUID(), position: questions.length, type: 'ESSAY', prompt, points: points !== undefined && points > 0 && points <= 100 ? points : 1, options: [], matches: [], imageId: null, answerKey: null };
    if (points === undefined || points <= 0 || points > 100) warn('pontuação definida como 1 ponto para revisão; o sistema aceita de 0,01 a 100 pontos por questão.');
    if (raw.required) warnings.add('A obrigatoriedade por pergunta do Google não é aplicada nesta versão. O aluno pode entregar respostas em branco.');
    if (raw.grading?.whenRight || raw.grading?.whenWrong || raw.grading?.generalFeedback) warn('os comentários automáticos do Google não são importados.');
    const options = raw.choiceQuestion || groupChoice;
    const keys = raw.grading?.correctAnswers?.answers.map(answer => answer.value.trim()) || [];
    if (options) {
      if (options.shuffle) warn('a ordem aleatória das alternativas não é importada.');
      const values = options.options.map(option => option.isOther ? 'Outro (especifique na resposta)' : (option.value?.trim() || '').replace(/\s*[\r\n]+\s*/g, ' '));
      if (options.options.some(option => /[\r\n]/.test(option.value || ''))) warn('quebras de linha nas alternativas foram convertidas em espaços.');
      if (options.options.some(option => option.image)) warn('reenvie as imagens das alternativas após salvar o rascunho.');
      if (options.options.some(option => option.goToAction || option.goToSectionId)) warnings.add('Os desvios entre seções não são importados. As perguntas ficam em uma única sequência.');
      const single = ['RADIO', 'DROP_DOWN'].includes(options.type) && !options.options.some(option => option.isOther) && values.length >= 2 && values.length <= 20 && values.every(value => value && value.length <= 500);
      if (single) {
        q.type = 'MULTIPLE_CHOICE'; q.options = values;
        const indexes = keys.length === 1 ? values.flatMap((value, i) => value === keys[0].replace(/\s*[\r\n]+\s*/g, ' ') ? [i] : []) : [];
        if (indexes.length === 1) q.answerKey = String(indexes[0]);
        else { needsAnswerKey++; warn('selecione a alternativa correta na revisão; o arquivo não fornece um gabarito único.'); }
      } else {
        q.prompt += `\n\nAlternativas do formulário:\n${values.map((value, i) => `${i + 1}. ${value || '(sem texto)'}`).join('\n')}`;
        warn('convertida em discursiva com correção manual, preservando as alternativas no enunciado. Marcação múltipla, opção Outro e listas fora dos limites precisam de adaptação.');
      }
    } else if (raw.textQuestion && !raw.textQuestion.paragraph && keys.length && keys.length <= 20 && keys.every(key => key && key.length <= 500)) {
      q.type = 'SHORT'; q.answerKey = keys;
      warn('confira as respostas aceitas: a correção ignora maiúsculas e espaços extras, mas considera a acentuação.');
    } else if (raw.fileUploadQuestion !== undefined || raw._aprenderType === 'FILE_UPLOAD') {
      q.type = 'FILE'; warn('anexos seguem o limite local de 5 MB e os formatos PDF, PNG, JPEG ou TXT. Arquivos enviados ao Google não são importados.');
    } else if (raw.textQuestion) {
      warn('resposta textual configurada para correção manual. Confira o gabarito original se houver.');
    } else {
      const kind = raw._aprenderType || (raw.scaleQuestion ? 'escala' : raw.dateQuestion ? 'data' : raw.timeQuestion ? 'horário' : raw.ratingQuestion ? 'avaliação por ícones' : 'tipo não reconhecido');
      warn(`${kind} convertido em resposta discursiva com correção manual. Confira as instruções da pergunta.`);
    }
    if (q.prompt.trim().length < 3) { q.prompt = `Questão ${number}${q.prompt.trim() ? ` — ${q.prompt.trim()}` : ''}`; warn('confira o enunciado, que estava vazio ou muito curto.'); }
    if (q.prompt.length > 5000) throw new GoogleFormsImportError(`A questão ${number}, incluindo alternativas e seção, excede 5.000 caracteres. Reduza seu conteúdo antes de importar.`);
    questions.push(q);
  }
  for (const item of form.items) {
    if (item.pageBreakItem !== undefined || item.textItem !== undefined) { section = [item.title, item.description].filter(Boolean).join('\n'); continue; }
    const prompt = [section, item.title, item.description].filter(Boolean).join('\n\n');
    if (item.questionItem) {
      if (item.questionItem.image !== undefined) warnings.add(`Imagem de "${item.title || 'pergunta'}" não importada. Reenvie-a após salvar o rascunho.`);
      add(item.questionItem.question, prompt);
    } else if (item.questionGroupItem) {
      warnings.add('Grades são separadas em uma pergunta por linha. Confira alternativas, gabaritos e pontuação de cada linha.');
      if (item.questionGroupItem.image !== undefined) warnings.add('A imagem de uma grade não foi importada. Reenvie-a após salvar o rascunho.');
      item.questionGroupItem.questions.forEach((row, i) => add(row, `${prompt}\n\n${row.rowQuestion?.title || `Linha ${i + 1}`}`, item.questionGroupItem?.grid?.columns));
    } else if (item.imageItem !== undefined || item.videoItem !== undefined) warnings.add(`Mídia "${item.title || 'sem título'}" não importada. Revise o contexto das perguntas e envie as imagens necessárias.`);
    else throw new GoogleFormsImportError(`O item "${item.title || 'sem título'}" não tem uma estrutura reconhecida. Exporte novamente com o exportador fornecido.`);
  }
  if (!questions.length) throw new GoogleFormsImportError('O arquivo não contém perguntas importáveis.');
  const result = { title, instructions, questions, warnings: [...warnings], needsAnswerKey };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 300_000) throw new GoogleFormsImportError('O conteúdo convertido é muito grande para uma avaliação. Divida o formulário em partes menores.');
  return result;
}
