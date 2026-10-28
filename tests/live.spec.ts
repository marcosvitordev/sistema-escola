import { test, expect, request as createRequest, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { RoomServiceClient } from 'livekit-server-sdk';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: 'escola_test' }) });
const baseURL = 'http://localhost:3001', slug = `live-${randomUUID().slice(0, 8)}`, password = 'SenhaAoVivo123!';
let teacher: APIRequestContext, student: APIRequestContext, outsider: APIRequestContext, classId: string;
const server = () => new RoomServiceClient(process.env.LIVEKIT_API_URL!, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).searchParams.get('schema') !== 'escola_test') throw new Error('Schema de teste obrigatório.');
  const passwordHash = await hash(password, 12);
  const institution = await db.institution.create({ data: { name: 'Teste ao vivo', slug } });
  const professor = await db.user.create({ data: { institutionId: institution.id, name: 'Professor ao vivo', username: 'professor', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  await db.user.create({ data: { institutionId: institution.id, name: 'Outro professor', username: 'outro', role: 'TEACHER', passwordHash, mustChangePassword: false } });
  const course = await db.course.create({ data: { institutionId: institution.id, name: 'Curso ao vivo' } });
  const classroom = await db.class.create({ data: { name: 'Turma ao vivo', courseId: course.id, teacherId: professor.id } }); classId = classroom.id;
  await db.user.create({ data: { institutionId: institution.id, name: 'Aluno ao vivo', username: 'aluno', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId } } } });
  await db.user.create({ data: { institutionId: institution.id, name: 'Segundo aluno ao vivo', username: 'aluno2', role: 'STUDENT', passwordHash, mustChangePassword: false, enrollments: { create: { classId } } } });
  [teacher, student, outsider] = await Promise.all([1, 2, 3].map(() => createRequest.newContext({ baseURL })));
  for (const [client, username] of [[teacher, 'professor'], [student, 'aluno'], [outsider, 'outro']] as const) expect((await client.post('/api/login', { data: { institution: slug, username, password } })).status()).toBe(200);
});
test.afterAll(async () => {
  for (const session of await db.liveSession.findMany({ where: { classId, endedAt: null } })) { await server().deleteRoom(session.roomName).catch(() => {}); await db.liveSession.update({ where: { id: session.id }, data: { endedAt: new Date() } }); }
  await Promise.all([teacher?.dispose(), student?.dispose(), outsider?.dispose()]); await db.$disconnect();
});
test('sala exige matrícula, gestor responsável e origem autorizada; tokens de aluno só assistem', async () => {
  const status = await (await student.get(`/api/live/classes/${classId}/status`)).json(); expect(status.live).toBeNull(); expect(status.configured).toBe(true);
  expect((await student.post(`/api/live/classes/${classId}/start`, { data: { role: 'ADMIN' } })).status()).toBe(403);
  expect((await outsider.get(`/api/live/classes/${classId}/status`)).status()).toBe(404);
  expect((await teacher.post(`/api/live/classes/${classId}/start`, { data: {}, headers: { Origin: 'https://externo.example' } })).status()).toBe(403);
  expect((await student.post('/api/live/webhook', { data: { event: 'room_finished' }, headers: { Authorization: 'falso' } })).status()).toBe(401);
  const attempts = await Promise.all([teacher.post(`/api/live/classes/${classId}/start`, { data: {} }), teacher.post(`/api/live/classes/${classId}/start`, { data: {} })]);
  expect(attempts.map(response => response.status()).sort()).toEqual([201, 409]);
  const created = await attempts.find(response => response.status() === 201)!.json();
  const join = await student.post(`/api/live/classes/${classId}/join`, { data: { id: created.id, publish: true } }); expect(join.status()).toBe(200);
  const payload = JSON.parse(Buffer.from((await join.json()).token.split('.')[1], 'base64url').toString());
  expect(payload.video.canPublish).toBe(false); expect(payload.video.canPublishData).toBe(false); expect(payload.video.canSubscribe).toBe(true); expect(payload.video.roomAdmin).not.toBe(true);
  expect((await student.post(`/api/live/classes/${classId}/end`, { data: { id: created.id } })).status()).toBe(403);
  expect((await teacher.post(`/api/live/classes/${classId}/end`, { data: { id: created.id } })).status()).toBe(200);
  expect((await student.post(`/api/live/classes/${classId}/join`, { data: { id: created.id } })).status()).toBe(409);
});

test('professor compartilha vídeo e áudio, aluno recebe mídia real e encerramento remove a sala', async ({ browser }) => {
  const presenter = await browser.newContext({ baseURL, storageState: await teacher.storageState() });
  await presenter.addInitScript(() => {
    const Original = window.RTCPeerConnection; const connections: RTCPeerConnection[] = [];
    (window as unknown as { testConnections: RTCPeerConnection[] }).testConnections = connections;
    window.RTCPeerConnection = class extends Original { constructor(configuration?: RTCConfiguration) { super(configuration); connections.push(this); } };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const audio = new AudioContext(); await audio.resume(); const oscillator = audio.createOscillator(), output = audio.createMediaStreamDestination(); oscillator.connect(output); oscillator.start(); return output.stream;
    } });
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext('2d')!; let tick = 0;
      setInterval(() => { context.fillStyle = tick++ % 2 ? '#137655' : '#245cc7'; context.fillRect(0, 0, 640, 360); context.fillStyle = '#fff'; context.font = '32px Arial'; context.fillText(`Aula ao vivo ${tick}`, 30, 180); }, 80);
      const audio = new AudioContext(); void audio.resume(); const oscillator = audio.createOscillator(); const output = audio.createMediaStreamDestination(); oscillator.connect(output); oscillator.start();
      const stream = canvas.captureStream(12); output.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      (window as unknown as { testCapture: MediaStream }).testCapture = stream; return stream;
    } });
  });
  const viewer = await browser.newContext({ baseURL, storageState: await student.storageState(), viewport: { width: 390, height: 844 } });
  await viewer.addInitScript(() => {
    const Original = window.RTCPeerConnection; const connections: RTCPeerConnection[] = [];
    (window as unknown as { testConnections: RTCPeerConnection[] }).testConnections = connections;
    window.RTCPeerConnection = class extends Original { constructor(configuration?: RTCConfiguration) { super(configuration); connections.push(this); } };
  });
  const hostPage = await presenter.newPage(), viewerPage = await viewer.newPage();
  const errors: string[] = []; hostPage.on('pageerror', error => errors.push(error.message)); viewerPage.on('pageerror', error => errors.push(error.message));
  await viewerPage.goto(`/turmas/${classId}/ao-vivo`); await expect(viewerPage.getByRole('button', { name: 'Assistir ao vivo', exact: true })).toBeDisabled();
  await hostPage.goto(`/turmas/${classId}/ao-vivo`);
  await expect(hostPage.getByRole('button', { name: 'Compartilhar tela ou vídeo' })).toBeEnabled();
  await hostPage.getByRole('button', { name: 'Compartilhar tela ou vídeo' }).click();
  await expect(hostPage.getByText('Áudio da aba incluído na transmissão.', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(viewerPage.getByRole('button', { name: 'Assistir ao vivo', exact: true })).toBeEnabled({ timeout: 15000 });
  await viewerPage.getByRole('button', { name: 'Assistir ao vivo', exact: true }).click();
  await expect.poll(() => viewerPage.locator('video').evaluate(video => (video as HTMLVideoElement).videoWidth), { timeout: 25000 }).toBeGreaterThan(0);
  await expect.poll(async () => viewerPage.evaluate(async () => {
    const connections = (window as unknown as { testConnections: RTCPeerConnection[] }).testConnections;
    let audio = 0, video = 0;
    for (const connection of connections) { const stats = await connection.getStats(); stats.forEach(report => { if (report.type === 'inbound-rtp') { if (report.kind === 'audio') audio += report.bytesReceived || 0; if (report.kind === 'video') video += report.framesDecoded || 0; } }); }
    return audio > 0 && video > 2;
  }), { timeout: 25000 }).toBe(true);
  await expect(hostPage.getByText('1 pessoa assistindo', { exact: true })).toBeVisible();
  const secondViewer = await browser.newContext({ baseURL });
  expect((await secondViewer.request.post('/api/login', { data: { institution: slug, username: 'aluno2', password } })).status()).toBe(200);
  const secondPage = await secondViewer.newPage(); await secondPage.goto(`/turmas/${classId}/ao-vivo`);
  await expect(secondPage.getByRole('button', { name: 'Assistir ao vivo', exact: true })).toBeEnabled();
  await secondPage.getByRole('button', { name: 'Assistir ao vivo', exact: true }).click();
  await expect.poll(() => secondPage.locator('video').evaluate(video => (video as HTMLVideoElement).getVideoPlaybackQuality().totalVideoFrames), { timeout: 25000 }).toBeGreaterThan(2);
  await expect(hostPage.getByText('2 pessoas assistindo', { exact: true })).toBeVisible();
  await hostPage.getByRole('button', { name: 'Ligar microfone', exact: true }).click();
  await expect(hostPage.getByRole('button', { name: 'Desligar microfone', exact: true })).toBeVisible();
  await expect(viewerPage.locator('.live-audio audio')).toHaveCount(2);
  await hostPage.getByRole('button', { name: 'Desligar microfone', exact: true }).click();
  expect(await viewerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await viewerPage.screenshot({ path: 'test-results/aula-ao-vivo-aluno-celular.png', fullPage: true });
  const active = await (await teacher.get(`/api/live/classes/${classId}/status`)).json();
  await hostPage.getByRole('button', { name: 'Encerrar transmissão', exact: true }).click();
  await expect.poll(async () => (await (await student.get(`/api/live/classes/${classId}/status`)).json()).live).toBeNull();
  await expect.poll(() => viewerPage.locator('video').evaluate(video => (video as HTMLVideoElement).srcObject === null)).toBe(true);
  await expect.poll(() => secondPage.locator('video').evaluate(video => (video as HTMLVideoElement).srcObject === null)).toBe(true);
  expect(await hostPage.evaluate(() => (window as unknown as { testCapture: MediaStream }).testCapture.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  const ended = await db.liveSession.findUniqueOrThrow({ where: { id: active.live.id } }); expect(await server().listRooms([ended.roomName])).toHaveLength(0);
  await expect(hostPage.getByRole('button', { name: 'Compartilhar tela ou vídeo' })).toBeEnabled();
  await hostPage.getByRole('button', { name: 'Compartilhar tela ou vídeo' }).click(); await expect(hostPage.getByRole('button', { name: 'Encerrar transmissão', exact: true })).toBeVisible();
  await hostPage.evaluate(() => (window as unknown as { testCapture: MediaStream }).testCapture.getVideoTracks()[0].dispatchEvent(new Event('ended')));
  await expect.poll(async () => (await (await teacher.get(`/api/live/classes/${classId}/status`)).json()).live).toBeNull();
  expect(errors).toEqual([]); await Promise.all([presenter.close(), viewer.close(), secondViewer.close()]);
});
