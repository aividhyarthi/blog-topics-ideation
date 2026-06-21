// Perplexity engine adapter — Phase 1's live source (cleanest API + native
// citations). Falls back to a DETERMINISTIC demo generator when no API key is
// set, so the whole pipeline runs offline and produces stable, believable data.

import type { BrandRef, Citation, PromptSet, RawResponse } from '../types';

const PPLX_URL = 'https://api.perplexity.ai/chat/completions';
const PPLX_MODEL = 'sonar'; // Perplexity's online (web-grounded) model

export function perplexityKey(): string | undefined {
  return (import.meta as any).env?.PERPLEXITY_API_KEY ?? process.env.PERPLEXITY_API_KEY;
}

// ---- live call ----
async function queryLive(
  prompt: string, locale: string, key: string,
): Promise<{ text: string; citations: Citation[] }> {
  const res = await fetch(PPLX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: PPLX_MODEL,
      messages: [
        { role: 'system', content: `You are a helpful shopping assistant. Answer for a user in ${locale}. Recommend specific brands and products where relevant.` },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${await res.text().catch(() => '')}`);
  const data: any = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  // Perplexity returns citations either as a top-level array of URLs or as
  // search_results with url/title. Handle both shapes.
  const cites: Citation[] = [];
  if (Array.isArray(data?.citations)) {
    for (const u of data.citations) if (typeof u === 'string') cites.push({ url: u });
  }
  if (Array.isArray(data?.search_results)) {
    for (const s of data.search_results) if (s?.url) cites.push({ url: s.url, title: s.title });
  }
  return { text, citations: cites };
}

// ---- deterministic demo generator ----
// Stable hash so the same (prompt, brand) always yields the same outcome — this
// mimics a FROZEN measurement so demo trends don't jump around.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 0xffffffff; // 0..1
}

function demoResponse(
  prompt: string, run: number, set: PromptSet,
): { text: string; citations: Citation[] } {
  const brands = [set.primary, ...set.competitors];
  // Each brand appears if its score for this prompt clears a threshold. The
  // primary is deliberately made to MISS some topics so gaps show up.
  const appearing: BrandRef[] = [];
  for (const b of brands) {
    const base = hash(`${b.key}|${prompt}`);
    const isPrimary = b.key === set.primary.key;
    const threshold = isPrimary ? 0.55 : 0.45; // primary slightly harder -> realistic gaps
    // small per-run jitter so multi-run averaging has something to smooth
    const jitter = (hash(`${b.key}|${prompt}|${run}`) - 0.5) * 0.1;
    if (base + jitter > threshold) appearing.push(b);
  }
  let text: string;
  if (!appearing.length) {
    text = `For "${prompt}", there isn't one clear standout — recommendations vary widely and depend on skin type, budget and preference.`;
  } else {
    const [first, ...rest] = appearing;
    text = `For "${prompt}", ${first.label} is the most frequently recommended choice — it's widely praised for quality and value`;
    if (rest.length === 1) text += `, and ${rest[0].label} also comes up often as a strong alternative`;
    else if (rest.length > 1) text += `. ${rest.slice(0, -1).map((b) => b.label).join(', ')} and ${rest[rest.length - 1].label} are also commonly mentioned`;
    text += `. Most reviewers suggest ${first.label} as the best overall pick for ${prompt.replace(/^best |in india$/gi, '').trim() || 'this category'}.`;
  }

  // Citations: each appearing brand sometimes cites its own domain; always some
  // third-party (editorial / marketplace) sources.
  const citations: Citation[] = [];
  for (const b of appearing) {
    const domain = b.aliases.find((a) => a.includes('.')) ?? `${b.key}.com`;
    if (hash(`cite|${b.key}|${prompt}`) > 0.5) {
      const kind = hash(`kind|${b.key}|${prompt}`) > 0.5 ? 'beauty-blog/guide' : 'p/best-products';
      citations.push({ url: `https://${domain}/${kind}`, title: `${b.label} — guide` });
    }
  }
  citations.push({ url: 'https://www.reddit.com/r/IndianSkincareAddicts/comments/abc', title: 'Reddit thread' });
  if (hash(`yt|${prompt}`) > 0.6) citations.push({ url: 'https://www.youtube.com/watch?v=xyz', title: 'Review video' });
  return { text, citations };
}

// Collect every (topic, prompt, run) for this engine.
export async function collectPerplexity(set: PromptSet): Promise<{ mode: 'live' | 'demo'; responses: RawResponse[] }> {
  const key = perplexityKey();
  const mode: 'live' | 'demo' = key ? 'live' : 'demo';
  const responses: RawResponse[] = [];
  for (const t of set.topics) {
    for (const prompt of t.prompts) {
      for (let run = 1; run <= set.runsPerPrompt; run++) {
        let out: { text: string; citations: Citation[] };
        if (key) {
          try { out = await queryLive(prompt, set.locale, key); }
          catch (e) { out = { text: `__error__ ${String((e as Error).message)}`, citations: [] }; }
        } else {
          out = demoResponse(prompt, run, set);
        }
        responses.push({
          topic: t.topic, prompt, engine: 'perplexity', run,
          text: out.text, citations: out.citations, ts: new Date().toISOString(),
        });
      }
    }
  }
  return { mode, responses };
}
