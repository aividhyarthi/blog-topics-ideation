// Per-post cover art for auto-generated blog posts, as an inline SVG data
// URI — no sharp/canvas/native dependency (would need a matching prebuilt
// binary in the Alpine production image, the exact class of problem that
// once took the whole app down when better-sqlite3's runtime lib was
// missing — see the Dockerfile's notes). Renders natively as an <img src>
// in every browser.
//
// Deliberately does NOT render the post title. It used to (dark background,
// category pill, the title wrapped across a few lines), but on the actual
// post page that image sits directly under the real <h1>, which already
// says the exact same words — a real published post showed this as two
// back-to-back blocks repeating the same headline for no reason. The cover
// now carries the category only, large, plus a bit of decorative texture,
// so it reads as a section marker rather than a second, redundant title.
//
// This is used for the ON-PAGE image only (blog index card, post header,
// homepage "From the blog" cards). It is deliberately NOT used as the
// og:image for link previews — WhatsApp/Twitter's crawlers don't reliably
// render SVG for share-preview thumbnails, so auto-generated posts fall
// back to the site's default PNG og:image instead (see blog/[slug].astro).
function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderCoverSvg(tag: string): string {
  const W = 1200, H = 630;
  const label = tag.toUpperCase();
  // Longer category words (Technical, Comparison) need a smaller size to
  // still fit inside the canvas at the 80px left margin used below.
  const fontSize = label.length <= 6 ? 168 : label.length <= 9 ? 130 : 104;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0b1020"/>
        <stop offset="1" stop-color="#161b2e"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="${W - 140}" cy="120" r="230" fill="#ffffff" fill-opacity="0.045"/>
    <circle cx="${W - 40}" cy="440" r="150" fill="#ffffff" fill-opacity="0.05"/>
    <line x1="0" y1="${H - 190}" x2="${W}" y2="${H - 250}" stroke="#ffffff" stroke-opacity="0.07" stroke-width="2"/>
    <text x="80" y="${H / 2 + 55}" font-size="${fontSize}" font-weight="800" letter-spacing="-4" fill="#ffffff" fill-opacity="0.95" font-family="Arial, Helvetica, sans-serif">${esc(label)}</text>
    <text x="80" y="${H - 56}" font-size="20" font-weight="800" fill="#94a3b8" font-family="Arial, Helvetica, sans-serif">AI PAGE AUDIT</text>
  </svg>`;
}

export function coverDataUri(tag: string): string {
  const svg = renderCoverSvg(tag);
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
