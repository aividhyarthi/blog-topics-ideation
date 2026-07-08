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
// Detect the product's category/vertical from content signals, so a BEAUTY
// product is audited for shade/ingredients (not RAM/specs), electronics for
// specs/warranty, fashion for size/fabric, grocery for nutrition, etc.
export type Vertical = 'beauty' | 'electronics' | 'fashion' | 'grocery' | 'automotive' | 'general';
export function detectVertical(html: string): Vertical {
  const h = html.toLowerCase();
  const score: Record<Exclude<Vertical, 'general'>, number> = { beauty: 0, electronics: 0, fashion: 0, grocery: 0, automotive: 0 };
  const hit = (k: keyof typeof score, re: RegExp, n = 1) => { if (re.test(h)) score[k] += n; };

  hit('beauty', /\bshade\b/, 2); hit('beauty', /\bspf\b/); hit('beauty', /foundation|concealer|lipstick|mascara|serum|moistur|cleanser|fragrance|perfume|cosmetic/);
  hit('beauty', /ingredient/); hit('beauty', /dermatolog|paraben|cruelty[-\s]?free|sulphate|hyaluronic|retinol/); hit('beauty', /skin type|how to use|swatch/);

  hit('electronics', /\bram\b/); hit('electronics', /\b\d+\s?gb\b/, 2); hit('electronics', /\bmah\b|\bmp\b|processor|chipset|octa[-\s]?core|refresh rate|\b5g\b|display size|warranty/);
  hit('electronics', /specification|tech spec/);

  hit('fashion', /size chart|size guide/, 2); hit('fashion', /fabric|cotton|polyester|denim|linen|leather/); hit('fashion', /wash care|neckline|sleeve|fit type|apparel|footwear/);

  hit('grocery', /nutrition|calorie|per serving/, 2); hit('grocery', /net weight|fssai|shelf life|expiry|preservative/); hit('grocery', /\bveg\b|non[-\s]?veg/);

  hit('automotive', /\bmileage\b|\bkmpl\b|\bbhp\b|\btorque\b/, 2); hit('automotive', /transmission|fuel type|seating capacity|ex[-\s]?showroom|on[-\s]?road price|engine\s?(?:cc|capacity)|airbags?|petrol|diesel/);

  let best: Vertical = 'general', top = 1;
  (Object.keys(score) as (keyof typeof score)[]).forEach((k) => { if (score[k] > top) { top = score[k]; best = k; } });
  return best;
}

const VERTICAL_LABEL: Record<Vertical, string> = { beauty: 'Beauty', electronics: 'Electronics', fashion: 'Fashion', grocery: 'Grocery', automotive: 'Automotive', general: '' };

// UNIVERSAL: read the product's OWN declared attributes from the HTML — spec
// tables, definition lists, and schema PropertyValue — so ANY product (a car,
// a watch, furniture…) is audited using its own labels, no hardcoding needed.
export function extractAttributes(html: string): string[] {
  const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const labels = new Set<string>();
  const add = (raw: string) => { const t = clean(raw); if (t.length >= 2 && t.length <= 40 && /[a-z]/i.test(t) && !/^\d+$/.test(t)) labels.add(t.replace(/[:：]\s*$/, '')); };
  // schema.org PropertyValue (e.g. "additionalProperty")
  for (const m of html.matchAll(/"@type"\s*:\s*"PropertyValue"[\s\S]{0,80}?"name"\s*:\s*"([^"]{2,40})"/gi)) add(m[1]);
  // definition lists <dt>Label</dt>
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]{1,60}?)<\/dt>/gi)) add(m[1]);
  // 2-cell table rows: first cell is the label
  for (const m of html.matchAll(/<tr[^>]*>\s*<t[hd][^>]*>([\s\S]{1,60}?)<\/t[hd]>\s*<t[hd][^>]*>[\s\S]{1,160}?<\/t[hd]>/gi)) add(m[1]);
  return [...labels].slice(0, 20);
}

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
    const vertical = detectVertical(html);
    const price = () => items.push(R('Price', f.priceCount > 0 ? 'read' : 'missed',
      f.priceCount > 0 ? 'A price is present in the HTML — readable by AI shopping answers.' : 'No price in the raw HTML — it likely loads via JavaScript.'));
    const avail = () => { const a = has(/in\s?stock|out\s?of\s?stock|add\s?to\s?(?:cart|bag|basket)|"availability"/i); items.push(R('Availability', a ? 'read' : 'info', a ? 'Stock/availability or add-to-cart is in the HTML.' : 'No availability signal detected.')); };
    const gallery = () => items.push(R('Image gallery', f.images >= 2 ? 'read' : f.images === 1 ? 'partial' : 'missed', `${f.images} product image(s) in the HTML (${f.imagesWithAlt} with alt text).`));

    if (vertical === 'beauty') {
      const shade = has(/\bshade\b|swatch|data-shade|colou?r[-_]?option|variant/i);
      items.push(R('Shade / variant', shade ? 'read' : 'info', shade ? 'Shade/variant options are in the HTML.' : 'No shade/variant options detected in the HTML.'));
      const size = has(/\b\d+\s?(?:ml|g|gm|oz)\b|size[-_]?option/i);
      items.push(R('Size / volume', size ? 'read' : 'info', size ? 'Product size/volume is in the HTML.' : 'No size/volume detected in the HTML.'));
      const ingr = has(/ingredient/i);
      items.push(R('Ingredients', ingr ? 'read' : 'missed', ingr ? 'An ingredients list is in the HTML — AI can answer “is it paraben/sulphate-free?”.' : 'No ingredients in the raw HTML — LLMs can’t answer ingredient questions (paraben-free, etc.). Big gap for beauty.'));
      const howto = has(/how to use|directions|key benefit|benefits|suitable for|skin type/i);
      items.push(R('How to use / benefits', howto ? 'read' : 'missed', howto ? 'Usage/benefits/skin-type info is in the HTML.' : 'No how-to-use / benefits / skin-type content in the HTML.'));
      price(); gallery();
    } else if (vertical === 'electronics') {
      const specs = has(/class=["'][^"']*\b(?:spec|specification|tech[-_]?spec|attribute|key[-_]?feature)s?\b/i) || has(/\b\d+\s?gb\b|\bmah\b|processor|chipset/i) || cnt(/<table/gi) > 0;
      items.push(R('Specifications', specs ? 'read' : 'missed', specs ? 'A specs block (RAM/storage/battery/display) is in the HTML — AI can extract them.' : 'No specifications found in the raw HTML.'));
      const variants = has(/storage|\d+\s?gb\b|variant|colou?r[-_]?option|swatch/i);
      items.push(R('Variants (storage / colour)', variants ? 'read' : 'info', variants ? 'Variant options are in the HTML.' : 'No variant options detected.'));
      const warranty = has(/warranty/i);
      items.push(R('Warranty', warranty ? 'read' : 'info', warranty ? 'Warranty info is in the HTML.' : 'No warranty info detected.'));
      price(); avail(); gallery();
    } else if (vertical === 'fashion') {
      const sz = has(/size[-_]?(?:chart|option|guide|selector)|\bselect size\b/i);
      items.push(R('Size options', sz ? 'read' : 'info', sz ? 'Size options/chart are in the HTML.' : 'No size options detected.'));
      const col = has(/colou?r[-_]?option|swatch|data-colou?r/i);
      items.push(R('Colour options', col ? 'read' : 'info', col ? 'Colour options are in the HTML.' : 'No colour options detected.'));
      const fabric = has(/fabric|material|cotton|polyester|denim|linen|leather/i);
      items.push(R('Fabric / material', fabric ? 'read' : 'missed', fabric ? 'Fabric/material info is in the HTML.' : 'No fabric/material info in the HTML.'));
      const care = has(/wash care|care instruction|machine wash/i);
      items.push(R('Care instructions', care ? 'read' : 'info', care ? 'Care instructions are in the HTML.' : 'No care instructions detected.'));
      price(); gallery();
    } else if (vertical === 'grocery') {
      const ingr = has(/ingredient/i);
      items.push(R('Ingredients', ingr ? 'read' : 'missed', ingr ? 'An ingredients list is in the HTML.' : 'No ingredients in the raw HTML.'));
      const nutri = has(/nutrition|per serving|calorie/i);
      items.push(R('Nutrition', nutri ? 'read' : 'missed', nutri ? 'Nutrition info is in the HTML.' : 'No nutrition info in the HTML.'));
      const qty = has(/net weight|\b\d+\s?(?:kg|g|gm|ml|l)\b|quantity|pack of/i);
      items.push(R('Weight / quantity', qty ? 'read' : 'info', qty ? 'Weight/quantity is in the HTML.' : 'No weight/quantity detected.'));
      price(); avail();
    } else if (vertical === 'automotive') {
      const specs = has(/mileage|kmpl|\bbhp\b|torque|transmission|fuel type|engine/i);
      items.push(R('Key specs (engine/mileage/fuel)', specs ? 'read' : 'missed', specs ? 'Core car specs (engine, mileage, fuel, transmission) are in the HTML.' : 'No core car specs found in the raw HTML.'));
      const variants = has(/variant|trim|\b(?:petrol|diesel|ev|electric)\b/i);
      items.push(R('Variants / trims', variants ? 'read' : 'info', variants ? 'Variant/trim options are in the HTML.' : 'No variant/trim options detected.'));
      const priceInfo = has(/ex[-\s]?showroom|on[-\s]?road|emi|starting at/i) || f.priceCount > 0;
      items.push(R('Price (ex-showroom / EMI)', priceInfo ? 'read' : 'missed', priceInfo ? 'Pricing (ex-showroom / on-road / EMI) is in the HTML.' : 'No pricing found in the raw HTML.'));
      gallery();
    } else {
      const variants = has(/class=["'][^"']*\b(?:swatch|variant|size[-_]?option|colou?r[-_]?option|product[-_]?option|sku)\b/i) || has(/data-sku|data-variant/i);
      items.push(R('Variants', variants ? 'read' : 'info', variants ? 'Variant options are in the HTML.' : 'No variant options detected.'));
      const desc = !f.jsDependent && f.wordCount >= 80;
      items.push(R('Description', desc ? 'read' : 'missed', desc ? `${f.wordCount} words of product description in the HTML.` : 'Little/no product description in the raw HTML.'));
      price(); avail(); gallery();
    }
    // UNIVERSAL — the product's own declared attributes, whatever the category.
    const attrs = extractAttributes(html);
    if (attrs.length)
      items.push(R('Declared attributes', 'read', `${attrs.length} product attribute(s) are in the HTML: ${attrs.slice(0, 12).join(', ')}${attrs.length > 12 ? '…' : ''}.`));
    groups.push({ title: `Product details${VERTICAL_LABEL[vertical] ? ` (${VERTICAL_LABEL[vertical]})` : ''}`, items });
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
