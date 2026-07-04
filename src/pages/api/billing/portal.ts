import type { APIRoute } from 'astro';
import { stripeConfigured, createPortalUrl } from '../../../lib/saas/billing';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Not logged in.' }, 401);
  if (!stripeConfigured()) return json({ error: 'Payments are not switched on yet.' }, 503);
  try {
    const url = await createPortalUrl(user);
    if (!url) return json({ error: 'No billing profile yet — subscribe to a plan first.' }, 400);
    return json({ ok: true, url });
  } catch (e) {
    return json({ error: `Could not open the billing portal: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
};
