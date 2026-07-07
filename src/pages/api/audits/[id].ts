import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { getAudit } from '../../../lib/audits';
import { dbEnabled } from '../../../lib/db';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Reload one saved audit (full report + meta) so the client can re-render it.
export const GET: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Accounts are not enabled.' }, 503);
  const user = await getUser(ctx);
  if (!user) return json({ error: 'Not signed in.' }, 401);
  const id = ctx.params.id || '';
  if (!/^\d+$/.test(id)) return json({ error: 'Bad audit id.' }, 400);
  try {
    const a = await getAudit(user.id, id);
    if (!a) return json({ error: 'Audit not found.' }, 404);
    return json({ report: a.report, meta: a.meta });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not load audit.' }, 500);
  }
};
