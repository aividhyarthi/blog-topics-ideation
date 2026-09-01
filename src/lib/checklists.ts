// AI Page Audit — the AEO checklist engine.
//
// WHY THIS EXISTS
// ---------------
// The original auditor ran one generic signal list against every page and only
// varied the *pillar weights* by category — and the category itself was picked
// from a dropdown that defaulted to "general", so in practice almost every audit
// ran the same checks with the same weights. A breaking-news story and a
// lipstick product page were graded identically.
//
// This module replaces that with an explicit, named checklist per page kind and
// per vertical, and detects both from the HTML instead of asking. A beauty
// product page is now asked whether its INCI ingredient list is real text; a
// news story is asked whether it carries a dateline and a named source. Those
// are different questions, because answer engines reward different things.
//
// Every check states WHY it affects AI citation, so the report can explain
// itself to a client rather than just showing a number.

import type { PageFacts, PillarId, SignalStatus } from './aeo';

// ---- taxonomy ---------------------------------------------------------------

/** Subject matter. Drives which domain checklist runs. */
export type Vertical =
  | 'news' | 'health' | 'beauty' | 'ecommerce' | 'entertainment'
  | 'lifestyle' | 'reviews' | 'general'
  | 'fintech' | 'realestate' | 'automotive' | 'edtech' | 'saas' | 'music';

/** Structural shape of the page. Independent of subject matter. */
export type PageKind = 'article' | 'product' | 'listing' | 'review' | 'howto';

export const VERTICAL_LABEL: Record<Vertical, string> = {
  news: 'News', health: 'Health & Medical', beauty: 'Beauty & Personal Care',
  ecommerce: 'E-commerce', entertainment: 'Entertainment', lifestyle: 'Lifestyle & How-to',
  reviews: 'Product Review', general: 'General',
  fintech: 'Fintech & Finance', realestate: 'Real Estate', automotive: 'Automotive',
  edtech: 'Education & EdTech', saas: 'SaaS & Technology', music: 'Music & Audio',
};

export const KIND_LABEL: Record<PageKind, string> = {
  article: 'Article', product: 'Product page', listing: 'Category / listing',
  review: 'Review', howto: 'How-to / guide',
};

// ---- check shape ------------------------------------------------------------

export interface CheckResult {
  status: SignalStatus;
  detail: string;
  fix?: string;
}

export interface Check {
  id: string;
  label: string;
  /** Why this affects whether an AI answer cites the page. Shown in the report. */
  why: string;
  pillar: PillarId;
  /** Relative importance within the checklist. 3 = decisive, 1 = nice to have. */
  weight: 1 | 2 | 3;
  run: (c: Ctx) => CheckResult;
}

export interface Ctx {
  html: string;
  /** Lowercased HTML — most detection is case-insensitive substring work. */
  h: string;
  /** Visible text only. */
  text: string;
  t: string;
  facts: PageFacts;
  kind: PageKind;
  vertical: Vertical;
}

// ---- tiny helpers -----------------------------------------------------------

const pass = (detail: string): CheckResult => ({ status: 'pass', detail });
const warn = (detail: string, fix: string): CheckResult => ({ status: 'warn', detail, fix });
const fail = (detail: string, fix: string): CheckResult => ({ status: 'fail', detail, fix });
const na = (detail: string): CheckResult => ({ status: 'na', detail });

const count = (s: string, re: RegExp): number => (s.match(re) || []).length;
const hasSchema = (f: PageFacts, ...types: string[]) =>
  f.schemaTypes.some((s) => types.some((t) => s.toLowerCase() === t.toLowerCase()));

/** ISO-ish date anywhere in the raw HTML (schema, <time>, meta). */
const DATE_RE = /\b(20\d{2})-(\d{2})-(\d{2})\b/;

function monthsSince(iso: string): number | null {
  const m = DATE_RE.exec(iso || '');
  if (!m) return null;
  const then = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44);
}

// =============================================================================
// DETECTION — work out what the page IS before deciding what to ask of it
// =============================================================================

export interface Detection<T> {
  value: T;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

/**
 * Structural shape. Schema.org is trusted first because it is an explicit
 * declaration by the site; the heuristics below it are for pages with no markup
 * at all (which is most of the web).
 */
export function detectPageKind(html: string, f: PageFacts): Detection<PageKind> {
  const h = html.toLowerCase();
  const ev: string[] = [];

  if (hasSchema(f, 'Review')) { ev.push('Review schema present'); return { value: 'review', confidence: 'high', evidence: ev }; }
  if (hasSchema(f, 'HowTo', 'Recipe')) { ev.push('HowTo/Recipe schema present'); return { value: 'howto', confidence: 'high', evidence: ev }; }
  if (hasSchema(f, 'Product')) { ev.push('Product schema present'); return { value: 'product', confidence: 'high', evidence: ev }; }
  if (hasSchema(f, 'ItemList', 'CollectionPage')) { ev.push('ItemList/CollectionPage schema present'); return { value: 'listing', confidence: 'high', evidence: ev }; }

  // No markup — fall back to shape.
  const reviewish = /\b(our verdict|the verdict|pros and cons|we tested|hands[- ]on review|star rating)\b/.test(h);
  if (reviewish && f.hasAggregateRating) { ev.push('verdict/pros-cons language + a rating'); return { value: 'review', confidence: 'medium', evidence: ev }; }
  if (reviewish) { ev.push('verdict / pros-and-cons / "we tested" language'); return { value: 'review', confidence: 'low', evidence: ev }; }

  const howtoish = /\b(step 1|step one|how to|ingredients|instructions|you will need|prep time)\b/.test(h);
  if (howtoish && f.lists >= 1) { ev.push('step/ingredient language with real lists'); return { value: 'howto', confidence: 'medium', evidence: ev }; }

  if (f.hasAddToCart && f.priceCount >= 1 && f.priceCount <= 5) { ev.push('add-to-cart with a single price'); return { value: 'product', confidence: 'medium', evidence: ev }; }
  if (f.priceCount >= 6) { ev.push(`${f.priceCount} prices on one page`); return { value: 'listing', confidence: 'medium', evidence: ev }; }

  ev.push('no product/listing/review markers — treated as an article');
  return { value: 'article', confidence: f.wordCount > 300 ? 'medium' : 'low', evidence: ev };
}

/**
 * Subject matter. Keyword scoring rather than a single match, so one stray word
 * ("review", "healthy") doesn't hijack the classification.
 */
export function detectVertical(html: string, f: PageFacts, kind?: PageKind): Detection<Vertical> {
  const h = (html + ' ' + f.title + ' ' + f.metaDescription).toLowerCase();
  const score: Record<Exclude<Vertical, 'general'>, number> = {
    news: 0, health: 0, beauty: 0, ecommerce: 0, entertainment: 0, lifestyle: 0, reviews: 0,
    fintech: 0, realestate: 0, automotive: 0, edtech: 0, saas: 0, music: 0,
  };
  const why: Record<string, string[]> = {};
  const hit = (k: keyof typeof score, re: RegExp, n: number, label: string) => {
    if (re.test(h)) { score[k] += n; (why[k] ||= []).push(label); }
  };

  hit('news', /\b(reuters|associated press|\bpti\b|\bani\b|breaking|developing story|correspondent|bureau report)/, 3, 'newswire / breaking-story language');
  hit('news', /"@type"\s*:\s*"newsarticle"/, 4, 'NewsArticle schema');
  hit('news', /\b(datelined?|filed on|updated \d|published \d)\b/, 2, 'publication timestamps');

  hit('health', /\b(symptom|diagnos|treatment|dosage|side[- ]effect|clinical|patient|therap|infection|inflammat)/, 3, 'clinical vocabulary');
  hit('health', /\b(mg\/dl|\bbmi\b|blood pressure|cholesterol|nutrient|deficien|vitamin|immunity)/, 2, 'medical measures');
  hit('health', /\b(md\b|\bmbbs\b|\brd\b|dietitian|physician|medically reviewed)\b/, 3, 'clinician credentials');

  hit('beauty', /\b(ingredient|inci|paraben|sulphate|sulfate|hyaluronic|retinol|niacinamide|salicylic|ceramide)/, 3, 'ingredient vocabulary');
  hit('beauty', /\b(skin type|oily skin|dry skin|shade|swatch|spf|dermatolog|comedogenic|blemish)/, 3, 'skin/shade vocabulary');
  hit('beauty', /\b(foundation|concealer|lipstick|mascara|serum|moisturis|moisturiz|cleanser|shampoo|fragrance)\b/, 2, 'cosmetic product words');

  hit('ecommerce', /"@type"\s*:\s*"product"/, 4, 'Product schema');
  hit('ecommerce', /\b(add to cart|add to bag|buy now|in stock|out of stock|free delivery|cod available)\b/, 3, 'commerce controls');
  hit('ecommerce', /\b(mrp|inclusive of all taxes|emi|return policy|warranty)\b/, 2, 'retail terms');

  hit('entertainment', /\b(box office|streaming on|episode|season \d|trailer|directed by|\bott\b|screenplay)/, 3, 'screen vocabulary');
  hit('entertainment', /"@type"\s*:\s*"(movie|tvseries|episode)"/, 4, 'Movie/TVSeries schema');

  hit('lifestyle', /\b(step 1|how to|diy|recipe|prep time|cook time|beginner.s guide|checklist)\b/, 3, 'instructional vocabulary');
  hit('lifestyle', /"@type"\s*:\s*"(howto|recipe)"/, 4, 'HowTo/Recipe schema');

  hit('reviews', /\b(our verdict|pros and cons|we tested|hands[- ]on|rating:|out of 5|should you buy)\b/, 3, 'review vocabulary');
  hit('reviews', /"@type"\s*:\s*"review"/, 4, 'Review schema');

  hit('fintech', /\b(interest rate|apr\b|emi\b|credit score|loan amount|repayment|mutual fund|expense ratio|premium|sum insured|brokerage|demat|nav\b|sip\b)/, 3, 'financial-product vocabulary');
  hit('fintech', /\b(eligibility|kyc|rbi|sebi|irdai|regulated by|prospectus|terms and conditions apply)/, 2, 'financial regulatory language');
  hit('fintech', /"@type"\s*:\s*"(financialproduct|loanorcredit|investmentorDeposit)"/i, 4, 'financial product schema');

  hit('realestate', /\b(carpet area|built[- ]up area|price per sq ?ft|\bbhk\b|possession date|rera\b|under construction|ready to move)/, 3, 'property listing vocabulary');
  hit('realestate', /\b(sq\.?\s?ft|sqft|square feet|floor plan|amenities|gated community)/, 2, 'property description terms');
  hit('realestate', /"@type"\s*:\s*"(residence|apartment|realestatelisting|singlefamilyresidence)"/i, 4, 'property schema');

  hit('automotive', /\b(mileage|ex[- ]showroom|on[- ]road price|variant|fuel type|transmission|ground clearance|bhp\b|torque|airbags?)/, 3, 'vehicle spec vocabulary');
  hit('automotive', /\b(sedan|suv|hatchback|petrol|diesel|electric vehicle|\bev\b|manual|automatic transmission)/, 2, 'vehicle category terms');
  hit('automotive', /"@type"\s*:\s*"(car|vehicle|automobile)"/i, 4, 'vehicle schema');

  hit('edtech', /\b(syllabus|curriculum|semester|eligibility criteria|admission|enroll|course fee|placement|accredit|certification)/, 3, 'course/education vocabulary');
  hit('edtech', /\b(instructor|faculty|lecture|module \d|learning outcome|batch starts)/, 2, 'instructional-programme terms');
  hit('edtech', /"@type"\s*:\s*"course"/i, 4, 'Course schema');

  hit('saas', /\b(api\b|integration|dashboard|free trial|pricing plan|per seat|per user\/month|uptime|sla\b|onboarding)/, 3, 'software-product vocabulary');
  hit('saas', /\b(sign up free|book a demo|self[- ]serve|enterprise plan|soc 2|gdpr compliant)/, 2, 'SaaS commercial terms');
  hit('saas', /"@type"\s*:\s*"softwareapplication"/i, 4, 'SoftwareApplication schema');

  hit('music', /\b(album|single|track list|streaming on|spotify|apple music|record label|producer|songwriter|composer)\b/, 3, 'music-industry vocabulary');
  hit('music', /"@type"\s*:\s*"(musicgroup|musicrecording|musicalbum|musicplaylist)"/i, 4, 'music schema');

  // On a page we already know is a product or listing, "this is commerce" is
  // not news — it is implied by the kind. Discount it so the actual subject
  // (beauty, electronics, health…) decides which domain checklist runs.
  if (kind === 'product' || kind === 'listing') score.ecommerce = Math.max(0, score.ecommerce - 7);

  let best: Vertical = 'general';
  let top = 0;
  (Object.keys(score) as (keyof typeof score)[]).forEach((k) => { if (score[k] > top) { top = score[k]; best = k; } });

  if (top < 3) return { value: 'general', confidence: 'low', evidence: ['no strong subject signals — using the general checklist'] };
  return {
    value: best,
    confidence: top >= 7 ? 'high' : top >= 5 ? 'medium' : 'low',
    evidence: (why[best] || []).slice(0, 3),
  };
}

// =============================================================================
// UNIVERSAL — true for any page an answer engine might cite
// =============================================================================

export const UNIVERSAL: Check[] = [
  {
    id: 'u_answer_first',
    label: 'Answer in the opening lines',
    why: 'Models retrieve a passage, not a page. If the answer is not in the first two sentences of a section, it usually is not in the chunk that gets quoted.',
    pillar: 'answerability', weight: 3,
    run: (c) => {
      const lead = c.facts.firstWords || c.text.slice(0, 400);
      const words = lead.trim().split(/\s+/).length;
      if (!words || words < 10) return fail('No substantive opening paragraph found.', 'Open with 1–2 sentences that answer the page’s core question outright.');
      const hedged = /\b(in this (article|post|guide)|we will (explore|discuss|look)|read on|let.s dive)\b/i.test(lead);
      if (hedged) return fail('The opening previews the article instead of answering.', 'Replace the throat-clearing intro with the answer itself. "In this guide we\'ll explore…" is unquotable.');
      return pass(`Opening ${words} words state something directly.`);
    },
  },
  {
    id: 'u_js_dependent',
    label: 'Content present without JavaScript',
    why: 'Googlebot renders JavaScript; GPTBot, ClaudeBot and PerplexityBot do not. JS-injected content is invisible to every answer engine at once.',
    pillar: 'structure', weight: 3,
    run: (c) => {
      if (!c.facts.jsDependent) return pass(`Readable text is in the server HTML (${c.facts.textRatioPct}% text ratio).`);
      return fail(
        `Page looks JavaScript-rendered${c.facts.framework ? ` (${c.facts.framework})` : ''} — only ${c.facts.textRatioPct}% of the response is text.`,
        'Server-render the substance (title, body, price, specs, reviews). AI crawlers never run your JavaScript.',
      );
    },
  },
  {
    id: 'u_question_headings',
    label: 'Headings phrased as real questions',
    why: 'Retrieval matches a user’s question against your headings. A heading that is already the question is the strongest match you can offer.',
    pillar: 'query', weight: 2,
    run: (c) => {
      const qs = c.facts.headings.filter((x) => /\?|^(how|what|why|when|which|where|who|is|are|can|should|does)\b/i.test(x.text)).length;
      if (c.facts.headings.length < 2) return fail('Almost no headings — the page is one undifferentiated block.', 'Break the page into sections with descriptive headings.');
      if (qs === 0) return warn(`${c.facts.headings.length} headings, none phrased as a question.`, 'Rewrite 2–3 headings as the question a user would actually type.');
      return pass(`${qs} of ${c.facts.headings.length} headings are question-shaped.`);
    },
  },
  {
    id: 'u_named_sources',
    label: 'Claims attributed to named sources',
    why: 'Controlled testing (the Princeton GEO study) found citing authoritative sources measurably increases how often a page is quoted. Models repeat attributed claims more readily than floating ones.',
    pillar: 'attribution', weight: 3,
    run: (c) => {
      const vague = count(c.t, /\b(experts say|studies show|research suggests|it is said|many believe)\b/g);
      const named = c.facts.externalLinks + c.facts.quotedPhrases;
      if (named === 0 && vague > 0) return fail(`${vague} vague appeals ("experts say") and no named sources.`, 'Name and link the actual source of each claim.');
      if (vague > named) return warn(`More vague appeals (${vague}) than named sources (${named}).`, 'Replace "studies show" with the study, the organisation and a link.');
      if (named === 0) return warn('No outbound citations or quoted material.', 'Attribute key claims to a named, linked source.');
      return pass(`${named} attributed or quoted references.`);
    },
  },
  {
    id: 'u_statistics',
    label: 'Specific numbers rather than adjectives',
    why: 'A number is self-contained and survives being lifted out of context. "Traffic fell sharply" is unusable to an answer engine; "traffic fell 58%" is quotable on its own.',
    pillar: 'attribution', weight: 2,
    run: (c) => {
      if (c.facts.statistics >= 3) return pass(`${c.facts.statistics} concrete figures.`);
      if (c.facts.statistics >= 1) return warn(`Only ${c.facts.statistics} concrete figure(s).`, 'Replace qualitative claims with measured numbers wherever you have them.');
      return fail('No specific figures found.', 'Add real numbers — quantities, dates, percentages, prices, durations.');
    },
  },
  {
    id: 'u_entities',
    label: 'Entities named, not implied by pronouns',
    why: 'A retrieved chunk arrives without the paragraph that defined "it". Sections that lean on pronouns become unusable once separated.',
    pillar: 'entity', weight: 2,
    run: (c) => {
      const per100 = c.facts.wordCount ? (c.facts.pronouns / c.facts.wordCount) * 100 : 0;
      if (per100 > 6) return fail(`Heavy pronoun use (${per100.toFixed(1)} per 100 words).`, 'Name the product, person or company again at the start of each section.');
      if (per100 > 3.5) return warn(`Moderate pronoun density (${per100.toFixed(1)} per 100 words).`, 'Re-state the subject by name in section openers.');
      return pass(`Entities are named explicitly (${per100.toFixed(1)} pronouns per 100 words).`);
    },
  },
  {
    id: 'u_freshness',
    label: 'Published and updated dates in markup',
    why: 'Answer engines prefer sources they can date, and heavily discount undated pages on anything time-sensitive.',
    pillar: 'freshness', weight: 2,
    run: (c) => {
      if (!c.facts.datePublished && !c.facts.dateModified) return fail('No published or modified date in the markup.', 'Add datePublished and dateModified to your Article/Product schema.');
      const age = monthsSince(c.facts.dateModified || c.facts.datePublished);
      if (age !== null && age > 24) return warn(`Last dated ${Math.round(age)} months ago.`, 'Refresh and re-date the page, or an engine will prefer a newer source.');
      return pass(c.facts.dateModified ? 'Published and modified dates present.' : 'Published date present.');
    },
  },
  {
    id: 'u_structured_data',
    label: 'Structured data describing the page',
    why: 'Roughly two-thirds of the pages Google AI Mode cites, and about seven in ten of the pages ChatGPT cites, carry schema markup. It is the clearest signal in the whole checklist: it tells the engine what the page is instead of making it guess.',
    pillar: 'structure', weight: 3,
    run: (c) => {
      const types = c.facts.schemaTypes || [];
      // Organization/WebSite are site furniture — nearly every CMS emits them,
      // and on their own they say nothing about this page.
      const generic = new Set(['organization', 'website', 'webpage', 'breadcrumblist', 'sitenavigationelement']);
      const meaningful = types.filter((t) => !generic.has(t.toLowerCase()));
      if (!types.length) return fail('No schema.org markup at all.', 'Add JSON-LD describing this page — Article, Product, Recipe, Review or FAQPage, whichever fits.');
      if (!meaningful.length) return warn(`Only site-level markup (${types.join(', ')}).`, 'Add markup for the page itself, not just the site. Organization and WebSite tell an engine nothing about this page.');
      return pass(`Describes itself as ${meaningful.join(', ')}.`);
    },
  },
  {
    id: 'u_self_contained_sections',
    label: 'Sections short enough to be quoted whole',
    why: 'Engines retrieve a passage of roughly 100–300 words, not the page. One long undivided block gets split mid-thought and usually discarded; a page of tight, self-contained sections gives the engine something it can lift intact.',
    pillar: 'structure', weight: 2,
    run: (c) => {
      const sub = (c.facts.headings || []).filter((h) => h.level >= 2).length;
      const words = c.facts.wordCount;
      if (words < 200) return na('Too short for section structure to matter.');
      if (!sub) return fail('No subheadings — the page is one undivided block.', 'Break the page into sections with H2s every 150–300 words so each one can be retrieved on its own.');
      const per = Math.round(words / (sub + 1));
      if (per > 450) return fail(`About ${per} words per section — too long to be retrieved whole.`, 'Add more subheadings. Aim for roughly 150–300 words between them.');
      if (per > 320) return warn(`About ${per} words per section.`, 'Slightly long. More frequent subheadings make each section easier to quote.');
      return pass(`About ${per} words per section across ${sub} subheadings.`);
    },
  },
  {
    id: 'u_original_data',
    label: 'Original data or first-hand evidence',
    why: 'Pages carrying original figures — your own testing, survey or internal data — are measurably more likely to be quoted, because they are the only source for that number. Content that only restates what other sites already say gives an engine no reason to pick it over them.',
    pillar: 'attribution', weight: 2,
    run: (c) => {
      const t = c.t;
      const firstHand = /\b(we tested|we measured|our (test|research|survey|analysis|data|study)|in our testing|we surveyed|we spoke to|according to our|internal data|we analysed|we analyzed)\b/.test(t);
      const stats = c.facts.statistics;
      if (firstHand) return pass('States first-hand testing, research or data.');
      if (stats >= 8) return warn(`${stats} figures, but none presented as your own.`, 'Where a number is yours — your testing, your sample, your sales data — say so explicitly. "We tested 12 units over 3 weeks" is citable in a way a borrowed statistic is not.');
      return warn('No original data or first-hand evidence.', 'Add at least one thing only you can report: your own test result, sample, or internal figure.');
    },
  },
  {
    id: 'u_heading_hierarchy',
    label: 'One H1 and a clean heading order',
    why: 'The heading tree is how a parser works out which text belongs to which topic. Several H1s, or an H2 that jumps straight to H4, produce sections attached to the wrong heading — so the right answer gets filed under the wrong question.',
    pillar: 'structure', weight: 1,
    run: (c) => {
      const hs = c.facts.headings || [];
      if (!hs.length) return fail('No headings at all.', 'Add a single H1 and H2s for each section.');
      if (c.facts.h1Count === 0) return fail('No H1 on the page.', 'Add exactly one H1 stating what the page is about.');
      if (c.facts.h1Count > 1) return warn(`${c.facts.h1Count} H1s — the main topic is ambiguous.`, 'Keep one H1 and demote the rest to H2.');
      let skipped = 0;
      for (let i = 1; i < hs.length; i++) if (hs[i].level - hs[i - 1].level > 1) skipped++;
      if (skipped > 2) return warn(`${skipped} places where a heading level is skipped.`, 'Go down one level at a time — H2 then H3, never H2 straight to H4.');
      return pass('One H1 with a consistent heading order.');
    },
  },
  {
    id: 'u_alt_text',
    label: 'Images described in text',
    why: 'The crawlers behind ChatGPT, Claude and Perplexity read HTML, not pictures. Anything that exists only inside an image — a spec table, a chart, a comparison — is simply absent unless the alt text says what it shows.',
    pillar: 'structure', weight: 1,
    run: (c) => {
      const imgs = c.facts.images;
      if (!imgs) return na('No images on the page.');
      const pct = Math.round((c.facts.imagesWithAlt / imgs) * 100);
      if (pct < 40) return fail(`Only ${pct}% of ${imgs} images have alt text.`, 'Describe what each image shows. If a chart or table is an image, put its numbers in the page as text too.');
      if (pct < 80) return warn(`${pct}% of ${imgs} images have alt text.`, 'Fill in the rest, and make the descriptions specific rather than a repeat of the filename.');
      return pass(`${pct}% of ${imgs} images carry alt text.`);
    },
  },
  {
    id: 'u_payload_weight',
    label: 'Page light enough for AI crawlers',
    why: 'AI crawlers are far less patient than Googlebot — many give up after one to five seconds. A very heavy document risks being abandoned before the content is read, which costs the citation regardless of how good the writing is.',
    pillar: 'structure', weight: 1,
    run: (c) => {
      const kb = Math.round(c.html.length / 1024);
      if (!kb) return na('No HTML to measure.');
      if (kb > 1500) return fail(`The HTML alone is about ${kb} KB.`, 'Cut the page weight. AI crawlers time out in seconds and this risks being abandoned before your content is read.');
      if (kb > 700) return warn(`The HTML is about ${kb} KB — heavier than most.`, 'Trim inline scripts and styles so the content arrives quickly.');
      return pass(`HTML is about ${kb} KB.`);
    },
  },
  {
    id: 'u_snippet_controls',
    label: 'Not blocking snippets or AI use',
    why: 'nosnippet and max-snippet:0 tell search engines not to show any text preview of this page at all — which also removes it as a candidate for AI Overviews and AI Mode. This is usually set by mistake, in a template, not per page.',
    pillar: 'structure', weight: 1,
    run: (c) => {
      const meta = (c.facts.robotsMeta || '').toLowerCase();
      if (/nosnippet/.test(meta)) return fail('meta robots contains "nosnippet" — no preview text, and no AI Overviews eligibility.', 'Remove nosnippet unless you specifically intend to opt this page out of snippets and AI answers.');
      const maxSnippet = /max-snippet:\s*(-?\d+)/.exec(meta);
      if (maxSnippet && maxSnippet[1] === '0') return fail('meta robots sets max-snippet:0 — equivalent to nosnippet.', 'Remove max-snippet:0, or raise the limit so enough text is available to quote.');
      if (/\bdata-nosnippet\b/.test(c.h)) {
        return warn('data-nosnippet is used somewhere in the page body.', 'Confirm it is only on boilerplate (nav, legal text) and not on the actual content — it excludes that HTML from snippets.');
      }
      return pass('No snippet-blocking directives found.');
    },
  },
  {
    id: 'u_video_described',
    label: 'Video content described in text',
    why: 'AI crawlers do not watch video. Anything said only on camera — a demo, an explanation, a verdict — is invisible unless the surrounding text or a transcript restates it.',
    pillar: 'structure', weight: 1,
    run: (c) => {
      if (!c.facts.hasVideo) return na('No video on this page.');
      const hasVideoSchema = hasSchema(c.facts, 'VideoObject');
      const transcriptish = /\btranscript\b/i.test(c.t) || c.facts.wordCount > 300;
      if (hasVideoSchema && transcriptish) return pass('Video is marked up and the page carries substantial accompanying text.');
      if (!hasVideoSchema && !transcriptish) return fail('Video present with no VideoObject schema and almost no surrounding text.', 'Add VideoObject schema (name, description, transcript) and summarise the video’s key points as text on the page.');
      if (!hasVideoSchema) return warn('Video present but no VideoObject schema.', 'Add VideoObject JSON-LD so engines get the title, description and transcript as data.');
      return warn('VideoObject schema present but little supporting text on the page.', 'Add a text summary or transcript excerpt near the video — the schema alone is thin evidence.');
    },
  },
];

// =============================================================================
// BY PAGE KIND
// =============================================================================

export const BY_KIND: Record<PageKind, Check[]> = {
  article: [
    {
      id: 'a_faq',
      label: 'FAQ block',
      why: 'FAQ markup maps one question directly onto one quotable answer — the single most extractable structure a page can offer.',
      pillar: 'query', weight: 2,
      run: (c) => (hasSchema(c.facts, 'FAQPage') ? pass('FAQPage schema present.')
        : c.facts.hasFaqHeading ? warn('FAQ section exists but is not marked up as FAQPage schema.', 'Wrap it in FAQPage JSON-LD so engines can parse each Q/A pair.')
        : fail('No FAQ section.', 'Add 3–5 real questions with direct answers, marked up as FAQPage.')),
    },
    {
      id: 'a_author',
      label: 'Named author',
      why: 'An identifiable author is a trust signal engines weigh when choosing between two otherwise-similar sources.',
      pillar: 'attribution', weight: 2,
      run: (c) => (c.facts.hasAuthor ? pass('Author is identified in the markup.')
        : fail('No author in the markup.', 'Add a real bylined author to the page and to your Article schema.')),
    },
  ],

  product: [
    {
      id: 'p_price_text',
      label: 'Price readable in the HTML',
      why: 'AI shopping answers quote price. If the price is injected by JavaScript, the engine reports the product without one — or skips it.',
      pillar: 'answerability', weight: 3,
      run: (c) => {
        if (c.facts.priceCount === 0) return fail('No price found in the server HTML.', 'Render the price as text server-side, and put it in Product > offers > price.');
        if (c.facts.jsDependent) return warn('Price found, but the page is largely JS-rendered.', 'Confirm the price is in the raw HTML, not painted in by script.');
        return pass('Price is present as text.');
      },
    },
    {
      id: 'p_schema',
      label: 'Product schema with offers',
      why: 'Product markup removes guesswork: the engine reads price, currency and availability as declared values instead of inferring them from prose.',
      pillar: 'structure', weight: 3,
      run: (c) => {
        if (!hasSchema(c.facts, 'Product')) return fail('No Product schema.', 'Add Product JSON-LD with name, brand, offers (price, priceCurrency, availability).');
        const offers = /"offers"\s*:/.test(c.h);
        const availability = /"availability"\s*:/.test(c.h);
        if (!offers) return warn('Product schema present but no offers block.', 'Add offers with price, priceCurrency and availability.');
        if (!availability) return warn('Offers present but availability is not declared.', 'Add availability (InStock / OutOfStock) — answer engines filter on it.');
        return pass('Product schema includes offers and availability.');
      },
    },
    {
      id: 'p_reviews_real',
      label: 'Review text actually in the HTML',
      why: 'A declared count persuades humans; the review text persuades models. If you claim 1,200 reviews and render three, three is the entire evidence base an engine has.',
      pillar: 'attribution', weight: 3,
      run: (c) => {
        const declared = /"reviewcount"\s*:\s*"?(\d+)/.exec(c.h);
        const bodies = count(c.h, /"reviewbody"\s*:/g) + count(c.h, /class="[^"]*review[-_]?(text|body|content)/g);
        if (!c.facts.hasAggregateRating && bodies === 0) return fail('No ratings and no review text.', 'Server-render 10–20 reviews with Review schema.');
        if (declared && bodies === 0) return fail(`Declares ${declared[1]} reviews but no review text is in the HTML.`, 'Render a batch of real review text server-side — the aggregate number alone gives an engine nothing to quote.');
        if (declared && bodies < 5) return warn(`Declares ${declared[1]} reviews but only ${bodies} are in the HTML.`, 'Server-render at least 10–20 individual reviews.');
        if (bodies === 0) return warn('Rating present, but no individual review text.', 'Add real review text, not just a star average.');
        return pass(`${bodies} individual reviews present in the HTML.`);
      },
    },
    {
      id: 'e_availability',
      label: 'Stock status in text',
      why: 'Shopping answers filter on availability. An engine that cannot read stock status usually drops the product from the comparison.',
      pillar: 'answerability', weight: 2,
      run: (c) => (/\b(in stock|out of stock|sold out|available|ships? (in|within)|delivery by)\b/i.test(c.t)
        ? pass('Availability stated in text.')
        : warn('No availability text.', 'Render stock status as text and in Product > offers > availability.')),
    },
    {
      id: 'e_brand_model',
      label: 'Brand and model named explicitly',
      why: 'Product questions are asked by brand and model. A page titled only "Wireless Earbuds" cannot be matched to the query.',
      pillar: 'entity', weight: 3,
      run: (c) => {
        const inTitle = /[A-Z][a-zA-Z]+\s+[A-Z0-9][\w-]*/.test(c.facts.title || '');
        const brandSchema = /"brand"\s*:/.test(c.h);
        if (brandSchema && inTitle) return pass('Brand and model appear in the title and the markup.');
        if (!inTitle) return fail('Title does not name a specific brand and model.', 'Put brand + model in the H1 and title, exactly as people search it.');
        return warn('Brand not declared in schema.', 'Add brand to your Product JSON-LD.');
      },
    },
    {
      id: 'e_returns',
      label: 'Returns / warranty terms on the page',
      why: '"Can I return it" is among the most-asked pre-purchase questions, and it is usually buried on a separate policy page the engine never associates with the product.',
      pillar: 'query', weight: 1,
      run: (c) => (/\b(return|refund|warranty|guarantee|exchange)\b/i.test(c.t)
        ? pass('Returns/warranty mentioned on the page.')
        : warn('No returns or warranty text.', 'Summarise the return window and warranty on the product page itself.')),
    },
    {
      id: 'p_specs',
      label: 'Specifications as text',
      why: 'Specs are what comparison questions are answered from. In an image or a script-built table, they do not exist to the engine.',
      pillar: 'structure', weight: 2,
      run: (c) => ((c.facts.tables + c.facts.lists) >= 1 ? pass(`${c.facts.tables} table(s) and ${c.facts.lists} list(s) of structured detail.`)
        : fail('No spec table or list.', 'Publish specifications as a real HTML table or list, not an image.')),
    },
  ],

  listing: [
    {
      id: 'l_itemlist',
      label: 'ItemList schema',
      why: '"Best X under Y" questions are answered from listing pages. ItemList tells the engine this is a ranked set rather than one long article.',
      pillar: 'structure', weight: 2,
      run: (c) => (hasSchema(c.facts, 'ItemList') ? pass('ItemList schema present.')
        : fail('No ItemList schema.', 'Add ItemList JSON-LD naming each entry in order.')),
    },
    {
      id: 'l_entries_named',
      label: 'Each entry named with its price',
      why: 'A recommendation is only quotable if the engine can pair a specific product name with a specific price.',
      pillar: 'entity', weight: 3,
      run: (c) => {
        if (c.facts.priceCount === 0) return fail('No prices in the HTML.', 'Render each entry’s price as text.');
        if (c.facts.priceCount < 3) return warn(`Only ${c.facts.priceCount} prices for a listing page.`, 'Show the price against every entry.');
        return pass(`${c.facts.priceCount} priced entries.`);
      },
    },
  ],

  review: [
    {
      id: 'r_verdict',
      label: 'Verdict stated up front',
      why: 'The question is "should I buy this". A verdict in the opening lines is the passage most likely to be lifted verbatim.',
      pillar: 'answerability', weight: 3,
      run: (c) => (/\b(verdict|bottom line|should you buy|our take)\b/i.test(c.text.slice(0, 1200))
        ? pass('A verdict appears near the top.')
        : fail('No early verdict.', 'Put a one-line judgment and score in the first paragraph, before the detail.')),
    },
    {
      id: 'r_proscons',
      label: 'Pros and cons as text lists',
      why: 'Pros/cons are pre-chunked, balanced, quotable statements — close to ideal retrieval units.',
      pillar: 'structure', weight: 2,
      run: (c) => (/\b(pros|cons|what we liked|what we didn.t like|drawbacks)\b/i.test(c.t) && c.facts.lists >= 1
        ? pass('Pros/cons present as lists.')
        : fail('No pros-and-cons lists.', 'Add explicit Pros and Cons as real <ul> lists.')),
    },
    {
      id: 'r_method',
      label: 'Testing methodology stated',
      why: 'First-hand testing is what separates a review an engine will trust from marketing copy it will ignore.',
      pillar: 'attribution', weight: 3,
      run: (c) => (/\b(we tested|tested (it |this )?(for|over)|hours of (use|testing)|in our (tests|lab)|test (unit|sample))\b/i.test(c.t)
        ? pass('Describes how the product was tested.')
        : fail('No testing methodology.', 'State how long you tested it, in what conditions, and against what.')),
    },
    {
      id: 'r_review_schema',
      label: 'Review schema with rating and author',
      why: 'Review markup lets an engine attribute the verdict to a named reviewer and a numeric score rather than parsing it out of prose.',
      pillar: 'structure', weight: 2,
      run: (c) => (hasSchema(c.facts, 'Review') ? pass('Review schema present.')
        : warn('No Review schema.', 'Add Review JSON-LD with reviewRating and a named author.')),
    },
  ],

  howto: [
    {
      id: 'h_steps',
      label: 'Steps as a real ordered list',
      why: 'Step-by-step answers are reproduced almost verbatim by assistants — but only when the steps are list markup rather than paragraphs.',
      pillar: 'structure', weight: 3,
      run: (c) => {
        const ol = count(c.h, /<ol[\s>]/g);
        if (ol >= 1) return pass(`${ol} ordered list(s) of steps.`);
        if (c.facts.lists >= 1) return warn('Lists present, but no ordered <ol> list.', 'Use <ol> for sequences — order carries meaning here.');
        return fail('Steps are not in list markup.', 'Convert the procedure into a numbered <ol>.');
      },
    },
    {
      id: 'h_schema',
      label: 'HowTo or Recipe schema',
      why: 'This markup declares the steps, timings and materials explicitly, which is what voice and assistant answers read from.',
      pillar: 'structure', weight: 2,
      run: (c) => (hasSchema(c.facts, 'HowTo', 'Recipe') ? pass('HowTo/Recipe schema present.')
        : fail('No HowTo/Recipe schema.', 'Add HowTo (or Recipe) JSON-LD with each step, time and materials.')),
    },
    {
      id: 'h_prereq',
      label: 'Materials or prerequisites listed',
      why: 'An assistant relaying instructions needs to state what is required before step one, or the answer is incomplete and gets passed over.',
      pillar: 'answerability', weight: 2,
      run: (c) => (/\b(you will need|what you.ll need|materials|ingredients|prerequisite|requirements|tools needed)\b/i.test(c.t)
        ? pass('Prerequisites are stated.')
        : warn('No materials/prerequisites section.', 'List what the reader needs before the first step.')),
    },
  ],
};

// =============================================================================
// BY VERTICAL — the domain knowledge that makes this ours
// =============================================================================

export const BY_VERTICAL: Record<Vertical, Check[]> = {
  news: [
    {
      id: 'n_5w_lead',
      label: 'Lead answers who / what / when / where',
      why: 'News answers are assembled from the lead. A lead missing the when or where cannot be used to answer a factual question about the event.',
      pillar: 'answerability', weight: 3,
      run: (c) => {
        const lead = (c.facts.firstWords || c.text.slice(0, 500)).toLowerCase();
        const hasWhen = /\b(today|yesterday|on \w+day|\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|20\d{2})\b/.test(lead);
        const hasWhere = /\b(in|at) [A-Z]/.test(c.facts.firstWords || '');
        const missing = [!hasWhen && 'when', !hasWhere && 'where'].filter(Boolean);
        if (missing.length === 2) return fail('Lead states neither when nor where.', 'Open with the facts: who did what, when, and where.');
        if (missing.length === 1) return warn(`Lead does not make the ${missing[0]} explicit.`, `State the ${missing[0]} in the opening sentence.`);
        return pass('Lead carries the time and place.');
      },
    },
    {
      id: 'n_newsarticle',
      label: 'NewsArticle schema with both timestamps',
      why: 'On news queries, recency is close to decisive. Without machine-readable timestamps an engine cannot tell whether your version is the current one.',
      pillar: 'freshness', weight: 3,
      run: (c) => {
        if (!hasSchema(c.facts, 'NewsArticle', 'Article', 'ReportageNewsArticle')) return fail('No NewsArticle/Article schema.', 'Add NewsArticle JSON-LD with datePublished and dateModified.');
        if (!c.facts.dateModified) return warn('Published date present, modified date missing.', 'Add dateModified — for a developing story it is what marks your version as current.');
        return pass('NewsArticle schema with published and modified timestamps.');
      },
    },
    {
      id: 'n_primary_source',
      label: 'Primary source named',
      why: 'Engines strongly prefer the outlet that names the official, agency or document over one that writes "sources said".',
      pillar: 'attribution', weight: 3,
      run: (c) => {
        const anon = count(c.t, /\b(sources said|according to sources|people familiar)\b/gi);
        const named = c.facts.quotedPhrases + count(c.t, /\b(according to (the )?[A-Z][a-z]+|said [A-Z][a-z]+|told (Reuters|AP|PTI|ANI|the [A-Z]))/g);
        if (named === 0 && anon > 0) return fail('Only anonymous sourcing.', 'Name the official, agency or document wherever you can.');
        if (named === 0) return warn('No identifiable primary source.', 'Attribute the core facts to a named source.');
        return pass(`${named} named attributions.`);
      },
    },
    {
      id: 'n_dateline',
      label: 'Dateline / location line',
      why: 'A dateline is how a wire story declares where it was filed, which is exactly what location-scoped questions are matched against.',
      pillar: 'entity', weight: 1,
      run: (c) => (/^[A-Z][A-Za-z .]+,?\s*(—|-|:)/.test((c.facts.firstWords || '').trim())
        ? pass('Dateline present.')
        : warn('No dateline.', 'Prefix the lead with the filing city, e.g. "MUMBAI — ".')),
    },
  ],

  health: [
    {
      id: 'hl_credentials',
      label: 'Author’s clinical credentials on the page',
      why: 'Health is the category where engines are most conservative. An uncredentialed health page is routinely passed over in favour of one with a named clinician.',
      pillar: 'attribution', weight: 3,
      run: (c) => (/\b(m\.?d\.?|mbbs|ph\.?d\.?|\brd\b|registered dietitian|pharm\.?d|\brn\b|consultant|physician)\b/i.test(c.t)
        ? pass('Clinical credentials appear on the page.')
        : fail('No clinical credentials.', 'Name the author and their qualification, and repeat it in Article > author.')),
    },
    {
      id: 'hl_reviewed',
      label: 'Medically reviewed, with a date',
      why: 'A review line with a date is the clearest trust marker a health page can carry, and it is machine-readable.',
      pillar: 'attribution', weight: 3,
      run: (c) => {
        const reviewed = /\b(medically reviewed|reviewed by|fact[- ]checked by|clinically reviewed)\b/i.test(c.t);
        if (!reviewed) return fail('No medical review line.', 'Add "Medically reviewed by <name, credential> on <date>".');
        return DATE_RE.test(c.html) ? pass('Medically reviewed with a date.') : warn('Review line present but undated.', 'Add the review date — health guidance decays.');
      },
    },
    {
      id: 'hl_citations',
      label: 'Citations to primary literature',
      why: 'Linking the study, WHO or CDC rather than another blog is what lets an engine treat a health claim as supported.',
      pillar: 'attribution', weight: 3,
      run: (c) => {
        const authoritative = count(c.h, /(pubmed|ncbi\.nlm\.nih\.gov|who\.int|cdc\.gov|nih\.gov|nhs\.uk|thelancet|nejm|bmj\.com|cochrane)/g);
        if (authoritative >= 2) return pass(`${authoritative} links to primary medical sources.`);
        if (authoritative === 1) return warn('Only one authoritative citation.', 'Cite the primary literature for each substantive claim.');
        return fail('No links to primary medical sources.', 'Cite PubMed, WHO, CDC, NHS or the journal directly.');
      },
    },
    {
      id: 'hl_disclaimer',
      label: 'Medical disclaimer',
      why: 'Its absence reads as a risk signal to an engine deciding whether to surface health guidance at all.',
      pillar: 'attribution', weight: 2,
      run: (c) => (/\b(not (a substitute for|intended as) (professional |medical )?(medical )?advice|consult (your|a) (doctor|physician|healthcare)|for informational purposes)\b/i.test(c.t)
        ? pass('Disclaimer present.')
        : warn('No medical disclaimer.', 'Add a short line directing readers to a clinician for personal advice.')),
    },
    {
      id: 'hl_absolutes',
      label: 'No absolute cure claims',
      why: 'Absolute language ("cures", "guaranteed") is a suppression trigger for health content across every major engine.',
      pillar: 'attribution', weight: 2,
      run: (c) => {
        const bad = count(c.t, /\b(cures? (cancer|diabetes|covid)|miracle cure|guaranteed results|100% effective|completely safe)\b/gi);
        return bad === 0 ? pass('No absolute medical claims.') : fail(`${bad} absolute claim(s) detected.`, 'Replace with measured language — "may help", "in one trial", with the citation.');
      },
    },
  ],

  beauty: [
    {
      id: 'b_ingredients',
      label: 'Full ingredient list as text',
      why: '"Does it contain X", "is it safe for sensitive skin" are answered from the INCI list. As an image it does not exist to a crawler.',
      pillar: 'answerability', weight: 3,
      run: (c) => {
        const hasWord = /\b(ingredients?|inci)\b/i.test(c.t);
        const inciish = count(c.t, /\b(aqua|water|glycerin|dimethicone|phenoxyethanol|tocopherol|parfum|fragrance|niacinamide|hyaluronic acid)\b/gi);
        if (inciish >= 3) return pass(`Ingredient list is readable as text (${inciish} INCI terms).`);
        if (hasWord) return fail('An "Ingredients" heading exists but no readable ingredient text.', 'Publish the full INCI list as text — not a photo of the carton.');
        return fail('No ingredient list found.', 'Add the full INCI ingredient list as HTML text.');
      },
    },
    {
      id: 'b_suitability',
      label: 'Skin/hair type suitability stated',
      why: 'Nearly every beauty question is conditional — "for oily skin", "for curly hair". Without the qualifier the page cannot match the question.',
      pillar: 'query', weight: 3,
      run: (c) => (/\b(oily|dry|combination|sensitive|acne[- ]prone|normal) skin\b|\b(curly|straight|wavy|coily|fine|thick) hair\b|\bsuitable for\b/i.test(c.t)
        ? pass('States who the product suits.')
        : fail('No skin/hair type suitability.', 'State plainly which skin or hair types it is for — that is how these questions are phrased.')),
    },
    {
      id: 'b_howto',
      label: 'How to use',
      why: 'Application steps are a distinct, highly-asked question and a separate citation opportunity from the product description.',
      pillar: 'answerability', weight: 2,
      run: (c) => (/\b(how to use|directions|apply|application|usage|pat|massage|rinse)\b/i.test(c.t)
        ? pass('Usage directions present.')
        : warn('No usage directions.', 'Add a short "How to use" section with ordered steps.')),
    },
    {
      id: 'b_claims',
      label: 'Claims substantiated',
      why: '"Dermatologically tested" with no testing body reads as marketing. Named substantiation is what makes a claim repeatable by an engine.',
      pillar: 'attribution', weight: 2,
      run: (c) => {
        const claims = count(c.t, /\b(dermatologically tested|clinically proven|hypoallergenic|non[- ]comedogenic)\b/gi);
        if (claims === 0) return na('No lab or clinical claims made.');
        const backed = /\b(tested (on|by|with) \d+|study of \d+|in a \d+[- ]week|conducted by)\b/i.test(c.t);
        return backed ? pass('Claims carry testing detail.') : warn(`${claims} unsubstantiated claim(s).`, 'State who tested it, on how many people, over what period.');
      },
    },
    {
      id: 'b_shades',
      label: 'Shades / variants readable',
      why: 'Shade availability is a common question, and it is usually rendered as swatch images with no text alternative.',
      pillar: 'entity', weight: 1,
      run: (c) => {
        if (!/\b(shade|colour|color|variant|tone)\b/i.test(c.t)) return na('No shade/variant range on this page.');
        return /\b(shade|colour|color)s?\s*:/i.test(c.t) || c.facts.lists >= 1
          ? pass('Shade/variant names are in text.')
          : warn('Shades appear to be images only.', 'List shade names as text alongside the swatches.');
      },
    },
  ],

  ecommerce: [
    {
      id: 'e_delivery',
      label: 'Delivery and payment terms in text',
      why: 'Shopping answers increasingly include delivery time and payment options; both are usually rendered by script or hidden behind a tab.',
      pillar: 'query', weight: 1,
      run: (c) => (/\b(free delivery|delivery by|ships? (in|within)|cash on delivery|\bcod\b|\bemi\b|installment)/i.test(c.t)
        ? pass('Delivery/payment terms present.')
        : warn('No delivery or payment terms in text.', 'State delivery time and payment options as text on the page.')),
    },
  ],

  entertainment: [
    {
      id: 'en_entities',
      label: 'Cast, director and title named',
      why: 'Entertainment questions are almost entirely entity lookups. Unnamed people cannot be matched to "who directed…".',
      pillar: 'entity', weight: 3,
      run: (c) => {
        const named = /\b(directed by|starring|cast|screenplay by|created by)\b/i.test(c.t);
        return named ? pass('Key people are named.') : fail('No cast or director named.', 'Name the director, principal cast and the exact title.');
      },
    },
    {
      id: 'en_where_watch',
      label: 'Where to watch and when it released',
      why: '"Where can I watch X" is the highest-volume question in this category and needs an explicit platform name and date.',
      pillar: 'answerability', weight: 3,
      run: (c) => {
        const platform = /\b(netflix|prime video|hotstar|jiocinema|zee5|sonyliv|apple tv|disney\+|in cinemas|in theatres|theatrical release)\b/i.test(c.t);
        const date = DATE_RE.test(c.html) || /\b(20\d{2})\b/.test(c.t);
        if (platform && date) return pass('Platform and release date both stated.');
        if (!platform) return fail('No streaming platform or release window named.', 'State exactly where it can be watched and from when.');
        return warn('Platform named but no clear date.', 'Add the release or streaming date.');
      },
    },
    {
      id: 'en_schema',
      label: 'Movie / TVSeries schema',
      why: 'This markup declares the title, cast and release date as data rather than leaving them to be parsed out of prose.',
      pillar: 'structure', weight: 2,
      run: (c) => (hasSchema(c.facts, 'Movie', 'TVSeries', 'Episode', 'CreativeWork')
        ? pass('Screen-work schema present.')
        : warn('No Movie/TVSeries schema.', 'Add Movie or TVSeries JSON-LD with name, director, actor and datePublished.')),
    },
  ],

  lifestyle: [
    {
      id: 'ls_selfcontained',
      label: 'Steps are self-contained',
      why: 'Assistants relay one step at a time. A step reading "repeat with the rest" is meaningless once separated from its neighbours.',
      pillar: 'entity', weight: 2,
      run: (c) => {
        const vague = count(c.t, /\b(repeat (this|the above|as before)|do the same|as mentioned above|see above)\b/gi);
        return vague === 0 ? pass('Steps read independently.') : warn(`${vague} step(s) refer back instead of standing alone.`, 'Restate the action in each step rather than pointing at an earlier one.');
      },
    },
    {
      id: 'ls_time',
      label: 'Time and difficulty stated',
      why: '"How long does it take" is asked of nearly every how-to, and is answerable only if you state it.',
      pillar: 'answerability', weight: 2,
      run: (c) => (/\b(\d+\s*(min|minute|hour|hr|day|week)s?\b|prep time|cook time|total time|difficulty|beginner|intermediate|advanced)\b/i.test(c.t)
        ? pass('Time or difficulty stated.')
        : warn('No time or difficulty given.', 'State how long it takes and the skill level required.')),
    },
  ],

  reviews: [
    {
      id: 'rv_alternatives',
      label: 'Compared against named alternatives',
      why: '"X vs Y" is how buying questions are actually asked. A review naming no alternative cannot be retrieved for any comparison.',
      pillar: 'query', weight: 3,
      run: (c) => (/\b(vs\.?|versus|compared (to|with)|alternative to|instead of)\b/i.test(c.t)
        ? pass('Names comparison products.')
        : fail('No named alternatives.', 'Compare it explicitly to 2–3 named competing products.')),
    },
    {
      id: 'rv_price_dated',
      label: 'Price stated, with the date it applied',
      why: 'A price with no date goes stale silently, and an engine repeating a stale price is a reason to stop trusting the source.',
      pillar: 'freshness', weight: 2,
      run: (c) => {
        if (c.facts.priceCount === 0) return warn('No price in the review.', 'State the price you paid and when.');
        return DATE_RE.test(c.html) ? pass('Price and date both present.') : warn('Price present but undated.', 'Say when that price applied — "as of <month>".');
      },
    },
    {
      id: 'rv_reviewer',
      label: 'Reviewer identified with relevant experience',
      why: 'First-hand expertise is the differentiator engines use to separate a real review from aggregated marketing copy.',
      pillar: 'attribution', weight: 2,
      run: (c) => (c.facts.hasAuthor && /\b(years? of|has (been )?(tested|reviewed|covered)|specialis|specializ|expert in)\b/i.test(c.t)
        ? pass('Reviewer and their experience are stated.')
        : c.facts.hasAuthor ? warn('Author named but no relevant experience stated.', 'Add one line on why this reviewer is qualified to judge this product.')
        : fail('No named reviewer.', 'Add a bylined reviewer with their relevant experience.')),
    },
  ],

  fintech: [
    {
      id: 'f_fees_rates',
      label: 'Fees, rates and charges stated as text',
      why: '"How much does X cost" and "what is the interest rate" are the single most-asked fintech questions, and the numbers are usually rendered by a calculator widget rather than existing as text.',
      pillar: 'answerability', weight: 3,
      run: (c) => (/\b(interest rate|apr|expense ratio|annual fee|processing fee|brokerage|premium of|charges?:)\b/i.test(c.t)
        ? pass('Fees or rates are stated as text.')
        : fail('No fees or rates found as text.', 'State the actual rate, fee or premium as plain text — not only inside a calculator or PDF.')),
    },
    {
      id: 'f_eligibility',
      label: 'Eligibility criteria stated',
      why: '"Who can apply" or "am I eligible" gates every financial-product decision. Without an explicit answer, an engine cannot tell a user whether the product even applies to them.',
      pillar: 'query', weight: 2,
      run: (c) => (/\b(eligibility|eligible if|you (must|need to) be|minimum age|minimum income|credit score of)\b/i.test(c.t)
        ? pass('Eligibility criteria are stated.')
        : warn('No eligibility criteria found.', 'State who qualifies — age, income, credit score or KYC requirements.')),
    },
    {
      id: 'f_regulatory',
      label: 'Regulatory / licensing disclosure',
      why: 'Financial claims carry more scrutiny than most content. A named regulator or license number is what separates a credible source from marketing copy, for both readers and answer engines.',
      pillar: 'attribution', weight: 3,
      run: (c) => (/\b(regulated by|licen[cs]ed by|rbi|sebi|irdai|registration no\.?|cin:)/i.test(c.t)
        ? pass('Names a regulator or licence.')
        : fail('No regulatory disclosure found.', 'State who regulates this product or your registration/licence number.')),
    },
    {
      id: 'f_risk',
      label: 'Risks stated, not just benefits',
      why: 'A page that only lists upside reads as an advertisement. Named, specific risk disclosure is a trust signal and is often a legal requirement.',
      pillar: 'attribution', weight: 2,
      run: (c) => (/\b(risk|may lose|not guaranteed|subject to market|past performance|no assurance)\b/i.test(c.t)
        ? pass('States risk alongside the benefits.')
        : warn('No risk disclosure found.', 'State the real risks or downside plainly, not only the benefits.')),
    },
  ],

  realestate: [
    {
      id: 're_pricing',
      label: 'Price and price-per-sq-ft stated',
      why: '"What does it cost" and "what is the rate per square foot" are the two numbers every property question needs, and listings often bury them in a downloadable brochure.',
      pillar: 'answerability', weight: 3,
      run: (c) => {
        const price = c.facts.priceCount > 0 || /\b(price|₹|\brs\.?\s?\d)/i.test(c.t);
        const perSqft = /\b(per sq\.?\s?ft|\/sq ?ft|price per square foot)/i.test(c.t);
        if (price && perSqft) return pass('Price and per-sq-ft rate both stated.');
        if (price) return warn('Price stated, but no per-sq-ft rate.', 'Add the price per square foot — a common comparison metric.');
        return fail('No price found as text.', 'State the price and price per square foot as text.');
      },
    },
    {
      id: 're_specifics',
      label: 'Location, configuration and possession stated',
      why: '"Is this in X locality", "what configuration is available" and "when can I move in" are asked of every property page. Vague location or a missing possession date makes the listing unusable for these queries.',
      pillar: 'entity', weight: 3,
      run: (c) => {
        const config = /\b\d\s?bhk\b|\d\s?bed(room)?s?\b/i.test(c.t);
        const possession = /\b(possession|ready to move|under construction|handover)\b/i.test(c.t);
        if (config && possession) return pass('Configuration and possession status are both stated.');
        if (!config && !possession) return fail('No configuration or possession status found.', 'State the configuration (e.g. "3 BHK") and possession status (ready / under construction, with a date).');
        return warn('Only one of configuration / possession status is stated.', 'State both the configuration and the possession timeline.');
      },
    },
    {
      id: 're_rera',
      label: 'RERA / regulatory registration where applicable',
      why: 'In markets with a property regulator, a listed registration number is the clearest trust signal a listing can carry — and its absence is itself a question buyers ask.',
      pillar: 'attribution', weight: 2,
      run: (c) => (/\brera\b/i.test(c.t)
        ? pass('RERA (or equivalent) registration referenced.')
        : na('No RERA reference — may not be applicable to this market/listing type.')),
    },
    {
      id: 're_nearby',
      label: 'Nearby amenities named',
      why: '"What is nearby" — schools, hospitals, transit — is a standard property question, and is only answerable if named rather than shown on an interactive map widget alone.',
      pillar: 'query', weight: 2,
      run: (c) => (/\b(school|hospital|metro|railway station|airport|mall)s?\b.{0,40}\b(nearby|minutes?|km|kilometers?)/i.test(c.t) || /\bnearby\b/i.test(c.t)
        ? pass('Nearby amenities are named in text.')
        : warn('Nearby amenities not named in text.', 'List the nearest schools, hospitals and transit options as text, not only as map pins.')),
    },
  ],

  automotive: [
    {
      id: 'au_specs',
      label: 'Core specifications as text',
      why: '"What engine does it have", "what is the mileage" — these are answered from a spec sheet. If it renders as an image or a JS-built table, the numbers do not exist to a crawler.',
      pillar: 'answerability', weight: 3,
      run: (c) => {
        const specs = ['mileage', 'bhp', 'torque', 'engine', 'transmission', 'fuel'].filter((k) => new RegExp(`\\b${k}\\b`, 'i').test(c.t)).length;
        if (specs >= 4) return pass(`${specs} of the core specs (engine, mileage, transmission, fuel…) are stated as text.`);
        if (specs >= 2) return warn(`Only ${specs} core specs found as text.`, 'State engine, power, mileage, fuel type and transmission as plain text.');
        return fail('Core specifications are not present as text.', 'Publish the full spec sheet (engine, power, mileage, transmission, fuel) as HTML text, not an image.');
      },
    },
    {
      id: 'au_variant_price',
      label: 'Variant and on-road price stated',
      why: '"Which variant is this" and "what does the on-road price come to" cannot be answered from an ex-showroom figure alone — a very common gap.',
      pillar: 'entity', weight: 2,
      run: (c) => {
        const variant = /\bvariant\b/i.test(c.t);
        const onRoad = /\bon[- ]road price\b/i.test(c.t);
        if (variant && onRoad) return pass('Variant name and on-road price both stated.');
        if (variant || onRoad) return warn('Only one of variant / on-road price is stated.', 'State both the exact variant name and the on-road (not just ex-showroom) price.');
        return fail('No variant name or on-road price found.', 'Name the exact variant and state the on-road price, not just ex-showroom.');
      },
    },
    {
      id: 'au_safety',
      label: 'Safety rating or features named',
      why: '"Is it safe", "how many airbags" are pre-purchase questions that specifically need a named rating or feature list — general "safety" copy does not answer them.',
      pillar: 'attribution', weight: 2,
      run: (c) => (/\b(\d\s?star|ncap|airbags?|abs\b|electronic stability)/i.test(c.t)
        ? pass('Names a safety rating or specific safety features.')
        : warn('No specific safety rating or features named.', 'State the NCAP star rating (if tested) and list named safety features like airbag count and ABS.')),
    },
    {
      id: 'au_comparison',
      label: 'Compared against named alternatives',
      why: 'Automotive buying decisions are almost always comparative. A page naming no competing model cannot be retrieved for any "X vs Y" query.',
      pillar: 'query', weight: 2,
      run: (c) => (/\b(vs\.?|versus|compared (to|with)|rival|competitor)\b/i.test(c.t)
        ? pass('Names comparison vehicles.')
        : warn('No named comparison vehicles.', 'Compare explicitly against 1–2 named competing models.')),
    },
  ],

  edtech: [
    {
      id: 'ed_outcomes',
      label: 'Eligibility, fees and duration stated',
      why: '"Can I apply", "what does it cost" and "how long does it take" are asked before anything else about a course, and are frequently split across a brochure PDF instead of the page itself.',
      pillar: 'answerability', weight: 3,
      run: (c) => {
        const has = ['eligib', 'fee', 'duration|weeks?|months?'].filter((p) => new RegExp(p, 'i').test(c.t)).length;
        if (has >= 3) return pass('Eligibility, fees and duration are all stated.');
        if (has >= 1) return warn('Some of eligibility/fees/duration is missing.', 'State eligibility criteria, the fee, and the course duration together as text.');
        return fail('None of eligibility, fees or duration found as text.', 'State eligibility, fee and duration as plain text on the page itself.');
      },
    },
    {
      id: 'ed_faculty',
      label: 'Faculty or instructor credentials named',
      why: 'Course quality is judged by who teaches it. An unnamed "expert faculty" claim carries no evidence an engine can repeat.',
      pillar: 'attribution', weight: 2,
      run: (c) => (/\b(instructor|faculty|taught by|professor|trainer)\b.{0,60}\b(phd|years? of experience|founder|ex[- ][a-z]+)/i.test(c.t)
        ? pass('Names an instructor with a stated credential.')
        : /\b(instructor|faculty|taught by)\b/i.test(c.t) ? warn('Instructor named but no credential stated.', 'State the instructor’s relevant credential or experience, not just their name.')
        : fail('No named instructor or faculty.', 'Name who teaches the course and their relevant credentials.')),
    },
    {
      id: 'ed_outcomes2',
      label: 'Learning outcomes or placement data stated',
      why: '"What will I be able to do after this" and "what are the outcomes" are the actual purchase questions — a syllabus list alone does not answer them.',
      pillar: 'query', weight: 2,
      run: (c) => (/\b(learning outcome|you will (be able to|learn)|placement (rate|assistance|record)|average salary|hired at)\b/i.test(c.t)
        ? pass('States learning outcomes or placement information.')
        : warn('No outcomes or placement information.', 'State what a learner will be able to do afterward, or cite placement/outcome data if available.')),
    },
    {
      id: 'ed_schema',
      label: 'Course schema present',
      why: 'Course markup lets an engine read subject, level, instructor and duration as structured data instead of parsing marketing copy.',
      pillar: 'structure', weight: 1,
      run: (c) => (hasSchema(c.facts, 'Course')
        ? pass('Course schema present.')
        : warn('No Course schema.', 'Add Course JSON-LD with provider, instructor, and duration.')),
    },
  ],

  saas: [
    {
      id: 'sa_whatfor',
      label: 'What it does and who it is for, stated plainly',
      why: '"What does this tool do" and "who is it for" are the first two questions any comparison or recommendation prompt needs answered — and are often buried under a hero tagline that says neither.',
      pillar: 'answerability', weight: 3,
      run: (c) => {
        const forWhom = /\b(built for|designed for|for teams|for developers|for marketers|for small businesses)\b/i.test(c.t);
        if (forWhom) return pass('States who the product is built for.');
        return warn('Does not clearly state who the product is for.', 'Add a plain sentence: "[Product] is a [category] tool for [specific audience]."');
      },
    },
    {
      id: 'sa_pricing',
      label: 'Pricing stated as text',
      why: '"How much does it cost" is asked constantly in tool-comparison prompts, and pricing pages frequently render the actual numbers via JavaScript widgets that a crawler never sees.',
      pillar: 'answerability', weight: 2,
      run: (c) => (/\b(\$\d|₹\d|per month|per user|\/mo\b|free plan|free tier|starts at)\b/i.test(c.t)
        ? pass('Pricing is present as text.')
        : warn('No pricing found as text.', 'State at least the starting price and plan structure as plain text.')),
    },
    {
      id: 'sa_alternatives',
      label: 'Alternatives or competitors named',
      why: '"X vs Y" and "alternatives to X" are extremely common SaaS-discovery prompts. A product page that never names a competitor cannot be surfaced for either.',
      pillar: 'query', weight: 2,
      run: (c) => (/\b(alternative to|vs\.?|versus|compared to|instead of)\b/i.test(c.t)
        ? pass('Names alternatives or competitors.')
        : warn('No named alternatives.', 'Add a comparison section naming 2–3 alternative tools and how this one differs.')),
    },
    {
      id: 'sa_security',
      label: 'Security / compliance stated where relevant',
      why: 'B2B buying prompts frequently ask about compliance (SOC 2, GDPR). Its absence from the page is itself an answer an engine will report.',
      pillar: 'attribution', weight: 1,
      run: (c) => (/\b(soc ?2|gdpr|iso ?27001|hipaa|data encryption|compliance)\b/i.test(c.t)
        ? pass('States a security or compliance credential.')
        : na('No security/compliance claim — may not be relevant to this product.')),
    },
  ],

  music: [
    {
      id: 'mu_credits',
      label: 'Artist, album and release date named',
      why: '"Who sings this", "what album is it from" and "when did it release" are the core entity questions for any music page, and are the first things an engine needs to ground an answer.',
      pillar: 'entity', weight: 3,
      run: (c) => {
        const artist = /\b(by|artist:|performed by)\b/i.test(c.t);
        const date = DATE_RE.test(c.html) || /\b(20\d{2}|19\d{2})\b/.test(c.t);
        if (artist && date) return pass('Artist and release date are both stated.');
        if (artist || date) return warn('Only one of artist / release date is clearly stated.', 'State the performing artist and the release date together.');
        return fail('No artist or release date found.', 'Name the artist and state the release date explicitly.');
      },
    },
    {
      id: 'mu_streaming',
      label: 'Official streaming links named',
      why: '"Where can I listen to this" is a direct-action question. Naming the platforms (Spotify, Apple Music) is what makes the page useful to point to, rather than just descriptive.',
      pillar: 'answerability', weight: 2,
      run: (c) => (/\b(spotify|apple music|youtube music|jiosaavn|gaana|amazon music|soundcloud)\b/i.test(c.t)
        ? pass('Names official streaming platforms.')
        : warn('No streaming platforms named.', 'Link out to (and name in text) the official streaming platforms.')),
    },
    {
      id: 'mu_schema',
      label: 'Music schema present',
      why: 'MusicRecording/MusicAlbum markup declares artist, album and duration as structured data an engine can read directly.',
      pillar: 'structure', weight: 1,
      run: (c) => (hasSchema(c.facts, 'MusicRecording', 'MusicAlbum', 'MusicGroup', 'MusicPlaylist')
        ? pass('Music schema present.')
        : warn('No music schema.', 'Add MusicRecording or MusicAlbum JSON-LD with byArtist, inAlbum and datePublished.')),
    },
  ],

  general: [],
};

// =============================================================================
// RUNNER
// =============================================================================

export interface ChecklistResult {
  kind: PageKind;
  vertical: Vertical;
  kindLabel: string;
  verticalLabel: string;
  detection: { kind: Detection<PageKind>; vertical: Detection<Vertical> };
  items: {
    id: string; label: string; why: string; pillar: PillarId; weight: number;
    status: SignalStatus; detail: string; fix?: string;
    group: 'universal' | 'kind' | 'vertical' | 'client';
  }[];
  /** 0–100 across everything that applied. */
  score: number;
  passed: number;
  applicable: number;
}

export function runChecklist(
  html: string, text: string, facts: PageFacts,
  override?: { kind?: PageKind; vertical?: Vertical },
  /** Extra, client-specific checks (e.g. an agency client's own page-type
   *  checklist) layered on top of universal + kind + vertical. Never replaces
   *  them — see clients.ts for why. */
  clientChecks?: Check[],
): ChecklistResult {
  const kindDet = override?.kind
    ? { value: override.kind, confidence: 'high' as const, evidence: ['set manually'] }
    : detectPageKind(html, facts);
  const vertDet = override?.vertical
    ? { value: override.vertical, confidence: 'high' as const, evidence: ['set manually'] }
    : detectVertical(html, facts, kindDet.value);
  const ctx: Ctx = {
    html, h: html.toLowerCase(), text, t: text.toLowerCase(),
    facts, kind: kindDet.value, vertical: vertDet.value,
  };

  const groups: [Check[], 'universal' | 'kind' | 'vertical' | 'client'][] = [
    [UNIVERSAL, 'universal'],
    [BY_KIND[kindDet.value] || [], 'kind'],
    [BY_VERTICAL[vertDet.value] || [], 'vertical'],
    [clientChecks || [], 'client'],
  ];

  const items: ChecklistResult['items'] = [];
  let earned = 0;
  let possible = 0;
  let passed = 0;
  let applicable = 0;

  for (const [checks, group] of groups) {
    for (const check of checks) {
      let r: CheckResult;
      try {
        r = check.run(ctx);
      } catch {
        // A single broken check must never take down the whole audit.
        r = na('Check could not be evaluated on this page.');
      }
      items.push({
        id: check.id, label: check.label, why: check.why, pillar: check.pillar,
        weight: check.weight, status: r.status, detail: r.detail, fix: r.fix, group,
      });
      if (r.status === 'na') continue;
      applicable++;
      possible += check.weight;
      if (r.status === 'pass') { earned += check.weight; passed++; }
      else if (r.status === 'warn') earned += check.weight * 0.5;
    }
  }

  return {
    kind: kindDet.value,
    vertical: vertDet.value,
    kindLabel: KIND_LABEL[kindDet.value],
    verticalLabel: VERTICAL_LABEL[vertDet.value],
    detection: { kind: kindDet, vertical: vertDet },
    items,
    score: possible ? Math.round((earned / possible) * 100) : 0,
    passed,
    applicable,
  };
}

/** Every check we can run, for documentation and for the public checklist page. */
export function allChecks(): { group: string; label: string; checks: Check[] }[] {
  return [
    { group: 'universal', label: 'Every page', checks: UNIVERSAL },
    ...(Object.keys(BY_KIND) as PageKind[]).map((k) => ({ group: `kind:${k}`, label: KIND_LABEL[k], checks: BY_KIND[k] })),
    ...(Object.keys(BY_VERTICAL) as Vertical[])
      .filter((v) => BY_VERTICAL[v].length)
      .map((v) => ({ group: `vertical:${v}`, label: VERTICAL_LABEL[v], checks: BY_VERTICAL[v] })),
  ];
}
