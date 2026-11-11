import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'escola_test' }) });
const slug = `pdf-access-${randomUUID().slice(0, 8)}`, password = 'SenhaProfessor123!';
let teacher: APIRequestContext, student: APIRequestContext, outsider: APIRequestContext;
let docId: string, classId: string, studentId: string;
const base = () => `/api/learning/documents/${docId}`;
const note = (page: number, text: string) => ({ id: randomUUID(), type: 'text', page, x: .1, y: .2, width: .5, height: .1, fontSize: 14, color: '#244f87', text });
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== 'escola_test') throw new Error('Schema isolado obrigatório.');
  const institution = await db.institution.create({ data: { name: 'Teste de páginas e edição', slug } });
  const passwordHash = await hash(password, 12);
  const professor = await db.user.create({ data: { institutionId: institution.id, name: 'Professor responsável', username: 'professor', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  await db.user.create({ data: { institutionId: institution.id, name: 'Outro professor', username: 'outro', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  const learner = await db.user.create({ data: { institutionId: institution.id, name: 'Aluno da apostila', username: 'aluno', role: 'STUDENT', passwordHash, mustChangePassword: false } }); studentId = learner.id;
  const course = await db.course.create({ data: { institutionId: institution.id, name: 'Controle de apostilas' } });
  const classroom = await db.class.create({ data: { courseId: course.id, teacherId: professor.id, name: 'Turma de teste de páginas' } }); classId = classroom.id;
  await db.enrollment.create({ data: { classId, studentId } });
  const lesson = await db.lesson.create({ data: { classId, title: 'Aula de teste', published: true } });
  [teacher, student, outsider] = await Promise.all(['professor', 'aluno', 'outro'].map(async username => {
    const api = await request.newContext({ baseURL: 'http://localhost:3001' });
    expect((await api.post('/api/login', { data: { institution: slug, username, password } })).status()).toBe(200); return api;
  }));
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of ['PUBLICA_1', 'SEGREDO_PAGINA_2', 'PUBLICA_3']) pdf.addPage([612, 792]).drawText(text, { x: 40, y: 650, font });
  const upload = await teacher.post(`/api/learning/lessons/${lesson.id}/documents`, { multipart: { file: { name: 'Apostila controlada.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) } } });
  expect(upload.status()).toBe(201); docId = (await upload.json()).id;
  await student.get(`${base()}/work`);
  expect((await student.put(`${base()}/work`, { data: { version: 0, annotations: [note(1, 'Resposta original'), note(2, 'Resposta secreta na pagina 2')] } })).status()).toBe(200);
  expect((await student.post(`${base()}/submit`, { data: { version: 1 } })).status()).toBe(200);
});
test.afterAll(async () => { await Promise.all([teacher?.dispose(), student?.dispose(), outsider?.dispose()]); await db.$disconnect(); });

test('professor edita trabalho entregue sem reabrir a entrega e zoom oferece ajustes', async ({ browser }) => {
  expect((await outsider.put(`${base()}/work?student=${studentId}`, { data: {} })).status()).toBe(404);
  const context = await browser.newContext({ storageState: await teacher.storageState() });
  const page = await context.newPage(); await page.goto(`http://localhost:3001/apostilas/${docId}?aluno=${studentId}`);
  await page.getByRole('button', { name: 'Editar documento do aluno', exact: true }).click();
  const answer = page.getByRole('textbox', { name: 'Resposta na página 1', exact: true });
  await expect(answer).toBeEditable(); await answer.fill('Correção escrita pelo professor');
  await expect(page.getByRole('status')).toHaveText('Todas as alterações salvas');
  await expect(page.getByRole('button', { name: 'Entregar apostila' })).toHaveCount(0);
  const saved = await (await student.get(`${base()}/work`)).json();
  expect(saved.work.annotations[0].text).toBe('Correção escrita pelo professor'); expect(saved.work.submittedAt).toBeTruthy(); expect(saved.readOnly).toBe(true);
  expect(await db.auditLog.count({ where: { action: 'pdf-work-edited', resourceId: saved.work.id } })).toBe(1);
  expect((await student.put(`${base()}/work`, { data: { version: saved.work.version, annotations: [] } })).status()).toBe(409);
  const zoom = page.getByRole('combobox', { name: 'Zoom', exact: true });
  await zoom.selectOption('page');
  await expect.poll(() => page.locator('[data-page-number="1"]').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(700);
  await zoom.selectOption('height'); await zoom.selectOption('3');
  await expect.poll(() => page.locator('[data-page-number="1"]').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(1500);
  await page.getByRole('button', { name: 'Diminuir zoom' }).click(); await expect(zoom).toHaveValue('2.75');
  await page.getByRole('button', { name: 'Aumentar zoom' }).click(); await expect(zoom).toHaveValue('3');
  await zoom.selectOption('fit');
  await context.close();
});

test('bloqueio protege notas, arquivo e exportação e preserva respostas ocultas', async () => {
  const access = `${base()}/access`;
  expect((await student.post(access, { data: { accessVersion: 0, blockedPages: [2] } })).status()).toBe(403);
  expect((await outsider.post(access, { data: { accessVersion: 0, blockedPages: [2] } })).status()).toBe(404);
  expect((await teacher.post(access, { data: { accessVersion: 0, blockedPages: [2] }, headers: { Origin: 'https://externo.example' } })).status()).toBe(403);
  expect((await teacher.post(access, { data: { accessVersion: 0, blockedPages: [4] } })).status()).toBe(400);
  expect((await teacher.post(access, { data: { accessVersion: 0, blockedPages: [2] } })).status()).toBe(200);
  expect((await teacher.post(access, { data: { accessVersion: 0, blockedPages: [] } })).status()).toBe(409);
  let visible = await (await student.get(`${base()}/work`)).json();
  expect(visible.work.annotations).toHaveLength(1); expect(JSON.stringify(visible)).not.toContain('Resposta secreta');
  expect((await (await teacher.get(`${base()}/work?student=${studentId}`)).json()).work.annotations).toHaveLength(2);
  for (const action of ['file', 'export']) {
    const response = await student.get(`${base()}/${action}`); expect(response.status()).toBe(200);
    const clean = await PDFDocument.load(await response.body()); expect(clean.getPageCount()).toBe(3);
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = getDocument({ data: new Uint8Array(await response.body()), standardFontDataUrl: `${process.cwd().replaceAll('\\', '/')}/node_modules/pdfjs-dist/standard_fonts/` });
    try { const pdf = await loading.promise; const text = await (await pdf.getPage(2)).getTextContent(); expect(JSON.stringify(text)).toContain('bloqueada'); expect(JSON.stringify(text)).not.toMatch(/SEGREDO|secreta/); } finally { await loading.destroy(); }
  }
  expect((await teacher.post(`${base()}/reopen?student=${studentId}`, { data: { version: visible.work.version } })).status()).toBe(200);
  visible = await (await student.get(`${base()}/work`)).json();
  expect((await student.put(`${base()}/work`, { data: { version: visible.work.version, accessVersion: 0, annotations: visible.work.annotations } })).status()).toBe(409);
  expect((await student.put(`${base()}/work`, { data: { version: visible.work.version, accessVersion: 1, annotations: [note(2, 'Nao permitido')] } })).status()).toBe(409);
  expect((await student.put(`${base()}/work`, { data: { version: visible.work.version, accessVersion: 1, annotations: visible.work.annotations } })).status()).toBe(200);
  const stored = await db.pdfWork.findUniqueOrThrow({ where: { documentId_studentId: { documentId: docId, studentId } } });
  expect(JSON.stringify(stored.annotations)).toContain('Resposta secreta');
});

test('liberação pelo professor atualiza aluno conectado e modos de ajuste cabem no celular', async ({ browser }) => {
  const context = await browser.newContext({ storageState: await student.storageState(), viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto(`http://localhost:3001/apostilas/${docId}`);
  await expect(page.locator('[data-page-number="2"] .pdf-locked-overlay')).toBeVisible();
  const teacherContext = await browser.newContext({ storageState: await teacher.storageState() });
  const teacherPage = await teacherContext.newPage(); await teacherPage.goto(`http://localhost:3001/apostilas/${docId}`);
  await teacherPage.locator('.pdf-access-panel > summary').click();
  await teacherPage.getByRole('checkbox', { name: 'Página 2', exact: true }).check();
  await teacherPage.getByRole('button', { name: 'Salvar liberação', exact: true }).click();
  await expect(teacherPage.getByText('Liberação de páginas atualizada para todos os alunos desta turma.')).toBeVisible();
  await expect(page.locator('.pdf-locked-overlay')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByRole('textbox', { name: 'Resposta na página 2', exact: true })).toHaveValue('Resposta secreta na pagina 2');
  await page.getByRole('combobox', { name: 'Zoom', exact: true }).selectOption('page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/pdf-paginas-liberadas-celular.png', fullPage: true });
  const access = await (await teacher.get(`${base()}/access`)).json();
  expect((await teacher.post(`${base()}/access`, { data: { accessVersion: access.accessVersion, blockedPages: [1, 2, 3] } })).status()).toBe(200);
  const allBlocked = await (await student.get(`${base()}/work`)).json(); expect(allBlocked.readOnly).toBe(true); expect(allBlocked.work.annotations).toHaveLength(0);
  expect((await student.post(`${base()}/submit`, { data: { version: allBlocked.work.version, accessVersion: allBlocked.document.accessVersion } })).status()).toBe(409);
  await Promise.all([context.close(), teacherContext.close()]);
});
