// Live AEO measurement endpoint (Phase 1). Builds a frozen prompt set, queries
// the engine (Perplexity live, or deterministic demo with no key), scores the
// brands, AND pipes the live data through the existing buildSnapshot() to prove
// the adapter seam: same report, different (live) source.
import type { APIRoute } from 'astro';
import { buildPromptSet } from '../../lib/crawl/promptset';
import { runMeasurement } from '../../lib/crawl/measure';
import { researchBrand, type BrandResearch } from '../../lib/crawl/research';
import { buildSnapshot } from '../../lib/snapshot';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const vertical = body.vertical === 'fashion' ? 'fashion' : 'beauty';
    const primaryLabel = String(body.primaryLabel || '').trim();
    if (!primaryLabel) return json({ error: 'primaryLabel is required.' }, 400);
    const locale = body.locale || 'en-IN';

    let competitors = Array.isArray(body.competitors)
      ? body.competitors.map((c: any) => (typeof c === 'string' ? { label: c } : c)).filter((c: any) => c?.label)
      : [];

    // Intelligence layer: when auto is on, an LLM researches the brand and
    // generates the prompt set + competitors (works for any brand/industry).
    let research: BrandResearch | null = null;
    let researchError: string | null = null;
    let topics;
    if (body.auto) {
      try {
        research = await researchBrand({
          brandLabel: primaryLabel, domain: body.primaryDomain, locale,
          maxTopics: 8, promptsPerTopic: 2,
        });
      } catch (e: any) {
        researchError = e?.message ?? 'Research failed.';
      }
      if (research) {
        topics = research.topics;
        // Merge discovered competitors with any the user typed (user first).
        const seen = new Set(competitors.map((c: any) => c.label.toLowerCase()));
        for (const c of research.competitors) {
          if (!seen.has(c.label.toLowerCase())) { competitors.push(c); seen.add(c.label.toLowerCase()); }
        }
      }
    }

    const set = buildPromptSet({
      client: primaryLabel,
      vertical,
      locale,
      runsPerPrompt: Number(body.runsPerPrompt) || 3,
      primaryLabel,
      primaryDomain: body.primaryDomain,
      competitors,
      topics, // undefined -> falls back to the static starter set
    });

    const { result, parsedFiles } = await runMeasurement(set);

    // Reuse the existing Snapshot engine on the LIVE-measured data.
    const snapshot = buildSnapshot(parsedFiles, {
      vertical, primaryBrand: set.primary.key, prospectName: primaryLabel,
    });

    return json({
      result,
      snapshot,
      research: research
        ? { category: research.category, vertical: research.vertical, positioning: research.positioning, competitors: research.competitors, source: research.source }
        : null,
      meta: {
        mode: result.mode,
        primaryKey: set.primary.key,
        competitorKeys: set.competitors.map((c) => c.key),
        liveKeyPresent: result.mode === 'live',
        autoRequested: Boolean(body.auto),
        researchError,
      },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Measurement failed.' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
