import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import {
  analyzeHtml, llmSignals, buildReportFromChecklist, crawlabilitySignals, buildVisibility,
  CATEGORY_WEIGHTS, CATEGORY_LABEL, PAGE_TYPE_LABEL, SCORING_VERSION,
  type LlmScores, type PageFacts, type Category, type PromptCoverage, type PageType,
} from '../../lib/aeo';
import { getUser } from '../../lib/auth';
import { saveAudit, auditHistoryByUrl } from '../../lib/audits';
import { consumeAccess, refundAccess, isAdmin } from '../../lib/billing';
import { dbEnabled } from '../../lib/db';
import { runChecklist, type ChecklistResult } from '../../lib/checklists';
import { getClient, getClientPageType } from '../../lib/clients';
import { cached } from '../../lib/fetchcache';
import { UA } from '../../lib/useragents';

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

const DESKTOP_UA = UA.desktop;
// Googlebot Smartphone — mobile-first indexing means this is what Google
// actually ranks from, and it's the second, cheap fetch behind the "Desktop
// vs Mobile" comparison in the visibility panel (see buildVisibility calls
// below). The PRIMARY fetch below stays on DESKTOP_UA unchanged, so the score
// itself is not affected by adding this.
const MOBILE_UA = UA.googlebotMobile;

async function fetchText(url: string, timeoutMs: number, ua: string = DESKTOP_UA): Promise<{ ok: boolean; status: number; body: string }> {
  // Cached across tools/tabs — see fetchcache.ts. Never cache a failure, so a
  // transient error doesn't get "stuck" for the full TTL.
  return cached(`${ua}::${url}`, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal, redirect: 'follow',
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      return { ok: res.ok, status: res.status, body: await res.text() };
    } catch { return { ok: false, status: 0, body: '' }; }
    finally { clearTimeout(timer); }
  }, (v) => v.ok);
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

// Deterministic candidate prompts derived from the page, used for "Verify in
// real engines" when the AI judge is OFF (no key) so the prompt set is never
// empty. Verify only needs a live-engine key, not the judge key.
const Q_HEAD_RE = /^(what|how|why|when|where|who|which|can|do|does|is|are|should|will|would|could|did|has|have|best|top)\b/i;
function deterministicPrompts(f: PageFacts, target: string, topic: string): string[] {
  const out: string[] = [];
  if (target) out.push(target);
  for (const h of f.headings) {
    if (h.text.length >= 8 && h.text.length <= 110 && (/\?$/.test(h.text) || Q_HEAD_RE.test(h.text))) out.push(h.text);
  }
  const subject = (topic || f.title || '').trim();
  if (subject) {
    if (f.pageType === 'product' || f.pageType === 'listing' || f.category === 'commerce') {
      out.push(`best ${subject}`, `${subject} review`, `is ${subject} worth buying`);
    } else {
      out.push(subject.length <= 90 ? subject : '', `${subject} explained`);
    }
  }
  // dedupe (case-insensitive), trim noise, cap at 6
  const seen = new Set<string>();
  return out.map((s) => s.trim()).filter((s) => {
    if (s.length < 6) return false;
    const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, 6);
}

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

export const POST: APIRoute = async (ctx) => {
  const { request } = ctx;
  let body: { url?: string; html?: string; brand?: string; topic?: string; target?: string; category?: string; pageType?: string; clientId?: string; clientPageType?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  // An account is ALWAYS required to run an audit. If the database isn't
  // configured the tool locks itself rather than falling open to anonymous
  // access — a missing DATA_DIR must never unlock the paid product.
  if (!dbEnabled) {
    return json({ error: 'Accounts are temporarily unavailable. Please try again shortly.', serviceDown: true }, 503);
  }
  const gateUser = await getUser(ctx);
  if (!gateUser) {
    return json({ error: 'Create a free account to run an audit — it takes 10 seconds.', requireAuth: true }, 401);
  }

  // Client-scoped checklists (an agency client's own page-type checklist,
  // e.g. Cars24) are an admin-only feature. Re-check server-side rather than
  // trusting the request body — a non-admin hitting this endpoint directly
  // with a clientId must never get client-specific checks.
  const admin = isAdmin(gateUser);
  const client = admin && body.clientId ? getClient(body.clientId) : undefined;
  const clientPageType = client && body.clientPageType ? getClientPageType(client.id, body.clientPageType) : undefined;
  // Charged up front, refunded below if the page turns out to be unreachable.
  let chargedVia: 'plan' | 'free' | 'credit' | undefined;
  {
    const access = await consumeAccess(gateUser.id, 'audit');
    if (!access.allowed) return json({ error: access.message, upgrade: true }, 402);
    chargedVia = access.via;
  }

  // AI-judged signals use OpenAI or Anthropic (whichever has a key + credits).
  // Without either, the auditor still runs on rule-based signals (AI defaults to 50).
  const openaiKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY || import.meta.env.ANTHROPIC_API_KEY;

  const inputUrl = (body.url || '').trim();
  const pasted = (body.html || '').trim();
  const brand = (body.brand || '').trim();
  const topic = (body.topic || '').trim();
  const target = (body.target || '').trim();
  // The page-type/vertical dropdown now speaks the checklist engine's
  // taxonomy (article/product/listing/review/howto, and eight verticals),
  // not the older category-weighting one, since that's what a user is
  // actually choosing when they override auto-detect. Map it down to the
  // legacy category (for pillar weighting) and legacy pageType (for the AI
  // judge's prompt guidance) so both scoring paths still get a sensible
  // value instead of silently falling back to "general".
  const rawVertical = (body.category || 'auto').trim();
  const rawKind = (body.pageType || 'auto').trim();
  const VERTICAL_TO_CATEGORY: Record<string, Category> = {
    news: 'news', health: 'health', beauty: 'commerce', ecommerce: 'commerce',
    entertainment: 'entertainment', lifestyle: 'lifestyle', reviews: 'general', general: 'general',
    // New verticals map onto the closest legacy weighting profile — fintech
    // leans on the same trust-heavy weighting as health, real estate/automotive/
    // saas on commerce (comparison + structure-driven), edtech on lifestyle
    // (decision/query-driven), music on entertainment.
    fintech: 'health', realestate: 'commerce', automotive: 'commerce', edtech: 'lifestyle', saas: 'commerce', music: 'entertainment',
  };
  const KIND_TO_PAGE_TYPE: Record<string, PageType> = {
    article: 'article', product: 'product', listing: 'listing', review: 'article', howto: 'article',
  };
  const category = VERTICAL_TO_CATEGORY[rawVertical] || 'general';
  const pageTypeChoice = (rawKind === 'auto' ? 'auto' : (KIND_TO_PAGE_TYPE[rawKind] || 'auto')) as 'auto' | PageType;
  // Only pass an override into the checklist engine when the user actually
  // picked something — otherwise it auto-detects, which is the whole point.
  const VERTICAL_VALUES = ['news', 'health', 'beauty', 'ecommerce', 'entertainment', 'lifestyle', 'reviews', 'general', 'fintech', 'realestate', 'automotive', 'edtech', 'saas', 'music'] as const;
  const checklistOverride = {
    kind: rawKind !== 'auto' && (['article', 'product', 'listing', 'review', 'howto'] as const).includes(rawKind as any) ? (rawKind as any) : undefined,
    // A selected client locks the vertical to what that client actually is
    // (e.g. Cars24 = automotive) — the dropdown's own value is ignored in
    // that case, since it wouldn't make sense to audit Cars24 as "beauty".
    vertical: client ? client.vertical : (rawVertical !== 'auto' && VERTICAL_VALUES.includes(rawVertical as any) ? (rawVertical as any) : undefined),
  };

  let html = '', mobileHtml = '', host = '', isUrl = false, robotsTxt: string | null = null, llmsTxt: string | null = null, fetchNote: string | undefined;

  if (inputUrl) {
    if (!/^https?:\/\//i.test(inputUrl)) return json({ error: 'URL must start with http:// or https://' }, 400);
    isUrl = true;
    try { host = new URL(inputUrl).host; } catch { return json({ error: 'Could not parse that URL.' }, 400); }
    const page = await fetchText(inputUrl, 15000);
    if (!page.ok || page.body.length < 50) {
      // Nothing was delivered — hand the check back.
      await refundAccess(gateUser.id, chargedVia);
      return json({ error: `Could not read that URL${page.status ? ` (HTTP ${page.status})` : ''}. The page may be bot-blocked or JS-rendered — paste the article HTML/text instead. This didn't use up a check.` }, 502);
    }
    html = page.body;
    const origin = (() => { try { return new URL(inputUrl).origin; } catch { return ''; } })();
    if (origin) {
      // Probe robots.txt + llms.txt for AI-crawlability checks, and a second
      // fetch as Googlebot Smartphone for the desktop-vs-mobile comparison —
      // all best-effort, in parallel with each other.
      const [robots, llms, mobilePage] = await Promise.all([
        fetchText(`${origin}/robots.txt`, 6000),
        fetchText(`${origin}/llms.txt`, 6000),
        fetchText(inputUrl, 15000, MOBILE_UA),
      ]);
      robotsTxt = robots.ok ? robots.body : null;
      llmsTxt = llms.ok && /\S/.test(llms.body) && !/<html/i.test(llms.body.slice(0, 400)) ? llms.body : null;
      mobileHtml = mobilePage.ok ? mobilePage.body : '';
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

  // The checklist engine detects what this page actually IS (kind + vertical)
  // from the HTML and runs the matching domain checklist — rather than grading
  // every page against one generic list weighted by a dropdown nobody changes.
  let checklist: ChecklistResult | null = null;
  try {
    checklist = runChecklist(html, facts.text || '', facts, checklistOverride, clientPageType?.checks);
  } catch { /* never let the checklist take down the audit */ }

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
  // llmSignals is still used, but only for the off-page "domain context"
  // estimate (brand authority / off-domain corroboration) — those can't be
  // read from the page's own HTML, unlike everything the checklist covers.
  const ai = llmSignals(llmScores, Boolean(target));
  const domainContext = ai.filter((s) => s.pillar === 'domain');
  const crawl = crawlabilitySignals({ isUrl, robotsTxt, llmsTxt });
  const visibility = buildVisibility(html, facts, crawl);

  // Desktop vs Mobile: a second, cheap visibility pass over the Googlebot
  // Smartphone fetch. Purely additional context for the "Can LLMs access
  // this page?" panel — never affects the score, which stays desktop-based.
  let mobileVisibility: typeof visibility | null = null;
  let parity: { same: boolean; note: string } | null = null;
  if (isUrl && mobileHtml) {
    const factsMobile = analyzeHtml(mobileHtml, { isUrl, host, brand, topic, category, robotsTxt, pageType: pageTypeChoice });
    mobileVisibility = buildVisibility(mobileHtml, factsMobile, crawl);
    const dW = facts.wordCount, mW = factsMobile.wordCount;
    const ratio = dW > 0 ? mW / dW : 1;
    parity = {
      same: dW === 0 || (ratio >= 0.75 && ratio <= 1.33),
      note: dW === 0 ? 'Could not compare desktop and mobile.' : (ratio < 0.75
        ? `Mobile is served ~${Math.round((1 - ratio) * 100)}% less content than desktop (${mW} vs ${dW} words). With mobile-first indexing, Google ranks the mobile version — so this content gap hurts.`
        : ratio > 1.33
          ? `Mobile is served more content than desktop (${mW} vs ${dW} words).`
          : `Mobile and desktop are served the same content (${mW} vs ${dW} words).`),
    };
  }

  // The checklist can (rarely) fail to run — an empty stand-in keeps the
  // report buildable rather than taking the whole audit down with it.
  const checklistForScoring: ChecklistResult = checklist || {
    kind: 'article', vertical: 'general', kindLabel: 'Page', verticalLabel: 'General',
    detection: { kind: { value: 'article', confidence: 'low', evidence: [] }, vertical: { value: 'general', confidence: 'low', evidence: [] } },
    items: [], score: 0, passed: 0, applicable: 0,
  };
  const report = buildReportFromChecklist(checklistForScoring, category, prompts, llmScores.summary, llmScores.engines, crawl, visibility, domainContext);

  const meta = {
    mode: isUrl ? 'url' : 'pasted', url: inputUrl || null, host: host || null, brand: brand || null,
    scoringVersion: SCORING_VERSION,
    category, categoryLabel: CATEGORY_LABEL[category], categoryWeights: CATEGORY_WEIGHTS[category],
    pageType: facts.pageType, pageTypeLabel: PAGE_TYPE_LABEL[facts.pageType],
    detectedPageType: facts.detectedPageType, pageTypeAuto: pageTypeChoice === 'auto',
    wordCount: facts.wordCount, schemaTypes: facts.schemaTypes,
    detectedIntent: llmScores.detectedIntent || null, suggestedCategory: llmScores.suggestedCategory || null,
    judge: judge || null,
    client: client ? { id: client.id, name: client.name, pageType: clientPageType ? { id: clientPageType.id, label: clientPageType.label } : null } : null,
    // Desktop-vs-mobile: null unless this was a live URL fetch (pasted HTML
    // has no separate mobile fetch to compare against).
    mobileVisibility, parity,
    // Static metadata for the on-demand per-engine check (calls /api/access-bot
    // directly from the client, one bot at a time — same endpoint the
    // standalone LLM Access Check tool uses) — only meaningful in URL mode.
    botTabs: isUrl ? [
      { id: 'gptbot', label: 'ChatGPT', sub: 'GPTBot' },
      { id: 'oai', label: 'ChatGPT Search', sub: 'OAI-SearchBot' },
      { id: 'perplexity', label: 'Perplexity', sub: 'PerplexityBot' },
      { id: 'claude', label: 'Claude', sub: 'ClaudeBot' },
      { id: 'bing', label: 'Copilot', sub: 'Bingbot' },
      { id: 'googlebot', label: 'Google AI', sub: 'Googlebot' },
    ] : [],
    // Auto-detected page kind + vertical, with the evidence behind each call so
    // the report can justify which checklist it used.
    checklist: checklist && {
      kind: checklist.kind, kindLabel: checklist.kindLabel,
      vertical: checklist.vertical, verticalLabel: checklist.verticalLabel,
      detection: checklist.detection,
      score: checklist.score, passed: checklist.passed, applicable: checklist.applicable,
      items: checklist.items,
    },
    // Fallback prompt set for Verify when the AI judge produced none (no key).
    fallbackPrompts: prompts.length ? [] : deterministicPrompts(facts, target, topic),
    fetchNote, aiError,
  };

  // Save to the user's history (best-effort — a save failure never blocks the
  // response; usage was already charged up front by consumeAccess above).
  let savedId: string | null = null;
  let history: Awaited<ReturnType<typeof auditHistoryByUrl>> = [];
  if (gateUser) {
    try { savedId = await saveAudit(gateUser.id, report, meta); } catch { /* ignore */ }
    // Fetched AFTER the save so this run's own score is the latest point —
    // the trend chart should always include "right now", not just past runs.
    if (isUrl && inputUrl) {
      try { history = await auditHistoryByUrl(gateUser.id, inputUrl, SCORING_VERSION); } catch { /* ignore */ }
    }
  }

  return json({ report, meta: { ...meta, savedId, history } });
};
