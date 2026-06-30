import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { parseAppId, fetchApp, fetchCompetitors, type AsoAppData } from '../../lib/aso/fetch';
import { auditListing, competitorRow, type AsoReport } from '../../lib/aso/audit';

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
  keywordTargets?: { term: string; rationale: string; covered: boolean }[];
  improvements?: { title?: string; shortDescription?: string; longDescription?: string };
  competitorTakeaway?: string;
}

function buildAiPrompt(app: AsoAppData, report: AsoReport, competitors: ReturnType<typeof competitorRow>[]): string {
  const kw = report.keywords.slice(0, 14).map((k) => `${k.term} (${k.count}×)`).join(', ');
  const comp = competitors.length
    ? competitors.map((c) => `- ${c.title} — ASO ${c.overall}/100, ${c.score ?? '?'}★, installs ${c.installs ?? '?'}, title "${c.titleLen} chars", ${c.screenshots} shots`).join('\n')
    : '(none provided)';
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

EXTRACTED KEYWORDS (frequency): ${kw || '(none)'}
DETERMINISTIC ASO SCORE: ${report.overall}/100 (grade ${report.grade})
COMPETITORS:
${comp}

Return ONLY valid JSON in EXACTLY this shape (no markdown, no commentary):
{
  "focusKeyword": "the single best primary keyword this app should rank for (2-3 words max, lowercase)",
  "summary": "3-4 sentence verdict for the app owner: biggest ASO opportunity, what to fix first, and the keyword angle. Plain English, specific to this app.",
  "keywordTargets": [
    { "term": "keyword phrase", "rationale": "why it fits this app + its audience's search intent", "covered": true|false }
  ],
  "improvements": {
    "title": "an optimised title, MAX 30 chars, brand + primary keyword",
    "shortDescription": "an optimised short description, MAX 80 chars, keyword + benefit",
    "longDescription": "an optimised long description opening (~600-900 chars): a benefit-led lead line, then bulleted feature sections with natural keyword use. Use plain text with • bullets and line breaks."
  },
  "competitorTakeaway": "${competitors.length ? '2-3 sentences: where this app wins vs the competitors above and where it is being out-optimised.' : ''}"
}
Provide 8-12 keywordTargets ranked by opportunity. Keep title ≤30 and shortDescription ≤80 characters — count carefully.`;
}

export const POST: APIRoute = async ({ request }) => {
  let body: { url?: string; focusKeyword?: string; competitors?: string; lang?: string; country?: string };
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

  // 2) Deterministic audit (always available).
  const report = auditListing(app, focusKeyword);

  // 3) Competitors (best-effort; auto-discovers similar apps if none given).
  let competitors: ReturnType<typeof competitorRow>[] = [];
  let competitorErrors: string[] = [];
  try {
    const { apps, errors } = await fetchCompetitors(appId, competitorIds, lang, country, 4);
    competitors = apps.map(competitorRow);
    competitorErrors = errors;
  } catch (e) {
    competitorErrors = [e instanceof Error ? e.message : String(e)];
  }

  // 4) Claude — keyword strategy + AI rewrites + verdict (best-effort).
  const apiKey = process.env.ANTHROPIC_API_KEY || import.meta.env.ANTHROPIC_API_KEY;
  let ai: AiResult = {};
  let aiError: string | undefined;
  if (!apiKey) {
    aiError = 'No ANTHROPIC_API_KEY set — keyword strategy and AI rewrites are skipped. The deterministic audit still works.';
  } else {
    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 2200,
        messages: [{ role: 'user', content: buildAiPrompt(app, report, competitors) }],
      });
      const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { ai = JSON.parse(m[0]); } catch { ai = JSON.parse(repairJson(m[0])); } }
    } catch (err: unknown) {
      aiError = err instanceof Error ? err.message : String(err);
    }
  }

  // If the owner gave no focus keyword but Claude suggested one, re-grade so the
  // keyword pillar reflects the recommended target.
  let finalReport = report;
  if (!focusKeyword && ai.focusKeyword && ai.focusKeyword.trim()) {
    finalReport = auditListing(app, ai.focusKeyword.trim());
  }

  return json({
    report: finalReport,
    app: {
      appId: app.appId, url: app.url, title: app.title, summary: app.summary, icon: app.icon,
      headerImage: app.headerImage, screenshots: app.screenshots.slice(0, 8), genre: app.genre,
      score: app.score, ratings: app.ratings, installs: app.installs, developer: app.developer,
      updated: app.updated, version: app.version,
    },
    competitors,
    ai,
    meta: { appId, lang, country, competitorErrors, aiError },
  });
};
