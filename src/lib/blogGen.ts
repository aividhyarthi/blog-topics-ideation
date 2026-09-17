// Drafts a full blog post from a sourced topic using Claude. Runs fully
// automatically (no human review step, per explicit product decision) — so
// the prompt below carries the actual quality bar: no fabricated stats, no
// invented quotes, real internal links, the site's existing voice, and
// enough visual structure (a takeaways box, a chart) that a post doesn't
// read as one long wall of text.
import Anthropic from '@anthropic-ai/sdk';
import type { TopicCandidate } from './blogSources';
import type { ChartSpec, NewPostInput } from './blogPosts';

const ANTHROPIC_MODEL = process.env.BLOG_GEN_MODEL || (import.meta as any).env?.BLOG_GEN_MODEL || 'claude-sonnet-5';
const OPENAI_MODEL = process.env.BLOG_GEN_OPENAI_MODEL || (import.meta as any).env?.BLOG_GEN_OPENAI_MODEL || 'gpt-4o';

function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || (import.meta as any).env?.ANTHROPIC_API_KEY || null;
}
function openaiKey(): string | null {
  return process.env.OPENAI_API_KEY || (import.meta as any).env?.OPENAI_API_KEY || null;
}

export interface LinkTarget { slug: string; title: string }

function buildPrompt(topic: TopicCandidate, links: LinkTarget[]): string {
  const linkList = links.map((l) => `- [${l.title}](/blog/${l.slug})`).join('\n') || '(none yet)';
  return `You are writing one blog post for AI Page Audit (aipageaudit.com), a tool that fetches web pages as ChatGPT/Perplexity/Claude/Googlebot see them and scores them for AEO and GEO (Answer Engine Optimization and Generative Engine Optimization) — how well a page can be read, extracted and cited by AI answer engines.

SOURCE MATERIAL for this post (a real, current item — ground the post in it honestly, don't fabricate details beyond what's given):
Title: ${topic.title}
From: ${topic.label}
URL: ${topic.url}
Summary/excerpt: ${topic.summary || '(no excerpt available, write from the title and general AEO/GEO knowledge, staying honest about what you do and do not know)'}

TASK: Write a practical, specific AEO/GEO blog post (900-1300 words) that uses this source as a genuine hook — what happened, why an AEO-minded reader should care, and what to actually do about it. This is NOT a press-release rewrite; add real analysis and actionable guidance.

STRICT RULES:
1. No em dashes anywhere (title, description, body). Use commas, periods, or parentheses instead.
2. Never invent a statistic, market-size number, or specific percentage you cannot support from the source material or well-established, non-numeric facts about how AI crawlers work (e.g. "GPTBot doesn't render JavaScript" is fine and well documented; "73% of sites are affected" with no source is not).
3. Never invent a quote or attribute words to a real person/company that aren't in the source material.
4. Open with a "quick answer" callout: the very first line of bodyMarkdown must be exactly one line of raw HTML: <div class="callout"><span class="callout-label">Quick answer</span><p>...</p></div> — a 2-4 sentence direct answer to what this post is about.
5. VISUAL STRUCTURE IS MANDATORY, not optional — a post that is only headings and paragraphs will be rejected:
   a. After the intro (before the first ## section), include a second, different box: <div class="takeaways"><span class="callout-label">Key takeaways</span><ul><li>...</li><li>...</li><li>...</li></ul></div> with 3-5 short, concrete bullet points a reader could scan without reading the rest.
   b. Include exactly one chart. Put a line containing exactly [[chart:0]] on its own line at the point it should appear, and describe it fully in the "charts" JSON field (see below). The chart must visualize the post's own reasoning (e.g. "checks passed before vs after a fix", a 0-100 gauge for one score-like idea, a before/after comparison), never a precise real-world statistic you're inventing.
   c. Include at least one markdown blockquote (> ...) pulling out the single most important sentence in the post as a standalone pull-quote, verbatim from your own body text.
   d. Use ## and ### headings, and at least one markdown table if there's anything comparable to show.
6. Weave 2-4 internal links naturally INTO sentences (not just a trailing "see also" line). Link to /audit, /check, or /checklist where genuinely relevant, and to 1-2 of these existing posts where topically relevant:
${linkList}
Use real markdown links like [free LLM Access Check](/check). Do not link to a post from the list above if it isn't actually relevant.
7. End with 2-3 FAQ entries as JSON, not inside bodyMarkdown (the page template renders them separately).
8. Tone: direct, specific, a little conversational, like an experienced practitioner explaining something to a peer. No corporate fluff, no "in today's fast-paced digital landscape."

Respond with ONLY a single JSON object (no markdown code fence, no commentary before or after), matching exactly this shape:
{
  "title": "string, specific and under 70 characters",
  "description": "string, 1-2 sentences, under 160 characters, for the meta description",
  "tags": ["1 to 3 short tags — use AEO and/or GEO plus one of Basics, Guide, Comparison, Technical, News as fits"],
  "bodyMarkdown": "the full post body as described above, starting with the callout div, including the takeaways div, the [[chart:0]] marker, and at least one blockquote",
  "faqs": [{"q": "string", "a": "string"}],
  "charts": [{"type": "bar", "title": "string", "unit": "optional string like %", "caption": "string starting with the word Illustrative", "items": [{"label": "string", "value": 0}]}]
}`;
}

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1] : trimmed;
}

async function draftWithAnthropic(prompt: string, key: string): Promise<string> {
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
}

async function draftWithOpenAI(prompt: string, key: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_MODEL, response_format: { type: 'json_object' }, temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 240)}`);
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

export async function generatePostFromTopic(topic: TopicCandidate, links: LinkTarget[]): Promise<NewPostInput> {
  const aKey = anthropicKey();
  const oKey = openaiKey();
  if (!aKey && !oKey) throw new Error('No AI key configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY');
  const prompt = buildPrompt(topic, links);

  // Same provider order as the main audit tool's AI judge (aeo-audit.ts):
  // whichever key is present tries first, the other is the fallback — so
  // one provider being out of credit (or down) doesn't stop the pipeline.
  const providers: Array<[string, () => Promise<string>]> = [];
  if (aKey) providers.push(['Claude', () => draftWithAnthropic(prompt, aKey)]);
  if (oKey) providers.push(['OpenAI', () => draftWithOpenAI(prompt, oKey)]);

  let text = '';
  let lastErr = '';
  for (const [name, run] of providers) {
    try { text = await run(); lastErr = ''; break; }
    catch (err) { lastErr = `${name}: ${err instanceof Error ? err.message : String(err)}`; }
  }
  if (lastErr) throw new Error(lastErr);

  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch (err) {
    throw new Error(`Model did not return valid JSON: ${(err as Error).message}`);
  }
  if (!parsed.title || !parsed.bodyMarkdown) throw new Error('Generated post is missing title or bodyMarkdown');

  const tags: string[] = Array.isArray(parsed.tags) && parsed.tags.length ? parsed.tags.slice(0, 3) : ['AEO'];
  const faqs = Array.isArray(parsed.faqs) ? parsed.faqs.filter((f: any) => f?.q && f?.a).slice(0, 4) : [];
  const charts: ChartSpec[] = Array.isArray(parsed.charts)
    ? parsed.charts
        .filter((c: any) => c?.title && Array.isArray(c.items) && c.items.length)
        .slice(0, 2)
        .map((c: any) => ({
          type: c.type === 'gauge' ? 'gauge' : 'bar',
          title: String(c.title),
          unit: c.unit ? String(c.unit) : undefined,
          caption: c.caption ? String(c.caption) : 'Illustrative, based on this post’s own reasoning.',
          items: c.items.slice(0, 6).map((it: any) => ({ label: String(it.label), value: Number(it.value) || 0 })),
        }))
    : [];

  return {
    title: String(parsed.title).slice(0, 120),
    description: String(parsed.description || '').slice(0, 200) || String(parsed.title),
    bodyMarkdown: String(parsed.bodyMarkdown),
    tags,
    faqs,
    charts,
    sourceUrl: topic.url,
    sourceLabel: topic.label,
  };
}
