import type { APIRoute } from 'astro';
import { dbEnabled } from '../../../lib/db';
import { createUser, findUserByEmail, createSession, setSessionCookie, validEmail } from '../../../lib/auth';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  // Operator-facing detail belongs in /api/health, not in a stranger's signup
  // form — "no database configured" reads as a broken product to a customer.
  if (!dbEnabled) return json({ error: 'Accounts are temporarily unavailable. Please try again in a few minutes.', serviceDown: true }, 503);
  let body: { email?: string; password?: string };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!validEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);

  try {
    if (await findUserByEmail(email)) return json({ error: 'An account with that email already exists — try signing in.' }, 409);
    const user = await createUser(email, password);
    const { token, expires } = await createSession(user.id);
    setSessionCookie(ctx, token, expires);
    return json({ user: { email: user.email } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Signup failed.' }, 500);
  }
};
