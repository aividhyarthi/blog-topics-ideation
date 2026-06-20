// Per-response extraction: turn an AI answer into structured mention/citation
// signals for the primary brand + competitors. Mirrors how SEMrush says it does
// brand extraction ("recognise variations and map to one entity") but ours is
// transparent and alias-driven.

import type { BrandRef, Citation, Extraction, Engine, RawResponse } from './types';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary, suffix-tolerant matcher (same spirit as categorize.ts's
// hasKeyword) so "Plum" doesn't match "plumber" and "sugar" doesn't match
// "sugary". Multiword/domain aliases match as substrings.
function countMatches(haystack: string, alias: string): { count: number; first: number } {
  const a = alias.toLowerCase().trim();
  if (!a) return { count: 0, first: -1 };
  let re: RegExp;
  if (a.includes(' ') || a.includes('.')) {
    re = new RegExp(escapeRe(a), 'g'); // phrase or domain -> substring
  } else {
    re = new RegExp(`(^|[^a-z0-9])${escapeRe(a)}(s|es)?([^a-z0-9]|$)`, 'g');
  }
  let count = 0; let first = -1; let m: RegExpExecArray | null;
  while ((m = re.exec(haystack)) !== null) {
    count++;
    if (first === -1) first = m.index;
    if (m.index === re.lastIndex) re.lastIndex++; // avoid zero-width loop
  }
  return { count, first };
}

function brandSignal(text: string, brand: BrandRef): { count: number; first: number } {
  const aliases = [brand.label, brand.key, ...brand.aliases];
  let count = 0; let first = -1;
  for (const al of aliases) {
    const { count: c, first: f } = countMatches(text, al);
    count += c;
    if (f !== -1 && (first === -1 || f < first)) first = f;
  }
  return { count, first };
}

export function hostOf(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/^www\./, '').split('/')[0];
  }
}

function brandForHost(host: string, brands: BrandRef[]): string | null {
  for (const b of brands) {
    if (host.includes(b.key.toLowerCase())) return b.key;
    if (b.aliases.some((a) => a.includes('.') && host.includes(a.toLowerCase()))) return b.key;
  }
  return null;
}

export function extract(
  raw: RawResponse, primary: BrandRef, competitors: BrandRef[],
): Extraction {
  const brands = [primary, ...competitors];
  const text = ` ${raw.text.toLowerCase()} `;

  const mentioned: Record<string, boolean> = {};
  const hits: Record<string, number> = {};
  const firsts: { key: string; first: number }[] = [];
  for (const b of brands) {
    const sig = brandSignal(text, b);
    mentioned[b.key] = sig.count > 0;
    hits[b.key] = sig.count;
    if (sig.first !== -1) firsts.push({ key: b.key, first: sig.first });
  }
  // Rank = order of first appearance in the answer (1 = named first).
  firsts.sort((a, b) => a.first - b.first);
  const rank: Record<string, number> = {};
  firsts.forEach((f, i) => { rank[f.key] = i + 1; });

  const citedHosts: Record<string, number> = {};
  const citedByBrand: Record<string, string[]> = {};
  for (const c of raw.citations) {
    const host = hostOf(c.url);
    citedHosts[host] = (citedHosts[host] ?? 0) + 1;
    const bk = brandForHost(host, brands);
    if (bk) (citedByBrand[bk] ??= []).push(c.url);
  }

  return {
    topic: raw.topic, prompt: raw.prompt, engine: raw.engine, run: raw.run,
    mentioned, hits, rank, citedHosts, citedByBrand,
  };
}
