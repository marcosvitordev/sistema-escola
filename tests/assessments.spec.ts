import { test, expect, request as createRequest, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { automaticScores, assessmentSchema, type QuestionDefinition } from '../src/lib/assessments';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'escola_test' }) });
const baseURL = 'http://localhost:3001';
const password = 'SenhaDeAvaliacao123!';
const slug = `avaliacoes-${randomUUID().slice(0, 8)}`;
let teacher: APIRequestContext, student: APIRequestContext, otherStudent: APIRequestContext, outsider: APIRequestContext;
let classId: string, lessonId: string, itemId: string, attemptId: string, otherAttemptId: string, questionIds: string[];
const q = (type: QuestionDefinition['type'], extra: Partial<QuestionDefinition> = {}): QuestionDefinition => ({ id: randomUUID(), type, prompt: 'Leia e responda esta questão.', points: 1, options: [], matches: [], answerKey: null, ...extra });
let questions: QuestionDefinition[];

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== 'escola_test') throw new Error('Schema de teste obrigatório.');
  const passwordHash = await hash(password, 12);
  const institution = await db.institution.create({ data: { name: 'Instituição de avaliações (teste)', slug } });
  const professor = await db.user.create({ data: { institutionId: institution.id, username: 'professor', name: 'Professora Avaliação', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  const otherTeacher = await db.user.create({ data: { institutionId: institution.id, username: 'outro-professor', name: 'Outro Professor', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  const course = await db.course.create({ data: { institutionId: institution.id, name: 'Informática Básica' } });
  const classroom = await db.class.create({ data: { courseId: course.id, teacherId: professor.id, name: 'Turma das avaliações' } }); classId = classroom.id;
  const lesson = await db.lesson.create({ data: { classId, title: 'Aula de revisão', published: true } }); lessonId = lesson.id;
  for (const username of ['aluno', 'outro-aluno']) await db.user.create({ data: { institutionId: institution.id, name: username === 'aluno' ? 'Aluno Avaliação' : 'Outro Aluno', username, role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId } } } });
  [teacher, student, otherStudent, outsider] = await Promise.all(Array.from({ length: 4 }, () => createRequest.newContext({ baseURL })));
  for (const [client, username] of [[teacher, 'professor'], [student, 'aluno'], [otherStudent, 'outro-aluno'], [outsider, otherTeacher.username]] as const) expect((await client.post('/api/login', { data: { institution: slug, username, password } })).status()).toBe(200);
  questions = [
    q('MULTIPLE_CHOICE', { prompt: 'Qual é um sistema operacional?', options: ['Windows', 'Teclado'], answerKey: '0' }),
    q('TRUE_FALSE', { prompt: 'O mouse é um dispositivo de entrada.', answerKey: 'true' }),
    q('SHORT', { prompt: 'Qual dispositivo usamos para digitar?', answerKey: ['teclado'] }),
    q('MATCHING', { prompt: 'Associe os dispositivos às funções.', options: ['Mouse', 'Monitor'], matches: ['Exibir', 'Apontar'], answerKey: ['1', '0'] }),
    q('FILL_BLANK', { prompt: 'O [___] permite digitar.', answerKey: ['teclado'] }),
    q('ESSAY', { prompt: 'Explique o que é um sistema operacional.' }),
    q('FILE', { prompt: 'Envie seu exercício em TXT.' }),
    q('PRACTICAL', { prompt: 'Crie uma pasta e explique o procedimento.' }),
  ];
  questionIds = questions.map(question => question.id);
});
test.afterAll(async () => { await Promise.all([teacher?.dispose(), student?.dispose(), otherStudent?.dispose(), outsider?.dispose()]); await db.$disconnect(); });

test('validação e correção determinística com pontuação parcial', () => {
  expect(assessmentSchema.safeParse({ lessonId: 'aula', kind: 'TEST', title: 'Prova', maxAttempts: 1, questions }).success).toBe(true);
  const scores = automaticScores(questions, { [questionIds[0]]: '0', [questionIds[1]]: 'false', [questionIds[2]]: ' TECLADO  ', [questionIds[3]]: ['1', '1'], [questionIds[4]]: ['teclado'] });
  expect(scores).toEqual({ [questionIds[0]]: 1, [questionIds[1]]: 0, [questionIds[2]]: 1, [questionIds[3]]: .5, [questionIds[4]]: 1 });
  expect(assessmentSchema.safeParse({ lessonId: 'aula', kind: 'TEST', title: 'Prova', maxAttempts: 1, questions: [{ ...questions[0], answerKey: '9' }] }).success).toBe(false);
});
test('professor cria oito tipos de questão e rascunho fica privado', async () => {
  const result = await teacher.post('/api/assessments/items', { data: { lessonId, kind: 'TEST', title: 'Prova completa de informática', instructions: 'Responda e envie seu exercício.', maxAttempts: 1, questions } });
  expect(result.status()).toBe(201); itemId = (await result.json()).id;
  expect((await student.get(`/api/assessments/items/${itemId}`)).status()).toBe(404);
  expect((await outsider.get(`/api/assessments/items/${itemId}`)).status()).toBe(404);
  expect((await student.post('/api/assessments/items', { data: { lessonId } })).status()).toBe(403);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=', 'base64');
  expect((await teacher.post(`/api/assessments/items/${itemId}/image`, { multipart: { questionId: questionIds[0], file: { name: 'imagem.png', mimeType: 'image/png', buffer: image } } })).status()).toBe(201);
  expect((await teacher.post(`/api/assessments/items/${itemId}/settings`, { data: { revision: 0, published: true } })).status()).toBe(200);
  const visible = await (await student.get(`/api/assessments/items/${itemId}`)).json();
  expect(visible.assessment.questions).toHaveLength(8);
  expect(JSON.stringify(visible)).not.toContain('answerKey');
  expect((await student.get(`/api/assessments/files/${visible.assessment.questions[0].imageId}`)).status()).toBe(200);
});
test('tentativas concorrentes são únicas e respostas ficam isoladas', async () => {
  const starts = await Promise.all([student.post(`/api/assessments/items/${itemId}/start`, { data: {} }), student.post(`/api/assessments/items/${itemId}/start`, { data: {} })]);
  expect(starts.every(response => response.status() === 201)).toBe(true);
  const ids = await Promise.all(starts.map(response => response.json())); expect(ids[0].id).toBe(ids[1].id); attemptId = ids[0].id;
  const other = await otherStudent.post(`/api/assessments/items/${itemId}/start`, { data: {} }); otherAttemptId = (await other.json()).id;
  expect((await otherStudent.get(`/api/assessments/attempts/${attemptId}`)).status()).toBe(404);
  expect((await outsider.get(`/api/assessments/attempts/${attemptId}`)).status()).toBe(404);
  const definition = await (await teacher.get(`/api/assessments/items/${itemId}`)).json();
  expect((await teacher.put(`/api/assessments/items/${itemId}`, { data: { lessonId, kind: 'TEST', title: 'Alteração indevida', maxAttempts: 1, questions, revision: definition.assessment.revision } })).status()).toBe(409);
});
test('arquivo da resposta é protegido e entrega corrige só as questões objetivas', async () => {
  const file = await student.post(`/api/assessments/attempts/${attemptId}/file`, { multipart: { questionId: questionIds[6], file: { name: 'exercicio.txt', mimeType: 'text/plain', buffer: Buffer.from('Exercício concluído.') } } });
  expect(file.status()).toBe(201); const fileId = (await file.json()).id;
  expect((await otherStudent.get(`/api/assessments/files/${fileId}`)).status()).toBe(404);
  expect((await otherStudent.put(`/api/assessments/attempts/${otherAttemptId}`, { data: { version: 0, answers: { [questionIds[6]]: fileId } } })).status()).toBe(400);
  const answers = { [questionIds[0]]: '0', [questionIds[1]]: 'true', [questionIds[2]]: 'teclado', [questionIds[3]]: ['1', '1'], [questionIds[4]]: ['teclado'], [questionIds[5]]: 'Gerencia os recursos do computador.', [questionIds[6]]: fileId, [questionIds[7]]: 'Cliquei em Nova pasta e digitei o nome.' };
  expect((await student.put(`/api/assessments/attempts/${attemptId}`, { data: { version: 0, answers } })).status()).toBe(200);
  expect((await student.put(`/api/assessments/attempts/${attemptId}`, { data: { version: 0, answers: {} } })).status()).toBe(409);
  expect((await student.post(`/api/assessments/attempts/${attemptId}/submit`, { data: { version: 1 } })).status()).toBe(200);
  expect((await student.put(`/api/assessments/attempts/${attemptId}`, { data: { version: 2, answers: {} } })).status()).toBe(409);
  expect((await student.post(`/api/assessments/items/${itemId}/start`, { data: {} })).status()).toBe(409);
  const hidden = await (await student.get(`/api/assessments/attempts/${attemptId}`)).json(); expect(hidden.attempt.grade).toBeNull(); expect(hidden.attempt.autoScores).toBeUndefined(); expect(hidden.attempt.gradedAt).toBeNull(); expect(JSON.stringify(hidden)).not.toContain('answerKey');
  const teacherView = await (await teacher.get(`/api/assessments/attempts/${attemptId}`)).json(); expect(teacherView.attempt.grade).toBe(4.5);
});
test('professor corrige manualmente e decide quando liberar as notas', async () => {
  const review = Object.fromEntries(questionIds.slice(5).map(id => [id, { points: 1, feedback: 'Resposta correta.' }]));
  expect((await teacher.post(`/api/assessments/attempts/${attemptId}/review`, { data: { version: 2, review: { [questionIds[5]]: { points: 2, feedback: '' } }, feedback: '' } })).status()).toBe(400);
  expect((await teacher.post(`/api/assessments/attempts/${attemptId}/review`, { data: { version: 2, review, feedback: 'Muito bom!' } })).status()).toBe(200);
  let result = await (await student.get(`/api/assessments/attempts/${attemptId}`)).json(); expect(result.attempt.grade).toBeNull(); expect(result.attempt.feedback).toBeUndefined();
  const definition = await (await teacher.get(`/api/assessments/items/${itemId}`)).json();
  expect((await teacher.post(`/api/assessments/items/${itemId}/settings`, { data: { revision: definition.assessment.revision, gradesReleased: true } })).status()).toBe(200);
  result = await (await student.get(`/api/assessments/attempts/${attemptId}`)).json(); expect(result.attempt.grade).toBe(7.5); expect(result.attempt.feedback).toBe('Muito bom!');
  expect(result.assessment.questions[0].answerKey).toBe('0');
  expect(JSON.stringify(await (await otherStudent.get(`/api/assessments/attempts/${otherAttemptId}`)).json())).not.toContain('answerKey');
  expect(JSON.stringify(await (await student.get(`/api/assessments/items/${itemId}`)).json())).not.toContain('answerKey');
  expect((await otherStudent.get(`/api/assessments/attempts/${attemptId}`)).status()).toBe(404);
  const released = await (await teacher.get(`/api/assessments/items/${itemId}`)).json();
  await teacher.post(`/api/assessments/items/${itemId}/settings`, { data: { revision: released.assessment.revision, gradesReleased: false } });
  expect(JSON.stringify(await (await student.get(`/api/assessments/attempts/${attemptId}`)).json())).not.toContain('answerKey');
  const concealed = await (await teacher.get(`/api/assessments/items/${itemId}`)).json();
  await teacher.post(`/api/assessments/items/${itemId}/settings`, { data: { revision: concealed.assessment.revision, gradesReleased: true } });
  expect((await otherStudent.post(`/api/assessments/attempts/${otherAttemptId}/review`, { data: {} })).status()).toBe(403);
});
test('reutilização preserva questões e imagens e prazo é validado no servidor', async () => {
  const duplicate = await teacher.post(`/api/assessments/items/${itemId}/duplicate`, { data: { lessonId } }); expect(duplicate.status()).toBe(201); const copyId = (await duplicate.json()).id;
  const definition = await (await teacher.get(`/api/assessments/items/${copyId}`)).json();
  expect(definition.assessment.published).toBe(false); expect(definition.assessment.questions[0].imageId).toBeTruthy(); expect(definition.assessment.questions[0].id).not.toBe(questionIds[0]);
  expect((await teacher.put(`/api/assessments/items/${copyId}`, { data: { ...definition.assessment, title: 'Prova reutilizada', questions: [...definition.assessment.questions].reverse() } })).status()).toBe(200);
  const edited = await (await teacher.get(`/api/assessments/items/${copyId}`)).json();
  expect(edited.assessment.questions.at(-1).imageId).toBeTruthy();
  await teacher.post(`/api/assessments/items/${copyId}/settings`, { data: { revision: 1, published: true, dueAt: '2020-01-01T00:00:00Z' } });
  expect((await student.post(`/api/assessments/items/${copyId}/start`, { data: {} })).status()).toBe(409);
});
test('criação, resposta e entrega de uma atividade pelo navegador', async ({ page, context }) => {
  await page.goto('/'); await page.getByLabel('Código da instituição').fill(slug); await page.getByLabel('Usuário ou matrícula').fill('professor'); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar na plataforma' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Professora!' })).toBeVisible();
  await page.goto(`/turmas/${classId}/atividades`);
  await page.getByRole('button', { name: 'Nova prova ou atividade' }).click();
  await page.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('ACTIVITY'); await page.getByLabel('Título', { exact: true }).fill('Atividade de revisão pelo navegador');
  await page.getByRole('button', { name: 'Adicionar questão', exact: true }).click();
  await page.getByLabel('Enunciado da questão 1').fill('O mouse é um dispositivo de entrada.'); await page.getByLabel('Tipo da questão 1').selectOption('TRUE_FALSE');
  await page.getByRole('button', { name: 'Adicionar questão', exact: true }).click();
  await page.getByLabel('Enunciado da questão 2').fill('Qual dispositivo usamos para apontar na tela?');
  await page.getByRole('textbox', { name: 'Alternativa 1 da questão 2', exact: true }).fill('Teclado');
  await page.getByRole('textbox', { name: 'Alternativa 2 da questão 2', exact: true }).fill('Windows');
  await page.getByRole('button', { name: 'Adicionar alternativa à questão 2' }).click();
  await page.getByRole('textbox', { name: 'Alternativa 3 da questão 2', exact: true }).fill('Mouse');
  await page.getByRole('radio', { name: 'Marcar alternativa 3 como correta da questão 2' }).check();
  await page.getByRole('button', { name: 'Remover alternativa 2 da questão 2' }).click();
  await expect(page.getByRole('radio', { name: 'Marcar alternativa 2 como correta da questão 2' })).toBeChecked();
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Atividade de revisão pelo navegador', exact: true })).toBeVisible();
  const url = page.url(); const browserItemId = url.split('/').at(-1)!;
  await page.getByRole('button', { name: 'Publicar avaliação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voltar para rascunho' })).toBeVisible();
  await context.clearCookies(); await page.goto('/'); await page.getByLabel('Código da instituição').fill(slug); await page.getByLabel('Usuário ou matrícula').fill('outro-aluno'); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar na plataforma' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Outro!' })).toBeVisible();
  await page.goto(url); await page.getByRole('button', { name: 'Começar atividade' }).click();
  await page.getByLabel('Falso', { exact: true }).check();
  await page.getByRole('radio', { name: 'B. Mouse', exact: true }).check();
  await expect(page.getByRole('progressbar', { name: 'Progresso de preenchimento' })).toHaveAttribute('value', '2');
  await page.getByRole('button', { name: 'Limpar seleção da questão 2' }).click();
  await expect(page.getByRole('radio', { name: 'B. Mouse', exact: true })).not.toBeChecked();
  await page.getByRole('radio', { name: 'B. Mouse', exact: true }).check();
  await expect(page.getByRole('status')).toHaveText('Todas as respostas salvas');
  await page.screenshot({ path: 'test-results/formulario-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/formulario-celular.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload(); await page.getByRole('button', { name: 'Continuar resposta' }).click(); await expect(page.getByLabel('Falso', { exact: true })).toBeChecked();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Entregar atividade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Correção concluída · aguardando liberação da nota' })).toBeVisible();
  await expect(page.getByText('Pontuação:', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Correção da questão 1', exact: true })).toHaveCount(0);
  const settings = await (await teacher.get(`/api/assessments/items/${browserItemId}`)).json(); await teacher.post(`/api/assessments/items/${browserItemId}/settings`, { data: { revision: settings.assessment.revision, gradesReleased: true } });
  await page.reload(); await page.getByRole('button', { name: 'Ver minhas respostas' }).click();
  await expect(page.getByRole('heading', { name: 'Pontuação: 1 / 2', exact: true })).toBeVisible();
  const wrong = page.getByRole('region', { name: 'Correção da questão 1', exact: true });
  await expect(wrong).toContainText('Você errou');
  await expect(wrong).toContainText('Resposta correta: Verdadeiro');
  await expect(page.getByLabel('Falso', { exact: true })).toBeChecked();
  await expect(page.getByRole('region', { name: 'Correção da questão 2', exact: true })).toContainText('Você acertou');
  await page.goto('/?area=correcoes');
  await page.getByRole('link', { name: 'Ver correção: Atividade de revisão pelo navegador', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pontuação: 1 / 2', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/atividade-validada.png', fullPage: true });
});

test('aluno revisa acertos parciais, gabaritos e comentários nos oito tipos', async ({ page, context }) => {
  await context.addCookies((await student.storageState()).cookies);
  await page.goto(`/atividades/${itemId}?tentativa=${attemptId}`);
  await expect(page.getByRole('heading', { name: 'Pontuação: 7,5 / 8', exact: true })).toBeVisible();
  await expect(page.locator('.question-correction')).toHaveCount(8);
  const matching = page.getByRole('region', { name: 'Correção da questão 4', exact: true });
  await expect(matching).toContainText('Você acertou parcialmente');
  await expect(matching).toContainText('Monitor — Incorreto');
  await expect(matching).toContainText('Resposta correta: Exibir');
  await expect(page.getByRole('region', { name: 'Correção da questão 3', exact: true })).toContainText('Respostas aceitas: teclado');
  await expect(page.getByRole('region', { name: 'Correção da questão 6', exact: true })).toContainText('Comentário do professor: Resposta correta.');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/correcao-detalhada-celular.png', fullPage: true });
});
