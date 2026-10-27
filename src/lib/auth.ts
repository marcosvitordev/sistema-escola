import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export async function currentUser() {
  const token = (await cookies()).get('escola_session')?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: digest(token) }, include: { user: { include: { institution: true } } } });
  return session && session.expiresAt > new Date() && session.user.active ? session.user : null;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await db.session.create({ data: { id: digest(token), userId, expiresAt } });
  (await cookies()).set('escola_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: expiresAt, path: '/' });
}
