import type { APIRoute } from 'astro';
import { dbEnabled } from '../../../lib/db';
import { createClaim } from '../../../lib/billing';
import { validEmail } from '../../../lib/auth';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Submit a UPI payment for manual verification (Stripe can't do recurring
// billing for Indian businesses, so Pro is activated via UPI + admin approval
// until Razorpay subscriptions are wired up).
export const POST: APIRoute = async ({ request }) => {
  if (!dbEnabled) return json({ error: 'Payments aren’t configured yet — contact us.' }, 503);
  let body: { email?: string; utr?: string; amount?: string; note?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const email = (body.email || '').trim().toLowerCase();
  const utr = (body.utr || '').trim();
  const amount = (body.amount || '').trim().slice(0, 40);
  const note = (body.note || '').trim().slice(0, 300);

  if (!validEmail(email)) return json({ error: 'Enter the email your CiteRank account uses.' }, 400);
  if (utr.length < 4) return json({ error: 'Enter the UPI transaction reference (UTR) from your payment.' }, 400);

  try {
    await createClaim(email, utr, amount, note);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not submit payment.' }, 500);
  }
};
