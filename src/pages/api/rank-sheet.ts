import type { APIRoute } from 'astro';
import { parseAppId } from '../../lib/aso/fetch';
import { parseCategory, trackKeywords, categoryTopChartRank, labelApp, aggregateTopCompetitors, compactKeywordResult, type KeywordRankResult, type CategoryRankResult } from '../../lib/rank/track';
import { hasGoogleCredentials, serviceAccountEmail, credentialsDiagnosis, getAccessToken } from '../../lib/sheets/auth';
import { parseSheetUrl, resolveSheetTitle, findKeywordColumn, writeRankColumns, type RankColumn } from '../../lib/sheets/client';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const MAX_KEYWORDS = 50;
const MAX_COMPETITORS = 5;

/** Lets the UI show "Sheets connected" (and *why not*, if not) without exposing credentials. */
export const GET: APIRoute = async () => {
  const connected = hasGoogleCredentials();
  return json({ connected, serviceAccountEmail: serviceAccountEmail(), reason: connected ? null : credentialsDiagnosis() });
};

export const POST: APIRoute = async ({ request }) => {
  if (!hasGoogleCredentials()) {
    return json({
      error: credentialsDiagnosis() || 'Google Sheets isn\'t connected on this server yet — see DEPLOY.md for the one-time setup.',
    }, 501);
  }

  let body: {
    sheetUrl?: string; keywordHeader?: string; primary?: string; competitors?: string;
    category?: string; lang?: string; country?: string;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const sheet = parseSheetUrl(body.sheetUrl || '');
  if (!sheet) {
    return json({ error: 'Paste a valid Google Sheet URL (or its file id).' }, 400);
  }

  const primaryId = parseAppId(body.primary || '');
  if (!primaryId) {
    return json({ error: 'Enter your app — paste the Play Store URL or the package id (e.g. com.company.app).' }, 400);
  }

  const lang = (body.lang || 'en').trim() || 'en';
  const country = (body.country || 'in').trim() || 'in';
  const headerLabel = (body.keywordHeader || 'Focused Keyword').trim() || 'Focused Keyword';

  const competitorIds = Array.from(new Set(
    (body.competitors || '').split(/[\n,]+/).map((s) => parseAppId(s.trim())).filter((v): v is string => Boolean(v)),
  )).filter((id) => id !== primaryId).slice(0, MAX_COMPETITORS);

  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }

  let sheetTitle: string;
  try {
    sheetTitle = await resolveSheetTitle(sheet.spreadsheetId, sheet.gid, token);
  } catch (e) {
    return json({ error: `Couldn't open that sheet: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let keywordCol;
  try {
    keywordCol = await findKeywordColumn(sheet.spreadsheetId, sheetTitle, headerLabel, token);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
  if (!keywordCol.rows.length) {
    return json({ error: `Found the "${headerLabel}" column but every cell under it is empty.` }, 400);
  }

  const truncated = keywordCol.rows.length > MAX_KEYWORDS;
  const rowsToRun = keywordCol.rows.slice(0, MAX_KEYWORDS);
  const keywords = rowsToRun.map((r) => r.keyword);
  const targetAppIds = [primaryId, ...competitorIds];

  const [primary, competitors] = await Promise.all([
    labelApp(primaryId, lang, country),
    Promise.all(competitorIds.map((id) => labelApp(id, lang, country))),
  ]);

  let keywordResults: KeywordRankResult[] = [];
  try {
    keywordResults = await trackKeywords(keywords, targetAppIds, { country, lang, num: 250 });
  } catch (e) {
    return json({ error: `Keyword search failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let category: CategoryRankResult | null = null;
  const categoryCode = parseCategory(body.category || '');
  if (categoryCode) {
    try {
      category = await categoryTopChartRank(categoryCode, targetAppIds, { country, lang, num: 200 });
    } catch (e) {
      category = { category: categoryCode, collection: 'TOP_FREE', results: [], ranks: {}, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Write one dated column per app back into the same sheet, aligned to the keyword rows.
  const dateStr = new Date().toISOString().slice(0, 10);
  const apps = [primary, ...competitors];
  const columns: RankColumn[] = apps.map((a) => {
    const valuesByRow: Record<number, string> = {};
    rowsToRun.forEach((r, i) => {
      const kr = keywordResults[i];
      valuesByRow[r.row] = kr.error ? 'error' : (kr.ranks[a.appId] != null ? String(kr.ranks[a.appId]) : 'Not found');
    });
    return { header: `Rank (${dateStr})`, valuesByRow };
  });

  try {
    await writeRankColumns(sheet.spreadsheetId, sheetTitle, keywordCol, columns, token);
  } catch (e) {
    return json({
      error: `Ranked ${keywords.length} keyword(s) but couldn't write the results back to the sheet: ${e instanceof Error ? e.message : String(e)}`,
      primary, competitors, keywords: keywordResults.map(compactKeywordResult), category,
      meta: { keywordCount: keywordCol.rows.length, keywordsRun: rowsToRun.length, truncated, country, lang },
    }, 502);
  }

  const keywordErrors = keywordResults.filter((k) => k.error).length;
  const topCompetitors = aggregateTopCompetitors(keywordResults, targetAppIds);

  return json({
    sheetUrl: `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/edit${sheet.gid != null ? `#gid=${sheet.gid}` : ''}`,
    sheetTitle,
    writtenColumns: columns.map((c) => c.header),
    primary,
    competitors,
    keywords: keywordResults.map(compactKeywordResult),
    category,
    topCompetitors,
    meta: {
      country, lang,
      keywordCount: keywordCol.rows.length,
      keywordsRun: rowsToRun.length,
      truncated,
      keywordErrors,
      competitorsRequested: competitorIds.length,
      skippedDuplicateHeader: keywordCol.skippedDuplicateHeader,
    },
  });
};
