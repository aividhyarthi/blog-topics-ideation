// Inline SVG chart rendering for blog posts. Pure server-side string
// templating — no canvas/sharp/native deps, so it can't break the Railway
// build the way a native image library sometimes does (see Dockerfile's
// notes on better-sqlite3's runtime lib). SVG also renders natively in the
// browser at any size, so there's no raster asset to generate or host.
//
// Every chart is explicitly labelled "Illustrative" in its caption. These
// visualize a post's own reasoning (e.g. "checks passed before vs after a
// fix"), not invented market-size statistics — the same discipline already
// applied to LLM_STATS in the old post template.
import type { ChartSpec } from './blogPosts';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Label sits on its own line ABOVE its bar, full track width available to
// it, instead of squeezed into a fixed 168px column beside the bar. A label
// longer than that column used to get silently painted over by the bar
// rect itself (SVG <text> never wraps or clips on its own) — confirmed via
// a real published post whose longer labels ("Wikipedia (of ChatGPT's
// citations)", "Sites cited by BOTH ChatGPT & Perplexity") rendered with
// the bar cutting through the middle of the text. Truncating with an
// ellipsis past ~46 chars is a second, independent safety net — the real
// fix going forward is keeping chart labels short in the first place (see
// CLAUDE.md), this just stops a too-long one from silently breaking layout.
function fitLabel(s: string, max = 46): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function barChartSvg(spec: ChartSpec): string {
  const items = spec.items.slice(0, 6);
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const rowH = 46;
  const w = 560;
  const trackW = w - 70;
  const h = items.length * rowH + 4;
  const bars = items
    .map((it, i) => {
      const y = i * rowH;
      const bw = Math.max(2, (Math.abs(it.value) / max) * trackW);
      return `
        <text x="0" y="${y + 13}" font-size="12.5" font-weight="600" fill="#334155">${esc(fitLabel(it.label))}</text>
        <rect x="0" y="${y + 20}" width="${trackW}" height="14" rx="7" fill="#eef0f5"/>
        <rect x="0" y="${y + 20}" width="${bw.toFixed(1)}" height="14" rx="7" fill="#18181b"/>
        <text x="${trackW + 10}" y="${y + 31}" font-size="12.5" font-weight="700" fill="#18181b">${esc(String(it.value))}${spec.unit ? esc(spec.unit) : ''}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(spec.title)}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, -apple-system, sans-serif">${bars}</svg>`;
}

function gaugeSvg(spec: ChartSpec): string {
  const it = spec.items[0] || { label: spec.title, value: 0 };
  const pct = Math.max(0, Math.min(100, it.value));
  const r = 54, cx = 64, cy = 64, circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const color = pct >= 75 ? '#12855a' : pct >= 45 ? '#b7791f' : '#d43a3a';
  return `<svg viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="${esc(spec.title)}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef0f5" stroke-width="14"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-size="26" font-weight="800" fill="#18181b" font-family="Inter, -apple-system, sans-serif">${esc(String(it.value))}${spec.unit ? esc(spec.unit) : ''}</text>
  </svg>`;
}

export function renderChartFigure(spec: ChartSpec): string {
  const svg = spec.type === 'gauge' ? gaugeSvg(spec) : barChartSvg(spec);
  return `<figure class="postchart">
    <div class="postchart-title">${esc(spec.title)}</div>
    <div class="postchart-svg">${svg}</div>
    <figcaption>${spec.caption ? esc(spec.caption) : 'Illustrative, based on this post’s own checks.'}</figcaption>
  </figure>`;
}

/**
 * bodyMarkdown may contain standalone lines like [[chart:0]] marking where a
 * chart from post.charts[0] should render. Called AFTER markdown -> HTML
 * conversion, since `marked` wraps the standalone marker text in a <p>.
 */
export function injectCharts(html: string, charts: ChartSpec[]): string {
  return html.replace(/<p>\s*\[\[chart:(\d+)\]\]\s*<\/p>/g, (_m, idx) => {
    const spec = charts[Number(idx)];
    return spec ? renderChartFigure(spec) : '';
  });
}
