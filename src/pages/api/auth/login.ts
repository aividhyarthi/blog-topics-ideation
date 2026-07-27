import type { APIRoute } from 'astro';
import { dbEnabled } from '../../../lib/db';
import { findUserByEmail, verifyPassword, createSession, setSessionCookie, validEmail } from '../../../lib/auth';
import { rateLimit, rateLimitReset, clientIp } from '../../../lib/ratelimit';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  // Operator-facing detail belongs in /api/health, not in a customer's login form.
  if (!dbEnabled) return json({ error: 'Accounts are temporarily unavailable. Please try again in a few minutes.', serviceDown: true }, 503);
  let body: { email?: string; password?: string };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!validEmail(email) || !password) return json({ error: 'Enter your email and password.' }, 400);

  // Two limits with different jobs. The per-account one is the real
  // brute-force defence and is tight. The per-IP one only catches broad
  // spraying, so it's deliberately loose — whole offices share one address
  // behind NAT, and locking out a paying team because a stranger guessed at
  // someone else's account would be a worse failure than the attack.
  const ip = clientIp(ctx.request);
  for (const [key, limit] of [[`login:acct:${email}`, 6], [`login:ip:${ip}`, 40]] as const) {
    const rl = rateLimit(key, limit, 900);
    if (!rl.ok) {
      return json({ error: `Too many sign-in attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429);
    }
  }

  try {
    const user = await findUserByEmail(email);
    // Constant-ish message so we don't leak which emails exist.
    if (!user || !(await verifyPassword(password, user.password))) return json({ error: 'Incorrect email or password.' }, 401);
    rateLimitReset(`login:acct:${email}`);
    const { token, expires } = await createSession(user.id);
    setSessionCookie(ctx, token, expires);
    return json({ user: { email: user.email } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Login failed.' }, 500);
  }
};
