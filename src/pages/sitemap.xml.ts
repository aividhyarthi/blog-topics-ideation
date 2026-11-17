// Sitemap index — points at the three sub-sitemaps instead of listing URLs
// directly, so pages, the full blog archive, and the Google-News-specific
// recent-articles feed are kept in separate files rather than one mixed
// list. See sitemap-pages.xml.ts, sitemap-blog.xml.ts, news-sitemap.xml.ts.
export const prerender = true;
import type { APIRoute } from 'astro';
import { SITE_URL } from '../lib/saas/plans';

export const GET: APIRoute = async () => {
  const sitemaps = ['sitemap-pages.xml', 'sitemap-blog.xml', 'news-sitemap.xml'];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map((s) => `  <sitemap>\n    <loc>${SITE_URL}/${s}</loc>\n  </sitemap>`).join('\n')}
</sitemapindex>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
