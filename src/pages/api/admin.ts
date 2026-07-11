// Super-admin API backing /admin — the owner's replacement for the CLI-only
// scripts/activate-user.ts flow. Everything here is gated on the logged-in
// user's email being in ADMIN_EMAILS (see src/lib/saas/plans.ts); everyone
// else gets a 404 (not a 403 — no need to advertise the panel exists).
//
//   GET  /api/admin                → users + last nightly run + scheduler info
//   POST /api/admin {action: ...}  → set-plan | cancel | extend-trial | run-check
import type { APIRoute } from 'astro';
import { isAdminEmail, PLANS, type PlanId } from '../../lib/saas/plans';
import { listUsers, findUserById, updateUserBilling } from '../../lib/saas/db';
import { loadConfig } from '../../lib/rank/store';
import { readNightlyStatus } from '../../lib/rank/run-status';
import { schedulerInfo } from '../../lib/rank/scheduler';
import { runNightlyCheck } from '../../lib/rank/nightly';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const notFound = () => new Response('Not found.', { status: 404 });

// Prevents two overlapping full checks if "Run now" is clicked twice.
let manualRunInFlight = false;

function statePayload() {
  const users = listUsers().map((u) => {
    let apps = 0;
    try { apps = loadConfig(u.id).apps.length; } catch { /* config unreadable — show 0 */ }
    return { ...u, apps };
  });
  return {
    users,
    lastRun: readNightlyStatus(),
    scheduler: schedulerInfo(),
    manualRunInFlight,
    plans: Object.values(PLANS).map((p) => ({ id: p.id, name: p.name })),
  };
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.productMode || !locals.user || !isAdminEmail(locals.user.email)) return notFound();
  return json(statePayload());
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.productMode || !locals.user || !isAdminEmail(locals.user.email)) return notFound();

  let body: Record<string, any>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const action = String(body.action || '');

  if (action === 'set-plan') {
    const user = findUserById(String(body.userId || ''));
    if (!user) return json({ error: 'User not found.' }, 404);
    const plan = String(body.plan || '') as PlanId;
    if (!PLANS[plan]) return json({ error: 'Unknown plan.' }, 400);
    updateUserBilling(user.id, { status: 'active', plan, subscriptionId: body.paymentRef ? String(body.paymentRef) : undefined });
    return json({ ok: true, ...statePayload() });
  }

  if (action === 'cancel') {
    const user = findUserById(String(body.userId || ''));
    if (!user) return json({ error: 'User not found.' }, 404);
    updateUserBilling(user.id, { status: 'canceled' });
    return json({ ok: true, ...statePayload() });
  }

  if (action === 'extend-trial') {
    const user = findUserById(String(body.userId || ''));
    if (!user) return json({ error: 'User not found.' }, 404);
    const days = Math.min(90, Math.max(1, Number(body.days) || 7));
    // Extend from today or from the current trial end, whichever is later —
    // extending an already-expired trial should grant days from now, not
    // produce another date in the past.
    const base = user.trialEndsAt && new Date(user.trialEndsAt).getTime() > Date.now()
      ? new Date(user.trialEndsAt) : new Date();
    base.setDate(base.getDate() + days);
    updateUserBilling(user.id, { status: 'trialing', trialEndsAt: base.toISOString() });
    return json({ ok: true, ...statePayload() });
  }

  if (action === 'run-check') {
    if (manualRunInFlight) return json({ ok: true, note: 'A check is already running — watch "Last automatic check" below.', ...statePayload() });
    manualRunInFlight = true;
    // Fire and forget — a full check can take many minutes, far beyond any
    // sane HTTP timeout. The run's progress/result is visible via the
    // nightly-status file this response already surfaces.
    runNightlyCheck(20 * 60 * 1000, 'admin')
      .catch((e) => console.error('[admin] manual check failed:', e))
      .finally(() => { manualRunInFlight = false; });
    return json({ ok: true, note: 'Check started — refresh this page in a few minutes to see the result.', ...statePayload() });
  }

  return json({ error: `Unknown action "${action}".` }, 400);
};
