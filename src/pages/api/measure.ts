// Live AEO measurement endpoint (Phase 1). Builds a frozen prompt set, queries
// the engine (Perplexity live, or deterministic demo with no key), scores the
// brands, AND pipes the live data through the existing buildSnapshot() to prove
// the adapter seam: same report, different (live) source.
import type { APIRoute } from 'astro';
import { buildPromptSet } from '../../lib/crawl/promptset';
import { runMeasurement } from '../../lib/crawl/measure';
import { buildSnapshot } from '../../lib/snapshot';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const vertical = body.vertical === 'fashion' ? 'fashion' : 'beauty';
    const primaryLabel = String(body.primaryLabel || '').trim();
    if (!primaryLabel) return json({ error: 'primaryLabel is required.' }, 400);

    const competitors = Array.isArray(body.competitors)
      ? body.competitors.map((c: any) => (typeof c === 'string' ? { label: c } : c)).filter((c: any) => c?.label)
      : [];

    const set = buildPromptSet({
      client: primaryLabel,
      vertical,
      locale: body.locale || 'en-IN',
      runsPerPrompt: Number(body.runsPerPrompt) || 3,
      primaryLabel,
      primaryDomain: body.primaryDomain,
      competitors,
    });

    const { result, parsedFiles } = await runMeasurement(set);

    // Reuse the existing Snapshot engine on the LIVE-measured data.
    const snapshot = buildSnapshot(parsedFiles, {
      vertical, primaryBrand: set.primary.key, prospectName: primaryLabel,
    });

    return json({
      result,
      snapshot,
      meta: {
        mode: result.mode,
        primaryKey: set.primary.key,
        competitorKeys: set.competitors.map((c) => c.key),
        liveKeyPresent: result.mode === 'live',
      },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Measurement failed.' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
