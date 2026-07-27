// Small in-process rate limiter. No Redis, no dependency — the app runs as a
// single Railway instance, and a limiter that resets on deploy is still the
// difference between "someone can brute-force a password" and "they can't".
//
// Two things it protects:
//   • login — password guessing.
//   • signup — every new account carries a free check, so unlimited signups
//     from one source is a direct cost/abuse channel.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Keep the map from growing without bound on a long-lived process.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number; // seconds
}

/**
 * @param key    caller-scoped identity, e.g. `login:1.2.3.4`
 * @param limit  allowed attempts per window
 * @param windowSec window length in seconds
 */
export function rateLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

/** Clear a key after a legitimate success, so honest users aren't punished. */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client IP. Railway/Cloudflare put the real address in
 * x-forwarded-for; the left-most entry is the client.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
}
