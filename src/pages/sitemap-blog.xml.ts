// The full blog post archive — every post ever published, with lastmod.
// Separate from sitemap-pages.xml.ts (static/product pages) and from
// news-sitemap.xml.ts (only the last 2 days, for Google News specifically).
// See sitemap.xml.ts, the index that references all three.
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_URL } from '../lib/saas/plans';

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const urls = posts.map((post) => ({
    loc: `${SITE_URL}/blog/${post.slug}`,
    lastmod: post.data.publishDate.toISOString().slice(0, 10),
  }));

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
