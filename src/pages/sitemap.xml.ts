// Minimal hand-rolled sitemap (no @astrojs/sitemap dependency) — the site is
// small enough that listing the public marketing/blog pages plus the blog
// collection by hand is simpler than wiring up the integration.
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_URL } from '../lib/saas/plans';

const STATIC_PATHS = ['/', '/blog', '/about', '/login', '/signup'];

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const urls = [
    ...STATIC_PATHS.map((p) => ({ loc: `${SITE_URL}${p}`, lastmod: undefined as string | undefined })),
    ...posts.map((post) => ({
      loc: `${SITE_URL}/blog/${post.slug}`,
      lastmod: post.data.publishDate.toISOString().slice(0, 10),
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}\n  </url>`).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
