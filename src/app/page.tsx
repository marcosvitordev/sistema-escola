import { currentUser } from '@/lib/auth';
import { Workspace } from '@/components/workspace';
import { Access } from '@/components/access';
import { StudentWorkspace } from '@/components/student-workspace';
import type { StudentArea } from '@/lib/student-home-types';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }: { searchParams: Promise<{ area?: string; turma?: string }> }) {
  const user = await currentUser();
  if (user?.role === 'STUDENT') {
    const query = await searchParams;
    const initialArea = ['apostilas', 'atividades', 'correcoes'].includes(query.area || '') ? query.area as StudentArea : 'inicio';
    return <StudentWorkspace user={{ id: user.id, name: user.name, institution: user.institution.name, mustChangePassword: user.mustChangePassword }} initialArea={initialArea} initialClassId={query.turma} />;
  }
  return user ? <Workspace user={{ id: user.id, name: user.name, role: user.role, institution: user.institution.name, mustChangePassword: user.mustChangePassword }} /> : <Access />;
}
