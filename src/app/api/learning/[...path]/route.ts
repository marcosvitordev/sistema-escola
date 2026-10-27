import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { db } from '@/lib/db';
import { allowedRequestOrigin } from '@/lib/request-origin';
import { currentUser, digest } from '@/lib/auth';
import { annotationsSchema } from '@/lib/pdf-annotations';
import { exportPdf } from '@/lib/pdf-export';
import { Prisma } from '@/generated/prisma/client';

export const runtime = 'nodejs';
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail('Entre para continuar.', 401);
    if (user.mustChangePassword) return fail('Troque sua senha inicial.', 403);
    const [resource, id, action] = (await context.params).path;
    const manage = user.role !== 'STUDENT';
    const write = req.method !== 'GET';
    if (write && !allowedRequestOrigin(req)) return fail('Origem não permitida.', 403);
    if (Number(req.headers.get('content-length') || 0) > 3_500_000) return fail('O limite de upload é 3 MB.', 413);
    const classAccess = { course: { institutionId: user.institutionId }, ...(user.role === 'TEACHER' ? { teacherId: user.id } : !manage ? { enrollments: { some: { studentId: user.id } } } : {}) };

    if (resource === 'classes' && id && req.method === 'GET') {
      const classroom = await db.class.findFirst({ where: { id, ...classAccess }, select: { id: true, name: true } });
      if (!classroom) return fail('Turma não encontrada.', 404);
      const lessons = await db.lesson.findMany({ where: { classId: id, ...(!manage ? { published: true } : {}) }, include: { documents: { select: { id: true, title: true, pageCount: true, createdAt: true } } }, orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }] });
      return json({ classroom, lessons });
    }
    if (resource === 'lessons' && !id && req.method === 'POST' && manage) {
      const data = z.object({ classId: z.string(), title: z.string().trim().min(3).max(150), module: z.string().trim().min(1).max(100), description: z.string().max(3000).default(''), scheduledAt: z.string().optional() }).parse(await req.json());
      if (!await db.class.findFirst({ where: { id: data.classId, ...classAccess } })) return fail('Turma não encontrada.', 404);
      const scheduledAt = data.scheduledAt ? new Date(`${data.scheduledAt}T12:00:00-05:00`) : null;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return fail('Data inválida.');
      return json(await db.lesson.create({ data: { ...data, scheduledAt } }), 201);
    }
    if (resource === 'lessons' && id && manage) {
      const lesson = await db.lesson.findFirst({ where: { id, class: classAccess } });
      if (!lesson) return fail('Aula não encontrada.', 404);
      if (action === 'publish' && req.method === 'POST') {
        const data = z.object({ published: z.boolean() }).parse(await req.json());
        await db.lesson.update({ where: { id }, data });
        return json({ ok: true });
      }
      if (action === 'documents' && req.method === 'POST') {
        const file = (await req.formData()).get('file');
        if (!(file instanceof File) || file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) return fail('Selecione um arquivo PDF.');
        if (!file.size || file.size > 3_000_000) return fail('O PDF deve ter até 3 MB.', 413);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return fail('O arquivo não é um PDF válido.');
        let pdf: PDFDocument;
        try { pdf = await PDFDocument.load(bytes); } catch { return fail('PDF inválido ou protegido por senha. Use um PDF sem senha.'); }
        if (pdf.getPageCount() < 1 || pdf.getPageCount() > 200) return fail('Use apostilas de 1 a 200 páginas.');
        const doc = await db.pdfDocument.create({ data: { lessonId: id, title: file.name.slice(0, 150), content: bytes, sha256: digest(bytes), pageCount: pdf.getPageCount() }, select: { id: true } });
        await db.auditLog.create({ data: { institutionId: user.institutionId, actorId: user.id, action: 'pdf-upload', resourceId: doc.id } });
        return json(doc, 201);
      }
    }
    if (resource !== 'documents' || !id) return fail('Operação não encontrada.', 404);
    const document = await db.pdfDocument.findFirst({ where: { id, lesson: { class: classAccess, ...(!manage ? { published: true } : {}) } }, select: { id: true, title: true, pageCount: true, lesson: { select: { classId: true, title: true } } } });
    if (!document) return fail('Apostila não encontrada.', 404);
    if (action === 'monitor' && req.method === 'GET' && manage) {
      const students = await db.enrollment.findMany({ where: { classId: document.lesson.classId }, select: { student: { select: { id: true, name: true, works: { where: { documentId: id }, select: { id: true, version: true, updatedAt: true, submittedAt: true, feedback: { orderBy: { createdAt: 'desc' }, take: 1 } } } } } }, orderBy: { student: { name: 'asc' } } });
      return json({ students });
    }
    const studentId = req.nextUrl.searchParams.get('student') || (!manage ? user.id : null);
    if (!manage && studentId !== user.id) return fail('Acesso não permitido.', 403);
    if (manage && studentId && !await db.enrollment.findFirst({ where: { classId: document.lesson.classId, studentId } })) return fail('Aluno não encontrado nesta turma.', 404);
    if (action === 'file' && req.method === 'GET') {
      const content = await db.pdfDocument.findUniqueOrThrow({ where: { id }, select: { content: true } });
      return new NextResponse(new Uint8Array(content.content), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="apostila.pdf"', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
    }
    if (!studentId) {
      if (action === 'work' && req.method === 'GET') return json({ document, work: null, readOnly: true, userId: user.id });
      return fail('Selecione um aluno.', 400);
    }
    const key = { documentId_studentId: { documentId: id, studentId } };
    let work = await db.pdfWork.findUnique({ where: key, include: { feedback: { orderBy: { createdAt: 'desc' } } } });
    if (action === 'work' && req.method === 'GET') {
      if (!work && !manage) {
        try { await db.pdfWork.upsert({ where: key, create: { documentId: id, studentId }, update: {} }); }
        catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error; }
        work = await db.pdfWork.findUniqueOrThrow({ where: key, include: { feedback: { orderBy: { createdAt: 'desc' } } } });
      }
      return json({ document, work, readOnly: manage || !!work?.submittedAt, userId: user.id });
    }
    if (action === 'work' && req.method === 'PUT' && !manage) {
      const data = z.object({ version: z.number().int().min(0), annotations: annotationsSchema }).parse(await req.json());
      if (data.annotations.some(note => note.page > document.pageCount)) return fail('Página inválida.');
      if (!work) return fail('Abra a apostila antes de editar.', 409);
      const result = await db.$transaction(async tx => {
        const updated = await tx.pdfWork.updateMany({ where: { id: work.id, version: data.version, submittedAt: null }, data: { annotations: data.annotations, version: { increment: 1 } } });
        if (!updated.count) return null;
        await tx.pdfRevision.create({ data: { workId: work.id, version: data.version + 1, annotations: data.annotations } });
        await tx.pdfRevision.deleteMany({ where: { workId: work.id, version: { lt: data.version - 19 } } });
        return tx.pdfWork.findUnique({ where: { id: work.id }, select: { version: true, updatedAt: true } });
      });
      if (!result) return fail('A versão mudou ou a apostila já foi entregue. Seu rascunho foi preservado.', 409);
      return json(result);
    }
    if (action === 'submit' && req.method === 'POST' && !manage && work) {
      const data = z.object({ version: z.number().int().min(0) }).parse(await req.json());
      const updated = await db.pdfWork.updateMany({ where: { id: work.id, version: data.version, submittedAt: null }, data: { submittedAt: new Date(), version: { increment: 1 } } });
      return updated.count ? json({ ok: true }) : fail('A versão mudou. Reabra a apostila e confira antes de entregar.', 409);
    }
    if (action === 'feedback' && req.method === 'POST' && manage && work) {
      const data = z.object({ comment: z.string().trim().min(1).max(5000), grade: z.number().min(0).max(10).optional(), reopen: z.boolean().default(false) }).parse(await req.json());
      await db.$transaction(async tx => {
        await tx.pdfFeedback.create({ data: { workId: work.id, teacherId: user.id, comment: data.comment, grade: data.grade } });
        if (data.reopen) await tx.pdfWork.update({ where: { id: work.id }, data: { submittedAt: null, version: { increment: 1 } } });
        await tx.auditLog.create({ data: { institutionId: user.institutionId, actorId: user.id, action: 'pdf-feedback', resourceId: work.id } });
      });
      return json({ ok: true }, 201);
    }
    if (action === 'export' && req.method === 'GET') {
      const content = await db.pdfDocument.findUniqueOrThrow({ where: { id }, select: { content: true } });
      const annotations = annotationsSchema.parse(work?.annotations ?? []);
      let result: Uint8Array;
      try { result = await exportPdf(content.content, annotations); } catch { return fail('Não foi possível exportar. Utilize texto com caracteres latinos e revise a apostila.', 422); }
      return new NextResponse(new Uint8Array(result), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="apostila-respondida.pdf"', 'Cache-Control': 'private, no-store' } });
    }
    return fail('Operação não permitida.', 403);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return fail('Confira os dados enviados.');
    console.error('Learning API', error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code, meta: error.meta } : error instanceof Error ? error.name : 'unknown');
    return fail('Não foi possível concluir. Tente novamente.', 500);
  }
}
export { handler as GET, handler as POST, handler as PUT };
