// Plan + usage enforcement, and the manual UPI payment-claim workflow (the
// stopgap before Razorpay subscriptions: Stripe can't do recurring billing for
// Indian businesses, so for now customers pay via UPI and an admin approves).
//
// Access model (in the order a check is charged against):
//   1. Active Pro subscription — 500 checks/month, $99/mo.
//   2. One free trial check — lifetime, once per account.
//   3. Purchased one-time credits — never expire, bought in packs.
// A check is BLOCKED only once all three are exhausted.

import { query } from './db';
import type { User } from './auth';

export const PLAN_LIMITS: Record<'free' | 'pro', number> = { free: 0, pro: 500 };
export const PRO_PRICE_USD = 99;

// One-time check packs — pay-per-URL for casual/low-volume users. Priced well
// above the subscription's per-check cost (₹8299/500 ≈ ₹17) on purpose: packs
// trade a higher per-unit price for zero commitment; the subscription rewards
// volume. Prices are in INR (UPI-only for now).
export interface CreditPack { id: string; checks: number; priceInr: number; label: string }
export const CREDIT_PACKS: CreditPack[] = [
  { id: 'single', checks: 1, priceInr: 149, label: '1 check' },
  { id: 'starter', checks: 5, priceInr: 599, label: '5 checks' },
  { id: 'growth', checks: 20, priceInr: 1999, label: '20 checks' },
];

export interface UsageStatus {
  plan: 'free' | 'pro'; expiresAt: string | null;
  planLimit: number; planUsed: number;
  freeCheckAvailable: boolean; credits: number;
  allowed: boolean; // can this account run ONE more check right now
}

async function effectivePlan(userId: string): Promise<{ plan: 'free' | 'pro'; expiresAt: string | null }> {
  const { rows } = await query<{ plan: string; plan_expires_at: string | null }>(
    'SELECT plan, plan_expires_at FROM users WHERE id = $1', [userId],
  );
  const row = rows[0];
  const active = row?.plan === 'pro' && row.plan_expires_at && new Date(row.plan_expires_at) > new Date();
  return { plan: active ? 'pro' : 'free', expiresAt: row?.plan_expires_at ?? null };
}

// Read-only status for the dashboard / pricing UI — does NOT consume anything.
export async function usageStatus(userId: string): Promise<UsageStatus> {
  const { plan, expiresAt } = await effectivePlan(userId);
  const planLimit = PLAN_LIMITS[plan];
  const { rows } = await query<{ n: string; free_check_used: boolean; credits: number }>(
    `SELECT (SELECT COUNT(*)::int FROM usage_events WHERE user_id = $1 AND created_at >= date_trunc('month', now())) AS n,
            u.free_check_used, u.credits
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  const planUsed = Number(rows[0]?.n ?? 0);
  const freeCheckAvailable = !rows[0]?.free_check_used;
  const credits = Number(rows[0]?.credits ?? 0);
  const allowed = (plan === 'pro' && planUsed < planLimit) || freeCheckAvailable || credits > 0;
  return { plan, expiresAt, planLimit, planUsed, freeCheckAvailable, credits, allowed };
}

export interface ConsumeResult { allowed: boolean; via?: 'plan' | 'free' | 'credit'; creditsLeft?: number; message?: string }

// Atomically check AND spend one unit of access, in priority order
// (plan -> free trial -> credits). Called BEFORE doing the actual check, so a
// unit is spent on the attempt (standard metered-API behaviour) — this also
// records the usage event used for the dashboard/monthly plan counting.
export async function consumeAccess(userId: string, tool: string): Promise<ConsumeResult> {
  const { plan, planLimit } = await effectivePlan(userId);
  if (plan === 'pro') {
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM usage_events WHERE user_id = $1 AND created_at >= date_trunc('month', now())`, [userId],
    );
    if (Number(rows[0]?.n ?? 0) < planLimit) {
      await recordUsage(userId, tool);
      return { allowed: true, via: 'plan' };
    }
  }
  // Free trial: one lifetime check, claimed atomically so concurrent requests
  // can't both grab it.
  const { rows: freeRows } = await query<{ id: string }>(
    `UPDATE users SET free_check_used = true WHERE id = $1 AND free_check_used = false RETURNING id`, [userId],
  );
  if (freeRows[0]) { await recordUsage(userId, tool); return { allowed: true, via: 'free' }; }

  // Purchased credits, decremented atomically.
  const { rows: creditRows } = await query<{ credits: number }>(
    `UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits > 0 RETURNING credits`, [userId],
  );
  if (creditRows[0]) { await recordUsage(userId, tool); return { allowed: true, via: 'credit', creditsLeft: creditRows[0].credits }; }

  return {
    allowed: false,
    message: plan === 'pro'
      ? `You've used all ${planLimit} Pro checks this month.`
      : `You've used your free check and have no credits left. Buy a check pack or subscribe to Pro to continue.`,
  };
}

// Give back whatever consumeAccess just took. Called when the check could not
// be performed at all (page unreachable, upstream refused) — charging for a
// result we never delivered is the fastest way to lose a paying customer.
export async function refundAccess(userId: string, via: ConsumeResult['via']): Promise<void> {
  if (!via) return;
  try {
    if (via === 'free') {
      await query('UPDATE users SET free_check_used = false WHERE id = $1', [userId]);
    } else if (via === 'credit') {
      await query('UPDATE users SET credits = credits + 1 WHERE id = $1', [userId]);
    }
    // Drop the matching usage_event so the monthly Pro counter unwinds too.
    await query(
      `DELETE FROM usage_events WHERE id = (
         SELECT id FROM usage_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
       )`,
      [userId],
    );
  } catch { /* best-effort — a refund failure must never mask the real error */ }
}

export async function recordUsage(userId: string, tool: string): Promise<void> {
  try { await query('INSERT INTO usage_events (user_id, tool) VALUES ($1, $2)', [userId, tool]); }
  catch { /* best-effort — never block the request over a logging failure */ }
}

export function isAdmin(user: User | null): boolean {
  const adminEmail = (process.env.ADMIN_EMAIL || (import.meta as any).env?.ADMIN_EMAIL || '').trim().toLowerCase();
  return Boolean(user && adminEmail && user.email.toLowerCase() === adminEmail);
}

// ---- UPI payment claims ----
export interface PaymentClaim {
  id: string; email: string; utr: string; amount: string | null; note: string | null;
  kind: 'subscription' | 'credits'; credits: number | null;
  status: string; createdAt: string; reviewedAt: string | null;
}

export async function createClaim(email: string, utr: string, amount: string, note: string, kind: 'subscription' | 'credits', credits?: number): Promise<void> {
  // A UTR identifies exactly one real bank transaction, so it can back exactly
  // one claim. Re-submitting it (by accident or on purpose) must not create a
  // second approvable row.
  const { rows: dupe } = await query<{ id: string }>(
    'SELECT id FROM payment_claims WHERE lower(trim(utr)) = lower(trim($1))', [utr],
  );
  if (dupe[0]) throw new Error('That transaction reference has already been submitted. We\'ll review it shortly — no need to send it again.');

  try {
    await query('INSERT INTO payment_claims (email, utr, amount, note, kind, credits) VALUES ($1, $2, $3, $4, $5, $6)', [email, utr, amount || null, note || null, kind, credits ?? null]);
  } catch (e: any) {
    // Unique-index violation from a concurrent duplicate submission.
    if (e?.code === '23505') throw new Error('That transaction reference has already been submitted.');
    throw e;
  }
}

export async function listClaims(limit = 50): Promise<PaymentClaim[]> {
  const { rows } = await query<any>('SELECT * FROM payment_claims ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows.map((r) => ({ id: String(r.id), email: r.email, utr: r.utr, amount: r.amount, note: r.note, kind: r.kind, credits: r.credits, status: r.status, createdAt: r.created_at, reviewedAt: r.reviewed_at }));
}

// Approve: mark the claim approved, then either extend 30 days of Pro
// (subscription) or add the purchased checks to the account's credit balance.
export async function approveClaim(id: string): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await query<{ email: string; status: string; kind: string; credits: number | null }>('SELECT email, status, kind, credits FROM payment_claims WHERE id = $1', [id]);
  const claim = rows[0];
  if (!claim) return { ok: false, error: 'Claim not found.' };
  if (claim.status !== 'pending') return { ok: false, error: `Claim already ${claim.status}.` };
  const { rows: userRows } = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [claim.email.toLowerCase().trim()]);
  if (!userRows[0]) return { ok: false, error: `No CiteRank account found for ${claim.email}. Ask them to sign up with this email first.` };

  if (claim.kind === 'credits') {
    const n = claim.credits && claim.credits > 0 ? claim.credits : 1;
    await query('UPDATE users SET credits = credits + $2 WHERE id = $1', [userRows[0].id, n]);
  } else {
    await query(
      `UPDATE users SET plan = 'pro',
         plan_expires_at = (CASE WHEN plan_expires_at IS NOT NULL AND plan_expires_at > now() THEN plan_expires_at ELSE now() END) + interval '30 days'
       WHERE id = $1`,
      [userRows[0].id],
    );
  }
  await query(`UPDATE payment_claims SET status = 'approved', reviewed_at = now() WHERE id = $1`, [id]);
  return { ok: true };
}

export async function rejectClaim(id: string): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await query<{ status: string }>('SELECT status FROM payment_claims WHERE id = $1', [id]);
  if (!rows[0]) return { ok: false, error: 'Claim not found.' };
  if (rows[0].status !== 'pending') return { ok: false, error: `Claim already ${rows[0].status}.` };
  await query(`UPDATE payment_claims SET status = 'rejected', reviewed_at = now() WHERE id = $1`, [id]);
  return { ok: true };
}
