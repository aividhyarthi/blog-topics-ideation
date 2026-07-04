// Step 2 of Razorpay checkout: the modal's success handler posts the payment
// signature here; we verify it against our key secret and activate instantly.
// (Webhooks also confirm asynchronously — this endpoint just makes the UX
// immediate.)
import type { APIRoute } from 'astro';
import { paymentSignatureValid } from '../../../lib/saas/billing';
import { updateUserBilling } from '../../../lib/saas/db';
import { PLANS, type PlanId } from '../../../lib/saas/plans';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Not logged in.' }, 401);
  let body: { paymentId?: string; subscriptionId?: string; signature?: string; plan?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const plan = String(body.plan || '') as PlanId;
  if (!PLANS[plan]) return json({ error: 'Unknown plan.' }, 400);
  if (!paymentSignatureValid(String(body.paymentId || ''), String(body.subscriptionId || ''), String(body.signature || ''))) {
    return json({ error: 'Payment could not be verified. If you were charged, contact support — the webhook will still activate your account shortly.' }, 400);
  }

  updateUserBilling(user.id, { status: 'active', plan, subscriptionId: String(body.subscriptionId) });
  return json({ ok: true });
};
