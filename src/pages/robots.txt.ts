// Dynamic (not static /public) so the Sitemap: line always matches the real
// SITE_URL env var instead of a hardcoded placeholder domain. Deliberately
// allows everything, listing search engines and AI/answer-engine crawlers by
// name — the blog's goal is AEO/LLM-citation visibility, not blocking them.
export const prerender = true;
import type { APIRoute } from 'astro';
import { SITE_URL } from '../lib/saas/plans';

export const GET: APIRoute = async () => {
  const body = `# Everyone is welcome: search engines, AI assistants and AI search.
User-agent: *
Allow: /

# Search engines
User-agent: Googlebot
User-agent: Googlebot-Image
User-agent: Bingbot
User-agent: DuckDuckBot
User-agent: Applebot
User-agent: YandexBot
User-agent: Baiduspider
Allow: /

# AI assistants, AI search and AI answer-engine crawlers
User-agent: Google-Extended
User-agent: GoogleOther
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: anthropic-ai
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Applebot-Extended
User-agent: Meta-ExternalAgent
User-agent: Amazonbot
User-agent: CCBot
User-agent: cohere-ai
User-agent: DuckAssistBot
User-agent: MistralAI-User
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
