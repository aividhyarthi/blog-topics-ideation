// Static marketing/product pages + blog topic pages. Split out from the
// blog post sitemap (sitemap-blog.xml.ts) so the two content types aren't
// mixed in one file — see sitemap.xml.ts, which is now an index pointing
// at this file, sitemap-blog.xml.ts, and news-sitemap.xml.ts.
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { topicSlug } from '../lib/blog/topics';
import { SITE_URL } from '../lib/saas/plans';

const STATIC_PATHS = ['/', '/blog', '/about', '/login', '/signup', '/rank', '/aso'];

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const topics = [...new Set(posts.map((post) => post.data.theme))];
  const urls = [
    ...STATIC_PATHS.map((p) => `${SITE_URL}${p}`),
    ...topics.map((theme) => `${SITE_URL}/blog/topic/${topicSlug(theme)}`),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
