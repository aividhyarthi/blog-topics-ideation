// Cancel the user's subscription at the end of the current billing cycle
// (Razorpay has no self-serve customer portal like Stripe's, so cancellation
// is a first-party endpoint). Status flips to 'canceled' when Razorpay sends
// the subscription.cancelled webhook at cycle end.
import type { APIRoute } from 'astro';
import { razorpayConfigured, cancelSubscription } from '../../../lib/saas/billing';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Not logged in.' }, 401);
  if (!razorpayConfigured()) return json({ error: 'Payments are not switched on yet.' }, 503);
  if (!user.subscriptionId) return json({ error: 'No active subscription to cancel.' }, 400);
  try {
    await cancelSubscription(user.subscriptionId);
    return json({ ok: true, message: 'Your subscription will end at the close of the current billing period. You keep full access until then.' });
  } catch (e) {
    return json({ error: `Could not cancel: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
};
