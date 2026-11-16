// llms.txt (https://llmstxt.org) — a plain-markdown summary of the site aimed
// at LLM crawlers/answer engines, listing what AppRankr is and linking every
// blog post (both its normal page and its raw-markdown sibling) so it can be
// fetched and cited directly. Generated from the same content collection as
// the sitemap so it never drifts out of sync.
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { BRAND, SITE_URL } from '../lib/saas/plans';

export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf(),
  );

  const body = `# ${BRAND}

> ${BRAND} is an app store optimization (ASO) tool: it tracks keyword rankings for apps on Google Play and the App Store, audits store listings, and monitors ratings/reviews — helping app teams see what's moving their rank and what to fix.

Website: ${SITE_URL}/
Publisher: ${BRAND}

## Important pages

- [Product: Rank Tracker](${SITE_URL}/rank) — keyword rank tracking and ASO audit dashboard, free 7-day trial.
- [Product: ASO Inspector](${SITE_URL}/aso) — Google Play listing score, keyword, and competitor audit.
- [About](${SITE_URL}/about)
- [All articles](${SITE_URL}/blog)
- [Full article corpus](${SITE_URL}/llms-full.txt) — every post below, concatenated as plain markdown in one file.
- [RSS feed](${SITE_URL}/rss.xml)

## Blog

Practical, no-fluff guides on App Store Optimization, keyword research, and app ranking on Google Play and the App Store. Each entry links the normal page and its raw-markdown version.

${posts.map((p) => `- [${p.data.title}](${SITE_URL}/blog/${p.slug}) | [Markdown](${SITE_URL}/blog/${p.slug}.md) | ${p.data.publishDate.toISOString().slice(0, 10)}: ${p.data.description}`).join('\n')}
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
