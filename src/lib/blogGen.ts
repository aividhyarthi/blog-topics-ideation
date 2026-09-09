// Drafts a full blog post from a sourced topic using Claude. Runs fully
// automatically (no human review step, per explicit product decision) — so
// the prompt below carries the actual quality bar: no fabricated stats, no
// invented quotes, real internal links, the site's existing voice. This is
// the only real check standing between a Reddit thread and a live page.
import Anthropic from '@anthropic-ai/sdk';
import type { TopicCandidate } from './blogSources';
import type { ChartSpec, NewPostInput } from './blogPosts';

const MODEL = process.env.BLOG_GEN_MODEL || (import.meta as any).env?.BLOG_GEN_MODEL || 'claude-sonnet-5';

function apiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || (import.meta as any).env?.ANTHROPIC_API_KEY || null;
}

export interface LinkTarget { slug: string; title: string }

function buildPrompt(topic: TopicCandidate, links: LinkTarget[]): string {
  const linkList = links.map((l) => `- [${l.title}](/blog/${l.slug})`).join('\n') || '(none yet)';
  return `You are writing one blog post for AI Page Audit (aipageaudit.com), a tool that fetches web pages as ChatGPT/Perplexity/Claude/Googlebot see them and scores them for AEO (Answer Engine Optimization) — how well a page can be read, extracted and cited by AI answer engines.

SOURCE MATERIAL for this post (a real, current item — ground the post in it honestly, don't fabricate details beyond what's given):
Title: ${topic.title}
From: ${topic.label}
URL: ${topic.url}
Summary/excerpt: ${topic.summary || '(no excerpt available, write from the title and general AEO knowledge, staying honest about what you do and do not know)'}

TASK: Write a practical, specific AEO/GEO blog post (900-1300 words) that uses this source as a genuine hook — what happened, why an AEO-minded reader should care, and what to actually do about it. This is NOT a press-release rewrite; add real analysis and actionable guidance.

STRICT RULES:
1. No em dashes anywhere (title, description, body). Use commas, periods, or parentheses instead.
2. Never invent a statistic, market-size number, or specific percentage you cannot support from the source material or well-established, non-numeric facts about how AI crawlers work (e.g. "GPTBot doesn't render JavaScript" is fine and well documented; "73% of sites are affected" with no source is not).
3. Never invent a quote or attribute words to a real person/company that aren't in the source material.
4. Open with a "quick answer" callout: the very first line of bodyMarkdown must be exactly one line of raw HTML: <div class="callout"><span class="callout-label">Quick answer</span><p>...</p></div> — a 2-4 sentence direct answer to what this post is about.
5. Use ## and ### headings, at least one markdown table if there's anything comparable to show, and short paragraphs.
6. Weave 2-4 internal links naturally INTO sentences (not just a trailing "see also" line). Link to /audit, /check, or /checklist where genuinely relevant, and to 1-2 of these existing posts where topically relevant:
${linkList}
Use real markdown links like [free LLM Access Check](/check). Do not link to a post from the list above if it isn't actually relevant.
7. Optionally include 0-2 charts to illustrate a real comparison the post makes (e.g. "checks a page might pass before vs after a fix", or a 0-100 style gauge for one score-like idea). If you include a chart, put a line containing exactly [[chart:0]] (or [[chart:1]]) on its own line in bodyMarkdown at the point it should appear, and describe it fully in the "charts" JSON field. Chart values must be illustrative/qualitative examples the post's own reasoning supports, never a precise real-world statistic you're inventing. Most posts don't need a chart — only include one if it truly clarifies something.
8. End with 2-3 FAQ entries as JSON, not inside bodyMarkdown (the page template renders them separately).
9. Tone: direct, specific, a little conversational, like an experienced practitioner explaining something to a peer. No corporate fluff, no "in today's fast-paced digital landscape."

Respond with ONLY a single JSON object (no markdown code fence, no commentary before or after), matching exactly this shape:
{
  "title": "string, specific and under 70 characters",
  "description": "string, 1-2 sentences, under 160 characters, for the meta description",
  "tags": ["1 to 3 short tags like AEO, News, Guide"],
  "bodyMarkdown": "the full post body as described above, starting with the callout div",
  "faqs": [{"q": "string", "a": "string"}],
  "charts": [{"type": "bar", "title": "string", "unit": "optional string like %", "caption": "string starting with the word Illustrative", "items": [{"label": "string", "value": 0}]}]
}`;
}

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1] : trimmed;
}

export async function generatePostFromTopic(topic: TopicCandidate, links: LinkTarget[]): Promise<NewPostInput> {
  const key = apiKey();
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: buildPrompt(topic, links) }],
  });
  const text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch (err) {
    throw new Error(`Claude did not return valid JSON: ${(err as Error).message}`);
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
