// Deep "what can bots access" extractor for the LLM Access Check. Reads the raw
// HTML (exactly what a non-JS crawler receives) and reports, group by group,
// what is present and readable vs missing or hidden behind JavaScript.

import type { PageFacts } from './aeo';

export type AccessStatus = 'read' | 'partial' | 'missed' | 'warn' | 'info';
export interface AccessItem { label: string; status: AccessStatus; detail: string }
export interface AccessGroup { title: string; items: AccessItem[] }
export interface RenderInfo {
  type: 'html' | 'js'; framework: string | null; words: number; textRatioPct: number;
  lazy: boolean; lazyDetail: string | null;
}

const count = (re: RegExp, s: string): number => (s.match(re) || []).length;

// Signals that content loads late (on scroll / after a delay) — a crawler that
// doesn't execute JS or doesn't wait will miss it.
export function renderInfo(html: string, f: PageFacts): RenderInfo {
  const sig: string[] = [];
  if (/loading=["']lazy["']/i.test(html)) sig.push('lazy-loaded images');
  if (/data-src=|data-lazy|lazyload/i.test(html)) sig.push('deferred assets (data-src)');
  if (/IntersectionObserver/i.test(html)) sig.push('scroll-triggered loading');
  if (/infinite.?scroll/i.test(html)) sig.push('infinite scroll');
  if (/skeleton|placeholder-loading|shimmer|content-loader/i.test(html)) sig.push('skeleton placeholders');
  return {
    type: f.jsDependent ? 'js' : 'html', framework: f.framework,
    words: f.wordCount, textRatioPct: f.textRatioPct,
    lazy: sig.length > 0, lazyDetail: sig.length ? sig.join(', ') : null,
  };
}

// "Intelligent" checks for the tricky, page-type-specific patterns that hide
// content from LLM crawlers: reviews that load via JS, filters/facets, tab
// panels, "read more" truncation, "load more"/infinite scroll, JS-only prices.
// The core trick: compare what the page DECLARES (schema counts, "N reviews"
// text) against what is actually IN the raw HTML that LLM crawlers receive.
export function dynamicChecks(html: string, f: PageFacts): AccessGroup {
  const R = (label: string, status: AccessStatus, detail: string): AccessItem => ({ label, status, detail });
  const items: AccessItem[] = [];

  // ---- Reviews: declared vs actually in the HTML ----
  let declaredReviews = 0;
  const rc = html.match(/"reviewCount"\s*:\s*"?(\d[\d,]*)"?/i) || html.match(/"ratingCount"\s*:\s*"?(\d[\d,]*)"?/i);
  if (rc) declaredReviews = parseInt(rc[1].replace(/,/g, ''), 10);
  const txtRc = html.match(/\b([\d,]{1,9})\s*(?:reviews|ratings)\b/i);
  if (!declaredReviews && txtRc) declaredReviews = parseInt(txtRc[1].replace(/,/g, ''), 10);
  const inHtmlReviews = Math.max(
    (html.match(/"@type"\s*:\s*"Review"/gi) || []).length,
    (html.match(/itemprop=["']review["']/gi) || []).length,
    (html.match(/class=["'][^"']*\breview[-_](?:item|card|block|content|body|container)\b/gi) || []).length,
  );
  if (declaredReviews > 0 || inHtmlReviews > 0) {
    if (declaredReviews > 3 && inHtmlReviews < declaredReviews * 0.5)
      items.push(R('Reviews', inHtmlReviews ? 'partial' : 'missed',
        `The page references ${declaredReviews.toLocaleString()} reviews, but only ~${inHtmlReviews} are in the raw HTML — the rest load via JavaScript/pagination, so LLMs can read only the ~${inHtmlReviews} present.`));
    else if (inHtmlReviews > 0)
      items.push(R('Reviews', 'read', `~${inHtmlReviews} review(s) are in the HTML and readable${declaredReviews ? ` (page references ${declaredReviews.toLocaleString()})` : ''}.`));
    else
      items.push(R('Reviews', 'missed', `The page references ${declaredReviews.toLocaleString()} reviews but none are in the raw HTML — they load via JavaScript, so LLMs see none of them.`));
  }

  // ---- Filters / faceted navigation (listing pages) ----
  const hasFilterUI = /class=["'][^"']*\b(?:filter|facet|refine|refinement)s?\b|id=["'][^"']*\bfilters?\b|data-filter=/i.test(html);
  if (hasFilterUI || f.pageType === 'listing') {
    const options = (html.match(/<input[^>]+type=["']checkbox["']|data-filter-value=|class=["'][^"']*facet[-_]?(?:option|value|item)\b/gi) || []).length;
    if (hasFilterUI)
      items.push(R('Filters / facets', options >= 3 ? 'read' : 'warn',
        options >= 3 ? `Filter options appear in the HTML (~${options} found) — crawlers can see the refinements.`
          : 'A filter/facet UI was detected but its options don’t appear in the raw HTML — they’re likely rendered by JavaScript.'));
  }

  // ---- "Read more" / truncated content ----
  if (/read\s?-?more|show\s?-?more|view\s?-?more|see\s?more/i.test(html)) {
    const clamp = /line-clamp|-webkit-line-clamp|text-truncate|\btruncate\b/i.test(html);
    items.push(R('“Read more” / truncated text', clamp ? 'read' : 'warn',
      clamp ? 'Text looks CSS-clamped — the full copy is in the HTML and readable even though it’s visually cut off.'
        : '“Read more” detected — check the full text is in the HTML. If it loads on click via JavaScript, LLMs only see the visible snippet.'));
  }

  // ---- "Load more" / infinite scroll (listing) ----
  if (/load\s?-?more|show\s?more\s?(?:results|products|items)|infinite.?scroll/i.test(html)) {
    items.push(R('“Load more” / infinite scroll', 'warn',
      'Items beyond the first batch load on scroll/click — LLM crawlers (which don’t scroll) see only the first set.'));
  }

  // ---- Price (product pages) ----
  if (f.pageType === 'product') {
    items.push(R('Price', f.priceCount > 0 ? 'read' : 'missed',
      f.priceCount > 0 ? 'A price is present in the HTML — readable by AI shopping answers.' : 'No price found in the raw HTML — it likely loads via JavaScript, so LLMs can’t read it.'));
  }

  if (!items.length) items.push(R('Dynamic content', 'read', 'No obvious JavaScript-hidden content patterns (reviews, filters, read-more, load-more) were detected.'));
  return { title: 'Dynamic & hidden content — the tricky bits', items };
}

export function accessGroups(html: string, f: PageFacts): AccessGroup[] {
  const js = f.jsDependent;
  const R = (label: string, status: AccessStatus, detail: string): AccessItem => ({ label, status, detail });

  const footerM = html.match(/<footer\b[\s\S]*?<\/footer>/i);
  const footerLinks = footerM ? count(/<a\b[^>]*href=/gi, footerM[0]) : 0;
  const navM = html.match(/<nav\b[\s\S]*?<\/nav>/i);
  const navLinks = navM ? count(/<a\b[^>]*href=/gi, navM[0]) : 0;

  // Count ALL links in the full HTML (incl. nav + footer) — for an access audit
  // we care about every link a crawler can follow, not just in-body ones.
  let allInternal = 0, allExternal = 0;
  const base = (f.host || '').replace(/^www\./, '');
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (/^(mailto:|tel:|#|javascript:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      try { const h = new URL(href).host.replace(/^www\./, ''); if (base && h === base) allInternal++; else allExternal++; }
      catch { allExternal++; }
    } else allInternal++;
  }

  const ogCount = count(/<meta[^>]+property=["']og:[^"']+["']/gi, html);
  const twitter = /<meta[^>]+name=["']twitter:/i.test(html);
  const hreflang = count(/<link[^>]+hreflang=/gi, html);
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const noindex = /noindex/i.test(f.robotsMeta);
  const nofollow = count(/rel=["'][^"']*nofollow/gi, html);
  const lazyImgs = count(/<img[^>]+(?:loading=["']lazy["']|data-src=|data-lazy)/gi, html);
  const carousel = /carousel|slider|swiper|slick|glide-|splide|owl-carousel/i.test(html);
  const tabs = /role=["']tab(?:panel)?["']|class=["'][^"']*\btab(?:s|-pane|-content|-panel)\b/i.test(html);
  const accordion = /accordion|<details\b/i.test(html);

  const groups: AccessGroup[] = [];

  groups.push({ title: 'SEO & meta tags', items: [
    R('Title tag', f.title ? 'read' : 'missed', f.title ? `“${f.title.slice(0, 80)}” (${f.title.length} chars)` : 'No <title> tag found.'),
    R('Meta description', f.metaDescription ? 'read' : 'missed', f.metaDescription ? `${f.metaDescription.length} chars — present.` : 'Missing — add one for snippets.'),
    R('Canonical URL', f.canonical ? 'read' : 'missed', f.canonical ? f.canonical : 'No canonical link — duplicate-content risk.'),
    R('Meta robots', noindex ? 'warn' : 'info', f.robotsMeta ? `“${f.robotsMeta}”${noindex ? ' — this page is set to NOINDEX and won’t be indexed.' : ''}` : 'No robots meta (defaults to indexable).'),
    R('Open Graph tags', ogCount >= 3 ? 'read' : ogCount ? 'partial' : 'missed', ogCount ? `${ogCount} og: tag(s) — used for link previews and some AI cards.` : 'No Open Graph tags.'),
    R('Twitter card', twitter ? 'read' : 'missed', twitter ? 'Twitter card tags present.' : 'No Twitter card tags.'),
    R('Viewport (mobile-ready)', viewport ? 'read' : 'missed', viewport ? 'Viewport meta present — mobile-friendly.' : 'No viewport meta — not mobile-optimised.'),
    ...(hreflang ? [R('hreflang (languages)', 'info', `${hreflang} hreflang alternate(s) declared.`)] : []),
  ] });

  groups.push({ title: 'Content', items: [
    R('Body text', js ? 'missed' : f.wordCount < 150 ? 'partial' : 'read', js ? 'Injected by JavaScript — near-empty in the raw HTML.' : `${f.wordCount} words in the static HTML.`),
    R('Headings', js ? 'missed' : f.headings.length ? 'read' : 'missed', js ? 'Headings injected by JS.' : `${f.headings.length} heading(s), ${f.h1Count} H1.`),
    R('Structured data (schema)', f.schemaTypes.length ? 'read' : 'missed', f.schemaTypes.length ? `JSON-LD: ${f.schemaTypes.join(', ')}.` : 'No JSON-LD schema found.'),
  ] });

  // Intelligent, page-type-aware checks for JS-hidden content.
  groups.push(dynamicChecks(html, f));

  groups.push({ title: 'Links & navigation', items: [
    R('Internal links', allInternal ? 'read' : 'missed', `${allInternal} internal link(s) — interlinking helps crawlers discover and connect your pages.`),
    R('External links', 'info', `${allExternal} outbound link(s) to other domains.`),
    R('Primary navigation', navM ? 'read' : 'missed', navM ? `<nav> present with ${navLinks} link(s) — readable.` : 'No <nav> landmark in the HTML.'),
    R('Footer', footerM ? 'read' : 'missed', footerM ? `<footer> present with ${footerLinks} link(s) — readable.` : 'No <footer> landmark in the HTML.'),
    ...(nofollow ? [R('Nofollow links', 'info', `${nofollow} link(s) marked rel="nofollow".`)] : []),
  ] });

  const media: AccessItem[] = [
    R('Images', f.images ? (f.imagesWithAlt >= f.images ? 'read' : f.imagesWithAlt ? 'partial' : 'missed') : 'info',
      f.images ? `${f.imagesWithAlt}/${f.images} have alt text (LLMs read alt text, not pixels).` : 'No images on the page.'),
  ];
  if (lazyImgs) media.push(R('Lazy-loaded images', 'warn', `${lazyImgs} image(s) load lazily (data-src / loading=lazy) — a bot that doesn’t scroll may never load them.`));
  if (carousel) media.push(R('Carousel / slider', 'warn', 'Carousel detected — slides after the first are often JS-loaded and can be invisible to crawlers.'));
  if (tabs) media.push(R('Tabbed content', 'info', 'Tabs detected — hidden tab panels are usually IN the HTML (readable) even when not visible.'));
  if (accordion) media.push(R('Accordions / <details>', 'info', 'Collapsible content detected — normally in the HTML and readable.'));
  if (f.hasVideo) media.push(R('Video', 'missed', 'Video isn’t watched by crawlers — only an on-page transcript would be read.'));
  if (f.iframes) media.push(R('Embedded frames', 'missed', `${f.iframes} <iframe> — embedded content isn’t fetched by crawlers.`));
  groups.push({ title: 'Media & interactive', items: media });

  return groups;
}
