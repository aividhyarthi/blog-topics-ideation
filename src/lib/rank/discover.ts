// Keyword discovery — finds the keywords an app ALREADY ranks for (top 200)
// without needing App Radar's list. Same approach commercial ASO tools use:
//
//   1. Build a candidate keyword universe from free sources:
//        a. the app's own listing text (title/short/long n-grams)
//        b. store autocomplete (Play suggest API / Apple search hints) seeded
//           with the app's terms — real queries users actually type
//        c. Claude keyword ideas from the listing (best-effort, needs API key)
//   2. Run every candidate through store search and keep the ones where the
//      app appears in the top 200 — that IS "keywords this app ranks for".
//
// What paid tools add on top is search-volume data (from partnerships); the
// ranked-keyword discovery itself is exactly this candidate-scan loop.
import gplay from 'google-play-scraper';
import Anthropic from '@anthropic-ai/sdk';
import { searchStore } from './fetch';
import type { TrackedApp } from './types';

export interface DiscoveredKeyword {
  keyword: string;
  position: number;
  source: 'listing' | 'autocomplete' | 'ai';
}

export interface DiscoveryResult {
  discovered: DiscoveredKeyword[];
  scanned: number;
  candidates: number;
  errors: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STOP = new Set(('the a an and or of to in for with on at by from is are was be as it its this that these those you your our their his her ' +
  'we they he she i not no yes can will just also more most other some any all every each both few than then so if but about into over under ' +
  'app apps application applications free best top new get use using used easy now one online mobile download install version world way make ' +
  'made need needs like via etc without within available features feature offers offer millions').split(/\s+/));

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const isWord = (w: string) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w);

/**
 * Candidate terms from the app's own listing text: uni- and bi-grams scored by
 * frequency (bi-grams weighted up — multi-word terms are the searchable ones),
 * with title/short-description terms always kept.
 */
export function candidatesFromListing(title: string, summary: string, description: string, max = 40): string[] {
  const scores = new Map<string, number>();
  const bump = (term: string, w: number) => scores.set(term, (scores.get(term) || 0) + w);
  const scan = (text: string, weight: number) => {
    const words = clean(text).split(' ');
    for (let i = 0; i < words.length; i++) {
      if (isWord(words[i])) bump(words[i], weight);
      if (i + 1 < words.length && isWord(words[i]) && isWord(words[i + 1])) bump(`${words[i]} ${words[i + 1]}`, weight * 2.5);
    }
  };
  scan(title, 6);
  scan(summary, 4);
  scan(description, 1);
  return [...scores.entries()]
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([t]) => t);
}

async function listingTexts(app: TrackedApp): Promise<{ title: string; summary: string; description: string }> {
  if (app.store === 'play') {
    const a = (await gplay.app({ appId: app.appId, country: app.country, lang: app.lang })) as Record<string, any>;
    return { title: String(a.title || ''), summary: String(a.summary || ''), description: String(a.description || '') };
  }
  const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(app.appId)}&country=${encodeURIComponent(app.country)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from itunes.apple.com`);
  const a = (await res.json())?.results?.[0];
  if (!a) throw new Error('App not found for keyword discovery.');
  return { title: String(a.trackName || ''), summary: String(a.subtitle || ''), description: String(a.description || '') };
}

/** Store autocomplete for one seed — real queries users type. Best-effort. */
async function autocomplete(app: TrackedApp, seed: string): Promise<string[]> {
  if (app.store === 'play') {
    const res = (await gplay.suggest({ term: seed, country: app.country, lang: app.lang })) as string[];
    return res.map((s) => clean(String(s))).filter(Boolean);
  }
  const res = await fetch(
    `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term=${encodeURIComponent(seed)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} from Apple search hints`);
  const xml = await res.text();
  return [...xml.matchAll(/<string>([^<]{2,50})<\/string>/g)].map((m) => clean(m[1])).filter(Boolean);
}

async function claudeCandidates(
  texts: { title: string; summary: string; description: string }, store: string, country: string,
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY || import.meta.env?.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 900,
    messages: [{
      role: 'user',
      content: `App store listing (${store === 'play' ? 'Google Play' : 'Apple App Store'}, ${country.toUpperCase()} storefront):
Title: ${texts.title}
Short description: ${texts.summary}
Description: ${texts.description.slice(0, 1800)}

List 30 search keywords/phrases (1-3 words each, lowercase) that real users in this market would type into the app store when looking for an app like this. Include brand terms, category terms, and task/intent terms. Return ONLY a JSON array of strings, no commentary.`,
    }],
  });
  const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return (JSON.parse(m[0]) as unknown[]).map((s) => clean(String(s))).filter(Boolean); } catch { return []; }
}

/**
 * Discover keywords the app ranks for in the top 200. Slow by nature — one
 * store search per candidate (~250 ms apart), so ~60-90 s for a full run.
 */
export async function discoverKeywords(app: TrackedApp, maxCandidates = 90): Promise<DiscoveryResult> {
  const errors: string[] = [];
  const sources = new Map<string, DiscoveredKeyword['source']>(); // keyword -> first source
  const addAll = (terms: string[], source: DiscoveredKeyword['source']) => {
    for (const t of terms) if (t && t.length <= 50 && !sources.has(t)) sources.set(t, source);
  };

  // 1a. listing n-grams
  let texts = { title: app.title, summary: '', description: '' };
  try { texts = await listingTexts(app); }
  catch (e) { errors.push(`Listing read failed: ${e instanceof Error ? e.message : String(e)}`); }
  addAll(candidatesFromListing(texts.title, texts.summary, texts.description), 'listing');

  // 1b. autocomplete, seeded with title words + the strongest listing terms
  const seeds = [...new Set([
    ...clean(texts.title).split(' ').filter(isWord).slice(0, 4),
    ...[...sources.keys()].slice(0, 6),
  ])].slice(0, 8);
  for (const seed of seeds) {
    try { addAll(await autocomplete(app, seed), 'autocomplete'); }
    catch (e) { errors.push(`Autocomplete "${seed}" failed: ${e instanceof Error ? e.message : String(e)}`); break; }
    await sleep(150);
  }

  // 1c. Claude ideas (best-effort)
  try { addAll(await claudeCandidates(texts, app.store, app.country), 'ai'); }
  catch (e) { errors.push(`AI candidates skipped: ${e instanceof Error ? e.message : String(e)}`); }

  // 2. scan: search each candidate, keep the ones where this app ranks
  const tracked = new Set(app.keywords.map((k) => k.toLowerCase()));
  const candidates = [...sources.keys()].filter((k) => !tracked.has(k)).slice(0, maxCandidates);
  const discovered: DiscoveredKeyword[] = [];
  let scanned = 0;
  for (const kw of candidates) {
    try {
      const hits = await searchStore(app.store, kw, app.country, app.lang);
      scanned++;
      const idx = hits.findIndex((h) => h.appId === app.appId);
      if (idx !== -1) discovered.push({ keyword: kw, position: idx + 1, source: sources.get(kw)! });
    } catch (e) {
      errors.push(`Scan stopped at "${kw}": ${e instanceof Error ? e.message : String(e)}`);
      break; // a store block mid-scan would just repeat the same error 80×
    }
    await sleep(250);
  }
  discovered.sort((a, b) => a.position - b.position);
  return { discovered, scanned, candidates: candidates.length, errors };
}
