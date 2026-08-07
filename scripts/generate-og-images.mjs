// Generates one social/hero image per blog post into public/blog/og/.
//
//   node scripts/generate-og-images.mjs          # all posts
//   node scripts/generate-og-images.mjs <slug>…  # just these
//
// Each card carries a small diagram of the idea the post actually argues,
// plus a one-line TAKEAWAY. The takeaway is deliberately not the title: the
// title is already the <h1> directly under the image, so repeating it wastes
// the only space that could add anything. A reader scrolling a feed should
// get a second fact from the picture, not the same one twice.
//
// Everything is inline SVG rendered by headless Chromium, so the output is a
// real raster image (Discover/WhatsApp won't render an SVG) that stays sharp
// at 2400x1350 — 16:9, comfortably over Google Discover's 1200px-wide and
// 300k-pixel minimums.
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = join(ROOT, 'src/content/blog');
const OUT_DIR = join(ROOT, 'public/blog/og');

const THEMES = {
  'Fundamentals': { accent: '#4338ca', bg: '#eef0fc' },
  'Keywords': { accent: '#0f766e', bg: '#e9f5f3' },
  'Google Play': { accent: '#15803d', bg: '#eaf5ec' },
  'App Store': { accent: '#1d4ed8', bg: '#eaf0fd' },
  'App Quality & Vitals': { accent: '#b45309', bg: '#faf1e6' },
  'Reviews & Ratings': { accent: '#be123c', bg: '#fbebee' },
  'Store Listing Experiments': { accent: '#7c3aed', bg: '#f2ecfc' },
  'Conversion & Growth': { accent: '#0369a1', bg: '#e9f3fa' },
};

// slug -> { art, takeaway, ...art-specific fields }
const SPEC = {
  'why-did-my-app-ranking-drop':
    { art: 'drop', takeaway: 'Rule out the confirmed causes before the speculative ones', mark: 'drop starts' },
  'app-ranking-dropped-after-update':
    { art: 'drop', takeaway: 'Most dips right after a release are indexing lag, not a penalty', mark: 'release' },
  'crash-rate-and-google-play-ranking':
    { art: 'threshold', takeaway: 'Crossing Play’s bad-behaviour threshold cuts your visibility', band: 'bad behaviour threshold' },
  'anr-rate-and-google-play-ranking':
    { art: 'threshold', takeaway: 'ANR rate is judged against a fixed bar, not against your past self', band: 'bad behaviour threshold' },
  'keyword-rank-fell-downloads-unchanged':
    { art: 'diverge', takeaway: 'Rank usually leads installs by days — it is not a contradiction', a: 'rank', b: 'installs' },
  'how-to-read-google-play-experiment-results':
    { art: 'diverge', takeaway: 'Read the confidence interval, not the winner badge', a: 'variant', b: 'control' },
  '1-2-star-reviews-hurting-search-rank':
    { art: 'stars', takeaway: 'A rising 1-2★ share bites long before your average moves' },
  'what-is-a-visibility-score-in-aso':
    { art: 'gauge', takeaway: 'One number that weights #3 far above #30', value: 70 },
  'measuring-conversion-rate-by-acquisition-channel':
    { art: 'funnel', takeaway: 'A blended conversion rate hides your worst channel', steps: ['impressions', 'page views', 'installs'] },
  'questions-people-ask-chatgpt-about-app-rankings':
    { art: 'qa', takeaway: 'The general answer rarely fits your specific app' },
  'keyword-research-volume-vs-difficulty':
    { art: 'quadrant', takeaway: 'A niche you can win beats a head term you cannot', x: 'difficulty', y: 'volume' },
  'localize-app-store-listing-for-india':
    { art: 'chips', takeaway: 'Hinglish is a third keyword set, not a translation of the first two',
      chips: ['mutual fund app', 'म्यूचुअल फंड', 'paise kaise kamaye', 'sip calculator', 'நிதி செயலி'] },
  'aso-for-fintech-apps-trust-signals':
    { art: 'chips', takeaway: 'In finance, trust signals outweigh another screenshot refresh',
      chips: ['RBI regulated', '4.5★ · 120k ratings', 'SEBI registered', 'data encrypted', 'since 2016'] },
  'seasonal-keywords-for-apps':
    { art: 'wave', takeaway: 'Demand moved, not your ranking — check the term before the listing' },
  'is-your-keyword-universe-growing':
    { art: 'growth', takeaway: 'Universe size shows reach; a single rank never does', label: 'keywords ranked' },
  'retention-rate-and-app-store-ranking':
    { art: 'growth', takeaway: 'Retention feeds the quality signals the stores actually read', label: 'day-30 retention' },
  'how-often-to-check-app-store-rankings':
    { art: 'growth', takeaway: 'Daily history is what turns day-to-day noise into a trend', label: 'daily checks' },
  'aso-101-what-actually-moves-your-rank':
    { art: 'bars', takeaway: 'A short list of signals does most of the work',
      bars: [['keywords', 90], ['ratings', 72], ['vitals', 64], ['installs', 48], ['updates', 30]] },
  'google-play-ranking-algorithm-what-we-know':
    { art: 'bars', takeaway: 'Separate what Google states from what the field infers',
      bars: [['confirmed', 88], ['strongly linked', 62], ['correlated', 40], ['folklore', 16]] },
  'update-frequency-as-a-ranking-signal':
    { art: 'bars', takeaway: 'Cadence signals an app that is maintained, not one that is new',
      bars: [['Jan', 40], ['Feb', 52], ['Mar', 48], ['Apr', 70], ['May', 84]] },
  'vanity-metrics-vs-ranking-metrics':
    { art: 'split', takeaway: 'Downloads flatter you; rank and vitals decide for you',
      left: ['total downloads', 'star average', 'social shares'], right: ['keyword rank', 'crash / ANR rate', 'conversion rate'],
      leftLabel: 'flatters', rightLabel: 'decides' },
  'category-rank-vs-keyword-rank':
    { art: 'split', takeaway: 'Two different charts, driven by two different mechanics',
      left: ['search intent', 'per keyword', 'listing text'], right: ['install velocity', 'per category', 'whole app'],
      leftLabel: 'keyword rank', rightLabel: 'category rank' },
  'ios-vs-android-aso-where-rules-diverge':
    { art: 'split', takeaway: 'A keyword field on one store, indexed prose on the other',
      left: ['100-char keyword field', 'subtitle indexed', 'no description index'], right: ['description indexed', 'no keyword field', 'repetition counts'],
      leftLabel: 'App Store', rightLabel: 'Google Play' },
  'title-subtitle-description-what-gets-indexed':
    { art: 'split', takeaway: 'Not every field you can type into carries the same weight',
      left: ['title', 'subtitle / short desc'], right: ['long description', 'developer name'],
      leftLabel: 'heaviest', rightLabel: 'lighter' },
  'tracking-competitor-apps-the-right-way':
    { art: 'split', takeaway: 'Track the rivals you actually share keywords with',
      left: ['same keywords', 'same country', 'same intent'], right: ['same category only', 'bigger brand', 'gut feel'],
      leftLabel: 'a real rival', rightLabel: 'noise' },
  'how-to-run-store-listing-experiments':
    { art: 'split', takeaway: 'One variable per test, or the result explains nothing',
      left: ['one element', 'fixed window', 'pre-set metric'], right: ['icon + text at once', 'stopped early', 'metric chosen after'],
      leftLabel: 'readable', rightLabel: 'wasted' },
  'apple-product-page-optimization':
    { art: 'split', takeaway: 'Up to three treatments, measured against one control',
      left: ['control'], right: ['treatment 1', 'treatment 2', 'treatment 3'],
      leftLabel: 'baseline', rightLabel: 'variants' },
  'what-is-a-custom-store-listing':
    { art: 'split', takeaway: 'Niche and regional terms belong off your default listing',
      left: ['head terms', 'core audience'], right: ['regional language', 'campaign traffic', 'seasonal terms'],
      leftLabel: 'main listing', rightLabel: 'custom listing' },
  'tracking-app-rankings-across-countries':
    { art: 'split', takeaway: 'A #4 in one country can be invisible in the next',
      left: ['one rank number', 'one keyword list', 'one rival set'], right: ['a rank per market', 'demand shifts locally', 'rivals differ locally'],
      leftLabel: 'one country', rightLabel: 'every market' },
  'setting-up-rank-drop-alerts':
    { art: 'drop', takeaway: 'Know the moment it happens, not the week after', mark: 'alert fires' },
  'aso-for-subscription-apps-trial-to-paid':
    { art: 'funnel', takeaway: 'The algorithm sees retention, not your billing dashboard', steps: ['trial start', 'day-7 retained', 'converts to paid'] },
  'most-relevant-review-shows-a-1-star':
    { art: 'diverge', takeaway: 'Relevant means useful to a shopper, not representative of your average', a: 'your rating', b: 'what shows first' },
  'why-more-ratings-doesnt-move-your-average':
    { art: 'bars', takeaway: 'The same 100 new ratings move a small pool and barely touch a huge one',
      bars: [['500', 90], ['5,000', 40], ['50,000', 6]] },
  'app-rating-shows-different-numbers-same-day':
    { art: 'chips', takeaway: 'Four surfaces, four caches, four snapshots in time',
      chips: ['4.5 search card', '3.8 listing page', '4.0 Play Console', '4.2 Search snippet'] },
};

/* ------------------------------- art pieces ------------------------------- */
// Every piece draws into the same 1000x300 viewBox so the card layout below
// never has to care which one it got.
const VB = { w: 1000, h: 300 };
const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
const series = (vals) => vals.map((v, i) => [40 + (i * (VB.w - 80)) / (vals.length - 1), VB.h - 30 - (v / 100) * (VB.h - 70)]);

const ART = {
  drop: (a, s) => {
    const vals = [62, 66, 61, 68, 64, 70, 24, 20, 27, 22];
    const pts = series(vals);
    const mx = pts[6][0];
    return `
      <path d="${path(pts)}" fill="none" stroke="${a}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 6 ? 11 : 6}" fill="${i === 6 ? '#be123c' : a}"/>`).join('')}
      <line x1="${mx}" y1="10" x2="${mx}" y2="${VB.h - 20}" stroke="#be123c" stroke-width="3" stroke-dasharray="9 8" opacity="0.75"/>
      <text x="${mx + 16}" y="34" font-size="26" font-weight="700" fill="#be123c">${s.mark}</text>`;
  },
  threshold: (a, s) => {
    const pts = series([30, 34, 40, 46, 58, 72, 80]);
    return `
      <rect x="0" y="0" width="${VB.w}" height="${VB.h * 0.42}" fill="#be123c" opacity="0.09"/>
      <line x1="0" y1="${VB.h * 0.42}" x2="${VB.w}" y2="${VB.h * 0.42}" stroke="#be123c" stroke-width="4" stroke-dasharray="10 8"/>
      <text x="14" y="${VB.h * 0.42 - 16}" font-size="25" font-weight="700" fill="#be123c">${s.band}</text>
      <path d="${path(pts)}" fill="none" stroke="${a}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === pts.length - 1 ? 12 : 6}" fill="${i === pts.length - 1 ? '#be123c' : a}"/>`).join('')}`;
  },
  diverge: (a, s) => {
    const A = series([40, 46, 52, 58, 66, 74, 82]);
    const B = series([44, 45, 44, 46, 45, 44, 46]);
    return `
      <path d="${path(A)}" fill="none" stroke="${a}" stroke-width="7" stroke-linecap="round"/>
      <path d="${path(B)}" fill="none" stroke="#98a0b0" stroke-width="7" stroke-linecap="round" stroke-dasharray="12 10"/>
      <text x="${A[6][0] - 10}" y="${A[6][1] - 22}" font-size="26" font-weight="700" fill="${a}" text-anchor="end">${s.a}</text>
      <text x="${B[6][0] - 10}" y="${B[6][1] + 44}" font-size="26" font-weight="700" fill="#7b8496" text-anchor="end">${s.b}</text>`;
  },
  growth: (a, s) => {
    const pts = series([26, 34, 40, 49, 55, 66, 74, 84]);
    return `
      <path d="${path(pts)} L${pts[pts.length - 1][0]},${VB.h - 20} L${pts[0][0]},${VB.h - 20} Z" fill="${a}" opacity="0.12"/>
      <path d="${path(pts)}" fill="none" stroke="${a}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${a}"/>`).join('')}
      <text x="40" y="34" font-size="26" font-weight="700" fill="${a}">${s.label}</text>`;
  },
  wave: (a) => {
    const pts = series([30, 48, 72, 86, 70, 44, 28, 40, 66, 84]);
    return `
      <path d="${path(pts)}" fill="none" stroke="${a}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      ${[3, 9].map((i) => `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="12" fill="${a}"/>`).join('')}
      <text x="${pts[3][0]}" y="${pts[3][1] - 24}" font-size="25" font-weight="700" fill="${a}" text-anchor="middle">peak</text>
      <text x="${pts[6][0]}" y="${pts[6][1] + 44}" font-size="25" font-weight="700" fill="#7b8496" text-anchor="middle">off-season</text>`;
  },
  bars: (a, s) => {
    const n = s.bars.length, gap = 26, w = (VB.w - gap * (n - 1)) / n;
    return s.bars.map(([label, v], i) => {
      const h = (v / 100) * (VB.h - 78), x = i * (w + gap), y = VB.h - 44 - h;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${a}" opacity="${i === 0 ? 1 : 0.28}"/>
        <text x="${x + w / 2}" y="${VB.h - 12}" font-size="24" font-weight="700" fill="#5b6273" text-anchor="middle">${label}</text>`;
    }).join('');
  },
  stars: (a) => {
    const rows = [['5★', 54], ['4★', 18], ['3★', 8], ['2★', 7], ['1★', 13]];
    return rows.map(([label, v], i) => {
      const y = i * 58, bad = i >= 3;
      return `<text x="0" y="${y + 34}" font-size="26" font-weight="700" fill="#5b6273">${label}</text>
        <rect x="70" y="${y + 12}" width="${(VB.w - 150) * (v / 60)}" height="30" rx="8" fill="${bad ? '#be123c' : a}" opacity="${bad ? 1 : 0.3}"/>
        <text x="${86 + (VB.w - 150) * (v / 60)}" y="${y + 35}" font-size="24" font-weight="700" fill="${bad ? '#be123c' : '#8a91a1'}">${v}%</text>`;
    }).join('');
  },
  gauge: (a, s) => {
    const cx = VB.w / 2, cy = VB.h - 24, r = 190;
    const ang = Math.PI * (1 - s.value / 100);
    const arc = (frac, col, wdt, op = 1) => {
      const e = Math.PI * (1 - frac);
      return `<path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r * Math.cos(e) * -1 * -1},${cy - r * Math.sin(e)}"
        fill="none" stroke="${col}" stroke-width="${wdt}" stroke-linecap="round" opacity="${op}"/>`;
    };
    // No needle: the filled arc already carries the value, and a needle drawn
    // across the dial's centre collides with the number sitting there.
    return `${arc(1, a, 30, 0.16)}${arc(s.value / 100, a, 30)}
      <text x="${cx}" y="${cy - 34}" font-size="96" font-weight="800" fill="#16181d" text-anchor="middle">${s.value}</text>
      <text x="${cx}" y="${cy + 4}" font-size="24" font-weight="700" fill="#8a91a1" text-anchor="middle" letter-spacing="1">VISIBILITY</text>
      <text x="${cx - r}" y="${cy + 32}" font-size="24" font-weight="700" fill="#8a91a1">0</text>
      <text x="${cx + r}" y="${cy + 32}" font-size="24" font-weight="700" fill="#8a91a1" text-anchor="end">100</text>`;
  },
  funnel: (a, s) => {
    const widths = [1, 0.62, 0.3];
    return s.steps.map((label, i) => {
      const w = VB.w * widths[i], x = (VB.w - w) / 2, y = i * 96;
      return `<rect x="${x}" y="${y}" width="${w}" height="72" rx="12" fill="${a}" opacity="${1 - i * 0.28}"/>
        <text x="${VB.w / 2}" y="${y + 47}" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>`;
    }).join('');
  },
  qa: (a) => {
    const qs = ['how often does the algorithm update?', 'can I buy my way to a higher rank?', 'how long until a new app ranks?'];
    return qs.map((q, i) => {
      const y = i * 100;
      return `<circle cx="30" cy="${y + 40}" r="26" fill="${a}" opacity="0.16"/>
        <text x="30" y="${y + 50}" font-size="28" font-weight="800" fill="${a}" text-anchor="middle">?</text>
        <text x="76" y="${y + 50}" font-size="30" font-weight="600" fill="#3b414f">${q}</text>`;
    }).join('');
  },
  quadrant: (a, s) => {
    const m = 46, w = VB.w - m * 2, h = VB.h - m;
    const dots = [[0.18, 0.24], [0.3, 0.42], [0.24, 0.66], [0.62, 0.3], [0.76, 0.5], [0.85, 0.75], [0.5, 0.55]];
    return `<rect x="${m}" y="0" width="${w / 2}" height="${h / 2}" fill="${a}" opacity="0.12"/>
      <line x1="${m}" y1="${h / 2}" x2="${m + w}" y2="${h / 2}" stroke="#d3d8e2" stroke-width="3"/>
      <line x1="${m + w / 2}" y1="0" x2="${m + w / 2}" y2="${h}" stroke="#d3d8e2" stroke-width="3"/>
      ${dots.map(([dx, dy], i) => `<circle cx="${m + dx * w}" cy="${dy * h}" r="${i < 3 ? 15 : 11}" fill="${i < 3 ? a : '#aab2c0'}"/>`).join('')}
      <text x="${m + 12}" y="30" font-size="25" font-weight="800" fill="${a}">winnable</text>
      <text x="${m + w}" y="${h + 34}" font-size="24" font-weight="700" fill="#8a91a1" text-anchor="end">${s.x} →</text>
      <text x="${m - 14}" y="26" font-size="24" font-weight="700" fill="#8a91a1" text-anchor="end" transform="rotate(-90 ${m - 14} 26)">← ${s.y}</text>`;
  },
  chips: (a, s) => {
    // Lay out first to learn the real height, then centre the block in the
    // viewBox — a one- or two-row set otherwise hugs the top and leaves an
    // obvious dead band above the takeaway.
    const rows = [[]];
    let x = 0;
    for (const c of s.chips) {
      const w = 30 + c.length * 17.5;
      if (x + w > VB.w && rows[rows.length - 1].length) { rows.push([]); x = 0; }
      rows[rows.length - 1].push({ c, w, x });
      x += w + 18;
    }
    const body = rows.map((row, r) => row.map(({ c, w, x: cx }) =>
      `<rect x="${cx}" y="${r * 84}" width="${w}" height="64" rx="18" fill="${a}" opacity="0.13"/>
       <text x="${cx + w / 2}" y="${r * 84 + 42}" font-size="29" font-weight="700" fill="${a}" text-anchor="middle">${c}</text>`).join('')).join('');
    return centred(body, rows.length * 84 - 20);
  },
  split: (a, s) => {
    const col = (items, label, cx, colour, op) => `
      <text x="${cx}" y="26" font-size="25" font-weight="800" fill="${colour}" text-anchor="middle" letter-spacing="1">${label.toUpperCase()}</text>
      ${items.map((t, i) => `<rect x="${cx - 210}" y="${50 + i * 74}" width="420" height="58" rx="13" fill="${colour}" opacity="${op}"/>
        <text x="${cx}" y="${88 + i * 74}" font-size="28" font-weight="600" fill="#2b3040" text-anchor="middle">${t}</text>`).join('')}`;
    const rowsTall = Math.max(s.left.length, s.right.length);
    const h = 50 + rowsTall * 74 - 16;
    return centred(`${col(s.left, s.leftLabel, 240, a, 0.15)}
      <line x1="${VB.w / 2}" y1="0" x2="${VB.w / 2}" y2="${h}" stroke="#dfe3ea" stroke-width="3"/>
      ${col(s.right, s.rightLabel, VB.w - 240, '#8a91a1', 0.13)}`, h);
  },
};

/** Vertically centres an art block of known height inside the viewBox. */
function centred(body, height) {
  return `<g transform="translate(0, ${Math.max(0, (VB.h - height) / 2)})">${body}</g>`;
}

/* --------------------------------- card ---------------------------------- */
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function card({ theme, accent, bg, takeaway, artSvg }) {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:1200px;height:675px;overflow:hidden}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:${bg}}
    .card{position:absolute;inset:45px 50px;background:#fff;border-radius:28px;overflow:hidden;
      box-shadow:0 30px 60px -20px rgba(20,20,30,.25);display:flex;flex-direction:column}
    .stripe{height:10px;background:${accent};flex-shrink:0}
    .inner{flex:1;display:flex;flex-direction:column;padding:34px 54px 30px;min-height:0}
    .head{display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .brand{display:flex;align-items:center;gap:11px}
    .mark{width:38px;height:38px;border-radius:11px;background:${accent};color:#fff;display:grid;place-items:center;font-size:15px;font-weight:800;letter-spacing:-.03em}
    .wordmark{font-weight:800;font-size:22px;letter-spacing:-.02em;color:#16181d}
    .theme{font-size:14px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${accent};background:${bg};padding:7px 14px;border-radius:999px}
    .art{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:16px 0 6px}
    .art svg{width:100%;height:100%}
    .foot{border-top:1px solid #eceef1;padding-top:18px;flex-shrink:0;display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
    .takeaway{font-size:31px;font-weight:800;letter-spacing:-.02em;line-height:1.24;color:#14161c;max-width:880px}
    .url{font-size:15px;font-weight:700;color:#9aa0ae;white-space:nowrap;padding-bottom:3px}
  </style></head><body>
    <div class="card"><div class="stripe"></div><div class="inner">
      <div class="head">
        <div class="brand"><div class="mark">AR</div><div class="wordmark">AppRankr</div></div>
        <div class="theme">${esc(theme)}</div>
      </div>
      <div class="art"><svg viewBox="0 0 ${VB.w} ${VB.h}" xmlns="http://www.w3.org/2000/svg">${artSvg}</svg></div>
      <div class="foot"><div class="takeaway">${esc(takeaway)}</div><div class="url">apprankr.in/blog</div></div>
    </div></div>
  </body></html>`;
}

/* --------------------------------- main ---------------------------------- */
const only = process.argv.slice(2);
const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'))
  .filter((f) => !only.length || only.includes(f.replace(/\.md$/, '')));

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });

let made = 0;
for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const { data } = matter(readFileSync(join(BLOG_DIR, file), 'utf8'));
  const theme = THEMES[data.theme];
  const spec = SPEC[slug];
  if (!theme) throw new Error(`No colour mapping for theme "${data.theme}" (${slug})`);
  if (!spec) throw new Error(`No art spec for "${slug}" — add one to SPEC in this file.`);
  const draw = ART[spec.art];
  if (!draw) throw new Error(`Unknown art type "${spec.art}" (${slug})`);

  await page.setContent(card({
    theme: data.theme, accent: theme.accent, bg: theme.bg,
    takeaway: spec.takeaway, artSvg: draw(theme.accent, spec),
  }), { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT_DIR, `${slug}.png`) });
  console.log(`  ${spec.art.padEnd(10)} ${slug}`);
  made++;
}

await browser.close();
console.log(`\n${made} image(s) written to public/blog/og/`);
