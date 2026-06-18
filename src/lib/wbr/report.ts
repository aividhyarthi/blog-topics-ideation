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

  return {
    vertical,
    generatedAt: new Date().toISOString(),
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
