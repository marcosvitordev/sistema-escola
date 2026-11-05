import { currentUser } from '@/lib/auth';
import { Workspace } from '@/components/workspace';
import { Access } from '@/components/access';
import { StudentWorkspace } from '@/components/student-workspace';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await currentUser();
  if (user?.role === 'STUDENT') {
    return <StudentWorkspace user={{ id: user.id, name: user.name, institution: user.institution.name, mustChangePassword: user.mustChangePassword }} />;
  }
  return user ? <Workspace user={{ id: user.id, name: user.name, role: user.role, institution: user.institution.name, mustChangePassword: user.mustChangePassword }} /> : <Access />;
}
