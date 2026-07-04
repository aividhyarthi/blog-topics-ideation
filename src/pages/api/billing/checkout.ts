// Step 1 of Razorpay checkout: create the subscription server-side and hand
// the browser what it needs to open the Razorpay Checkout modal.
import type { APIRoute } from 'astro';
import { razorpayConfigured, razorpayKeyId, createSubscription } from '../../../lib/saas/billing';
import { PLANS, BRAND, type PlanId } from '../../../lib/saas/plans';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Not logged in.' }, 401);
  if (!razorpayConfigured()) {
    return json({ error: 'Payments are not switched on yet — checkout will be available shortly. Your account and data are safe.' }, 503);
  }
  let body: { plan?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const plan = String(body.plan || '') as PlanId;
  if (!PLANS[plan]) return json({ error: 'Unknown plan.' }, 400);
  try {
    const { subscriptionId } = await createSubscription(user, plan);
    return json({
      ok: true,
      subscriptionId,
      keyId: razorpayKeyId(),
      plan,
      brand: BRAND,
      planName: `${PLANS[plan].name} — ₹${PLANS[plan].priceMonthly.toLocaleString('en-IN')}/month`,
      prefill: { email: user.email, name: user.name },
    });
  } catch (e) {
    return json({ error: `Could not start checkout: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
};
