import { NextRequest, NextResponse } from 'next/server';
import { compare, hash } from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { Prisma } from '@/generated/prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, currentUser, digest } from '@/lib/auth';
import * as v from '@/lib/validation';

export const runtime = 'nodejs';
const publicUser = { id: true, name: true, username: true, role: true, mustChangePassword: true, active: true } as const;
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await ctx.params).path.join('/');
    const write = req.method !== 'GET';
    if (write && req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return fail('Origem não permitida.', 403);
    if (Number(req.headers.get('content-length') || 0) > 100_000) return fail('Requisição muito grande.', 413);
    if (path === 'setup' && req.method === 'GET') return NextResponse.json({ available: await db.institution.count() === 0 });
    if (path === 'setup' && req.method === 'POST') {
      const data = v.bootstrap.parse(await req.json());
      const expected = process.env.BOOTSTRAP_TOKEN;
      if (!expected || expected.length < 32 || !timingSafeEqual(Buffer.from(digest(data.token)), Buffer.from(digest(expected)))) return fail('Código de instalação inválido.', 403);
      const passwordHash = await hash(data.password, 12);
      const user = await db.$transaction(async tx => {
        // Serialize initial installation across concurrent requests.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(724192)::text`;
        if (await tx.institution.count()) throw new Error('SETUP_CLOSED');
        const institution = await tx.institution.create({ data: { name: data.institution, slug: data.slug } });
        return tx.user.create({ data: { institutionId: institution.id, name: data.name, username: data.username, passwordHash, role: 'ADMIN', mustChangePassword: false } });
      });
      await createSession(user.id);
      return NextResponse.json({ ok: true }, { status: 201 });
    }
    if (path === 'login' && req.method === 'POST') {
      const data = z.object({ institution: v.username, username: v.username, password: z.string().max(128).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Senha inválida.') }).parse(await req.json());
      const key = digest(`${data.institution}:${data.username}`);
      const attempt = await db.loginAttempt.upsert({ where: { key }, create: { key, count: 1, resetAt: new Date(Date.now() + 15 * 60_000) }, update: { count: { increment: 1 } } });
      if (attempt.resetAt < new Date()) await db.loginAttempt.update({ where: { key }, data: { count: 1, resetAt: new Date(Date.now() + 15 * 60_000) } });
      else if (attempt.count > 10) return fail('Muitas tentativas. Aguarde 15 minutos.', 429);
      const institution = await db.institution.findUnique({ where: { slug: data.institution } });
      const user = institution && await db.user.findUnique({ where: { institutionId_username: { institutionId: institution.id, username: data.username } } });
      const valid = await compare(data.password, user?.passwordHash ?? '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW');
      if (!user || !user.active || !valid) return fail('Instituição, usuário ou senha incorretos.', 401);
      await createSession(user.id);
      await db.loginAttempt.deleteMany({ where: { key } });
      return NextResponse.json({ ok: true });
    }
    const user = await currentUser();
    if (!user) return fail('Entre para continuar.', 401);
    const institutionId = user.institutionId;
    if (path === 'logout' && write) {
      const jar = await cookies();
      const token = jar.get('escola_session')?.value;
      if (token) await db.session.deleteMany({ where: { id: digest(token) } });
      jar.delete('escola_session');
      return NextResponse.json({ ok: true });
    }
    if (path === 'password' && req.method === 'POST') {
      const data = z.object({ current: z.string().max(128), password: v.password }).parse(await req.json());
      if (!await compare(data.current, user.passwordHash)) return fail('Senha atual incorreta.');
      if (data.current === data.password) return fail('Escolha uma senha diferente da inicial.');
      await db.$transaction([db.user.update({ where: { id: user.id }, data: { passwordHash: await hash(data.password, 12), mustChangePassword: false } }), db.session.deleteMany({ where: { userId: user.id } })]);
      await createSession(user.id);
      return NextResponse.json({ ok: true });
    }
    if (user.mustChangePassword) return fail('Troque sua senha inicial para continuar.', 403);
    const classWhere = { course: { institutionId }, ...(user.role === 'TEACHER' ? { teacherId: user.id } : user.role === 'STUDENT' ? { enrollments: { some: { studentId: user.id } } } : {}) };
    const manage = user.role !== 'STUDENT';
    if (path === 'overview' && req.method === 'GET') {
      const classes = await db.class.findMany({ where: classWhere, include: { course: true, teacher: { select: { id: true, name: true, role: true } }, enrollments: { ...(manage ? {} : { where: { studentId: user.id } }), include: { student: { select: publicUser } } } }, orderBy: { createdAt: 'desc' } });
      const users = !manage ? [] : await db.user.findMany({ where: { institutionId, ...(user.role === 'TEACHER' ? { OR: [{ id: user.id }, { role: 'STUDENT', enrollments: { some: { class: { teacherId: user.id } } } }] } : {}) }, select: publicUser, orderBy: { name: 'asc' } });
      const courses = await db.course.findMany({ where: { institutionId, ...(user.role === 'STUDENT' ? { classes: { some: classWhere } } : {}) }, orderBy: { createdAt: 'desc' } });
      const logs = user.role === 'ADMIN' ? await db.auditLog.findMany({ where: { institutionId }, orderBy: { createdAt: 'desc' }, take: 20 }) : [];
      return NextResponse.json({ classes, users, courses, logs });
    }
    if (!manage) return fail('Você não tem permissão para esta ação.', 403);
    let resourceId = '';
    if (path === 'courses' && req.method === 'POST') {
      const data = v.course.parse(await req.json());
      resourceId = (await db.course.create({ data: { ...data, institutionId } })).id;
    } else if (path === 'classes' && req.method === 'POST') {
      const data = v.classroom.parse(await req.json());
      const course = await db.course.findFirst({ where: { id: data.courseId, institutionId } });
      const teacher = await db.user.findFirst({ where: { id: data.teacherId, institutionId, role: { in: ['TEACHER', 'ADMIN'] }, active: true } });
      if (!course || !teacher || (user.role === 'TEACHER' && teacher.id !== user.id)) return fail('Curso ou professor não permitido.', 403);
      resourceId = (await db.class.create({ data })).id;
    } else if (path === 'users' && req.method === 'POST') {
      const data = v.person.extend({ classId: z.string().optional() }).parse(await req.json());
      if (user.role === 'TEACHER' && data.role !== 'STUDENT') return fail('Somente administradores cadastram professores.', 403);
      if (data.classId && !await db.class.findFirst({ where: { ...classWhere, id: data.classId } })) return fail('Turma não permitida.', 403);
      if (user.role === 'TEACHER' && !data.classId) return fail('Selecione uma turma para o aluno.');
      const passwordHash = await hash(data.password, 12);
      resourceId = (await db.user.create({ data: { name: data.name, username: data.username, role: data.role, passwordHash, institutionId, ...(data.classId && data.role === 'STUDENT' ? { enrollments: { create: { classId: data.classId } } } : {}) } })).id;
    } else if (path === 'enrollments' && req.method === 'POST') {
      const data = z.object({ classId: z.string(), studentId: z.string() }).parse(await req.json());
      const classroom = await db.class.findFirst({ where: { ...classWhere, id: data.classId } });
      const student = await db.user.findFirst({ where: { id: data.studentId, institutionId, role: 'STUDENT', ...(user.role === 'TEACHER' ? { enrollments: { some: { class: { teacherId: user.id } } } } : {}) } });
      if (!classroom || !student) return fail('Turma ou aluno não permitido.', 403);
      resourceId = (await db.enrollment.create({ data })).id;
    } else if (path === 'reset-password' && req.method === 'POST') {
      const data = z.object({ userId: z.string(), password: v.password }).parse(await req.json());
      const target = await db.user.findFirst({ where: { id: data.userId, institutionId, ...(user.role === 'TEACHER' ? { role: 'STUDENT', enrollments: { some: { class: { teacherId: user.id } } } } : {}) } });
      if (!target || target.id === user.id) return fail('Usuário não permitido.', 403);
      await db.$transaction([db.user.update({ where: { id: target.id }, data: { passwordHash: await hash(data.password, 12), mustChangePassword: true } }), db.session.deleteMany({ where: { userId: target.id } })]);
      resourceId = target.id;
    } else return fail('Operação não encontrada.', 404);
    await db.auditLog.create({ data: { institutionId, actorId: user.id, action: path, resourceId } });
    return NextResponse.json({ ok: true, id: resourceId }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return fail('JSON inválido.');
    if (error instanceof z.ZodError) return fail(error.issues[0]?.message ?? 'Dados inválidos.');
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return fail('Este cadastro já existe.', 409);
    if (error instanceof Error && error.message === 'SETUP_CLOSED') return fail('A instalação já foi concluída.', 409);
    console.error('API error', error instanceof Error ? error.name : 'unknown');
    return fail('Não foi possível concluir. Verifique a conexão e tente novamente.', 500);
  }
}
export { handler as GET, handler as POST };
