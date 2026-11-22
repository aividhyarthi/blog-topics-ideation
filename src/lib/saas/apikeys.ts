// Personal API keys — the only auth path that isn't a browser session cookie.
// Used by the MCP server (see api/mcp.ts) so a user's own Claude/ChatGPT can
// call AppRankr as that user, without a browser in the loop. Same model as a
// GitHub personal access token: shown once in full at creation, stored only
// as a sha256 hash afterward, and revocable from the Account page.
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { insertApiKey, findUserIdByApiKeyHash, touchApiKey, listApiKeysForUser, deleteApiKey, findUserById, type ApiKeyRow } from './db';
import type { User } from './db';

const PREFIX = 'ar_live_';

function hash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Generates and stores a new key for this user, returning the plaintext
 * (shown to them exactly once — the caller must display it immediately). */
export function createApiKey(userId: string, label: string): string {
  const key = PREFIX + randomBytes(24).toString('hex');
  insertApiKey(randomUUID(), userId, hash(key), label.trim().slice(0, 80) || 'Unlabeled key');
  return key;
}

/** Resolves a bearer token straight to the user it belongs to, or null if
 * it's missing, malformed, or revoked. Updates last-used-at best-effort. */
export function userFromApiKey(token: string | undefined | null): User | null {
  if (!token || !token.startsWith(PREFIX)) return null;
  const keyHash = hash(token);
  const userId = findUserIdByApiKeyHash(keyHash);
  if (!userId) return null;
  try { touchApiKey(keyHash); } catch { /* best-effort */ }
  return findUserById(userId);
}

export function listApiKeys(userId: string): ApiKeyRow[] {
  return listApiKeysForUser(userId);
}

export function revokeApiKey(userId: string, id: string): void {
  deleteApiKey(userId, id);
}
