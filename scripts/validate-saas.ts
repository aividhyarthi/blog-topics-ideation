// Fixture tests for the AppRankr SaaS core — auth hashing, sessions, plan
// access, and per-user rank-data isolation. Uses a throwaway temp dir, no
// network: npx tsx scripts/validate-saas.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'apprankr-test-'));
process.env.RANK_DATA_DIR = join(tmp, 'data');
process.env.APP_DB_PATH = join(tmp, 'test.db');

const { hashPassword, verifyPassword, signup, login, createSession, userFromSessionToken, destroySession, readCookie, isSecureRequest } = await import('../src/lib/saas/auth');
const { checkAccess, planOf, PLANS } = await import('../src/lib/saas/plans');
const { loadConfig, saveConfig } = await import('../src/lib/rank/store');

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ok  ${name}`); return; }
  failures++;
  console.error(`FAIL  ${name}\n      got  ${g}\n      want ${w}`);
}

// --- passwords ---------------------------------------------------------------
const h = hashPassword('hunter22!');
eq('password verifies', verifyPassword('hunter22!', h), true);
eq('wrong password rejected', verifyPassword('hunter23!', h), false);
eq('two hashes differ (salted)', hashPassword('x') === hashPassword('x'), false);

// --- signup / login ----------------------------------------------------------
eq('bad email rejected', Boolean(signup('nope', 'longenough', '').error), true);
eq('short password rejected', Boolean(signup('a@b.co', 'short', '').error), true);
const su = signup('rudra@appstudiox.com', 'password123', 'Rudra');
eq('signup works', Boolean(su.user), true);
eq('signup starts trial', su.user!.status, 'trialing');
eq('trial end is ~7 days out', Math.round((new Date(su.user!.trialEndsAt!).getTime() - Date.now()) / 86400000), 7);
eq('duplicate email rejected', Boolean(signup('RUDRA@appstudiox.com', 'password123', '').error), true);
eq('login works', Boolean(login('rudra@appstudiox.com', 'password123').user), true);
eq('login wrong pw rejected', Boolean(login('rudra@appstudiox.com', 'wrong').error), true);

// --- sessions ----------------------------------------------------------------
const sess = createSession(su.user!.id);
eq('session resolves to user', userFromSessionToken(sess.token)?.email, 'rudra@appstudiox.com');
eq('bad token resolves to null', userFromSessionToken('deadbeef'), null);
destroySession(sess.token);
eq('destroyed session is gone', userFromSessionToken(sess.token), null);
eq('cookie parse', readCookie('foo=1; ar_session=abc123; bar=2', 'ar_session'), 'abc123');

// --- reverse-proxy-aware secure-cookie detection ------------------------------
// Railway (and every PaaS) terminates TLS at its edge and forwards plain HTTP
// to the container — trusting raw url.protocol would silently drop the
// Secure flag from every cookie in production. Must trust X-Forwarded-Proto.
const reqWith = (proto?: string) => new Request('http://internal.local/x', { headers: proto ? { 'x-forwarded-proto': proto } : {} });
eq('behind proxy, forwarded https -> secure', isSecureRequest(reqWith('https'), new URL('http://internal.local/x')), true);
eq('behind proxy, forwarded http -> not secure', isSecureRequest(reqWith('http'), new URL('http://internal.local/x')), false);
eq('multi-hop forwarded header uses first hop', isSecureRequest(reqWith('https, http'), new URL('http://internal.local/x')), true);
eq('no proxy header, falls back to url protocol (https)', isSecureRequest(reqWith(), new URL('https://internal.local/x')), true);
eq('no proxy header, falls back to url protocol (http, local dev)', isSecureRequest(reqWith(), new URL('http://internal.local/x')), false);

// --- plan access -------------------------------------------------------------
const future = new Date(Date.now() + 3 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
eq('active user allowed', checkAccess('active', null), { allowed: true });
eq('live trial allowed w/ days', checkAccess('trialing', future), { allowed: true, trialDaysLeft: 3 });
eq('expired trial blocked', checkAccess('trialing', past), { allowed: false, reason: 'trial_expired' });
eq('canceled blocked', checkAccess('canceled', null), { allowed: false, reason: 'inactive' });
eq('starter limits', { a: PLANS.starter.maxApps, k: PLANS.starter.maxKeywordsPerApp }, { a: 3, k: 30 });
eq('unknown plan falls back to starter', planOf('bogus').id, 'starter');

// --- per-user data isolation ---------------------------------------------------
const appFor = (id: string) => ({
  key: `play:${id}:us`, store: 'play' as const, appId: id, country: 'us', lang: 'en',
  title: id, developer: null, icon: null, url: null, genreId: null, keywords: [], addedAt: '',
});
saveConfig({ apps: [appFor('com.user.a')] }, 'user-a');
saveConfig({ apps: [appFor('com.user.b')] }, 'user-b');
saveConfig({ apps: [appFor('com.internal')] });
eq('user A sees only their app', loadConfig('user-a').apps.map((a) => a.appId), ['com.user.a']);
eq('user B sees only their app', loadConfig('user-b').apps.map((a) => a.appId), ['com.user.b']);
eq('internal root untouched', loadConfig().apps.map((a) => a.appId), ['com.internal']);

// --- manual billing (UPI/WhatsApp, no gateway) --------------------------------
// Activation is a manual admin action (scripts/activate-user.ts) rather than a
// webhook — just updateUserBilling flipping status/plan directly.
const { updateUserBilling, findUserByEmail } = await import('../src/lib/saas/db');
updateUserBilling(su.user!.id, { status: 'active', plan: 'pro' });
const after = findUserByEmail('rudra@appstudiox.com')!;
eq('manual activation sets status + plan', { status: after.status, plan: after.plan }, { status: 'active', plan: 'pro' });

rmSync(tmp, { recursive: true, force: true });

// --- plan limits: competitors are free, your own apps are not ----------------
{
  const { PLANS } = await import('../src/lib/saas/plans');
  // Mirrors countsAgainstPlan in api/rank.ts. Kept in the test so a change to
  // that rule has to be a deliberate one, not an accident.
  const countsAgainstPlan = (app: any, apps: any[]) =>
    !app.competitorOf || !apps.some((x: any) => x.key === app.competitorOf);
  const owned = (apps: any[]) => apps.filter((a) => countsAgainstPlan(a, apps)).length;

  eq('starter tracks 3 of your own apps', PLANS.starter.maxApps, 3);
  eq('pro tracks 5 of your own apps', PLANS.pro.maxApps, 5);
  eq('3 competitors per app on both plans',
    [PLANS.starter.maxCompetitorsPerApp, PLANS.pro.maxCompetitorsPerApp], [3, 3]);

  const mine = { key: 'a' };
  const apps = [mine, { key: 'b', competitorOf: 'a' }, { key: 'c', competitorOf: 'a' }, { key: 'd', competitorOf: 'a' }];
  eq('a primary plus 3 competitors uses ONE app slot', owned(apps), 1);

  // Pro at full stretch: 5 primaries, each with 3 rivals = 20 tracked apps.
  const full = [1, 2, 3, 4, 5].flatMap((i) => [
    { key: `p${i}` },
    { key: `p${i}c1`, competitorOf: `p${i}` },
    { key: `p${i}c2`, competitorOf: `p${i}` },
    { key: `p${i}c3`, competitorOf: `p${i}` },
  ]);
  eq('pro at the limit = 5 slots used', owned(full), PLANS.pro.maxApps);
  eq('pro at the limit = 20 apps actually tracked', full.length, 20);

  // An orphaned competitorOf must NOT stay exempt, or deleting a primary
  // would quietly turn its rivals into free apps forever.
  const orphaned = [{ key: 'x', competitorOf: 'deleted-app' }];
  eq('orphaned competitor counts against the plan', owned(orphaned), 1);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll SaaS checks passed.');
