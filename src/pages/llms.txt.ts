// llms.txt (https://llmstxt.org) — a plain-markdown summary of the site aimed
// at LLM crawlers/answer engines, listing what AppRankr is and linking every
// blog post so it can be fetched and cited directly. Generated from the same
// content collection as the sitemap so it never drifts out of sync.
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

- Product: ${SITE_URL}/ — rank tracking and ASO audit dashboard, free 7-day trial.
- About: ${SITE_URL}/about

## Blog

Practical, no-fluff guides on App Store Optimization, keyword research, and app ranking on Google Play and the App Store.

${posts.map((p) => `- [${p.data.title}](${SITE_URL}/blog/${p.slug}): ${p.data.description}`).join('\n')}
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
