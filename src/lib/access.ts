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
export function dynamicChecks(html: string, f: PageFacts): AccessGroup[] {
  const R = (label: string, status: AccessStatus, detail: string): AccessItem => ({ label, status, detail });
  const has = (re: RegExp) => re.test(html);
  const cnt = (re: RegExp) => (html.match(re) || []).length;
  const groups: AccessGroup[] = [];

  // ======================= UNIVERSAL (every page type) =======================
  const uni: AccessItem[] = [];

  // Reviews — declared (schema / "N reviews") vs actually in the raw HTML.
  let declaredReviews = 0;
  const rc = html.match(/"reviewCount"\s*:\s*"?(\d[\d,]*)"?/i) || html.match(/"ratingCount"\s*:\s*"?(\d[\d,]*)"?/i);
  if (rc) declaredReviews = parseInt(rc[1].replace(/,/g, ''), 10);
  const txtRc = html.match(/\b([\d,]{2,9})\s*(?:reviews|ratings)\b/i);
  if (!declaredReviews && txtRc) declaredReviews = parseInt(txtRc[1].replace(/,/g, ''), 10);
  const inHtmlReviews = Math.max(
    cnt(/"@type"\s*:\s*"Review"/gi),
    cnt(/itemprop=["']review["']/gi),
    cnt(/class=["'][^"']*\breview[-_](?:item|card|block|content|body|container|text)\b/gi),
  );
  if (declaredReviews > 0 || inHtmlReviews > 0) {
    if (declaredReviews > 3 && inHtmlReviews < declaredReviews * 0.5)
      uni.push(R('Reviews', inHtmlReviews ? 'partial' : 'missed',
        `The page references ${declaredReviews.toLocaleString()} reviews, but only ~${inHtmlReviews} are in the raw HTML — the rest load via JavaScript/pagination, so LLMs read only those ~${inHtmlReviews}.`));
    else if (inHtmlReviews > 0)
      uni.push(R('Reviews', 'read', `~${inHtmlReviews} review(s) are in the HTML and readable${declaredReviews ? ` (page references ${declaredReviews.toLocaleString()})` : ''}.`));
    else
      uni.push(R('Reviews', 'missed', `The page references ${declaredReviews.toLocaleString()} reviews but none are in the raw HTML — they load via JavaScript, so LLMs see none.`));
  }

  // "Read more" / truncated text.
  if (has(/read\s?-?more|show\s?-?more|view\s?-?more|see\s?more/i)) {
    const clamp = has(/line-clamp|-webkit-line-clamp|text-truncate|\btruncate\b/i);
    uni.push(R('“Read more” / truncated text', clamp ? 'read' : 'warn',
      clamp ? 'Text looks CSS-clamped — the full copy is in the HTML and readable even though visually cut off.'
        : '“Read more” detected — verify the full text is in the HTML. If it loads on click via JS, LLMs only see the visible snippet.'));
  }

  // Tabbed content (specs / description / reviews tabs).
  if (has(/role=["']tab(?:panel)?["']|class=["'][^"']*\btab(?:s|-pane|-content|-panel)\b/i)) {
    uni.push(R('Tabbed content', 'info', 'Tabs detected — panel content (description / specs / reviews) is usually in the HTML; verify the panels aren’t empty JS placeholders.'));
  }

  // Breadcrumbs — help an AI place the page in your site hierarchy.
  const bc = has(/BreadcrumbList/i) || has(/class=["'][^"']*breadcrumb/i);
  uni.push(R('Breadcrumbs', bc ? 'read' : 'info', bc ? 'Breadcrumb trail present — helps AI understand where this page sits.' : 'No breadcrumb trail detected in the HTML.'));

  groups.push({ title: 'Dynamic & hidden content — the tricky bits', items: uni });

  // ======================= PAGE-TYPE SPECIFIC =======================
  if (f.pageType === 'listing') {
    const items: AccessItem[] = [];
    // Catalogue: declared items (ItemList) vs product cards in the HTML.
    let declaredItems = 0;
    const ni = html.match(/"numberOfItems"\s*:\s*"?(\d+)"?/i);
    if (ni) declaredItems = parseInt(ni[1], 10);
    const listItems = cnt(/"@type"\s*:\s*"ListItem"/gi);
    if (!declaredItems) declaredItems = listItems;
    const cards = cnt(/class=["'][^"']*\b(?:product[-_](?:card|item|tuple|box|grid-?item)|prod[-_](?:card|item)|plp[-_](?:card|item)|listing[-_]item|item[-_]card|card[-_]product|search[-_]result)\b/gi);
    const inHtmlItems = Math.max(cards, listItems, f.priceCount);
    if (inHtmlItems >= 2)
      items.push(R('Catalogue / product listings', 'read', `~${inHtmlItems} product entries are in the raw HTML${declaredItems > inHtmlItems ? ` (the page references ~${declaredItems})` : ''} — crawlers can read the listed items.`));
    else
      items.push(R('Catalogue / product listings', 'missed', 'Couldn’t find product entries in the raw HTML — the catalogue likely renders via JavaScript, so LLMs may see no products at all.'));

    // Filters — ALWAYS reported for a listing page.
    const filterUI = has(/class=["'][^"']*\b(?:filter|facet|refine|refinement|left[-_]?nav|sidebar[-_]?filter)s?\b/i) || has(/id=["'][^"']*\bfilters?\b/i) || has(/data-filter/i) || has(/aria-label=["'][^"']*filter/i);
    const options = cnt(/<input[^>]+type=["']checkbox["']/gi) + cnt(/class=["'][^"']*\b(?:facet|filter)[-_]?(?:option|value|item|link)\b/gi);
    items.push(R('Filters / facets', filterUI && options >= 3 ? 'read' : 'warn',
      filterUI && options >= 3 ? `Filter options are in the HTML (~${options} found) — crawlers can see the refinements.`
        : filterUI ? 'A filter rail is present but its options aren’t in the raw HTML — they load via JavaScript.'
          : 'No filter rail found in the raw HTML — the left-side filters likely render via JavaScript, so crawlers can’t see them.'));

    // Pagination vs load-more/infinite scroll.
    if (has(/rel=["']next["']|class=["'][^"']*\b(?:pagination|pager|paging)\b/i))
      items.push(R('Pagination', 'read', 'Pagination links are in the HTML — crawlers can follow them to the rest of the catalogue.'));
    else if (has(/load\s?-?more|show\s?more\s?(?:results|products|items)|infinite.?scroll/i))
      items.push(R('“Load more” / infinite scroll', 'warn', 'Items beyond the first batch load on scroll/click — crawlers (which don’t scroll) see only the first set.'));
    else
      items.push(R('Pagination', 'info', 'No pagination or load-more detected — the listing may be a single page.'));

    // Sort controls.
    if (has(/sort[-_]?by|class=["'][^"']*\bsort\b/i)) items.push(R('Sort controls', 'info', 'Sort controls detected.'));

    groups.push({ title: 'Listing / catalogue', items });
  } else if (f.pageType === 'product') {
    const items: AccessItem[] = [];
    items.push(R('Price', f.priceCount > 0 ? 'read' : 'missed',
      f.priceCount > 0 ? 'A price is present in the HTML — readable by AI shopping answers.' : 'No price in the raw HTML — it likely loads via JavaScript, so LLMs can’t read it.'));
    // Variants (size / colour / SKU options).
    const variants = has(/class=["'][^"']*\b(?:swatch|variant|size[-_]?option|colou?r[-_]?option|product[-_]?option|sku)\b/i) || has(/data-sku|data-variant/i);
    items.push(R('Variants (size / colour)', variants ? 'read' : 'info', variants ? 'Variant options are in the HTML.' : 'No variant options detected in the HTML.'));
    // Specs / attributes.
    const specs = has(/class=["'][^"']*\b(?:spec|specification|tech[-_]?spec|attribute|key[-_]?feature|product[-_]?detail)s?\b/i) || cnt(/<table/gi) > 0;
    items.push(R('Specifications', specs ? 'read' : 'missed', specs ? 'A specs/attributes block is in the HTML — AI can extract the product details.' : 'No specs table/attributes found in the raw HTML.'));
    // Availability.
    const avail = has(/in\s?stock|out\s?of\s?stock|add\s?to\s?(?:cart|bag|basket)|"availability"/i);
    items.push(R('Availability', avail ? 'read' : 'info', avail ? 'Stock/availability or add-to-cart is in the HTML.' : 'No availability signal detected in the HTML.'));
    // Image gallery.
    items.push(R('Image gallery', f.images >= 2 ? 'read' : f.images === 1 ? 'partial' : 'missed', `${f.images} product image(s) in the HTML (${f.imagesWithAlt} with alt text).`));
    groups.push({ title: 'Product details', items });
  } else {
    // Article / blog / news.
    const items: AccessItem[] = [];
    items.push(R('Author / byline', f.hasAuthor ? 'read' : 'missed', f.hasAuthor ? 'A named author/byline is in the HTML — a trust signal for AI.' : 'No author/byline found in the HTML.'));
    const dated = f.datePublished || f.dateModified;
    items.push(R('Publish / updated date', dated ? 'read' : 'missed', dated ? `Date present (${(dated).slice(0, 10)}).` : 'No published/updated date found in the HTML.'));
    items.push(R('Article body', f.jsDependent ? 'missed' : f.wordCount < 250 ? 'partial' : 'read', f.jsDependent ? 'Article text is JS-injected — near-empty in the raw HTML.' : `${f.wordCount} words of article text in the HTML.`));
    groups.push({ title: 'Article essentials', items });
  }

  // Comparison table (compare pages — can occur under any type).
  if (has(/class=["'][^"']*\b(?:compare|comparison|vs[-_]?table|spec[-_]?compare)\b/i) || /\bvs\.?\b/i.test(f.title)) {
    const tableRows = cnt(/<tr\b/gi);
    groups.push({ title: 'Comparison', items: [
      R('Comparison table', tableRows >= 3 ? 'read' : 'warn', tableRows >= 3 ? `A comparison table with ~${tableRows} rows is in the HTML — the spec-by-spec comparison is readable.` : 'A comparison page was detected but the spec table doesn’t appear fully in the HTML — it may load via JavaScript.'),
    ] });
  }

  return groups;
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

  // Intelligent, page-type-aware checks (universal + listing/product/article).
  groups.push(...dynamicChecks(html, f));

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
