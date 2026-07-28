// AppRankr user database — Node's built-in SQLite (node:sqlite, Node 22+), so
// there is no native dependency and no separate database service to run. The
// file lives in RANK_DATA_DIR (the Railway Volume), next to the per-user rank
// data, so one mounted volume persists everything.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { PlanId, UserStatus } from './plans';

export interface User {
  id: string;
  email: string;
  name: string;
  plan: PlanId;
  status: UserStatus;
  trialEndsAt: string | null;
  /** Optional free-text payment reference (e.g. a UPI transaction id), set manually. */
  subscriptionId: string | null;
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
      subscription_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    -- Read-only shares: "grantee_email may view owner_id's app_key".
    -- Keyed by EMAIL, not user id, so a client can be invited before they
    -- have signed up — the grant applies the moment they create that account.
    CREATE TABLE IF NOT EXISTS app_grants (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      grantee_email TEXT NOT NULL,
      app_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(owner_id, grantee_email, app_key)
    );
    CREATE INDEX IF NOT EXISTS idx_grants_email ON app_grants(grantee_email);
    CREATE INDEX IF NOT EXISTS idx_grants_owner ON app_grants(owner_id);
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
  subscriptionId: r.subscription_id ?? null,
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

export function getPwHash(email: string): string | null {
  const r = getDb().prepare('SELECT pw_hash FROM users WHERE email = ?').get(email.toLowerCase()) as Record<string, any> | undefined;
  return r ? String(r.pw_hash) : null;
}

export function updateUserBilling(userId: string, fields: {
  plan?: PlanId; status?: UserStatus; subscriptionId?: string; trialEndsAt?: string;
}): void {
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  if (fields.plan) { sets.push('plan = ?'); vals.push(fields.plan); }
  if (fields.status) { sets.push('status = ?'); vals.push(fields.status); }
  if (fields.subscriptionId) { sets.push('subscription_id = ?'); vals.push(fields.subscriptionId); }
  if (fields.trialEndsAt) { sets.push('trial_ends_at = ?'); vals.push(fields.trialEndsAt); }
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

/* -------------------------------- app grants ------------------------------- */

export interface AppGrant {
  id: string;
  ownerId: string;
  granteeEmail: string;
  appKey: string;
  createdAt: string;
}

const rowToGrant = (r: Record<string, any>): AppGrant => ({
  id: String(r.id), ownerId: String(r.owner_id), granteeEmail: String(r.grantee_email),
  appKey: String(r.app_key), createdAt: String(r.created_at),
});

/** Idempotent — re-granting the same app to the same email is a no-op. */
export function createGrant(ownerId: string, granteeEmail: string, appKey: string): void {
  getDb().prepare(
    'INSERT OR IGNORE INTO app_grants (id, owner_id, grantee_email, app_key, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), ownerId, granteeEmail.toLowerCase(), appKey, new Date().toISOString());
}

/** Every grant held BY this email, across all owners (see grants.ts). */
export function listGrantsForEmail(email: string): AppGrant[] {
  return (getDb().prepare('SELECT * FROM app_grants WHERE grantee_email = ?')
    .all(email.toLowerCase()) as Record<string, any>[]).map(rowToGrant);
}

/** Every grant issued BY this owner — what the Account page lists. */
export function listGrantsByOwner(ownerId: string): AppGrant[] {
  return (getDb().prepare('SELECT * FROM app_grants WHERE owner_id = ? ORDER BY grantee_email, app_key')
    .all(ownerId) as Record<string, any>[]).map(rowToGrant);
}

/** Revoke one app from one grantee. Scoped by owner so nobody can revoke
 * someone else's grant by guessing an id. */
export function deleteGrant(ownerId: string, granteeEmail: string, appKey: string): void {
  getDb().prepare('DELETE FROM app_grants WHERE owner_id = ? AND grantee_email = ? AND app_key = ?')
    .run(ownerId, granteeEmail.toLowerCase(), appKey);
}

/** Revoke this grantee's access to everything of the owner's. */
export function deleteGrantee(ownerId: string, granteeEmail: string): void {
  getDb().prepare('DELETE FROM app_grants WHERE owner_id = ? AND grantee_email = ?')
    .run(ownerId, granteeEmail.toLowerCase());
}

/** Drop every grant pointing at an app — called when that app is untracked,
 * so a re-added app never silently inherits an old share. */
export function deleteGrantsForApp(ownerId: string, appKey: string): void {
  getDb().prepare('DELETE FROM app_grants WHERE owner_id = ? AND app_key = ?').run(ownerId, appKey);
}
