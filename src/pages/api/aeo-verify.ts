import type { APIRoute } from 'astro';
import { runVerification } from '../../lib/verify';
import { getUser } from '../../lib/auth';
import { consumeAccess, refundAccess } from '../../lib/billing';
import { dbEnabled } from '../../lib/db';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Ground-truth check: run the page's likely prompts through real answer engines
// (OpenAI web search + Perplexity) and report who actually got cited.
//
// Each run is up to 6 prompts x 2 engines = up to 12 real, billed calls to
// OpenAI/Perplexity — meaningfully more expensive than a single audit — so
// this is gated exactly like /api/access.ts: signed-in only, one unit
// consumed from the same plan/free-check/credit pool, refunded if the run
// never actually queried anything. Previously this endpoint had no auth and
// no rate limit at all, which meant anyone who found the URL could spam
// metered third-party API keys for free.
export const POST: APIRoute = async (ctx) => {
  if (!dbEnabled) {
    return json({ error: 'Accounts are temporarily unavailable. Please try again shortly.', serviceDown: true }, 503);
  }
  const gateUser = await getUser(ctx);
  if (!gateUser) {
    return json({ error: 'Sign in to verify against live engines.', requireAuth: true }, 401);
  }

  let body: { prompts?: unknown; url?: string; host?: string; brand?: string; competitors?: unknown };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const prompts = Array.isArray(body.prompts)
    ? body.prompts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];
  if (!prompts.length) return json({ error: 'No prompts to verify — run an audit first.' }, 400);

  // Competitors may arrive as an array or a comma/space-separated string.
  const competitors = (Array.isArray(body.competitors)
    ? body.competitors.filter((c): c is string => typeof c === 'string')
    : typeof body.competitors === 'string' ? body.competitors.split(/[,\s]+/) : []
  ).map((c) => c.trim()).filter(Boolean);

  // Resolve the host from an explicit host or the audited URL.
  let host = (body.host || '').trim();
  if (!host && body.url) { try { host = new URL(body.url).host; } catch { /* keep empty */ } }
  if (!host) return json({ error: 'Could not determine the domain to check. Audit a URL (not pasted HTML) to verify.' }, 400);

  const access = await consumeAccess(gateUser.id, 'verify');
  if (!access.allowed) return json({ error: access.message, upgrade: true }, 402);

  try {
    const result = await runVerification({ prompts, host, brand: (body.brand || '').trim(), competitors, maxPrompts: 6 });
    if (!result.ran) await refundAccess(gateUser.id, access.via);
    return json({ result });
  } catch (e) {
    await refundAccess(gateUser.id, access.via);
    return json({ error: e instanceof Error ? e.message : 'Verification failed.' }, 500);
  }
};
