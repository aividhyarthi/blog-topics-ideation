import type { APIRoute } from 'astro';
import { dbEnabled } from '../../../lib/db';
import { consumeResetToken } from '../../../lib/auth';
import { rateLimit, clientIp } from '../../../lib/ratelimit';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Accounts are temporarily unavailable. Please try again in a few minutes.', serviceDown: true }, 503);

  let body: { token?: string; password?: string };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const token = (body.token || '').trim();
  const password = body.password || '';

  if (!token) return json({ error: 'This reset link is incomplete. Request a new one.' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);

  // Stops token guessing.
  const rl = rateLimit(`reset:ip:${clientIp(ctx.request)}`, 10, 900);
  if (!rl.ok) return json({ error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429);

  try {
    const ok = await consumeResetToken(token, password);
    if (!ok) return json({ error: 'This reset link has expired or was already used. Request a new one.' }, 400);
    return json({ ok: true });
  } catch {
    return json({ error: 'Could not reset the password. Please try again.' }, 500);
  }
};
