import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { getAudit, auditHistoryByUrl } from '../../../lib/audits';
import { dbEnabled } from '../../../lib/db';
import { SCORING_VERSION } from '../../../lib/aeo';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Reload one saved audit (full report + meta) so the client can re-render it
// without a new fetch or charge. savedId/history aren't part of the persisted
// meta blob (they're only known/fetched after the save itself), so they're
// filled back in here the same way the original POST /api/aeo-audit response
// did, rather than leaving the trend chart empty on every saved report.
export const GET: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Accounts are not enabled.' }, 503);
  const user = await getUser(ctx);
  if (!user) return json({ error: 'Not signed in.' }, 401);
  const id = ctx.params.id || '';
  if (!/^\d+$/.test(id)) return json({ error: 'Bad audit id.' }, 400);
  try {
    const a = await getAudit(user.id, id);
    if (!a) return json({ error: 'Audit not found.' }, 404);
    let history: Awaited<ReturnType<typeof auditHistoryByUrl>> = [];
    if (a.meta?.mode === 'url' && a.meta?.url) {
      try { history = await auditHistoryByUrl(user.id, a.meta.url, SCORING_VERSION); } catch { /* ignore */ }
    }
    return json({ report: a.report, meta: { ...a.meta, savedId: id, history } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not load audit.' }, 500);
  }
};
