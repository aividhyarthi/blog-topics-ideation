// AppRankr user database — Node's built-in SQLite (node:sqlite, Node 22+), so
// there is no native dependency and no separate database service to run. The
// file lives in RANK_DATA_DIR (the Railway Volume), next to the per-user rank
// data, so one mounted volume persists everything.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanId, UserStatus } from './plans';

export interface User {
  id: string;
  email: string;
  name: string;
  plan: PlanId;
  status: UserStatus;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
}

let db: DatabaseSync | null = null;

function dataDir(): string {
  const dir = process.env.RANK_DATA_DIR || join(process.cwd(), '.rank-data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(process.env.APP_DB_PATH || join(dataDir(), 'apprankr.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      pw_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'trialing',
      trial_ends_at TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  return db;
}

/** Test hook: close and reset so a fresh APP_DB_PATH takes effect. */
export function resetDbForTests(): void {
  try { db?.close(); } catch { /* already closed */ }
  db = null;
}

const rowToUser = (r: Record<string, any>): User => ({
  id: String(r.id), email: String(r.email), name: String(r.name || ''),
  plan: (r.plan as PlanId) || 'starter', status: (r.status as UserStatus) || 'trialing',
  trialEndsAt: r.trial_ends_at ?? null,
  stripeCustomerId: r.stripe_customer_id ?? null,
  stripeSubscriptionId: r.stripe_subscription_id ?? null,
  createdAt: String(r.created_at),
});

export function createUser(id: string, email: string, name: string, pwHash: string, trialEndsAt: string): User {
  getDb().prepare(
    'INSERT INTO users (id, email, name, pw_hash, trial_ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, email.toLowerCase(), name, pwHash, trialEndsAt, new Date().toISOString());
  return findUserByEmail(email)!;
}

export function findUserByEmail(email: string): User | null {
  const r = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  return r ? rowToUser(r as Record<string, any>) : null;
}

export function findUserById(id: string): User | null {
  const r = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
  return r ? rowToUser(r as Record<string, any>) : null;
}

export function findUserByStripeCustomer(customerId: string): User | null {
  const r = getDb().prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(customerId);
  return r ? rowToUser(r as Record<string, any>) : null;
}

export function getPwHash(email: string): string | null {
  const r = getDb().prepare('SELECT pw_hash FROM users WHERE email = ?').get(email.toLowerCase()) as Record<string, any> | undefined;
  return r ? String(r.pw_hash) : null;
}

export function updateUserBilling(userId: string, fields: {
  plan?: PlanId; status?: UserStatus; stripeCustomerId?: string; stripeSubscriptionId?: string;
}): void {
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  if (fields.plan) { sets.push('plan = ?'); vals.push(fields.plan); }
  if (fields.status) { sets.push('status = ?'); vals.push(fields.status); }
  if (fields.stripeCustomerId) { sets.push('stripe_customer_id = ?'); vals.push(fields.stripeCustomerId); }
  if (fields.stripeSubscriptionId) { sets.push('stripe_subscription_id = ?'); vals.push(fields.stripeSubscriptionId); }
  if (!sets.length) return;
  vals.push(userId);
  getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function listUsers(): User[] {
  return (getDb().prepare('SELECT * FROM users').all() as Record<string, any>[]).map(rowToUser);
}

/* -------------------------------- sessions -------------------------------- */

export function insertSession(token: string, userId: string, expiresAt: string): void {
  getDb().prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, expiresAt, new Date().toISOString());
}

export function findSession(token: string): { userId: string; expiresAt: string } | null {
  const r = getDb().prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as Record<string, any> | undefined;
  return r ? { userId: String(r.user_id), expiresAt: String(r.expires_at) } : null;
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function purgeExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}
