#!/usr/bin/env node
// One-off password reset for when self-service reset isn't configured yet
// (no RESEND_API_KEY set) or an admin is locked out and can't wait on it.
// Run this from the Railway Console tab on the web service — it has
// DATA_DIR and better-sqlite3 already available, no extra setup needed:
//
//   node scripts/reset-password.mjs someone@example.com newpassword123
//
// Writes the exact same scrypt hash format as src/lib/auth.ts (salt:hex,
// node:crypto, zero extra dependencies), so the account works normally
// afterwards — this isn't a special "admin bypass" password, just a direct
// write of what a normal reset would have produced.
import { randomBytes, scrypt as _scrypt } from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';

const [, , emailArg, passwordArg] = process.argv;
if (!emailArg || !passwordArg) {
  console.error('Usage: node scripts/reset-password.mjs <email> <new-password>');
  process.exit(1);
}
if (passwordArg.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const DATA_DIR = process.env.DATA_DIR;
if (!DATA_DIR) {
  console.error('DATA_DIR is not set in this environment — nowhere to find the database.');
  process.exit(1);
}

const scrypt = (pw, salt) => new Promise((res, rej) => _scrypt(pw, salt, 64, (e, dk) => (e ? rej(e) : res(dk))));

async function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const dk = await scrypt(pw, salt);
  return `${salt}:${dk.toString('hex')}`;
}

async function main() {
  const email = emailArg.trim().toLowerCase();
  const db = new Database(path.join(DATA_DIR, 'citerank.db'));
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  if (!user) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }
  const hash = await hashPassword(passwordArg);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
  // Same hygiene as a normal reset: sign out anywhere already logged in as
  // this user, in case the account was compromised rather than just forgotten.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  console.log(`Password reset for ${email}. Any existing sessions were signed out — log in with the new password.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
