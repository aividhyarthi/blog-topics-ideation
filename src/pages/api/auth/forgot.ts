import type { APIRoute } from 'astro';
import { dbEnabled } from '../../../lib/db';
import { createResetToken, validEmail } from '../../../lib/auth';
import { mailEnabled, sendMail, siteOrigin, resetEmail, SUPPORT_EMAIL } from '../../../lib/mail';
import { rateLimit, clientIp } from '../../../lib/ratelimit';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Accounts are temporarily unavailable. Please try again in a few minutes.', serviceDown: true }, 503);

  let body: { email?: string };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const email = (body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);

  // Reset requests are a spam vector (we send mail on demand) and an account
  // enumeration probe, so cap them per address and per network.
  for (const key of [`forgot:ip:${clientIp(ctx.request)}`, `forgot:acct:${email}`]) {
    const rl = rateLimit(key, 4, 900);
    if (!rl.ok) return json({ error: `Too many reset requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429);
  }

  // If email isn't configured, say so instead of claiming a message was sent —
  // silently doing nothing is how people end up locked out of paid accounts.
  if (!mailEnabled) {
    return json({ error: `Password reset email isn't set up on this deployment yet. Email ${SUPPORT_EMAIL} and we'll reset it manually.` }, 503);
  }

  try {
    const token = await createResetToken(email);
    if (token) {
      const link = `${siteOrigin(ctx.request)}/reset?token=${token}`;
      const { html, text } = resetEmail(link);
      await sendMail(email, 'Reset your AI Page Audit password', html, text);
    }
    // Same response whether or not the account exists — never confirm which
    // addresses are registered.
    return json({ ok: true });
  } catch {
    return json({ error: 'Could not send the reset email. Please try again.' }, 500);
  }
};
