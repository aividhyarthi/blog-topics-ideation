import type { APIRoute } from 'astro';
import { siteOrigin } from '../lib/mail';
import { listPublishedPosts } from '../lib/blogPosts';

// Public, indexable routes only — gated tool surfaces and the admin area are
// deliberately absent (they're also disallowed in robots.txt).
const ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/pricing', priority: '0.9', changefreq: 'monthly' },
  { path: '/checklist', priority: '0.9', changefreq: 'monthly' },
  { path: '/glossary', priority: '0.8', changefreq: 'monthly' },
  { path: '/blog', priority: '0.8', changefreq: 'weekly' },
  { path: '/about', priority: '0.5', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/refunds', priority: '0.3', changefreq: 'yearly' },
];

export const GET: APIRoute = async ({ request }) => {
  const origin = siteOrigin(request);
  const today = new Date().toISOString().slice(0, 10);

  const posts = await listPublishedPosts().catch(() => []);
  const postUrls = posts.map((p) => {
    const lastmod = new Date(p.publishDate).toISOString().slice(0, 10);
    return `  <url>
    <loc>${origin}/blog/${p.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  const urls = [
    ...ROUTES.map(
      (r) => `  <url>
    <loc>${origin}${r.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
    ),
    ...postUrls,
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
