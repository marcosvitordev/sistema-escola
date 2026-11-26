import { manualQuestion } from './assessments';

export type GradeKind = 'PDF' | 'ACTIVITY' | 'TEST';
export type GradeWeights = Record<GradeKind, number>;
export type GradeItem = { id: string; kind: GradeKind; title: string; lesson: string; date: string; published: boolean; state: 'graded' | 'manual' | 'not-submitted' | 'in-progress'; grade: number | null; submittedAt: string | null; correctedAt: string | null; href: string; note: string; released: boolean };
export type GradeStudent = { id: string; name: string; username: string; items: GradeItem[]; categories: Record<GradeKind, { average: number | null; graded: number; total: number }>; average: number | null; provisional: boolean; pendingManual: number; notSubmitted: number; graded: number };
export type GradebookReport = { classroom: { id: string; name: string; course: string; teacher: string }; weights: GradeWeights; weightsVersion: number; generatedAt: string; from: string; to: string; students: GradeStudent[] };
export const gradeKindLabels: Record<GradeKind, string> = { PDF: 'Apostila', ACTIVITY: 'Atividade', TEST: 'Prova' };
export const gradeStateLabels = { graded: 'Corrigido', manual: 'Aguarda correção', 'not-submitted': 'Não entregue', 'in-progress': 'Em andamento' };
export const gradeKinds: GradeKind[] = ['PDF', 'ACTIVITY', 'TEST'];
export const gradeNumber = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
type ScoringQuestion = { id: string; type: string; points: number };
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function manualComplete(questions: ScoringQuestion[], review: unknown) {
  const entries = record(review);
  return questions.length > 0 && questions.filter(question => manualQuestion(question.type)).every(question => {
    const points = record(entries[question.id]).points;
    return typeof points === 'number' && Number.isFinite(points) && points >= 0 && points <= question.points;
  });
}
export function assessmentGrade(questions: ScoringQuestion[], autoScores: unknown, review: unknown): number | null {
  if (!manualComplete(questions, review)) return null;
  const automatic = record(autoScores), manual = record(review);
  let sum = 0, maximum = 0;
  for (const question of questions) {
    const value = manualQuestion(question.type) ? record(manual[question.id]).points : automatic[question.id];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > question.points) return null;
    sum += value; maximum += question.points;
  }
  return maximum > 0 ? sum / maximum * 10 : null;
}
export function summarizeStudent(identity: { id: string; name: string; username: string }, items: GradeItem[], weights: GradeWeights): GradeStudent {
  const categories = Object.fromEntries(gradeKinds.map(kind => {
    const all = items.filter(item => item.kind === kind), graded = all.filter(item => item.grade !== null);
    return [kind, { average: graded.length ? graded.reduce((sum, item) => sum + item.grade!, 0) / graded.length : null, graded: graded.length, total: all.length }];
  })) as GradeStudent['categories'];
  const active = gradeKinds.filter(kind => weights[kind] > 0 && categories[kind].average !== null);
  const average = active.length ? round(active.reduce((sum, kind) => sum + categories[kind].average! * weights[kind], 0) / active.reduce((sum, kind) => sum + weights[kind], 0)) : null;
  return { ...identity, items, categories, average, provisional: items.some(item => item.grade === null && weights[item.kind] > 0), pendingManual: items.filter(item => item.state === 'manual').length, notSubmitted: items.filter(item => ['not-submitted', 'in-progress'].includes(item.state)).length, graded: items.filter(item => item.grade !== null).length };
}
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function gradebookCsv(report: GradebookReport, detailed = false) {
  const metadata = (student: GradeStudent) => [report.classroom.name, report.classroom.course, student.name, student.username];
  const header = ['Turma', 'Curso', 'Aluno', 'Matrícula', ...(detailed ? ['Categoria', 'Aula', 'Item', 'Data', 'Situação', 'Nota (0 a 10)', 'Entrega', 'Correção', 'Notas liberadas', 'Observações'] : ['Nota geral (0 a 10)', 'Situação da média', 'Média apostilas', 'Média atividades', 'Média provas', 'Itens corrigidos', 'Aguardam correção', 'Não entregues / em andamento']), 'Peso apostilas', 'Peso atividades', 'Peso provas', 'Período inicial', 'Período final', 'Gerado em'];
  const tail = [report.weights.PDF, report.weights.ACTIVITY, report.weights.TEST, report.from, report.to, new Date(report.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' })];
  const numeric = (value: number | null) => value === null ? '' : gradeNumber(value);
  const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Rio_Branco' }) : '';
  const rows = report.students.flatMap(student => {
    if (!detailed) return [[...metadata(student), numeric(student.average), student.average === null ? 'Sem nota' : student.provisional ? 'Parcial: há pendências' : 'Concluída', ...gradeKinds.map(kind => numeric(student.categories[kind].average)), student.graded, student.pendingManual, student.notSubmitted, ...tail]];
    if (!student.items.length) return [[...metadata(student), '', '', '', '', 'Sem materiais no período', '', '', '', '', '', ...tail]];
    return student.items.map(item => [...metadata(student), gradeKindLabels[item.kind], item.lesson, item.title, item.date, gradeStateLabels[item.state], numeric(item.grade), date(item.submittedAt), date(item.correctedAt), item.released ? 'Sim' : 'Não', item.note, ...tail]);
  });
  return '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
}
