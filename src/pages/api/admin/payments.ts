import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';
import { isAdmin, listClaims, approveClaim, rejectClaim } from '../../../lib/billing';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);
  try { return json({ claims: await listClaims() }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Failed to load claims.' }, 500); }
};

export const POST: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);
  let body: { id?: string; action?: 'approve' | 'reject' };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (!body.id || (body.action !== 'approve' && body.action !== 'reject')) return json({ error: 'id and action are required.' }, 400);
  try {
    const result = body.action === 'approve' ? await approveClaim(body.id) : await rejectClaim(body.id);
    if (!result.ok) return json({ error: result.error }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Failed to update claim.' }, 500);
  }
};
