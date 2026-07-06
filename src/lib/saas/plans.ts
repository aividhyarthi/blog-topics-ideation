// AppRankr product configuration — brand, plans, limits, trial. Everything a
// business decision touches lives in this one file so it can be changed
// without hunting through the codebase.

export const BRAND = process.env.BRAND_NAME || 'AppRankr';
export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 7);
export const CURRENCY = '₹';

/**
 * Billing is manual UPI/WhatsApp, not a payment gateway: the account page
 * shows a UPI QR + deep link and a WhatsApp contact, the owner pays outside
 * the app, and Rudra flips their account to "active" himself (see
 * scripts/activate-user.ts) once the payment shows up. Set these in Railway.
 */
export const UPI_ID = process.env.UPI_ID || 'yourname@upi';
export const UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || BRAND;
export const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '911234567890';

export type PlanId = 'starter' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number; // INR
  maxApps: number;
  maxKeywordsPerApp: number;
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter', name: 'Starter', priceMonthly: 2499,
    maxApps: 3, maxKeywordsPerApp: 30,
    blurb: 'For a single app or side project',
  },
  pro: {
    id: 'pro', name: 'Pro', priceMonthly: 6499,
    maxApps: 10, maxKeywordsPerApp: 60,
    blurb: 'For studios and agencies tracking a portfolio',
  },
};

/** "2,499" — Indian digit grouping for price display. */
export const formatPrice = (n: number) => n.toLocaleString('en-IN');

export const planOf = (id: string | null | undefined): Plan => PLANS[(id as PlanId) || 'starter'] || PLANS.starter;

export type UserStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface AccessCheck { allowed: boolean; reason?: 'trial_expired' | 'inactive'; trialDaysLeft?: number; }

/** Can this user use the product right now? Trial users get full access until the trial ends. */
export function checkAccess(status: UserStatus, trialEndsAt: string | null, now = new Date()): AccessCheck {
  if (status === 'active') return { allowed: true };
  if (status === 'trialing') {
    const ends = trialEndsAt ? new Date(trialEndsAt) : null;
    if (ends && ends.getTime() > now.getTime()) {
      return { allowed: true, trialDaysLeft: Math.max(1, Math.ceil((ends.getTime() - now.getTime()) / 86400000)) };
    }
    return { allowed: false, reason: 'trial_expired' };
  }
  return { allowed: false, reason: 'inactive' };
}
