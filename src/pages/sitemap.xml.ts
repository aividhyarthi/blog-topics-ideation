import type { APIRoute } from 'astro';
import { siteOrigin } from '../lib/mail';

// Public, indexable routes only — gated tool surfaces and the admin area are
// deliberately absent (they're also disallowed in robots.txt).
const ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/audit', priority: '0.9', changefreq: 'weekly' },
  { path: '/pricing', priority: '0.9', changefreq: 'monthly' },
  { path: '/glossary', priority: '0.8', changefreq: 'monthly' },
  { path: '/news', priority: '0.8', changefreq: 'weekly' },
  { path: '/blog', priority: '0.8', changefreq: 'weekly' },
  { path: '/blog/what-is-aeo', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/geo-vs-seo', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/js-rendering-blind-spot', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog/hidden-reviews-problem', priority: '0.7', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/refunds', priority: '0.3', changefreq: 'yearly' },
];

export const GET: APIRoute = ({ request }) => {
  const origin = siteOrigin(request);
  const today = new Date().toISOString().slice(0, 10);

  const urls = ROUTES.map(
    (r) => `  <url>
    <loc>${origin}${r.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
