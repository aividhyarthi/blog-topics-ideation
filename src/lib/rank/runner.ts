// Runs one tracker: labels the apps, checks every keyword, checks the
// category chart if set, and saves the result as that day's run. Shared by
// the manual "Recheck now" button and the automatic daily scheduler so both
// paths produce identical, comparable history entries.
import { labelApp, trackKeywords, categoryTopChartRank, aggregateTopCompetitors, compactKeywordResult } from './track';
import { saveRun, type Tracker, type TrackerRun } from './store';

export async function runTracker(tracker: Tracker): Promise<TrackerRun> {
  const targetAppIds = [tracker.primary, ...tracker.competitors];

  const [primary, competitors] = await Promise.all([
    labelApp(tracker.primary, tracker.lang, tracker.country),
    Promise.all(tracker.competitors.map((id) => labelApp(id, tracker.lang, tracker.country))),
  ]);

  const keywords = await trackKeywords(tracker.keywords, targetAppIds, {
    country: tracker.country, lang: tracker.lang, num: 250,
  });
  const topCompetitors = aggregateTopCompetitors(keywords, targetAppIds);

  let category = null;
  if (tracker.category) {
    category = await categoryTopChartRank(tracker.category, targetAppIds, {
      country: tracker.country, lang: tracker.lang, num: 200,
    });
  }

  const run: TrackerRun = {
    date: new Date().toISOString().slice(0, 10),
    ranAt: new Date().toISOString(),
    primary, competitors,
    keywords: keywords.map(compactKeywordResult),
    category, topCompetitors,
  };
  saveRun(tracker.id, run);
  return run;
}
