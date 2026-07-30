// Generates the site-wide social preview image (landing page, and the
// fallback for any page that doesn't have its own og:image) into
// public/og-home.png. Same rendering approach as generate-og-images.mjs
// (inline SVG rasterised by headless Chromium) but branded generically for
// the product rather than tied to one blog post's argument.
//
//   node scripts/generate-home-og.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'og-home.png');

const ACCENT = '#4338ca';
const BG = '#eef0fc';

// A small "rank climbing" bar chart — the same visual language as the blog
// hero images, reused here as the one-line pitch of what the product does.
const bars = [42, 34, 58, 50, 68, 88, 100];
const CHART_H = 190;
const barsSvg = bars.map((h, i) => {
  const w = 100, gap = 26, x = i * (w + gap);
  const barH = (h / 100) * CHART_H;
  const op = i === bars.length - 1 ? 1 : 0.18 + (i / bars.length) * 0.35;
  return `<rect x="${x}" y="${CHART_H - barH}" width="${w}" height="${barH}" rx="10" fill="${ACCENT}" opacity="${op.toFixed(2)}"/>`;
}).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1200px;height:675px;overflow:hidden}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:${BG}}
  .card{position:absolute;inset:45px 50px;background:#fff;border-radius:28px;overflow:hidden;
    box-shadow:0 30px 60px -20px rgba(20,20,30,.25);display:flex;flex-direction:column}
  .stripe{height:10px;background:${ACCENT};flex-shrink:0}
  .inner{flex:1;display:flex;flex-direction:column;padding:44px 58px 36px;min-height:0}
  .head{display:flex;align-items:center;gap:13px}
  .mark{width:46px;height:46px;border-radius:13px;background:${ACCENT};color:#fff;display:grid;place-items:center;font-size:19px;font-weight:800;letter-spacing:-.03em}
  .wordmark{font-weight:800;font-size:27px;letter-spacing:-.02em;color:#16181d}
  .betatag{font-size:13px;font-weight:800;color:#6b7280;background:#f3f4f6;border:1px solid #e5e7eb;padding:3px 10px;border-radius:999px;letter-spacing:.02em;margin-left:2px}
  .pitch{font-size:36px;font-weight:800;letter-spacing:-.02em;line-height:1.25;color:#14161c;margin:22px 0 0;max-width:920px}
  .art{flex:1;display:flex;align-items:flex-end;min-height:0;padding:16px 0 4px}
  .foot{border-top:1px solid #eceef1;padding-top:18px;flex-shrink:0;display:flex;align-items:flex-end;justify-content:space-between}
  .tagline{font-size:20px;font-weight:700;color:#4b5264}
  .url{font-size:16px;font-weight:700;color:#9aa0ae}
</style></head><body>
  <div class="card"><div class="stripe"></div><div class="inner">
    <div class="head">
      <div class="mark">AR</div>
      <div class="wordmark">AppRankr</div>
      <span class="betatag">Beta 1.0</span>
    </div>
    <div class="pitch">Track where your app ranks on Google Play &amp; the App Store — every keyword, every day.</div>
    <div class="art"><svg viewBox="0 0 856 ${CHART_H}" width="100%" height="100%" preserveAspectRatio="xMinYMax meet">${barsSvg}</svg></div>
    <div class="foot"><div class="tagline">Keyword rank, category rank, and ASO audits in one dashboard</div><div class="url">apprankr.in</div></div>
  </div></div>
</body></html>`;

mkdirSync(dirname(OUT), { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: OUT });
await browser.close();
console.log('wrote', OUT);
