import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';
import { isAdmin } from '../../../lib/billing';
import { runBlogGenCycle } from '../../../lib/blogPipeline';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Manual trigger for the auto-publish pipeline (see blogScheduler.ts for the
// automatic 5x/day schedule). Lets an admin fire one cycle on demand — to
// verify the pipeline works, or to publish a post right now instead of
// waiting for the next scheduled slot.
export const POST: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);
  const result = await runBlogGenCycle();
  return json(result, result.status === 'error' ? 500 : 200);
};
