import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PDFDocument } from 'pdf-lib';
import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'escola_test' }) });
const baseURL = process.env.PLAYWRIGHT_TEST_URL || 'http://localhost:3001', slug = `notas-${randomUUID().slice(0, 8)}`, password = 'SenhaCaderneta123!';
let teacher: APIRequestContext, student: APIRequestContext, outsider: APIRequestContext, classId: string, learnerId: string, teacherId: string, pdfId: string, workId: string, objectiveId: string, manualId: string, objectiveAttemptId: string, manualAttemptId: string, missingManualId: string;
const objectiveQuestionId = randomUUID(), manualQuestionId = randomUUID(), missingQuestionId = randomUUID();
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== 'escola_test') throw new Error('Isolated test schema required.');
  const institution = await db.institution.create({ data: { name: 'Escola da caderneta', slug } }), passwordHash = await hash(password, 12);
  const professor = await db.user.create({ data: { institutionId: institution.id, username: 'professor', name: 'Professor da caderneta', role: 'TEACHER', passwordHash, mustChangePassword: false } }); teacherId = professor.id;
  const course = await db.course.create({ data: { institutionId: institution.id, name: 'Informática' } });
  classId = (await db.class.create({ data: { courseId: course.id, teacherId, name: 'Turma da caderneta' } })).id;
  learnerId = (await db.user.create({ data: { institutionId: institution.id, username: 'aluno', name: '=Aluno Teste', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId } } } })).id;
  await db.user.create({ data: { institutionId: institution.id, username: 'sem-entrega', name: 'Aluno sem entregas', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId } } } });
  await db.user.create({ data: { institutionId: institution.id, username: 'outro', name: 'Outro professor', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  [teacher, student, outsider] = await Promise.all(['professor', 'aluno', 'outro'].map(async username => { const context = await request.newContext({ baseURL }); expect((await context.post('/api/login', { data: { institution: slug, username, password } })).status()).toBe(200); return context; }));
  const lesson = await db.lesson.create({ data: { classId, title: 'Aula de novembro', scheduledAt: new Date('2026-11-25T17:00:00Z'), published: true } });
  const pdf = await PDFDocument.create(); pdf.addPage();
  const uploaded = await teacher.post(`/api/learning/lessons/${lesson.id}/documents`, { multipart: { file: { name: 'Apostila avaliada.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) } } }); expect(uploaded.status()).toBe(201); pdfId = (await uploaded.json()).id;
  workId = (await db.pdfWork.create({ data: { documentId: pdfId, studentId: learnerId, version: 2, submittedAt: new Date('2026-11-25T17:10:00Z'), feedback: { create: { teacherId, comment: 'Apostila conferida', grade: 8, createdAt: new Date('2026-11-25T17:11:00Z') } } } })).id;
  const objective = await db.assessment.create({ data: { lessonId: lesson.id, title: 'Prova objetiva', kind: 'TEST', published: true, questions: { create: { id: objectiveQuestionId, position: 0, type: 'TRUE_FALSE', prompt: 'O teclado permite digitar?', points: 2, answerKey: 'true' } } } }); objectiveId = objective.id;
  objectiveAttemptId = (await db.assessmentAttempt.create({ data: { assessmentId: objectiveId, studentId: learnerId, number: 1, submittedAt: new Date(), answers: { [objectiveQuestionId]: 'true' }, autoScores: { [objectiveQuestionId]: 0 }, version: 2 } })).id;
  await db.assessmentAttempt.create({ data: { assessmentId: objectiveId, studentId: learnerId, number: 2, answers: { [objectiveQuestionId]: 'true' } } });
  const manual = await db.assessment.create({ data: { lessonId: lesson.id, title: 'Atividade discursiva', kind: 'ACTIVITY', published: true, questions: { create: { id: manualQuestionId, position: 0, type: 'ESSAY', prompt: 'Explique sua resposta.', points: 10, answerKey: Prisma.JsonNull } } } }); manualId = manual.id;
  manualAttemptId = (await db.assessmentAttempt.create({ data: { assessmentId: manualId, studentId: learnerId, number: 1, submittedAt: new Date(), gradedAt: new Date(), answers: { [manualQuestionId]: 'Minha resposta' }, review: { [manualQuestionId]: { points: 6, feedback: 'Revisão preservada' } }, reviewedBy: teacherId, feedback: 'Bom trabalho', version: 3 } })).id;
  const pending = await db.assessment.create({ data: { lessonId: lesson.id, title: 'Atividade pendente', kind: 'ACTIVITY', published: true, questions: { create: { id: missingQuestionId, position: 0, type: 'PRACTICAL', prompt: 'Relate sua prática.', points: 10, answerKey: Prisma.JsonNull } } } });
  missingManualId = (await db.assessmentAttempt.create({ data: { assessmentId: pending.id, studentId: learnerId, number: 1, submittedAt: new Date(), answers: { [missingQuestionId]: 'Prática realizada' }, version: 1 } })).id;
});
test.afterAll(async () => { await Promise.all([teacher?.dispose(), student?.dispose(), outsider?.dispose()]); await db.$disconnect(); });

test('caderneta protege permissões e pesos, calcula médias ponderadas e exporta CSV seguro', async () => {
  const path = `/api/gradebook/${classId}`;
  expect((await student.get(path)).status()).toBe(403); expect((await outsider.get(path)).status()).toBe(404);
  expect((await student.post(path, { data: { operation: 'correct' } })).status()).toBe(403);
  expect((await teacher.post(path, { data: { operation: 'correct' }, headers: { Origin: 'https://externo.example' } })).status()).toBe(403);
  const report = await (await teacher.get(path)).json(), row = report.students.find((item: { id: string }) => item.id === learnerId);
  expect(row.average).toBe(7); expect(row.provisional).toBe(true); expect(row.pendingManual).toBe(2); expect(row.categories.PDF.average).toBe(8); expect(row.categories.ACTIVITY.average).toBe(6);
  expect(report.students.find((item: { id: string }) => item.id !== learnerId).average).toBeNull(); expect(JSON.stringify(report)).not.toMatch(/passwordHash|answerKey|"answers"|"annotations"/);
  expect((await teacher.post(path, { data: { operation: 'weights', version: 0, weights: { PDF: 0, ACTIVITY: 0, TEST: 0 } } })).status()).toBe(400);
  expect((await teacher.post(path, { data: { operation: 'weights', version: 0, weights: { PDF: -1, ACTIVITY: 3, TEST: 4 } } })).status()).toBe(400);
  expect((await teacher.post(path, { data: { operation: 'weights', version: 0, weights: { PDF: 2, ACTIVITY: 3, TEST: 5 } } })).status()).toBe(200);
  expect((await teacher.post(path, { data: { operation: 'weights', version: 0, weights: { PDF: 3, ACTIVITY: 3, TEST: 4 } } })).status()).toBe(409);
  const csv = await teacher.get(`${path}?format=csv`); expect(csv.headers()['cache-control']).toContain('private'); expect(await csv.text()).toContain('"\'=Aluno Teste"'); expect(await csv.text()).toContain('"6,80"');
  expect((await teacher.get(`${path}?student=outro-aluno&format=csv`)).status()).toBe(404);
  const foreignSlug = `fora-${randomUUID().slice(0, 8)}`;
  await db.institution.create({ data: { name: 'Outra instituição', slug: foreignSlug, users: { create: { username: 'admin', name: 'Administrador externo', role: 'ADMIN', passwordHash: await hash(password, 12), mustChangePassword: false } } } });
  const foreign = await request.newContext({ baseURL }); await foreign.post('/api/login', { data: { institution: foreignSlug, username: 'admin', password } }); expect((await foreign.get(path)).status()).toBe(404); expect((await foreign.post(path, { data: { operation: 'correct' } })).status()).toBe(404); await foreign.dispose();
  expect((await teacher.get(`${path}?from=2026-11-26&to=2026-11-25`)).status()).toBe(400);
  const filtered = await (await teacher.get(`${path}?from=2026-12-01`)).json(); expect(filtered.students[0].items).toHaveLength(0);
});

test('corrigir tudo recalcula apenas entregas, preserva revisão manual e é idempotente', async () => {
  const path = `/api/gradebook/${classId}`;
  const result = await teacher.post(path, { data: { operation: 'correct' } }); expect(result.status()).toBe(200); expect(await result.json()).toMatchObject({ checked: 3, updated: 1, completed: 2, pendingManual: 1, released: 0 });
  const objective = await db.assessmentAttempt.findUniqueOrThrow({ where: { id: objectiveAttemptId } }); expect(objective.autoScores).toEqual({ [objectiveQuestionId]: 2 }); expect(objective.gradedAt).not.toBeNull(); expect(objective.version).toBe(3);
  const manual = await db.assessmentAttempt.findUniqueOrThrow({ where: { id: manualAttemptId } }); expect(manual.review).toEqual({ [manualQuestionId]: { points: 6, feedback: 'Revisão preservada' } }); expect(manual.feedback).toBe('Bom trabalho'); expect(manual.reviewedBy).toBe(teacherId); expect(manual.version).toBe(3);
  expect((await db.assessmentAttempt.findUniqueOrThrow({ where: { id: missingManualId } })).gradedAt).toBeNull(); expect((await db.assessment.findUniqueOrThrow({ where: { id: objectiveId } })).gradesReleased).toBe(false);
  const again = await teacher.post(path, { data: { operation: 'correct' } }); expect((await again.json()).updated).toBe(0);
  const report = await (await teacher.get(path)).json(), row = report.students.find((item: { id: string }) => item.id === learnerId); expect(row.average).toBe(8.4); expect(row.provisional).toBe(true); expect(row.pendingManual).toBe(1);
  expect(await db.assessmentAttempt.count({ where: { assessment: { lesson: { classId } } } })).toBe(4);
  expect(await db.assessmentAttempt.findFirstOrThrow({ where: { assessmentId: objectiveId, number: 2 } })).toMatchObject({ submittedAt: null, gradedAt: null, version: 0, autoScores: {} });
});

test('interface permite corrigir, salvar pesos, abrir relatório, exportar e imprimir no celular', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, storageState: await teacher.storageState(), viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); await page.goto(`/turmas/${classId}?secao=grades`); await expect(page.getByRole('tab', { name: 'Caderneta', exact: true })).toHaveAttribute('aria-selected', 'true');
  const book = page.getByRole('region', { name: 'Caderneta da turma', exact: true }); await expect(book.getByText('8,40', { exact: true })).toBeVisible();
  await book.getByRole('checkbox', { name: 'Liberar também as notas corrigidas para os alunos' }).check(); page.once('dialog', dialog => dialog.accept()); await book.getByRole('button', { name: 'Corrigir tudo', exact: true }).click(); await expect(book.getByRole('status').filter({ hasText: 'tentativas conferidas' })).toBeVisible();
  expect((await db.assessment.findUniqueOrThrow({ where: { id: objectiveId } })).gradesReleased).toBe(true);
  expect((await (await student.get(`/api/assessments/attempts/${objectiveAttemptId}`)).json()).attempt.grade).toBe(2);
  expect((await (await student.get(`/api/assessments/attempts/${missingManualId}`)).json()).attempt.grade).toBeNull();
  await book.getByLabel('Peso apostila', { exact: true }).fill('3'); await book.getByLabel('Peso atividade', { exact: true }).fill('3'); await book.getByLabel('Peso prova', { exact: true }).fill('4'); await book.getByRole('button', { name: 'Salvar pesos', exact: true }).click(); await expect(book.getByText('8,20', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/caderneta-desktop.png', fullPage: true, animations: 'disabled' });
  await book.getByRole('searchbox', { name: 'Buscar aluno na caderneta' }).fill('=Aluno'); await book.getByRole('button', { name: 'Ver relatório de =Aluno Teste', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Relatório de =Aluno Teste', exact: true }); await expect(dialog).toBeVisible(); await expect(dialog).toContainText('Média parcial'); await expect(dialog.getByRole('link', { name: 'Corrigir trabalho' })).toHaveCount(1);
  const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Exportar relatório do aluno CSV' }).click(); expect((await downloaded).suggestedFilename()).toBe('caderneta-aluno.csv');
  await page.setViewportSize({ width: 390, height: 844 }); expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true); await page.screenshot({ path: 'test-results/caderneta-relatorio-mobile.png', animations: 'disabled' });
  await page.evaluate(() => { window.print = () => {}; }); await dialog.getByRole('button', { name: 'Imprimir relatório', exact: true }).click(); await page.emulateMedia({ media: 'print' }); await expect(page.locator('.gradebook-print')).toBeVisible(); await expect(page.locator('.app-shell')).toBeHidden(); await expect(page.locator('.gradebook-print')).toContainText('Apostila avaliada'); await page.screenshot({ path: 'test-results/caderneta-impressao.png', fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await page.emulateMedia({ media: 'screen' }); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: 'test-results/caderneta-mobile.png', fullPage: true, animations: 'disabled' });
  await book.locator('.gradebook-period').getByLabel('De', { exact: true }).fill('2026-12-01'); await book.getByRole('button', { name: 'Aplicar período', exact: true }).click(); await expect(book.getByText('Sem nota', { exact: true })).toBeVisible();
  await page.reload(); await expect(book.locator('.gradebook-period').getByLabel('De', { exact: true })).toHaveValue('2026-12-01');
  await book.getByRole('button', { name: 'Todo o período', exact: true }).click(); await expect(book.getByText('8,20', { exact: true })).toBeVisible();
  await context.close();
});

test('nova tentativa entregue e reentrega de apostila não reutilizam notas antigas', async () => {
  await db.assessmentAttempt.create({ data: { assessmentId: manualId, studentId: learnerId, number: 2, submittedAt: new Date(), answers: { [manualQuestionId]: 'Nova resposta' } } });
  await db.pdfWork.update({ where: { id: workId }, data: { submittedAt: new Date('2026-11-25T18:00:00Z'), version: { increment: 1 } } });
  const report = await (await teacher.get(`/api/gradebook/${classId}`)).json(), row = report.students.find((item: { id: string }) => item.id === learnerId);
  expect(row.items.find((item: { id: string }) => item.id === manualId).grade).toBeNull(); expect(row.items.find((item: { id: string }) => item.id === pdfId).grade).toBeNull(); expect(row.average).toBe(10); expect(row.provisional).toBe(true); expect(row.pendingManual).toBe(3);
  const result = await teacher.post(`/api/gradebook/${classId}`, { data: { operation: 'correct', from: '2026-12-01' } }); expect((await result.json()).checked).toBe(0);
});
