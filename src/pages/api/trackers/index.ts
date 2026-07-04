import type { APIRoute } from 'astro';
import { parseAppId } from '../../../lib/aso/fetch';
import { parseCategory, summarizeRanks, MAX_KEYWORDS, MAX_COMPETITORS } from '../../../lib/rank/track';
import { hasGoogleCredentials, credentialsDiagnosis } from '../../../lib/sheets/auth';
import { parseSheetUrl } from '../../../lib/sheets/client';
import { listTrackers, createTracker, latestRun, DEFAULT_KEYWORD_HEADER } from '../../../lib/rank/store';
import { runTracker } from '../../../lib/rank/runner';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async () => {
  const trackers = listTrackers().map((t) => {
    const run = latestRun(t.id);
    return {
      id: t.id,
      name: t.name,
      primary: t.primary,
      competitorCount: t.competitors.length,
      keywordSource: t.keywordSource,
      keywordCount: t.keywordSource === 'sheet' ? (run ? run.keywords.length : null) : t.keywords.length,
      category: t.category,
      country: t.country,
      lang: t.lang,
      createdAt: t.createdAt,
      lastRun: run ? { date: run.date, primaryTitle: run.primary.title } : null,
      summary: run ? summarizeRanks(run.keywords, t.primary) : null,
    };
  });
  return json({ trackers });
};

export const POST: APIRoute = async ({ request }) => {
  let body: {
    name?: string; primary?: string; competitors?: string; category?: string; country?: string; lang?: string;
    keywordSource?: 'manual' | 'sheet'; keywords?: string; sheetUrl?: string; keywordHeader?: string;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const primaryId = parseAppId(body.primary || '');
  if (!primaryId) {
    return json({ error: 'Enter your app — paste the Play Store URL or the package id (e.g. com.company.app).' }, 400);
  }

  const keywordSource: 'manual' | 'sheet' = body.keywordSource === 'sheet' ? 'sheet' : 'manual';
  let keywords: string[] = [];
  let sheetUrl: string | null = null;
  const keywordHeader = (body.keywordHeader || '').trim() || DEFAULT_KEYWORD_HEADER;

  if (keywordSource === 'sheet') {
    if (!hasGoogleCredentials()) {
      return json({ error: credentialsDiagnosis() || 'Google Sheets isn\'t connected on this server yet — see DEPLOY.md.' }, 501);
    }
    const sheet = parseSheetUrl(body.sheetUrl || '');
    if (!sheet) return json({ error: 'Paste a valid Google Sheet URL (or its file id).' }, 400);
    sheetUrl = (body.sheetUrl || '').trim();
  } else {
    keywords = Array.from(new Set(
      (body.keywords || '').split(/\n+/).map((s) => s.trim()).filter(Boolean),
    )).slice(0, MAX_KEYWORDS);
    if (!keywords.length) {
      return json({ error: 'Add at least one keyword to track (one per line).' }, 400);
    }
  }

  const competitors = Array.from(new Set(
    (body.competitors || '').split(/[\n,]+/).map((s) => parseAppId(s.trim())).filter((v): v is string => Boolean(v)),
  )).filter((id) => id !== primaryId).slice(0, MAX_COMPETITORS);

  const name = (body.name || '').trim() || primaryId;
  const country = (body.country || 'in').trim() || 'in';
  const lang = (body.lang || 'en').trim() || 'en';
  const category = parseCategory(body.category || '');

  const tracker = createTracker({
    name, primary: primaryId, competitors, keywordSource, keywords, sheetUrl, keywordHeader, category, country, lang,
  });

  let run = null;
  let runError: string | undefined;
  try {
    run = await runTracker(tracker);
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e);
  }

  return json({ tracker, run, runError });
};
