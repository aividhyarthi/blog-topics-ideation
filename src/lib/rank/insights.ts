// Rank Tracker — the "why", not just the "what".
//
// Every other view answers "where do I rank". This answers the question that
// actually follows it: given that a competitor is ahead, what is plausibly
// causing it — and specifically, is it something you changed (title, short
// description, long description) or something you did NOT change (review
// health, chart momentum) that no amount of listing copy will fix?
//
// Deliberately deterministic: every line below is derived from numbers already
// collected, so it costs nothing to produce, is identical on every reload, and
// can be checked by hand against the tables. Nothing here is an AI guess.
//
// Honesty rule: neither store publishes its ranking formula, so this states
// CORRELATIONS and orders of magnitude, never "X caused Y". Wording matters —
// these go in front of clients.
import type { Annotation, KeywordTrend, RatingHistoryPoint, TrackedApp } from './types';

export type InsightTone = 'good' | 'watch' | 'bad' | 'neutral';

export interface Insight {
  /** Grouping key for the UI. */
  kind: 'listing' | 'reviews' | 'competitor' | 'coverage' | 'chart';
  tone: InsightTone;
  title: string;
  /** One or two sentences. Plain language — this is read by clients. */
  detail: string;
}

export interface CompetitorInput {
  app: TrackedApp;
  trends: KeywordTrend[];
  rating: RatingHistoryPoint | null;
}

export interface InsightsInput {
  app: TrackedApp;
  trends: KeywordTrend[];
  competitors: CompetitorInput[];
  rating: RatingHistoryPoint | null;
  /** Oldest→newest; used for the direction of travel, not just today's value. */
  ratingHistory: RatingHistoryPoint[];
  annotations: (Annotation & { impact?: { delta: number | null; before?: { avgVisibility: number | null }; after?: { avgVisibility: number | null } } })[];
  chart: { position: number | null; chart: string | null; depth: number | null; error?: string } | null;
}

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** Shared keywords where both apps have a real (non-errored) result today. */
function headToHead(mine: KeywordTrend[], theirs: KeywordTrend[]): { total: number; theyWin: number } {
  const byKw = new Map(theirs.map((t) => [t.keyword.toLowerCase(), t]));
  let total = 0, theyWin = 0;
  for (const m of mine) {
    if (m.error) continue;
    const t = byKw.get(m.keyword.toLowerCase());
    if (!t || t.error) continue;
    // One of the two has to actually rank for the comparison to mean anything.
    if (m.position == null && t.position == null) continue;
    total++;
    if (t.position != null && (m.position == null || t.position < m.position)) theyWin++;
  }
  return { total, theyWin };
}

export function buildInsights(input: InsightsInput): Insight[] {
  const { app, trends, competitors, rating, ratingHistory, annotations, chart } = input;
  const out: Insight[] = [];

  /* ---- 1. Things you DID change: listing edits, measured ------------------ */
  const measured = annotations
    .filter((a) => a.impact && a.impact.delta != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const a of measured.slice(0, 3)) {
    const d = a.impact!.delta!;
    const label = a.type === 'paid' ? 'Paid push' : 'Listing/ASO change';
    out.push({
      kind: 'listing',
      tone: d > 0.5 ? 'good' : d < -0.5 ? 'bad' : 'neutral',
      title: `${label} on ${a.date}: ${d > 0 ? '+' : ''}${d} visibility`,
      detail: `"${a.label}" — average visibility over the 14 days after this change vs the 14 before. `
        + (Math.abs(d) < 0.5
          ? 'Too small to read as a real effect; treat it as flat.'
          : d > 0
            ? 'Moving in the right direction, though other things changed in the same window too.'
            : 'Worth reviewing whether this change removed a term you were ranking for.'),
    });
  }
  if (!measured.length) {
    out.push({
      kind: 'listing',
      tone: 'neutral',
      title: 'No listing changes logged yet',
      detail: 'Log each title / short description / long description edit as an annotation. '
        + 'Without a dated marker there is no way to separate what a change did from normal week-to-week drift.',
    });
  }

  /* ---- 2. Things you did NOT change: review health ----------------------- */
  // This is the part clients consistently miss: listing copy is the visible
  // lever, but a rating problem can outweigh it entirely and no rewrite fixes it.
  if (rating && rating.tone !== 'na') {
    const older = ratingHistory.length > 1 ? ratingHistory[0] : null;
    const drift = older ? Math.round((rating.negativeShare - older.negativeShare) * 10) / 10 : null;
    const rising = drift != null && drift > 1;
    out.push({
      kind: 'reviews',
      tone: rating.tone === 'bad' ? 'bad' : rating.tone === 'mid' ? 'watch' : 'good',
      title: `${pct(rating.negativeShare)} of recent reviews are 1-2★${rising ? ` (up ${drift}pt)` : ''}`,
      detail: `Based on the last ${rating.total} reviews. `
        + (rating.tone === 'bad'
          ? 'A high recent 1-2★ share is one of the better-supported drags on ranking, and it is invisible in your listing copy — rewriting the title will not offset it.'
          : rising
            ? 'The share is climbing. This tends to show up in rank later than it shows up here, so it is worth acting on before it does.'
            : 'Healthy. This is not currently holding your rankings back.'),
    });
  }

  /* ---- 3. Competitors: who is ahead, and the likeliest reason ------------ */
  for (const c of competitors) {
    const { total, theyWin } = headToHead(trends, c.trends);
    if (!total) continue;
    const ahead = theyWin > total - theyWin;
    const name = c.app.title.length > 30 ? `${c.app.title.slice(0, 29)}…` : c.app.title;

    // The genuinely useful comparison: when a rival is ahead AND materially
    // healthier on reviews, that's a far more likely explanation for the gap
    // than anything in your keyword targeting — and it points at a different
    // fix entirely.
    const mineNeg = rating && rating.tone !== 'na' ? rating.negativeShare : null;
    const theirNeg = c.rating && c.rating.tone !== 'na' ? c.rating.negativeShare : null;
    const gap = mineNeg != null && theirNeg != null ? Math.round((mineNeg - theirNeg) * 10) / 10 : null;

    let detail = `They rank ahead of you on ${theyWin} of ${total} shared keywords.`;
    if (!ahead) detail = `You rank ahead of them on ${total - theyWin} of ${total} shared keywords.`;

    if (gap != null && gap >= 3 && ahead) {
      detail += ` Their recent 1-2★ share is ${pct(theirNeg!)} against your ${pct(mineNeg!)} — a ${gap}pt review-quality gap.`
        + ' That is a listing-independent advantage: closing it is a product/support fix, not a keyword or copy fix.';
    } else if (gap != null && gap <= -3 && ahead) {
      detail += ` Your review health is actually better than theirs (${pct(mineNeg!)} vs ${pct(theirNeg!)} 1-2★),`
        + ' so reviews are not what is putting them ahead here — look at listing relevance and install velocity instead.';
    } else if (theirNeg == null && ahead) {
      detail += ' No review-breakdown data for them yet, so the review-health comparison is unavailable — add them as a tracked competitor for a few days to fill it in.';
    }

    out.push({
      kind: 'competitor',
      tone: ahead ? 'bad' : 'good',
      title: `${name}: ${ahead ? 'ahead of you' : 'behind you'} on shared keywords`,
      detail,
    });
  }

  /* ---- 4. Data-quality caveats, so nothing above is over-read ------------ */
  const failed = trends.filter((t) => t.error).length;
  const unchecked = trends.filter((t) => t.checked === false).length;
  if (failed || unchecked) {
    out.push({
      kind: 'coverage',
      tone: 'watch',
      title: `${failed + unchecked} keyword${failed + unchecked === 1 ? '' : 's'} without a confirmed result today`,
      detail: `${failed} failed to check and ${unchecked} were not searched yet. These are excluded from the scores above `
        + 'rather than counted as "not ranking", so today\'s numbers are based only on keywords that actually returned a result.',
    });
  }
  if (chart && chart.position == null && !chart.error && chart.depth != null && chart.depth < 150) {
    out.push({
      kind: 'chart',
      tone: 'watch',
      title: `Category chart only returned ${chart.depth} entries`,
      detail: `The store returned ${chart.depth} rows for ${chart.chart || 'this chart'} against the 200 requested, so an app ranked below `
        + `#${chart.depth} cannot be detected from it. Read this as "not in the top ${chart.depth}", not as absent from the category.`,
    });
  }

  return out;
}
