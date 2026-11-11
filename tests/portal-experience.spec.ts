import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PDFDocument } from 'pdf-lib';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'escola_test' }) });
const slug = `portal-${randomUUID().slice(0, 8)}`, password = 'SenhaPortal123!';
let teacher: APIRequestContext, student: APIRequestContext;
let classId: string;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== 'escola_test') throw new Error('Isolated test schema required.');
  const institution = await db.institution.create({ data: { name: 'Escola de aprendizagem', slug } });
  const passwordHash = await hash(password, 12);
  const professor = await db.user.create({ data: { institutionId: institution.id, name: 'Marcos Professor', username: 'professor', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  const course = await db.course.create({ data: { institutionId: institution.id, name: 'Informática' } });
  const classroom = await db.class.create({ data: { courseId: course.id, teacherId: professor.id, name: 'Informática — Turma A' } }); classId = classroom.id;
  await db.user.create({ data: { institutionId: institution.id, name: 'Ana Aluna', username: 'aluno', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId } } } });
  await db.user.create({ data: { institutionId: institution.id, name: 'Bruno Aluno', username: 'bruno', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId } } } });
  [teacher, student] = await Promise.all(['professor', 'aluno'].map(async username => {
    const context = await request.newContext({ baseURL: 'http://localhost:3001' });
    expect((await context.post('/api/login', { data: { institution: slug, username, password } })).status()).toBe(200); return context;
  }));
  const pdf = await PDFDocument.create(); pdf.addPage();
  for (const [title, date] of [['Primeiros passos', '2026-10-31T16:00:00Z'], ['Editor de textos', '2026-11-10T16:00:00Z']]) {
    const lesson = await db.lesson.create({ data: { classId, title, scheduledAt: new Date(date), published: true } });
    expect((await teacher.post(`/api/learning/lessons/${lesson.id}/documents`, { multipart: { file: { name: `${title}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) } } })).status()).toBe(201);
    await db.assessment.create({ data: { lessonId: lesson.id, title: `Atividade: ${title}`, kind: 'ACTIVITY', published: true, dueAt: new Date(date) } });
  }
});
test.afterAll(async () => { await Promise.all([teacher?.dispose(), student?.dispose()]); await db.$disconnect(); });

test('turma usa sidebar principal e acompanhamento abre em janela pesquisável', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:3001', storageState: await teacher.storageState(), viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); await page.goto('/?painel=classes');
  await page.getByRole('link', { name: 'Abrir turma', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/turmas/${classId}`));
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.sidebar a[aria-current=page]')).toHaveText('Turmas');
  await expect(page.locator('.class-drawer')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/portal-turma-desktop.png', fullPage: true });
  await page.getByRole('tab', { name: 'Aulas e apostilas', exact: true }).click();
  await page.locator('.lesson-card summary').first().click();
  await page.getByRole('button', { name: 'Acompanhar', exact: true }).first().click();
  const popup = page.getByRole('dialog'); await expect(popup).toBeVisible();
  await expect(popup.getByText('Ana Aluna', { exact: true })).toBeVisible();
  await popup.getByRole('searchbox').fill('Ana');
  await expect(popup.getByText('Bruno Aluno', { exact: true })).toHaveCount(0);
  await popup.getByRole('searchbox').fill('');
  await popup.getByRole('button', { name: /^Entregues/ }).click();
  await expect(popup.getByText('Nenhum aluno encontrado')).toBeVisible();
  await popup.getByRole('button', { name: /^Todos/ }).click();
  await page.screenshot({ path: 'test-results/portal-monitor-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/portal-monitor-mobile.png', fullPage: true });
  expect(await popup.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('tab', { name: 'Aulas e apostilas', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/portal-turma-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('aluno encontra apostilas e avaliações por mês e data, com filtros persistentes', async ({ browser }) => {
  const payload = await (await student.get('/api/student/home')).json();
  expect(payload.materials.every((item: { scheduledAt: string }) => item.scheduledAt)).toBe(true);
  expect(JSON.stringify(payload)).not.toContain('passwordHash');
  const context = await browser.newContext({ baseURL: 'http://localhost:3001', storageState: await student.storageState(), viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); await page.goto('/?area=apostilas');
  await expect(page.locator('.student-date-group')).toHaveCount(2);
  await expect(page.locator('.student-date-group').first()).toContainText('Editor de textos');
  await page.screenshot({ path: 'test-results/portal-aluno-desktop.png', fullPage: true });
  await page.getByLabel('Ordenar', { exact: true }).selectOption('antigas');
  await expect(page.locator('.student-date-group').first()).toContainText('Primeiros passos');
  await page.getByLabel('Filtrar por mês').selectOption('2026-10');
  await expect(page.locator('.student-resource')).toHaveCount(1);
  await page.reload(); await expect(page.getByLabel('Filtrar por mês')).toHaveValue('2026-10');
  await expect(page.locator('.student-resource')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros e busca' }).click();
  await page.getByRole('textbox', { name: 'Buscar apostila ou aula' }).fill('Editor');
  await expect(page.locator('.student-resource')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros e busca' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/portal-aluno-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/?area=atividades'); await expect(page.locator('.student-date-group')).toHaveCount(2);
  await page.getByLabel('Filtrar por mês').selectOption('2026-11');
  await expect(page.locator('.student-resource')).toHaveCount(1);
  await expect(page.locator('.student-resource')).toContainText('Atividade: Editor de textos');
  await page.screenshot({ path: 'test-results/portal-avaliacoes-mobile.png', fullPage: true });
  await context.close();
});
