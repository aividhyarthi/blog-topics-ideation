// AEO (Answer Engine Optimization) scoring engine — v2, newsroom-copilot model.
//
// Grades how likely an article is to be EXTRACTED and CITED by LLM answer
// engines (ChatGPT, Perplexity, Google AI Overviews, Gemini, Copilot).
//
// Design principle: the per-article score measures only what an EDITOR can
// change before publishing. Off-page brand authority is the strongest real
// driver of citation, but it's the same for every article on a site and can't
// be fixed per-story — so it's reported separately as "domain context" and is
// NOT part of the per-article score.
//
// Six editor-controllable pillars (weights are CATEGORY-SPECIFIC):
//   Answerability · Entity Clarity · Attribution & Trust ·
//   Structural Readability · Query Matchability · Freshness & Metadata
//
// Most signals are scored deterministically here by parsing HTML; judgement
// calls (answer quality, entity consistency, attribution, prompt coverage,
// off-page estimate) are scored by Claude in the API route and merged in.

// ---- types ------------------------------------------------------------------

export type SignalStatus = 'pass' | 'warn' | 'fail' | 'na';
export type PillarId =
  | 'answerability' | 'entity' | 'attribution' | 'structure' | 'query' | 'freshness';
export type Category =
  | 'general' | 'entertainment' | 'health' | 'news' | 'lifestyle' | 'commerce';

export interface Signal {
  id: string;
  label: string;
  pillar: PillarId | 'domain';
  score: number | null; // 0-100; null = not applicable
  weight: number; // relative weight within its pillar
  status: SignalStatus;
  detail: string;
  fix?: string;
  source: 'auto' | 'ai';
}

export interface PillarResult {
  id: PillarId;
  label: string;
  purpose: string;
  weight: number; // category weight, out of 100
  score: number; // 0-100
  points: number; // score scaled to weight (e.g. 18 of 25)
  signals: Signal[];
}

export interface PromptCoverage { q: string; covered: boolean }

export interface AeoReport {
  overall: number;
  grade: string;
  category: Category;
  summary: string; // plain-English AI verdict for the editor
  benchmark: string; // qualitative benchmark vs typical articles
  citationBand: 'Low' | 'Medium' | 'High';
  gate: { label: string; level: 'block' | 'warn' | 'strong' | 'optimized' };
  pillars: PillarResult[];
  domainContext: Signal[]; // off-page, NOT in the score
  promptCoverage: PromptCoverage[];
  topFixes: { label: string; severity: SignalStatus; fix: string; pillar: PillarId | 'domain'; gain: number; tag: 'quick' | 'high' | 'offpage' }[];
}

export const PILLAR_META: { id: PillarId; label: string; purpose: string }[] = [
  { id: 'answerability', label: 'Answerability', purpose: 'Can an AI extract the answer fast?' },
  { id: 'entity', label: 'Entity Clarity', purpose: 'Are the entities explicit and consistent?' },
  { id: 'attribution', label: 'Attribution & Trust', purpose: 'Can an AI trust the claims?' },
  { id: 'structure', label: 'Structural Readability', purpose: 'Is the content machine-readable?' },
  { id: 'query', label: 'Query Matchability', purpose: 'Does it mirror how users ask AI?' },
  { id: 'freshness', label: 'Freshness & Metadata', purpose: 'Is it timely and well-marked-up?' },
];

const PURPOSE: Record<PillarId, string> = Object.fromEntries(
  PILLAR_META.map((p) => [p.id, p.purpose]),
) as Record<PillarId, string>;
const LABEL: Record<PillarId, string> = Object.fromEntries(
  PILLAR_META.map((p) => [p.id, p.label]),
) as Record<PillarId, string>;

// Category-specific pillar weights (each row sums to 100).
export const CATEGORY_WEIGHTS: Record<Category, Record<PillarId, number>> = {
  general:       { answerability: 25, entity: 15, attribution: 20, structure: 15, query: 15, freshness: 10 },
  entertainment: { answerability: 25, entity: 25, attribution: 15, structure: 5,  query: 20, freshness: 10 },
  health:        { answerability: 20, entity: 10, attribution: 35, structure: 15, query: 10, freshness: 10 },
  news:          { answerability: 20, entity: 15, attribution: 20, structure: 10, query: 10, freshness: 25 },
  lifestyle:     { answerability: 20, entity: 10, attribution: 15, structure: 20, query: 25, freshness: 10 },
  commerce:      { answerability: 22, entity: 16, attribution: 18, structure: 12, query: 22, freshness: 10 },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  general: 'General', entertainment: 'Entertainment', health: 'Health',
  news: 'Breaking News', lifestyle: 'Lifestyle', commerce: 'Beauty / Commerce',
};

// ---- low-level HTML helpers -------------------------------------------------

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function pickMeta(html: string, name: string): string {
  const pats = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
  ];
  for (const re of pats) { const m = html.match(re); if (m) return decodeEntities(m[1]).trim(); }
  return '';
}
function stripTags(html: string): string {
  return decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}
const QUESTION_RE = /^(what|how|why|when|where|who|which|can|do|does|is|are|should|will|would|could|did|has|have|best|top)\b/i;
const PRONOUN_RE = /\b(he|she|they|him|her|them|his|hers|their|theirs|it|its|this|that|these|those)\b/gi;

// ---- page facts -------------------------------------------------------------

export interface Heading { level: number; text: string }
export interface PageFacts {
  isUrl: boolean; host: string; brand: string; topic: string; category: Category;
  title: string; metaDescription: string; canonical: string; robotsMeta: string;
  headings: Heading[]; h1Count: number;
  wordCount: number; paragraphs: number[]; sentences: number; syllables: number; pronouns: number;
  lists: number; tables: number; images: number; imagesWithAlt: number;
  internalLinks: number; externalLinks: number; statistics: number; blockquotes: number; quotedPhrases: number;
  schemaTypes: string[]; hasFaqHeading: boolean; hasTldr: boolean; hasAuthor: boolean;
  datePublished: string; dateModified: string; hasVideo: boolean;
  robotsTxtBlocks: boolean | null;
  firstWords: string; // lead text for display
  text: string;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0; if (w.length <= 3) return 1;
  const g = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return g ? g.length : 1;
}

export function analyzeHtml(
  html: string,
  opts: { isUrl: boolean; host?: string; brand?: string; topic?: string; category?: Category; robotsTxt?: string | null },
): PageFacts {
  const title = (() => { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : ''; })();
  const metaDescription = pickMeta(html, 'description') || pickMeta(html, 'og:description');
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? '';
  const robotsMeta = pickMeta(html, 'robots');

  const headings: Heading[] = [];
  for (const m of html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const t = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (t) headings.push({ level: Number(m[1]), text: t });
  }
  const h1Count = headings.filter((h) => h.level === 1).length;

  const articleM = html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i);
  const bodyHtml = articleM ? articleM[0] : html;

  const paragraphs: number[] = [];
  for (const m of bodyHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = stripTags(m[1]); const wc = t ? t.split(/\s+/).length : 0; if (wc > 0) paragraphs.push(wc);
  }

  const text = stripTags(bodyHtml);
  const words = text ? text.split(/\s+/) : [];
  const wordCount = words.length;
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length);
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  const pronouns = (text.match(PRONOUN_RE) || []).length;

  const lists = (bodyHtml.match(/<(ul|ol)\b/gi) || []).length;
  const tables = (bodyHtml.match(/<table\b/gi) || []).length;
  const imgTags = bodyHtml.match(/<img\b[^>]*>/gi) || [];
  const images = imgTags.length;
  const imagesWithAlt = imgTags.filter((t) => /\salt=["'][^"']+["']/i.test(t)).length;

  let internalLinks = 0, externalLinks = 0;
  const baseHost = (opts.host || '').replace(/^www\./, '');
  for (const m of bodyHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (/^(mailto:|tel:|#|javascript:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      try { const h = new URL(href).host.replace(/^www\./, ''); if (baseHost && h === baseHost) internalLinks++; else externalLinks++; }
      catch { externalLinks++; }
    } else internalLinks++;
  }

  const statistics =
    (text.match(/\b\d+(\.\d+)?\s?%/g) || []).length +
    (text.match(/\b\d{1,3}(,\d{3})+(\.\d+)?\b/g) || []).length +
    (text.match(/\b\d+(\.\d+)?\s?(million|billion|thousand|crore|lakh|x|times|out of|in \d)/gi) || []).length;
  const blockquotes = (bodyHtml.match(/<blockquote\b/gi) || []).length;
  const quotedPhrases = (text.match(/[“"][^”"]{25,}[”"]/g) || []).length;

  const schemaTypes = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const collect = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(collect);
        const o = node as Record<string, unknown>;
        const t = o['@type'];
        if (typeof t === 'string') schemaTypes.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && schemaTypes.add(x));
        if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(collect);
        if (o.mainEntity) collect(o.mainEntity);
      };
      collect(JSON.parse(m[1].trim()));
    } catch { /* tolerate */ }
  }

  const headingText = headings.map((h) => h.text.toLowerCase());
  const hasFaqHeading = schemaTypes.has('FAQPage') || headingText.some((h) => /\bfaqs?\b|frequently asked/i.test(h));
  const hasTldr = headingText.some((h) => /\btl;?dr\b|key takeaways?|key points|in short|summary|quick answer|at a glance|what happened/i.test(h));
  const hasAuthor =
    schemaTypes.has('Person') || /"author"\s*:/i.test(html) || Boolean(pickMeta(html, 'author')) ||
    /rel=["']author["']/i.test(html) || /class=["'][^"']*\bauthor\b[^"']*["']/i.test(html) ||
    /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text.slice(0, 600));
  const datePublished = pickMeta(html, 'article:published_time') ||
    (html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1] ?? '') || (html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] ?? '');
  const dateModified = pickMeta(html, 'article:modified_time') || (html.match(/"dateModified"\s*:\s*"([^"]+)"/i)?.[1] ?? '');
  const hasVideo = /<video\b|youtube\.com\/embed|player\.vimeo\.com/i.test(html);

  return {
    isUrl: opts.isUrl, host: opts.host || '', brand: opts.brand || '', topic: opts.topic || '', category: opts.category || 'general',
    title, metaDescription, canonical, robotsMeta, headings, h1Count,
    wordCount, paragraphs, sentences, syllables, pronouns,
    lists, tables, images, imagesWithAlt, internalLinks, externalLinks, statistics, blockquotes, quotedPhrases,
    schemaTypes: [...schemaTypes], hasFaqHeading, hasTldr, hasAuthor, datePublished, dateModified, hasVideo,
    robotsTxtBlocks: opts.isUrl ? Boolean(opts.robotsTxt && /Disallow:\s*\/\s*$/im.test(opts.robotsTxt)) : null,
    firstWords: words.slice(0, 60).join(' '),
    text: text.slice(0, 9000),
  };
}

// ---- scoring helpers --------------------------------------------------------

const c = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
function statusFor(s: number | null): SignalStatus { if (s == null) return 'na'; if (s >= 75) return 'pass'; if (s >= 45) return 'warn'; return 'fail'; }
function sig(s: Omit<Signal, 'status' | 'source'> & { source?: 'auto' | 'ai' }): Signal {
  return { ...s, status: statusFor(s.score), source: s.source ?? 'auto' };
}

// ---- deterministic signals --------------------------------------------------

export function deterministicSignals(f: PageFacts): Signal[] {
  const out: Signal[] = [];
  const sub = f.headings.filter((h) => h.level >= 2);
  const qShare = sub.length ? sub.filter((h) => QUESTION_RE.test(h.text) || h.text.includes('?')).length / sub.length : 0;
  const avgPara = f.paragraphs.length ? f.paragraphs.reduce((a, b) => a + b, 0) / f.paragraphs.length : 0;

  // ANSWERABILITY (deterministic part: conciseness)
  out.push(sig({
    id: 'conciseness', label: 'Conciseness (answer efficiency)', pillar: 'answerability', weight: 0.1,
    score: (() => { const w = f.wordCount; if (w < 150) return 35; if (w < 300) return 70; if (w <= 1800) return 100; if (w <= 3000) return 80; return 60; })(),
    detail: `${f.wordCount} words.`,
    fix: f.wordCount > 3000 ? 'Tighten or split — most AI citations are under 1,000 words. Lead with the answer.' : f.wordCount < 150 ? 'Too thin to be cited — add substantive coverage.' : undefined,
  }));

  // ENTITY CLARITY (deterministic part: pronoun dependency)
  const pShare = f.wordCount ? f.pronouns / f.wordCount : 0;
  out.push(sig({
    id: 'pronoun_dependency', label: 'Low pronoun dependency', pillar: 'entity', weight: 0.3,
    score: f.wordCount < 80 ? null : c(100 - Math.max(0, pShare * 100 - 4) * 14),
    detail: f.wordCount < 80 ? 'Not enough text to assess.' : `Pronouns are ${(pShare * 100).toFixed(1)}% of words.`,
    fix: pShare > 0.06 ? 'Replace vague pronouns (he/she/they/this) with the named entity — AI dislikes unresolved references.' : undefined,
  }));

  // ATTRIBUTION & TRUST (deterministic: citations, statistics, quotations, author)
  out.push(sig({ id: 'citations', label: 'Outbound citations to sources', pillar: 'attribution', weight: 0.16,
    score: c(Math.min(100, f.externalLinks * 25)), detail: `${f.externalLinks} outbound link(s) to other domains.`,
    fix: f.externalLinks < 2 ? 'Link out to authoritative sources (studies, official docs) — the highest-uplift GEO method.' : undefined }));
  out.push(sig({ id: 'statistics', label: 'Statistics & data points', pillar: 'attribution', weight: 0.14,
    score: c(Math.min(100, f.statistics * 18)), detail: `${f.statistics} statistic/number/data mention(s).`,
    fix: f.statistics < 3 ? 'Add concrete statistics and figures — a proven causal lever for LLM citation (Princeton GEO).' : undefined }));
  out.push(sig({ id: 'quotations', label: 'Expert quotations', pillar: 'attribution', weight: 0.1,
    score: c(Math.min(100, f.blockquotes * 40 + Math.min(f.quotedPhrases, 4) * 15)), detail: `${f.blockquotes} blockquote(s), ${f.quotedPhrases} attributed quote(s).`,
    fix: f.blockquotes + f.quotedPhrases < 1 ? 'Add named expert/source quotations — a top-three GEO lever.' : undefined }));
  out.push(sig({ id: 'author_named', label: 'Named author / byline', pillar: 'attribution', weight: 0.2,
    score: f.hasAuthor ? 90 : 20, detail: f.hasAuthor ? 'An author / byline was detected.' : 'No author / byline detected.',
    fix: f.hasAuthor ? undefined : 'Add a named author with a credentialed bio (and Person/author schema).' }));

  // STRUCTURAL READABILITY (deterministic)
  out.push(sig({ id: 'summary_block', label: 'Summary / key-points block', pillar: 'structure', weight: 0.25,
    score: f.hasTldr ? 100 : 25, detail: f.hasTldr ? 'A summary / key-points block was detected.' : 'No summary / key-points block.',
    fix: f.hasTldr ? undefined : 'Add a "Key points" / "What happened" summary block near the top for AI to lift.' }));
  out.push(sig({ id: 'qa_structure', label: 'Question–answer structure', pillar: 'structure', weight: 0.25,
    score: c((sub.length ? qShare * 70 : 0) + (f.hasFaqHeading ? 30 : 0) + 10),
    detail: `${Math.round(qShare * 100)}% of subheads are questions${f.hasFaqHeading ? ', FAQ present' : ', no FAQ'}.`,
    fix: qShare < 0.3 && !f.hasFaqHeading ? 'Phrase subheads as the questions users ask, and add an FAQ block.' : undefined }));
  out.push(sig({ id: 'scannability', label: 'Scannability', pillar: 'structure', weight: 0.3,
    score: c((avgPara === 0 ? 40 : Math.max(0, 110 - Math.max(0, avgPara - 40) * 3)) * 0.6 + Math.min(40, f.lists * 12 + f.tables * 16)),
    detail: `Avg paragraph ≈ ${Math.round(avgPara)} words; ${f.lists} list(s), ${f.tables} table(s).`,
    fix: avgPara > 60 || f.lists + f.tables === 0 ? 'Use short paragraphs, bullets and tables — AI dislikes walls of text.' : undefined }));
  const flesch = f.wordCount ? 206.835 - 1.015 * (f.wordCount / f.sentences) - 84.6 * (f.syllables / Math.max(1, f.wordCount)) : 0;
  out.push(sig({ id: 'reading_ease', label: 'Reading ease', pillar: 'structure', weight: 0.2,
    score: f.wordCount < 50 ? null : c(Math.max(0, Math.min(100, flesch))),
    detail: f.wordCount < 50 ? 'Not enough text.' : `Flesch reading ease ≈ ${Math.round(flesch)} (higher is easier).`,
    fix: f.wordCount >= 50 && flesch < 50 ? 'Simplify: shorter sentences, plainer words (aim for 60+).' : undefined }));

  // FRESHNESS & METADATA (deterministic)
  const fresh = (() => {
    const d = f.dateModified || f.datePublished;
    if (!d) return { score: 25, note: 'No publish/updated date found.' };
    const t = Date.parse(d); if (isNaN(t)) return { score: 50, note: `Date present but unparseable (${d}).` };
    const months = (Date.now() - t) / (1000 * 60 * 60 * 24 * 30);
    return { score: months <= 6 ? 100 : months <= 12 ? 85 : months <= 24 ? 55 : 30, note: `Last dated ${Math.round(months)} month(s) ago.` };
  })();
  out.push(sig({ id: 'updated_date', label: 'Updated timestamp & recency', pillar: 'freshness', weight: 0.45,
    score: fresh.score, detail: fresh.note, fix: fresh.score < 60 ? 'Show a visible published/updated timestamp and refresh stale content.' : undefined }));
  const wantSchema: Partial<Record<Category, string[]>> = {
    news: ['NewsArticle'], health: ['MedicalWebPage', 'MedicalWebpage'], commerce: ['Product'],
  };
  const valuable = ['FAQPage', 'HowTo', 'Article', 'NewsArticle', 'BlogPosting', 'Product', 'BreadcrumbList', 'Recipe', 'MedicalWebPage'];
  const matched = f.schemaTypes.filter((t) => valuable.includes(t));
  const wanted = wantSchema[f.category];
  const hasWanted = wanted ? wanted.some((w) => f.schemaTypes.map((s) => s.toLowerCase()).includes(w.toLowerCase())) : true;
  out.push(sig({ id: 'schema', label: 'Schema.org metadata', pillar: 'freshness', weight: 0.3,
    score: matched.length === 0 ? 25 : c(50 + matched.length * 18 + (hasWanted ? 10 : 0)),
    detail: f.schemaTypes.length ? `Detected: ${f.schemaTypes.join(', ')}.` : 'No JSON-LD schema found.',
    fix: matched.length === 0 ? `Add JSON-LD schema${wanted ? ` (${wanted[0]} for this category)` : ' (Article + FAQPage/HowTo)'}.` : (!hasWanted && wanted ? `Add ${wanted[0]} schema for ${CATEGORY_LABEL[f.category]} content.` : undefined) }));
  out.push(sig({ id: 'metadata', label: 'Title & meta description', pillar: 'freshness', weight: 0.25,
    score: (() => { let s = 0; if (f.title) s += 50; if (f.title.length >= 20 && f.title.length <= 70) s += 10; if (f.metaDescription) s += 30; if (f.metaDescription.length >= 70 && f.metaDescription.length <= 165) s += 10; return c(s); })(),
    detail: `Title ${f.title ? `${f.title.length} chars` : 'missing'}; meta description ${f.metaDescription ? `${f.metaDescription.length} chars` : 'missing'}.`,
    fix: !f.title || !f.metaDescription ? 'Add a descriptive <title> (~55 chars) and meta description (~140 chars).' : undefined }));

  return out;
}

// ---- LLM signals ------------------------------------------------------------

export interface LlmScores {
  headlineClarity?: number; leadCompleteness?: number; answerAboveFold?: number; directAnswer?: number;
  entityDensity?: number; entityConsistency?: number;
  sourceAttribution?: number; claimAttribution?: number; authorAuthority?: number;
  intentMatch?: number; longTailIntent?: number; answersTarget?: number; promptCoverageScore?: number;
  brandAuthority?: number; offpageCorroboration?: number;
  detectedIntent?: string; suggestedCategory?: Category;
  summary?: string;
  prompts?: PromptCoverage[];
  notes?: Partial<Record<string, string>>;
  // Per-signal, CONTENT-SPECIFIC fixes from the AI that quote/use the actual
  // article (e.g. "Your headline 'X' hides the subject — rewrite to 'Y'").
  fixes?: Partial<Record<string, string>>;
}

export function llmSignals(llm: LlmScores, hasTarget: boolean): Signal[] {
  const mk = (id: string, label: string, pillar: PillarId | 'domain', weight: number, score: number | undefined, fix: string): Signal => {
    const sc = typeof score === 'number' ? c(score) : 50;
    const aiFix = llm.fixes?.[id];
    return sig({ id, label, pillar, weight, score: sc,
      detail: llm.notes?.[id] || (typeof score === 'number' ? `Estimated ${sc}/100 by Claude.` : 'Not assessed.'),
      // Prefer the AI's article-specific fix; fall back to the generic template.
      fix: sc < 70 ? (aiFix || fix) : undefined, source: 'ai' });
  };

  const out: Signal[] = [
    // Answerability
    mk('headline_clarity', 'Headline answer clarity', 'answerability', 0.2, llm.headlineClarity, 'Lead the headline with the named subject + the action; avoid vague teaser phrasing that hides who/what.'),
    mk('lead_completeness', 'Lead sentence completeness', 'answerability', 0.25, llm.leadCompleteness, 'Make the first sentence self-contained: who, what, when, where (or a direct answer for evergreen topics).'),
    mk('answer_above_fold', 'Answer above the fold', 'answerability', 0.2, llm.answerAboveFold, 'Surface the answer in the first paragraph / a summary block — not buried after paragraph 3.'),
    mk('direct_answer', 'Direct answer per section', 'answerability', 0.25, llm.directAnswer, 'Under each question heading, lead with a concise, quotable answer.'),
    // Entity
    mk('entity_density', 'Named-entity density', 'entity', 0.35, llm.entityDensity, 'Name the concrete entities (people, products, places, institutions) instead of generic references.'),
    mk('entity_consistency', 'Entity consistency', 'entity', 0.35, llm.entityConsistency, 'Use one canonical name per entity (e.g. "Narendra Modi"), not a mix of variants.'),
    // Attribution
    mk('source_attribution', 'Source attribution', 'attribution', 0.22, llm.sourceAttribution, 'Replace vague "experts say" with named sources ("According to AIIMS Delhi…").'),
    mk('claim_attribution', 'Claim attribution', 'attribution', 0.18, llm.claimAttribution, 'Attribute every major claim to who said it (study, official, spokesperson).'),
    // Query matchability
    mk('intent_match', 'Conversational query match', 'query', 0.25, llm.intentMatch, 'Mirror how people ask AI — phrase headings/sections as real questions ("Is creatine safe?").'),
    mk('long_tail_intent', 'Long-tail intent coverage', 'query', 0.25, llm.longTailIntent, 'Cover comparison, status, definition and timeline intents around the topic.'),
    // Domain context (NOT scored)
    mk('brand_authority', 'Brand / entity prominence (estimated)', 'domain', 0, llm.brandAuthority, 'Build off-page brand visibility: earn brand mentions, PR, and presence where your audience asks questions.'),
    mk('offpage_corroboration', 'Off-domain corroboration (estimated)', 'domain', 0, llm.offpageCorroboration, 'Get mentioned on consensus sources LLMs trust (Wikipedia, Reddit, YouTube) and earn authoritative backlinks.'),
  ];

  // prompt coverage as a query-pillar signal (weight from coverage score)
  const cov = typeof llm.promptCoverageScore === 'number'
    ? c(llm.promptCoverageScore)
    : (llm.prompts && llm.prompts.length ? c((llm.prompts.filter((p) => p.covered).length / llm.prompts.length) * 100) : 50);
  out.push(sig({ id: 'prompt_coverage', label: 'Prompt coverage', pillar: 'query', weight: 0.5,
    score: cov, detail: llm.notes?.prompt_coverage || (llm.prompts && llm.prompts.length ? `Answers ${llm.prompts.filter((p) => p.covered).length} of ${llm.prompts.length} likely AI prompts.` : 'Likely-prompt coverage estimated.'),
    fix: cov < 70 ? (llm.fixes?.prompt_coverage || 'Add sections that directly answer the most likely AI prompts this story should win (see the prompt list).') : undefined, source: 'ai' }));

  out.push(sig({ id: 'answers_target', label: hasTarget ? 'Answers the target question' : 'Answer completeness', pillar: 'query', weight: hasTarget ? 0.25 : 0,
    score: typeof llm.answersTarget === 'number' ? c(llm.answersTarget) : (hasTarget ? 50 : null),
    detail: llm.notes?.answers_target || (typeof llm.answersTarget === 'number' ? `Scored ${c(llm.answersTarget)}/100.` : 'No target question provided.'),
    fix: typeof llm.answersTarget === 'number' && c(llm.answersTarget) < 70 ? (llm.fixes?.answers_target || 'Answer the target question directly, completely and early.') : undefined, source: 'ai' }));

  return out;
}

// ---- combine + score --------------------------------------------------------

function gradeFor(n: number): string {
  if (n >= 90) return 'A+'; if (n >= 85) return 'A'; if (n >= 80) return 'A-'; if (n >= 75) return 'B+';
  if (n >= 70) return 'B'; if (n >= 65) return 'B-'; if (n >= 60) return 'C+'; if (n >= 55) return 'C';
  if (n >= 50) return 'C-'; if (n >= 45) return 'D+'; if (n >= 40) return 'D'; return 'F';
}
function gateFor(n: number): AeoReport['gate'] {
  if (n >= 90) return { label: 'Citation Optimized', level: 'optimized' };
  if (n >= 75) return { label: 'AEO Strong', level: 'strong' };
  if (n >= 60) return { label: 'Publish with warning', level: 'warn' };
  return { label: 'Below threshold — fix before publishing', level: 'block' };
}

function benchmarkFor(n: number): string {
  if (n >= 80) return 'Top tier vs typical articles';
  if (n >= 65) return 'Above average vs typical articles';
  if (n >= 50) return 'About average vs typical articles';
  if (n >= 35) return 'Below average vs typical articles';
  return 'Needs major work vs typical articles';
}

export function buildReport(
  deterministic: Signal[], llm: Signal[], category: Category, prompts: PromptCoverage[], aiSummary?: string,
): AeoReport {
  const all = [...deterministic, ...llm];
  const weights = CATEGORY_WEIGHTS[category] || CATEGORY_WEIGHTS.general;
  const wsumByPillar: Partial<Record<PillarId, number>> = {};

  const pillars: PillarResult[] = PILLAR_META.map((p) => {
    const signals = all.filter((s) => s.pillar === p.id);
    const scored = signals.filter((s) => s.score != null && s.weight > 0);
    const wsum = scored.reduce((a, s) => a + s.weight, 0) || 1;
    wsumByPillar[p.id] = wsum;
    const score = Math.round(scored.reduce((a, s) => a + (s.score as number) * s.weight, 0) / wsum);
    const weight = weights[p.id];
    return { id: p.id, label: LABEL[p.id], purpose: PURPOSE[p.id], weight, score, points: Math.round((score / 100) * weight), signals };
  });

  const overall = Math.round(pillars.reduce((a, p) => a + p.score * (p.weight / 100), 0));
  const domainContext = all.filter((s) => s.pillar === 'domain');

  // Estimated point gain (on the 0-100 overall scale) if each signal were lifted to 100.
  const gainOf = (s: Signal): number => {
    if (s.pillar === 'domain' || s.score == null) return 0;
    const pw = weights[s.pillar as PillarId] ?? 0;
    const wsum = wsumByPillar[s.pillar as PillarId] ?? 1;
    return ((100 - s.score) / 100) * (s.weight / wsum) * pw;
  };

  const topFixes = all
    .filter((s) => s.fix && s.score != null && (s.status === 'fail' || s.status === 'warn'))
    .map((s) => ({ s, gain: gainOf(s) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 8)
    .map(({ s, gain }) => ({
      label: s.label, severity: s.status, fix: s.fix as string, pillar: s.pillar,
      gain: Math.round(gain * 10) / 10,
      tag: (s.pillar === 'domain' ? 'offpage' : gain >= 3 ? 'high' : 'quick') as 'quick' | 'high' | 'offpage',
    }));

  const sortedP = [...pillars].sort((a, b) => a.score - b.score);
  const weakest = sortedP[0], strongest = sortedP[sortedP.length - 1];
  const band = overall >= 70 ? 'High' : overall >= 45 ? 'Medium' : 'Low';
  const lead = band === 'High' ? 'is well-placed to be cited' : band === 'Medium' ? 'has a moderate chance of being cited' : 'is unlikely to be cited as-is';
  const fallbackSummary =
    `This article ${lead} by AI answer engines (score ${overall}/100). ` +
    `Strongest area is ${strongest.label} (${strongest.score}); the weakest is ${weakest.label} (${weakest.score}). ` +
    (topFixes[0] ? `Start with "${topFixes[0].label}" for the biggest lift.` : '');

  return {
    overall, grade: gradeFor(overall), category,
    summary: (aiSummary && aiSummary.trim()) || fallbackSummary,
    benchmark: benchmarkFor(overall),
    citationBand: band,
    gate: gateFor(overall), pillars, domainContext, promptCoverage: prompts, topFixes,
  };
}
