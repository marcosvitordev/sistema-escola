import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PDFDocument } from 'pdf-lib';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'escola_test' }) });
const baseURL = process.env.PLAYWRIGHT_TEST_URL || 'http://localhost:3001', password = 'SenhaNotasAluno123!', slug = `minhas-notas-${randomUUID().slice(0, 8)}`;
let teacher: APIRequestContext, student: APIRequestContext, other: APIRequestContext;
let classId: string, zeroClassId: string, studentId: string, activityId: string, testId: string, workId: string, pdfId: string;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== 'escola_test') throw new Error('Isolated test schema required.');
  const institution = await db.institution.create({ data: { name: 'Escola das médias', slug } }), passwordHash = await hash(password, 12);
  const host = await db.user.create({ data: { institutionId: institution.id, name: 'Professor', username: 'professor', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  const course = await db.course.create({ data: { institutionId: institution.id, name: 'Informática' } });
  classId = (await db.class.create({ data: { courseId: course.id, teacherId: host.id, name: 'Minha turma principal' } })).id;
  zeroClassId = (await db.class.create({ data: { courseId: course.id, teacherId: host.id, name: 'Minha turma com nota zero', pdfWeight: 5, activityWeight: 0, testWeight: 0 } })).id;
  const privateClass = await db.class.create({ data: { courseId: course.id, teacherId: host.id, name: 'Turma privada de outro aluno' } });
  studentId = (await db.user.create({ data: { institutionId: institution.id, username: 'aluno', name: 'Aluno das notas', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: [{ classId }, { classId: zeroClassId }] } } })).id;
  await db.user.create({ data: { institutionId: institution.id, username: 'outro', name: 'Outro aluno privado', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: [{ classId }, { classId: privateClass.id }] } } });
  const lesson = await db.lesson.create({ data: { classId, title: 'Aula de informática', published: true } });
  const zeroLesson = await db.lesson.create({ data: { classId: zeroClassId, title: 'Aula com nota zero', published: true } });
  const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save());
  for (const [target, grade] of [[lesson.id, 8], [zeroLesson.id, 0]] as const) {
    const document = await db.pdfDocument.create({ data: { lessonId: target, title: grade === 8 ? 'Apostila com nota oito.pdf' : 'Apostila com nota zero.pdf', pageCount: 1, content: bytes, sha256: randomUUID() } });
    const work = await db.pdfWork.create({ data: { documentId: document.id, studentId, version: 2, submittedAt: new Date('2026-11-26T16:00:00Z'), feedback: { create: { teacherId: host.id, grade, comment: 'Correção da apostila', createdAt: new Date('2026-11-26T16:01:00Z') } } } }); if (grade === 8) { pdfId = document.id; workId = work.id; }
  }
  for (const [title, kind, points, released, published] of [['Atividade com nota oculta', 'ACTIVITY', 6, false, true], ['Prova com nota oculta', 'TEST', 10, false, true], ['Título retirado de publicação', 'ACTIVITY', 7, true, false]] as const) {
    const qid = randomUUID(), item = await db.assessment.create({ data: { lessonId: lesson.id, title, kind, published, gradesReleased: released, questions: { create: { id: qid, position: 0, type: 'ESSAY', prompt: 'Explique sua resposta.', points: 10, answerKey: Prisma.JsonNull } } } });
    await db.assessmentAttempt.create({ data: { assessmentId: item.id, studentId, number: 1, submittedAt: new Date(), gradedAt: new Date(), review: { [qid]: { points, feedback: 'Comentário interno que aguarda liberação' } }, feedback: 'Feedback interno' } });
    if (kind === 'TEST') testId = item.id; else if (published) activityId = item.id;
  }
  const pending = await db.assessment.create({ data: { lessonId: lesson.id, title: 'Atividade aguardando correção', kind: 'ACTIVITY', published: true } }); await db.assessmentAttempt.create({ data: { assessmentId: pending.id, studentId, number: 1, submittedAt: new Date() } });
  [teacher, student, other] = await Promise.all(['professor', 'aluno', 'outro'].map(async username => { const context = await request.newContext({ baseURL }); expect((await context.post('/api/login', { data: { institution: slug, username, password } })).status()).toBe(200); return context; }));
});
test.afterAll(async () => { await Promise.all([teacher?.dispose(), student?.dispose(), other?.dispose()]); await db.$disconnect(); });

test('aluno recebe somente suas notas liberadas e médias sem revelar dados internos ou outras turmas', async () => {
  const anonymous = await request.newContext({ baseURL }); expect((await anonymous.get('/api/student/grades')).status()).toBe(401); await anonymous.dispose();
  expect((await teacher.get('/api/student/grades')).status()).toBe(403);
  const response = await student.get('/api/student/grades'); expect(response.headers()['cache-control']).toContain('private');
  const data = await response.json(); expect(data.classes).toHaveLength(2); const main = data.classes.find((item: { classId: string }) => item.classId === classId);
  expect(main).toMatchObject({ average: 8, provisional: true, awaitingRelease: 2, awaitingCorrection: 1, categories: { PDF: { average: 8 }, ACTIVITY: { average: null }, TEST: { average: null } } });
  expect(main.items.find((item: { id: string }) => item.id === activityId)).toMatchObject({ grade: null, status: 'awaiting-release' }); expect(main.items.find((item: { id: string }) => item.id === testId)).toMatchObject({ grade: null, status: 'awaiting-release' });
  expect(data.classes.find((item: { classId: string }) => item.classId === zeroClassId)).toMatchObject({ average: 0, provisional: false });
  expect(JSON.stringify(data)).not.toMatch(/Outro aluno privado|Turma privada|Título retirado|Feedback interno|Comentário interno|answerKey|autoScores|"review"|passwordHash|"annotations"|\?aluno=/);
  const otherData = await (await other.get(`/api/student/grades?studentId=${studentId}&classId=${zeroClassId}`)).json(); expect(otherData.classes.some((item: { classId: string }) => item.classId === zeroClassId)).toBe(false); expect(otherData.classes.every((item: { average: number | null }) => item.average === null)).toBe(true);
  expect((await student.get(`/api/gradebook/${classId}`)).status()).toBe(403);
});

test('Meu início exibe médias por turma, atualiza após liberação e abre notas no celular', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, storageState: await student.storageState(), viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); await page.goto('/'); const grades = page.getByRole('region', { name: 'Minhas médias e notas', exact: true }); await expect(grades.locator('.student-grade-card')).toHaveCount(2);
  const card = grades.locator('.student-grade-card').filter({ has: page.getByRole('heading', { name: 'Minha turma principal', exact: true }) }); await expect(card.locator('.student-grade-overall')).toContainText('8,00'); await expect(card).toContainText('Média parcial');
  await card.getByRole('button', { name: 'Ver minhas notas', exact: true }).click(); let dialog = page.getByRole('dialog', { name: 'Minhas notas de Minha turma principal', exact: true }); await expect(dialog.getByText('Aguardando liberação', { exact: true })).toHaveCount(2); await expect(dialog.getByText('6,00', { exact: false })).toHaveCount(0); await page.keyboard.press('Escape');
  for (const id of [activityId, testId]) expect((await teacher.post(`/api/assessments/items/${id}/settings`, { data: { revision: 0, gradesReleased: true } })).status()).toBe(200);
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click(); await expect(card.locator('.student-grade-overall')).toContainText('8,20'); await expect(card.locator('.student-grade-categories')).toContainText('6,00'); await expect(card.locator('.student-grade-categories')).toContainText('10,00');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/aluno-medias-desktop.png', fullPage: true, animations: 'disabled' });
  await page.locator('.student-class-filter select').selectOption(classId); await expect(grades.locator('.student-grade-card')).toHaveCount(1); await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/aluno-medias-mobile.png', fullPage: true, animations: 'disabled' });
  await card.getByRole('button', { name: 'Ver minhas notas', exact: true }).click(); dialog = page.getByRole('dialog', { name: 'Minhas notas de Minha turma principal', exact: true }); await expect(dialog).toContainText('8,20'); await expect(dialog.getByRole('link', { name: 'Ver correção', exact: true })).toHaveCount(3); expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true); await page.screenshot({ path: 'test-results/aluno-lista-notas-mobile.png', animations: 'disabled' }); await page.keyboard.press('Escape');
  await page.locator('.student-class-filter select').selectOption(zeroClassId); const zero = grades.locator('.student-grade-card'); await expect(zero.locator('.student-grade-overall')).toContainText('0,00'); await expect(zero.locator('.student-grade-overall')).not.toContainText('Aguardando notas');
  await context.close();
});

test('reentrega e nova tentativa voltam a aguardar correção e notas ocultadas saem da média', async () => {
  await db.pdfWork.update({ where: { id: workId }, data: { submittedAt: new Date('2026-11-26T17:00:00Z'), version: { increment: 1 } } });
  let main = (await (await student.get('/api/student/grades')).json()).classes.find((item: { classId: string }) => item.classId === classId);
  expect(main.average).toBe(8.29); expect(main.items.find((item: { id: string }) => item.id === pdfId)).toMatchObject({ grade: null, status: 'awaiting-correction' });
  await db.assessmentAttempt.create({ data: { assessmentId: testId, studentId, number: 2, submittedAt: new Date() } });
  main = (await (await student.get('/api/student/grades')).json()).classes.find((item: { classId: string }) => item.classId === classId); expect(main.average).toBe(6); expect(main.items.find((item: { id: string }) => item.id === testId).grade).toBeNull();
  expect((await teacher.post(`/api/assessments/items/${activityId}/settings`, { data: { revision: 1, gradesReleased: false } })).status()).toBe(200);
  main = (await (await student.get('/api/student/grades')).json()).classes.find((item: { classId: string }) => item.classId === classId); expect(main.average).toBeNull(); expect(main.categories.ACTIVITY.average).toBeNull();
});
