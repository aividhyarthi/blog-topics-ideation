import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';
import { usageStatus, PLAN_LIMITS } from '../../../lib/billing';

const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });

// Current user's plan + monthly usage, for the account/usage UI.
export const GET: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ signedIn: false });
  const user = await getUser(ctx);
  if (!user) return json({ signedIn: false });
  try {
    const status = await usageStatus(user.id);
    return json({ signedIn: true, email: user.email, ...status, limits: PLAN_LIMITS });
  } catch (e) {
    return json({ signedIn: true, email: user.email, error: e instanceof Error ? e.message : 'Could not load usage.' });
  }
};
