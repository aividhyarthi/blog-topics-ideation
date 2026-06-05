// AEO (Answer Engine Optimization) scoring engine.
//
// Grades how likely an article/page is to be extracted and cited by LLM answer
// engines (ChatGPT, Perplexity, Google AI Overviews, Gemini, Copilot).
//
// Weighting is evidence-based (Princeton GEO paper KDD'24; Ahrefs 75k-brand &
// AI-Overview citation studies, 2025-26). Headline findings baked in here:
//   - Off-page brand/entity prominence is the strongest correlate of LLM
//     citation (≈0.66 vs ≈0.22 for backlinks) — its own pillar, weighted 25%.
//   - Citing sources, adding statistics, and adding quotations are the only
//     experimentally CAUSAL on-page levers (+30-40%) — elevated to first-class.
//   - Conciseness beats length (length r≈0.04; 53% of AI Overview citations are
//     <1,000 words) — bloat is penalised, not rewarded.
//   - Schema/structured-data evidence is weak and llms.txt is debunked — that
//     pillar is demoted to 8% and llms.txt is not scored.
//
// Most signals are scored DETERMINISTICALLY here (cheap, no LLM) by parsing the
// HTML. A smaller set of judgement calls (answer quality, semantic coverage,
// and the off-page brand-prominence ESTIMATE) are scored by Claude in the API
// route and merged in. Weights live in PILLARS / signal definitions so the
// rubric can be tuned in one place.

// ---- types ------------------------------------------------------------------

export type SignalStatus = 'pass' | 'warn' | 'fail' | 'na';

export interface Signal {
  id: string;
  label: string;
  pillar: PillarId;
  /** 0-100; null when not applicable (excluded from scoring). */
  score: number | null;
  /** relative weight of this signal inside its pillar (normalised at roll-up). */
  weight: number;
  status: SignalStatus;
  /** what we observed. */
  detail: string;
  /** how to improve it (empty when already good). */
  fix?: string;
  /** 'auto' = parsed deterministically, 'ai' = judged/estimated by Claude. */
  source: 'auto' | 'ai';
}

export type PillarId =
  | 'answerability'
  | 'offpage'
  | 'authority'
  | 'semantic'
  | 'structured'
  | 'readability';

export interface PillarResult {
  id: PillarId;
  label: string;
  weight: number;
  score: number; // 0-100
  signals: Signal[];
}

export interface AeoReport {
  overall: number; // 0-100
  grade: string; // A+ … F
  pillars: PillarResult[];
  topFixes: { label: string; severity: SignalStatus; fix: string; pillar: PillarId }[];
}

// Pillar definitions + weights (must sum to 1). Tune here.
export const PILLARS: { id: PillarId; label: string; weight: number }[] = [
  { id: 'offpage', label: 'Off-page Authority & Brand Prominence', weight: 0.25 },
  { id: 'authority', label: 'On-page Trust & Evidence Density', weight: 0.23 },
  { id: 'answerability', label: 'Answerability & Structure', weight: 0.22 },
  { id: 'semantic', label: 'Semantic Coverage & Intent Match', weight: 0.15 },
  { id: 'structured', label: 'Structured Data & Machine Readability', weight: 0.08 },
  { id: 'readability', label: 'Readability & Hygiene', weight: 0.07 },
];

const PILLAR_LABEL: Record<PillarId, string> = Object.fromEntries(
  PILLARS.map((p) => [p.id, p.label]),
) as Record<PillarId, string>;

// ---- low-level HTML helpers -------------------------------------------------

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function pickMeta(html: string, name: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]).trim();
  }
  return '';
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const QUESTION_RE = /^(what|how|why|when|where|who|which|can|do|does|is|are|should|will|would|could|did|has|have|best|top)\b/i;

// ---- page facts -------------------------------------------------------------

export interface Heading {
  level: number;
  text: string;
}

export interface PageFacts {
  isUrl: boolean;
  host: string;
  brand: string;
  topic: string;
  title: string;
  metaDescription: string;
  canonical: string;
  robotsMeta: string;
  headings: Heading[];
  h1Count: number;
  wordCount: number;
  paragraphs: number[]; // word count per paragraph
  sentences: number;
  syllables: number;
  lists: number;
  tables: number;
  images: number;
  imagesWithAlt: number;
  internalLinks: number;
  externalLinks: number;
  statistics: number; // count of numeric/statistical mentions
  blockquotes: number;
  quotedPhrases: number;
  schemaTypes: string[]; // JSON-LD @type values
  hasFaqHeading: boolean;
  hasTldr: boolean;
  hasAuthor: boolean;
  datePublished: string;
  dateModified: string;
  hasVideo: boolean;
  // URL-only signals (null when pasted)
  robotsTxtBlocks: boolean | null;
  hasLlmsTxt: boolean | null; // informational only — NOT scored (debunked)
  // body text (truncated) for the LLM pass
  text: string;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

export function analyzeHtml(
  html: string,
  opts: {
    isUrl: boolean;
    host?: string;
    brand?: string;
    topic?: string;
    robotsTxt?: string | null;
    llmsTxt?: boolean | null;
  },
): PageFacts {
  const title = (() => {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
  })();
  const metaDescription = pickMeta(html, 'description') || pickMeta(html, 'og:description');
  const canonicalM = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const canonical = canonicalM ? canonicalM[1] : '';
  const robotsMeta = pickMeta(html, 'robots');

  // Headings with levels.
  const headings: Heading[] = [];
  for (const m of html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (text) headings.push({ level: Number(m[1]), text });
  }
  const h1Count = headings.filter((h) => h.level === 1).length;

  // Try to isolate the main article body for text metrics; fall back to full doc.
  const articleM = html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i);
  const bodyHtml = articleM ? articleM[0] : html;

  // Paragraph word counts.
  const paragraphs: number[] = [];
  for (const m of bodyHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = stripTags(m[1]);
    const wc = t ? t.split(/\s+/).length : 0;
    if (wc > 0) paragraphs.push(wc);
  }

  const text = stripTags(bodyHtml);
  const words = text ? text.split(/\s+/) : [];
  const wordCount = words.length;
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length);
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);

  const lists = (bodyHtml.match(/<(ul|ol)\b/gi) || []).length;
  const tables = (bodyHtml.match(/<table\b/gi) || []).length;

  const imgTags = bodyHtml.match(/<img\b[^>]*>/gi) || [];
  const images = imgTags.length;
  const imagesWithAlt = imgTags.filter((t) => /\salt=["'][^"']+["']/i.test(t)).length;

  // Links: classify internal vs external by host.
  let internalLinks = 0;
  let externalLinks = 0;
  const baseHost = (opts.host || '').replace(/^www\./, '');
  for (const m of bodyHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (/^(mailto:|tel:|#|javascript:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      try {
        const h = new URL(href).host.replace(/^www\./, '');
        if (baseHost && h === baseHost) internalLinks++;
        else externalLinks++;
      } catch {
        externalLinks++;
      }
    } else {
      internalLinks++; // relative link
    }
  }

  // Statistics / data points: percentages, big numbers, scaled quantities.
  const statistics =
    (text.match(/\b\d+(\.\d+)?\s?%/g) || []).length +
    (text.match(/\b\d{1,3}(,\d{3})+(\.\d+)?\b/g) || []).length +
    (text.match(/\b\d+(\.\d+)?\s?(million|billion|thousand|crore|lakh|x|times|out of|in \d)/gi) || []).length;

  // Quotations: <blockquote> tags + attributed quoted phrases.
  const blockquotes = (bodyHtml.match(/<blockquote\b/gi) || []).length;
  const quotedPhrases = (text.match(/[“"][^”"]{25,}[”"]/g) || []).length;

  // JSON-LD schema types.
  const schemaTypes = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const collect = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(collect);
        const obj = node as Record<string, unknown>;
        const t = obj['@type'];
        if (typeof t === 'string') schemaTypes.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && schemaTypes.add(x));
        if (Array.isArray(obj['@graph'])) (obj['@graph'] as unknown[]).forEach(collect);
        if (obj.mainEntity) collect(obj.mainEntity);
      };
      collect(data);
    } catch {
      // tolerate malformed JSON-LD
    }
  }

  const headingText = headings.map((h) => h.text.toLowerCase());
  const hasFaqHeading =
    schemaTypes.has('FAQPage') || headingText.some((h) => /\bfaqs?\b|frequently asked/i.test(h));
  const hasTldr = headingText.some((h) =>
    /\btl;?dr\b|key takeaways?|in short|summary|quick answer|at a glance/i.test(h),
  );

  const hasAuthor =
    schemaTypes.has('Person') ||
    /"author"\s*:/i.test(html) ||
    Boolean(pickMeta(html, 'author')) ||
    /rel=["']author["']/i.test(html) ||
    /class=["'][^"']*\bauthor\b[^"']*["']/i.test(html) ||
    /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text.slice(0, 600));

  const datePublished =
    pickMeta(html, 'article:published_time') ||
    (html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1] ?? '') ||
    (html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] ?? '');
  const dateModified =
    pickMeta(html, 'article:modified_time') ||
    (html.match(/"dateModified"\s*:\s*"([^"]+)"/i)?.[1] ?? '');

  const hasVideo = /<video\b|youtube\.com\/embed|player\.vimeo\.com/i.test(html);

  return {
    isUrl: opts.isUrl,
    host: opts.host || '',
    brand: opts.brand || '',
    topic: opts.topic || '',
    title,
    metaDescription,
    canonical,
    robotsMeta,
    headings,
    h1Count,
    wordCount,
    paragraphs,
    sentences,
    syllables,
    lists,
    tables,
    images,
    imagesWithAlt,
    internalLinks,
    externalLinks,
    statistics,
    blockquotes,
    quotedPhrases,
    schemaTypes: [...schemaTypes],
    hasFaqHeading,
    hasTldr,
    hasAuthor,
    datePublished,
    dateModified,
    hasVideo,
    robotsTxtBlocks: opts.isUrl ? Boolean(opts.robotsTxt && /Disallow:\s*\/\s*$/im.test(opts.robotsTxt)) : null,
    hasLlmsTxt: opts.isUrl ? (opts.llmsTxt ?? null) : null,
    text: text.slice(0, 9000),
  };
}

// ---- deterministic scoring --------------------------------------------------

const c = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function statusFor(score: number | null): SignalStatus {
  if (score == null) return 'na';
  if (score >= 75) return 'pass';
  if (score >= 45) return 'warn';
  return 'fail';
}

function sig(s: Omit<Signal, 'status' | 'source'> & { source?: 'auto' | 'ai' }): Signal {
  return { ...s, status: statusFor(s.score), source: s.source ?? 'auto' };
}

export function deterministicSignals(f: PageFacts): Signal[] {
  const out: Signal[] = [];

  // --- Pillar: Answerability & Structure (0.22) -------------------------
  const subHeadings = f.headings.filter((h) => h.level >= 2);
  const qShare = subHeadings.length
    ? subHeadings.filter((h) => QUESTION_RE.test(h.text) || h.text.includes('?')).length / subHeadings.length
    : 0;
  out.push(
    sig({
      id: 'question_headings',
      label: 'Question-shaped headings',
      pillar: 'answerability',
      weight: 0.14,
      score: subHeadings.length === 0 ? 20 : c(20 + qShare * 90),
      detail: subHeadings.length
        ? `${Math.round(qShare * 100)}% of H2/H3 are phrased as questions (${subHeadings.length} subheadings).`
        : 'No H2/H3 subheadings found.',
      fix: qShare < 0.4 ? 'Rewrite key H2/H3s as the exact questions users ask (e.g. "How long does X last?").' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'lists_tables',
      label: 'Lists, tables & steps',
      pillar: 'answerability',
      weight: 0.14,
      score: c(Math.min(100, f.lists * 30 + f.tables * 40)),
      detail: `${f.lists} list(s), ${f.tables} table(s).`,
      fix: f.lists + f.tables === 0 ? 'Add bullet lists, comparison tables, or numbered steps — structured blocks are cited disproportionately often.' : undefined,
    }),
  );

  // Conciseness: AEO favours tight, focused pages, not length.
  out.push(
    sig({
      id: 'conciseness',
      label: 'Conciseness (answer efficiency)',
      pillar: 'answerability',
      weight: 0.1,
      score: (() => {
        const w = f.wordCount;
        if (w < 150) return 35; // too thin to be a credible answer
        if (w < 300) return 70;
        if (w <= 1800) return 100; // sweet spot — most AI citations are <1k words
        if (w <= 3000) return 80;
        return 60;
      })(),
      detail: `${f.wordCount} words.`,
      fix: f.wordCount > 3000
        ? 'Tighten or split — 53% of AI Overview citations are under 1,000 words. Lead with the answer; cut filler.'
        : f.wordCount < 150
          ? 'Too thin to be cited — add substantive, specific coverage.'
          : undefined,
    }),
  );

  const avgPara = f.paragraphs.length ? f.paragraphs.reduce((a, b) => a + b, 0) / f.paragraphs.length : 0;
  out.push(
    sig({
      id: 'paragraph_length',
      label: 'Scannable paragraphs',
      pillar: 'answerability',
      weight: 0.06,
      score: avgPara === 0 ? 40 : c(120 - Math.max(0, avgPara - 40) * 3),
      detail: avgPara ? `Average paragraph ≈ ${Math.round(avgPara)} words.` : 'Could not detect paragraph structure.',
      fix: avgPara > 60 ? 'Break long paragraphs into 2-4 sentence chunks so each idea is self-contained and extractable.' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'tldr',
      label: 'TL;DR / key-takeaways block',
      pillar: 'answerability',
      weight: 0.06,
      score: f.hasTldr ? 100 : 25,
      detail: f.hasTldr ? 'A summary / key-takeaways block was detected.' : 'No TL;DR / key-takeaways block found.',
      fix: f.hasTldr ? undefined : 'Add a short "Key takeaways" or "Quick answer" block near the top that an engine can lift verbatim.',
    }),
  );

  out.push(
    sig({
      id: 'faq',
      label: 'FAQ section',
      pillar: 'answerability',
      weight: 0.06,
      score: f.hasFaqHeading ? 100 : 30,
      detail: f.hasFaqHeading ? 'An FAQ section / FAQPage was detected.' : 'No FAQ section found.',
      fix: f.hasFaqHeading ? undefined : 'Add an FAQ section answering the most common follow-up questions concisely.',
    }),
  );

  // --- Pillar: On-page Trust & Evidence Density (0.23) -------------------
  // The three Princeton GEO levers (statistics, citations, quotations) lead.
  out.push(
    sig({
      id: 'statistics',
      label: 'Statistics & data points',
      pillar: 'authority',
      weight: 0.22,
      score: c(Math.min(100, f.statistics * 18)),
      detail: `${f.statistics} statistic/number/data mention(s) detected.`,
      fix: f.statistics < 3 ? 'Add concrete statistics, figures and data points — a proven, causal lever for LLM citation (Princeton GEO).' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'citations',
      label: 'Outbound citations to sources',
      pillar: 'authority',
      weight: 0.2,
      score: c(Math.min(100, f.externalLinks * 25)),
      detail: `${f.externalLinks} outbound link(s) to other domains.`,
      fix: f.externalLinks < 2 ? 'Cite authoritative external sources (studies, official docs) — the single highest-uplift GEO method.' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'quotations',
      label: 'Expert quotations',
      pillar: 'authority',
      weight: 0.14,
      score: c(Math.min(100, f.blockquotes * 40 + Math.min(f.quotedPhrases, 4) * 15)),
      detail: `${f.blockquotes} blockquote(s), ${f.quotedPhrases} attributed quote(s).`,
      fix: f.blockquotes + f.quotedPhrases < 1 ? 'Add expert/source quotations — one of the top three GEO levers for being cited.' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'author',
      label: 'Named author / byline',
      pillar: 'authority',
      weight: 0.16,
      score: f.hasAuthor ? 90 : 20,
      detail: f.hasAuthor ? 'An author / byline was detected.' : 'No author or byline detected.',
      fix: f.hasAuthor ? undefined : 'Add a named author with a short credentialed bio (and Person/author schema).',
    }),
  );

  const freshness = (() => {
    const d = f.dateModified || f.datePublished;
    if (!d) return { score: 25, note: 'No publish/updated date found.' };
    const t = Date.parse(d);
    if (isNaN(t)) return { score: 50, note: `Date present but unparseable (${d}).` };
    const months = (Date.now() - t) / (1000 * 60 * 60 * 24 * 30);
    const score = months <= 6 ? 100 : months <= 12 ? 85 : months <= 24 ? 55 : 30;
    return { score, note: `Last dated ${Math.round(months)} month(s) ago.` };
  })();
  out.push(
    sig({
      id: 'freshness',
      label: 'Freshness & recency',
      pillar: 'authority',
      weight: 0.14,
      score: freshness.score,
      detail: freshness.note,
      fix: freshness.score < 60 ? 'Refresh and re-date the content — AI-cited pages are ~26% fresher; recency strongly favoured.' : undefined,
    }),
  );

  // --- Pillar: Structured Data & Machine Readability (0.08) -------------
  const valuableSchema = ['FAQPage', 'HowTo', 'Article', 'NewsArticle', 'BlogPosting', 'Product', 'BreadcrumbList', 'Recipe'];
  const matched = f.schemaTypes.filter((t) => valuableSchema.includes(t));
  out.push(
    sig({
      id: 'schema',
      label: 'Schema.org structured data',
      pillar: 'structured',
      weight: 0.3,
      score: matched.length === 0 ? 25 : c(55 + matched.length * 20),
      detail: f.schemaTypes.length ? `Detected: ${f.schemaTypes.join(', ')}.` : 'No JSON-LD schema found.',
      fix: matched.length === 0 ? 'Add JSON-LD schema (Article + FAQPage/HowTo where relevant) — a modest comprehension aid.' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'heading_hierarchy',
      label: 'Heading hierarchy',
      pillar: 'structured',
      weight: 0.25,
      score: (() => {
        if (f.headings.length === 0) return 15;
        let s = 100;
        if (f.h1Count === 0) s -= 40;
        if (f.h1Count > 1) s -= 25;
        let prev = 0;
        for (const h of f.headings) {
          if (prev && h.level > prev + 1) s -= 10;
          prev = h.level;
        }
        return c(s);
      })(),
      detail: `${f.h1Count} H1, ${f.headings.length} headings total.`,
      fix: f.h1Count !== 1 ? 'Use exactly one H1 and a clean nested H2/H3 hierarchy (no skipped levels).' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'meta',
      label: 'Title & meta description',
      pillar: 'structured',
      weight: 0.2,
      score: (() => {
        let s = 0;
        if (f.title) s += 50;
        if (f.title.length >= 20 && f.title.length <= 70) s += 10;
        if (f.metaDescription) s += 30;
        if (f.metaDescription.length >= 70 && f.metaDescription.length <= 165) s += 10;
        return c(s);
      })(),
      detail: `Title ${f.title ? `"${f.title.slice(0, 60)}…" (${f.title.length} chars)` : 'missing'}; meta description ${f.metaDescription ? `${f.metaDescription.length} chars` : 'missing'}.`,
      fix: !f.title || !f.metaDescription ? 'Add a descriptive <title> (~50-60 chars) and meta description (~120-155 chars).' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'image_alt',
      label: 'Image alt text',
      pillar: 'structured',
      weight: 0.15,
      score: f.images === 0 ? null : c((f.imagesWithAlt / f.images) * 100),
      detail: f.images === 0 ? 'No images on the page.' : `${f.imagesWithAlt}/${f.images} images have alt text.`,
      fix: f.images > 0 && f.imagesWithAlt < f.images ? 'Add descriptive alt text to every meaningful image.' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'crawlable',
      label: 'Crawlable by AI bots',
      pillar: 'structured',
      weight: 0.1,
      score: !f.isUrl
        ? null
        : (() => {
            let s = 100;
            if (/noindex/i.test(f.robotsMeta)) s -= 70;
            if (f.robotsTxtBlocks) s -= 40;
            return c(s);
          })(),
      detail: !f.isUrl
        ? 'Pasted content — crawlability not checked.'
        : `robots meta: ${f.robotsMeta || 'none'}; site-wide robots.txt block: ${f.robotsTxtBlocks ? 'yes' : 'no'}.`,
      fix: f.isUrl && (/noindex/i.test(f.robotsMeta) || f.robotsTxtBlocks)
        ? 'Remove noindex / robots.txt blocks so AI crawlers (GPTBot, PerplexityBot, Google-Extended) can read the page.'
        : undefined,
    }),
  );

  // --- Pillar: Readability & Hygiene (0.07) -----------------------------
  const flesch = f.wordCount
    ? 206.835 - 1.015 * (f.wordCount / f.sentences) - 84.6 * (f.syllables / Math.max(1, f.wordCount))
    : 0;
  out.push(
    sig({
      id: 'readability',
      label: 'Reading ease',
      pillar: 'readability',
      weight: 0.35,
      score: f.wordCount < 50 ? null : c(Math.max(0, Math.min(100, flesch))),
      detail: f.wordCount < 50 ? 'Not enough text to assess.' : `Flesch reading ease ≈ ${Math.round(flesch)} (higher is easier).`,
      fix: f.wordCount >= 50 && flesch < 50 ? 'Simplify: shorter sentences, plainer words. Aim for a Flesch score of 60+.' : undefined,
    }),
  );

  const stuffing = (() => {
    const stop = new Set('the a an and or but of to in on for with is are was were be been being this that these those it its as at by from your you we our i he she they them his her their what how why when where which who can do does will would should'.split(' '));
    const words = f.text.toLowerCase().match(/[a-z]{3,}/g) || [];
    if (words.length < 80) return { density: 0, word: '' };
    const freq = new Map<string, number>();
    for (const w of words) if (!stop.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
    let top = '';
    let max = 0;
    for (const [w, n] of freq) if (n > max) { max = n; top = w; }
    return { density: max / words.length, word: top };
  })();
  out.push(
    sig({
      id: 'keyword_stuffing',
      label: 'No keyword stuffing',
      pillar: 'readability',
      weight: 0.35,
      score: f.wordCount < 80 ? null : c(100 - Math.max(0, stuffing.density * 100 - 3) * 25),
      detail: f.wordCount < 80 ? 'Not enough text to assess.' : `Top term "${stuffing.word}" = ${(stuffing.density * 100).toFixed(1)}% of words.`,
      fix: stuffing.density > 0.04 ? `Reduce repetition of "${stuffing.word}" — keyword stuffing is confirmed to give zero AEO benefit (and hurts on Perplexity).` : undefined,
    }),
  );

  out.push(
    sig({
      id: 'multimedia',
      label: 'Multimedia',
      pillar: 'readability',
      weight: 0.15,
      score: c((f.images > 0 ? 60 : 0) + (f.hasVideo ? 40 : 0)),
      detail: `${f.images} image(s)${f.hasVideo ? ', video present' : ''}.`,
      fix: f.images === 0 && !f.hasVideo ? 'Add relevant images/diagrams or video to enrich the page.' : undefined,
    }),
  );

  out.push(
    sig({
      id: 'internal_links',
      label: 'Internal links',
      pillar: 'readability',
      weight: 0.15,
      score: c(Math.min(100, f.internalLinks * 20)),
      detail: `${f.internalLinks} internal link(s).`,
      fix: f.internalLinks < 2 ? 'Link to related pages on your site to build topical context.' : undefined,
    }),
  );

  return out;
}

// ---- LLM signals (judged/estimated by Claude, merged here) ------------------

export interface LlmScores {
  // Answerability
  directAnswer?: number;
  selfContained?: number;
  // Semantic
  answersTarget?: number;
  topicalDepth?: number;
  entityCoverage?: number;
  clearIntent?: number;
  // On-page trust
  originalInfo?: number;
  // Off-page (ESTIMATED from Claude's training knowledge — clearly an estimate)
  brandAuthority?: number;
  offpageCorroboration?: number;
  detectedIntent?: string;
  notes?: Partial<Record<string, string>>;
  fixes?: { signal?: string; recommendation: string; severity?: SignalStatus }[];
}

export function llmSignals(llm: LlmScores, hasTarget: boolean): Signal[] {
  const mk = (
    id: string,
    label: string,
    pillar: PillarId,
    weight: number,
    score: number | undefined,
    fixFallback: string,
  ): Signal =>
    sig({
      id,
      label,
      pillar,
      weight,
      score: typeof score === 'number' ? c(score) : 50,
      detail: llm.notes?.[id] || (typeof score === 'number' ? `Estimated ${c(score)}/100 by Claude.` : 'Not assessed.'),
      fix: (typeof score === 'number' ? c(score) : 50) < 70 ? fixFallback : undefined,
      source: 'ai',
    });

  const out: Signal[] = [
    // Off-page pillar — the #1 evidence-based driver, but ESTIMATED here.
    mk('brand_authority', 'Brand / entity prominence (estimated)', 'offpage', 0.65, llm.brandAuthority,
      'Build brand visibility off-page: earn brand mentions (linked & unlinked), PR, and presence where your audience asks questions. This is the strongest driver of LLM citation.'),
    mk('offpage_corroboration', 'Off-domain corroboration (estimated)', 'offpage', 0.35, llm.offpageCorroboration,
      'Get cited/mentioned on consensus sources LLMs trust (Wikipedia, Reddit, YouTube, industry roundups) and earn authoritative backlinks.'),

    // Answerability AI signals.
    mk('direct_answer', 'Direct answer up-front', 'answerability', 0.28, llm.directAnswer,
      'Put a concise, quotable answer in the first 1-2 sentences under each question heading.'),
    mk('self_contained', 'Self-contained chunks', 'answerability', 0.16, llm.selfContained,
      'Make each section understandable on its own — engines retrieve isolated passages.'),

    // Semantic pillar.
    mk('topical_depth', 'Topical depth & sub-questions', 'semantic', 0.3, llm.topicalDepth,
      'Cover the related sub-questions and angles a reader (and an LLM) would expect on this topic.'),
    mk('entity_coverage', 'Entity coverage', 'semantic', 0.22, llm.entityCoverage,
      'Name the concrete entities (products, ingredients, brands, places) relevant to the query.'),
    mk('clear_intent', 'Clear single intent', 'semantic', 0.18, llm.clearIntent,
      'Keep one clear intent per page (info / comparison / how-to / transactional).'),

    // On-page trust AI signal.
    mk('original_info', 'Original / credible info', 'authority', 0.14, llm.originalInfo,
      'Add first-party data, expert quotes, or original analysis rather than rehashed content.'),
  ];

  out.push(
    sig({
      id: 'answers_target',
      label: hasTarget ? 'Answers the target question' : 'Answer completeness',
      pillar: 'semantic',
      weight: 0.3,
      score: typeof llm.answersTarget === 'number' ? c(llm.answersTarget) : hasTarget ? 50 : null,
      detail: llm.notes?.answers_target || (typeof llm.answersTarget === 'number' ? `Scored ${c(llm.answersTarget)}/100.` : 'No target question provided.'),
      fix: typeof llm.answersTarget === 'number' && c(llm.answersTarget) < 70
        ? 'Answer the target question directly, completely, and early on the page.'
        : undefined,
      source: 'ai',
    }),
  );

  return out;
}

// ---- combine + score --------------------------------------------------------

function gradeFor(n: number): string {
  if (n >= 90) return 'A+';
  if (n >= 85) return 'A';
  if (n >= 80) return 'A-';
  if (n >= 75) return 'B+';
  if (n >= 70) return 'B';
  if (n >= 65) return 'B-';
  if (n >= 60) return 'C+';
  if (n >= 55) return 'C';
  if (n >= 50) return 'C-';
  if (n >= 45) return 'D+';
  if (n >= 40) return 'D';
  return 'F';
}

export function buildReport(deterministic: Signal[], llm: Signal[]): AeoReport {
  const all = [...deterministic, ...llm];

  const pillars: PillarResult[] = PILLARS.map((p) => {
    const signals = all.filter((s) => s.pillar === p.id);
    const scored = signals.filter((s) => s.score != null && s.weight > 0);
    const wsum = scored.reduce((a, s) => a + s.weight, 0) || 1;
    const score = scored.reduce((a, s) => a + (s.score as number) * s.weight, 0) / wsum;
    return { id: p.id, label: p.label, weight: p.weight, score: Math.round(score), signals };
  });

  const overall = Math.round(pillars.reduce((a, p) => a + p.score * p.weight, 0));

  const topFixes = all
    .filter((s) => s.fix && s.score != null && (s.status === 'fail' || s.status === 'warn'))
    .map((s) => {
      const pillarWeight = PILLARS.find((p) => p.id === s.pillar)?.weight ?? 0;
      const impact = (100 - (s.score as number)) * s.weight * pillarWeight;
      return { s, impact };
    })
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 8)
    .map(({ s }) => ({ label: s.label, severity: s.status, fix: s.fix as string, pillar: s.pillar }));

  return { overall, grade: gradeFor(overall), pillars, topFixes };
}

export { PILLAR_LABEL };
