// Google News sitemap (https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap).
// Per Google's spec this must only list articles from the last 2 days —
// older entries should drop out on their own as new posts replace them,
// never accumulate. Caveat: this route is prerendered at build time like
// the rest of the site's XML/txt endpoints, so "last 2 days" is relative to
// the most recent deploy, not the live clock — fine given how often this
// site redeploys, but worth knowing if a gap between deploys ever grows.
//
// news:name must match the publication name exactly as registered in
// Google Publisher Center/News — this blog isn't currently enrolled there,
// so this sitemap is inert (harmless, but has no effect) until that signup
// happens. See the commit message for the open question to the user.
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { BRAND, SITE_URL } from '../lib/saas/plans';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export const GET: APIRoute = async () => {
  const cutoff = Date.now() - TWO_DAYS_MS;
  const posts = (await getCollection('blog')).filter((p) => p.data.publishDate.getTime() >= cutoff);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${posts.map((p) => `  <url>
    <loc>${SITE_URL}/blog/${p.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>${BRAND}</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${p.data.publishDate.toISOString()}</news:publication_date>
      <news:title>${p.data.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</news:title>
    </news:news>
  </url>`).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
