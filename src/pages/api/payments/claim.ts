import type { APIRoute } from 'astro';
import { dbEnabled } from '../../../lib/db';
import { createClaim, CREDIT_PACKS } from '../../../lib/billing';
import { validEmail } from '../../../lib/auth';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Submit a UPI payment for manual verification (Stripe can't do recurring
// billing for Indian businesses, so Pro/credits are activated via UPI + admin
// approval until Razorpay is wired up). `pack` selects a one-time credit pack;
// omit it for a monthly-subscription payment.
export const POST: APIRoute = async ({ request }) => {
  if (!dbEnabled) return json({ error: 'Payments aren’t configured yet — contact us.' }, 503);
  let body: { email?: string; utr?: string; amount?: string; note?: string; pack?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const email = (body.email || '').trim().toLowerCase();
  const utr = (body.utr || '').trim();
  const amount = (body.amount || '').trim().slice(0, 40);
  const note = (body.note || '').trim().slice(0, 300);
  const pack = CREDIT_PACKS.find((p) => p.id === body.pack);

  if (!validEmail(email)) return json({ error: 'Enter the email your AI Page Audit account uses.' }, 400);
  if (utr.length < 4) return json({ error: 'Enter the UPI transaction reference (UTR) from your payment.' }, 400);

  try {
    if (pack) await createClaim(email, utr, amount, note, 'credits', pack.checks);
    else await createClaim(email, utr, amount, note, 'subscription');
    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not submit payment.';
    // A re-submitted UTR is the customer's mistake to correct, not a server
    // fault — 409 so the UI can show it as a normal message.
    const status = /already been submitted/i.test(msg) ? 409 : 500;
    return json({ error: msg }, status);
  }
};
