import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { ClassPage } from '@/components/class-page';

export const dynamic = 'force-dynamic';
export default async function ClassroomPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) redirect('/');
  if (user.role === 'STUDENT') notFound();
  const { id } = await params;
  const person = { id: true, name: true, username: true, role: true } as const;
  const [classroom, students] = await Promise.all([
    db.class.findFirst({ where: { id, course: { institutionId: user.institutionId }, ...(user.role === 'TEACHER' ? { teacherId: user.id } : {}) }, select: { id: true, name: true, course: { select: { name: true, description: true } }, teacher: { select: { name: true } }, enrollments: { select: { id: true, student: { select: person } } } } }),
    db.user.findMany({ where: { institutionId: user.institutionId, role: 'STUDENT', ...(user.role === 'TEACHER' ? { enrollments: { some: { class: { teacherId: user.id } } } } : {}) }, select: person, orderBy: { name: 'asc' } }),
  ]);
  if (!classroom) notFound();
  return <ClassPage key={classroom.id} initialClassroom={classroom} initialStudents={students} />;
}
