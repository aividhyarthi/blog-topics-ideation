import type { APIRoute } from 'astro';
import { siteOrigin } from '../lib/mail';

// We sell crawler access as a discipline, so ours is explicit rather than
// implied: every answer-engine crawler is named and allowed on the public
// content, and the private/metered surfaces are named and disallowed.
export const GET: APIRoute = ({ request }) => {
  const origin = siteOrigin(request);
  const body = `# AI Page Audit
# AI answer engines are explicitly welcome on our public content.

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /dashboard
Disallow: /check
Disallow: /audit
Disallow: /setup
Disallow: /reset

Sitemap: ${origin}/sitemap.xml
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
