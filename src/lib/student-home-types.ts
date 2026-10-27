export type StudentArea = 'inicio' | 'apostilas' | 'atividades' | 'correcoes';
export type StudentIdentity = { id: string; name: string; institution: string; mustChangePassword: boolean };
export type StudentClass = { id: string; name: string; course: string; teacher: string };
export type StudentMaterial = {
  id: string; title: string; pageCount: number; classId: string; lessonTitle: string; module: string; createdAt: string;
  work: { version: number; updatedAt: string; submittedAt: string | null; feedback: { id: string; grade: number | null; createdAt: string } | null } | null;
};
export type StudentAssessment = {
  id: string; title: string; kind: 'TEST' | 'ACTIVITY'; classId: string; lessonTitle: string;
  dueAt: string | null; maxAttempts: number; gradesReleased: boolean; questionCount: number;
  attempts: { id: string; number: number; submittedAt: string | null; gradedAt: string | null; updatedAt: string }[];
};
export type StudentHomeData = { classes: StudentClass[]; materials: StudentMaterial[]; assessments: StudentAssessment[] };

export function materialState(material: StudentMaterial) {
  const work = material.work;
  if (work?.submittedAt) return { label: work.feedback ? 'Correção disponível' : 'Entregue', tone: work.feedback ? 'review' : 'done', action: work.feedback ? 'Ver correção' : 'Ver minha apostila', href: `/apostilas/${material.id}${work.feedback ? '#correcao' : ''}` };
  if (work && work.version > 0) return { label: work.feedback ? 'Revisar respostas' : 'Em andamento', tone: 'started', action: 'Continuar apostila', href: `/apostilas/${material.id}` };
  return { label: 'Para fazer', tone: 'pending', action: 'Abrir apostila', href: `/apostilas/${material.id}` };
}
export function assessmentState(item: StudentAssessment) {
  const expired = !!item.dueAt && new Date(item.dueAt).getTime() < Date.now();
  const draft = item.attempts.find(t => !t.submittedAt);
  const delivered = item.attempts.find(t => t.submittedAt);
  if (draft && !expired) return { label: 'Em andamento', tone: 'started', action: `Continuar ${item.kind === 'TEST' ? 'prova' : 'atividade'}`, href: `/atividades/${item.id}?tentativa=${draft.id}` };
  if (delivered) {
    const released = item.gradesReleased && !!delivered.gradedAt;
    return { label: released ? 'Correção disponível' : delivered.gradedAt ? 'Aguardando liberação da nota' : 'Entregue · aguardando correção', tone: released ? 'review' : 'done', action: released ? 'Ver correção' : 'Ver minhas respostas', href: `/atividades/${item.id}?tentativa=${delivered.id}` };
  }
  return { label: expired ? 'Prazo encerrado' : 'Para fazer', tone: expired ? 'closed' : 'pending', action: expired ? 'Ver avaliação' : item.kind === 'TEST' ? 'Abrir prova' : 'Abrir atividade', href: draft ? `/atividades/${item.id}?tentativa=${draft.id}` : `/atividades/${item.id}` };
}
