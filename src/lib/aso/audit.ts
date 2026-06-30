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
  focusKeyword: string | null; // the primary (first) focus keyword
  focusKeywords: string[]; // up to 3 evaluated keywords
  topFixes: Fix[];
}

/** Parse a focus-keyword input (string or array, comma/newline separated) into up to 3 clean terms. */
export function normalizeFocusList(input?: string | string[], fallback?: string | null): string[] {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[,\n;]+/);
  const list = [...new Set(raw.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 3);
  if (!list.length && fallback) return [fallback.toLowerCase()];
  return list;
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
  const counts = new Map<string, number>();
  const bump = (term: string) => counts.set(term, (counts.get(term) || 0) + 1);

  // Process each field separately so a phrase never spans a field boundary, and
  // only keep a bigram if the two words are truly contiguous in that field's text
  // (so "local news, breaking" never yields "news breaking" across the comma).
  for (const fieldL of [titleL, shortL, longL]) {
    const tokens = tokenize(fieldL);
    for (let i = 0; i < tokens.length; i++) {
      const w = tokens[i];
      if (!STOPWORDS.has(w)) bump(w);
      if (i + 1 < tokens.length) {
        const a = tokens[i], b = tokens[i + 1];
        if (!STOPWORDS.has(a) && !STOPWORDS.has(b) && fieldL.includes(`${a} ${b}`)) bump(`${a} ${b}`);
      }
    }
  }

  return [...counts.entries()]
    .filter(([t, c]) => c >= 2 || t.includes(' '))
    // Multi-word phrases are the real search queries — rank them above bare words.
    .sort((a, b) => {
      const ap = a[0].includes(' ') ? 1 : 0, bp = b[0].includes(' ') ? 1 : 0;
      return b[1] - a[1] || bp - ap || b[0].length - a[0].length;
    })
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
export function auditListing(app: AsoAppData, focusKeywordInput?: string | string[]): AsoReport {
  const keywords = extractKeywords(app);
  const focusKeywords = normalizeFocusList(focusKeywordInput, keywords[0] ? keywords[0].term : null);
  const focusKeyword = focusKeywords[0] || null;

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

  // ---- Pillar 4: Keyword strategy (20) — graded across up to 3 focus keywords ----
  const titleL = app.title.toLowerCase();
  const shortL = app.summary.toLowerCase();
  const n = focusKeywords.length;
  const inTitleKw = focusKeywords.filter((k) => titleL.includes(k));
  const inShortKw = focusKeywords.filter((k) => shortL.includes(k));
  const missingTitle = focusKeywords.filter((k) => !titleL.includes(k));
  const missingShort = focusKeywords.filter((k) => !shortL.includes(k));
  const longCovered = focusKeywords.filter((k) => countOccurrences(app.description, k) >= 1);
  const longRepeated = focusKeywords.filter((k) => countOccurrences(app.description, k) >= 3);
  const missingLong = focusKeywords.filter((k) => countOccurrences(app.description, k) < 1);
  const q = (arr: string[]) => arr.map((k) => `“${k}”`).join(', ');
  const frac = (c: number) => (n ? c / n : 0);
  const keywordSignals: Signal[] = [
    {
      key: 'kw-title', label: n > 1 ? `Focus keywords in title (${inTitleKw.length}/${n})` : `Focus keyword in title${focusKeyword ? ` ("${focusKeyword}")` : ''}`, source: 'auto',
      detail: !n ? 'No focus keyword detected.' : inTitleKw.length === n ? `All focus keyword(s) appear in the title — the highest-weighted field.` : `${inTitleKw.length} of ${n} in the title. Missing: ${q(missingTitle)}.`,
      score: !n ? null : Math.round(35 + 60 * frac(inTitleKw.length)),
      fix: missingTitle.length ? `Work ${q(missingTitle)} into the title where they fit — it is the strongest ranking signal on Play (titles cap at ${LIMITS.title} chars, so prioritise the highest-volume term).` : undefined,
    },
    {
      key: 'kw-short', label: n > 1 ? `Focus keywords in short description (${inShortKw.length}/${n})` : 'Focus keyword in short description', source: 'auto',
      detail: !n ? 'No focus keyword detected.' : inShortKw.length === n ? 'All focus keyword(s) appear in the short description.' : `${inShortKw.length} of ${n} in the short description. Missing: ${q(missingShort)}.`,
      score: !n ? null : Math.round(45 + 50 * frac(inShortKw.length)),
      fix: missingShort.length ? `Fit ${q(missingShort)} into the 80-char short description.` : undefined,
    },
    {
      key: 'kw-long', label: n > 1 ? `Focus keywords in long description (${longCovered.length}/${n})` : 'Focus keyword repetition in long description', source: 'auto',
      detail: !n ? 'No focus keyword detected.' : `${longCovered.length} of ${n} present; ${longRepeated.length} repeated 3+ times.${missingLong.length ? ` Missing: ${q(missingLong)}.` : ''}`,
      score: !n ? null : Math.round(40 + 30 * frac(longCovered.length) + 20 * frac(longRepeated.length)),
      fix: (missingLong.length || longRepeated.length < n) ? `Use each focus keyword 3–5 times naturally across the description${missingLong.length ? ` (currently missing: ${q(missingLong)})` : ''} — without stuffing.` : undefined,
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
    focusKeywords,
    topFixes: topFixes.slice(0, 7),
  };
}

function fmt(n: number | null): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Coverage of a single keyword across an app's listing fields. */
export interface KeywordCoverage { inTitle: boolean; inShort: boolean; inLong: boolean; longCount: number; }
export function keywordCoverage(app: AsoAppData, keyword?: string): KeywordCoverage {
  const fk = (keyword || '').trim().toLowerCase();
  if (!fk) return { inTitle: false, inShort: false, inLong: false, longCount: 0 };
  return {
    inTitle: app.title.toLowerCase().includes(fk),
    inShort: app.summary.toLowerCase().includes(fk),
    inLong: app.description.toLowerCase().includes(fk),
    longCount: countOccurrences(app.description, fk),
  };
}

/** Compact per-app summary used by the competitor comparison + keyword head-to-head. */
export interface CompetitorRow {
  appId: string; title: string; icon: string | null; url: string;
  overall: number; grade: string; score: number | null; ratings: number | null;
  installs: string | null; minInstalls: number | null;
  titleLen: number; shortLen: number; longLen: number; screenshots: number;
  focus: KeywordCoverage; // coverage of the primary focus keyword (back-compat)
  focusList: KeywordCoverage[]; // coverage of each focus keyword, aligned to focusKeywords
  summary: string; description: string; // the rival's actual listing copy
}
export function competitorRow(app: AsoAppData, focusKeywords?: string | string[]): CompetitorRow {
  const list = normalizeFocusList(focusKeywords);
  const r = auditListing(app, list.length ? list : undefined);
  return {
    appId: app.appId, title: app.title, icon: app.icon, url: app.url,
    overall: r.overall, grade: r.grade, score: app.score, ratings: app.ratings,
    installs: app.installs, minInstalls: app.minInstalls,
    titleLen: app.title.length, shortLen: app.summary.length,
    longLen: app.description.length, screenshots: app.screenshots.length,
    focus: keywordCoverage(app, list[0]),
    focusList: list.map((k) => keywordCoverage(app, k)),
    summary: app.summary, description: app.description,
  };
}

/**
 * Keyword MATRIX: for the important terms (your top keywords + the gap terms),
 * who uses each one — you vs every competitor. Powers the "You vs competitors"
 * comparison tab. `inTitle` flags the strongest placement.
 */
export interface MatrixRow { term: string; yours: boolean; yoursTitle: boolean; competitors: boolean[]; gap: boolean; }
export interface KeywordMatrix { columns: string[]; rows: MatrixRow[] }
export function keywordMatrix(primary: AsoAppData, competitors: AsoAppData[], gap: GapKeyword[], limit = 16): KeywordMatrix {
  const fullL = (a: AsoAppData) => `${a.title} ${a.summary} ${a.description}`.toLowerCase();
  const pLong = fullL(primary);
  const pTitle = primary.title.toLowerCase();
  const compLong = competitors.map(fullL);

  // Rows = your strongest keywords + the gap terms (deduped, capped).
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const t of [...extractKeywords(primary, 12).map((k) => k.term), ...gap.map((g) => g.term)]) {
    if (!seen.has(t)) { seen.add(t); terms.push(t); }
    if (terms.length >= limit) break;
  }

  const rows: MatrixRow[] = terms.map((term) => {
    const yours = pLong.includes(term);
    return {
      term,
      yours,
      yoursTitle: pTitle.includes(term),
      competitors: compLong.map((t) => t.includes(term)),
      gap: !yours, // you don't use it but it's on the list because a rival does
    };
  });
  return { columns: competitors.map((c) => c.title), rows };
}

/**
 * Keyword GAP: terms competitors build their listings around that the primary
 * app does NOT use anywhere. This is the "what are they ranking for that I'm
 * missing" view. Terms used by more competitors — and placed in their titles /
 * short descriptions — rank higher, because that's a stronger category signal.
 */
export interface GapKeyword {
  term: string;
  competitors: number; // how many rival apps use it
  inTitle: number; // how many put it in their title
  inShort: number; // how many put it in their short description
  apps: string[]; // example rival titles using it
}
export function keywordGap(primary: AsoAppData, competitors: AsoAppData[], limit = 12): GapKeyword[] {
  if (!competitors.length) return [];
  const primaryText = `${primary.title} ${primary.summary} ${primary.description}`.toLowerCase();
  const primaryTokens = new Set(tokenize(primaryText));
  const map = new Map<string, { apps: Set<string>; titles: Set<string>; inTitle: number; inShort: number }>();

  for (const c of competitors) {
    for (const k of extractKeywords(c, 25)) {
      // Skip anything the primary already uses (substring or token match), and
      // skip the competitor's own brand token (its name appears in its title).
      if (primaryText.includes(k.term)) continue;
      if (!k.term.includes(' ') && primaryTokens.has(k.term)) continue;
      const brandTokens = tokenize(c.title);
      if (!k.term.includes(' ') && brandTokens.slice(0, 1).includes(k.term)) continue;

      let e = map.get(k.term);
      if (!e) { e = { apps: new Set(), titles: new Set(), inTitle: 0, inShort: 0 }; map.set(k.term, e); }
      if (!e.apps.has(c.appId)) { e.apps.add(c.appId); e.titles.add(c.title); }
      if (k.inTitle) e.inTitle++;
      if (k.inShort) e.inShort++;
    }
  }

  const ranked = [...map.entries()]
    .map(([term, e]) => ({ term, competitors: e.apps.size, inTitle: e.inTitle, inShort: e.inShort, apps: [...e.titles] }))
    // Phrases first (they're the searchable queries), then breadth, then placement.
    .sort((a, b) => {
      const ap = a.term.includes(' ') ? 1 : 0, bp = b.term.includes(' ') ? 1 : 0;
      return bp - ap ||
        b.competitors - a.competitors ||
        (b.inTitle * 2 + b.inShort) - (a.inTitle * 2 + a.inShort) ||
        b.term.length - a.term.length;
    });

  // Drop bare single words once a chosen phrase already contains them, so the gap
  // reads as "breaking news / news alerts", not "breaking, news, alerts, world".
  const chosen: GapKeyword[] = [];
  const phraseWords = new Set<string>();
  for (const g of ranked) {
    if (g.term.includes(' ')) {
      chosen.push(g);
      g.term.split(' ').forEach((w) => phraseWords.add(w));
    } else if (!phraseWords.has(g.term) && g.competitors >= 2) {
      // keep a lone word only if it's broadly used and not already inside a phrase
      chosen.push(g);
    }
    if (chosen.length >= limit) break;
  }
  return chosen;
}
