import type { APIRoute } from 'astro';
import { parseAppId } from '../../lib/aso/fetch';
import { parseCategory, trackKeywords, categoryTopChartRank, labelApp, aggregateTopCompetitors, compactKeywordResult, MAX_KEYWORDS, MAX_COMPETITORS, type KeywordRankResult, type CategoryRankResult } from '../../lib/rank/track';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let body: { primary?: string; competitors?: string; keywords?: string; category?: string; lang?: string; country?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const primaryId = parseAppId(body.primary || '');
  if (!primaryId) {
    return json({ error: 'Enter your app — paste the Play Store URL or the package id (e.g. com.company.app).' }, 400);
  }

  const lang = (body.lang || 'en').trim() || 'en';
  const country = (body.country || 'in').trim() || 'in';

  const competitorIds = Array.from(new Set(
    (body.competitors || '').split(/[\n,]+/).map((s) => parseAppId(s.trim())).filter((v): v is string => Boolean(v)),
  )).filter((id) => id !== primaryId).slice(0, MAX_COMPETITORS);

  const keywords = Array.from(new Set(
    (body.keywords || '').split(/\n+/).map((s) => s.trim()).filter(Boolean),
  ));
  if (!keywords.length) {
    return json({ error: 'Add at least one keyword to check ranking for (one per line).' }, 400);
  }
  const truncated = keywords.length > MAX_KEYWORDS;
  const keywordsToRun = keywords.slice(0, MAX_KEYWORDS);

  const targetAppIds = [primaryId, ...competitorIds];

  // Labels (best-effort — a failed lookup still lets rank tracking proceed).
  const [primary, competitors] = await Promise.all([
    labelApp(primaryId, lang, country),
    Promise.all(competitorIds.map((id) => labelApp(id, lang, country))),
  ]);

  // Keyword search rank — one request per keyword, run sequentially (Play throttles bursts).
  let keywordResults: KeywordRankResult[] = [];
  try {
    keywordResults = await trackKeywords(keywordsToRun, targetAppIds, { country, lang, num: 250 });
  } catch (e) {
    return json({ error: `Keyword search failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  // Category top-chart rank (optional, separate signal — not keyword-specific).
  let category: CategoryRankResult | null = null;
  const categoryCode = parseCategory(body.category || '');
  if (categoryCode) {
    try {
      category = await categoryTopChartRank(categoryCode, targetAppIds, { country, lang, num: 200 });
    } catch (e) {
      category = { category: categoryCode, collection: 'TOP_FREE', results: [], ranks: {}, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const keywordErrors = keywordResults.filter((k) => k.error).length;
  const topCompetitors = aggregateTopCompetitors(keywordResults, targetAppIds);

  return json({
    primary,
    competitors,
    keywords: keywordResults.map(compactKeywordResult),
    category,
    topCompetitors,
    meta: {
      country, lang,
      keywordCount: keywords.length,
      keywordsRun: keywordsToRun.length,
      truncated,
      keywordErrors,
      competitorsRequested: competitorIds.length,
    },
  });
};
