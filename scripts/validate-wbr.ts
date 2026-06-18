// Dev-only: run the WBR engine against local SEMrush CSVs and print the tables
// so we can eyeball them against the published May report. Not shipped.
//   npx tsx scripts/validate-wbr.ts <dataDir> <beauty|fashion>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from '../src/lib/wbr/parse';
import { buildReport } from '../src/lib/wbr/report';

const dir = process.argv[2] ?? '.data/beauty';
const vertical = (process.argv[3] ?? 'beauty') as 'beauty' | 'fashion';

const files = readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.csv'))
  .map((f) => parseFile(f, readFileSync(join(dir, f), 'utf8')));

console.log('Parsed files:');
for (const f of files) console.log(`  ${f.brand.padEnd(8)} ${f.type.padEnd(12)} ${f.fileName} (${f.topics?.length ?? f.sources?.length ?? 0} rows)`);

const r = buildReport(files, { vertical });

console.log('\n=== SUMMARY SCORECARD ===');
console.log(['brand', 'topics', 'avgVis', 'mentions', 'volume', '>=80', '>=60'].join('\t'));
for (const s of r.summary)
  console.log([s.brand, s.topicsInVertical, s.avgVisibility, s.totalMentions, s.totalVolume, s.topics80, s.topics60].join('\t'));

console.log('\n=== CATEGORY SCORECARD (primary) ===');
console.log(['category', 'topics', 'avgVis', 'avgMent', 'volume', 'signal'].join('\t'));
let tot = 0;
for (const c of r.categoryScorecard) { console.log([c.category, c.topics, c.avgVisibility, c.avgMentions, c.totalVolume, c.signal].join('\t')); tot += c.topics; }
console.log('SUM topics in scorecard:', tot);

console.log('\n=== GAP ANALYSIS (top 12) ===');
for (const g of r.gaps.slice(0, 12)) console.log([g.priority, g.volume, g.category, g.topic, JSON.stringify(g.competitors)].join('\t'));
console.log('total gaps:', r.gaps.length);

console.log('\n=== BRAND COMPARISON (mentions by category) ===');
console.log(['category', ...r.brandsPresent].join('\t'));
for (const b of r.brandComparison) console.log([b.category, ...r.brandsPresent.map((br) => b.mentions[br] ?? '-')].join('\t'));

console.log('\n=== REVIEW QUEUE (unmatched, first 25 of', r.reviewQueue.length, ') ===');
for (const q of r.reviewQueue.slice(0, 25)) console.log(' ', q.category, '::', q.topic);
