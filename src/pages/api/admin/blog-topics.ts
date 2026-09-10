import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';
import { isAdmin } from '../../../lib/billing';
import { fetchAllTopicCandidates } from '../../../lib/blogSources';
import { sourceUrlUsed } from '../../../lib/blogPosts';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Sourcing only — no AI call, no cost. Lets an admin see the real, current
// candidate topics (Reddit r/AEO + provider news) the automated pipeline
// would draft from, so they can be handed to a person (or Claude Code in a
// session) to write manually via /api/admin/publish-post instead of waiting
// on an AI provider key.
export const GET: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);

  const candidates = await fetchAllTopicCandidates();
  const withUsage = await Promise.all(
    candidates.map(async (c) => ({ ...c, alreadyUsed: c.url ? await sourceUrlUsed(c.url) : false })),
  );
  return json({ candidates: withUsage });
};
