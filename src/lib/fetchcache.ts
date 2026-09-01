// Short-lived, in-memory cache for page fetches.
//
// WHY THIS EXISTS
// ----------------
// LLM Access Check, Full AEO Audit, and the on-demand per-engine checker each
// fetch the same target URL under a handful of fixed user-agents (Googlebot
// desktop/mobile, a plain browser UA, GPTBot, ClaudeBot, ...). Running two of
// these tools back to back for the same URL — which is a completely normal
// thing to do, e.g. auditing a page and then checking one specific engine —
// used to refetch the target site from scratch every single time, including
// re-hitting robots.txt and llms.txt. That's wasted latency for the user and
// an unnecessary, avoidable load on someone else's server.
//
// This cache means the second call within a few minutes reuses what the
// first one already fetched, keyed by the exact (user-agent, URL) pair so a
// cached "what GPTBot sees" is never handed back for "what a browser sees".
//
// In-memory and per-process: correct for this app, which is intentionally a
// single Node instance with no separate cache service (see DEPLOY.md). It is
// never persisted and never shared across restarts — it only needs to
// survive a few minutes within one browsing session, not longer.

interface CacheEntry<T> { value: T; expiresAt: number }
const store = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough to cover "switched tabs", short enough that a page edit shows up on the next real check.

// Opportunistic cleanup on access rather than a timer — no extra moving
// parts, and the map can't grow unbounded over a long-running process.
function sweep(): void {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}

/**
 * Returns the cached value for `key` if still fresh, otherwise calls
 * `fetchFn`, caches the result (only when `shouldCache` says so — by default
 * always, but callers doing a network fetch should pass one that excludes
 * failed responses, so a transient error isn't remembered for the full TTL),
 * and returns it.
 */
export async function cached<T>(key: string, fetchFn: () => Promise<T>, shouldCache: (v: T) => boolean = () => true): Promise<T> {
  sweep();
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fetchFn();
  if (shouldCache(value)) store.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
