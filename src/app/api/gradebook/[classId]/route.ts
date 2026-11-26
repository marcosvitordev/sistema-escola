import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { allowedRequestOrigin } from '@/lib/request-origin';
import { gradebookCsv } from '@/lib/gradebook';
import { classGradebook, correctGradebook, givePdfTen, gradebookClass } from '@/lib/gradebook-data';

export const runtime = 'nodejs';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const rangeSchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).refine(value => !value.from || !value.to || value.from <= value.to, 'A data inicial deve ser anterior à final.');
const weightsSchema = z.object({ PDF: z.number().min(0).max(100), ACTIVITY: z.number().min(0).max(100), TEST: z.number().min(0).max(100) }).strict().refine(value => value.PDF + value.ACTIVITY + value.TEST > 0, 'Informe ao menos um peso maior que zero.');
const mutation = z.discriminatedUnion('operation', [z.object({ operation: z.literal('weights'), version: z.number().int().min(0), weights: weightsSchema }).strict(), z.object({ operation: z.literal('correct'), from: z.iso.date().optional(), to: z.iso.date().optional(), releaseGrades: z.boolean().default(false) }).strict(), z.object({ operation: z.literal('pdf-ten'), from: z.iso.date().optional(), to: z.iso.date().optional() }).strict()]);
async function handler(req: NextRequest, context: { params: Promise<{ classId: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Entre para continuar.' }, 401);
    if (user.mustChangePassword || !['ADMIN', 'TEACHER'].includes(user.role)) return json({ error: 'A caderneta é restrita ao professor e administrador.' }, 403);
    if (req.method !== 'GET' && !allowedRequestOrigin(req)) return json({ error: 'Origem não permitida.' }, 403);
    const classroom = await gradebookClass((await context.params).classId, user);
    if (!classroom) return json({ error: 'Turma não encontrada.' }, 404);
    if (req.method === 'GET') {
      const range = rangeSchema.parse({ from: req.nextUrl.searchParams.get('from') || undefined, to: req.nextUrl.searchParams.get('to') || undefined });
      const report = await classGradebook(classroom, range), studentId = req.nextUrl.searchParams.get('student');
      if (studentId) { report.students = report.students.filter(student => student.id === studentId); if (!report.students.length) return json({ error: 'Aluno não matriculado nesta turma.' }, 404); }
      if (req.nextUrl.searchParams.get('format') === 'csv') return new NextResponse(gradebookCsv(report, req.nextUrl.searchParams.get('detail') === 'true'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="caderneta-${studentId ? 'aluno' : 'turma'}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
      return json(report);
    }
    const reader = req.body?.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
    if (reader) { while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 10_000) { await reader.cancel(); return json({ error: 'Dados muito grandes.' }, 413); } chunks.push(next.value); } }
    const data = mutation.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (data.operation === 'weights') {
      const updated = await db.$transaction(async tx => {
        const changed = await tx.class.updateMany({ where: { id: classroom.id, gradeWeightsVersion: data.version }, data: { pdfWeight: data.weights.PDF, activityWeight: data.weights.ACTIVITY, testWeight: data.weights.TEST, gradeWeightsVersion: { increment: 1 } } });
        if (!changed.count) return false;
        await tx.auditLog.create({ data: { institutionId: user.institutionId, actorId: user.id, action: 'gradebook-weights', resourceId: classroom.id } }); return true;
      });
      return updated ? json({ ok: true }) : json({ error: 'Os pesos mudaram em outra janela. Atualize a caderneta antes de salvar.' }, 409);
    }
    const range = rangeSchema.parse({ from: data.from, to: data.to });
    if (data.operation === 'pdf-ten') return json(await givePdfTen(classroom.id, user, range));
    return json(await correctGradebook(classroom.id, user, range, data.releaseGrades));
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || 'Confira os dados.' }, 400);
    if (error instanceof SyntaxError) return json({ error: 'Dados inválidos.' }, 400);
    console.error('Gradebook', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'Não foi possível atualizar a caderneta. Tente novamente.' }, 500);
  }
}
export { handler as GET, handler as POST };
