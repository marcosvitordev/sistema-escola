import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export async function GET() {
  const user = await currentUser();
  const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!user) return response({ error: 'Entre para acessar seus materiais.' }, 401);
  if (user.role !== 'STUDENT' || user.mustChangePassword) return response({ error: 'Acesso não permitido.' }, 403);
  try {
    const classes = await db.class.findMany({
      where: { course: { institutionId: user.institutionId }, enrollments: { some: { studentId: user.id } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, course: { select: { name: true } }, teacher: { select: { name: true } },
        lessons: {
          where: { published: true }, orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
          select: {
            title: true, module: true,
            documents: {
              orderBy: { createdAt: 'desc' },
              select: { id: true, title: true, pageCount: true, createdAt: true, works: { where: { studentId: user.id }, select: { version: true, updatedAt: true, submittedAt: true, feedback: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, grade: true, createdAt: true } } } } },
            },
            assessments: {
              where: { published: true }, orderBy: { createdAt: 'desc' },
              select: { id: true, title: true, kind: true, dueAt: true, maxAttempts: true, gradesReleased: true, _count: { select: { questions: true } }, attempts: { where: { studentId: user.id }, orderBy: { number: 'desc' }, select: { id: true, number: true, submittedAt: true, gradedAt: true, updatedAt: true } } },
            },
          },
        },
      },
    });
    return response({
      classes: classes.map(c => ({ id: c.id, name: c.name, course: c.course.name, teacher: c.teacher.name })),
      materials: classes.flatMap(c => c.lessons.flatMap(lesson => lesson.documents.map(({ works, ...document }) => ({ ...document, classId: c.id, lessonTitle: lesson.title, module: lesson.module, work: works[0] ? { ...works[0], feedback: works[0].feedback[0] ?? null } : null })))),
      assessments: classes.flatMap(c => c.lessons.flatMap(lesson => lesson.assessments.map(({ _count, ...assessment }) => ({ ...assessment, classId: c.id, lessonTitle: lesson.title, questionCount: _count.questions })))),
    });
  } catch (error) {
    console.error('Student home', error instanceof Error ? error.name : 'unknown');
    return response({ error: 'Não foi possível carregar seus materiais. Tente atualizar a página.' }, 500);
  }
}
