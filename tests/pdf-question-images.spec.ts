import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PDFDocument } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'escola_test' }) });
const baseURL = process.env.PLAYWRIGHT_TEST_URL || 'http://localhost:3001';
const slug = `imagens-pdf-${randomUUID().slice(0, 8)}`, password = 'SenhaImagens123!';
let teacher: APIRequestContext, student: APIRequestContext, outsider: APIRequestContext;
let documentId: string, assessmentId: string, questionIds: string[], images: { id: string }[];
const canvas = createCanvas(640, 220), drawing = canvas.getContext('2d');
drawing.fillStyle = '#edf6f2'; drawing.fillRect(0, 0, 640, 220); drawing.fillStyle = '#20594d'; drawing.font = 'bold 30px sans-serif'; drawing.fillText('Identifique o dispositivo', 30, 50);
drawing.fillStyle = '#ffffff'; drawing.fillRect(35, 80, 570, 105); drawing.fillStyle = '#20594d'; drawing.font = 'bold 24px sans-serif'; drawing.fillText('Q W E R T Y U I O P', 65, 120); drawing.fillText('A S D F G H J K L', 85, 160);
const png = canvas.toBuffer('image/png'), jpeg = canvas.toBuffer('image/jpeg');
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== 'escola_test') throw new Error('Isolated test schema required.');
  const institution = await db.institution.create({ data: { name: 'Escola das imagens', slug } });
  const passwordHash = await hash(password, 12);
  const host = await db.user.create({ data: { institutionId: institution.id, name: 'Professor das imagens', username: 'professor', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  const course = await db.course.create({ data: { institutionId: institution.id, name: 'Informática' } });
  const classroom = await db.class.create({ data: { courseId: course.id, teacherId: host.id, name: 'Turma imagens' } });
  await db.user.create({ data: { institutionId: institution.id, name: 'Aluno imagens', username: 'aluno', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId: classroom.id } } } });
  await db.user.create({ data: { institutionId: institution.id, name: 'Outro professor', username: 'outro', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  [teacher, student, outsider] = await Promise.all(['professor', 'aluno', 'outro'].map(async username => { const context = await request.newContext({ baseURL }); expect((await context.post('/api/login', { data: { institution: slug, username, password } })).status()).toBe(200); return context; }));
  const lesson = await db.lesson.create({ data: { classId: classroom.id, title: 'Aula com imagens', published: true } });
  const pdf = await PDFDocument.create(); pdf.addPage();
  const upload = await teacher.post(`/api/learning/lessons/${lesson.id}/documents`, { multipart: { file: { name: 'Apostila ilustrada.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) } } }); expect(upload.status()).toBe(201); documentId = (await upload.json()).id;
  const imported = await teacher.post(`/api/assessments/documents/${documentId}/import-json`, { data: { source: { titulo: 'Questões ilustradas', questoes: [{ tipo: 'verdadeiro_falso', enunciado: 'O dispositivo da imagem permite digitar.', resposta_correta: true }, { tipo: 'resposta_curta', enunciado: 'Qual o nome deste dispositivo?', respostas_aceitas: ['teclado'] }] } } }); expect(imported.status()).toBe(201); assessmentId = (await imported.json()).id;
  questionIds = (await (await teacher.get(`/api/assessments/items/${assessmentId}`)).json()).assessment.questions.map((question: { id: string }) => question.id);
});
test.afterAll(async () => { await Promise.all([teacher?.dispose(), student?.dispose(), outsider?.dispose()]); await db.$disconnect(); });

test('professor seleciona a questão e envia PNG/JPEG com prévia sem substituir imagens anteriores', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, storageState: await teacher.storageState(), viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); await page.goto(`/apostilas/${documentId}#questoes`);
  const panel = page.getByRole('region', { name: 'Imagens das questões', exact: true }); await expect(panel).toBeVisible();
  const input = panel.getByLabel('Selecionar imagem da questão', { exact: true });
  await input.setInputFiles({ name: 'invalida.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') }); await expect(panel.getByRole('alert')).toContainText('PNG ou JPEG');
  await input.setInputFiles({ name: 'teclado.png', mimeType: 'image/png', buffer: png }); await expect(panel.getByRole('img', { name: 'Prévia da imagem a enviar' })).toBeVisible();
  await panel.getByRole('button', { name: 'Adicionar imagem à questão' }).click(); await expect(panel.getByRole('status')).toHaveText('Imagem adicionada à questão 1.');
  await input.setInputFiles({ name: 'teclado-ampliado.jpg', mimeType: 'image/jpeg', buffer: jpeg }); await panel.getByRole('button', { name: 'Adicionar imagem à questão' }).click();
  await expect(panel.locator('.question-image')).toHaveCount(2);
  await panel.getByLabel('Questão que receberá a imagem', { exact: true }).selectOption(questionIds[1]); await expect(panel.locator('.question-image')).toHaveCount(0);
  await input.setInputFiles({ name: 'dispositivo.png', mimeType: 'image/png', buffer: png }); await panel.getByRole('button', { name: 'Cancelar envio' }).click(); await expect(panel.getByRole('img', { name: 'Prévia da imagem a enviar' })).toHaveCount(0);
  await input.setInputFiles({ name: 'dispositivo.png', mimeType: 'image/png', buffer: png }); await panel.getByRole('button', { name: 'Adicionar imagem à questão' }).click(); await expect(panel.getByRole('status')).toHaveText('Imagem adicionada à questão 2.');
  const previous = (await (await teacher.get(`/api/assessments/items/${assessmentId}`)).json()).assessment.questions[1].images[0].id;
  await input.setInputFiles({ name: 'dispositivo-revisado.png', mimeType: 'image/png', buffer: png }); await panel.getByRole('checkbox', { name: 'Substituir todas as imagens desta questão' }).check();
  page.once('dialog', dialog => dialog.dismiss()); await panel.getByRole('button', { name: 'Substituir imagens da questão' }).click(); expect((await teacher.get(`/api/assessments/files/${previous}`)).status()).toBe(200);
  page.once('dialog', dialog => dialog.accept()); await panel.getByRole('button', { name: 'Substituir imagens da questão' }).click(); await expect(panel.getByRole('status')).toHaveText('Imagem substituída na questão 2.'); expect((await teacher.get(`/api/assessments/files/${previous}`)).status()).toBe(404);
  const saved = (await (await teacher.get(`/api/assessments/items/${assessmentId}`)).json()).assessment.questions;
  expect(saved[0].images).toHaveLength(2); expect(saved[1].images).toHaveLength(1); expect(saved[0].imageId).toBe(saved[0].images[0].id); images = saved.flatMap((question: { images: { id: string }[] }) => question.images);
  expect((await student.get(`/api/assessments/files/${images[0].id}`)).status()).toBe(404);
  expect((await outsider.get(`/api/assessments/files/${images[0].id}`)).status()).toBe(404);
  await page.reload(); await expect(panel.locator('.question-image')).toHaveCount(2); await panel.scrollIntoViewIfNeeded(); await panel.screenshot({ path: 'test-results/imagens-questoes-professor.png' });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await panel.screenshot({ path: 'test-results/imagens-questoes-professor-mobile.png' });
  await context.close();
});

test('aluno vê as imagens nas questões abaixo do PDF e tentativas iniciadas protegem alterações', async ({ browser }) => {
  const path = `/api/assessments/items/${assessmentId}`;
  const meta = await (await teacher.get(path)).json(); expect((await teacher.post(`${path}/settings`, { data: { revision: meta.assessment.revision, published: true } })).status()).toBe(200);
  for (const image of images) { const file = await student.get(`/api/assessments/files/${image.id}`); expect(file.status()).toBe(200); expect(file.headers()['cache-control']).toContain('private'); }
  const context = await browser.newContext({ baseURL, storageState: await student.storageState(), viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto(`/apostilas/${documentId}#questoes`); const section = page.getByRole('region', { name: 'Questões da apostila', exact: true });
  await expect(section.getByRole('region', { name: 'Imagens das questões', exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: 'Começar atividade', exact: true }).click(); await expect(section.locator('.question-image')).toHaveCount(3);
  await expect.poll(() => section.locator('.question-image').evaluateAll(elements => elements.every(element => (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await section.screenshot({ path: 'test-results/imagens-questoes-aluno-mobile.png' });
  const payload = { multipart: { questionId: questionIds[0], file: { name: 'nova.png', mimeType: 'image/png', buffer: png } } };
  expect((await student.post(`${path}/image`, payload)).status()).toBe(403); expect((await outsider.post(`${path}/image`, payload)).status()).toBe(404); expect((await teacher.post(`${path}/image`, payload)).status()).toBe(409);
  const host = await browser.newContext({ baseURL, storageState: await teacher.storageState() }); const hostPage = await host.newPage(); await hostPage.goto(`/apostilas/${documentId}#questoes`);
  const manager = hostPage.getByRole('region', { name: 'Imagens das questões', exact: true }); await expect(manager).toContainText('As imagens estão protegidas'); await expect(manager.locator('input[type=file]')).toHaveCount(0); await expect(manager.locator('.question-image')).toHaveCount(2);
  await Promise.all([host.close(), context.close()]);
});
