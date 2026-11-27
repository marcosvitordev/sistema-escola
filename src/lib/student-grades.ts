import { db } from './db';
import { classGradebook } from './gradebook-data';
import { summarizeStudent } from './gradebook';
import type { StudentClassGrades, StudentGradesResponse } from './student-grades-types';

export async function studentGrades(user: { id: string; institutionId: string }): Promise<StudentGradesResponse> {
  const classes = await db.class.findMany({ where: { course: { institutionId: user.institutionId }, enrollments: { some: { studentId: user.id } } }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, pdfWeight: true, activityWeight: true, testWeight: true, gradeWeightsVersion: true, course: { select: { name: true } }, teacher: { select: { name: true } }, enrollments: { where: { studentId: user.id }, select: { student: { select: { id: true, name: true, username: true } } } } } });
  const grades = await Promise.all(classes.map(async classroom => {
    // Query only this student's work; teacher reports remain restricted to managers.
    const report = await classGradebook(classroom, {}), own = report.students[0];
    const published = own.items.filter(item => item.published);
    // Mask unreleased marks before calculating any public totals or averages.
    const visible = published.map(item => ({ ...item, grade: item.released ? item.grade : null, state: !item.released && item.grade !== null ? 'manual' as const : item.state, note: '' }));
    const summary = summarizeStudent({ id: user.id, name: '', username: '' }, visible, report.weights);
    return {
      classId: classroom.id, name: classroom.name, course: classroom.course.name, weights: report.weights, average: summary.average, provisional: summary.provisional, categories: summary.categories, graded: summary.graded, total: visible.length,
      awaitingRelease: published.filter(item => !item.released && item.grade !== null).length,
      awaitingCorrection: published.filter(item => item.state === 'manual' && item.grade === null).length,
      items: published.map(item => ({ id: item.id, kind: item.kind, title: item.title, lesson: item.lesson, date: item.date, grade: item.released ? item.grade : null, status: !item.released && item.grade !== null ? 'awaiting-release' : item.state === 'manual' ? 'awaiting-correction' : item.state, href: item.kind === 'PDF' ? `/apostilas/${item.id}${item.released ? '#correcao' : ''}` : item.href })),
    } satisfies StudentClassGrades;
  }));
  return { classes: grades, generatedAt: new Date().toISOString() };
}
