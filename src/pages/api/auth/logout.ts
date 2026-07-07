import type { APIRoute } from 'astro';
import { SESSION_COOKIE, destroySession, clearSessionCookie } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  if (token && dbEnabled) { try { await destroySession(token); } catch { /* ignore */ } }
  clearSessionCookie(ctx);
  return json({ ok: true });
};
