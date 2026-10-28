import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { allowedRequestOrigin } from '@/lib/request-origin';
import { closeLiveRoom, expireLiveSessions, LIVE_IDLE_MS, liveConfigured, liveServer, liveToken } from '@/lib/live';
export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function handler(req: NextRequest, context: { params: Promise<{ id: string; action: string[] }> }) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Entre para continuar.' }, 401);
    if (user.mustChangePassword) return json({ error: 'Troque sua senha inicial.' }, 403);
    if (req.method !== 'GET' && !allowedRequestOrigin(req)) return json({ error: 'Origem não permitida.' }, 403);
    if (Number(req.headers.get('content-length') || 0) > 4000) return json({ error: 'Pedido muito grande.' }, 413);
    const { id: classId, action: parts } = await context.params;
    const action = parts.join('/'), manage = user.role !== 'STUDENT';
    const classroom = await db.class.findFirst({ where: { id: classId, course: { institutionId: user.institutionId }, ...(user.role === 'TEACHER' ? { teacherId: user.id } : !manage ? { enrollments: { some: { studentId: user.id } } } : {}) }, select: { id: true, name: true } });
    if (!classroom) return json({ error: 'Turma não encontrada.' }, 404);
    if (['start', 'end', 'heartbeat'].includes(action) && !manage) return json({ error: 'Somente o professor responsável ou administrador pode transmitir.' }, 403);
    if (action === 'status' && req.method === 'GET') {
      await expireLiveSessions(classId);
      const live = await db.liveSession.findFirst({ where: { classId, endedAt: null }, select: { id: true, startedAt: true, host: { select: { name: true } } } });
      return json({ classroom, manage, configured: liveConfigured(), live });
    }
    if (!liveConfigured()) return json({ error: 'A transmissão ao vivo ainda não está configurada.' }, 503);
    if (action === 'start' && req.method === 'POST' && manage) {
      await expireLiveSessions(classId);
      const session = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`live:${classId}`}, 0))::text`;
        if (await tx.liveSession.findFirst({ where: { classId, endedAt: null } })) return null;
        return tx.liveSession.create({ data: { classId, hostId: user.id, roomName: `aprender-${randomUUID()}` } });
      });
      if (!session) return json({ error: 'Já existe uma aula ao vivo. Encerre a transmissão atual antes de iniciar outra.' }, 409);
      try {
        await liveServer().createRoom({ name: session.roomName, emptyTimeout: 60, departureTimeout: 20, maxParticipants: 64 });
        await db.auditLog.create({ data: { institutionId: user.institutionId, actorId: user.id, action: 'live-started', resourceId: session.id } });
        return json({ id: session.id, ...await liveToken(session, user, true) }, 201);
      } catch {
        await db.liveSession.update({ where: { id: session.id }, data: { endedAt: new Date() } });
        await closeLiveRoom(session.roomName).catch(() => {});
        return json({ error: 'Não foi possível iniciar a transmissão. Tente novamente.' }, 503);
      }
    }
    if (req.method !== 'POST') return json({ error: 'Operação não permitida.' }, 403);
    const data = z.object({ id: z.string().uuid() }).parse(await req.json());
    const session = await db.liveSession.findFirst({ where: { id: data.id, classId } });
    if (!session) return json({ error: 'Transmissão não encontrada.' }, 404);
    if (action === 'end' && manage) {
      await closeLiveRoom(session.roomName);
      await db.$transaction(async tx => {
        const changed = await tx.liveSession.updateMany({ where: { id: session.id, endedAt: null }, data: { endedAt: new Date() } });
        if (changed.count) await tx.auditLog.create({ data: { institutionId: user.institutionId, actorId: user.id, action: 'live-ended', resourceId: session.id } });
      });
      return json({ ok: true });
    }
    if (session.endedAt || session.lastSeenAt.getTime() < Date.now() - LIVE_IDLE_MS) return json({ error: 'Esta transmissão foi encerrada.' }, 409);
    if (action === 'join') return json({ id: session.id, ...await liveToken(session, user, false) });
    if (action === 'heartbeat' && manage && session.hostId === user.id) {
      const updated = await db.liveSession.updateMany({ where: { id: session.id, endedAt: null }, data: { lastSeenAt: new Date() } });
      return updated.count ? json({ ok: true }) : json({ error: 'Transmissão encerrada.' }, 409);
    }
    return json({ error: 'Operação não permitida.' }, 403);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: 'Confira os dados enviados.' }, 400);
    console.error('Live API:', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'Não foi possível acessar a aula ao vivo. Tente novamente.' }, 503);
  }
}
export { handler as GET, handler as POST };
