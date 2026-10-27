import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { AssessmentPage } from '@/components/assessment-page';
export const dynamic = 'force-dynamic';
export default async function ActivityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tentativa?: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) redirect('/');
  return <AssessmentPage id={(await params).id} initialAttemptId={(await searchParams).tentativa} />;
}
