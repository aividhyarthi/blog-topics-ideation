// AppRankr billing — thin Stripe wrapper. Everything degrades gracefully when
// Stripe isn't configured yet (env keys unset): trials still work, and the
// account page explains that checkout isn't live. Required env once ready:
//   STRIPE_SECRET_KEY       sk_live_... / sk_test_...
//   STRIPE_PRICE_STARTER    price id of the $29/mo subscription
//   STRIPE_PRICE_PRO        price id of the $79/mo subscription
//   STRIPE_WEBHOOK_SECRET   whsec_... (webhook endpoint: POST /api/billing/webhook)
//   PUBLIC_URL              https://your-domain.com (for redirect URLs)
import Stripe from 'stripe';
import { findUserByStripeCustomer, updateUserBilling, type User } from './db';
import type { PlanId, UserStatus } from './plans';

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_STARTER && process.env.STRIPE_PRICE_PRO);
}

function client(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '');
}

const baseUrl = () => (process.env.PUBLIC_URL || 'http://localhost:4321').replace(/\/$/, '');

export async function createCheckoutUrl(user: User, plan: PlanId): Promise<string> {
  const price = plan === 'pro' ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_STARTER;
  const session = await client().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: price!, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.stripeCustomerId ? undefined : user.email,
    customer: user.stripeCustomerId || undefined,
    metadata: { userId: user.id, plan },
    subscription_data: { metadata: { userId: user.id, plan } },
    allow_promotion_codes: true,
    success_url: `${baseUrl()}/account?upgraded=1`,
    cancel_url: `${baseUrl()}/account`,
  });
  return session.url!;
}

export async function createPortalUrl(user: User): Promise<string | null> {
  if (!user.stripeCustomerId) return null;
  const session = await client().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl()}/account`,
  });
  return session.url;
}

const STATUS_MAP: Record<string, UserStatus> = {
  active: 'active', trialing: 'active', past_due: 'past_due',
  canceled: 'canceled', unpaid: 'canceled', incomplete_expired: 'canceled',
};

/**
 * Verify + apply a Stripe webhook event. Returns a short description of what
 * was applied (for logs) or throws on bad signatures.
 */
export async function handleWebhook(rawBody: string, signature: string): Promise<string> {
  const event = await client().webhooks.constructEventAsync(
    rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET || '',
  );

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    const userId = s.client_reference_id || s.metadata?.userId;
    if (!userId) return 'checkout completed but no user reference — ignored';
    updateUserBilling(userId, {
      status: 'active',
      plan: (s.metadata?.plan as PlanId) || undefined,
      stripeCustomerId: typeof s.customer === 'string' ? s.customer : undefined,
      stripeSubscriptionId: typeof s.subscription === 'string' ? s.subscription : undefined,
    });
    return `activated user ${userId}`;
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const user = (sub.metadata?.userId && { id: sub.metadata.userId }) || findUserByStripeCustomer(customerId);
    if (!user) return `subscription event for unknown customer ${customerId} — ignored`;
    const status: UserStatus = event.type === 'customer.subscription.deleted'
      ? 'canceled'
      : STATUS_MAP[sub.status] || 'past_due';
    updateUserBilling(user.id, { status, plan: (sub.metadata?.plan as PlanId) || undefined });
    return `subscription ${sub.status} → user status ${status}`;
  }

  return `ignored event ${event.type}`;
}
