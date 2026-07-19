import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled, query } from '../../../lib/db';
import { isAdmin } from '../../../lib/billing';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Newsletter subscriber export. No ESP (Mailchimp/Resend/SendGrid) is wired up
// yet — this just gives the admin the list to import manually until one is.
export const GET: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);
  try {
    const { rows } = await query<{ email: string; created_at: string }>(
      'SELECT email, created_at FROM users WHERE newsletter_opt_in = true ORDER BY created_at DESC',
    );
    return json({ subscribers: rows.map((r) => ({ email: r.email, createdAt: r.created_at })) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Failed to load subscribers.' }, 500);
  }
};
