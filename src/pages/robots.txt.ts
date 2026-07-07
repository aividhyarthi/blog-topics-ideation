// Dynamic (not static /public) so the Sitemap: line always matches the real
// SITE_URL env var instead of a hardcoded placeholder domain. Deliberately
// allows everything, including AI crawlers (GPTBot, ClaudeBot, Google-Extended,
// PerplexityBot) — the blog's goal is AEO/LLM-citation visibility, not
// blocking them.
export const prerender = true;
import type { APIRoute } from 'astro';
import { SITE_URL } from '../lib/saas/plans';

export const GET: APIRoute = async () => {
  const body = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
