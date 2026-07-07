import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';

const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });

// Tells the client whether accounts are available and who is logged in.
export const GET: APIRoute = async (ctx) => {
  const user = await getUser(ctx);
  return json({ accountsEnabled: dbEnabled, user: user ? { email: user.email } : null });
};
