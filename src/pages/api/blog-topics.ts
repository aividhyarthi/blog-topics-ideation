import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// ---- helpers ----------------------------------------------------------------

// Escape unescaped control characters inside JSON string values only, so a
// slightly-malformed model response can still be parsed.
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

// Split a textarea blob into clean, de-duplicated lines.
function toLines(blob: string | undefined): string[] {
  if (!blob) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of blob.split(/[\n,]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function pickMeta(html: string, name: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]).trim();
  }
  return '';
}

// Best-effort: fetch a URL with a browser-like UA and pull out the readable
// signal (title, meta, headings, and a chunk of visible text). Nykaa is
// JS-heavy and may block or under-serve bots — we degrade gracefully.
async function crawl(url: string): Promise<{ url: string; ok: boolean; title: string; description: string; text: string; note?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { url, ok: false, title: '', description: '', text: '', note: `HTTP ${res.status}` };
    }
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
    const description = pickMeta(html, 'description') || pickMeta(html, 'og:description');

    // Collect heading text — usually rich product/category signal.
    const headings: string[] = [];
    for (const m of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
      const t = decodeEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (t) headings.push(t);
    }

    // Strip scripts/styles, drop tags, collapse whitespace for body text.
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
    const text = decodeEntities(body).replace(/\s+/g, ' ').trim();

    const combined = [headings.join(' | '), text].filter(Boolean).join(' — ').slice(0, 3500);
    const ok = Boolean(title || description || combined.length > 120);
    return {
      url,
      ok,
      title,
      description,
      text: combined,
      note: ok ? undefined : 'Page returned little readable content (likely JS-rendered or bot-blocked).',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { url, ok: false, title: '', description: '', text: '', note: `Fetch failed: ${msg}` };
  }
}

// ---- route ------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  let body: { urls?: string; keywords?: string; prompts?: string; brand?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  // Prefer a server-side env var; otherwise fall back to a key supplied from
  // the UI (stored only in the user's browser). This lets the tool work with
  // zero Railway configuration.
  const apiKey =
    process.env.ANTHROPIC_API_KEY ||
    import.meta.env.ANTHROPIC_API_KEY ||
    (body.apiKey && body.apiKey.trim());
  if (!apiKey) {
    return json({ error: 'No Anthropic API key found. Add one in the "API key" box at the top of the tool (or set ANTHROPIC_API_KEY in Railway).' }, 400);
  }

  const brand = (body.brand && body.brand.trim()) || 'Nykaa';
  const urls = toLines(body.urls).filter((u) => /^https?:\/\//i.test(u)).slice(0, 25);
  const keywords = toLines(body.keywords).slice(0, 200);
  const prompts = toLines(body.prompts).slice(0, 200);

  if (urls.length === 0 && keywords.length === 0 && prompts.length === 0) {
    return json({ error: 'Add at least one URL, keyword, or SEMrush prompt to get started.' }, 400);
  }

  // Crawl all URLs in parallel (best-effort).
  const crawled = urls.length ? await Promise.all(urls.map(crawl)) : [];
  const crawlSummary = crawled.map((c) => ({ url: c.url, ok: c.ok, note: c.note }));

  const pageBlock = crawled.length
    ? crawled
        .map((c, i) => {
          const head = `[PAGE ${i + 1}] ${c.url}`;
          if (!c.ok) return `${head}\n(Could not read this page: ${c.note || 'no content'}. Infer intent from the URL slug.)`;
          return [
            head,
            c.title ? `Title: ${c.title}` : '',
            c.description ? `Meta: ${c.description}` : '',
            c.text ? `Content/Reviews snippet: ${c.text}` : '',
          ].filter(Boolean).join('\n');
        })
        .join('\n\n')
    : '(No URLs provided.)';

  const keywordBlock = keywords.length ? keywords.map((k) => `- ${k}`).join('\n') : '(None provided.)';
  const promptBlock = prompts.length ? prompts.map((p) => `- ${p}`).join('\n') : '(None provided.)';

  const prompt = `You are a senior content strategist specialising in Answer Engine Optimization (AEO) and getting brand content cited inside LLM answers (ChatGPT, Gemini, Perplexity, Google AI Overviews).

Your client is the beauty & personal-care e-commerce brand "${brand}". The goal is to plan BLOG TOPICS so that when a shopper asks an AI assistant (or an answer engine) a related question, the ${brand} blog is the source that gets surfaced and cited.

You are given three kinds of input:

=== 1) CRAWLED PAGES (category & product pages we publish content around) ===
${pageBlock}

=== 2) SEED KEYWORDS (from SEMrush etc.) ===
${keywordBlock}

=== 3) SEMrush / LLM PROMPTS & QUESTIONS to target ===
${promptBlock}

━━━ HOW TO THINK ━━━
- Treat each page's content and review signals as the product/category truth. Map topics to real shopper intent — concerns, comparisons, how-to, ingredient questions, "best X for Y", routines, dupes, occasions.
- AEO wins on questions, not just keywords. For every topic, define the exact natural-language question a user would type/speak into an LLM that this blog should answer directly and concisely.
- Prefer topics with clear, answerable intent that an LLM can quote (definitions, steps, comparisons, recommendations) and that naturally lead to a ${brand} product or category.
- Cover a spread of clusters across the inputs — do not produce 15 variations of one topic.
- Titles must sound human and specific, NOT like AI filler. Never use: "Unlock the secrets", "Ultimate guide", "Dive into", "Game-changing", "Everything you need to know", "In today's world".

━━━ OUTPUT ━━━
Return ONLY valid JSON, no markdown, no commentary, in EXACTLY this shape:
{
  "topics": [
    {
      "category": "Topic cluster / Nykaa category, e.g. 'Skincare > Sunscreen'",
      "blogTitle": "Specific, human, click-worthy blog headline (under ~70 chars)",
      "focusKeyword": "Primary SEO keyword for this blog",
      "targetPrompt": "The exact natural-language question/prompt a user would ask an LLM that this blog should be the cited answer for",
      "searchIntent": "informational | commercial | comparison | transactional | how-to (pick the best single fit)",
      "whyRanks": "1-2 sentences: why this topic is likely to be surfaced/cited in LLM & AEO answers, and how it ties back to a ${brand} page"
    }
  ]
}

Rules:
- Produce 15 to 20 topics.
- Every field must be filled (no empty strings, no nulls).
- targetPrompt must be phrased as a real question/voice query, not a keyword.
- Ground topics in the provided pages, keywords, and prompts — do not invent unrelated categories.`;

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return json({ error: 'AI returned an unexpected format. Please try again.' }, 500);
    }

    let parsed: { topics?: unknown };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = JSON.parse(repairJson(jsonMatch[0]));
    }

    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    if (topics.length === 0) {
      return json({ error: 'No topics were generated. Try adding more specific inputs.' }, 500);
    }

    return json({
      brand,
      topics,
      meta: {
        urlsCrawled: crawlSummary,
        keywordCount: keywords.length,
        promptCount: prompts.length,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `AI generation failed: ${msg}` }, 500);
  }
};
