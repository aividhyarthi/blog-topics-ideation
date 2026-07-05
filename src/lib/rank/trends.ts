// Google Trends "interest over time" as a free, best-effort search-popularity
// proxy (0-100, relative — exactly the scale App Radar/AppTweak show for
// keyword volume, though their number comes from a paid, proprietary
// database). This uses Google's UNDOCUMENTED public API (the same endpoint
// pytrends and similar tools scrape) — there is no official ToS, no API key,
// and it can change shape, rate-limit, or block outright without notice.
//
// Design principle: every failure here degrades to `score: null` (shown as
// "—" in the UI) rather than throwing or blocking anything that depends on
// it. This is a nice-to-have signal, never a hard dependency.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const EXPLORE_HOME = 'https://trends.google.com/trends/explore';
const EXPLORE_API = 'https://trends.google.com/trends/api/explore';
const WIDGET_API = 'https://trends.google.com/trends/api/widgetdata/multiline';

/** Google prefixes these JSON responses with `)]}'` to block naive XSSI — strip it before parsing. */
export function stripXssiPrefix(text: string): string {
  return text.replace(/^\)\]\}',?\r?\n?/, '');
}

/** Average of the most recent `window` timeline points, clamped to 0-100. Pure — no network. */
export function averageRecentValue(points: { value?: number[] }[], window = 4): number | null {
  if (!points.length) return null;
  const recent = points.slice(-window);
  const sum = recent.reduce((acc, p) => acc + Number(p.value?.[0] ?? 0), 0);
  return Math.max(0, Math.min(100, Math.round(sum / recent.length)));
}

function extractSetCookie(headers: Headers): string {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const raw = typeof getSetCookie === 'function' ? getSetCookie.call(headers) : [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function fetchCookie(geo: string): Promise<string> {
  const res = await fetch(`${EXPLORE_HOME}?geo=${encodeURIComponent(geo || 'US')}`, { headers: { 'User-Agent': UA } });
  return extractSetCookie(res.headers);
}

interface TimeseriesWidget { token: string; request: unknown }

async function fetchExploreWidget(keyword: string, geo: string, cookie: string): Promise<TimeseriesWidget> {
  const req = { comparisonItem: [{ keyword, geo, time: 'today 3-m' }], category: 0, property: '' };
  const url = `${EXPLORE_API}?hl=en-US&tz=-330&req=${encodeURIComponent(JSON.stringify(req))}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie } });
  if (!res.ok) throw new Error(`Trends explore HTTP ${res.status}`);
  const data = JSON.parse(stripXssiPrefix(await res.text()));
  const widget = (data.widgets || []).find((w: Record<string, unknown>) => w.id === 'TIMESERIES');
  if (!widget) throw new Error('No timeseries widget for this term (too niche / unsupported region)');
  return { token: String(widget.token), request: widget.request };
}

async function fetchTimelineScore(widget: TimeseriesWidget, cookie: string): Promise<number | null> {
  const url = `${WIDGET_API}?hl=en-US&tz=-330&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie } });
  if (!res.ok) throw new Error(`Trends timeline HTTP ${res.status}`);
  const data = JSON.parse(stripXssiPrefix(await res.text()));
  return averageRecentValue(data.default?.timelineData || []);
}

export interface TrendsScore { keyword: string; score: number | null; error?: string }

/** Best-effort 0-100 popularity score for one keyword over the last ~3 months. */
export async function fetchTrendsScore(keyword: string, geo = 'US'): Promise<TrendsScore> {
  try {
    const cookie = await fetchCookie(geo);
    const widget = await fetchExploreWidget(keyword, geo, cookie);
    const score = await fetchTimelineScore(widget, cookie);
    return { keyword, score };
  } catch (e) {
    return { keyword, score: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Batch fetch with a politeness delay between requests. Capped by callers to
 * a modest count (this endpoint is unofficial and blocks aggressive use).
 * Never throws — a bad run just means every score comes back null.
 */
export async function fetchTrendsScores(keywords: string[], geo = 'US', delayMs = 600): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  for (const kw of keywords) {
    const r = await fetchTrendsScore(kw, geo);
    out.set(kw, r.score);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return out;
}
