import type { APIRoute } from 'astro';
import { getTracker, deleteTracker, listRunDates, loadRun } from '../../../lib/rank/store';
import { runTracker } from '../../../lib/rank/runner';

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

  return json({ tracker, dates, run, history });
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
