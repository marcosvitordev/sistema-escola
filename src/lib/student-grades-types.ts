import type { GradeKind, GradeWeights } from './gradebook';
export type StudentGradeItem = { id: string; kind: GradeKind; title: string; lesson: string; date: string; grade: number | null; status: 'graded' | 'awaiting-release' | 'awaiting-correction' | 'not-submitted' | 'in-progress'; href: string };
export type StudentClassGrades = { classId: string; name: string; course: string; weights: GradeWeights; average: number | null; provisional: boolean; categories: Record<GradeKind, { average: number | null; graded: number; total: number }>; graded: number; total: number; awaitingRelease: number; awaitingCorrection: number; items: StudentGradeItem[] };
export type StudentGradesResponse = { classes: StudentClassGrades[]; generatedAt: string };
export const studentGradeStatus = { graded: 'Nota disponível', 'awaiting-release': 'Aguardando liberação', 'awaiting-correction': 'Aguardando correção', 'not-submitted': 'Não entregue', 'in-progress': 'Em andamento' };
