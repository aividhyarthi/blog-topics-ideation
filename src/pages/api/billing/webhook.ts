// Stripe webhook receiver. Configure the endpoint in the Stripe dashboard as
// POST {PUBLIC_URL}/api/billing/webhook with events:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted
// and put the signing secret in STRIPE_WEBHOOK_SECRET.
import type { APIRoute } from 'astro';
import { handleWebhook } from '../../../lib/saas/billing';

export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get('stripe-signature');
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Webhook not configured.', { status: 400 });
  }
  try {
    const summary = await handleWebhook(await request.text(), signature);
    console.log(`[stripe webhook] ${summary}`);
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    // Bad signature or malformed payload — reject so Stripe retries/flags it.
    return new Response(`Webhook error: ${e instanceof Error ? e.message : String(e)}`, { status: 400 });
  }
};
