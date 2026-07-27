// Email + password auth with DB-backed sessions. No third-party provider needed
// (works the moment DATABASE_URL is set). Passwords hashed with scrypt (Node
// built-in crypto — no native deps). Sessions are random opaque tokens stored in
// Postgres and carried in an httpOnly cookie, so they're revocable.

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';
import { query, dbEnabled } from './db';

const scrypt = (pw: string, salt: string): Promise<Buffer> =>
  new Promise((res, rej) => _scrypt(pw, salt, 64, (e, dk) => (e ? rej(e) : res(dk))));

export const SESSION_COOKIE = 'cr_session';
const SESSION_DAYS = 30;

export function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return scrypt(pw, salt).then((dk) => `${salt}:${dk.toString('hex')}`);
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const dk = await scrypt(pw, salt);
  const hb = Buffer.from(hash, 'hex');
  return hb.length === dk.length && timingSafeEqual(hb, dk);
}

export interface User { id: string; email: string }

export async function createUser(email: string, password: string): Promise<User> {
  const hash = await hashPassword(password);
  const { rows } = await query<{ id: string; email: string }>(
    'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
    [email.toLowerCase().trim(), hash],
  );
  return { id: String(rows[0].id), email: rows[0].email };
}

export async function findUserByEmail(email: string): Promise<(User & { password: string }) | null> {
  const { rows } = await query<{ id: string; email: string; password: string }>(
    'SELECT id, email, password FROM users WHERE email = $1', [email.toLowerCase().trim()],
  );
  return rows[0] ? { id: String(rows[0].id), email: rows[0].email, password: rows[0].password } : null;
}

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  // Single-login: one active session per user — signing in ends prior sessions.
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expires]);
  return { token, expires };
}

// ---- monthly usage limit (Pro plan: 500 URL checks / calendar month) ----
export const MONTHLY_LIMIT = 500;
export async function monthlyUsage(userId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM audits WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function destroySession(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token = $1', [token]);
}

// ---- password reset ----
const RESET_MINUTES = 60;

/** Issue a single-use reset token. Returns null if no such account exists. */
export async function createResetToken(email: string): Promise<string | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + RESET_MINUTES * 60_000);
  // Only the newest link should work.
  await query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
  await query('INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, user.id, expires]);
  return token;
}

/**
 * Spend a reset token and set the new password. Deletes the token and every
 * active session, so a stolen link can't be reused and anyone already signed in
 * as that user is kicked out.
 */
export async function consumeResetToken(token: string, newPassword: string): Promise<boolean> {
  const { rows } = await query<{ user_id: string }>(
    'DELETE FROM password_resets WHERE token = $1 AND expires_at > now() RETURNING user_id', [token],
  );
  const userId = rows[0]?.user_id;
  if (!userId) return false;
  const hash = await hashPassword(newPassword);
  await query('UPDATE users SET password = $1 WHERE id = $2', [hash, userId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  return true;
}

// Resolve the logged-in user from the session cookie. Never throws — returns
// null on any problem (no DB, no cookie, expired) so callers stay simple.
export async function getUser(ctx: APIContext): Promise<User | null> {
  if (!dbEnabled) return null;
  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { rows } = await query<{ id: string; email: string }>(
      `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`, [token],
    );
    return rows[0] ? { id: String(rows[0].id), email: rows[0].email } : null;
  } catch { return null; }
}

export function setSessionCookie(ctx: APIContext, token: string, expires: Date): void {
  ctx.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires,
  });
}

export function clearSessionCookie(ctx: APIContext): void {
  ctx.cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
