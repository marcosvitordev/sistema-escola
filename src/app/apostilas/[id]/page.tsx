import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { PdfEditor } from '@/components/pdf-editor';
export const dynamic = 'force-dynamic';
export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aluno?: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) redirect('/');
  return <PdfEditor documentId={(await params).id} studentId={(await searchParams).aluno} manage={user.role !== 'STUDENT'} />;
}
