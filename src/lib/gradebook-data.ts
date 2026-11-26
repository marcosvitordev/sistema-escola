import { db } from './db';
import { automaticScores, type Answers, type QuestionDefinition } from './assessments';
import { assessmentGrade, manualComplete, summarizeStudent, type GradebookReport, type GradeItem, type GradeWeights } from './gradebook';
import { studentDateKey } from './student-dates';

export async function gradebookClass(id: string, user: { id: string; institutionId: string; role: string }) {
  return db.class.findFirst({ where: { id, course: { institutionId: user.institutionId }, ...(user.role === 'TEACHER' ? { teacherId: user.id } : {}) }, select: { id: true, name: true, pdfWeight: true, activityWeight: true, testWeight: true, gradeWeightsVersion: true, course: { select: { name: true } }, teacher: { select: { name: true } }, enrollments: { select: { student: { select: { id: true, name: true, username: true } } }, orderBy: { student: { name: 'asc' } } } } });
}
type Classroom = NonNullable<Awaited<ReturnType<typeof gradebookClass>>>;
export type GradeRange = { from?: string; to?: string };
export function inGradeRange(date: Date, range: GradeRange) {
  const key = studentDateKey(date.toISOString()); return (!range.from || key >= range.from) && (!range.to || key <= range.to);
}
export async function classGradebook(classroom: Classroom, range: GradeRange): Promise<GradebookReport> {
  const studentIds = classroom.enrollments.map(item => item.student.id);
  const lessons = await db.lesson.findMany({ where: { classId: classroom.id }, orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }], select: {
    id: true, title: true, published: true, scheduledAt: true,
    documents: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, createdAt: true, works: { where: { studentId: { in: studentIds } }, select: { id: true, studentId: true, version: true, submittedAt: true, feedback: { where: { grade: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { grade: true, createdAt: true, comment: true } } } } } },
    assessments: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, kind: true, createdAt: true, published: true, gradesReleased: true, questions: { select: { id: true, type: true, points: true } }, attempts: { where: { studentId: { in: studentIds } }, orderBy: { number: 'desc' }, select: { id: true, studentId: true, number: true, submittedAt: true, gradedAt: true, autoScores: true, review: true, feedback: true } } } },
  } });
  const weights: GradeWeights = { PDF: classroom.pdfWeight, ACTIVITY: classroom.activityWeight, TEST: classroom.testWeight };
  const students = classroom.enrollments.map(({ student }) => {
    const items: GradeItem[] = [];
    for (const lesson of lessons) {
      for (const document of lesson.documents) {
        const work = document.works.find(item => item.studentId === student.id), date = lesson.scheduledAt || document.createdAt;
        if ((!lesson.published && !work) || !inGradeRange(date, range)) continue;
        const feedback = work?.feedback[0];
        const graded = !!(work?.submittedAt && feedback && feedback.createdAt >= work.submittedAt);
        items.push({ id: document.id, kind: 'PDF', title: document.title, lesson: lesson.title, date: studentDateKey(date.toISOString()), published: lesson.published, state: graded ? 'graded' : work?.submittedAt ? 'manual' : work?.version ? 'in-progress' : 'not-submitted', grade: graded ? feedback!.grade : null, submittedAt: work?.submittedAt?.toISOString() || null, correctedAt: graded ? feedback!.createdAt.toISOString() : null, href: `/apostilas/${document.id}?aluno=${student.id}`, note: graded ? feedback!.comment : work?.submittedAt ? 'Apostila entregue: atribua a nota após conferir as respostas.' : '', released: graded });
      }
      for (const assessment of lesson.assessments) {
        const attempts = assessment.attempts.filter(item => item.studentId === student.id), date = lesson.scheduledAt || assessment.createdAt;
        if (((!lesson.published || !assessment.published) && !attempts.length) || !inGradeRange(date, range)) continue;
        const attempt = attempts.find(item => item.submittedAt), current = attempt || attempts[0];
        const grade = attempt?.gradedAt ? assessmentGrade(assessment.questions, attempt.autoScores, attempt.review) : null;
        items.push({ id: assessment.id, kind: assessment.kind === 'TEST' ? 'TEST' : 'ACTIVITY', title: assessment.title, lesson: lesson.title, date: studentDateKey(date.toISOString()), published: lesson.published && assessment.published, state: grade !== null ? 'graded' : attempt ? 'manual' : current ? 'in-progress' : 'not-submitted', grade, submittedAt: attempt?.submittedAt?.toISOString() || null, correctedAt: grade !== null ? attempt!.gradedAt!.toISOString() : null, href: `/atividades/${assessment.id}${current ? `?tentativa=${current.id}` : ''}`, note: current ? `Tentativa ${current.number}${attempts[0]?.number > current.number ? '; há uma nova tentativa em andamento' : ''}${current.feedback ? ` · ${current.feedback}` : ''}` : '', released: assessment.gradesReleased && grade !== null });
      }
    }
    return summarizeStudent(student, items, weights);
  });
  return { classroom: { id: classroom.id, name: classroom.name, course: classroom.course.name, teacher: classroom.teacher.name }, weights, weightsVersion: classroom.gradeWeightsVersion, from: range.from || '', to: range.to || '', generatedAt: new Date().toISOString(), students };
}
function sameScores(a: unknown, b: Record<string, number>) {
  const current = a && typeof a === 'object' && !Array.isArray(a) ? a as Record<string, unknown> : {};
  return Object.keys(current).length === Object.keys(b).length && Object.entries(b).every(([key, value]) => current[key] === value);
}
export async function correctGradebook(classId: string, actor: { id: string; institutionId: string }, range: GradeRange, releaseGrades: boolean) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(724194)::text`;
    const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') ?? 'escola';
    await tx.$queryRaw`SELECT set_config('search_path', ${`"${schema.replaceAll('"', '""')}"`}, true)`;
    await tx.$queryRaw`SELECT id FROM "Assessment" WHERE "lessonId" IN (SELECT id FROM "Lesson" WHERE "classId" = ${classId}) ORDER BY id FOR UPDATE`;
    const assessments = await tx.assessment.findMany({ where: { lesson: { classId } }, select: { id: true, createdAt: true, gradesReleased: true, lesson: { select: { scheduledAt: true } }, questions: { select: { id: true, type: true, points: true, answerKey: true } }, attempts: { where: { submittedAt: { not: null }, student: { enrollments: { some: { classId } } } }, select: { id: true, version: true, answers: true, autoScores: true, review: true, gradedAt: true } } } });
    const result = { checked: 0, updated: 0, completed: 0, pendingManual: 0, conflicts: 0, released: 0 };
    for (const assessment of assessments) {
      if (!inGradeRange(assessment.lesson.scheduledAt || assessment.createdAt, range)) continue;
      for (const attempt of assessment.attempts) {
        result.checked++;
        const scores = automaticScores(assessment.questions as unknown as QuestionDefinition[], attempt.answers as Answers);
        const complete = manualComplete(assessment.questions, attempt.review);
        const changed = !sameScores(attempt.autoScores, scores) || complete !== !!attempt.gradedAt;
        if (changed) {
          const saved = await tx.assessmentAttempt.updateMany({ where: { id: attempt.id, version: attempt.version, submittedAt: { not: null } }, data: { autoScores: scores, gradedAt: complete ? new Date() : null, version: { increment: 1 } } });
          if (!saved.count) { result.conflicts++; continue; }
          result.updated++;
          await tx.auditLog.create({ data: { institutionId: actor.institutionId, actorId: actor.id, action: 'assessment-bulk-corrected', resourceId: attempt.id } });
        }
        if (complete) result.completed++; else result.pendingManual++;
      }
      if (releaseGrades && !assessment.gradesReleased && await tx.assessmentAttempt.count({ where: { assessmentId: assessment.id, submittedAt: { not: null }, gradedAt: { not: null } } })) {
        await tx.assessment.update({ where: { id: assessment.id }, data: { gradesReleased: true, revision: { increment: 1 } } }); result.released++;
      }
    }
    await tx.auditLog.create({ data: { institutionId: actor.institutionId, actorId: actor.id, action: 'gradebook-corrected', resourceId: classId } });
    return result;
  }, { maxWait: 10_000, timeout: 60_000 });
}

export async function givePdfTen(classId: string, actor: { id: string; institutionId: string }, range: GradeRange) {
  return db.$transaction(async tx => {
    const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') ?? 'escola';
    await tx.$queryRaw`SELECT set_config('search_path', ${`"${schema.replaceAll('"', '""')}"`}, true)`;
    await tx.$queryRaw`SELECT d.id FROM "PdfDocument" d JOIN "Lesson" l ON l.id = d."lessonId" WHERE l."classId" = ${classId} ORDER BY d.id FOR UPDATE OF d`;
    await tx.$queryRaw`SELECT w.id FROM "PdfWork" w JOIN "PdfDocument" d ON d.id = w."documentId" JOIN "Lesson" l ON l.id = d."lessonId" WHERE l."classId" = ${classId} ORDER BY w.id FOR UPDATE OF w`;
    const works = await tx.pdfWork.findMany({ where: { submittedAt: { not: null }, document: { lesson: { classId } }, student: { enrollments: { some: { classId } } } }, select: { id: true, submittedAt: true, document: { select: { createdAt: true, lesson: { select: { scheduledAt: true } } } }, feedback: { where: { grade: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { grade: true, createdAt: true } } } });
    const result = { graded: 0, alreadyTen: 0 };
    for (const work of works) {
      if (!inGradeRange(work.document.lesson.scheduledAt || work.document.createdAt, range)) continue;
      const latest = work.feedback[0];
      if (latest?.grade === 10 && latest.createdAt >= work.submittedAt!) { result.alreadyTen++; continue; }
      await tx.pdfFeedback.create({ data: { workId: work.id, teacherId: actor.id, grade: 10, comment: 'Nota 10 atribuída em lote na caderneta.' } });
      await tx.auditLog.create({ data: { institutionId: actor.institutionId, actorId: actor.id, action: 'pdf-bulk-ten', resourceId: work.id } });
      result.graded++;
    }
    await tx.auditLog.create({ data: { institutionId: actor.institutionId, actorId: actor.id, action: 'gradebook-pdf-ten', resourceId: classId } });
    return result;
  }, { maxWait: 10_000, timeout: 60_000 });
}
