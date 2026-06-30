import type { APIRoute } from 'astro';

// Lightweight status probe so the UI can tell the user — at a glance — whether
// the server actually has the keys the AI scoring and live verification need.
// Returns ONLY booleans (presence), never key values.
const env = (k: string): string | undefined =>
  (process.env as any)[k] || (import.meta as any).env?.[k];

export const GET: APIRoute = async () => {
  const openai = Boolean(env('OPENAI_API_KEY'));
  const anthropic = Boolean(env('ANTHROPIC_API_KEY'));
  const perplexity = Boolean(env('PERPLEXITY_API_KEY'));
  return new Response(JSON.stringify({
    openai, anthropic, perplexity,
    judge: openai || anthropic,            // AI scoring + per-signal fixes
    verify: openai || perplexity,          // live-engine citation check (web search)
  }), { headers: { 'Content-Type': 'application/json' } });
};
