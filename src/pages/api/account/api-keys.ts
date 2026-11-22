// Personal API keys, owner side — generate, list, revoke. The plaintext key
// is only ever returned here, inside the 'create' response; every other read
// shows just the label and timestamps (see lib/saas/apikeys.ts).
//
//   GET  /api/account/api-keys                     → { keys: [...] }
//   POST /api/account/api-keys {action:'create'}   → { key, id, label }
//   POST /api/account/api-keys {action:'revoke'}   → { ok: true, keys: [...] }
import type { APIRoute } from 'astro';
import { createApiKey, listApiKeys, revokeApiKey } from '../../../lib/saas/apikeys';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.productMode || !locals.user) return json({ error: 'Not available for this account.' }, 403);
  return json({ keys: listApiKeys(locals.user.id) });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.productMode || !locals.user) return json({ error: 'Not available for this account.' }, 403);

  let body: Record<string, any>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const action = String(body.action || '');

  if (action === 'create') {
    const label = String(body.label || '').trim();
    const key = createApiKey(locals.user.id, label);
    return json({ ok: true, key, keys: listApiKeys(locals.user.id) });
  }

  if (action === 'revoke') {
    const id = String(body.id || '');
    if (!id) return json({ error: 'Which key?' }, 400);
    revokeApiKey(locals.user.id, id);
    return json({ ok: true, keys: listApiKeys(locals.user.id) });
  }

  return json({ error: `Unknown action "${action}".` }, 400);
};
