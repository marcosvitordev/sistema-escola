import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ClassAssessments } from '@/components/class-assessments';
import { StudentWorkspace } from '@/components/student-workspace';
import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export default async function ClassActivitiesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) redirect('/');
  if (user.role === 'STUDENT') {
    const classId = (await params).id;
    const classroom = await db.class.findFirst({ where: { id: classId, course: { institutionId: user.institutionId }, enrollments: { some: { studentId: user.id } } }, select: { id: true } });
    if (!classroom) notFound();
    return <StudentWorkspace user={{ id: user.id, name: user.name, institution: user.institution.name, mustChangePassword: false }} initialArea="atividades" initialClassId={classId} />;
  }
  return <ClassAssessments classId={(await params).id} preferredLesson={(await searchParams).nova} />;
}
