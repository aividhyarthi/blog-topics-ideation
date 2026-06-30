import type { APIRoute } from 'astro';
import { runVerification } from '../../lib/verify';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Ground-truth check: run the page's likely prompts through real answer engines
// (OpenAI web search + Perplexity) and report who actually got cited.
export const POST: APIRoute = async ({ request }) => {
  let body: { prompts?: unknown; url?: string; host?: string; brand?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const prompts = Array.isArray(body.prompts)
    ? body.prompts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];
  if (!prompts.length) return json({ error: 'No prompts to verify — run an audit first.' }, 400);

  // Resolve the host from an explicit host or the audited URL.
  let host = (body.host || '').trim();
  if (!host && body.url) { try { host = new URL(body.url).host; } catch { /* keep empty */ } }
  if (!host) return json({ error: 'Could not determine the domain to check. Audit a URL (not pasted HTML) to verify.' }, 400);

  try {
    const result = await runVerification({ prompts, host, brand: (body.brand || '').trim(), maxPrompts: 6 });
    return json({ result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Verification failed.' }, 500);
  }
};
