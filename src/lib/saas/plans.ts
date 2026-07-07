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

/**
 * Google AdSense. ADSENSE_CLIENT is your publisher id (ca-pub-...); each
 * ADSENSE_SLOT_* is a separate ad unit id created in the AdSense dashboard
 * for that specific placement (AdSense reports performance per ad unit, so
 * reusing one id everywhere loses that breakdown). Ad slots render nothing
 * at all if ADSENSE_CLIENT isn't set — safe to leave unset in local dev.
 */
export const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || 'ca-pub-2121262893172079';
export const ADSENSE_SLOTS = {
  blog: process.env.ADSENSE_SLOT_BLOG || '',
  rank: process.env.ADSENSE_SLOT_RANK || '',
  aso: process.env.ADSENSE_SLOT_ASO || '',
  footer: process.env.ADSENSE_SLOT_FOOTER || '',
};

/** Google Search Console's HTML-tag site-ownership verification code. */
export const GOOGLE_SITE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION || 'M5rfPY6hOHg91xlOv9Zsx_oBf1oVha8w8RHNtnPW6eI';

/**
 * Absolute base URL of the live site — used for canonical links, Open Graph
 * tags, JSON-LD, sitemap.xml and llms.txt, all of which need a real domain
 * rather than a relative path. Set SITE_URL in Railway if the domain ever
 * changes — this default should always match the real production domain.
 */
export const SITE_URL = (process.env.SITE_URL || 'https://apprankr.in').replace(/\/$/, '');

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
