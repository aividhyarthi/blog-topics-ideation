// One-off generator: build the report from a local CSV folder and write a
// standalone HTML file (open in a browser, Print->PDF) + an Excel workbook.
//   npx tsx scripts/generate-report.ts <dataDir> <beauty|fashion> <outBase> [label]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseFile } from '../src/lib/wbr/parse';
import { buildReport, type WbrReport } from '../src/lib/wbr/report';

const dir = process.argv[2] ?? '.data/beauty';
const vertical = (process.argv[3] ?? 'beauty') as 'beauty' | 'fashion';
const outBase = process.argv[4] ?? 'Nykaa_Beauty_WBR';
const label = process.argv[5] ?? `Nykaa ${cap(vertical)} · AI Visibility`;

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'))
  .map((f) => parseFile(f, readFileSync(join(dir, f), 'utf8')));
const rep = buildReport(files, { vertical });

// ---------- helpers ----------
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
const fmt = (n: number | undefined) => (typeof n === 'number' ? n.toLocaleString('en-IN') : '-');
const r1 = (n: number | undefined) => (typeof n === 'number' ? n.toFixed(1) : '-');
const g = (b: string) => rep.summary.find((s) => s.brand === b) ?? ({} as any);

// ---------- Excel ----------
function buildXlsx(rep: WbrReport, path: string) {
  const brands = rep.brandsPresent, B = brands.map(cap);
  const wb = XLSX.utils.book_new();
  const add = (name: string, aoa: any[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31));
  add('Summary', [['Metric', ...B],
    ['Topics in their 1K', ...brands.map((b) => g(b).topicsInVertical)],
    ['Avg AI visibility', ...brands.map((b) => g(b).avgVisibility)],
    ['Total mentions', ...brands.map((b) => g(b).totalMentions)],
    ['Total search volume', ...brands.map((b) => g(b).totalVolume)],
    ['Topics >= 60', ...brands.map((b) => g(b).topics60)],
    ['Topics >= 80', ...brands.map((b) => g(b).topics80)]]);
  add('Category Scorecard', [['Category', 'Topics', 'Avg vis', 'Avg mentions', 'Search volume', 'Leader', 'Signal'],
    ...rep.categoryScorecard.map((c) => [c.category, c.topics, c.avgVisibility, c.avgMentions, c.totalVolume, c.leader, c.signal])]);
  add('Protect', [['Category', 'Topic', 'Visibility', 'Mentions', 'Search volume', 'Status'],
    ...rep.protect.map((t) => [t.category, t.topic, t.visibility, t.mentions, t.volume, t.status])]);
  const cB = ['amazon', 'myntra', 'tira', 'flipkart'].filter((b) => rep.gaps.some((x) => x.competitors[cap(b)] !== undefined));
  add('Gap Analysis', [['Priority', 'Category', 'Topic', ...cB.map(cap), 'Search volume'],
    ...rep.gaps.map((gp) => [gp.priority, gp.category, gp.topic, ...cB.map((b) => gp.competitors[cap(b)] ?? 0), gp.volume])]);
  add('Brand Comparison', [['Category', ...B],
    ...rep.brandComparison.map((bc) => [bc.category, ...brands.map((b) => bc.mentions[b] ?? 0)])]);
  if (rep.sourceAnalysis.length) add('Cited Sources', [['Page type', ...B],
    ...rep.sourceAnalysis.map((s) => [s.pageType, ...brands.map((b) => s.count[b] ?? 0)])]);
  if (rep.reviewQueue.length) add('Review Queue', [['Topic', 'Assigned bucket'], ...rep.reviewQueue.map((q) => [q.topic, q.category])]);
  XLSX.writeFile(wb, path);
}

// ---------- HTML ----------
function table(headers: string[], rows: string[][], numCols: number[] = []) {
  const th = headers.map((h, i) => `<th class="${numCols.includes(i) ? 'num' : ''}">${h}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td class="${numCols.includes(i) ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('');
  return `<div class="tw"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function sec(title: string, sub: string, t: string) { return `<section><h2>${title}</h2><p class="sub">${sub}</p>${t}</section>`; }

function buildHtml(rep: WbrReport): string {
  const brands = rep.brandsPresent;
  const p = g('nykaa');
  const cB = ['amazon', 'myntra', 'tira', 'flipkart'].filter((b) => rep.gaps.some((x) => x.competitors[cap(b)] !== undefined));
  const kpis = `<div class="kpis">
    ${kpi(fmt(p.topicsInVertical), `${cap(rep.vertical)} topics in 1K`)}
    ${kpi(r1(p.avgVisibility), 'Avg AI visibility')}
    ${kpi(fmt(p.totalMentions), 'Total mentions')}
    ${kpi(fmt(p.totalVolume), 'Total search volume')}
    ${kpi(fmt(rep.vertical === 'beauty' ? p.topics80 : p.topics60), `Topics ≥ ${rep.vertical === 'beauty' ? 80 : 60}`)}
    ${kpi(fmt(rep.gaps.length), 'Actionable gaps')}</div>`;

  const sections = [
    sec('Summary — AI Visibility at a Glance', 'Per brand, this vertical only (noise excluded).',
      table(['Metric', ...brands.map(cap)], [
        ['Topics in their 1K', ...brands.map((b) => fmt(g(b).topicsInVertical))],
        ['Avg AI visibility', ...brands.map((b) => r1(g(b).avgVisibility))],
        ['Total mentions', ...brands.map((b) => fmt(g(b).totalMentions))],
        ['Total search volume', ...brands.map((b) => fmt(g(b).totalVolume))],
        ['Topics ≥ 60 visibility', ...brands.map((b) => fmt(g(b).topics60))],
        ['Topics ≥ 80 visibility', ...brands.map((b) => fmt(g(b).topics80))],
      ], brands.map((_, i) => i + 1))),
    sec('Section A — Category Scorecard', 'Topics Nykaa owns per category, with current leader.',
      table(['Category', 'Topics', 'Avg vis', 'Avg mentions', 'Search volume', 'Signal'],
        rep.categoryScorecard.map((c) => [c.category, fmt(c.topics), r1(c.avgVisibility), r1(c.avgMentions), fmt(c.totalVolume), c.signal]),
        [1, 2, 3, 4])),
    sec('Section B — Top Topics to Protect', 'Highest-volume Nykaa topics and status.',
      table(['Category', 'Topic', 'Visibility', 'Mentions', 'Search volume', 'Status'],
        rep.protect.map((t) => [t.category, t.topic, fmt(t.visibility), fmt(t.mentions), fmt(t.volume), t.status]), [2, 3, 4])),
    sec('Section C — Gap Analysis', 'Topics where Nykaa = 0 but competitors rank. Numbers = competitor AI mentions.',
      table(['Priority', 'Category', 'Topic (Nykaa = 0)', ...cB.map(cap), 'Search volume'],
        rep.gaps.map((gp) => [gp.priority, gp.category, gp.topic, ...cB.map((b) => fmt(gp.competitors[cap(b)] ?? 0)), fmt(gp.volume)]),
        [...cB.map((_, i) => i + 3), cB.length + 3])),
    sec('Brand Comparison — Mentions by Category', "Total AI mentions per category from each brand's own 1K topics.",
      table(['Category', ...brands.map(cap)],
        rep.brandComparison.map((bc) => [bc.category, ...brands.map((b) => fmt(bc.mentions[b] ?? 0))]),
        brands.map((_, i) => i + 1))),
  ];
  if (rep.sourceAnalysis.length) {
    const sBr = brands.filter((b) => rep.sourceAnalysis.some((s) => s.count[b] !== undefined));
    sections.push(sec('Cited-Source Mix', 'Page types AI engines cite, per brand.',
      table(['Page type', ...sBr.map(cap)], rep.sourceAnalysis.map((s) => [s.pageType, ...sBr.map((b) => fmt(s.count[b] ?? 0))]),
        sBr.map((_, i) => i + 1))));
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${label}</title><style>
  :root{--ink:#1d1f2b;--muted:#6b6f80;--line:#e7e8ef;--pink:#6366f1}
  *{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:var(--ink);margin:0;background:#f6f6fa}
  .wrap{max-width:1100px;margin:0 auto;padding:24px}
  .hd{background:linear-gradient(120deg,#6366f1,#8b5cf6);color:#fff;padding:28px;border-radius:14px;margin-bottom:18px}
  .hd h1{margin:0 0 4px;font-size:24px}.hd p{margin:0;opacity:.92;font-size:13.5px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
  .kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 15px}
  .kpi .v{font-size:22px;font-weight:800}.kpi .l{font-size:11.5px;color:var(--muted);margin-top:2px}
  section{margin-bottom:22px}h2{font-size:16px;margin:0 0 3px}.sub{font-size:12.5px;color:var(--muted);margin:0 0 10px}
  .tw{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
  table{border-collapse:collapse;width:100%;font-size:12.5px}
  th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
  th{background:#fafafe;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tr:last-child td{border-bottom:none}
  .ft{color:var(--muted);font-size:12px;text-align:center;padding:18px}
  @media print{body{background:#fff}.hd{-webkit-print-color-adjust:exact;print-color-adjust:exact}section{page-break-inside:avoid}}
  </style></head><body><div class="wrap">
  <div class="hd"><h1>${label}</h1><p>Source: SEMrush AI Visibility · Generated ${new Date().toISOString().slice(0, 10)} · By Rudra Kasturi Inc</p></div>
  ${kpis}${sections.join('')}
  <div class="ft">Auto-generated by CiteRank WBR Builder · noise excluded from totals · ${rep.reviewQueue.length} topics in review queue</div>
  </div></body></html>`;
}

function kpi(v: string, l: string) { return `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`; }

writeFileSync(`${outBase}.html`, buildHtml(rep));
buildXlsx(rep, `${outBase}.xlsx`);
console.log(`Wrote ${outBase}.html and ${outBase}.xlsx`);
console.log(`Nykaa topics=${g('nykaa').topicsInVertical} gaps=${rep.gaps.length} categories=${rep.categoryScorecard.length}`);
