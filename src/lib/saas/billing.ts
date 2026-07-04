// AppRankr billing — Razorpay Subscriptions (India-first: INR, UPI, cards).
// Plain REST via fetch, no SDK dependency. Everything degrades gracefully when
// Razorpay isn't configured yet (env unset): trials still work and the account
// page says checkout isn't live. Required env once ready:
//   RAZORPAY_KEY_ID          rzp_live_... (or rzp_test_...)
//   RAZORPAY_KEY_SECRET      the matching secret
//   RAZORPAY_PLAN_STARTER    plan id (plan_...) of the ₹2,499/mo subscription
//   RAZORPAY_PLAN_PRO        plan id (plan_...) of the ₹6,499/mo subscription
//   RAZORPAY_WEBHOOK_SECRET  secret set on the webhook (POST /api/billing/webhook)
//
// Flow: /account creates a subscription server-side → Razorpay Checkout modal
// collects payment → the client posts the returned signature to
// /api/billing/verify for instant activation → webhooks keep the status in
// sync afterwards (charged / halted / cancelled).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { updateUserBilling, findUserBySubscription, type User } from './db';
import type { PlanId, UserStatus } from './plans';

const API = 'https://api.razorpay.com/v1';

export function razorpayConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_PLAN_STARTER && process.env.RAZORPAY_PLAN_PRO,
  );
}

export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID || '';

async function rzp(path: string, body?: Record<string, unknown>): Promise<any> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay error (HTTP ${res.status})`);
  return data;
}

/**
 * Create a subscription the Checkout modal can collect payment for.
 * total_count is Razorpay's max billing cycles — 120 months ≈ "until cancelled".
 */
export async function createSubscription(user: User, plan: PlanId): Promise<{ subscriptionId: string }> {
  const planId = plan === 'pro' ? process.env.RAZORPAY_PLAN_PRO : process.env.RAZORPAY_PLAN_STARTER;
  const sub = await rzp('/subscriptions', {
    plan_id: planId,
    total_count: 120,
    customer_notify: 1,
    notes: { userId: user.id, plan, email: user.email },
  });
  return { subscriptionId: String(sub.id) };
}

/** Cancel at the end of the current billing cycle (the user keeps what they paid for). */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await rzp(`/subscriptions/${subscriptionId}/cancel`, { cancel_at_cycle_end: 1 });
}

/* ------------------------------- signatures ------------------------------- */

const hmacHex = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

const safeEq = (a: string, b: string) => {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/** Checkout success handler signature: HMAC(payment_id|subscription_id, key secret). */
export function paymentSignatureValid(paymentId: string, subscriptionId: string, signature: string, secret = process.env.RAZORPAY_KEY_SECRET || ''): boolean {
  if (!paymentId || !subscriptionId || !signature || !secret) return false;
  return safeEq(hmacHex(secret, `${paymentId}|${subscriptionId}`), signature);
}

/** Webhook signature: HMAC of the raw request body with the webhook secret. */
export function webhookSignatureValid(rawBody: string, signature: string, secret = process.env.RAZORPAY_WEBHOOK_SECRET || ''): boolean {
  if (!rawBody || !signature || !secret) return false;
  return safeEq(hmacHex(secret, rawBody), signature);
}

/* -------------------------------- webhooks -------------------------------- */

const STATUS_MAP: Record<string, UserStatus> = {
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.resumed': 'active',
  'subscription.halted': 'past_due',
  'subscription.pending': 'past_due',
  'subscription.cancelled': 'canceled',
  'subscription.completed': 'canceled',
  'subscription.expired': 'canceled',
};

/**
 * Apply a (signature-verified) webhook event. Returns a short description for
 * logs. Unknown events are ignored.
 */
export function applyWebhookEvent(event: { event?: string; payload?: any }): string {
  const kind = String(event.event || '');
  const status = STATUS_MAP[kind];
  if (!status) return `ignored event ${kind || '(unknown)'}`;

  const sub = event.payload?.subscription?.entity;
  if (!sub) return `event ${kind} had no subscription payload — ignored`;
  const subId = String(sub.id || '');
  const userId = sub.notes?.userId ? String(sub.notes.userId) : findUserBySubscription(subId)?.id;
  if (!userId) return `event ${kind} for unknown subscription ${subId} — ignored`;

  updateUserBilling(userId, {
    status,
    plan: (sub.notes?.plan as PlanId) || undefined,
    subscriptionId: subId,
  });
  return `${kind} → user ${userId} status ${status}`;
}
