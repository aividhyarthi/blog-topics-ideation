import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';
import { isAdmin, grantTrial } from '../../../lib/billing';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);
  let body: { email?: string; days?: number };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (!body.email) return json({ error: 'Email is required.' }, 400);
  const days = typeof body.days === 'number' && body.days > 0 ? body.days : 7;
  try {
    const result = await grantTrial(body.email, days);
    if (!result.ok) return json({ error: result.error }, 400);
    return json({ ok: true, expiresAt: result.expiresAt });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Failed to grant trial.' }, 500);
  }
};
