import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { studentGrades } from '@/lib/student-grades';
export const runtime = 'nodejs';
export async function GET() {
  const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
  const user = await currentUser();
  if (!user) return response({ error: 'Entre para consultar suas notas.' }, 401);
  if (user.role !== 'STUDENT' || user.mustChangePassword) return response({ error: 'Acesso não permitido.' }, 403);
  try { return response(await studentGrades(user)); }
  catch (error) { console.error('Student grades', error instanceof Error ? error.name : 'unknown'); return response({ error: 'Não foi possível carregar suas notas. Tente atualizar.' }, 500); }
}
