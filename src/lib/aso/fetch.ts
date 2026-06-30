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
