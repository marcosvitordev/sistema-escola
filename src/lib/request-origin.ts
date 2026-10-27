import type { NextRequest } from 'next/server';

// Behind a TLS reverse proxy, Next's internal URL can still use HTTP.
// Trust only the explicitly configured public origin, never forwarded input.
export function allowedRequestOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const configured = process.env.APP_ORIGIN;
  if (!configured) return origin === req.nextUrl.origin;
  try { return origin === new URL(configured).origin; }
  catch { return false; }
}
