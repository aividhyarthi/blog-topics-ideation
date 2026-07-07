// HTTP-triggered twin of scripts/rank-check.ts, for anyone who'd rather not
// stand up a second Railway service (with its own Volume mount) just to run
// the nightly check. This runs the exact same logic (src/lib/rank/nightly.ts)
// inside the ALREADY-deployed website process, which already has RANK_DATA_DIR
// mounted correctly — so any free external scheduler (cron-job.org, a GitHub
// Actions scheduled workflow, etc.) can trigger it by just hitting a URL once
// a day. Gated on CRON_SECRET, not a login — see src/middleware.ts, which
// exempts /api/cron/* from both the session requirement (product mode) and
// the Basic Auth password (internal mode) so this check works on its own.
//
// Large checks can take several minutes; if the calling scheduler times out
// waiting for a response, the check itself keeps running server-side
// regardless (this handler doesn't watch for the caller disconnecting) — a
// "timeout" reported by the scheduler doesn't mean the check failed. Check
// Railway's deploy logs, or the Rank Tracker dashboard, for the real outcome.
import type { APIRoute } from 'astro';
import { runNightlyCheck } from '../../../lib/rank/nightly';

export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET is not set on this deployment — add it in Railway before using this endpoint.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  const url = new URL(request.url);
  const provided = request.headers.get('x-cron-secret') || url.searchParams.get('secret') || '';
  if (provided !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const result = await runNightlyCheck();
    return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
