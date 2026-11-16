// llms-full.txt (https://llmstxt.org convention) — the entire blog corpus
// concatenated as plain markdown in one file, for an LLM/answer-engine
// crawler that wants everything in a single fetch instead of following
// every per-post link from llms.txt. Generated from the same content
// collection as llms.txt and the sitemap so it never drifts out of sync.
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { BRAND, SITE_URL } from '../lib/saas/plans';

export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf(),
  );

  const articles = posts.map((p) => `---

# ${p.data.title}

Source: ${SITE_URL}/blog/${p.slug}
Published: ${p.data.publishDate.toISOString().slice(0, 10)}

> ${p.data.description}

${p.body}`);

  const body = `# ${BRAND} — full article corpus

> Every published post on the ${BRAND} blog, concatenated as plain markdown. Practical, no-fluff guides on App Store Optimization, keyword research, and app ranking on Google Play and the App Store. See ${SITE_URL}/llms.txt for a linked index instead of this full text.

${articles.join('\n\n')}
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
