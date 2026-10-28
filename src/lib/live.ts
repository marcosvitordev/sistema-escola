import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { db } from './db';

export const LIVE_IDLE_MS = 90_000;
export function liveConfigured() { return !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET); }
export function liveServer() {
  if (!liveConfigured()) throw new Error('Live service is not configured');
  return new RoomServiceClient(process.env.LIVEKIT_API_URL!, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, { requestTimeout: 10 });
}
export async function closeLiveRoom(roomName: string) {
  try { await liveServer().deleteRoom(roomName); }
  catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'not_found')) throw error; }
}
export async function expireLiveSessions(classId: string) {
  const stale = await db.liveSession.findMany({ where: { classId, endedAt: null, lastSeenAt: { lt: new Date(Date.now() - LIVE_IDLE_MS) } } });
  for (const session of stale) {
    const ended = await db.liveSession.updateMany({ where: { id: session.id, endedAt: null, lastSeenAt: { lt: new Date(Date.now() - LIVE_IDLE_MS) } }, data: { endedAt: new Date() } });
    if (ended.count && liveConfigured()) await closeLiveRoom(session.roomName).catch(() => {});
  }
}
export async function liveToken(session: { id: string; roomName: string }, user: { id: string; name: string }, publish: boolean) {
  const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, { identity: publish ? `host:${session.id}` : `viewer:${user.id}:${crypto.randomUUID()}`, name: user.name, ttl: '5m' });
  token.addGrant({ roomJoin: true, room: session.roomName, canSubscribe: true, canPublish: publish, canPublishData: false, ...(publish ? { canPublishSources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO, TrackSource.MICROPHONE] } : {}) });
  return { token: await token.toJwt(), url: process.env.LIVEKIT_URL! };
}
