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

// Type-only — erased at compile time, so this isn't a real runtime circular
// dependency even though checklists.ts imports types from this file too.
import type { ChecklistResult } from './checklists';

// ---- types ------------------------------------------------------------------

export type SignalStatus = 'pass' | 'warn' | 'fail' | 'na';
export type PillarId =
  | 'answerability' | 'entity' | 'attribution' | 'structure' | 'query' | 'freshness';
export type Category =
  | 'general' | 'entertainment' | 'health' | 'news' | 'lifestyle' | 'commerce';
// What KIND of page this is — changes which signals apply and how the AI judges.
export type PageType = 'article' | 'product' | 'listing';
export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  article: 'Article / Blog', product: 'Product page', listing: 'Category / Listing page',
};

export interface Signal {
  id: string;
  label: string;
  pillar: PillarId | 'domain' | 'crawl';
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
  score: number; // 0-100 (0 when `measured` is false — don't display it)
  points: number; // score scaled to weight (e.g. 18 of 25)
  // False when nothing in this pillar could actually be scored (e.g. every
  // signal in it is AI-judged and the judge was unavailable). Such a pillar is
  // dropped from the overall and must be shown as "not measured", never as 0.
  measured: boolean;
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
  crawlability: Signal[]; // can AI bots reach the page? site-wide, NOT in the score
  crawlBlocked: boolean; // true if a primary answer-engine crawler is blocked
  visibility: Visibility | null; // User vs Googlebot vs LLM: can LLMs read this page?
  promptCoverage: PromptCoverage[];
  topFixes: { label: string; severity: SignalStatus; why?: string; fix: string; pillar: PillarId | 'domain'; gain: number; tag: 'quick' | 'high' | 'offpage' }[];
  engines: EngineScores | null; // per-engine estimated citation likelihood
  // How much of the scoring model actually ran. Anything below 100 means part
  // of the page was not assessed, and the report says so instead of pretending.
  coverage: { measuredWeight: number; totalWeight: number; complete: boolean; unmeasured: string[] };
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
// Remove site chrome (nav/footer/aside/forms) so body metrics reflect the real
// content, not menus and footers. Headings/schema are read from the full HTML,
// so this is safe — it only cleans the body used for text/links/paragraphs.
function stripBoilerplate(html: string): string {
  return html
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form\b[\s\S]*?<\/form>/gi, ' ');
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
  lists: number; tables: number; images: number; imagesWithAlt: number; iframes: number;
  internalLinks: number; externalLinks: number; statistics: number; blockquotes: number; quotedPhrases: number;
  schemaTypes: string[]; hasFaqHeading: boolean; hasTldr: boolean; hasAuthor: boolean;
  datePublished: string; dateModified: string; hasVideo: boolean;
  robotsTxtBlocks: boolean | null;
  firstWords: string; // lead text for display
  text: string;
  // E-commerce / page-type detection
  priceCount: number; hasProductSchema: boolean; hasItemList: boolean;
  hasAggregateRating: boolean; hasAddToCart: boolean;
  pageType: PageType; detectedPageType: PageType;
  // JS-rendering: is the real content in the static HTML, or injected by JS?
  // (Googlebot renders JS; LLM crawlers do NOT — so JS-injected content is
  // visible to Google but invisible to ChatGPT/Claude/Perplexity.)
  framework: string | null; jsDependent: boolean; textRatioPct: number;
}

// Decide the page type from structural signals (schema first, then heuristics).
export function detectPageType(f: {
  hasItemList: boolean; hasProductSchema: boolean; hasAddToCart: boolean; priceCount: number;
}): PageType {
  if (f.hasItemList && !f.hasProductSchema) return 'listing';
  if (f.hasProductSchema) return 'product';
  if (f.hasAddToCart && f.priceCount >= 1 && f.priceCount <= 5) return 'product';
  if (f.priceCount >= 6) return 'listing';
  return 'article';
}

// ---- AI crawlability (robots.txt + llms.txt) --------------------------------
//
// Answer engines can only cite a page their crawler is allowed to fetch. These
// are SITE-WIDE technical checks (not per-article), so — like domain context —
// they are reported separately and are NOT part of the per-article score. But a
// blocked crawler is the single most important thing to fix, so it's surfaced
// prominently with a hard warning.

interface RobotsGroup { agents: string[]; rules: { allow: boolean; path: string }[] }

function parseRobots(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let cur: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'allow' || field === 'disallow') {
      if (!cur) { cur = { agents: ['*'], rules: [] }; groups.push(cur); }
      cur.rules.push({ allow: field === 'allow', path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

// Does robots.txt allow `ua` to fetch `path`? Most-specific UA group wins;
// within it, the longest matching rule wins (Allow breaks ties), per the spec.
function robotsAllows(groups: RobotsGroup[], ua: string, path = '/'): boolean {
  const ual = ua.toLowerCase();
  let match: RobotsGroup | undefined, star: RobotsGroup | undefined;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === '*') star = star || g;
      else if (ual === a || ual.includes(a) || a.includes(ual)) match = match || g;
    }
  }
  const g = match || star;
  if (!g) return true;
  let decision = true, bestLen = -1;
  for (const r of g.rules) {
    if (r.path === '') continue; // empty path = no restriction
    if (path.startsWith(r.path) && (r.path.length > bestLen || (r.path.length === bestLen && r.allow))) {
      decision = r.allow; bestLen = r.path.length;
    }
  }
  return decision;
}

// The answer-engine crawlers worth checking. `primary` = the user-agents that
// actually gate live citation (vs training-only), so blocking them is critical.
const BOT_GROUPS: { id: string; label: string; engine: string; agents: string[]; primary: string[] }[] = [
  { id: 'bot_openai', label: 'ChatGPT (OpenAI)', engine: 'ChatGPT', agents: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User'], primary: ['OAI-SearchBot', 'ChatGPT-User'] },
  { id: 'bot_perplexity', label: 'Perplexity', engine: 'Perplexity', agents: ['PerplexityBot', 'Perplexity-User'], primary: ['PerplexityBot'] },
  { id: 'bot_google', label: 'Google AI (Gemini & AI Overviews)', engine: 'Google AI Overviews & Gemini', agents: ['Googlebot', 'Google-Extended'], primary: ['Googlebot'] },
  { id: 'bot_anthropic', label: 'Claude (Anthropic)', engine: 'Claude', agents: ['ClaudeBot', 'anthropic-ai', 'Claude-Web'], primary: ['ClaudeBot'] },
  { id: 'bot_bing', label: 'Bing / Copilot', engine: 'Bing Chat & Microsoft Copilot', agents: ['Bingbot', 'BingPreview'], primary: ['Bingbot'] },
];

export interface CrawlInput { isUrl: boolean; robotsTxt?: string | null; llmsTxt?: string | null }

// Build the crawlability signals from a fetched robots.txt + llms.txt probe.
// Only meaningful for live URLs (pasted HTML has no site context).
export function crawlabilitySignals(input: CrawlInput): Signal[] {
  if (!input.isUrl) return [];
  const out: Signal[] = [];
  const known = input.robotsTxt != null; // we successfully fetched robots.txt
  const groups = known ? parseRobots(input.robotsTxt as string) : [];

  for (const b of BOT_GROUPS) {
    const blocked: string[] = [], allowed: string[] = [];
    for (const ua of b.agents) {
      (known && !robotsAllows(groups, ua, '/') ? blocked : allowed).push(ua);
    }
    const primaryBlocked = known ? b.primary.filter((ua) => !robotsAllows(groups, ua, '/')) : [];
    const score = !known ? 75 : primaryBlocked.length ? 0 : blocked.length ? 60 : 100;
    const detail = !known
      ? 'No robots.txt found — crawlers are allowed by default.'
      : blocked.length
        ? `Blocked: ${blocked.join(', ')}.${allowed.length ? ` Allowed: ${allowed.join(', ')}.` : ''}`
        : `Allowed: ${allowed.join(', ')}.`;
    out.push(sig({
      id: b.id, label: `${b.label} crawler access`, pillar: 'crawl', weight: 0, score, detail,
      fix: primaryBlocked.length ? `Unblock ${primaryBlocked.join(' and ')} in your robots.txt so ${b.engine} can read — and cite — this page.` : undefined,
      source: 'auto',
    }));
  }

  const hasLlms = Boolean(input.llmsTxt && input.llmsTxt.trim().length > 0);
  out.push(sig({
    id: 'llms_txt', label: 'llms.txt guide file', pillar: 'crawl', weight: 0,
    score: hasLlms ? 100 : 55,
    detail: hasLlms ? 'An /llms.txt file was found — it points AI crawlers to your key content.' : 'No /llms.txt found (an emerging standard, not yet required).',
    fix: hasLlms ? undefined : 'Add an /llms.txt at your site root listing your most important pages in Markdown — an emerging standard some AI crawlers now read.',
    source: 'auto',
  }));
  return out;
}

// ---- "Can LLMs access this page?" — User vs Googlebot vs LLM crawlers --------
// Combines two gates: (1) robots.txt access, and (2) whether the real content is
// in the static HTML or injected by JavaScript. The crucial asymmetry: Googlebot
// renders JS, LLM crawlers do not — so JS-injected content is visible to Google
// but invisible to ChatGPT/Claude/Perplexity.
export interface VisibilityViewer { who: string; rendersJs: boolean; access: 'ok' | 'partial' | 'blocked'; sees: string }
// Per-element read-out: for each kind of thing on the page, can an LLM crawler
// actually read it from the static HTML?
export interface VisibilityElement { label: string; status: 'read' | 'partial' | 'missed'; detail: string; group: 'region' | 'content' }
export interface Visibility {
  applicable: boolean;
  jsDependent: boolean;
  framework: string | null;
  staticWords: number;
  viewers: VisibilityViewer[];
  elements: VisibilityElement[];
  verdict: { level: 'yes' | 'partial' | 'no'; label: string; reason: string };
}

// ---- Page regions: header / navigation / main content / footer ----------
// The content-type list below (Headings, Images, ...) can say "all fine" while
// one whole part of the page — a JS-rendered nav, a header that's actually just
// an <iframe>, a body gated behind a login prompt — is invisible on its own.
// Region-scoped so a client sees exactly WHERE the problem is, not just that
// something somewhere is wrong.
const REGION_TAGS: { label: string; tags: string[] }[] = [
  { label: 'Header', tags: ['header'] },
  { label: 'Navigation', tags: ['nav'] },
  { label: 'Main content', tags: ['main', 'article'] },
  { label: 'Footer', tags: ['footer'] },
];
// Common phrasing sites use to gate content behind sign-in or a subscription —
// a crawler can't authenticate, so content behind this is invisible to it
// regardless of whether it's technically present in the HTML.
const GATE_RE = /\b(sign[\s-]?in to (read|continue|view)|log[\s-]?in to (read|continue|view)|subscribe to (read|continue|unlock)|subscribers? only|members? only|register to (read|continue)|create a (free )?account to (continue|read)|paywall)\b/i;

function extractFirstTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1] : null;
}

function buildRegionElements(html: string, f: PageFacts): VisibilityElement[] {
  return REGION_TAGS.map((r) => {
    let raw: string | null = null, tagFound = '';
    for (const t of r.tags) { raw = extractFirstTag(html, t); if (raw != null) { tagFound = t; break; } }
    if (raw == null) {
      return { group: 'region' as const, label: r.label, status: 'missed' as const,
        detail: `No <${r.tags[0]}> element found — this page doesn't mark up a distinct ${r.label.toLowerCase()} region in its HTML, so we can't check it separately from the rest of the page.` };
    }
    const text = stripTags(raw);
    const hasIframe = /<iframe\b/i.test(raw);
    const gated = GATE_RE.test(text);
    const imgs = (raw.match(/<img\b/gi) || []).length;
    const imgsWithAlt = (raw.match(/<img\b[^>]*\balt=["'][^"']+["']/gi) || []).length;

    // Order matters: a page-wide "this whole page is thin/JS-rendered" signal
    // is real but coarse, so it must not drown out a MORE SPECIFIC, region-scoped
    // reason (this exact region is gated, or is literally just an <iframe>) when
    // both are true at once — the specific cause is the one worth telling
    // someone to go fix.
    let status: 'read' | 'partial' | 'missed', detail: string;
    if (gated && text.length < 200) {
      status = 'missed';
      detail = 'Gated behind a login or subscription prompt — LLM crawlers can\'t authenticate, so whatever is behind it doesn\'t exist to them.';
    } else if (hasIframe && text.length < 40) {
      status = 'missed';
      detail = `This region is just an embedded <iframe> — a separate document. Crawlers fetching this page never load it.`;
    } else if (f.jsDependent && text.length < 40) {
      status = 'missed';
      detail = `Rendered by JavaScript${f.framework ? ` (${f.framework})` : ''} — empty in the static HTML LLM crawlers actually fetch.`;
    } else if (text.length < 20) {
      status = 'missed';
      detail = `Found a <${tagFound}> element, but it's essentially empty in the static HTML.`;
    } else {
      status = 'read';
      detail = `Readable in the static HTML (about ${text.split(/\s+/).filter(Boolean).length} words).`;
      if (gated) { status = 'partial'; detail += ' Part of it sits behind a login/subscription prompt a crawler can\'t get past.'; }
      if (hasIframe) { status = 'partial'; detail += ' Contains an embedded <iframe> — that part is a separate document a crawler won\'t load, though the rest of this region is readable.'; }
      if (imgs && imgsWithAlt < imgs) { status = 'partial'; detail += ` ${imgsWithAlt}/${imgs} image(s) here have alt text — the rest are invisible to LLMs.`; }
    }
    return { group: 'region' as const, label: r.label, status, detail };
  });
}

export function buildVisibility(html: string, f: PageFacts, crawl: Signal[]): Visibility {
  const g = crawl.find((s) => s.id === 'bot_google');
  const llm = crawl.filter((s) => ['bot_openai', 'bot_anthropic', 'bot_perplexity'].includes(s.id));
  const googleBlocked = g?.score === 0;
  const llmBlockedAll = llm.length > 0 && llm.every((s) => s.score === 0);
  const llmBlockedSome = llm.some((s) => s.score === 0);
  const invisible = f.jsDependent;

  const viewers: VisibilityViewer[] = [
    { who: 'A human (browser)', rendersJs: true, access: 'ok',
      sees: 'The complete page — the browser runs all the JavaScript and shows everything.' },
    { who: 'Googlebot (Search)', rendersJs: true, access: googleBlocked ? 'blocked' : 'ok',
      sees: googleBlocked
        ? 'Nothing — Googlebot is disallowed in robots.txt.'
        : 'The full page — Googlebot renders JavaScript, so it sees what a human sees.' },
    { who: 'LLM crawlers (ChatGPT · Claude · Perplexity)', rendersJs: false,
      access: llmBlockedAll ? 'blocked' : llmBlockedSome ? 'partial' : 'ok',
      sees: llmBlockedAll
        ? 'Nothing — their crawlers are disallowed in robots.txt.'
        : invisible
          ? 'Almost nothing — they do NOT run JavaScript, and this page’s content is injected by JS. They receive a near-empty shell.'
          : `The raw HTML, which here holds the real content (${f.wordCount} words) — so they can read it.${llmBlockedSome ? ' But at least one engine is blocked in robots.txt.' : ''}` },
  ];

  let verdict: Visibility['verdict'];
  if (llmBlockedAll)
    verdict = { level: 'no', label: 'No — LLMs are blocked', reason: 'Your robots.txt disallows the LLM answer-engine crawlers, so they can’t fetch this page at all.' };
  else if (invisible)
    verdict = { level: 'no', label: 'No — content is invisible to LLMs', reason: `The crawlers can reach the page, but the content is rendered by JavaScript${f.framework ? ` (${f.framework})` : ''}, which they don’t execute. They see an almost-empty shell — Google sees the full page, LLMs don’t. Serve the content in the initial HTML (SSR / prerendering) to fix it.` };
  else if (llmBlockedSome)
    verdict = { level: 'partial', label: 'Partly — one engine is blocked', reason: 'The content is in the static HTML and readable, but at least one engine’s crawler is disallowed in robots.txt. Unblock it to be citable everywhere.' };
  else
    verdict = { level: 'yes', label: 'Yes — LLMs can read this page', reason: 'The real content is in the static HTML and the crawlers are allowed, so ChatGPT, Claude and Perplexity can read — and cite — this page.' };

  // ---- element-by-element read-out (what an LLM gets from the static HTML) ----
  // Two groups: REGION (where on the page — header/nav/main/footer) and CONTENT
  // (what kind of thing — headings/images/tables). A page can pass on content
  // type overall while still hiding one whole region (e.g. a JS-rendered nav on
  // an otherwise-static page), which the content-type list alone can't show.
  const elements: VisibilityElement[] = buildRegionElements(html, f);
  const jsMissed = invisible; // when JS-dependent, text-bearing elements are absent from raw HTML

  elements.push({ group: 'content', label: 'Title & meta', status: f.title ? 'read' : 'missed',
    detail: f.title ? `Title and meta description are in the HTML.` : 'No <title> found in the static HTML.' });
  elements.push({ group: 'content', label: `Headings (${f.headings.length})`, status: f.headings.length ? (jsMissed ? 'missed' : 'read') : 'missed',
    detail: jsMissed ? 'Headings are injected by JavaScript — absent from the raw HTML LLMs receive.' : f.headings.length ? 'All headings are in the static HTML and readable.' : 'No headings in the static HTML.' });
  elements.push({ group: 'content', label: `Body text (${f.wordCount} words)`, status: jsMissed ? 'missed' : f.wordCount < 150 ? 'partial' : 'read',
    detail: jsMissed ? 'The body copy is rendered client-side — LLM crawlers get a near-empty shell.' : f.wordCount < 150 ? 'Very little body text in the static HTML.' : 'The body copy is in the static HTML and readable.' });
  if (f.images)
    elements.push({ group: 'content', label: `Images (${f.images})`, status: f.imagesWithAlt >= f.images ? 'read' : f.imagesWithAlt ? 'partial' : 'missed',
      detail: `LLMs read alt text, not pixels — ${f.imagesWithAlt}/${f.images} image(s) have alt text.${f.imagesWithAlt < f.images ? ' The rest are invisible to LLMs.' : ''}` });
  elements.push({ group: 'content', label: 'Structured data (schema)', status: f.schemaTypes.length ? 'read' : 'missed',
    detail: f.schemaTypes.length ? `JSON-LD present: ${f.schemaTypes.join(', ')}.` : 'No JSON-LD schema — LLMs get no machine-readable summary.' });
  {
    const hasBreadcrumbSchema = f.schemaTypes.some((t) => t.toLowerCase() === 'breadcrumblist');
    const hasBreadcrumbMarkup = /class=["'][^"']*breadcrumb|aria-label=["'][^"']*breadcrumb|<nav[^>]*breadcrumb/i.test(html);
    let bStatus: VisibilityElement['status'], bDetail: string;
    if (hasBreadcrumbSchema) { bStatus = 'read'; bDetail = 'BreadcrumbList schema declares this page’s position in your site (Home > Category > …) as machine-readable data.'; }
    else if (hasBreadcrumbMarkup && !jsMissed) { bStatus = 'partial'; bDetail = 'A breadcrumb trail is visible in the HTML, but with no BreadcrumbList schema — an LLM has to infer the hierarchy from text instead of reading it as data.'; }
    else if (hasBreadcrumbMarkup && jsMissed) { bStatus = 'missed'; bDetail = 'A breadcrumb looks present on the page but is JavaScript-rendered — invisible in the static HTML LLM crawlers fetch.'; }
    else { bStatus = 'missed'; bDetail = 'No breadcrumb trail or BreadcrumbList schema found on this page.'; }
    elements.push({ group: 'content', label: 'Breadcrumb trail', status: bStatus, detail: bDetail });
  }
  if (f.tables || f.lists)
    elements.push({ group: 'content', label: `Tables & lists (${f.tables + f.lists})`, status: jsMissed ? 'missed' : 'read',
      detail: jsMissed ? 'Injected by JavaScript — not in the raw HTML.' : 'Structured tables/lists are in the HTML — easy for LLMs to extract.' });
  if (f.hasVideo)
    elements.push({ group: 'content', label: 'Video', status: 'missed',
      detail: 'Video is not watched by crawlers — only a text transcript on the page would be read.' });
  if (f.iframes)
    elements.push({ group: 'content', label: `Embedded frames (${f.iframes})`, status: 'missed',
      detail: 'Content inside <iframe> embeds is not fetched — LLMs can’t read it.' });

  return { applicable: f.isUrl, jsDependent: f.jsDependent, framework: f.framework, staticWords: f.wordCount, viewers, elements, verdict };
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0; if (w.length <= 3) return 1;
  const g = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return g ? g.length : 1;
}

export function analyzeHtml(
  html: string,
  opts: { isUrl: boolean; host?: string; brand?: string; topic?: string; category?: Category; robotsTxt?: string | null; pageType?: PageType | 'auto' },
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
  const bodyHtml = articleM ? articleM[0] : stripBoilerplate(html);

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
  const iframes = (bodyHtml.match(/<iframe\b/gi) || []).length;

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

  // ---- e-commerce / page-type signals ----
  const lowerTypes = [...schemaTypes].map((s) => s.toLowerCase());
  const hasProductSchema = lowerTypes.some((t) => t === 'product' || t === 'productgroup' || t === 'offer');
  const hasItemList = lowerTypes.some((t) => t === 'itemlist' || t === 'collectionpage' || t === 'offercatalog');
  const priceCount =
    (text.match(/(?:₹|rs\.?|inr|\$|usd|eur|€|£)\s?\d[\d,]*/gi) || []).length +
    (html.match(/itemprop=["']price["']|"price"\s*:/gi) || []).length;
  const hasAggregateRating =
    lowerTypes.includes('aggregaterating') || /"aggregateRating"/i.test(html) ||
    /\b\d(?:\.\d)?\s?(?:out of 5|\/\s?5|stars?)\b/i.test(text) || /\b[\d,]+\s+(?:ratings|reviews)\b/i.test(text);
  const hasAddToCart = /add to (?:cart|bag|basket)|buy now|add to wishlist/i.test(html);

  const detectedPageType = detectPageType({ hasItemList, hasProductSchema, hasAddToCart, priceCount });
  const chosen = opts.pageType && opts.pageType !== 'auto' ? opts.pageType : detectedPageType;

  // ---- JS-rendering detection ----
  // Detect single-page-app shells whose content is injected by JavaScript. Such
  // pages render fine for a human and for Googlebot (which executes JS) but are
  // near-empty for LLM crawlers (which fetch raw HTML and do NOT run JS).
  const textRatio = html.length ? text.length / html.length : 0;
  const SPA_MARKERS: [string, RegExp][] = [
    ['Next.js', /__NEXT_DATA__|\/_next\/static/i],
    ['Nuxt', /window\.__NUXT__|\/_nuxt\//i],
    ['Gatsby', /___gatsby|page-data\.json/i],
    ['Angular', /ng-version=|<app-root\b|\sng-app\b/i],
    ['React', /data-reactroot|id=["']root["'][^>]*>\s*<\/div>/i],
    ['Vue', /data-v-[0-9a-f]{6,}|id=["']app["'][^>]*>\s*<\/div>/i],
  ];
  let framework: string | null = null;
  for (const [name, re] of SPA_MARKERS) { if (re.test(html)) { framework = name; break; } }
  // JS-dependent only when the STATIC content is thin. A server-rendered
  // Next/Nuxt page has plenty of words and is NOT flagged.
  const jsDependent = Boolean(opts.isUrl) && (wordCount < 120 || (wordCount < 220 && (Boolean(framework) || textRatio < 0.06)));

  return {
    isUrl: opts.isUrl, host: opts.host || '', brand: opts.brand || '', topic: opts.topic || '', category: opts.category || 'general',
    title, metaDescription, canonical, robotsMeta, headings, h1Count,
    wordCount, paragraphs, sentences, syllables, pronouns,
    lists, tables, images, imagesWithAlt, iframes, internalLinks, externalLinks, statistics, blockquotes, quotedPhrases,
    schemaTypes: [...schemaTypes], hasFaqHeading, hasTldr, hasAuthor, datePublished, dateModified, hasVideo,
    robotsTxtBlocks: opts.isUrl ? Boolean(opts.robotsTxt && /Disallow:\s*\/\s*$/im.test(opts.robotsTxt)) : null,
    firstWords: words.slice(0, 60).join(' '),
    text: text.slice(0, 9000),
    priceCount, hasProductSchema, hasItemList, hasAggregateRating, hasAddToCart,
    pageType: chosen, detectedPageType,
    framework, jsDependent, textRatioPct: Math.round(textRatio * 100),
  };
}

// ---- scoring helpers --------------------------------------------------------

const c = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
function statusFor(s: number | null): SignalStatus { if (s == null) return 'na'; if (s >= 75) return 'pass'; if (s >= 45) return 'warn'; return 'fail'; }
function sig(s: Omit<Signal, 'status' | 'source'> & { source?: 'auto' | 'ai' }): Signal {
  return { ...s, status: statusFor(s.score), source: s.source ?? 'auto' };
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
  // Per-engine estimated citation likelihood (0-100).
  engines?: { chatgpt?: number; gemini?: number; perplexity?: number; aiOverviews?: number };
}

export interface EngineScores { chatgpt: number; gemini: number; perplexity: number; aiOverviews: number }

export function llmSignals(llm: LlmScores, hasTarget: boolean): Signal[] {
  const mk = (id: string, label: string, pillar: PillarId | 'domain', weight: number, score: number | undefined, fix: string): Signal => {
    const aiFix = llm.fixes?.[id];
    // An unavailable judge must not become a score. Substituting 50 here used to
    // fold a dozen invented numbers into the weighted average and then rank the
    // never-measured signals as "top fixes" — the headline grade was mostly an
    // artefact of a failed API call. null drops the signal from scoring entirely.
    if (typeof score !== 'number') {
      return sig({ id, label, pillar, weight, score: null,
        detail: llm.notes?.[id] || 'Not measured in this audit.', source: 'ai' });
    }
    const sc = c(score);
    return sig({ id, label, pillar, weight, score: sc,
      detail: llm.notes?.[id] || `Estimated ${sc}/100 by Claude.`,
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
    : (llm.prompts && llm.prompts.length ? c((llm.prompts.filter((p) => p.covered).length / llm.prompts.length) * 100) : null);
  out.push(sig({ id: 'prompt_coverage', label: 'Prompt coverage', pillar: 'query', weight: 0.5,
    score: cov, detail: llm.notes?.prompt_coverage || (llm.prompts && llm.prompts.length ? `Answers ${llm.prompts.filter((p) => p.covered).length} of ${llm.prompts.length} likely AI prompts.` : 'Not measured in this audit.'),
    fix: cov != null && cov < 70 ? (llm.fixes?.prompt_coverage || 'Add sections that directly answer the most likely AI prompts this story should win (see the prompt list).') : undefined, source: 'ai' }));

  out.push(sig({ id: 'answers_target', label: hasTarget ? 'Answers the target question' : 'Answer completeness', pillar: 'query', weight: hasTarget ? 0.25 : 0,
    score: typeof llm.answersTarget === 'number' ? c(llm.answersTarget) : null,
    detail: llm.notes?.answers_target || (typeof llm.answersTarget === 'number' ? `Scored ${c(llm.answersTarget)}/100.` : hasTarget ? 'Not measured in this audit.' : 'No target question provided.'),
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

// ---- report, built from the checklist engine (single source of truth) ------
//
// The score, "Shape of the score" pillars and "Do these first" fixes used to
// come from a separate AI-judged pillar system while the
// Content/Indexability/Keywords/Details tabs came from the checklist engine —
// two independently-computed systems that could and did disagree on the same
// page (e.g. Overview says "Query Matchability: bad", Keywords tab says
// "all good", because they were never the same measurement). This function
// replaces that: every pillar score, the overall score, and every top fix are
// derived directly from the checklist's own items — the exact same data the
// other tabs render — so they cannot disagree with each other by construction.
//
// The AI judge call is still used, but only for what it's actually suited to:
// the free-text verdict summary, prompt coverage, per-engine likelihood
// estimates, and off-page domain context — never for the score itself.
export function buildReportFromChecklist(
  checklist: ChecklistResult, category: Category, prompts: PromptCoverage[],
  aiSummary: string | undefined, aiEngines: LlmScores['engines'] | undefined,
  crawl: Signal[], visibility: Visibility | null, domainContext: Signal[],
): AeoReport {
  const weights = CATEGORY_WEIGHTS[category] || CATEGORY_WEIGHTS.general;
  const items = checklist.items;
  const wsumByPillar: Partial<Record<PillarId, number>> = {};
  const itemScore = (status: SignalStatus) => status === 'pass' ? 100 : status === 'warn' ? 50 : 0;

  const pillars: PillarResult[] = PILLAR_META.map((p) => {
    const inPillar = items.filter((i) => i.pillar === p.id && i.status !== 'na');
    const wsum = inPillar.reduce((a, i) => a + i.weight, 0);
    wsumByPillar[p.id] = wsum || 1;
    const measured = wsum > 0;
    const earned = inPillar.reduce((a, i) => a + i.weight * (i.status === 'pass' ? 1 : i.status === 'warn' ? 0.5 : 0), 0);
    const score = measured ? Math.round((earned / wsum) * 100) : 0;
    const weight = weights[p.id];
    const signals: Signal[] = inPillar.map((i) => ({
      id: i.id, label: i.label, pillar: p.id, score: itemScore(i.status),
      weight: i.weight, status: i.status, detail: i.detail, fix: i.fix, source: 'auto',
    }));
    return { id: p.id, label: LABEL[p.id], purpose: PURPOSE[p.id], weight, score, points: Math.round((score / 100) * weight), measured, signals };
  });

  const live = pillars.filter((p) => p.measured);
  const liveWeight = live.reduce((a, p) => a + p.weight, 0);
  const overall = liveWeight > 0 ? Math.round(live.reduce((a, p) => a + p.score * p.weight, 0) / liveWeight) : 0;

  const gainOf = (i: ChecklistResult['items'][number]): number => {
    const pw = weights[i.pillar as PillarId] ?? 0;
    const wsum = wsumByPillar[i.pillar as PillarId] ?? 1;
    return ((100 - itemScore(i.status)) / 100) * (i.weight / wsum) * pw;
  };

  const topFixes = items
    .filter((i) => i.fix && (i.status === 'fail' || i.status === 'warn'))
    .map((i) => ({ i, gain: gainOf(i) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 8)
    .map(({ i, gain }) => ({
      label: i.label, severity: i.status, why: i.why, fix: i.fix as string,
      pillar: i.pillar, gain: Math.round(gain * 10) / 10,
      tag: (gain >= 3 ? 'high' : 'quick') as 'quick' | 'high',
    }));

  const sortedP = [...live].sort((a, b) => a.score - b.score);
  const weakest = sortedP[0], strongest = sortedP[sortedP.length - 1];
  const band = overall >= 70 ? 'High' : overall >= 45 ? 'Medium' : 'Low';
  const ENGINES = 'ChatGPT, Gemini, Perplexity and Google AI Mode';
  const likely = band === 'High'
    ? `${ENGINES} are likely to cite this page.`
    : band === 'Medium'
      ? `${ENGINES} might cite this page, but it needs work first.`
      : `${ENGINES} are unlikely to cite this page as it stands.`;
  const fallbackSummary = weakest && strongest
    ? `${likely} It's strongest on ${strongest.label.toLowerCase()} and weakest on ${weakest.label.toLowerCase()} — that's what's holding it back. ${topFixes[0] ? `Fix "${topFixes[0].label}" first.` : ''}`
    : likely;

  const engines: EngineScores | null = (() => {
    const e = aiEngines;
    const pill = (id: PillarId) => pillars.find((p) => p.id === id)?.score ?? overall;
    const clampn = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    if (e && [e.chatgpt, e.gemini, e.perplexity, e.aiOverviews].some((x) => typeof x === 'number')) {
      return {
        chatgpt: clampn(e.chatgpt ?? overall), gemini: clampn(e.gemini ?? overall),
        perplexity: clampn(e.perplexity ?? overall), aiOverviews: clampn(e.aiOverviews ?? overall),
      };
    }
    return {
      chatgpt: clampn(overall * 0.6 + pill('attribution') * 0.4),
      gemini: clampn(overall * 0.6 + pill('entity') * 0.4),
      perplexity: clampn(overall * 0.6 + pill('freshness') * 0.4),
      aiOverviews: clampn(overall * 0.6 + pill('structure') * 0.4),
    };
  })();

  const crawlBlocked = crawl.some((s) => s.id.startsWith('bot_') && s.score === 0);

  return {
    overall, grade: gradeFor(overall), category,
    summary: (aiSummary && aiSummary.trim()) || fallbackSummary,
    benchmark: benchmarkFor(overall),
    citationBand: band,
    gate: gateFor(overall), pillars, domainContext, crawlability: crawl, crawlBlocked, visibility,
    promptCoverage: prompts, topFixes,
    engines,
    coverage: {
      measuredWeight: liveWeight,
      totalWeight: pillars.reduce((a, p) => a + p.weight, 0),
      complete: live.length === pillars.length,
      unmeasured: pillars.filter((p) => !p.measured).map((p) => p.label),
    },
  };
}
