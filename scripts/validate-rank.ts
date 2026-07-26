// Fixture tests for the Rank Tracker's pure engine (src/lib/rank/track.ts) —
// no network needed, so this runs anywhere: npx tsx scripts/validate-rank.ts
import { findPosition, keywordRank, keywordTrends, chartTrend, mergeIntoSnapshot, bucketIndex, topCounts, countsFromBuckets, visibilityScore, overviewSeries, annotationImpact, keywordDifficulties, RANK_BUCKETS } from '../src/lib/rank/track';
import { parseAppInput } from '../src/lib/rank/fetch';
import { parseKeywordsWithVolumes } from '../src/lib/rank/keywords';
import type { RankSnapshot, TrackedApp } from '../src/lib/rank/types';

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ok  ${name}`); return; }
  failures++;
  console.error(`FAIL  ${name}\n      got  ${g}\n      want ${w}`);
}

// --- parseAppInput -----------------------------------------------------------
eq('play url', parseAppInput('https://play.google.com/store/apps/details?id=com.whatsapp&hl=en'), { store: 'play', appId: 'com.whatsapp' });
eq('play bare id', parseAppInput('com.picsart.studio'), { store: 'play', appId: 'com.picsart.studio' });
eq('play url with gl= country hint', parseAppInput('https://play.google.com/store/apps/details?id=in.kuvera.app&gl=IN&hl=en'), { store: 'play', appId: 'in.kuvera.app', country: 'in' });
eq('ios url with country', parseAppInput('https://apps.apple.com/in/app/whatsapp-messenger/id310633997'), { store: 'ios', appId: '310633997', country: 'in' });
eq('ios url no country', parseAppInput('https://apps.apple.com/app/id310633997'), { store: 'ios', appId: '310633997', country: undefined });
eq('ios bare id', parseAppInput('id310633997'), { store: 'ios', appId: '310633997' });
eq('garbage', parseAppInput('not an app'), null);

// --- parseKeywordsWithVolumes -------------------------------------------------
eq('tab-separated keyword+volume (spreadsheet paste)', parseKeywordsWithVolumes('photo editor\t5400\ncollage maker\t1200', 60),
  { keywords: ['photo editor', 'collage maker'], volumes: { 'photo editor': 5400, 'collage maker': 1200 } });
eq('comma keyword+volume', parseKeywordsWithVolumes('photo editor, 5400\ncollage maker, 1,200', 60),
  { keywords: ['photo editor', 'collage maker'], volumes: { 'photo editor': 5400, 'collage maker': 1200 } });
eq('back-compat: comma-separated keywords on one line, no volume', parseKeywordsWithVolumes('kw1, kw2, kw3', 60),
  { keywords: ['kw1', 'kw2', 'kw3'], volumes: {} });
eq('back-compat: one keyword per line, no volume', parseKeywordsWithVolumes('photo editor\ncollage maker', 60),
  { keywords: ['photo editor', 'collage maker'], volumes: {} });
eq('mixed: some lines with volume, some without', parseKeywordsWithVolumes('photo editor\t5400\nplain keyword', 60),
  { keywords: ['photo editor', 'plain keyword'], volumes: { 'photo editor': 5400 } });
eq('dedupes case-insensitively, keeps first volume seen', parseKeywordsWithVolumes('Photo Editor\t100\nphoto editor\t999', 60),
  { keywords: ['photo editor'], volumes: { 'photo editor': 100 } });
eq('respects max cap', parseKeywordsWithVolumes('a\nb\nc\nd', 2).keywords, ['a', 'b']);
eq('empty input', parseKeywordsWithVolumes('', 60), { keywords: [], volumes: {} });
eq('tab-separated abbreviated volume (40K)', parseKeywordsWithVolumes('mutual fund central\t40K', 60),
  { keywords: ['mutual fund central'], volumes: { 'mutual fund central': 40000 } });
eq('comma-separated abbreviated volume (1.2M)', parseKeywordsWithVolumes('mutual fund central, 1.2M', 60),
  { keywords: ['mutual fund central'], volumes: { 'mutual fund central': 1200000 } });
eq('lowercase b suffix', parseKeywordsWithVolumes('generic term\t2b', 60),
  { keywords: ['generic term'], volumes: { 'generic term': 2000000000 } });

// --- findPosition / keywordRank ---------------------------------------------
const hits = [{ appId: 'a', title: 'A' }, { appId: 'b', title: 'B' }, { appId: 'c', title: 'C' }, { appId: 'd', title: 'D' }];
eq('position found', findPosition('c', hits), 3);
eq('position missing', findPosition('zzz', hits), null);
eq('keywordRank top3', keywordRank('b', 'kw', hits, 100), {
  keyword: 'kw', position: 2, depth: 100,
  top: [{ appId: 'a', title: 'A' }, { appId: 'b', title: 'B' }, { appId: 'c', title: 'C' }],
});

// --- trends over snapshots ---------------------------------------------------
const app: TrackedApp = {
  key: 'play:com.x:us', store: 'play', appId: 'com.x', country: 'us', lang: 'en',
  title: 'X', developer: null, icon: null, url: null, genreId: null,
  keywords: ['alpha', 'beta', 'gamma'], addedAt: '2026-07-01T00:00:00Z',
};
const snap = (dateKey: string, alpha: number | null, beta: number | null, chartPos: number | null): RankSnapshot => ({
  dateKey, checkedAt: `${dateKey}T06:00:00Z`,
  apps: [{
    key: app.key, store: 'play', appId: 'com.x', country: 'us',
    keywords: [
      { keyword: 'alpha', position: alpha, depth: 100, top: [{ appId: 'top', title: 'Top App' }] },
      { keyword: 'beta', position: beta, depth: 100, top: [] },
    ],
    topChart: { position: chartPos, chart: 'Top Free', depth: 200 },
    score: 4.5, ratings: 1000,
  }],
});
const snaps = [snap('2026-07-01', 30, null, 80), snap('2026-07-02', 24, 90, 85), snap('2026-07-03', 27, null, 70)];

const trends = keywordTrends(app, snaps);
eq('alpha position', trends[0].position, 27);
eq('alpha delta (24→27 = dropped 3)', trends[0].delta, -3);
eq('alpha best', trends[0].best, 24);
eq('alpha history', trends[0].history, [30, 24, 27]);
eq('beta ranked→out has null delta', trends[1].delta, null);
eq('beta prevPosition', trends[1].prevPosition, 90);
eq('gamma never checked', { position: trends[2].position, best: trends[2].best }, { position: null, best: null });
eq('gamma checked flag is false (never in any snapshot)', trends[2].checked, false);
eq('alpha checked flag is true', trends[0].checked, true);

const ct = chartTrend(app, snaps);
eq('chart position', ct.position, 70);
eq('chart delta (85→70 = up 15)', ct.delta, 15);

// --- same-day re-check merge ---------------------------------------------------
const day = snap('2026-07-03', 10, 11, 5);
const merged = mergeIntoSnapshot(day, '2026-07-03', [{
  key: 'ios:123:us', store: 'ios', appId: '123', country: 'us', keywords: [], topChart: null, score: null, ratings: null,
}]);
eq('merge keeps other app', merged.apps.map((a) => a.key).sort(), ['ios:123:us', 'play:com.x:us']);
const remerged = mergeIntoSnapshot(merged, '2026-07-03', [snap('2026-07-03', 9, 12, 4).apps[0]]);
eq('re-check replaces same app', remerged.apps.find((a) => a.key === app.key)?.keywords[0].position, 9);
eq('new day drops old apps', mergeIntoSnapshot(day, '2026-07-04', []).apps, []);

// --- overview: buckets, counts, visibility -----------------------------------
eq('bucket #1', bucketIndex(1), 0);
eq('bucket #3', bucketIndex(3), 1);
eq('bucket #10', bucketIndex(10), 2);
eq('bucket #30', bucketIndex(30), 3);
eq('bucket #100', bucketIndex(100), 4);
eq('bucket #200', bucketIndex(200), 5);
eq('bucket unranked', bucketIndex(null), -1);

const positions = [1, 2, 9, 25, 80, 150, null];
eq('topCounts', topCounts(positions), { top1: 1, top10: 3, top30: 4, top100: 5 });
// countsFromBuckets must agree with topCounts for the same positions
const bkt = new Array(RANK_BUCKETS.length + 1).fill(0);
for (const p of positions) { const i = bucketIndex(p); bkt[i === -1 ? RANK_BUCKETS.length : i]++; }
eq('countsFromBuckets matches topCounts', countsFromBuckets(bkt), topCounts(positions));

eq('visibility of #1 only', visibilityScore([1]), 100);
eq('visibility unranked only', visibilityScore([null, null]), 0);
eq('visibility empty', visibilityScore([]), 0);
eq('visibility monotone', visibilityScore([1]) > visibilityScore([10]) && visibilityScore([10]) > visibilityScore([100]), true);

const ov = overviewSeries(app, snaps);
eq('overview day count', ov.length, 3);
// alpha=27 -> the 11-30 bucket; beta was searched and genuinely not found ->
// Unranked. gamma is in the keyword list but has no row in any snapshot (never
// searched), so it is NOT claimed as "Unranked" — that would assert a negative
// result the check never established. It's reported as `unchecked` instead.
eq('overview last day buckets (27→11-30, beta unranked, gamma excluded)', ov[2].buckets, [0, 0, 0, 1, 0, 0, 1]);
eq('overview tracked counts only keywords with a real result', ov[2].tracked, 2);
eq('overview reports the never-searched keyword separately', ov[2].unchecked, 1);
eq('overview has no failed checks in this fixture', ov[2].failed, 0);
eq('overview visibility > 0', ov[2].visibility > 0 && ov[2].visibility < 100, true);

// overview with an explicit keyword list (the coverage-list overview reuses
// this instead of app.keywords, since it checks a separate, larger list)
const covOv = overviewSeries(app, snaps, 30, ['alpha']);
eq('coverage overview tracked = 1 (alpha only)', covOv[2].tracked, 1);
eq('coverage overview visibility differs from full-keyword overview', covOv[2].visibility === ov[2].visibility, false);

// --- annotationImpact: before/after visibility around a dated marker --------
const ovDay = (dateKey: string, visibility: number) => ({ dateKey, buckets: [], visibility, tracked: 1 });
const annDays = [
  ovDay('2024-01-01', 20), ovDay('2024-01-08', 22), ovDay('2024-01-14', 18), // before
  ovDay('2024-01-15', 40), ovDay('2024-01-20', 45), ovDay('2024-01-28', 50), // after
];
const imp = annotationImpact(annDays, '2024-01-15', 14);
eq('annotation impact: before avg', imp.before.avgVisibility, 20);
eq('annotation impact: before day count', imp.before.days, 3);
eq('annotation impact: after avg', imp.after.avgVisibility, 45);
eq('annotation impact: after day count', imp.after.days, 3);
eq('annotation impact: delta', imp.delta, 25);

const impNoAfter = annotationImpact(annDays.slice(0, 3), '2024-01-15', 14);
eq('annotation impact: no data after -> delta null', impNoAfter.delta, null);
eq('annotation impact: no data after -> after days 0', impNoAfter.after.days, 0);

eq('annotation impact: empty days -> all null/zero', annotationImpact([], '2024-01-15'), {
  before: { avgVisibility: null, days: 0 }, after: { avgVisibility: null, days: 0 }, delta: null,
});

// --- keywordDifficulties: top-3 churn score ----------------------------------
const diffApp: TrackedApp = {
  key: 'play:com.me:us', store: 'play', appId: 'com.me', country: 'us', lang: 'en',
  title: 'Me', developer: null, icon: null, url: null, genreId: null,
  keywords: ['stable', 'churny', 'young'], addedAt: '2026-07-01T00:00:00Z',
};
const topSet = (ids: string[]) => ids.map((id) => ({ appId: id, title: id.toUpperCase() }));
const diffSnaps: RankSnapshot[] = ['01', '02', '03', '04', '05', '06'].map((d, i) => ({
  dateKey: `2026-07-${d}`, checkedAt: `2026-07-${d}T00:00:00Z`,
  apps: [{
    key: diffApp.key, store: 'play', appId: 'com.me', country: 'us',
    keywords: [
      // Same 3 incumbents, same #1, every day → entrenched → Hard.
      { keyword: 'stable', position: 50, depth: 200, top: topSet(['a', 'b', 'c']) },
      // A different top-3 every day (9 unique apps by day 3) → churny → Easy.
      { keyword: 'churny', position: 50, depth: 200, top: topSet([`x${i}`, `y${i}`, `z${i}`]) },
      // Only 2 days of observations → below minDays → null.
      ...(i < 2 ? [{ keyword: 'young', position: 50, depth: 200, top: topSet(['a', 'b', 'c']) }] : []),
    ],
    topChart: null, score: null, ratings: null,
  }],
}));
const diffs = keywordDifficulties(diffApp, diffSnaps, ['stable', 'churny', 'young', 'never-checked']);
eq('difficulty: entrenched top-3 scores Hard', diffs['stable']!.label, 'Hard');
eq('difficulty: entrenched score is 100', diffs['stable']!.score, 100);
eq('difficulty: full-churn top-3 scores Easy', diffs['churny']!.label, 'Easy');
eq('difficulty: too few observed days -> null', diffs['young'], null);
eq('difficulty: never-checked keyword -> null', diffs['never-checked'], null);
eq('difficulty: own app excluded from incumbents',
  keywordDifficulties(diffApp, diffSnaps.map((s) => ({
    ...s,
    apps: [{ ...s.apps[0], keywords: s.apps[0].keywords.map((k) => k.keyword === 'stable' ? { ...k, top: topSet(['com.me', 'b', 'c']) } : k) }],
  })), ['stable'])['stable']!.label, 'Hard');

// --- trends: pure parsing/averaging (no network) -----------------------------
const { stripXssiPrefix, averageRecentValue } = await import('../src/lib/rank/trends');
eq('strips XSSI prefix', stripXssiPrefix(")]}',\n{\"a\":1}"), '{"a":1}');
eq('strips XSSI prefix no comma', stripXssiPrefix(")]}'\n{\"a\":1}"), '{"a":1}');
eq('passes through clean json', stripXssiPrefix('{"a":1}'), '{"a":1}');
eq('average of empty is null', averageRecentValue([]), null);
eq('average of recent 4 points', averageRecentValue([{ value: [10] }, { value: [20] }, { value: [30] }, { value: [40] }]), 25);
eq('averages only the last window', averageRecentValue([{ value: [0] }, { value: [100] }, { value: [100] }, { value: [100] }, { value: [100] }], 4), 100);
eq('clamps and rounds', averageRecentValue([{ value: [33] }, { value: [34] }]), 34);
eq('missing value treated as 0', averageRecentValue([{}, { value: [50] }]), 25);

// --- keyword discovery: candidate extraction ---------------------------------
const { candidatesFromListing } = await import('../src/lib/rank/discover');
const cands = candidatesFromListing(
  'CRED: UPI, Credit Cards, Bills',
  'Pay credit card bills, use UPI payments, earn rewards',
  'CRED is a payments app. Pay your credit card bills on time. UPI payments made simple. Credit card bill payment earns rewards. Track credit score.',
);
eq('candidates include bigram', cands.includes('credit card'), true);
eq('candidates include upi term', cands.some((c) => c.includes('upi')), true);
eq('candidates drop stopwords', cands.some((c) => /\b(the|and|your|app)\b/.test(c)), false);
eq('candidates lowercase', cands.every((c) => c === c.toLowerCase()), true);

// --- config storage: backups + corrupt-file safety --------------------------
{
  const { mkdtempSync, rmSync: rmSyncFs, writeFileSync, existsSync: existsSyncFs } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tmp = mkdtempSync(join(tmpdir(), 'rank-store-test-'));
  process.env.RANK_DATA_DIR = tmp;
  // Fresh import so the module picks up the new RANK_DATA_DIR (it reads the
  // env var lazily inside functions, so re-importing isn't strictly required,
  // but keeps this test isolated from anything imported earlier in the file).
  const { loadConfig: lc, saveConfig: sc, listConfigBackups, restoreConfigBackup, ConfigReadError: CRE } = await import('../src/lib/rank/store');

  const appFor = (id: string): TrackedApp => ({
    key: `play:${id}:us`, store: 'play', appId: id, country: 'us', lang: 'en',
    title: id, developer: null, icon: null, url: null, genreId: null, keywords: [], addedAt: '',
  });

  eq('fresh user has no apps', lc('u1').apps, []);
  sc({ apps: [appFor('com.a')] }, 'u1');
  eq('save persists', lc('u1').apps.map((a) => a.appId), ['com.a']);
  eq('no backup yet (nothing to back up on first save)', listConfigBackups('u1').length, 0);

  sc({ apps: [appFor('com.a'), appFor('com.b')] }, 'u1');
  eq('second save persists both', lc('u1').apps.map((a) => a.appId), ['com.a', 'com.b']);
  eq('one backup created (of the pre-save state)', listConfigBackups('u1').length, 1);

  // Corrupt the file directly (simulating a truncated/bad write) and confirm
  // loadConfig refuses to silently treat it as "zero apps".
  const cfgPath = join(tmp, 'users', 'u1', 'config.json');
  writeFileSync(cfgPath, '{ "apps": [ this is not valid json');
  let threw = false;
  try { lc('u1'); } catch (e) { threw = e instanceof CRE; }
  eq('corrupt config throws ConfigReadError instead of returning empty', threw, true);

  // Restore from the backup and confirm the real data comes back.
  const backups = listConfigBackups('u1');
  const restored = restoreConfigBackup(backups[0], 'u1');
  eq('restored backup has the app', restored.apps.map((a) => a.appId), ['com.a']);
  eq('loadConfig works again after restore', lc('u1').apps.map((a) => a.appId), ['com.a']);

  rmSyncFs(tmp, { recursive: true, force: true });
  delete process.env.RANK_DATA_DIR;
}

// --- persistence check --------------------------------------------------------
{
  const { mkdtempSync, rmSync: rmSyncFs, readFileSync: readFileSyncFs } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { checkDataPersistence } = await import('../src/lib/rank/persistence-check');

  const before = process.env.RANK_DATA_DIR;
  delete process.env.RANK_DATA_DIR;
  const noVar = checkDataPersistence();
  eq('missing RANK_DATA_DIR warns', typeof noVar === 'string' && noVar.includes('RANK_DATA_DIR is not set'), true);

  const tmp = mkdtempSync(join(tmpdir(), 'persistence-test-'));
  process.env.RANK_DATA_DIR = tmp;
  eq('first boot with a real dir is clean (no warning)', checkDataPersistence(), null);
  eq('second boot in the same dir is also clean', checkDataPersistence(), null);
  const canary = JSON.parse(readFileSyncFs(join(tmp, '.persistence-canary.json'), 'utf8'));
  eq('boot count accumulates across restarts', canary.bootCount, 2);

  rmSyncFs(tmp, { recursive: true, force: true });
  if (before) process.env.RANK_DATA_DIR = before; else delete process.env.RANK_DATA_DIR;
}

// --- nightly scheduler: hourly retries across the 12am-12pm IST window ------
{
  delete process.env.NIGHTLY_CHECK_UTC; // use the 18:30 UTC default for these
  const { nextRunAt } = await import('../src/lib/rank/scheduler');
  const iso = (d: Date) => d.toISOString();

  eq('before the window: next run is today\'s window start',
    iso(nextRunAt(new Date('2026-07-17T10:00:00.000Z'))), '2026-07-17T18:30:00.000Z');
  eq('just after window start: next run is +1h',
    iso(nextRunAt(new Date('2026-07-17T18:45:00.000Z'))), '2026-07-17T19:30:00.000Z');
  eq('mid-window (spans UTC midnight): next run is the next hourly tick',
    iso(nextRunAt(new Date('2026-07-18T02:00:00.000Z'))), '2026-07-18T02:30:00.000Z');
  eq('a restart mid-window resumes within the hour, not tomorrow',
    iso(nextRunAt(new Date('2026-07-18T02:31:00.000Z'))), '2026-07-18T03:30:00.000Z');
  eq('at the window\'s last tick: next run is tomorrow\'s window start',
    iso(nextRunAt(new Date('2026-07-18T06:30:00.000Z'))), '2026-07-18T18:30:00.000Z');
  eq('just after the window ends: next run is tonight\'s window start',
    iso(nextRunAt(new Date('2026-07-18T07:00:00.000Z'))), '2026-07-18T18:30:00.000Z');
}


// --- check windows: staggering apps so they don't all hit the store at once ---
{
  const { isWithinCheckWindow, mergeSnapshotSets, overviewSeries } = await import('../src/lib/rank/track');
  const mk = (w?: { startHour: number; endHour: number }) =>
    ({ key: 'play:x:in', store: 'play', appId: 'x', country: 'in', lang: 'en', title: 'X',
       developer: null, icon: null, url: null, genreId: null, keywords: ['a'], addedAt: '', checkWindow: w }) as any;
  // 2026-07-22 is a Wednesday. IST = UTC+5:30.
  const wedUtc = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 22, h, m)); // hour is UTC
  // 00:30 IST == 19:00 UTC on the previous day.
  const istWed = (istHour: number) => new Date(Date.UTC(2026, 6, 21, 18, 30) + istHour * 3600 * 1000);
  eq('no window set -> always allowed', isWithinCheckWindow(mk(), istWed(9)), true);
  eq('inside 0-4 window at 1am IST', isWithinCheckWindow(mk({ startHour: 0, endHour: 4 }), istWed(1)), true);
  eq('outside 0-4 window at 5am IST', isWithinCheckWindow(mk({ startHour: 0, endHour: 4 }), istWed(5)), false);
  eq('inside 4-8 window at 5am IST', isWithinCheckWindow(mk({ startHour: 4, endHour: 8 }), istWed(5)), true);
  eq('window boundary is exclusive at the end', isWithinCheckWindow(mk({ startHour: 0, endHour: 4 }), istWed(4)), false);
  // 2026-07-25 is a Saturday -> windows ignored entirely.
  const istSat = (istHour: number) => new Date(Date.UTC(2026, 6, 24, 18, 30) + istHour * 3600 * 1000);
  eq('weekend ignores the window', isWithinCheckWindow(mk({ startHour: 0, endHour: 4 }), istSat(15)), true);
  // A window that wraps past midnight.
  eq('wrapping window 22-2 includes 23:00', isWithinCheckWindow(mk({ startHour: 22, endHour: 2 }), istWed(23)), true);
  eq('wrapping window 22-2 excludes 12:00', isWithinCheckWindow(mk({ startHour: 22, endHour: 2 }), istWed(12)), false);

  // --- merged snapshots: a keyword checked by EITHER run must show its rank ---
  const app = { key: 'play:x:in', keywords: ['shared', 'dailyonly'] } as any;
  const daily = [{ dateKey: '2026-07-22', checkedAt: 'T2', apps: [
    { key: 'play:x:in', store: 'play', appId: 'x', country: 'in', topChart: null, score: null, ratings: null,
      keywords: [{ keyword: 'shared', position: 7, depth: 200, top: [] }] } ] }] as any;
  const coverage = [{ dateKey: '2026-07-22', checkedAt: 'T1', apps: [
    { key: 'play:x:in', store: 'play', appId: 'x', country: 'in', topChart: null, score: null, ratings: null,
      keywords: [{ keyword: 'shared', position: null, depth: 200, top: [], error: 'rate limited' },
                 { keyword: 'covonly', position: 33, depth: 200, top: [] }] } ] }] as any;
  const merged = mergeSnapshotSets(coverage, daily);
  const kws = merged[0].apps[0].keywords;
  const find = (k: string) => kws.find((x: any) => x.keyword === k);
  eq('merged: daily rank wins over coverage error', find('shared').position, 7);
  eq('merged: daily result clears the error', find('shared').error, undefined);
  eq('merged: coverage-only keyword survives', find('covonly').position, 33);
  eq('merged: one row per keyword', kws.length, 2);

  // --- errored/unchecked keywords must not be counted as "Unranked" ---
  const errApp = { key: 'play:x:in', keywords: ['shared', 'broken', 'never'] } as any;
  const errSnaps = [{ dateKey: '2026-07-22', checkedAt: 'T', apps: [
    { key: 'play:x:in', store: 'play', appId: 'x', country: 'in', topChart: null, score: null, ratings: null,
      keywords: [{ keyword: 'shared', position: 5, depth: 200, top: [] },
                 { keyword: 'broken', position: null, depth: 200, top: [], error: 'boom' }] } ] }] as any;
  const ov = overviewSeries(errApp, errSnaps, 30, errApp.keywords)[0];
  eq('overview counts the failed check separately', ov.failed, 1);
  eq('overview counts the never-searched keyword separately', ov.unchecked, 1);
  eq('overview does not bucket them as Unranked', ov.buckets[ov.buckets.length - 1], 0);
  eq('overview visibility ignores failed/unchecked', ov.tracked, 1);
}


// --- insights: the "why", especially non-listing causes ----------------------
{
  const { buildInsights } = await import('../src/lib/rank/insights');
  const mkApp = (key: string, title: string) => ({ key, title, store: 'play', appId: 'x', country: 'in',
    lang: 'en', developer: null, icon: null, url: null, genreId: null, keywords: [], addedAt: '' }) as any;
  const kw = (keyword: string, position: number | null, extra: any = {}) =>
    ({ keyword, position, prevPosition: null, delta: null, best: position, history: [], top: [], checked: true, ...extra }) as any;
  const rating = (negativeShare: number, tone: string) =>
    ({ dateKey: '2026-07-22', total: 100, negativeShare, tone, windowDays: 28 }) as any;

  // A rival is ahead AND materially healthier on reviews -> the report must
  // name reviews as a listing-INDEPENDENT cause, not suggest a copy rewrite.
  const res = buildInsights({
    app: mkApp('me', 'My App'),
    trends: [kw('a', 20), kw('b', 30), kw('c', 40)],
    rating: rating(18, 'bad'),
    ratingHistory: [rating(9, 'mid'), rating(18, 'bad')],
    annotations: [],
    chart: null,
    competitors: [{ app: mkApp('them', 'Rival'), trends: [kw('a', 2), kw('b', 3), kw('c', 4)], rating: rating(4, 'good') }],
  });
  const comp = res.find((r) => r.kind === 'competitor')!;
  eq('insight: competitor ahead is flagged', comp.tone, 'bad');
  eq('insight: head-to-head is counted', comp.detail.includes('3 of 3'), true);
  eq('insight: names the review-quality gap', comp.detail.includes('14pt review-quality gap'), true);
  eq('insight: says it is not a copy fix', comp.detail.includes('not a keyword or copy fix'), true);
  const rev = res.find((r) => r.kind === 'reviews')!;
  eq('insight: bad review health flagged', rev.tone, 'bad');
  eq('insight: rising 1-2 star share noted', rev.title.includes('up 9pt'), true);

  // Inverse case: ahead of me, but MY reviews are healthier -> must NOT blame reviews.
  const res2 = buildInsights({
    app: mkApp('me', 'My App'),
    trends: [kw('a', 20)], rating: rating(3, 'good'), ratingHistory: [rating(3, 'good')],
    annotations: [], chart: null,
    competitors: [{ app: mkApp('them', 'Rival'), trends: [kw('a', 2)], rating: rating(15, 'bad') }],
  });
  const comp2 = res2.find((r) => r.kind === 'competitor')!;
  eq('insight: does not blame reviews when mine are better', comp2.detail.includes('reviews are not what is putting them ahead'), true);

  // A short category-chart response must be surfaced as a caveat, not a verdict.
  const res3 = buildInsights({
    app: mkApp('me', 'My App'), trends: [kw('a', 5)], rating: null, ratingHistory: [],
    annotations: [], competitors: [],
    chart: { position: null, chart: 'Top Free · FINANCE', depth: 48 },
  });
  eq('insight: short chart response is caveated', res3.some((r) => r.kind === 'chart' && r.title.includes('48')), true);

  // Errored/unchecked keywords are called out so the scores aren't over-read.
  const res4 = buildInsights({
    app: mkApp('me', 'My App'),
    trends: [kw('a', 5), kw('b', null, { error: 'boom' }), kw('c', null, { checked: false })],
    rating: null, ratingHistory: [], annotations: [], competitors: [], chart: null,
  });
  eq('insight: data-quality caveat counts both cases', res4.some((r) => r.kind === 'coverage' && r.title.startsWith('2 keywords')), true);
}


// --- universe chart must plot the LIST size, not how far the run got --------
{
  const { universeSizeSeries } = await import('../src/lib/rank/track');
  const app = { key: 'a', keywords: [] } as any;
  const row = (n: number, listSize?: number) => ({
    key: 'a', store: 'play', appId: 'a', country: 'in', topChart: null, score: null, ratings: null,
    listSize,
    keywords: Array.from({ length: n }, (_, i) => ({ keyword: `k${i}`, position: 5, depth: 200, top: [] })),
  });
  // Day 2 is a partially-finished coverage run: 359 of 645 rows written.
  const snaps = [
    { dateKey: '2026-07-25', checkedAt: 'T', apps: [row(645, 645)] },
    { dateKey: '2026-07-26', checkedAt: 'T', apps: [row(359, 645)] },
  ] as any;
  const series = universeSizeSeries(app, snaps);
  eq('a partially-checked day does NOT read as a shrinking universe',
    series.map((p) => p.count), [645, 645]);
  // Snapshots written before listSize existed keep their old meaning.
  const legacy = [{ dateKey: '2026-07-20', checkedAt: 'T', apps: [row(500)] }] as any;
  eq('legacy rows fall back to the row count', universeSizeSeries(app, legacy)[0].count, 500);
}

// --- shared coverage budget must not starve the last app -------------------
{
  // Mirrors the allocation in nightly.ts. The old code passed the whole
  // remaining budget to each app in turn, so the first consumed it all.
  const alloc = (totalMs: number, appCount: number) => {
    const out: number[] = [];
    let remaining = totalMs;
    for (let i = 0; i < appCount; i++) {
      const share = Math.max(30_000, Math.floor(remaining / (appCount - i)));
      const spent = Math.min(share, remaining);
      out.push(spent);
      remaining -= spent;
    }
    return out;
  };
  eq('two apps split a 20 minute budget evenly', alloc(20 * 60_000, 2), [600_000, 600_000]);
  eq('no app is left with zero time', alloc(20 * 60_000, 4).every((n) => n > 0), true);
  eq('the whole budget is used, not overspent',
    alloc(20 * 60_000, 3).reduce((a, b) => a + b, 0), 20 * 60_000);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll rank-engine checks passed.');
