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

/** Google Analytics (GA4) measurement id — loaded via GoogleAnalytics.astro. */
export const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || 'G-8D07RHSDDJ';

/**
 * Absolute base URL of the live site — used for canonical links, Open Graph
 * tags, JSON-LD, sitemap.xml and llms.txt, all of which need a real domain
 * rather than a relative path. Set SITE_URL in Railway if the domain ever
 * changes — this default should always match the real production domain.
 */
export const SITE_URL = (process.env.SITE_URL || 'https://apprankr.in').replace(/\/$/, '');

/**
 * Cache-busting suffix appended to og:image URLs. WhatsApp/Facebook's link
 * crawler caches a preview per exact URL for days, so redrawing an og image
 * under the same filename (as happened moving from the bar-chart-only
 * design to this title-based one) doesn't reach chats that already cached
 * the old preview until the URL itself changes. Bump this string whenever
 * the og images are regenerated with a real visual change.
 */
export const OG_IMAGE_VERSION = 'v5';

/** Founder credit — shown in the site footer and the About page, and used
 * as the Person/Organization JSON-LD `sameAs` link on both. */
export const FOUNDER_NAME = 'Rudra Kasturi';
export const FOUNDER_LINKEDIN = 'https://www.linkedin.com/in/rudrakasturi';
/** "An initiative by AI Vidhyarthi" — the parent initiative behind the
 * product, credited alongside the founder wherever the brand appears. */
export const INITIATIVE_NAME = 'AI Vidhyarthi';

/**
 * Daily rank-report emails (src/lib/rank/email.ts), sent via Resend
 * (resend.com) — a plain HTTP API, no SDK dependency needed. Unset
 * RESEND_API_KEY disables report sending entirely (logs once, never throws),
 * same "safe to leave unset" pattern as AdSense above.
 *
 * To turn this on: sign up at resend.com (free tier), verify a sending
 * domain there (it walks you through adding a couple of DNS records at
 * whoever your domain is registered with), create an API key, then set
 * RESEND_API_KEY and REPORT_FROM_EMAIL (an address on that verified domain,
 * e.g. reports@apprankr.in) in Railway.
 */
export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const REPORT_FROM_EMAIL = process.env.REPORT_FROM_EMAIL || `reports@${SITE_URL.replace(/^https?:\/\//, '')}`;

/**
 * Super-admin emails (comma-separated). Admins get the /admin panel (see
 * every user, activate/cancel plans after a UPI payment, run checks on
 * demand) and always have full access to the paid tools regardless of
 * their own trial/plan status. Defaults to the owner's email.
 */
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'rudra@appstudiox.com')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export const isAdminEmail = (email: string | null | undefined): boolean =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());

export type PlanId = 'starter' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number; // INR
  /** Counts YOUR OWN apps only. Competitors are excluded (see
   * countsAgainstPlan in api/rank.ts): they're the reason the tool is
   * useful, and they're nearly free to check, because a competitor added
   * against a primary inherits its keywords and the check runner shares one
   * search cache keyed by keyword rather than by app, so its ranks come out
   * of the SAME store search the primary already paid for. */
  maxApps: number;
  /** Rivals trackable against each of your apps. Bounds the per-competitor
   * metadata/chart/rating fetches (the only part that isn't cache-shared). */
  maxCompetitorsPerApp: number;
  maxKeywordsPerApp: number;
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter', name: 'Starter', priceMonthly: 2499,
    maxApps: 3, maxCompetitorsPerApp: 3, maxKeywordsPerApp: 30,
    blurb: 'For a single app or side project',
  },
  pro: {
    id: 'pro', name: 'Pro', priceMonthly: 6499,
    maxApps: 10, maxCompetitorsPerApp: 3, maxKeywordsPerApp: 60,
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
