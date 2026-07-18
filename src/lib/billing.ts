// Plan + usage enforcement, and the manual UPI payment-claim workflow (the
// stopgap before Razorpay subscriptions: Stripe can't do recurring billing for
// Indian businesses, so for now customers pay via UPI and an admin approves).

import { query } from './db';
import type { User } from './auth';

export const PLAN_LIMITS: Record<'free' | 'pro', number> = { free: 5, pro: 500 };
export const PRO_PRICE_USD = 99;

export interface UsageStatus { plan: 'free' | 'pro'; limit: number; used: number; remaining: number; allowed: boolean; expiresAt: string | null }

// A user is effectively "pro" only while plan='pro' AND not expired.
async function effectivePlan(userId: string): Promise<{ plan: 'free' | 'pro'; expiresAt: string | null }> {
  const { rows } = await query<{ plan: string; plan_expires_at: string | null }>(
    'SELECT plan, plan_expires_at FROM users WHERE id = $1', [userId],
  );
  const row = rows[0];
  const active = row?.plan === 'pro' && row.plan_expires_at && new Date(row.plan_expires_at) > new Date();
  return { plan: active ? 'pro' : 'free', expiresAt: row?.plan_expires_at ?? null };
}

export async function usageStatus(userId: string): Promise<UsageStatus> {
  const { plan, expiresAt } = await effectivePlan(userId);
  const limit = PLAN_LIMITS[plan];
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM usage_events WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
    [userId],
  );
  const used = Number(rows[0]?.n ?? 0);
  return { plan, limit, used, remaining: Math.max(0, limit - used), allowed: used < limit, expiresAt };
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
export interface PaymentClaim { id: string; email: string; utr: string; amount: string | null; note: string | null; status: string; createdAt: string; reviewedAt: string | null }

export async function createClaim(email: string, utr: string, amount: string, note: string): Promise<void> {
  await query('INSERT INTO payment_claims (email, utr, amount, note) VALUES ($1, $2, $3, $4)', [email, utr, amount || null, note || null]);
}

export async function listClaims(limit = 50): Promise<PaymentClaim[]> {
  const { rows } = await query<any>('SELECT * FROM payment_claims ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows.map((r) => ({ id: String(r.id), email: r.email, utr: r.utr, amount: r.amount, note: r.note, status: r.status, createdAt: r.created_at, reviewedAt: r.reviewed_at }));
}

// Approve: mark the claim approved and grant/extend 30 days of Pro on the
// matching account. Renewing early stacks onto the remaining time.
export async function approveClaim(id: string): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await query<{ email: string; status: string }>('SELECT email, status FROM payment_claims WHERE id = $1', [id]);
  const claim = rows[0];
  if (!claim) return { ok: false, error: 'Claim not found.' };
  if (claim.status !== 'pending') return { ok: false, error: `Claim already ${claim.status}.` };
  const { rows: userRows } = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [claim.email.toLowerCase().trim()]);
  if (!userRows[0]) return { ok: false, error: `No CiteRank account found for ${claim.email}. Ask them to sign up with this email first.` };
  await query(
    `UPDATE users SET plan = 'pro',
       plan_expires_at = (CASE WHEN plan_expires_at IS NOT NULL AND plan_expires_at > now() THEN plan_expires_at ELSE now() END) + interval '30 days'
     WHERE id = $1`,
    [userRows[0].id],
  );
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
