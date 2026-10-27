import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { allowedRequestOrigin } from '@/lib/request-origin';
import { GoogleFormsImportError, importGoogleForm } from '@/lib/google-forms-import';
import { currentUser } from '@/lib/auth';
import { Prisma } from '@/generated/prisma/client';
import { assessmentSchema, answersSchema, automaticScores, manualQuestion, validateAnswers, type QuestionDefinition, type Answers } from '@/lib/assessments';

export const runtime = 'nodejs';
class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fileSelect = { id: true, questionId: true, name: true, mimeType: true } as const;
const questionSelect = { id: true, position: true, type: true, prompt: true, points: true, options: true, matches: true, answerKey: true, imageId: true, files: { where: { attemptId: null, mimeType: { in: ['image/png', 'image/jpeg'] } }, select: { id: true, name: true }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] } } satisfies Prisma.AssessmentQuestionSelect;
const definitionInclude = { questions: { orderBy: { position: 'asc' as const }, select: questionSelect }, lesson: { select: { id: true, title: true, published: true, classId: true } } };
async function readBytes(req: NextRequest, limit: number) {
  const reader = req.body?.getReader(); if (!reader) throw new RequestError('Envie os dados da operação.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const value = await reader.read(); if (value.done) break; length += value.value.byteLength; if (length > limit) { await reader.cancel(); throw new RequestError('Dados muito grandes.', 413); } chunks.push(value.value); }
  return Buffer.concat(chunks);
}
async function body(req: NextRequest) { return JSON.parse((await readBytes(req, 350_000)).toString('utf8')) as unknown; }
async function multipart(req: NextRequest) {
  const bytes = await readBytes(req, 5_500_000);
  try { return await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData(); }
  catch { throw new RequestError('O envio do arquivo está inválido.'); }
}
const locked = (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT pg_advisory_xact_lock(724194)::text`;
const expired = (date: Date | null) => date !== null && date.getTime() < Date.now();
const keyJson = (value: unknown) => value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
type Question = Prisma.AssessmentQuestionGetPayload<{ select: typeof questionSelect }>;
const rules = (questions: Question[]) => questions as unknown as QuestionDefinition[];
function publicQuestions(questions: Question[], manage: boolean) { return questions.map(q => { const { answerKey, files, ...publicQuestion } = q; const view = { ...publicQuestion, images: files }; return manage ? { ...view, answerKey } : view; }); }
function score(attempt: { autoScores: Prisma.JsonValue; review: Prisma.JsonValue }) {
  const automatic = attempt.autoScores as Record<string, number>;
  const manual = attempt.review as Record<string, { points: number }>;
  return Math.round((Object.values(automatic).reduce((a, b) => a + b, 0) + Object.values(manual).reduce((a, b) => a + b.points, 0)) * 10_000) / 10_000;
}

async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await currentUser();
    if (!user) throw new RequestError('Entre para continuar.', 401);
    if (user.mustChangePassword) throw new RequestError('Troque sua senha inicial.', 403);
    if (req.method !== 'GET' && !allowedRequestOrigin(req)) throw new RequestError('Origem não permitida.', 403);
    if (Number(req.headers.get('content-length') || 0) > 5_500_000) throw new RequestError('O limite de arquivo é 5 MB.', 413);
    const [resource, id, action] = (await context.params).path;
    const manage = user.role !== 'STUDENT';
    const classAccess: Prisma.ClassWhereInput = { course: { institutionId: user.institutionId }, ...(user.role === 'TEACHER' ? { teacherId: user.id } : !manage ? { enrollments: { some: { studentId: user.id } } } : {}) };
    const access: Prisma.AssessmentWhereInput = { lesson: { class: classAccess, ...(!manage ? { published: true } : {}) }, ...(!manage ? { published: true } : {}) };
    const audit = (tx: Prisma.TransactionClient, event: string, resourceId: string) => tx.auditLog.create({ data: { institutionId: user.institutionId, actorId: user.id, action: event, resourceId } });

    if (resource === 'classes' && id && action === 'import' && req.method === 'POST') {
      if (!manage) throw new RequestError('Somente professores e administradores podem importar avaliações.', 403);
      if (!await db.class.findFirst({ where: { id, ...classAccess }, select: { id: true } })) throw new RequestError('Turma não encontrada.', 404);
      const data = z.object({ source: z.unknown() }).parse(JSON.parse((await readBytes(req, 5_100_000)).toString('utf8')));
      return json(importGoogleForm(data.source));
    }

    if (resource === 'classes' && id && req.method === 'GET') {
      const classroom = await db.class.findFirst({ where: { id, ...classAccess }, select: { id: true, name: true } });
      if (!classroom) throw new RequestError('Turma não encontrada.', 404);
      const [lessons, assessments] = await Promise.all([
        db.lesson.findMany({ where: { classId: id, ...(!manage ? { published: true } : {}) }, select: { id: true, title: true, published: true }, orderBy: { createdAt: 'asc' } }),
        db.assessment.findMany({ where: { ...access, lesson: { classId: id, class: classAccess, ...(!manage ? { published: true } : {}) } }, select: { id: true, title: true, kind: true, published: true, gradesReleased: true, dueAt: true, maxAttempts: true, revision: true, lesson: { select: { title: true, published: true } }, _count: { select: { questions: true } }, attempts: { where: manage ? {} : { studentId: user.id }, select: { id: true, submittedAt: true, gradedAt: true, number: true } } }, orderBy: { createdAt: 'desc' } }),
      ]);
      return json({ classroom, lessons, assessments, manage });
    }
    if (resource === 'items' && !id && req.method === 'POST' && manage) {
      const data = assessmentSchema.parse(await body(req));
      if (!await db.lesson.findFirst({ where: { id: data.lessonId, class: classAccess } })) throw new RequestError('Aula não encontrada.', 404);
      const created = await db.$transaction(async tx => {
        const { questions, dueAt, ...fields } = data;
        const item = await tx.assessment.create({ data: { ...fields, dueAt: dueAt ? new Date(dueAt) : null, questions: { create: questions.map((q, position) => ({ ...q, position, answerKey: keyJson(q.answerKey) })) } }, select: { id: true } });
        await audit(tx, 'assessment-created', item.id); return item;
      });
      return json(created, 201);
    }
    if (resource === 'files' && id && req.method === 'GET') {
      const file = await db.assessmentFile.findFirst({ where: { id, assessment: access, ...(!manage ? { OR: [{ attemptId: null }, { attempt: { studentId: user.id } }] } : {}) }, select: { content: true, mimeType: true, attemptId: true } });
      if (!file) throw new RequestError('Arquivo não encontrado.', 404);
      const image = file.attemptId === null && ['image/png', 'image/jpeg'].includes(file.mimeType);
      const extension = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'text/plain': 'txt' }[file.mimeType] || 'bin';
      return new NextResponse(new Uint8Array(file.content), { headers: { 'Content-Type': file.mimeType, 'Content-Disposition': `${image ? 'inline' : 'attachment'}; filename="arquivo.${extension}"`, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
    }
    if (resource === 'items' && id) {
      const assessment = await db.assessment.findFirst({ where: { id, ...access }, include: definitionInclude });
      if (!assessment) throw new RequestError('Prova ou atividade não encontrada.', 404);
      if (!action && req.method === 'GET') {
        const attempts = await db.assessmentAttempt.findMany({ where: { assessmentId: id, ...(!manage ? { studentId: user.id } : {}) }, select: { id: true, studentId: true, number: true, submittedAt: true, gradedAt: true, createdAt: true, updatedAt: true, student: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
        const students = manage ? await db.enrollment.findMany({ where: { classId: assessment.lesson.classId }, select: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: 'asc' } } }) : [];
        return json({ assessment: { ...assessment, questions: publicQuestions(assessment.questions, manage) }, attempts, students, manage });
      }
      if (!action && req.method === 'PUT' && manage) {
        const data = assessmentSchema.safeExtend({ revision: z.number().int().min(0) }).parse(await body(req));
        if (data.lessonId !== assessment.lessonId) throw new RequestError('A aula de uma avaliação existente não pode ser alterada.');
        await db.$transaction(async tx => {
          await locked(tx);
          if (await tx.assessmentAttempt.count({ where: { assessmentId: id } })) throw new RequestError('Já há tentativas iniciadas. Duplique a avaliação para alterar as questões.', 409);
          const updated = await tx.assessment.updateMany({ where: { id, revision: data.revision }, data: { title: data.title, kind: data.kind, instructions: data.instructions, maxAttempts: data.maxAttempts, dueAt: data.dueAt ? new Date(data.dueAt) : null, revision: { increment: 1 } } });
          if (!updated.count) throw new RequestError('A avaliação mudou. Reabra a página antes de editar.', 409);
          const old = await tx.assessmentQuestion.findMany({ where: { assessmentId: id }, select: { id: true, imageId: true } });
          const keepIds = data.questions.map(q => q.id);
          await tx.assessmentQuestion.deleteMany({ where: { assessmentId: id, id: { notIn: keepIds } } });
          // Move positions out of the unique range before reordering existing questions.
          await tx.assessmentQuestion.updateMany({ where: { assessmentId: id }, data: { position: { increment: 1000 } } });
          for (const [position, q] of data.questions.entries()) {
            const question = { ...q, position, answerKey: keyJson(q.answerKey) };
            if (old.some(item => item.id === q.id)) await tx.assessmentQuestion.update({ where: { id: q.id }, data: question });
            else await tx.assessmentQuestion.create({ data: { ...question, assessmentId: id } });
          }
          await audit(tx, 'assessment-edited', id);
        });
        return json({ ok: true });
      }
      if (action === 'settings' && req.method === 'POST' && manage) {
        const data = z.object({ revision: z.number().int().min(0), published: z.boolean().optional(), gradesReleased: z.boolean().optional(), dueAt: z.string().datetime({ offset: true }).nullable().optional(), maxAttempts: z.number().int().min(1).max(10).optional() }).parse(await body(req));
        await db.$transaction(async tx => {
          await locked(tx);
          if (data.maxAttempts !== undefined) { const used = await tx.assessmentAttempt.aggregate({ where: { assessmentId: id }, _max: { number: true } }); if (data.maxAttempts < (used._max.number ?? 0)) throw new RequestError('O limite não pode ser menor que as tentativas já iniciadas.'); }
          const { revision, dueAt, ...settings } = data;
          const updated = await tx.assessment.updateMany({ where: { id, revision }, data: { ...settings, ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}), revision: { increment: 1 } } });
          if (!updated.count) throw new RequestError('A avaliação mudou. Atualize a página.', 409);
          await audit(tx, data.gradesReleased ? 'assessment-grades-released' : 'assessment-settings', id);
        });
        return json({ ok: true });
      }
      if (action === 'duplicate' && req.method === 'POST' && manage) {
        const data = z.object({ lessonId: z.string() }).parse(await body(req));
        if (!await db.lesson.findFirst({ where: { id: data.lessonId, class: classAccess } })) throw new RequestError('Aula não encontrada.', 404);
        const copy = await db.$transaction(async tx => {
          const created = await tx.assessment.create({ data: { lessonId: data.lessonId, kind: assessment.kind, title: `${assessment.title.slice(0, 140)} (cópia)`, instructions: assessment.instructions, maxAttempts: assessment.maxAttempts } });
          for (const original of assessment.questions) {
            const questionId = randomUUID();
            const { files, ...fields } = original;
            await tx.assessmentQuestion.create({ data: { ...fields, id: questionId, assessmentId: created.id, imageId: null, answerKey: keyJson(original.answerKey) } });
            let firstImageId: string | null = null;
            for (const originalFile of files) {
              const image = await tx.assessmentFile.findFirst({ where: { id: originalFile.id, assessmentId: id, questionId: original.id, attemptId: null } });
              if (image) { const file = await tx.assessmentFile.create({ data: { assessmentId: created.id, questionId, name: image.name, mimeType: image.mimeType, content: image.content } }); firstImageId ??= file.id; }
            }
            if (firstImageId) await tx.assessmentQuestion.update({ where: { id: questionId }, data: { imageId: firstImageId } });
          }
          await audit(tx, 'assessment-duplicated', created.id); return { id: created.id };
        });
        return json(copy, 201);
      }
      if (action === 'start' && req.method === 'POST' && !manage) {
        const attempt = await db.$transaction(async tx => {
          await locked(tx);
          const current = await tx.assessment.findFirst({ where: { id, ...access } });
          if (!current) throw new RequestError('Avaliação indisponível.', 404);
          if (expired(current.dueAt)) throw new RequestError('O prazo desta avaliação terminou.', 409);
          const existing = await tx.assessmentAttempt.findFirst({ where: { assessmentId: id, studentId: user.id, submittedAt: null } });
          if (existing) return { id: existing.id };
          const count = await tx.assessmentAttempt.count({ where: { assessmentId: id, studentId: user.id } });
          if (count >= current.maxAttempts) throw new RequestError('Você já utilizou todas as tentativas permitidas.', 409);
          return tx.assessmentAttempt.create({ data: { assessmentId: id, studentId: user.id, number: count + 1 }, select: { id: true } });
        });
        return json(attempt, 201);
      }
      if (action === 'image' && req.method === 'POST' && manage) {
        const form = await multipart(req); const questionId = z.string().parse(form.get('questionId'));
        const file = await validatedFile(form.get('file'), true);
        const append = form.get('append') === 'true';
        const importId = append ? z.string().uuid().parse(form.get('importId')) : undefined;
        const saved = await db.$transaction(async tx => {
          await locked(tx);
          if (await tx.assessmentAttempt.count({ where: { assessmentId: id } })) throw new RequestError('As imagens ficam protegidas após o início das tentativas.', 409);
          const current = await tx.assessmentQuestion.findFirst({ where: { id: questionId, assessmentId: id } });
          if (!current) throw new RequestError('Questão não encontrada.', 404);
          if (importId) {
            const existing = await tx.assessmentFile.findUnique({ where: { id: importId } });
            if (existing) {
              if (existing.assessmentId !== id || existing.questionId !== questionId || existing.attemptId !== null || !Buffer.from(existing.content).equals(Buffer.from(file.content)) || existing.name !== file.name) throw new RequestError('Referência de imagem incompatível. Reimporte o pacote.', 409);
              return { id: existing.id };
            }
            if (await tx.assessmentFile.count({ where: { questionId, attemptId: null } }) >= 25) throw new RequestError('Cada questão aceita até 25 imagens.', 400);
          }
          const image = await tx.assessmentFile.create({ data: { ...file, ...(importId ? { id: importId } : {}), assessmentId: id, questionId } });
          if (!append || !current.imageId) await tx.assessmentQuestion.update({ where: { id: questionId }, data: { imageId: image.id } });
          if (!append) await tx.assessmentFile.deleteMany({ where: { questionId, attemptId: null, id: { not: image.id } } });
          return { id: image.id };
        });
        return json({ ok: true, ...saved }, 201);
      }
    }
    if (resource === 'attempts' && id) {
      const attempt = await db.assessmentAttempt.findFirst({ where: { id, assessment: access, ...(!manage ? { studentId: user.id } : {}) }, include: { assessment: { include: definitionInclude }, student: { select: { name: true } }, files: { select: fileSelect } } });
      if (!attempt) throw new RequestError('Tentativa não encontrada.', 404);
      const assessment = attempt.assessment;
      const maxPoints = assessment.questions.reduce((total, q) => total + q.points, 0);
      if (!action && req.method === 'GET') {
        const visible = manage || (assessment.gradesReleased && attempt.gradedAt !== null && attempt.submittedAt !== null);
        return json({ assessment: { ...assessment, questions: publicQuestions(assessment.questions, visible) }, attempt: { id, number: attempt.number, answers: attempt.answers, version: attempt.version, submittedAt: attempt.submittedAt, gradedAt: attempt.gradedAt, updatedAt: attempt.updatedAt, student: attempt.student, files: attempt.files, grade: visible && attempt.submittedAt ? score(attempt) : null, maxPoints, autoScores: visible ? attempt.autoScores : undefined, review: visible ? attempt.review : undefined, feedback: visible ? attempt.feedback : undefined }, manage });
      }
      if (!action && req.method === 'PUT' && !manage) {
        const data = z.object({ version: z.number().int().min(0), answers: answersSchema }).parse(await body(req));
        const error = validateAnswers(rules(assessment.questions), data.answers); if (error) throw new RequestError(error);
        await db.$transaction(async tx => {
          await locked(tx);
          const current = await tx.assessment.findUniqueOrThrow({ where: { id: assessment.id } });
          if (expired(current.dueAt)) throw new RequestError('O prazo terminou. Seu rascunho local foi preservado.', 409);
          await validateFiles(tx, assessment.questions, data.answers, id);
          const updated = await tx.assessmentAttempt.updateMany({ where: { id, version: data.version, submittedAt: null }, data: { answers: data.answers, version: { increment: 1 } } });
          if (!updated.count) throw new RequestError('A tentativa mudou ou já foi entregue. Reabra antes de continuar.', 409);
        });
        return json({ version: data.version + 1 });
      }
      if (action === 'submit' && req.method === 'POST' && !manage) {
        const data = z.object({ version: z.number().int().min(0) }).parse(await body(req));
        await db.$transaction(async tx => {
          await locked(tx);
          const current = await tx.assessment.findUniqueOrThrow({ where: { id: assessment.id } });
          if (expired(current.dueAt)) throw new RequestError('O prazo desta avaliação terminou.', 409);
          const scores = automaticScores(rules(assessment.questions), attempt.answers as Answers);
          const updated = await tx.assessmentAttempt.updateMany({ where: { id, version: data.version, submittedAt: null }, data: { submittedAt: new Date(), autoScores: scores, version: { increment: 1 }, gradedAt: assessment.questions.some(q => manualQuestion(q.type)) ? null : new Date() } });
          if (!updated.count || attempt.version !== data.version) throw new RequestError('A tentativa mudou. Confira suas respostas antes de entregar.', 409);
          await audit(tx, 'assessment-submitted', id);
        });
        return json({ ok: true });
      }
      if (action === 'review' && req.method === 'POST' && manage) {
        const data = z.object({ version: z.number().int().min(0), feedback: z.string().max(5000), review: z.record(z.string(), z.object({ points: z.number().min(0).max(100), feedback: z.string().max(2000).default('') })) }).parse(await body(req));
        if (!attempt.submittedAt) throw new RequestError('Aguarde a entrega antes de corrigir.');
        for (const [questionId, review] of Object.entries(data.review)) { const question = assessment.questions.find(q => q.id === questionId && manualQuestion(q.type)); if (!question || review.points > question.points) throw new RequestError('A pontuação deve respeitar o valor de cada questão manual.'); }
        const completed = assessment.questions.filter(q => manualQuestion(q.type)).every(q => data.review[q.id] !== undefined);
        await db.$transaction(async tx => {
          const updated = await tx.assessmentAttempt.updateMany({ where: { id, version: data.version }, data: { review: data.review, feedback: data.feedback, gradedAt: completed ? new Date() : null, reviewedBy: user.id, version: { increment: 1 } } });
          if (!updated.count) throw new RequestError('A correção mudou. Reabra a tentativa antes de salvar.', 409);
          await audit(tx, 'assessment-reviewed', id);
        });
        return json({ ok: true });
      }
      if (action === 'file' && req.method === 'POST' && !manage) {
        const form = await multipart(req); const questionId = z.string().parse(form.get('questionId'));
        if (!assessment.questions.some(q => q.id === questionId && q.type === 'FILE')) throw new RequestError('Questão de arquivo não encontrada.', 404);
        const file = await validatedFile(form.get('file'), false);
        const uploaded = await db.$transaction(async tx => {
          await locked(tx);
          const current = await tx.assessmentAttempt.findUniqueOrThrow({ where: { id }, include: { assessment: { select: { dueAt: true } } } });
          if (current.submittedAt || expired(current.assessment.dueAt)) throw new RequestError('Esta tentativa não aceita mais alterações.', 409);
          return tx.assessmentFile.upsert({ where: { questionId_attemptId: { questionId, attemptId: id } }, create: { ...file, assessmentId: assessment.id, questionId, attemptId: id }, update: file, select: fileSelect });
        });
        return json(uploaded, 201);
      }
    }
    throw new RequestError('Operação não permitida.', 403);
  } catch (error) {
    if (error instanceof GoogleFormsImportError) return json({ error: error.message }, 400);
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? 'Confira os campos.' }, 400);
    if (error instanceof SyntaxError) return json({ error: 'Dados inválidos.' }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return json({ error: 'Este registro já existe. Atualize a página.' }, 409);
    console.error('Assessments API', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'Não foi possível concluir. Tente novamente.' }, 500);
  }
}
async function validateFiles(tx: Prisma.TransactionClient, questions: Question[], answers: Answers, attemptId: string) {
  for (const q of questions.filter(q => q.type === 'FILE')) { const id = answers[q.id]; if (id && (typeof id !== 'string' || !await tx.assessmentFile.findFirst({ where: { id, questionId: q.id, attemptId }, select: { id: true } }))) throw new RequestError('O arquivo não pertence a esta resposta.'); }
}
async function validatedFile(value: FormDataEntryValue | null, imageOnly: boolean) {
  if (!(value instanceof File) || !value.size) throw new RequestError('Selecione um arquivo de até 5 MB.');
  if (value.size > 5_000_000) throw new RequestError('O arquivo deve ter até 5 MB.', 413);
  const content = new Uint8Array(await value.arrayBuffer());
  const prefix = Buffer.from(content.slice(0, 8)); let mimeType = '';
  if (prefix.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mimeType = 'image/png';
  else if (content[0] === 255 && content[1] === 216 && content[2] === 255) mimeType = 'image/jpeg';
  else if (!imageOnly && prefix.toString('ascii').startsWith('%PDF-')) mimeType = 'application/pdf';
  else if (!imageOnly && value.name.toLowerCase().endsWith('.txt') && value.type === 'text/plain') { try { new TextDecoder('utf-8', { fatal: true }).decode(content); if (content.includes(0)) throw new Error(); mimeType = 'text/plain'; } catch { /* Invalid text remains rejected. */ } }
  if (!mimeType || (imageOnly && !['image/png', 'image/jpeg'].includes(mimeType))) throw new RequestError(imageOnly ? 'Envie uma imagem PNG ou JPEG.' : 'Formatos permitidos: PDF, PNG, JPEG ou TXT em UTF-8.');
  return { name: value.name.replace(/[\\/\r\n]/g, '_').slice(0, 150), mimeType, content };
}
export { handler as GET, handler as POST, handler as PUT };
