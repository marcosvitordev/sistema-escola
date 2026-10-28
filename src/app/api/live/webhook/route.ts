import { NextRequest, NextResponse } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';
import { db } from '@/lib/db';
import { closeLiveRoom, liveConfigured } from '@/lib/live';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (!liveConfigured()) return new NextResponse(null, { status: 503 });
  if (Number(req.headers.get('content-length') || 0) > 100_000) return new NextResponse(null, { status: 413 });
  let event;
  try { event = await new WebhookReceiver(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!).receive(await req.text(), req.headers.get('authorization') || ''); }
  catch { return new NextResponse(null, { status: 401 }); }
  const session = event.room?.name ? await db.liveSession.findFirst({ where: { roomName: event.room.name, endedAt: null } }) : null;
  if (session && (event.event === 'room_finished' || (event.event === 'participant_left' && event.participant?.identity === `host:${session.id}`))) {
    await db.liveSession.updateMany({ where: { id: session.id, endedAt: null }, data: { endedAt: new Date() } });
    if (event.event !== 'room_finished') await closeLiveRoom(session.roomName).catch(() => {});
  }
  return new NextResponse(null, { status: 200 });
}
