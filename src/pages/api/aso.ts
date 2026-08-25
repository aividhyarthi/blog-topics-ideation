import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { parseAppId, fetchApp, fetchCompetitors, fetchRecentReviews, type AsoAppData } from '../../lib/aso/fetch';
import { auditListing, competitorRow, keywordCoverage, keywordGap, keywordMatrix, type AsoReport, type CompetitorRow, type GapKeyword } from '../../lib/aso/audit';
import { saveAsoCacheEntry } from '../../lib/rank/store';
import { isGuest } from '../../lib/saas/grants';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function repairJson(raw: string): string {
  let result = '', inString = false, escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { result += ch; escaped = false; continue; }
    if (ch === '\\' && inString) { result += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; result += ch; continue; }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      if (ch.charCodeAt(0) < 0x20) continue;
    }
    result += ch;
  }
  return result;
}

interface AiResult {
  focusKeyword?: string;
  summary?: string;
  focusVerdicts?: {
    keyword?: string;
    rating?: 'strong' | 'moderate' | 'weak';
    willWork?: string;
    wontWork?: string;
    bestAlternative?: string;
    alternativeWhy?: string;
    recoTitle?: string;
    recoShort?: string;
    placement?: 'main' | 'custom';
    placementWhy?: string;
  }[];
  keywordTargets?: { term: string; rationale: string; covered: boolean }[];
  improvements?: { title?: string; shortDescription?: string; longDescription?: string };
  competitorTakeaway?: string;
  gapInsight?: string;
  leaderVerdict?: { app?: string; why?: string; copyThis?: string };
}

function buildAiPrompt(
  app: AsoAppData,
  report: AsoReport,
  competitors: CompetitorRow[],
  focusKeywords: string[],
  gap: GapKeyword[],
  leader: { title: string; score: number | null; installs: string | null } | null,
): string {
  const fkList = focusKeywords.length ? focusKeywords : (report.focusKeyword ? [report.focusKeyword] : []);
  const kw = report.keywords.slice(0, 14).map((k) => `${k.term} (${k.count}×)`).join(', ');
  // Factual coverage of each focus keyword, primary app + every competitor, so the
  // model's "who beats you on this keyword" verdict is grounded in real data.
  const youCovLines = fkList.map((k) => {
    const c = keywordCoverage(app, k);
    return `  · "${k}" → title:${c.inTitle ? 'Y' : 'N'} short:${c.inShort ? 'Y' : 'N'} long:${c.longCount}×`;
  }).join('\n');
  const cov = (c: { inTitle: boolean; inShort: boolean; inLong: boolean; longCount: number }) =>
    `title:${c.inTitle ? 'Y' : 'N'} short:${c.inShort ? 'Y' : 'N'} long:${c.longCount}×`;
  const comp = competitors.length
    ? competitors.map((c) => {
        const perKw = fkList.map((k, i) => `"${k}" [${cov(c.focusList[i] || { inTitle: false, inShort: false, inLong: false, longCount: 0 })}]`).join('; ');
        return `- ${c.title} — ASO ${c.overall}/100, ${c.score ?? '?'}★, installs ${c.installs ?? '?'} · ${perKw}`;
      }).join('\n')
    : '(none provided)';
  const gapLines = gap.length
    ? gap.map((g) => `- "${g.term}" — used by ${g.competitors} competitor(s)${g.inTitle ? `, ${g.inTitle} in their title` : ''}${g.inShort ? `, ${g.inShort} in short desc` : ''} (e.g. ${g.apps.slice(0, 2).join(', ')}); THIS APP does not use it`).join('\n')
    : '(no clear gap — primary already covers competitor keywords)';
  const leaderLine = leader ? `${leader.title} (${leader.score ?? '?'}★, installs ${leader.installs ?? '?'})` : '(none)';
  return `You are an App Store Optimization (ASO) strategist for the Google Play Store. You optimise listings to rank for search terms AND convert browsers into installs.

Be specific and calibrated. Respect Play's hard limits: title ≤30 chars, short description ≤80 chars, long description ≤4000 chars. Never keyword-stuff.

APP
- Title: ${app.title}
- Short description: ${app.summary || '(none)'}
- Category: ${app.genre || 'unknown'}
- Rating: ${app.score ?? '?'} (${app.ratings ?? '?'} ratings) · Installs: ${app.installs ?? '?'}
- Long description (may be truncated):
"""
${app.description.slice(0, 3500)}
"""

FOCUS KEYWORDS TO EVALUATE (up to 3): ${fkList.length ? fkList.map((k) => `"${k}"`).join(', ') : '(none — pick the best one)'}
THIS APP'S COVERAGE OF EACH FOCUS KEYWORD:
${youCovLines || '  (none)'}
EXTRACTED KEYWORDS (frequency): ${kw || '(none)'}
DETERMINISTIC ASO SCORE: ${report.overall}/100 (grade ${report.grade})
COMPETITORS (with their coverage of each focus keyword):
${comp}

KEYWORD GAP — terms competitors build around that THIS APP is missing:
${gapLines}
CATEGORY LEADER (highest installs): ${leaderLine}

Return ONLY valid JSON in EXACTLY this shape (no markdown, no commentary):
{
  "focusKeyword": "the single best primary keyword this app should rank for (2-3 words max, lowercase)",
  "summary": "3-4 sentence verdict for the app owner: biggest ASO opportunity, what to fix first, and the keyword angle. Plain English, specific to this app.",
  "focusVerdicts": [
    {
      "keyword": "echo one of the focus keywords above (give one object PER focus keyword)",
      "rating": "strong | moderate | weak — how winnable is THIS keyword for THIS app right now",
      "willWork": "1-2 sentences: realistically, can this app rank for and convert on this keyword, and why",
      "wontWork": "1-2 sentences: what is working AGAINST ranking for this keyword (e.g. not in the title, search intent mismatch, competitors dominate it, too broad/competitive)",
      "bestAlternative": "a more winnable or higher-intent keyword to target instead (lowercase, 2-3 words) — or repeat the keyword if it is genuinely the best",
      "alternativeWhy": "1-2 sentences on why that alternative is a better bet for this app",
      "recoTitle": "a Play Store TITLE (MAX 30 chars) optimised to rank for THIS keyword: brand + the keyword. Count characters.",
      "recoShort": "a SHORT DESCRIPTION (MAX 80 chars) optimised for THIS keyword + a benefit. Count characters.",
      "placement": "main | custom — should this keyword drive the MAIN (default, global) store listing, or a CUSTOM store listing (a variant Play serves to a specific country/language/audience/campaign)?",
      "placementWhy": "1 sentence: why. Rule of thumb — your core, highest-volume, brand-defining head terms belong in the MAIN listing; niche, regional/local-language, seasonal, or campaign/audience-specific terms belong in a CUSTOM store listing so they don't dilute the default listing."
    }
  ],
  "keywordTargets": [
    { "term": "keyword phrase", "rationale": "why it fits this app + its audience's search intent", "covered": true|false }
  ],
  "improvements": {
    "title": "an optimised title, MAX 30 chars, brand + primary keyword",
    "shortDescription": "an optimised short description, MAX 80 chars, keyword + benefit",
    "longDescription": "an optimised long description opening (~600-900 chars): a benefit-led lead line, then bulleted feature sections with natural keyword use. Use plain text with • bullets and line breaks."
  },
  "competitorTakeaway": "${competitors.length ? 'Across the FOCUS KEYWORDS: name which competitor is out-ranking this app and exactly why (keyword in their title vs yours, higher rating, more installs). 2-3 sentences, concrete.' : ''}",
  "gapInsight": "${gap.length ? '2-3 sentences: the most important keyword/positioning gaps from the KEYWORD GAP list above, what they reveal about how competitors are ranking, and which 2-3 terms this app should add to its title/short description to close the gap.' : ''}",
  "leaderVerdict": ${leader ? `{
    "app": "the category leader's name",
    "why": "2-3 sentences on why this leader ranks #1 — be concrete about title keywords, the gap terms they own, rating, install volume, and freshness. Distinguish what is on-listing (copyable) vs brand/scale (not quickly copyable).",
    "copyThis": "the 1-2 highest-leverage things this app should copy from the leader's LISTING right now"
  }` : 'null'}
}
Give ONE focusVerdicts entry for EACH focus keyword listed above (so ${fkList.length || 1} object(s)). Provide 8-12 keywordTargets ranked by opportunity. Keep title ≤30 and shortDescription ≤80 characters — count carefully.`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  // Read-only guests (see lib/saas/grants.ts) can't run an audit — it spends
  // the owner's Anthropic budget and overwrites the owner's cached report.
  if (locals.productMode && locals.user && isGuest(locals.user, locals.wsMode)) {
    return json({ error: 'This is a read-only shared view — ask the account owner to run an ASO check.' }, 403);
  }
  let body: { url?: string; focusKeyword?: string; competitors?: string; lang?: string; country?: string; key?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const appId = parseAppId(body.url || '');
  if (!appId) {
    return json({ error: 'Enter a Google Play app — paste the Play Store URL or the package id (e.g. com.company.app).' }, 400);
  }

  const lang = (body.lang || 'en').trim() || 'en';
  const country = (body.country || 'us').trim() || 'us';
  const focusKeyword = (body.focusKeyword || '').trim();
  const competitorIds = (body.competitors || '')
    .split(/[\n,]+/).map((s) => parseAppId(s.trim())).filter((v): v is string => Boolean(v));

  // 1) Fetch the primary app (hard failure if this can't be read).
  let app: AsoAppData;
  try {
    app = await fetchApp(appId, lang, country);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const notFound = /404|not found/i.test(msg);
    return json({
      error: notFound
        ? `Couldn't find an app with id "${appId}" on the ${country.toUpperCase()} Play Store. Check the URL/package id and country.`
        : `Couldn't read that Play Store listing: ${msg}`,
    }, 502);
  }

  // 1b) Recent reviews for the rating breakdown — adaptive window (see
  // fetchRecentReviews), best-effort: a failure here just means that section
  // reports no data.
  let recentReviews: { date: string; score: number }[] = [];
  let reviewsWindowDays = 28;
  try {
    const r = await fetchRecentReviews(appId, lang, country);
    recentReviews = r.reviews;
    reviewsWindowDays = r.windowDays;
  } catch { /* rating breakdown just shows no data */ }

  // 2) Deterministic audit (always available). The keyword we put head-to-head is
  // the one the owner gave; if they gave none, fall back to the strongest one we
  // extracted from the listing, so the verdict + comparison always have a subject.
  const report = auditListing(app, focusKeyword, recentReviews, reviewsWindowDays);
  // Up to 3 keywords are evaluated; if the owner gave none we fall back to the
  // strongest extracted term so the verdict + comparison always have a subject.
  const evalFocusList = report.focusKeywords;
  const evalFocus = evalFocusList[0] || '';

  // 3) Competitors — ONLY the ids given (see fetchCompetitors: no more
  // silent "similar apps" substitution). Keep the raw apps so we can score
  // each rival's coverage of the focus keywords.
  let compApps: AsoAppData[] = [];
  let competitorErrors: string[] = [];
  let noCompetitorsGiven = false;
  try {
    const { apps, errors, noCompetitorsGiven: none } = await fetchCompetitors(appId, competitorIds, lang, country, 4);
    compApps = apps;
    competitorErrors = errors;
    noCompetitorsGiven = none;
  } catch (e) {
    competitorErrors = [e instanceof Error ? e.message : String(e)];
  }
  const competitors: CompetitorRow[] = compApps.map((a) => competitorRow(a, evalFocusList));

  // Keyword gap (what rivals build around that this app lacks) + the install leader.
  const gap = keywordGap(app, compApps, 12);
  const matrix = keywordMatrix(app, compApps, gap, 16);
  const leader = compApps.slice().sort((a, b) =>
    (b.minInstalls || 0) - (a.minInstalls || 0) || (b.score || 0) - (a.score || 0))[0] || null;

  // 4) Claude — keyword verdict + strategy + AI rewrites (best-effort).
  const apiKey = process.env.ANTHROPIC_API_KEY || import.meta.env.ANTHROPIC_API_KEY;
  let ai: AiResult = {};
  let aiError: string | undefined;
  if (!apiKey) {
    aiError = 'No ANTHROPIC_API_KEY set — the keyword verdict, opportunities and AI rewrites are skipped. The deterministic audit and competitor comparison still work.';
  } else {
    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 2400,
        messages: [{ role: 'user', content: buildAiPrompt(app, report, competitors, evalFocusList, gap, leader ? { title: leader.title, score: leader.score, installs: leader.installs } : null) }],
      });
      const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { ai = JSON.parse(m[0]); } catch { ai = JSON.parse(repairJson(m[0])); } }
    } catch (err: unknown) {
      aiError = err instanceof Error ? err.message : String(err);
    }
  }

  const checkedAt = new Date().toISOString();
  const payload = {
    report,
    focusKeyword: evalFocus,
    focusKeywords: evalFocusList,
    app: {
      appId: app.appId, url: app.url, title: app.title, summary: app.summary, description: app.description,
      icon: app.icon, headerImage: app.headerImage, screenshots: app.screenshots.slice(0, 8), genre: app.genre,
      score: app.score, ratings: app.ratings, installs: app.installs, developer: app.developer,
      updated: app.updated, version: app.version,
      focus: keywordCoverage(app, evalFocus),
      focusList: evalFocusList.map((k) => keywordCoverage(app, k)),
    },
    competitors,
    gap,
    matrix,
    leader: leader ? { title: leader.title, appId: leader.appId, url: leader.url, score: leader.score, installs: leader.installs } : null,
    ai,
    meta: { appId, lang, country, evalFocus, userGaveFocus: Boolean(focusKeyword), competitorErrors, noCompetitorsGiven, aiError },
    checkedAt,
  };

  // Cache this (paid, AI-backed) result against the tracked app so viewing
  // the dashboard again later never silently re-triggers the Anthropic call
  // — only a real trigger (keyword change, explicit re-check) does.
  if (body.key) {
    const userId = locals.productMode && locals.user ? locals.user.id : undefined;
    try { saveAsoCacheEntry(body.key, { focusList: evalFocusList, data: payload, checkedAt }, userId); } catch { /* cache is best-effort */ }
  }

  return json(payload);
};
