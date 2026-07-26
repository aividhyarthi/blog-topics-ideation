import type { APIRoute } from 'astro';
import { dbEnabled } from '../../../lib/db';
import { findUserByEmail, verifyPassword, createSession, setSessionCookie, validEmail } from '../../../lib/auth';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  // Operator-facing detail belongs in /api/health, not in a customer's login form.
  if (!dbEnabled) return json({ error: 'Accounts are temporarily unavailable. Please try again in a few minutes.', serviceDown: true }, 503);
  let body: { email?: string; password?: string };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!validEmail(email) || !password) return json({ error: 'Enter your email and password.' }, 400);

  try {
    const user = await findUserByEmail(email);
    // Constant-ish message so we don't leak which emails exist.
    if (!user || !(await verifyPassword(password, user.password))) return json({ error: 'Incorrect email or password.' }, 401);
    const { token, expires } = await createSession(user.id);
    setSessionCookie(ctx, token, expires);
    return json({ user: { email: user.email } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Login failed.' }, 500);
  }
};
