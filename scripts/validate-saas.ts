// Fixture tests for the AppRankr SaaS core — auth hashing, sessions, plan
// access, and per-user rank-data isolation. Uses a throwaway temp dir, no
// network: npx tsx scripts/validate-saas.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'apprankr-test-'));
process.env.RANK_DATA_DIR = join(tmp, 'data');
process.env.APP_DB_PATH = join(tmp, 'test.db');

const { hashPassword, verifyPassword, signup, login, createSession, userFromSessionToken, destroySession, readCookie } = await import('../src/lib/saas/auth');
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

rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll SaaS checks passed.');
