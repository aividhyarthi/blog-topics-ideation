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

// --- read-only app sharing (grants) -----------------------------------------
{
  const { createGrant, listGrantsByOwner, deleteGrant, deleteGrantee, deleteGrantsForApp } = await import('../src/lib/saas/db');
  const { resolveWorkspace, isGuest, visibleApps, expandWithCompetitors, assertCanGrant, billingUserFor } = await import('../src/lib/saas/grants');
  const { signup: su2 } = await import('../src/lib/saas/auth');

  const owner = su2('owner-share@test.com', 'password123', 'Owner').user!;
  const client = su2('client-share@test.com', 'password123', 'Client').user!;

  // Owner tracks two clients' apps, each with a competitor.
  saveConfig({ apps: [
    { key: 'play:kuvera', title: 'Kuvera' },
    { key: 'play:kuvera-rival', title: 'Rival', competitorOf: 'play:kuvera' },
    { key: 'play:cred', title: 'Cash by CRED' },
  ] } as any, owner.id);

  // Before any grant, everyone is their own owner with the full workspace.
  eq('no grants = own workspace', resolveWorkspace(client),
    { ownerId: client.id, appKeys: null, readOnly: false, sharedByEmail: null, mode: 'own', canSwitch: false, granteeEmail: null });
  eq('no grants = not a guest', isGuest(client), false);

  createGrant(owner.id, 'client-share@test.com', 'play:kuvera');
  const ws = resolveWorkspace(client);
  eq('grant points the guest at the owner', ws.ownerId, owner.id);
  eq('grant is read-only', ws.readOnly, true);
  eq('guest is told whose data it is', ws.sharedByEmail, owner.email);
  eq('grant is now a guest', isGuest(client), true);

  // The granted app brings its competitor (Compare needs it) but never the
  // other client's app — that is the whole point of the feature.
  const apps = loadConfig(owner.id).apps;
  const seen = visibleApps(apps, ws).map((a) => a.key).sort();
  eq('guest sees the granted app and its competitor', seen, ['play:kuvera', 'play:kuvera-rival']);
  eq('guest does NOT see the other client app', seen.includes('play:cred'), false);
  eq('competitor expansion never pulls in a primary',
    expandWithCompetitors(apps, ['play:kuvera']).sort(), ['play:kuvera', 'play:kuvera-rival']);

  // Cross-client leak guard. If one client's app is ALSO flagged as a
  // competitor of another client's app, granting the second must not hand
  // over the first — the implicit pull-in has to skip anything already
  // shared with somebody else.
  {
    const crossed = [
      { key: 'play:kuvera', title: 'Kuvera' },
      { key: 'play:cred', title: 'Cash by CRED', competitorOf: 'play:kuvera' },
      { key: 'play:plainrival', title: 'Plain rival', competitorOf: 'play:kuvera' },
    ] as any[];
    eq('a co-client app is NOT pulled in as a competitor',
      expandWithCompetitors(crossed, ['play:kuvera'], ['play:cred']).sort(),
      ['play:kuvera', 'play:plainrival']);
    eq('a genuine competitor still comes along',
      expandWithCompetitors(crossed, ['play:kuvera'], ['play:cred']).includes('play:plainrival'), true);
    eq('explicitly granting that app still works',
      expandWithCompetitors(crossed, ['play:cred'], ['play:cred']).includes('play:cred'), true);
  }

  // The owner's own view is untouched by having issued a grant.
  eq('owner still sees everything', visibleApps(apps, resolveWorkspace(owner)).length, 3);

  // A guest rides on the OWNER's subscription, not their own dead trial.
  eq('guest bills to the owner', billingUserFor(client).id, owner.id);
  eq('owner bills to themselves', billingUserFor(owner).id, owner.id);

  // Guard rails on creating a grant.
  eq('cannot grant to yourself', Boolean(assertCanGrant(owner.id, owner.email, owner.email)), true);
  eq('rejects a malformed email', Boolean(assertCanGrant(owner.id, owner.email, 'not-an-email')), true);
  const owner2 = su2('owner2-share@test.com', 'password123', 'Owner2').user!;
  eq('cannot be a guest of two owners', Boolean(assertCanGrant(owner2.id, owner2.email, 'client-share@test.com')), true);
  eq('a fresh email is grantable', assertCanGrant(owner.id, owner.email, 'brand-new@test.com'), null);

  // Several people can share ONE app — there is no per-app grantee limit.
  for (const e of ['viewer1@test.com', 'viewer2@test.com', 'viewer3@test.com']) {
    createGrant(owner.id, e, 'play:kuvera');
  }
  eq('three emails can share one app',
    listGrantsByOwner(owner.id).filter((g) => g.appKey === 'play:kuvera').length, 4);

  // An account that tracks its OWN apps can also be a guest: it keeps its own
  // workspace by default and switches to the shared one explicitly. This is
  // what used to be blocked outright.
  const both = su2('hasownapps@test.com', 'password123', 'Self').user!;
  saveConfig({ apps: [{ key: 'play:theirown', title: 'Their own app' }] } as any, both.id);
  eq('an account with its own apps IS grantable now', assertCanGrant(owner.id, owner.email, 'hasownapps@test.com'), null);
  createGrant(owner.id, 'hasownapps@test.com', 'play:kuvera');

  const ownWs = resolveWorkspace(both);
  eq('defaults to their OWN workspace', { owner: ownWs.ownerId === both.id, ro: ownWs.readOnly }, { owner: true, ro: false });
  eq('own workspace is not filtered', ownWs.appKeys, null);
  eq('offered a switcher', ownWs.canSwitch, true);
  eq('not a guest while in their own workspace', isGuest(both), false);

  const sharedWs = resolveWorkspace(both, 'shared');
  eq('switching lands on the owner workspace', sharedWs.ownerId, owner.id);
  eq('shared workspace is read-only', sharedWs.readOnly, true);
  eq('shared workspace is filtered', sharedWs.appKeys, ['play:kuvera']);
  eq('is a guest while viewing the shared workspace', isGuest(both, 'shared'), true);
  eq('their own apps are untouched by the share', loadConfig(both.id).apps.length, 1);

  // Billing follows the workspace being viewed, not the account.
  eq('bills to self in own workspace', billingUserFor(both).id, both.id);
  eq('bills to owner in shared workspace', billingUserFor(both, 'shared').id, owner.id);

  // Re-granting is idempotent, not a duplicate row.
  createGrant(owner.id, 'client-share@test.com', 'play:kuvera');
  eq('re-granting the same app is a no-op',
    listGrantsByOwner(owner.id).filter((g) => g.granteeEmail === 'client-share@test.com').length, 1);

  // Revoking one app of several leaves the rest.
  createGrant(owner.id, 'client-share@test.com', 'play:cred');
  eq('second grant lands', resolveWorkspace(client).appKeys!.sort(), ['play:cred', 'play:kuvera']);
  deleteGrant(owner.id, 'client-share@test.com', 'play:cred');
  eq('revoking one app keeps the other', resolveWorkspace(client).appKeys, ['play:kuvera']);

  // Untracking an app must not leave a live grant behind for a re-add.
  createGrant(owner.id, 'client-share@test.com', 'play:cred');
  deleteGrantsForApp(owner.id, 'play:cred');
  eq('untracking an app drops its grants', resolveWorkspace(client).appKeys, ['play:kuvera']);

  // Full revoke returns the guest to being an ordinary (own-workspace) user.
  deleteGrantee(owner.id, 'client-share@test.com');
  eq('full revoke ends the share', isGuest(client), false);
  eq('ex-guest is their own owner again', resolveWorkspace(client).ownerId, client.id);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll SaaS checks passed.');
