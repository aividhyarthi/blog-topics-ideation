// Runs one tracker: labels the apps, resolves its keyword list (pasted, or
// read fresh from a Google Sheet every time), checks every keyword, checks
// the category chart if set, and saves the result as that day's run. Shared
// by the manual "Recheck now" button and the automatic daily scheduler so
// both paths produce identical, comparable history entries.
import { labelApp, trackKeywords, categoryTopChartRank, aggregateTopCompetitors, compactKeywordResult, MAX_KEYWORDS } from './track';
import { saveRun, DEFAULT_KEYWORD_HEADER, type Tracker, type TrackerRun } from './store';
import { getAccessToken } from '../sheets/auth';
import { parseSheetUrl, resolveSheetTitle, findKeywordColumn, writeRankColumns, type RankColumn } from '../sheets/client';

export async function runTracker(tracker: Tracker): Promise<TrackerRun> {
  const targetAppIds = [tracker.primary, ...tracker.competitors];

  const [primary, competitors] = await Promise.all([
    labelApp(tracker.primary, tracker.lang, tracker.country),
    Promise.all(tracker.competitors.map((id) => labelApp(id, tracker.lang, tracker.country))),
  ]);

  // Resolve the keyword list for this run. Sheet-sourced trackers re-read the
  // sheet every time, so keywords added there show up automatically without
  // editing the tracker.
  let keywordList = tracker.keywords;
  let sheetWrite: { spreadsheetId: string; sheetTitle: string; keywordCol: Awaited<ReturnType<typeof findKeywordColumn>>; token: string } | null = null;
  let sheetError: string | undefined;

  if (tracker.keywordSource === 'sheet' && tracker.sheetUrl) {
    const sheet = parseSheetUrl(tracker.sheetUrl);
    if (!sheet) {
      sheetError = `Saved Google Sheet URL is invalid: "${tracker.sheetUrl}".`;
    } else {
      try {
        const token = await getAccessToken();
        const sheetTitle = await resolveSheetTitle(sheet.spreadsheetId, sheet.gid, token);
        const keywordCol = await findKeywordColumn(sheet.spreadsheetId, sheetTitle, tracker.keywordHeader || DEFAULT_KEYWORD_HEADER, token);
        keywordList = keywordCol.rows.slice(0, MAX_KEYWORDS).map((r) => r.keyword);
        sheetWrite = { spreadsheetId: sheet.spreadsheetId, sheetTitle, keywordCol, token };
      } catch (e) {
        sheetError = e instanceof Error ? e.message : String(e);
        keywordList = []; // don't fall back to stale/empty tracker.keywords silently
      }
    }
  }

  const keywords = keywordList.length
    ? await trackKeywords(keywordList, targetAppIds, { country: tracker.country, lang: tracker.lang, num: 250 })
    : [];
  const topCompetitors = aggregateTopCompetitors(keywords, targetAppIds);

  let category = null;
  if (tracker.category) {
    category = await categoryTopChartRank(tracker.category, targetAppIds, {
      country: tracker.country, lang: tracker.lang, num: 200,
    });
  }

  const run: TrackerRun = {
    date: new Date().toISOString().slice(0, 10),
    ranAt: new Date().toISOString(),
    primary, competitors,
    keywords: keywords.map(compactKeywordResult),
    category, topCompetitors,
    sheetError,
  };
  saveRun(tracker.id, run);

  // Write this run's ranks back into the source sheet, same "Rank (date)"
  // column-per-app shape as the one-off Sheet check. Best-effort — a failed
  // write is recorded on the run but doesn't fail the whole check.
  if (sheetWrite) {
    const apps = [primary, ...competitors];
    const rowsUsed = sheetWrite.keywordCol.rows.slice(0, keywordList.length);
    const columns: RankColumn[] = apps.map((a) => {
      const valuesByRow: Record<number, string> = {};
      rowsUsed.forEach((r, i) => {
        const kr = keywords[i];
        valuesByRow[r.row] = kr.error ? 'error' : (kr.ranks[a.appId] != null ? String(kr.ranks[a.appId]) : 'Not found');
      });
      return { header: `Rank (${run.date})`, valuesByRow };
    });
    try {
      await writeRankColumns(sheetWrite.spreadsheetId, sheetWrite.sheetTitle, sheetWrite.keywordCol, columns, sheetWrite.token);
    } catch (e) {
      run.sheetError = `Checked the keywords but couldn't write results back to the sheet: ${e instanceof Error ? e.message : String(e)}`;
      saveRun(tracker.id, run); // persist the write-back failure note
    }
  }

  return run;
}
