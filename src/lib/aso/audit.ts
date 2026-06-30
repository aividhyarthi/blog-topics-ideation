// ASO scoring engine — deterministic Play Store listing audit.
// Mirrors the AEO Auditor's philosophy: the SCORE grades only what the listing
// owner can edit (title, descriptions, keywords, visuals, freshness). "Market
// signals" (rating, installs, age) are reported as context but NOT scored,
// because they are an outcome, not a field you can change in the console today.
import type { AsoAppData } from './fetch';

// Google Play hard limits on listing text fields.
export const LIMITS = { title: 30, summary: 80, description: 4000 } as const;

export type SignalSource = 'auto' | 'ai';
export interface Signal {
  key: string;
  label: string;
  detail: string;
  fix?: string;
  score: number | null; // 0-100, null = not applicable
  source: SignalSource;
}
export interface Pillar {
  key: string;
  label: string;
  purpose: string;
  weight: number; // contribution to the 100-pt total
  score: number; // 0-100 (avg of signals)
  points: number; // score/100 * weight, rounded
  signals: Signal[];
}
export interface MarketSignal { label: string; detail: string; tone: 'good' | 'mid' | 'bad' | 'na'; }
export interface KeywordRow { term: string; count: number; inTitle: boolean; inShort: boolean; inLong: boolean; }
export interface Fix { key: string; label: string; fix: string; severity: 'fail' | 'warn'; tag: 'high' | 'quick'; gain: number; }

export interface AsoReport {
  overall: number;
  grade: string;
  band: 'Low' | 'Medium' | 'High';
  summary?: string;
  pillars: Pillar[];
  marketSignals: MarketSignal[];
  keywords: KeywordRow[];
  focusKeyword: string | null;
  topFixes: Fix[];
}

const STOPWORDS = new Set(
  ('a an the and or but for nor so yet of to in on at by with from as is are be been being this that these those it its your you our we us they them he she his her their my me i your yours app apps best free new get download use using used can will just more most all any get into out up down over under about your also has have had do does did not no your than then now app google play store android phone mobile feature features available'.split(
    ' ',
  )),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'+&-]{1,}/g) || []).filter((w) => w.length > 2);
}

/** Top keywords (uni- and bi-grams) across the listing, with where each appears. */
export function extractKeywords(app: AsoAppData, limit = 18): KeywordRow[] {
  const titleL = app.title.toLowerCase();
  const shortL = app.summary.toLowerCase();
  const longL = app.description.toLowerCase();
  const tokens = tokenize(`${app.title} ${app.summary} ${app.description}`);
  const counts = new Map<string, number>();

  const bump = (term: string) => counts.set(term, (counts.get(term) || 0) + 1);
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (!STOPWORDS.has(w)) bump(w);
    // bigram (skip if either side is a stopword to avoid "the best")
    if (i + 1 < tokens.length) {
      const a = tokens[i], b = tokens[i + 1];
      if (!STOPWORDS.has(a) && !STOPWORDS.has(b)) bump(`${a} ${b}`);
    }
  }

  return [...counts.entries()]
    .filter(([t, c]) => c >= 2 || t.includes(' '))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([term, count]) => ({
      term,
      count,
      inTitle: titleL.includes(term),
      inShort: shortL.includes(term),
      inLong: longL.includes(term),
    }));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return (haystack.match(re) || []).length;
}

// score → status helpers shared with the UI semantics
function avg(nums: (number | null)[]): number {
  const vals = nums.filter((n): n is number => typeof n === 'number');
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function gradeFor(s: number): string {
  if (s >= 90) return 'A';
  if (s >= 80) return 'B';
  if (s >= 70) return 'C';
  if (s >= 60) return 'D';
  return 'F';
}

/**
 * Build the deterministic ASO report. `focusKeyword` is optional — when the
 * owner provides one, the Keyword Strategy pillar grades coverage of THAT term;
 * otherwise it falls back to the strongest extracted keyword.
 */
export function auditListing(app: AsoAppData, focusKeywordInput?: string): AsoReport {
  const keywords = extractKeywords(app);
  const focusKeyword =
    (focusKeywordInput || '').trim().toLowerCase() || (keywords[0] ? keywords[0].term : null);

  const titleLen = app.title.length;
  const shortLen = app.summary.length;
  const longLen = app.description.length;

  // ---- Pillar 1: Title (20) ----
  const titleSignals: Signal[] = [
    {
      key: 'title-length', label: 'Title length', source: 'auto',
      detail: `${titleLen}/${LIMITS.title} characters used.`,
      score: titleLen === 0 ? 0 : titleLen >= 22 ? 92 : titleLen >= 16 ? 78 : titleLen >= 10 ? 58 : 40,
      fix: titleLen < 22 && titleLen > 0
        ? `You have ${LIMITS.title - titleLen} unused characters. Add a high-value keyword after your brand name (e.g. "Brand: Photo Editor & Collage").`
        : undefined,
    },
    {
      key: 'title-descriptor', label: 'Brand + keyword pattern', source: 'auto',
      detail: /[-–—:|·]/.test(app.title)
        ? 'Title pairs the brand with a keyword descriptor — strong for both ranking and tap-through.'
        : 'Title looks brand-only. A descriptor after a separator surfaces your main keyword.',
      score: /[-–—:|·]/.test(app.title) ? 90 : app.title.trim().split(/\s+/).length >= 3 ? 70 : 48,
      fix: /[-–—:|·]/.test(app.title) ? undefined : 'Use "Brand – Primary Keyword" so your top search term sits in the most heavily weighted field.',
    },
  ];

  // ---- Pillar 2: Short description (15) ----
  const shortSignals: Signal[] = [
    {
      key: 'short-present', label: 'Short description present', source: 'auto',
      detail: shortLen ? 'Short description is set.' : 'No short description — this is the text shown above the fold.',
      score: shortLen ? 100 : 0,
      fix: shortLen ? undefined : 'Add an 80-character short description; it is indexed and is the first copy a user reads.',
    },
    {
      key: 'short-length', label: 'Short description length', source: 'auto',
      detail: `${shortLen}/${LIMITS.summary} characters used.`,
      score: shortLen === 0 ? 0 : shortLen >= 64 ? 92 : shortLen >= 45 ? 74 : 55,
      fix: shortLen > 0 && shortLen < 64 ? `Use more of the 80 characters (${LIMITS.summary - shortLen} left) to fit your main keyword and a benefit.` : undefined,
    },
  ];

  // ---- Pillar 3: Long description (20) ----
  const hasFormatting = /<br|<p|<ul|<li|•|◆|▶|✓|–\s|\n[-*•]/.test(app.descriptionHTML || app.description);
  const longSignals: Signal[] = [
    {
      key: 'long-length', label: 'Long description depth', source: 'auto',
      detail: `${longLen}/${LIMITS.description} characters used.`,
      score: longLen === 0 ? 0 : longLen >= 2000 ? 90 : longLen >= 1000 ? 74 : longLen >= 400 ? 56 : 38,
      fix: longLen < 2000 ? `Expand toward ~2,000–4,000 characters with feature sections and natural keyword repetition (${LIMITS.description - longLen} characters available).` : undefined,
    },
    {
      key: 'long-format', label: 'Scannable formatting', source: 'auto',
      detail: hasFormatting ? 'Uses bullets / line breaks — scannable for users and parseable for Play.' : 'Reads as a wall of text. Bullets and short paragraphs lift conversion.',
      score: hasFormatting ? 88 : 50,
      fix: hasFormatting ? undefined : 'Break the description into short paragraphs with bulleted feature lists and a lead benefit line.',
    },
  ];

  // ---- Pillar 4: Keyword strategy (20) ----
  const fk = focusKeyword || '';
  const inTitle = fk ? app.title.toLowerCase().includes(fk) : false;
  const inShort = fk ? app.summary.toLowerCase().includes(fk) : false;
  const longCount = fk ? countOccurrences(app.description, fk) : 0;
  const totalWords = tokenize(app.description).length || 1;
  const density = fk ? (countOccurrences(app.description, fk) * fk.split(' ').length) / totalWords : 0;
  const keywordSignals: Signal[] = [
    {
      key: 'kw-title', label: `Focus keyword in title${fk ? ` ("${fk}")` : ''}`, source: 'auto',
      detail: !fk ? 'No focus keyword detected.' : inTitle ? 'Focus keyword is in the title (highest-weighted field).' : 'Focus keyword missing from the title.',
      score: !fk ? null : inTitle ? 95 : 35,
      fix: fk && !inTitle ? `Work "${fk}" into the title — it is the strongest ranking signal on Play.` : undefined,
    },
    {
      key: 'kw-short', label: 'Focus keyword in short description', source: 'auto',
      detail: !fk ? 'No focus keyword detected.' : inShort ? 'Focus keyword appears in the short description.' : 'Focus keyword missing from the short description.',
      score: !fk ? null : inShort ? 90 : 45,
      fix: fk && !inShort ? `Include "${fk}" in the 80-char short description.` : undefined,
    },
    {
      key: 'kw-long', label: 'Focus keyword repetition in long description', source: 'auto',
      detail: !fk ? 'No focus keyword detected.' : `Appears ${longCount}× in the long description (≈${(density * 100).toFixed(1)}% density).`,
      score: !fk ? null : longCount >= 3 && density <= 0.035 ? 90 : longCount >= 1 ? 68 : 40,
      fix: fk && longCount < 3 ? `Repeat "${fk}" 3–5 times naturally across the description (avoid stuffing — keep density under ~3%).` : (density > 0.035 ? 'Density is high — ease off repetition to avoid looking like keyword stuffing.' : undefined),
    },
  ];

  // ---- Pillar 5: Visual assets (15) ----
  const shots = app.screenshots.length;
  const visualSignals: Signal[] = [
    {
      key: 'vis-icon', label: 'App icon', source: 'auto',
      detail: app.icon ? 'Icon present.' : 'No icon detected.',
      score: app.icon ? 100 : 0,
    },
    {
      key: 'vis-shots', label: 'Screenshots', source: 'auto',
      detail: `${shots} screenshot${shots === 1 ? '' : 's'} (Play shows up to 8; the first 2–3 drive most conversion).`,
      score: shots >= 6 ? 95 : shots >= 4 ? 82 : shots >= 2 ? 60 : shots === 1 ? 40 : 0,
      fix: shots < 4 ? 'Add screenshots up to 8, leading with captioned hero shots that state your top benefits.' : undefined,
    },
    {
      key: 'vis-feature', label: 'Feature graphic', source: 'auto',
      detail: app.headerImage ? 'Feature graphic present.' : 'No feature graphic — required to be featured and shown with a video.',
      score: app.headerImage ? 100 : 30,
      fix: app.headerImage ? undefined : 'Upload a 1024×500 feature graphic; it is required for promotion and editorial features.',
    },
    {
      key: 'vis-video', label: 'Promo video', source: 'auto',
      detail: app.video ? 'Promo video present.' : 'No promo video (optional but lifts conversion).',
      score: app.video ? 100 : 60,
      fix: app.video ? undefined : 'Consider a 30s promo video showing the core flow — optional, but a conversion booster.',
    },
  ];

  // ---- Pillar 6: Freshness & metadata (10) ----
  const daysSince = app.updated ? Math.floor((Date.now() - app.updated) / 86400000) : null;
  const freshSignals: Signal[] = [
    {
      key: 'fresh-updated', label: 'Last updated', source: 'auto',
      detail: daysSince == null ? 'Update date unknown.' : `Updated ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`,
      score: daysSince == null ? null : daysSince <= 90 ? 92 : daysSince <= 180 ? 72 : daysSince <= 365 ? 50 : 30,
      fix: daysSince != null && daysSince > 180 ? 'Ship an update — recency is a ranking and trust signal, and stale apps lose visibility.' : undefined,
    },
    {
      key: 'fresh-whatsnew', label: '"What\'s new" notes', source: 'auto',
      detail: app.recentChanges ? 'Release notes are filled in.' : 'No release notes on the latest version.',
      score: app.recentChanges ? 90 : 45,
      fix: app.recentChanges ? undefined : 'Write "What\'s new" notes each release — they reassure users and signal an actively maintained app.',
    },
    {
      key: 'fresh-category', label: 'Category & content rating', source: 'auto',
      detail: `${app.genre || 'No category'}${app.contentRating ? ` · ${app.contentRating}` : ' · no content rating'}.`,
      score: app.genre && app.contentRating ? 95 : app.genre ? 70 : 40,
      fix: !app.genre || !app.contentRating ? 'Set the most relevant category and complete the content rating questionnaire.' : undefined,
    },
  ];

  const pillarsRaw: Omit<Pillar, 'score' | 'points'>[] = [
    { key: 'title', label: 'Title', purpose: 'Highest-weighted field for ranking & tap-through', weight: 20, signals: titleSignals },
    { key: 'short', label: 'Short description', purpose: 'Indexed, above-the-fold hook', weight: 15, signals: shortSignals },
    { key: 'long', label: 'Long description', purpose: 'Keyword depth + conversion copy', weight: 20, signals: longSignals },
    { key: 'keywords', label: 'Keyword strategy', purpose: 'Focus-keyword coverage across fields', weight: 20, signals: keywordSignals },
    { key: 'visuals', label: 'Visual assets', purpose: 'Icon, screenshots, feature graphic, video', weight: 15, signals: visualSignals },
    { key: 'freshness', label: 'Freshness & metadata', purpose: 'Recency, release notes, category', weight: 10, signals: freshSignals },
  ];

  const pillars: Pillar[] = pillarsRaw.map((p) => {
    const score = avg(p.signals.map((s) => s.score));
    return { ...p, score, points: Math.round((score / 100) * p.weight) };
  });

  const overall = pillars.reduce((a, p) => a + p.points, 0);

  // Top fixes ranked by estimated point gain if the signal were raised to ~85.
  const TARGET = 85;
  const topFixes: Fix[] = [];
  for (const p of pillars) {
    const n = p.signals.filter((s) => s.score != null).length || 1;
    for (const s of p.signals) {
      if (s.score == null || s.score >= 65 || !s.fix) continue;
      const gain = Math.round(((p.weight * (TARGET - s.score)) / (n * 100)) * 10) / 10;
      topFixes.push({
        key: s.key,
        label: s.label,
        fix: s.fix,
        severity: s.score < 45 ? 'fail' : 'warn',
        tag: gain >= 1.2 ? 'high' : 'quick',
        gain,
      });
    }
  }
  topFixes.sort((a, b) => b.gain - a.gain);

  // Market signals — context, deliberately NOT in the score.
  const ratingTone: MarketSignal['tone'] = app.score == null ? 'na' : app.score >= 4.3 ? 'good' : app.score >= 3.8 ? 'mid' : 'bad';
  const marketSignals: MarketSignal[] = [
    { label: 'Average rating', detail: app.score != null ? `${app.score.toFixed(2)} ★ from ${fmt(app.ratings)} ratings` : 'No rating data', tone: ratingTone },
    { label: 'Reviews', detail: app.reviews != null ? `${fmt(app.reviews)} written reviews` : 'No review data', tone: app.reviews != null ? 'na' : 'na' },
    { label: 'Installs', detail: app.installs || 'Unknown', tone: app.minInstalls != null ? (app.minInstalls >= 1_000_000 ? 'good' : app.minInstalls >= 100_000 ? 'mid' : 'bad') : 'na' },
    { label: 'Released', detail: app.released || 'Unknown', tone: 'na' },
    { label: 'Monetization', detail: app.free ? (app.containsAds ? 'Free · contains ads' : 'Free') : `Paid${app.priceText ? ` · ${app.priceText}` : ''}`, tone: 'na' },
    { label: 'Developer', detail: app.developer || 'Unknown', tone: 'na' },
  ];

  return {
    overall,
    grade: gradeFor(overall),
    band: overall >= 70 ? 'High' : overall >= 50 ? 'Medium' : 'Low',
    pillars,
    marketSignals,
    keywords,
    focusKeyword,
    topFixes: topFixes.slice(0, 7),
  };
}

function fmt(n: number | null): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Compact per-app summary used by the competitor comparison table. */
export interface CompetitorRow {
  appId: string; title: string; icon: string | null; url: string;
  overall: number; grade: string; score: number | null; ratings: number | null;
  installs: string | null; titleLen: number; shortLen: number; longLen: number; screenshots: number;
}
export function competitorRow(app: AsoAppData): CompetitorRow {
  const r = auditListing(app);
  return {
    appId: app.appId, title: app.title, icon: app.icon, url: app.url,
    overall: r.overall, grade: r.grade, score: app.score, ratings: app.ratings,
    installs: app.installs, titleLen: app.title.length, shortLen: app.summary.length,
    longLen: app.description.length, screenshots: app.screenshots.length,
  };
}
