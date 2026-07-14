// In-process per-tenant mutex. snap__DATE.json and covsnap__DATE.json are
// ONE SHARED FILE covering every app a tenant tracks — each check reads the
// whole file, merges its own results into that in-memory copy, then
// overwrites the whole file. If two checks for the SAME tenant ever overlap
// (the nightly/admin run still going while a user clicks "Check now", or
// even two apps' checks racing each other), the slower one saves based on a
// snapshot it read before the faster one's write — silently discarding
// whatever the faster one just saved. This serializes every check-writing
// operation per tenant so that race can't happen. Single Node process only
// (matches this app's file-based, non-horizontally-scaled storage already).
const queues = new Map<string, Promise<unknown>>();

export function withTenantLock<T>(tenantKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(tenantKey) || Promise.resolve();
  const run = prev.then(fn, fn);
  queues.set(tenantKey, run.then(() => undefined, () => undefined));
  return run;
}
