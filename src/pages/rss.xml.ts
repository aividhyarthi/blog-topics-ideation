// Standard RSS 2.0 feed of the blog — another discovery surface feed readers
// and AI/answer-engine crawlers use alongside llms.txt and the sitemap.
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { BRAND, SITE_URL } from '../lib/saas/plans';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf(),
  );

  const items = posts.map((p) => {
    const url = `${SITE_URL}/blog/${p.slug}`;
    return `  <item>
    <title>${escapeXml(p.data.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <description>${escapeXml(p.data.description)}</description>
    <category>${escapeXml(p.data.theme)}</category>
    <pubDate>${p.data.publishDate.toUTCString()}</pubDate>
  </item>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(BRAND)} Blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Practical, no-fluff guides on App Store Optimization, keyword research, and app ranking on Google Play and the App Store.</description>
    <language>en</language>
${items.join('\n')}
  </channel>
</rss>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
