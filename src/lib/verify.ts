// CiteRank — predict→verify loop. The audit PREDICTS citability; this module
// MEASURES it. It runs the page's likely prompts through real answer engines
// (OpenAI web search + Perplexity), then checks who actually got cited:
//   - did THIS site's domain appear in the engine's sources? (ground truth)
//   - was the brand named in the answer text?
//   - which OTHER domains were cited instead? (competitor share of voice)
//
// Self-contained on purpose (no shared crawl/ pipeline) so the CiteRank product
// stays standalone. Degrades gracefully: with no engine key it returns a clear
// "configure a key" note rather than throwing.

// ---- tiny bounded-concurrency map (inlined to keep this module standalone) ---
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, async () => {
    while (true) { const i = next++; if (i >= items.length) break; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// ---- domain helpers ---------------------------------------------------------
const SLD2 = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
export function hostOf(u: string): string {
  try { return new URL(u).host.replace(/^www\./, '').toLowerCase(); }
  catch { return String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase(); }
}
// Registrable domain (eTLD+1-ish) so news.bbc.co.uk and bbc.co.uk collapse together.
export function regDomain(host: string): string {
  const p = host.split('.').filter(Boolean);
  if (p.length <= 2) return host;
  if (SLD2.has(p[p.length - 2])) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}

// ---- types ------------------------------------------------------------------
export interface Probe {
  engine: 'ChatGPT (web)' | 'Perplexity';
  q: string;
  cited: boolean;          // your domain appeared in the engine's sources
  brandMentioned: boolean; // brand named in the answer text
  yourUrls: string[];      // your URLs that were cited
  sources: string[];       // all source hostnames the engine cited
  error?: string;
}
export interface ShareRow { domain: string; count: number; isYou: boolean }
export interface VerifyResult {
  ran: boolean;
  engines: string[];
  yourDomain: string;
  brand: string;
  promptCount: number;
  probes: Probe[];
  citationRate: number;       // % of (engine×prompt) trials where you were cited
  promptCitationRate: number; // % of prompts cited by at least one engine
  brandMentionRate: number;   // % of trials that named the brand
  shareOfVoice: ShareRow[];
  note?: string;
}

const OPENAI_MODEL = (import.meta as any).env?.OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o';

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// ---- OpenAI (web search via Responses API) ----------------------------------
async function queryOpenAI(prompt: string, key: string): Promise<{ text: string; sources: string[]; error?: string }> {
  const input = `${prompt}\n\nAnswer concisely. Recommend specific brands, products or sources by name, and cite where the information comes from.`;
  const attempts: any[] = [
    { model: OPENAI_MODEL, tools: [{ type: 'web_search' }], input },
    { model: OPENAI_MODEL, tools: [{ type: 'web_search_preview' }], input },
  ];
  let lastErr = '';
  for (const body of attempts) {
    const { signal, done } = withTimeout(45000);
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        lastErr = `OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`;
        if (res.status !== 400 && res.status !== 404) break; // only retry tool-name errors
        continue;
      }
      const data: any = await res.json();
      let text = '';
      const sources: string[] = [];
      for (const item of data?.output ?? []) {
        if (item?.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c?.type === 'output_text') {
              text += c.text || '';
              for (const ann of c.annotations ?? []) if (ann?.type === 'url_citation' && ann.url) sources.push(ann.url);
            }
          }
        }
      }
      if (!text && typeof data?.output_text === 'string') text = data.output_text;
      return { text, sources };
    } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
    finally { done(); }
  }
  return { text: '', sources: [], error: lastErr || 'OpenAI request failed' };
}

// ---- Perplexity (sonar, native citations) -----------------------------------
async function queryPerplexity(prompt: string, key: string): Promise<{ text: string; sources: string[]; error?: string }> {
  const { signal, done } = withTimeout(45000);
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'sonar', temperature: 0,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Answer concisely and recommend specific brands, products or sources by name where relevant.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) return { text: '', sources: [], error: `Perplexity ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const data: any = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const sources: string[] = [];
    if (Array.isArray(data?.citations)) for (const u of data.citations) if (typeof u === 'string') sources.push(u);
    if (Array.isArray(data?.search_results)) for (const s of data.search_results) if (s?.url) sources.push(s.url);
    return { text, sources };
  } catch (e) { return { text: '', sources: [], error: e instanceof Error ? e.message : String(e) }; }
  finally { done(); }
}

// ---- orchestration ----------------------------------------------------------
export interface VerifyInput { prompts: string[]; host: string; brand?: string; maxPrompts?: number }

export async function runVerification(input: VerifyInput): Promise<VerifyResult> {
  const yourDomain = regDomain(hostOf(input.host || ''));
  const brand = (input.brand || yourDomain.split('.')[0] || '').trim();
  const prompts = input.prompts.map((p) => p.trim()).filter(Boolean).slice(0, input.maxPrompts ?? 6);

  const openaiKey = process.env.OPENAI_API_KEY || (import.meta as any).env?.OPENAI_API_KEY;
  const pplxKey = process.env.PERPLEXITY_API_KEY || (import.meta as any).env?.PERPLEXITY_API_KEY;

  const engines: { name: Probe['engine']; run: (p: string) => Promise<{ text: string; sources: string[]; error?: string }> }[] = [];
  if (openaiKey) engines.push({ name: 'ChatGPT (web)', run: (p) => queryOpenAI(p, openaiKey) });
  if (pplxKey) engines.push({ name: 'Perplexity', run: (p) => queryPerplexity(p, pplxKey) });

  const base: VerifyResult = {
    ran: false, engines: engines.map((e) => e.name), yourDomain, brand,
    promptCount: prompts.length, probes: [], citationRate: 0, promptCitationRate: 0,
    brandMentionRate: 0, shareOfVoice: [],
  };

  if (!engines.length) {
    return { ...base, note: 'No real-engine key configured. Add OPENAI_API_KEY (web search) or PERPLEXITY_API_KEY to verify against live answer engines.' };
  }
  if (!prompts.length) {
    return { ...base, note: 'No prompts to verify. Run an audit first so CiteRank can generate the likely AI questions for this page.' };
  }

  const brandRe = brand ? new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;

  // One trial per (engine, prompt).
  const trials: { engine: typeof engines[number]; q: string }[] = [];
  for (const e of engines) for (const q of prompts) trials.push({ engine: e, q });

  const probes = await mapPool(trials, 4, async (t): Promise<Probe> => {
    const out = await t.engine.run(t.q);
    const hosts = out.sources.map(hostOf).filter(Boolean);
    const yourUrls = out.sources.filter((u) => regDomain(hostOf(u)) === yourDomain);
    return {
      engine: t.engine.name, q: t.q,
      cited: yourUrls.length > 0,
      brandMentioned: brandRe ? brandRe.test(out.text) : false,
      yourUrls: [...new Set(yourUrls)],
      sources: hosts,
      error: out.error,
    };
  });

  const valid = probes.filter((p) => !p.error);
  const citationRate = valid.length ? Math.round((valid.filter((p) => p.cited).length / valid.length) * 100) : 0;
  const brandMentionRate = valid.length ? Math.round((valid.filter((p) => p.brandMentioned).length / valid.length) * 100) : 0;

  // Prompt-level: cited by at least one engine.
  const byPrompt = new Map<string, boolean>();
  for (const p of valid) byPrompt.set(p.q, (byPrompt.get(p.q) || false) || p.cited);
  const promptCitationRate = byPrompt.size ? Math.round(([...byPrompt.values()].filter(Boolean).length / byPrompt.size) * 100) : 0;

  // Share of voice: tally registrable domains across all cited sources.
  const tally = new Map<string, number>();
  for (const p of valid) {
    const seen = new Set<string>(); // count each domain once per answer
    for (const h of p.sources) {
      const d = regDomain(h); if (!d) continue;
      if (seen.has(d)) continue; seen.add(d);
      tally.set(d, (tally.get(d) || 0) + 1);
    }
  }
  if (!tally.has(yourDomain)) tally.set(yourDomain, 0); // always show "you" even at 0
  const shareOfVoice: ShareRow[] = [...tally.entries()]
    .map(([domain, count]) => ({ domain, count, isYou: domain === yourDomain }))
    .sort((a, b) => (b.isYou ? 1 : 0) - (a.isYou ? 1 : 0) || b.count - a.count) // you first, then by count
    .slice(0, 12)
    .sort((a, b) => b.count - a.count || (b.isYou ? 1 : 0) - (a.isYou ? 1 : 0));

  const allErrored = valid.length === 0;
  return {
    ...base, ran: true, probes,
    citationRate, promptCitationRate, brandMentionRate, shareOfVoice,
    note: allErrored ? `All engine calls failed (${probes[0]?.error || 'unknown error'}). Check the API key has credits and web search enabled.` : undefined,
  };
}
