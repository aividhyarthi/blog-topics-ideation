// Fixture tests for the Rank Tracker's pure engine (src/lib/rank/track.ts) —
// no network needed, so this runs anywhere: npx tsx scripts/validate-rank.ts
import { findPosition, keywordRank, keywordTrends, chartTrend, mergeIntoSnapshot } from '../src/lib/rank/track';
import { parseAppInput } from '../src/lib/rank/fetch';
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
eq('ios url with country', parseAppInput('https://apps.apple.com/in/app/whatsapp-messenger/id310633997'), { store: 'ios', appId: '310633997', country: 'in' });
eq('ios url no country', parseAppInput('https://apps.apple.com/app/id310633997'), { store: 'ios', appId: '310633997', country: undefined });
eq('ios bare id', parseAppInput('id310633997'), { store: 'ios', appId: '310633997' });
eq('garbage', parseAppInput('not an app'), null);

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

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll rank-engine checks passed.');
