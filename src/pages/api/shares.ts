// Read-only app sharing, owner side: invite a client's email onto specific
// apps, list who currently has access, revoke it. The guest side (what a
// grantee actually sees) is enforced in api/rank.ts via lib/saas/grants.ts.
//
//   GET  /api/shares                       → { shares: [...], apps: [...] }
//   POST /api/shares {action: 'grant'}     → { email, appKeys: [...] }
//   POST /api/shares {action: 'revoke'}    → { email, appKey? }  (omit appKey = revoke all)
import type { APIRoute } from 'astro';
import { createGrant, deleteGrant, deleteGrantee, listGrantsByOwner } from '../../lib/saas/db';
import { assertCanGrant, isGuest } from '../../lib/saas/grants';
import { loadConfig } from '../../lib/rank/store';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Sharing only exists in product mode, and nobody can re-share apps they're
 * merely a guest of. Deliberately keyed on the workspace being VIEWED: an
 * account that owns apps and is also someone else's guest manages its own
 * shares while in its own workspace, and loses that while viewing the
 * shared one — same rule as every other write.
 */
function owner(locals: App.Locals) {
  if (!locals.productMode || !locals.user) return null;
  if (isGuest(locals.user, locals.wsMode)) return null;
  return locals.user;
}

/** Grants grouped by grantee, joined against the owner's app titles. */
function sharesPayload(ownerId: string) {
  const apps = loadConfig(ownerId).apps;
  const titleOf = (key: string) => apps.find((a) => a.key === key)?.title || key;
  const byEmail = new Map<string, { email: string; apps: { key: string; title: string }[] }>();
  for (const g of listGrantsByOwner(ownerId)) {
    const row = byEmail.get(g.granteeEmail) || { email: g.granteeEmail, apps: [] };
    row.apps.push({ key: g.appKey, title: titleOf(g.appKey) });
    byEmail.set(g.granteeEmail, row);
  }
  return {
    shares: [...byEmail.values()],
    // EVERY tracked app is offerable. An earlier version listed only apps
    // with no `competitorOf`, on the assumption that a competitor is always
    // reachable through its primary — but an app flagged as a competitor of
    // something else is still a real app the owner may need to share on its
    // own (and an orphaned flag, pointing at an app since deleted, made one
    // disappear from this list entirely with no way to get it back).
    // Competitors are labelled rather than hidden.
    apps: apps.map((a) => ({
      key: a.key,
      title: a.title,
      competitorOf: a.competitorOf && apps.some((x) => x.key === a.competitorOf)
        ? titleOf(a.competitorOf)
        : null,
    })),
  };
}

export const GET: APIRoute = async ({ locals }) => {
  const user = owner(locals);
  if (!user) return json({ error: 'Not available for this account.' }, 403);
  return json(sharesPayload(user.id));
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = owner(locals);
  if (!user) return json({ error: 'Not available for this account.' }, 403);

  let body: Record<string, any>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const action = String(body.action || '');
  const email = String(body.email || '').trim().toLowerCase();

  if (action === 'grant') {
    const appKeys: string[] = Array.isArray(body.appKeys) ? body.appKeys.map(String) : [];
    if (!appKeys.length) return json({ error: 'Pick at least one app to share.' }, 400);

    const problem = assertCanGrant(user.id, user.email, email);
    if (problem) return json({ error: problem }, 400);

    // Never grant a key the owner doesn't actually track — otherwise a
    // stale/hand-edited key would sit in the table forever, granting nothing
    // but showing up in the UI as if it did. Any tracked app counts, matching
    // the picker above.
    const owned = new Set(loadConfig(user.id).apps.map((a) => a.key));
    const unknown = appKeys.filter((k) => !owned.has(k));
    if (unknown.length) return json({ error: 'One of those apps isn\'t in your account any more — reload and try again.' }, 400);

    for (const key of appKeys) createGrant(user.id, email, key);
    return json({ ok: true, ...sharesPayload(user.id) });
  }

  if (action === 'revoke') {
    if (!email) return json({ error: 'Which email?' }, 400);
    const appKey = String(body.appKey || '');
    if (appKey) deleteGrant(user.id, email, appKey);
    else deleteGrantee(user.id, email);
    return json({ ok: true, ...sharesPayload(user.id) });
  }

  return json({ error: `Unknown action "${action}".` }, 400);
};
