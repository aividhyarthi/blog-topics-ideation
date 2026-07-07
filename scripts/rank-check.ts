// Scheduled ranking check — standalone-process entry point. Wire this to a
// daily scheduler (Railway cron `0 6 * * *` → `npx tsx scripts/rank-check.ts`,
// as its OWN separate Railway service, with RANK_DATA_DIR on the shared
// Volume) so trends accrue without anyone opening the UI.
//
// If sharing a Volume across two Railway services isn't practical on your
// plan, use src/pages/api/cron/rank-check.ts instead — it runs the exact
// same logic (see src/lib/rank/nightly.ts) as an HTTP endpoint on the
// already-deployed website, so any external URL-ping scheduler can trigger
// it with zero extra Railway services or volumes.
import { runNightlyCheck } from '../src/lib/rank/nightly';

const { lines } = await runNightlyCheck();
for (const line of lines) console.log(line);
