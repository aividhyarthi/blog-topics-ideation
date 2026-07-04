// Razorpay webhook receiver. Configure in the Razorpay dashboard as
// POST {your-domain}/api/billing/webhook with the subscription events
// (activated, charged, halted, pending, cancelled, completed, expired,
// resumed) and put the same secret in RAZORPAY_WEBHOOK_SECRET.
import type { APIRoute } from 'astro';
import { webhookSignatureValid, applyWebhookEvent } from '../../../lib/saas/billing';

export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get('x-razorpay-signature') || '';
  const raw = await request.text();
  if (!webhookSignatureValid(raw, signature)) {
    return new Response('Bad signature.', { status: 400 });
  }
  let event: Record<string, any>;
  try { event = JSON.parse(raw); } catch { return new Response('Bad payload.', { status: 400 }); }
  const summary = applyWebhookEvent(event);
  console.log(`[razorpay webhook] ${summary}`);
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
