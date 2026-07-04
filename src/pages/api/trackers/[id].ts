import type { APIRoute } from 'astro';
import { getTracker, deleteTracker, listRunDates, loadRun } from '../../../lib/rank/store';
import { runTracker } from '../../../lib/rank/runner';
import { summarizeRanks, computeMovers } from '../../../lib/rank/track';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ params, url }) => {
  const id = params.id || '';
  const tracker = getTracker(id);
  if (!tracker) return json({ error: 'Tracker not found.' }, 404);

  const dates = listRunDates(id);
  const dateParam = url.searchParams.get('date');
  const run = dateParam ? loadRun(id, dateParam) : (dates.length ? loadRun(id, dates[0]) : null);

  // Compact per-keyword history for the primary app, oldest -> newest, last 30 checks.
  const history = dates.slice(0, 30).reverse().map((date) => {
    const r = loadRun(id, date);
    const ranks: Record<string, number | null> = {};
    if (r) for (const k of r.keywords) ranks[k.keyword] = k.ranks[tracker.primary] ?? null;
    return { date, ranks };
  });

  // The keyword list to display: for sheet-sourced trackers this comes from
  // the last run (tracker.keywords is empty/stale — the sheet is the source
  // of truth), for manual trackers it's the same as the static list either way.
  const keywordList = run ? run.keywords.map((k) => k.keyword) : tracker.keywords;

  const summary = run ? summarizeRanks(run.keywords, tracker.primary) : null;
  let movers = null;
  if (run) {
    const idx = dates.indexOf(run.date);
    const prevDate = idx !== -1 ? dates[idx + 1] : undefined;
    const previous = prevDate ? loadRun(id, prevDate) : null;
    if (previous) movers = computeMovers(run.keywords, previous.keywords, tracker.primary);
  }

  return json({ tracker, dates, run, history, keywordList, summary, movers });
};

/** Manual "Recheck now" — same logic the daily scheduler runs automatically. */
export const POST: APIRoute = async ({ params }) => {
  const id = params.id || '';
  const tracker = getTracker(id);
  if (!tracker) return json({ error: 'Tracker not found.' }, 404);
  try {
    const run = await runTracker(tracker);
    return json({ run });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id || '';
  return json({ deleted: deleteTracker(id) });
};
