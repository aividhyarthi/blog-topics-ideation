// ASO data layer — wraps `google-play-scraper` to fetch a normalized view of a
// Google Play (Android) app listing from a Play Store URL or a package id.
// All network access happens here so the rest of the engine stays pure/testable.
import gplay from 'google-play-scraper';

export interface AsoAppData {
  appId: string;
  url: string;
  title: string;
  summary: string; // short description (max 80 chars on Play)
  description: string; // long description, plain text (max 4000 chars)
  descriptionHTML: string; // long description with markup (for formatting checks)
  icon: string | null;
  headerImage: string | null; // feature graphic
  screenshots: string[];
  video: string | null;
  score: number | null; // average rating 0-5
  scoreText: string | null;
  ratings: number | null; // number of ratings
  reviews: number | null; // number of written reviews
  installs: string | null; // e.g. "1,000,000,000+"
  minInstalls: number | null;
  genre: string | null;
  genreId: string | null;
  contentRating: string | null;
  released: string | null;
  updated: number | null; // ms epoch
  version: string | null;
  recentChanges: string | null; // "What's new"
  free: boolean;
  priceText: string | null;
  developer: string | null;
  developerId: string | null;
  adSupported: boolean | null;
  containsAds: boolean | null;
}

/**
 * Pull a Play Store package id out of a raw id ("com.whatsapp") or any
 * Play Store URL (.../details?id=com.whatsapp&hl=en). Returns null if neither.
 */
export function parseAppId(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  // Full URL with ?id=
  const m = raw.match(/[?&]id=([^&\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  // Bare package id, e.g. com.company.app  (letters, digits, _ separated by dots)
  if (/^[a-zA-Z][\w]*(\.[a-zA-Z0-9_]+)+$/.test(raw)) return raw;
  return null;
}

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalize(app: Record<string, any>, appId: string): AsoAppData {
  const descHTML = String(app.descriptionHTML || app.description || '');
  return {
    appId,
    url: String(app.url || `https://play.google.com/store/apps/details?id=${appId}`),
    title: String(app.title || ''),
    summary: String(app.summary || ''),
    description: app.description ? stripHtml(String(app.description)) : stripHtml(descHTML),
    descriptionHTML: descHTML,
    icon: app.icon || null,
    headerImage: app.headerImage || null,
    screenshots: Array.isArray(app.screenshots) ? app.screenshots.filter(Boolean) : [],
    video: app.video || null,
    score: typeof app.score === 'number' ? app.score : null,
    scoreText: app.scoreText || null,
    ratings: typeof app.ratings === 'number' ? app.ratings : null,
    reviews: typeof app.reviews === 'number' ? app.reviews : null,
    installs: app.installs || null,
    minInstalls: typeof app.minInstalls === 'number' ? app.minInstalls : null,
    genre: app.genre || null,
    genreId: app.genreId || null,
    contentRating: app.contentRating || null,
    released: app.released || null,
    updated: typeof app.updated === 'number' ? app.updated : null,
    version: app.version || null,
    recentChanges: app.recentChanges ? stripHtml(String(app.recentChanges)) : null,
    free: app.free !== false,
    priceText: app.priceText || (app.free === false && app.price ? String(app.price) : null),
    developer: app.developer || null,
    developerId: app.developerId || null,
    adSupported: typeof app.adSupported === 'boolean' ? app.adSupported : null,
    // Play exposes ads as either `containsAds` or `adSupported` depending on the
    // listing; fall back so ad-supported free apps aren't mislabeled as just "Free".
    containsAds: typeof app.containsAds === 'boolean' ? app.containsAds : (typeof app.adSupported === 'boolean' ? app.adSupported : null),
  };
}

/** Fetch + normalize a single app. `lang`/`country` shape Play's localized listing. */
export async function fetchApp(appId: string, lang = 'en', country = 'us'): Promise<AsoAppData> {
  const app = await gplay.app({ appId, lang, country });
  return normalize(app as Record<string, any>, appId);
}

export interface RecentReview { date: string; score: number; }
export interface RecentReviewsResult { reviews: RecentReview[]; windowDays: number; }

/**
 * Recent reviews, newest first, adaptive on time window. Play's public
 * listing only exposes a dated feed of WRITTEN reviews (not a dated
 * breakdown of every star tap — many ratings have no review text and aren't
 * in this feed), and plenty of apps simply don't get `minReviews` written
 * reviews inside a fixed short window like 28 days — a rigid cutoff starves
 * out on real data for exactly the apps that most need the signal. So this
 * keeps paging until it has at least `minReviews` OR hits `maxWindowDays`,
 * whichever comes first, and reports back the ACTUAL number of days the
 * collected reviews span (not the requested one) so the caller can label it
 * honestly instead of claiming a fixed window that was never really used.
 */
// google-play-scraper's own .d.ts mistypes `sort` as an enum *instance* rather
// than the enum object, so `gplay.sort.NEWEST` doesn't type-check even though
// it works fine at runtime. Use the literal the library actually defines it as.
const SORT_NEWEST = 2;

export async function fetchRecentReviews(
  appId: string, lang = 'en', country = 'us',
  minReviews = 15, maxWindowDays = 90, cap = 400,
): Promise<RecentReviewsResult> {
  const maxCutoff = Date.now() - maxWindowDays * 86400000;
  const collected: RecentReview[] = [];
  let token: string | undefined;
  for (let page = 0; page < 8; page++) {
    // Each page is its own try: the reviews endpoint is heavier/more
    // rate-limit-prone than the plain app() listing call, and a hiccup on
    // page 2+ shouldn't throw away reviews already collected from page 1 —
    // return the partial window instead of nothing.
    let result: { data: Record<string, any>[]; nextPaginationToken?: string };
    try {
      result = (await gplay.reviews({
        appId, lang, country, sort: SORT_NEWEST, num: 50, paginate: true,
        ...(token ? { nextPaginationToken: token } : {}),
      } as Parameters<typeof gplay.reviews>[0])) as { data: Record<string, any>[]; nextPaginationToken?: string };
    } catch {
      break;
    }
    const items = result.data || [];
    if (!items.length) break;
    let hitMaxCutoff = false;
    for (const it of items) {
      const t = Date.parse(String(it.date));
      if (!Number.isNaN(t) && t < maxCutoff) { hitMaxCutoff = true; break; }
      if (typeof it.score === 'number') collected.push({ date: String(it.date), score: it.score });
    }
    if (hitMaxCutoff || collected.length >= minReviews || collected.length >= cap || !result.nextPaginationToken) break;
    token = result.nextPaginationToken;
  }
  const oldestMs = collected.length
    ? Math.min(...collected.map((r) => Date.parse(r.date)).filter((t) => !Number.isNaN(t)))
    : Date.now();
  const windowDays = Math.max(1, Math.round((Date.now() - oldestMs) / 86400000));
  return { reviews: collected, windowDays };
}

export interface Market { country: string; lang: string; }
export interface MarketListing {
  country: string; lang: string; ok: boolean;
  title: string; summary: string; description: string; screenshots: number; error?: string;
}

/**
 * Fetch one app's listing across several markets (country/language). Play serves
 * a *custom store listing* when a developer has localized/targeted copy, so
 * comparing these reveals whether an app runs market-specific listings.
 * Best-effort: a market that fails to load is flagged, not fatal.
 */
export async function fetchListingVariants(appId: string, markets: Market[]): Promise<MarketListing[]> {
  const settled = await Promise.allSettled(markets.map((m) => fetchApp(appId, m.lang, m.country)));
  return settled.map((r, i) => {
    const m = markets[i];
    if (r.status === 'fulfilled') {
      const a = r.value;
      return { country: m.country, lang: m.lang, ok: true, title: a.title, summary: a.summary, description: a.description, screenshots: a.screenshots.length };
    }
    return { country: m.country, lang: m.lang, ok: false, title: '', summary: '', description: '', screenshots: 0, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  });
}

/**
 * Resolve competitor apps. If `ids` are given, fetch those; otherwise ask Play
 * for apps similar to the primary app. Best-effort: failures are skipped so one
 * dead listing never sinks the whole comparison.
 */
export async function fetchCompetitors(
  primaryId: string,
  ids: string[],
  lang = 'en',
  country = 'us',
  max = 4,
): Promise<{ apps: AsoAppData[]; errors: string[] }> {
  const errors: string[] = [];
  let targets = ids.slice(0, max);

  if (targets.length === 0) {
    try {
      const similar = (await gplay.similar({ appId: primaryId, lang, country })) as Record<string, any>[];
      targets = similar.map((s) => String(s.appId)).filter((id) => id && id !== primaryId).slice(0, max);
    } catch (e) {
      errors.push(`Could not auto-discover similar apps: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const settled = await Promise.allSettled(targets.map((id) => fetchApp(id, lang, country)));
  const apps: AsoAppData[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') apps.push(r.value);
    else errors.push(`Competitor "${targets[i]}" failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  return { apps, errors };
}
