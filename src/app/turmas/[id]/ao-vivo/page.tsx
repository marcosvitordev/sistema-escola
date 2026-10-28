import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { LiveClassroom } from '@/components/live-classroom';
export const dynamic = 'force-dynamic';
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) redirect('/');
  const { id } = await params;
  const manage = user.role !== 'STUDENT';
  const classroom = await db.class.findFirst({ where: { id, course: { institutionId: user.institutionId }, ...(user.role === 'TEACHER' ? { teacherId: user.id } : !manage ? { enrollments: { some: { studentId: user.id } } } : {}) }, select: { id: true, name: true } });
  if (!classroom) notFound();
  return <LiveClassroom key={id} classId={id} name={classroom.name} manage={manage} />;
}
