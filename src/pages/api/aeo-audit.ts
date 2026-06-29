import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import {
  analyzeHtml, deterministicSignals, llmSignals, buildReport, crawlabilitySignals,
  CATEGORY_WEIGHTS, CATEGORY_LABEL, PAGE_TYPE_LABEL,
  type LlmScores, type PageFacts, type Category, type PromptCoverage, type PageType,
} from '../../lib/aeo';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function repairJson(raw: string): string {
  let result = '', inString = false, escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { result += ch; escaped = false; continue; }
    if (ch === '\\' && inString) { result += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; result += ch; continue; }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      if (ch.charCodeAt(0) < 0x20) continue;
    }
    result += ch;
  }
  return result;
}

async function fetchText(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal, redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch { return { ok: false, status: 0, body: '' }; }
  finally { clearTimeout(timer); }
}

const CATEGORIES: Category[] = ['general', 'entertainment', 'health', 'news', 'lifestyle', 'commerce'];

const PAGE_TYPE_GUIDANCE: Record<string, string> = {
  product: `PAGE TYPE: PRODUCT PAGE (not an editorial article). Judge it as a product page:
- headlineClarity = does the title/H1 clearly name the product (brand + model)?
- leadCompleteness = is the key info (what it is, price, 1-2 standout specs) right at the top?
- directAnswer = does it answer "should I buy this / what are the specs / what's the price" directly?
- entityDensity = product name, brand, model, variants, key specs named explicitly?
- sourceAttribution / claimAttribution = specs/claims backed by ratings, review counts, official spec sheets (NOT "experts say")?
- intentMatch / longTailIntent = covers "is X good", "X price", "X specs", "X vs Y", "X for <use>"?
- Do NOT expect a bylined author or expert quotations — those are article concepts; do not penalise their absence.`,
  listing: `PAGE TYPE: CATEGORY / LISTING PAGE (not an editorial article). Judge it as a listing/collection page:
- headlineClarity = does the title/H1 clearly state the category + qualifier (e.g. "Samsung phones under ₹15,000")?
- leadCompleteness = does intro copy directly answer the implied query (what are the best/available options)?
- directAnswer = does each product entry lead with name + price + the one key spec?
- entityDensity = are products named with brand + model (+ price), not generic "this phone"?
- sourceAttribution / claimAttribution = are picks backed by ratings/review counts/specs?
- intentMatch / longTailIntent = matches "best X under Y", "top X", "X vs Y", price/spec filters?
- Do NOT expect a bylined author or expert quotations — do not penalise their absence.`,
  article: '',
};

function buildLlmPrompt(f: PageFacts, target: string): string {
  const outline = f.headings.slice(0, 40).map((h) => `${'  '.repeat(Math.max(0, h.level - 1))}H${h.level}: ${h.text}`).join('\n');
  const ptGuidance = PAGE_TYPE_GUIDANCE[f.pageType] || '';
  return `You are an Answer Engine Optimization (AEO) auditor. You judge how likely a web page is to be EXTRACTED and CITED by LLM answer engines (ChatGPT, Perplexity, Google AI Overviews/Mode, Gemini).

Score each dimension 0-100 (0 = terrible, 100 = excellent for AEO). Be critical and calibrated — do NOT cluster everything at 70-80. Reserve 90+ for genuinely excellent and use sub-40 for real failures.
${ptGuidance ? `\n${ptGuidance}\n` : ''}
CONTEXT
- Page type: ${f.pageType}
- Category: ${CATEGORY_LABEL[f.category]}
- Brand/site: ${f.brand || (f.host || 'unknown')}
- Topic (if given): ${f.topic || '(infer from content)'}
- Target question (if given): ${target || '(none — judge overall answer completeness)'}
- Headline/title: ${f.title || '(none)'}
- Lead text (first words): ${f.firstWords || '(none)'}

HEADING OUTLINE
${outline || '(no headings)'}

ARTICLE TEXT (may be truncated)
"""
${f.text || '(no readable body text)'}
"""

For "prompts": generate 8-14 realistic natural-language questions a user would ask an AI about THIS story (the ways this article should be the cited answer), and mark covered:true only if the article actually answers that question well.

Return ONLY valid JSON in EXACTLY this shape (no markdown):
{
  "headlineClarity": 0-100,      // headline names the subject + action, no vague curiosity-gap teaser
  "leadCompleteness": 0-100,     // first sentence self-contained (who/what/when/where for news; a direct answer for evergreen)
  "answerAboveFold": 0-100,      // the answer appears in the first paragraph / summary, not buried
  "directAnswer": 0-100,         // each section leads with a concise, quotable answer
  "entityDensity": 0-100,        // concrete named entities are present (people, products, places, institutions)
  "entityConsistency": 0-100,    // one canonical name per entity, not a sprawl of variants
  "sourceAttribution": 0-100,    // named sources vs vague "experts say"
  "claimAttribution": 0-100,     // major claims attributed to who said them
  "intentMatch": 0-100,          // mirrors how people phrase questions to AI
  "longTailIntent": 0-100,       // covers comparison/status/definition/timeline intents
  "answersTarget": 0-100,        // completeness vs the target question (or overall completeness if none)
  "promptCoverageScore": 0-100,  // overall how well it covers the prompts below
  "brandAuthority": 0-100,       // ESTIMATE from training knowledge: how authoritative is this brand/site on this topic? (off-page; unknown brand = low)
  "offpageCorroboration": 0-100, // ESTIMATE: how corroborated on Wikipedia/Reddit/YouTube/reputable roundups?
  "engines": { "chatgpt": 0-100, "gemini": 0-100, "perplexity": 0-100, "aiOverviews": 0-100 }, // estimated likelihood THIS page gets cited by each engine given its biases: ChatGPT favours authoritative/Wikipedia-grade sources; Gemini favours Google-indexed, structured, entity-rich content; Perplexity favours fresh + forum/Reddit + clearly-cited pages; AI Overviews favours FAQ/snippet-ready structured answers.
  "summary": "2-3 sentences for an editor with NO numbers or scores anywhere. Say plainly whether ChatGPT, Gemini, Perplexity and Google AI Mode would cite THIS page or not, the single biggest reason why, and the first thing to fix. Quote the page's actual headline. Conversational, no jargon.",
  "detectedIntent": "informational | commercial | comparison | transactional | how-to",
  "suggestedCategory": "one of: ${CATEGORIES.join(' | ')}",
  "prompts": [ { "q": "a likely AI question", "covered": true|false } ],
  "notes": {
    "headline_clarity":"...","lead_completeness":"...","answer_above_fold":"...","direct_answer":"...",
    "entity_density":"...","entity_consistency":"...","source_attribution":"...","claim_attribution":"...",
    "intent_match":"...","long_tail_intent":"...","prompt_coverage":"...","answers_target":"...","brand_authority":"...","offpage_corroboration":"..."
  },
  "fixes": {
    "headline_clarity":"...","lead_completeness":"...","answer_above_fold":"...","direct_answer":"...",
    "entity_density":"...","entity_consistency":"...","source_attribution":"...","claim_attribution":"...",
    "intent_match":"...","long_tail_intent":"...","prompt_coverage":"...","answers_target":"..."
  }
}

RULES FOR notes AND fixes (this is what makes the report useful):
- Be CONTENT-SPECIFIC. Quote THIS article's real headline, lead, entities and sentences. Never use placeholder examples.
- Each "fix" must be a concrete action the editor can apply right now, referencing the real text. Example shape: headline_clarity -> "Your headline \\"<their actual headline>\\" hides the subject — rewrite to \\"<a concrete rewrite that names who + what>\\"."
- Only include a "fix" for dimensions that score below 70. Omit the rest (don't pad).
- "summary": quote the actual headline, give the verdict, and name the single most important fix FIRST.
brandAuthority/offpageCorroboration are ESTIMATES, not live measurements — if you don't recognise the brand, score low and say so.`;
}

const PAGE_TYPES = ['auto', 'article', 'product', 'listing'] as const;
const OPENAI_MODEL = (import.meta as any).env?.OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o';

// ---- LLM judge: provider-agnostic, returns raw JSON text ----
async function judgeOpenAI(prompt: string, key: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_MODEL, response_format: { type: 'json_object' }, temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 240)}`);
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}
async function judgeAnthropic(prompt: string, key: string): Promise<string> {
  const client = new Anthropic({ apiKey: key });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 2600, messages: [{ role: 'user', content: prompt }],
  });
  return message.content[0]?.type === 'text' ? message.content[0].text : '';
}

export const POST: APIRoute = async ({ request }) => {
  let body: { url?: string; html?: string; brand?: string; topic?: string; target?: string; category?: string; pageType?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  // AI-judged signals use OpenAI or Anthropic (whichever has a key + credits).
  // Without either, the auditor still runs on rule-based signals (AI defaults to 50).
  const openaiKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY || import.meta.env.ANTHROPIC_API_KEY;

  const inputUrl = (body.url || '').trim();
  const pasted = (body.html || '').trim();
  const brand = (body.brand || '').trim();
  const topic = (body.topic || '').trim();
  const target = (body.target || '').trim();
  const category = (CATEGORIES.includes(body.category as Category) ? body.category : 'general') as Category;
  const pageTypeChoice = (PAGE_TYPES.includes(body.pageType as any) ? body.pageType : 'auto') as 'auto' | PageType;

  let html = '', host = '', isUrl = false, robotsTxt: string | null = null, llmsTxt: string | null = null, fetchNote: string | undefined;

  if (inputUrl) {
    if (!/^https?:\/\//i.test(inputUrl)) return json({ error: 'URL must start with http:// or https://' }, 400);
    isUrl = true;
    try { host = new URL(inputUrl).host; } catch { return json({ error: 'Could not parse that URL.' }, 400); }
    const page = await fetchText(inputUrl, 15000);
    if (!page.ok || page.body.length < 50) {
      return json({ error: `Could not read that URL${page.status ? ` (HTTP ${page.status})` : ''}. The page may be bot-blocked or JS-rendered — paste the article HTML/text instead.` }, 502);
    }
    html = page.body;
    const origin = (() => { try { return new URL(inputUrl).origin; } catch { return ''; } })();
    if (origin) {
      // Probe robots.txt + llms.txt for AI-crawlability checks (best-effort, parallel).
      const [robots, llms] = await Promise.all([
        fetchText(`${origin}/robots.txt`, 6000),
        fetchText(`${origin}/llms.txt`, 6000),
      ]);
      robotsTxt = robots.ok ? robots.body : null;
      llmsTxt = llms.ok && /\S/.test(llms.body) && !/<html/i.test(llms.body.slice(0, 400)) ? llms.body : null;
    }
  } else if (pasted) {
    if (/<\w+[\s>]/.test(pasted)) html = pasted;
    else {
      const paras = pasted.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, ' ').trim()}</p>`).join('\n');
      html = `<article>${paras}</article>`;
      fetchNote = 'Plain text detected — HTML signals (schema, headings, meta) score low because there is no markup to inspect.';
    }
  } else {
    return json({ error: 'Provide a URL or paste the article HTML/text.' }, 400);
  }

  const facts = analyzeHtml(html, { isUrl, host, brand, topic, category, robotsTxt, pageType: pageTypeChoice });

  // Detect a JavaScript-rendered shell: URL fetched fine but almost no readable
  // text (the real content loads client-side). Tell the user to paste the HTML.
  if (isUrl && facts.wordCount < 120 && !fetchNote) {
    fetchNote = 'This URL returned very little readable text — it looks JavaScript-rendered, so the score is based on a near-empty page. For an accurate audit, open the page, View Source or Inspect → copy the rendered HTML, and use the “Paste HTML” tab.';
  }

  const auto = deterministicSignals(facts);

  let llmScores: LlmScores = {};
  let aiError: string | undefined;
  let judge: string | undefined;
  // Try OpenAI first (Anthropic accounts may be out of credits), then Anthropic.
  const providers: Array<[string, string]> = [];
  if (openaiKey) providers.push(['OpenAI', openaiKey]);
  if (anthropicKey) providers.push(['Claude', anthropicKey]);
  if (!providers.length) {
    aiError = 'No AI key configured — set OPENAI_API_KEY or ANTHROPIC_API_KEY. AI-judged signals default to 50.';
  } else {
    const prompt = buildLlmPrompt(facts, target);
    for (const [name, key] of providers) {
      try {
        const raw = name === 'OpenAI' ? await judgeOpenAI(prompt, key) : await judgeAnthropic(prompt, key);
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) { try { llmScores = JSON.parse(m[0]); } catch { llmScores = JSON.parse(repairJson(m[0])); } }
        judge = name; aiError = undefined; break;
      } catch (err: unknown) {
        aiError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const prompts: PromptCoverage[] = Array.isArray(llmScores.prompts)
    ? llmScores.prompts.filter((p) => p && typeof p.q === 'string').slice(0, 16).map((p) => ({ q: p.q, covered: Boolean(p.covered) }))
    : [];
  const ai = llmSignals(llmScores, Boolean(target));
  const crawl = crawlabilitySignals({ isUrl, robotsTxt, llmsTxt });
  const report = buildReport(auto, ai, category, prompts, llmScores.summary, llmScores.engines, crawl);

  return json({
    report,
    meta: {
      mode: isUrl ? 'url' : 'pasted', url: inputUrl || null, host: host || null, brand: brand || null,
      category, categoryLabel: CATEGORY_LABEL[category], categoryWeights: CATEGORY_WEIGHTS[category],
      pageType: facts.pageType, pageTypeLabel: PAGE_TYPE_LABEL[facts.pageType],
      detectedPageType: facts.detectedPageType, pageTypeAuto: pageTypeChoice === 'auto',
      wordCount: facts.wordCount, schemaTypes: facts.schemaTypes,
      detectedIntent: llmScores.detectedIntent || null, suggestedCategory: llmScores.suggestedCategory || null,
      judge: judge || null,
      fetchNote, aiError,
    },
  });
};
