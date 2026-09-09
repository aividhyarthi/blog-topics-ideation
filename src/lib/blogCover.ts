// Per-post cover art for auto-generated blog posts, as an inline SVG data
// URI — no sharp/canvas/native dependency (would need a matching prebuilt
// binary in the Alpine production image, the exact class of problem that
// once took the whole app down when better-sqlite3's runtime lib was
// missing — see the Dockerfile's notes). Renders natively as an <img src>
// in every browser. Matches the look of the 3 hand-made PNG covers
// (public/blog/*.png): dark background, an uppercase category pill, a
// large wrapped title, and a small wordmark bottom-left.
//
// This is used for the ON-PAGE image only (blog index card, post header,
// homepage "From the blog" cards). It is deliberately NOT used as the
// og:image for link previews — WhatsApp/Twitter's crawlers don't reliably
// render SVG for share-preview thumbnails, so auto-generated posts fall
// back to the site's default PNG og:image instead (see blog/[slug].astro).
function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapTitle(title: string, maxChars = 21): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export function renderCoverSvg(title: string, tag: string): string {
  const W = 1200, H = 630;
  const lines = wrapTitle(title);
  const lineH = 64;
  const startY = H / 2 - ((lines.length - 1) * lineH) / 2 + 18;
  const textLines = lines
    .map((l, i) => `<text x="80" y="${startY + i * lineH}" font-size="52" font-weight="800" fill="#ffffff" font-family="Arial, Helvetica, sans-serif">${esc(l)}</text>`)
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0b1020"/>
        <stop offset="1" stop-color="#161b2e"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="80" y="72" width="${Math.min(560, 40 + tag.length * 15)}" height="40" rx="20" fill="#ffffff" fill-opacity="0.12"/>
    <text x="102" y="98" font-size="15" font-weight="800" letter-spacing="1.5" fill="#e2e8f0" font-family="Arial, Helvetica, sans-serif">${esc(tag.toUpperCase())}</text>
    ${textLines}
    <text x="80" y="${H - 56}" font-size="20" font-weight="800" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif">AI PAGE AUDIT</text>
  </svg>`;
}

export function coverDataUri(title: string, tag: string): string {
  const svg = renderCoverSvg(title, tag);
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
