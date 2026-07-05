// AppRankr auth — email/password with scrypt hashing (node:crypto, no
// dependencies) and opaque session tokens in httpOnly cookies.
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { createUser, findUserByEmail, findUserById, getPwHash, insertSession, findSession, deleteSession, purgeExpiredSessions, type User } from './db';
import { TRIAL_DAYS } from './plans';

export const SESSION_COOKIE = 'ar_session';
const SESSION_DAYS = 30;

/* ------------------------------- passwords -------------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/* --------------------------------- signup --------------------------------- */

export function validSignup(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Enter a valid email address.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export function signup(email: string, password: string, name: string): { user?: User; error?: string } {
  const invalid = validSignup(email, password);
  if (invalid) return { error: invalid };
  if (findUserByEmail(email)) return { error: 'An account with that email already exists — log in instead.' };
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();
  const user = createUser(randomUUID(), email, name.trim().slice(0, 80), hashPassword(password), trialEndsAt);
  return { user };
}

export function login(email: string, password: string): { user?: User; error?: string } {
  const stored = getPwHash(email);
  if (!stored || !verifyPassword(password, stored)) return { error: 'Wrong email or password.' };
  return { user: findUserByEmail(email)! };
}

/* -------------------------------- sessions -------------------------------- */

export function createSession(userId: string): { token: string; expiresAt: string } {
  purgeExpiredSessions();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  insertSession(token, userId, expiresAt);
  return { token, expiresAt };
}

export function userFromSessionToken(token: string | undefined | null): User | null {
  if (!token) return null;
  const sess = findSession(token);
  if (!sess) return null;
  if (new Date(sess.expiresAt).getTime() < Date.now()) { deleteSession(token); return null; }
  return findUserById(sess.userId);
}

export function destroySession(token: string | undefined | null): void {
  if (token) deleteSession(token);
}

export function sessionCookie(token: string, secure: boolean, maxAgeDays = SESSION_DAYS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeDays * 86400}${secure ? '; Secure' : ''}`;
}

export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

/**
 * Is this request actually HTTPS from the browser's point of view? Railway
 * (like virtually every PaaS) terminates TLS at its edge and forwards plain
 * HTTP to the container, so `new URL(request.url).protocol` is 'http:' in
 * production even though the visitor is on https — checking that directly
 * would silently drop the Secure flag from every session cookie. Trust the
 * standard X-Forwarded-Proto header the proxy sets, falling back to the
 * request's own protocol for local dev (no proxy in front of it there).
 */
export function isSecureRequest(request: Request, url: URL): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return url.protocol === 'https:';
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}
