// WBR report builder — turns parsed SEMrush files into the exact tables the
// weekly Beauty/Fashion AI-visibility report needs, replacing the manual Excel
// pivoting + categorization step.
//
// Inputs: the parsed brand_topics / gap_topics / sources files for the primary
// brand (Nykaa) and competitors. Output: typed table objects that the Astro
// page renders to HTML and the Excel exporter writes to tabs.

import {
  classifyTopic, BEAUTY_CATEGORIES, FASHION_CATEGORIES, type Vertical,
} from './categorize';
import type { ParsedFile, TopicRow } from './parse';

export const PRIMARY = 'nykaa';
export const COMPETITORS = ['amazon', 'myntra', 'tira', 'flipkart'];

export interface ReportOptions {
  vertical: 'beauty' | 'fashion';
  protectThreshold?: number; // visibility considered "owned" (default 60)
  authorityThreshold?: number; // "high authority" topics (beauty 80, fashion 60)
  // Optional manual/Claude classification overrides, keyed by exact topic name.
  overrides?: Record<string, { vertical: Vertical; category: string }>;
}

export interface ClassifiedTopic extends TopicRow {
  vertical: Vertical;
  category: string;
  matched: boolean;
}

export interface BrandSummary {
  brand: string;
  topicsInVertical: number;
  avgVisibility: number;
  totalMentions: number;
  totalVolume: number;
  topicsAuthority: number; // >= authorityThreshold
  topics60: number;
  topics80: number;
}

export interface CategoryRow {
  category: string;
  topics: number;
  avgVisibility: number;
  avgMentions: number;
  totalVolume: number;
  leader: string;
  signal: string;
}

export interface ProtectRow {
  category: string;
  topic: string;
  visibility: number;
  mentions: number;
  volume: number;
  status: string;
}

export interface GapRow {
  category: string;
  topic: string;
  volume: number;
  competitors: Record<string, number>;
  priority: 'High' | 'Medium' | 'Low';
}

export interface BrandComparisonRow {
  category: string;
  mentions: Record<string, number>; // brand -> total mentions
}

export interface SourceTypeRow {
  pageType: string;
  count: Record<string, number>; // brand -> count of cited pages of that type
}

export interface WbrReport {
  vertical: 'beauty' | 'fashion';
  generatedAt: string;
  highlights: string[];
  summary: BrandSummary[];
  categoryScorecard: CategoryRow[];
  protect: ProtectRow[];
  gaps: GapRow[];
  brandComparison: BrandComparisonRow[];
  sourceAnalysis: SourceTypeRow[];
  reviewQueue: { brand: string; topic: string; category: string }[]; // unmatched
  brandsPresent: string[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type Overrides = ReportOptions['overrides'];

function classifyOne(name: string, vertical: 'beauty' | 'fashion', overrides: Overrides) {
  const o = overrides?.[name];
  if (o) return { vertical: o.vertical, category: o.category, matched: true };
  return classifyTopic(name, { vertical });
}

function classifyTopics(file: ParsedFile, vertical: 'beauty' | 'fashion', overrides: Overrides): ClassifiedTopic[] {
  return (file.topics ?? []).map((t) => {
    const c = classifyOne(t.name, vertical, overrides);
    return { ...t, vertical: c.vertical, category: c.category, matched: c.matched };
  });
}

function brandSummary(
  brand: string, topics: ClassifiedTopic[], vertical: 'beauty' | 'fashion',
  authorityThreshold: number,
): BrandSummary {
  const inV = topics.filter((t) => t.vertical === vertical);
  const n = inV.length || 1;
  return {
    brand,
    topicsInVertical: inV.length,
    avgVisibility: round1(inV.reduce((s, t) => s + t.visibility, 0) / n),
    totalMentions: inV.reduce((s, t) => s + t.mentions, 0),
    totalVolume: inV.reduce((s, t) => s + t.volume, 0),
    topicsAuthority: inV.filter((t) => t.visibility >= authorityThreshold).length,
    topics60: inV.filter((t) => t.visibility >= 60).length,
    topics80: inV.filter((t) => t.visibility >= 80).length,
  };
}

// ---- URL page-type classification for cited-sources analysis ----------------
function pageType(url: string): string {
  const u = url.toLowerCase();
  const path = u.replace(/^https?:\/\/[^/]+/, '');
  if (path === '' || path === '/') return 'Homepage';
  if (/\/(beauty-blog|blog|magazine|life\.|edit|stories|guide)/.test(u)) return 'Blog / Editorial';
  if (/\/(p\/|buy|product|sp\?|dp\/|pid)/.test(u)) return 'Product (PDP)';
  if (/(authenticity|guarantee|about|trust)/.test(u)) return 'Trust / Authenticity';
  if (/(seller|business|b2b)/.test(u)) return 'Seller / B2B';
  if (/(store|locator)/.test(u)) return 'Store locator';
  if (/(policy|policies|terms|privacy|return)/.test(u)) return 'Policy';
  if (/(orderid|checkout|cart|login|account)/.test(u)) return 'Junk / Transactional';
  if (/(c\/|category|brands?\/|shop)/.test(u)) return 'Category';
  return 'Other / Unclassified';
}

export function buildReport(files: ParsedFile[], opts: ReportOptions): WbrReport {
  const vertical = opts.vertical;
  const protectThreshold = opts.protectThreshold ?? 60;
  const authorityThreshold = opts.authorityThreshold ?? (vertical === 'beauty' ? 80 : 60);
  const orderedCats = vertical === 'beauty' ? BEAUTY_CATEGORIES : FASHION_CATEGORIES;
  const overrides = opts.overrides;

  // index parsed files by brand
  const brandTopics = new Map<string, ClassifiedTopic[]>();
  const gapFiles = new Map<string, ParsedFile>();
  const sourceFiles = new Map<string, ParsedFile>();
  for (const f of files) {
    if (f.type === 'brand_topics' && f.topics) {
      brandTopics.set(f.brand, classifyTopics(f, vertical, overrides));
    } else if (f.type === 'gap_topics') {
      gapFiles.set(f.brand, f);
      if (!brandTopics.has(f.brand) && f.topics) brandTopics.set(f.brand, classifyTopics(f, vertical, overrides));
    } else if (f.type === 'sources') {
      sourceFiles.set(f.brand, f);
    }
  }

  const brandOrder = [PRIMARY, ...COMPETITORS].filter((b) => brandTopics.has(b) || sourceFiles.has(b));

  // ---- Section: Summary scorecard ----
  const summary: BrandSummary[] = brandOrder
    .filter((b) => brandTopics.has(b))
    .map((b) => brandSummary(b, brandTopics.get(b)!, vertical, authorityThreshold));

  const primaryTopics = (brandTopics.get(PRIMARY) ?? []).filter((t) => t.vertical === vertical);

  // ---- Section A: Category scorecard (primary brand) + leader signal ----
  // Precompute per-brand mentions per category for leader detection.
  const perBrandCatMentions = new Map<string, Map<string, number>>();
  for (const [b, ts] of brandTopics) {
    const m = new Map<string, number>();
    for (const t of ts) if (t.vertical === vertical) m.set(t.category, (m.get(t.category) ?? 0) + t.mentions);
    perBrandCatMentions.set(b, m);
  }
  const categoryScorecard: CategoryRow[] = orderedCats
    .map((cat) => {
      const inCat = primaryTopics.filter((t) => t.category === cat);
      if (inCat.length === 0) return null;
      const n = inCat.length;
      // leader = brand with most mentions in this category
      let leader = PRIMARY; let leaderM = perBrandCatMentions.get(PRIMARY)?.get(cat) ?? 0;
      for (const b of COMPETITORS) {
        const m = perBrandCatMentions.get(b)?.get(cat) ?? 0;
        if (m > leaderM) { leaderM = m; leader = b; }
      }
      const signal = leader === PRIMARY ? '✓ Nykaa leads' : `→ watch ${cap(leader)}`;
      return {
        category: cat,
        topics: n,
        avgVisibility: round1(inCat.reduce((s, t) => s + t.visibility, 0) / n),
        avgMentions: round1(inCat.reduce((s, t) => s + t.mentions, 0) / n),
        totalVolume: inCat.reduce((s, t) => s + t.volume, 0),
        leader: cap(leader),
        signal,
      } as CategoryRow;
    })
    .filter((r): r is CategoryRow => r !== null);

  // ---- Section B: Top topics to protect ----
  const protect: ProtectRow[] = [...primaryTopics]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15)
    .map((t) => ({
      category: t.category,
      topic: t.name,
      visibility: t.visibility,
      mentions: t.mentions,
      volume: t.volume,
      status: statusFor(t.visibility, protectThreshold),
    }));

  // ---- Section C: Gap analysis (primary = 0, competitors present) ----
  const gapFile = gapFiles.get(PRIMARY);
  const gaps: GapRow[] = [];
  if (gapFile?.topics) {
    for (const t of gapFile.topics) {
      const gm = t.gapMentions ?? {};
      const primaryM = gm[`${PRIMARY}.com`] ?? gm[`${PRIMARY}fashion.com`] ?? t.mentions ?? 0;
      if (primaryM > 0) continue; // only true gaps
      const comp: Record<string, number> = {};
      let maxComp = 0;
      for (const [host, v] of Object.entries(gm)) {
        if (host.includes(PRIMARY)) continue;
        const short = shortHost(host);
        comp[short] = v;
        if (v > maxComp) maxComp = v;
      }
      if (maxComp === 0) continue; // nobody ranks => not actionable
      const c = classifyOne(t.name, vertical, overrides);
      if (c.vertical !== vertical || !c.matched) continue; // confident in-vertical gaps only
      const priority: GapRow['priority'] =
        t.volume > 25000 && maxComp >= 5 ? 'High' : t.volume >= 5000 ? 'Medium' : 'Low';
      gaps.push({ category: c.category, topic: t.name, volume: t.volume, competitors: comp, priority });
    }
  }
  gaps.sort((a, b) => b.volume - a.volume);

  // ---- Section: Brand comparison by category (mentions) ----
  const brandComparison: BrandComparisonRow[] = orderedCats
    .map((cat) => {
      const mentions: Record<string, number> = {};
      for (const b of brandOrder) {
        const m = perBrandCatMentions.get(b)?.get(cat);
        if (m !== undefined) mentions[b] = m;
      }
      return { category: cat, mentions };
    })
    .filter((r) => Object.values(r.mentions).some((v) => v > 0));

  // ---- Section: Cited-source page-type analysis ----
  const typeOrder = [
    'Homepage', 'Blog / Editorial', 'Product (PDP)', 'Category',
    'Trust / Authenticity', 'Seller / B2B', 'Store locator', 'Policy',
    'Junk / Transactional', 'Other / Unclassified',
  ];
  const sourceCounts = new Map<string, Map<string, number>>();
  for (const [b, f] of sourceFiles) {
    const m = new Map<string, number>();
    for (const s of f.sources ?? []) m.set(pageType(s.url), (m.get(pageType(s.url)) ?? 0) + 1);
    sourceCounts.set(b, m);
  }
  const sourceBrands = brandOrder.filter((b) => sourceCounts.has(b));
  const sourceAnalysis: SourceTypeRow[] = typeOrder
    .map((pt) => {
      const count: Record<string, number> = {};
      for (const b of sourceBrands) {
        const v = sourceCounts.get(b)?.get(pt);
        if (v !== undefined) count[b] = v;
      }
      return { pageType: pt, count };
    })
    .filter((r) => Object.values(r.count).some((v) => v > 0));

  // ---- Review queue: low-confidence classifications for the primary brand ----
  const reviewQueue = (brandTopics.get(PRIMARY) ?? [])
    .filter((t) => !t.matched)
    .map((t) => ({ brand: PRIMARY, topic: t.name, category: t.category }));

  const highlights = computeHighlights(
    vertical, summary, categoryScorecard, gaps, sourceCounts, authorityThreshold,
  );

  return {
    vertical,
    generatedAt: new Date().toISOString(),
    highlights,
    summary,
    categoryScorecard,
    protect,
    gaps,
    brandComparison,
    sourceAnalysis,
    reviewQueue,
    brandsPresent: brandOrder,
  };
}

// Auto-written "why the numbers look this way" bullets — all derived from the
// data so they're defensible in the room. This is the narrative the WBR needs
// (e.g. "Amazon's avg visibility is higher only because it ranks for far fewer,
// concentrated topics").
function computeHighlights(
  vertical: 'beauty' | 'fashion',
  summary: BrandSummary[],
  cats: CategoryRow[],
  gaps: GapRow[],
  sourceCounts: Map<string, Map<string, number>>,
  authorityThreshold: number,
): string[] {
  const f = (n: number) => Math.round(n).toLocaleString('en-IN');
  const out: string[] = [];
  const nyk = summary.find((s) => s.brand === PRIMARY);
  if (!nyk) return out;
  const comps = summary.filter((s) => s.brand !== PRIMARY);
  const V = vertical;

  // 1) Topic footprint vs the biggest competitor by topic count.
  const byTopics = [...comps].sort((a, b) => b.topicsInVertical - a.topicsInVertical)[0];
  if (byTopics) {
    out.push(
      `Nykaa ranks for ${f(nyk.topicsInVertical)} ${V} topics — vs ${cap(byTopics.brand)}'s ${f(byTopics.topicsInVertical)}. ` +
      `Total ${V} mentions: Nykaa ${f(nyk.totalMentions)} vs ${cap(byTopics.brand)} ${f(byTopics.totalMentions)}; ` +
      `total search volume Nykaa ${f(nyk.totalVolume)} vs ${f(byTopics.totalVolume)}.`,
    );
  }

  // 2) The key avg-visibility explainer — artifact vs genuine gap.
  const ahead = comps.filter((c) => c.avgVisibility > nyk.avgVisibility)
    .sort((a, b) => b.avgVisibility - a.avgVisibility);
  for (const c of ahead.slice(0, 2)) {
    const wider = nyk.topicsInVertical >= c.topicsInVertical * 1.5;
    const moreMentions = nyk.totalMentions > c.totalMentions;
    if (wider && moreMentions) {
      const x = (nyk.topicsInVertical / Math.max(c.topicsInVertical, 1)).toFixed(0);
      const y = (nyk.totalMentions / Math.max(c.totalMentions, 1)).toFixed(0);
      out.push(
        `${cap(c.brand)}'s average visibility (${c.avgVisibility}) edges Nykaa's (${nyk.avgVisibility}), but that's a coverage effect, not strength: ` +
        `${cap(c.brand)} ranks for only ${f(c.topicsInVertical)} ${V} topics — a concentrated set of high performers — while Nykaa spans ${f(nyk.topicsInVertical)} topics (~${x}× wider), including a long tail of low-visibility topics that drags the average down. ` +
        `On absolute mentions Nykaa leads ${f(nyk.totalMentions)} vs ${f(c.totalMentions)} (~${y}×).`,
      );
    } else {
      out.push(
        `${cap(c.brand)} leads on average visibility (${c.avgVisibility} vs Nykaa's ${nyk.avgVisibility}) across ${f(c.topicsInVertical)} ${V} topics vs Nykaa's ${f(nyk.topicsInVertical)} — a genuine visibility gap to close, not just an averaging effect.`,
      );
    }
  }

  // 3) Authority (topics at/above the high-visibility bar).
  const compAuth = Math.max(0, ...comps.map((c) => c.topicsAuthority));
  out.push(
    `Nykaa holds ${f(nyk.topicsAuthority)} ${V} topics at ≥${authorityThreshold} visibility (strong AI authority) vs the top competitor's ${f(compAuth)}.`,
  );

  // 4) Category leadership.
  const led = cats.filter((c) => c.leader.toLowerCase() === PRIMARY).length;
  const trailing = cats.filter((c) => c.leader.toLowerCase() !== PRIMARY);
  let catLine = `Nykaa leads ${led} of ${cats.length} ${V} categories by mentions`;
  if (trailing.length) catLine += `; watch ${trailing.map((t) => `${t.category} (${t.leader})`).join(', ')}.`;
  else catLine += '.';
  out.push(catLine);

  // 5) Gaps.
  if (gaps.length) {
    const high = gaps.filter((g) => g.priority === 'High').length;
    const totalVol = gaps.reduce((s, g) => s + g.volume, 0);
    out.push(
      `${gaps.length} actionable ${V} gaps where Nykaa = 0 visibility but competitors rank (${high} high-priority), led by “${gaps[0].topic}” (${f(gaps[0].volume)} monthly searches). Total addressable gap volume ≈ ${f(totalVol)}.`,
    );
  }

  // 6) Cited-source forward risk.
  if (sourceCounts.size > 1) {
    const total = (b: string) => [...(sourceCounts.get(b)?.values() ?? [])].reduce((a, c) => a + c, 0);
    const np = total(PRIMARY);
    const rival = COMPETITORS
      .map((b) => ({ b, n: total(b) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)[0];
    if (np > 0 && rival && rival.n > np) {
      out.push(
        `${cap(rival.b)} has ${f(rival.n)} AI-cited pages vs Nykaa's ${f(np)} — more indexed pages compounds into more mentions over time, so closing the cited-page gap is the forward-looking lever.`,
      );
    }
  }

  return out;
}

// Plain-English definitions for every term/heading in the report.
export const GLOSSARY: { term: string; def: string }[] = [
  { term: 'Topic / Prompt Theme', def: 'A cluster of related questions people ask AI assistants (e.g. “Lip Gloss”, “Face Sunscreen”). SEMrush groups prompts into topics; this is the unit everything is measured on.' },
  { term: 'Topics in their 1K', def: "SEMrush auto-surfaces the top 1,000 topics where a brand has any AI visibility. This counts how many of those are in this vertical (beauty/fashion) after noise is removed. We don't choose them — SEMrush ranks them by score and exports the top 1,000." },
  { term: 'AI Visibility (score 0–100)', def: 'How prominently a brand appears in AI answers for a topic. 100 = almost always shown; low = rarely shown. “Avg AI visibility” averages this across a brand’s topics.' },
  { term: 'Mentions', def: 'The number of times AI answers reference (mention) the brand when topics are queried. Totals sum across all of the brand’s topics in this vertical.' },
  { term: 'Search Volume', def: 'Monthly search demand for a topic (from SEMrush). High volume = more people asking, so the topic matters more.' },
  { term: 'Topics ≥ 80 / ≥ 60 visibility', def: 'Count of topics where the brand scores at or above that visibility bar — i.e. topics the brand genuinely “owns” in AI answers. (Beauty uses ≥80, Fashion ≥60.)' },
  { term: 'Category Scorecard', def: 'Nykaa’s topics rolled up by product category (Skincare, Lips, …) with how many topics, average visibility, average mentions, total search volume, and which brand currently leads that category by mentions.' },
  { term: 'Leader / Signal', def: 'The brand with the most mentions in that category. “✓ Nykaa leads” = Nykaa is on top; “→ watch <brand>” = a competitor leads there.' },
  { term: 'Topics to Protect', def: 'Nykaa’s highest-search-volume topics and their status, so you can watch the ones that matter most. Protect = visibility ≥60, Monitor = 44–59, Improve = below that on a high-volume topic.' },
  { term: 'Gap Analysis (Nykaa = 0)', def: 'Topics where Nykaa has zero AI visibility but competitors are being mentioned. The numbers under each competitor are their mentions for that topic — i.e. the visibility Nykaa is missing.' },
  { term: 'Priority (High / Medium / Low)', def: 'How worth-it a gap is. High = big search volume (>25K) with real competitor presence; Medium = mid volume; Low = small. Tackle High first.' },
  { term: 'Brand Comparison', def: 'Total AI mentions per category for each brand, computed from each brand’s own 1,000 topics. The leader in each row is bolded.' },
  { term: 'Cited-Source Mix', def: 'The page types AI engines actually cite for a brand (homepage, blog, product page, junk, …). Healthy = low homepage share and high blog/PDP share; lots of homepage-only citations means AI knows the brand but not its content.' },
  { term: 'Source Domains', def: 'Distinct websites AI cites when answering about a brand (e.g. youtube.com, reddit.com, the brand’s own site).' },
  { term: 'Source URLs / Cited Pages', def: 'The individual web pages AI cites. More high-quality cited pages now tends to mean more mentions later.' },
  { term: 'Noise / Review queue', def: 'Topics that aren’t about this vertical’s products — corporate/IPO/careers, coupons, marketplace, other-vertical items, or generic brand names. These are excluded from totals. The review queue lists topics the rules couldn’t confidently place.' },
];

function statusFor(vis: number, protectThreshold: number): string {
  if (vis >= protectThreshold) return '✓ Protect - high vis';
  if (vis >= 44) return 'Monitor';
  return '⚠ Low vis - improve';
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function shortHost(host: string): string {
  if (host.includes('amazon')) return 'Amazon';
  if (host.includes('myntra')) return 'Myntra';
  if (host.includes('tira')) return 'Tira';
  if (host.includes('flipkart')) return 'Flipkart';
  if (host.includes('ajio')) return 'Ajio';
  return host;
}
