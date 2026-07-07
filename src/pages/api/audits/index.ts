import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { listAudits } from '../../../lib/audits';
import { dbEnabled } from '../../../lib/db';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Recent saved audits for the logged-in user.
export const GET: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ audits: [] });
  const user = await getUser(ctx);
  if (!user) return json({ error: 'Not signed in.' }, 401);
  try {
    return json({ audits: await listAudits(user.id) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not load audits.' }, 500);
  }
};
