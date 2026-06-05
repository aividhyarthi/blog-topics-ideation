import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import {
  analyzeHtml,
  deterministicSignals,
  llmSignals,
  buildReport,
  type LlmScores,
  type PageFacts,
} from '../../lib/aeo';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Escape unescaped control characters inside JSON string values so a slightly
// malformed model response can still be parsed.
function repairJson(raw: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
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
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: '' };
  } finally {
    clearTimeout(timer);
  }
}

function buildLlmPrompt(f: PageFacts, target: string): string {
  const headingOutline = f.headings.slice(0, 40).map((h) => `${'  '.repeat(Math.max(0, h.level - 1))}H${h.level}: ${h.text}`).join('\n');
  return `You are an Answer Engine Optimization (AEO) auditor. You judge how likely a web article is to be EXTRACTED and CITED by LLM answer engines (ChatGPT, Perplexity, Google AI Overviews, Gemini, Copilot).

Score each dimension 0-100 (0 = terrible, 100 = excellent for AEO). Be critical and calibrated — do not give everything 70-80. Reserve 90+ for genuinely excellent, and use sub-40 for real failures.

CONTEXT
- Brand/site: ${f.brand || (f.host ? f.host : 'unknown')}
- Topic (if given): ${f.topic || '(infer from content)'}
- Target question to answer (if given): ${target || '(none — judge overall answer completeness instead)'}

HEADING OUTLINE
${headingOutline || '(no headings detected)'}

ARTICLE TEXT (may be truncated)
"""
${f.text || '(no readable body text extracted)'}
"""

Return ONLY valid JSON in EXACTLY this shape (no markdown):
{
  "directAnswer": 0-100,        // Does each section give a concise, quotable answer up front (question -> immediate answer -> elaboration)?
  "selfContained": 0-100,       // Can individual passages/sections be understood and quoted in isolation?
  "answersTarget": 0-100,       // How completely & directly does the page answer the target question? (If no target given, judge overall answer completeness.)
  "topicalDepth": 0-100,        // Coverage of the related sub-questions/angles a reader and an LLM would expect.
  "entityCoverage": 0-100,      // Are the concrete, relevant entities (products, ingredients, brands, places, specs) named?
  "clearIntent": 0-100,         // Is there one clear, coherent intent (info/comparison/how-to/transactional), not a muddle?
  "originalInfo": 0-100,        // Original analysis, first-party data, expert quotes — vs. generic rehashed content.
  "brandAuthority": 0-100,      // ESTIMATE from your training knowledge: how well-known/authoritative is this brand/site on this topic? (Unknown/new brand = low.)
  "offpageCorroboration": 0-100,// ESTIMATE: how likely is this brand/topic to be corroborated on consensus sources LLMs trust (Wikipedia, Reddit, YouTube, reputable roundups)?
  "detectedIntent": "informational | commercial | comparison | transactional | how-to",
  "notes": {                    // one short, specific sentence per dimension explaining the score
    "direct_answer": "...", "self_contained": "...", "answers_target": "...",
    "topical_depth": "...", "entity_coverage": "...", "clear_intent": "...",
    "original_info": "...", "brand_authority": "...", "offpage_corroboration": "..."
  },
  "fixes": [ { "signal": "short label", "recommendation": "specific, actionable fix", "severity": "fail | warn" } ]
}

Be honest about brandAuthority/offpageCorroboration: these are ESTIMATES from your training data, not live measurements. If you don't recognise the brand, score it low and say so in the note.`;
}

export const POST: APIRoute = async ({ request }) => {
  let body: { url?: string; html?: string; brand?: string; topic?: string; target?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: 'Server is not configured with an Anthropic API key. Set ANTHROPIC_API_KEY in Railway.' }, 500);
  }

  const inputUrl = (body.url || '').trim();
  const pasted = (body.html || '').trim();
  const brand = (body.brand || '').trim();
  const topic = (body.topic || '').trim();
  const target = (body.target || '').trim();

  let html = '';
  let host = '';
  let isUrl = false;
  let robotsTxt: string | null = null;
  let llmsTxt: boolean | null = null;
  let fetchNote: string | undefined;

  if (inputUrl) {
    if (!/^https?:\/\//i.test(inputUrl)) return json({ error: 'URL must start with http:// or https://' }, 400);
    isUrl = true;
    try {
      host = new URL(inputUrl).host;
    } catch {
      return json({ error: 'Could not parse that URL.' }, 400);
    }
    const page = await fetchText(inputUrl, 15000);
    if (!page.ok || page.body.length < 50) {
      return json(
        { error: `Could not read that URL${page.status ? ` (HTTP ${page.status})` : ''}. The page may be bot-blocked or JS-rendered — paste the article HTML/text instead.` },
        502,
      );
    }
    html = page.body;
    // Best-effort robots.txt + llms.txt (informational) — never fatal.
    const origin = (() => { try { return new URL(inputUrl).origin; } catch { return ''; } })();
    if (origin) {
      const [robots, llms] = await Promise.all([
        fetchText(`${origin}/robots.txt`, 6000),
        fetchText(`${origin}/llms.txt`, 6000),
      ]);
      robotsTxt = robots.ok ? robots.body : null;
      llmsTxt = llms.ok && /\S/.test(llms.body);
    }
  } else if (pasted) {
    // Treat pasted input as HTML if it contains tags, otherwise wrap plain text
    // so the analyzer still sees paragraphs.
    if (/<\w+[\s>]/.test(pasted)) {
      html = pasted;
    } else {
      const paras = pasted.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, ' ').trim()}</p>`).join('\n');
      html = `<article>${paras}</article>`;
      fetchNote = 'Plain text detected — structural/HTML signals (schema, headings, meta) will score low because there is no markup to inspect.';
    }
  } else {
    return json({ error: 'Provide a URL or paste the article HTML/text.' }, 400);
  }

  const facts = analyzeHtml(html, { isUrl, host, brand, topic, robotsTxt, llmsTxt });
  const auto = deterministicSignals(facts);

  // Claude pass for judged + estimated signals.
  let llmScores: LlmScores = {};
  let aiError: string | undefined;
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildLlmPrompt(facts, target) }],
    });
    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        llmScores = JSON.parse(m[0]);
      } catch {
        llmScores = JSON.parse(repairJson(m[0]));
      }
    }
  } catch (err: unknown) {
    aiError = err instanceof Error ? err.message : String(err);
  }

  const ai = llmSignals(llmScores, Boolean(target));
  const report = buildReport(auto, ai);

  return json({
    report,
    meta: {
      mode: isUrl ? 'url' : 'pasted',
      url: inputUrl || null,
      host: host || null,
      brand: brand || null,
      wordCount: facts.wordCount,
      schemaTypes: facts.schemaTypes,
      hasLlmsTxt: facts.hasLlmsTxt,
      detectedIntent: llmScores.detectedIntent || null,
      fetchNote,
      aiError,
    },
  });
};
