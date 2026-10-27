import { test, expect, request as createRequest, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees } from 'pdf-lib';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'escola_test' }) });
const baseURL = 'http://localhost:3001';
const slug = `pdf-links-${randomUUID().slice(0, 8)}`;
const password = 'SenhaLinksPDF123!';
let admin: APIRequestContext, student: APIRequestContext, documentId: string;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== 'escola_test') throw new Error('Schema de teste obrigatório.');
  const passwordHash = await hash(password, 12);
  const institution = await db.institution.create({ data: { name: 'Teste de links no PDF', slug } });
  const manager = await db.user.create({ data: { institutionId: institution.id, username: 'admin', name: 'Admin PDF', role: 'ADMIN', passwordHash, mustChangePassword: false } });
  const course = await db.course.create({ data: { institutionId: institution.id, name: 'Links nas apostilas' } });
  const classroom = await db.class.create({ data: { courseId: course.id, teacherId: manager.id, name: 'Turma PDF' } });
  await db.user.create({ data: { institutionId: institution.id, username: 'aluno', name: 'Aluno PDF', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId: classroom.id } } } });
  const lesson = await db.lesson.create({ data: { classId: classroom.id, title: 'Aula PDF', published: true } });
  admin = await createRequest.newContext({ baseURL }); student = await createRequest.newContext({ baseURL });
  for (const [client, username] of [[admin, 'admin'], [student, 'aluno']] as const) expect((await client.post('/api/login', { data: { institution: slug, username, password } })).status()).toBe(200);
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([612, 792]); const second = pdf.addPage([612, 792]);
  second.setCropBox(10, 20, 580, 740); second.setRotation(degrees(90));
  first.drawText('Abrir material externo', { x: 72, y: 654, size: 18, font });
  first.drawText('Ir para a segunda pagina', { x: 72, y: 594, size: 18, font });
  first.node.set(PDFName.of('Annots'), pdf.context.obj([
    pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 650, 320, 675], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of('https://example.com/apostila') } })),
    pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 590, 320, 615], Border: [0, 0, 0], Dest: [second.ref, PDFName.of('Fit')] })),
    pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 530, 320, 555], A: { S: 'URI', URI: PDFString.of('javascript:alert(1)') } })),
  ]));
  second.drawText('Link na pagina rotacionada', { x: 72, y: 654, size: 18, font });
  second.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 650, 320, 675], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of('https://example.com/segunda') } }))]));
  const uploaded = await admin.post(`/api/learning/lessons/${lesson.id}/documents`, { multipart: { file: { name: 'apostila-com-links.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) } } });
  expect(uploaded.status()).toBe(201); documentId = (await uploaded.json()).id;
});
test.afterAll(async () => { await admin?.dispose(); await student?.dispose(); await db.$disconnect(); });

test('links externos e internos funcionam sem criar respostas e acompanham rotação e zoom', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, storageState: await student.storageState() });
  await context.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Material externo</h1>' }));
  const page = await context.newPage(); await page.goto(`/apostilas/${documentId}`);
  await expect(page.getByTestId('pdf-page')).toHaveAttribute('data-rendered', 'true');
  await expect(page.locator('.pdf-link')).toHaveCount(2);
  const external = page.getByRole('link', { name: /Abrir link: https:\/\/example.com\/apostila/ });
  expect(await external.getAttribute('rel')).toContain('noopener');
  const popupPromise = page.waitForEvent('popup'); await external.click();
  const popup = await popupPromise; await expect(popup).toHaveURL('https://example.com/apostila'); await popup.close();
  await expect(page.locator('.pdf-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ir para a página 2', exact: true }).click();
  await expect(page.getByLabel('Selecionar página')).toHaveValue('2');
  await expect(page.getByTestId('pdf-page')).toHaveAttribute('data-rendered', 'true');
  await expect(page.locator('.pdf-link')).toHaveCount(1);
  const rotated = page.locator('.pdf-link');
  const sheet = page.getByTestId('pdf-page');
  const original = await rotated.boundingBox(), full = await sheet.boundingBox();
  expect((original!.x - full!.x) / full!.width).toBeCloseTo((650 - 20) / 740, 2);
  expect((original!.y - full!.y) / full!.height).toBeCloseTo((72 - 10) / 580, 2);
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.5');
  await expect(page.getByTestId('pdf-page')).toHaveAttribute('data-rendered', 'true');
  const smaller = await rotated.boundingBox(); expect(smaller!.width).toBeCloseTo(original!.width / 2, 0);
  await rotated.focus(); const keyboardPopup = page.waitForEvent('popup'); await rotated.press('Enter');
  const opened = await keyboardPopup; await expect(opened).toHaveURL('https://example.com/segunda'); await opened.close();
  await page.getByLabel('Selecionar página').selectOption('1');
  await expect(page.locator('.pdf-link')).toHaveCount(2);
  await page.getByTestId('pdf-page').click({ position: { x: 180, y: 270 } });
  await page.getByRole('textbox', { name: 'Resposta na página 1' }).fill('Minha resposta continua funcionando.');
  await expect(page.getByRole('status')).toHaveText('Todas as alterações salvas');
  const work = await (await student.get(`/api/learning/documents/${documentId}/work`)).json();
  expect(work.work.annotations).toHaveLength(1);
  expect(work.work.annotations[0].text).toBe('Minha resposta continua funcionando.');
  await context.close();
});

test('links continuam disponíveis na prévia sem edição e no celular', async ({ browser }) => {
  const context = await browser.newContext({ baseURL, storageState: await admin.storageState(), viewport: { width: 390, height: 844 } });
  await context.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Material externo</h1>' }));
  const page = await context.newPage(); await page.goto(`/apostilas/${documentId}`);
  await expect(page.getByTestId('pdf-page')).toHaveAttribute('data-rendered', 'true');
  await page.getByRole('button', { name: 'Ajustar à largura' }).click();
  await expect(page.getByTestId('pdf-page')).toHaveAttribute('data-rendered', 'true');
  const popupPromise = page.waitForEvent('popup'); await page.locator('a.pdf-link').click();
  const popup = await popupPromise; await expect(popup).toHaveURL('https://example.com/apostila'); await popup.close();
  await expect(page.locator('.writing-controls')).toHaveCount(0);
  await expect(page.locator('.pdf-note')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/pdf-links-celular.png', fullPage: true });
  await context.close();
});
