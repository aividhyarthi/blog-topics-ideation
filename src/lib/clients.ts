// AI Page Audit — client checklists.
//
// WHY THIS EXISTS
// ----------------
// The checklist engine (checklists.ts) picks a checklist by page KIND and
// VERTICAL, detected from the HTML. That's the right default for a self-serve
// tool auditing an arbitrary URL. But when we're running this for an agency
// client with their own audit checklist (Cars24 handed us a literal 3-file,
// ~500-item SEO/AEO checklist system), a generic "automotive" checklist isn't
// what they asked for — they want their own page types (Homepage, Category,
// Car Detail Page, City Page, Blog, Compare) checked against their own rules.
//
// This module is that extra, client-specific layer. It only ever ADDS checks
// on top of the universal + kind + vertical ones — it never replaces them.
// Every check here is restricted to what a single static-HTML fetch can
// actually verify (title/meta/H1 patterns, schema, links, text patterns).
// Anything in the client's original checklist that needs a GSC API pull, a
// real browser (Core Web Vitals), a full-site crawl, or human judgement
// (log files, competitor benchmarking, editorial review) was deliberately
// left out — it doesn't belong in a stateless single-page auditor.
//
// Admin-only: this is not exposed to regular signed-up users. See
// isAdmin() gating in aeo-audit.ts and audit.astro.

import type { Check, CheckResult } from './checklists';
import type { Vertical } from './checklists';

const pass = (detail: string): CheckResult => ({ status: 'pass', detail });
const warn = (detail: string, fix: string): CheckResult => ({ status: 'warn', detail, fix });
const fail = (detail: string, fix: string): CheckResult => ({ status: 'fail', detail, fix });
const na = (detail: string): CheckResult => ({ status: 'na', detail });
const count = (s: string, re: RegExp): number => (s.match(re) || []).length;
const hasSchema = (types: string[], ...want: string[]) =>
  types.some((s) => want.some((w) => s.toLowerCase() === w.toLowerCase()));

export interface ClientPageType {
  id: string;
  label: string;
  checks: Check[];
}

export interface ClientConfig {
  id: string;
  name: string;
  domain: string;
  vertical: Vertical;
  /** Empty until we've built a checklist for this client — the UI falls back
   *  to the generic vertical checklist and says so. */
  pageTypes: ClientPageType[];
}

// ---- shared helpers for the Cars24 checklist -------------------------------

const CARS24_CITIES = [
  'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'pune',
  'kolkata', 'ahmedabad', 'jaipur', 'lucknow', 'chandigarh', 'surat', 'indore',
  'kochi', 'gurgaon', 'gurugram', 'noida', 'nagpur', 'coimbatore',
];
const CARS24_BRANDS = [
  'maruti', 'suzuki', 'honda', 'hyundai', 'toyota', 'tata', 'mahindra', 'kia',
  'renault', 'ford', 'volkswagen', 'skoda', 'nissan', 'mg', 'jeep', 'datsun',
];
const cityRe = new RegExp(`\\b(${CARS24_CITIES.join('|')})\\b`, 'i');
const brandRe = new RegExp(`\\b(${CARS24_BRANDS.join('|')})\\b`, 'i');
/** The site's own brand token, derived from the host being audited ('cars24.com' -> 'cars24'). */
const siteToken = (host: string) => (host || '').toLowerCase().split('.')[0] || '';

// =============================================================================
// HOMEPAGE
// =============================================================================

const HOMEPAGE_CHECKS: Check[] = [
  {
    id: 'c24_hp_title_brand', label: 'Title names the brand and what it does',
    why: 'Cars24 checklist HP-TM-001. An engine grounding "who is this site" reads it straight from the title tag — a title that’s just the brand name with no value prop gives it nothing to work with.',
    pillar: 'entity', weight: 3,
    run: (c) => {
      const tok = siteToken(c.facts.host);
      const inTitle = tok && c.h.includes(tok.toLowerCase()) && new RegExp(tok, 'i').test(c.facts.title);
      const valueProp = /\b(buy|sell|used cars?|online)\b/i.test(c.facts.title);
      if (inTitle && valueProp) return pass(`Title "${c.facts.title}" names the brand and states what it does.`);
      if (!inTitle) return fail(`Title "${c.facts.title}" doesn’t clearly name the brand.`, 'Put the brand name in the title tag.');
      return warn(`Title names the brand but no value prop ("buy/sell used cars").`, 'Add what the brand does — e.g. "Buy & Sell Used Cars Online".');
    },
  },
  {
    id: 'c24_hp_title_len', label: 'Title under 60 characters',
    why: 'Cars24 checklist HP-TM-002. Past ~60 characters Google truncates the title in the SERP snippet, and a truncated title is a worse grounding signal for an AI engine too.',
    pillar: 'structure', weight: 1,
    run: (c) => (c.facts.title.length > 0 && c.facts.title.length <= 60
      ? pass(`Title is ${c.facts.title.length} characters.`)
      : c.facts.title.length === 0 ? fail('No title tag.', 'Add a title tag.')
      : warn(`Title is ${c.facts.title.length} characters — likely to truncate.`, 'Shorten to 60 characters or fewer.')),
  },
  {
    id: 'c24_hp_meta_usp', label: 'Meta description states a real USP',
    why: 'Cars24 checklist HP-TM-003. "Warranty", "inspected", "easy EMI" are the claims that actually differentiate a used-car marketplace — a generic description gives an engine no reason to prefer this brand.',
    pillar: 'answerability', weight: 2,
    run: (c) => (/\b(warrant(y|ies)|inspect(ed|ion)|emi|guarantee|verified|money.?back|return policy)\b/i.test(c.facts.metaDescription)
      ? pass('Meta description states a concrete USP.')
      : c.facts.metaDescription ? warn('Meta description present but no concrete USP.', 'Mention warranty, inspection, or EMI terms explicitly.')
      : fail('No meta description.', 'Write one that states a real USP.')),
  },
  {
    id: 'c24_hp_og_tags', label: 'Open Graph tags for social sharing',
    why: 'Cars24 checklist HP-TM-005. Missing OG tags mean a shared homepage link renders with no title/image on WhatsApp, X, LinkedIn — a broken first impression.',
    pillar: 'structure', weight: 1,
    run: (c) => {
      const has = (p: string) => new RegExp(`property=["']og:${p}["']`, 'i').test(c.html);
      const n = ['title', 'description', 'image'].filter(has).length;
      return n === 3 ? pass('og:title, og:description and og:image are all present.')
        : n > 0 ? warn(`${n}/3 Open Graph tags present.`, 'Add the missing og:title / og:description / og:image tags.')
        : fail('No Open Graph tags.', 'Add og:title, og:description and og:image.');
    },
  },
  {
    id: 'c24_hp_h1_single', label: 'One clear H1',
    why: 'Cars24 checklist HP-H1-001. Missing or duplicated H1s leave the page’s main topic ambiguous to a parser.',
    pillar: 'structure', weight: 3,
    run: (c) => (c.facts.h1Count === 1 ? pass('Exactly one H1.')
      : c.facts.h1Count === 0 ? fail('No H1.', 'Add exactly one H1 stating the page’s purpose.')
      : fail(`${c.facts.h1Count} H1s.`, 'Keep exactly one H1; demote the rest to H2.')),
  },
  {
    id: 'c24_hp_trust_signals', label: 'Trust stats as readable text',
    why: 'Cars24 checklist HP-H1-005. "2M+ Happy Customers", inspection-point counts and similar trust stats are usually rendered inside a stats-counter widget — invisible to a crawler unless the number is real HTML text.',
    pillar: 'attribution', weight: 2,
    run: (c) => (/\b\d[\d,]*\s*\+?\s*(happy customers|cars sold|cities|inspection points?|dealers?|inspected)\b/i.test(c.t)
      ? pass('Trust stats appear as text.')
      : warn('No trust stats found as readable text.', 'Render key stats (customers served, cars sold, inspection points) as real text, not just an animated counter.')),
  },
  {
    id: 'c24_hp_nav_categories', label: 'Navigation links to major category pages',
    why: 'Cars24 checklist HP-LK-001. If Buy/Sell/EMI aren’t reachable as real links from the homepage, an engine (and a crawler) can’t discover them from here.',
    pillar: 'structure', weight: 2,
    run: (c) => {
      const nav = (c.h.match(/<nav\b[\s\S]*?<\/nav>/i) || [c.h])[0];
      const hits = ['buy', 'sell', 'emi'].filter((k) => new RegExp(`href=["'][^"']*${k}`, 'i').test(nav)).length;
      return hits >= 2 ? pass(`Navigation links to ${hits}/3 core categories (buy/sell/EMI).`)
        : fail('Navigation doesn’t clearly link to buy/sell/EMI pages.', 'Link the primary categories from the main nav.');
    },
  },
  {
    id: 'c24_hp_city_links', label: 'City links present for top cities',
    why: 'Cars24 checklist HP-LK-002. Homepage links to city pages are the main internal-linking path that gets city pages discovered and crawled.',
    pillar: 'structure', weight: 2,
    run: (c) => {
      const hits = new Set((c.h.match(cityRe) || []).map((s) => s.toLowerCase())).size;
      return hits >= 3 ? pass(`Links/mentions for ${hits} cities found.`)
        : hits > 0 ? warn(`Only ${hits} city mention(s).`, 'Link at least 5-6 top cities from the homepage.')
        : fail('No city links found.', 'Add links to top city pages (Mumbai, Delhi, Bangalore, etc.).');
    },
  },
  {
    id: 'c24_hp_brand_links', label: 'Car brand quick-links',
    why: 'Cars24 checklist HP-LK-003. Brand quick-filters (Honda, Maruti, Hyundai…) are a high-intent internal-linking path straight into inventory.',
    pillar: 'structure', weight: 1,
    run: (c) => {
      const hits = new Set((c.h.match(brandRe) || []).map((s) => s.toLowerCase())).size;
      return hits >= 3 ? pass(`${hits} car brands linked/mentioned.`)
        : warn(`Only ${hits} car brand(s) found.`, 'Add quick-links for top car brands.');
    },
  },
  {
    id: 'c24_hp_website_schema', label: 'WebSite schema with a search action',
    why: 'Cars24 checklist HP-SC-001. This is what enables Google’s sitelinks search box, and gives any engine a machine-readable way to know the site is searchable.',
    pillar: 'structure', weight: 2,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'WebSite') && /"potentialaction"/i.test(c.h)
      ? pass('WebSite schema with a SearchAction is present.')
      : hasSchema(c.facts.schemaTypes, 'WebSite') ? warn('WebSite schema present but no SearchAction.', 'Add a potentialAction (SearchAction) to the WebSite schema.')
      : fail('No WebSite schema.', 'Add WebSite JSON-LD with a SearchAction.')),
  },
  {
    id: 'c24_hp_org_schema', label: 'Organization schema with logo',
    why: 'Cars24 checklist HP-SC-002. This is the primary signal behind a Knowledge Panel and behind an engine treating the brand as a real, identifiable entity.',
    pillar: 'entity', weight: 2,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'Organization') && /"logo"/i.test(c.h)
      ? pass('Organization schema with a logo is present.')
      : hasSchema(c.facts.schemaTypes, 'Organization') ? warn('Organization schema present but no logo property.', 'Add a logo URL to the Organization schema.')
      : fail('No Organization schema.', 'Add Organization JSON-LD with name, logo and contact info.')),
  },
  {
    id: 'c24_hp_canonical', label: 'Canonical is a clean, self-referencing HTTPS URL',
    why: 'Cars24 checklist HP-TC-001. A canonical pointing somewhere else, or carrying tracking parameters, tells every crawler this isn’t the authoritative version of the homepage.',
    pillar: 'structure', weight: 2,
    run: (c) => {
      const can = c.facts.canonical || '';
      if (!can) return fail('No canonical tag.', 'Add a self-referencing canonical.');
      if (!/^https:\/\//i.test(can)) return fail('Canonical is not HTTPS.', 'Canonicalize to the HTTPS URL.');
      if (/[?#]/.test(can)) return warn('Canonical carries a query string or fragment.', 'Canonicalize to the clean URL with no parameters.');
      return pass('Canonical is a clean HTTPS URL.');
    },
  },
  {
    id: 'c24_hp_no_noindex', label: 'Homepage is not accidentally noindexed',
    why: 'Cars24 checklist HP-TC-007. A stray noindex on the homepage — usually shipped from staging by mistake — is the single most damaging technical error a site can make.',
    pillar: 'structure', weight: 3,
    run: (c) => (/noindex/i.test(c.facts.robotsMeta || '')
      ? fail('meta robots contains "noindex" on the homepage.', 'Remove noindex immediately — this blocks the entire site’s entry point.')
      : pass('No noindex directive.')),
  },
  {
    id: 'c24_hp_no_breadcrumb', label: 'No breadcrumb schema on the homepage',
    why: 'Cars24 checklist HP-TC-005. A breadcrumb on the homepage is a modelling mistake — the homepage is the root, it has nothing to break down into.',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'BreadcrumbList')
      ? warn('BreadcrumbList schema present on the homepage.', 'Remove it — the homepage is the root of the breadcrumb trail, not a step in it.')
      : pass('Correctly has no breadcrumb schema.')),
  },
];

// =============================================================================
// CATEGORY PAGE
// =============================================================================

const CATEGORY_CHECKS: Check[] = [
  {
    id: 'c24_cat_title_location', label: 'Title includes the category keyword and a location modifier',
    why: 'Cars24 checklist CAT-TM-001. "Used Cars in Mumbai" targets a real, high-volume query; "Used Cars" alone competes with every other category page on the site.',
    pillar: 'query', weight: 3,
    run: (c) => {
      const hasCity = cityRe.test(c.facts.title);
      const hasKw = /\bused\b/i.test(c.facts.title);
      if (hasCity && hasKw) return pass(`Title "${c.facts.title}" has both the keyword and a location.`);
      if (hasKw) return warn('Title has the category keyword but no location modifier.', 'Add the specific city/location to the title.');
      return fail('Title is missing the category keyword.', 'Include "Used Cars" (or the category) and a location modifier.');
    },
  },
  {
    id: 'c24_cat_meta_count_cta', label: 'Meta description has a car count and a CTA',
    why: 'Cars24 checklist CAT-TM-005. "Browse 500+ Used Cars in Mumbai" is a concrete, clickable promise; a generic description isn’t.',
    pillar: 'answerability', weight: 2,
    run: (c) => (/\b\d[\d,]*\+?\s*(cars?|listings?|vehicles?)\b/i.test(c.facts.metaDescription)
      ? pass('Meta description states a car count.')
      : warn('No car count in meta description.', 'State the number of cars available, e.g. "Browse 500+ Used Cars".')),
  },
  {
    id: 'c24_cat_h1_topic', label: 'H1 matches the category + location',
    why: 'Cars24 checklist CAT-H1-001. A generic H1 ("Cars") wastes the page’s clearest topical signal.',
    pillar: 'query', weight: 3,
    run: (c) => {
      const h1 = c.facts.headings.find((h) => h.level === 1)?.text || '';
      if (!h1) return fail('No H1.', 'Add an H1 naming the category and location.');
      return cityRe.test(h1) || /\bused\b/i.test(h1) ? pass(`H1 "${h1}" states the category/location.`)
        : warn(`H1 "${h1}" is generic.`, 'Make the H1 specific — e.g. "Used Cars in Mumbai".');
    },
  },
  {
    id: 'c24_cat_intro_text', label: 'Unique introductory content, not just a listing grid',
    why: 'Cars24 checklist CAT-H1-002. A page that is only a grid of cards has almost no text an engine can retrieve to explain what the category is.',
    pillar: 'structure', weight: 2,
    run: (c) => (c.facts.wordCount >= 120 ? pass(`${c.facts.wordCount} words of page text beyond the listing grid.`)
      : fail('Almost no descriptive text — looks like a bare listing grid.', 'Add an intro paragraph describing the category.')),
  },
  {
    id: 'c24_cat_faq', label: 'FAQ section for related questions',
    why: 'Cars24 checklist CAT-H1-003. Category-level FAQs are how "People Also Ask"-style questions get captured on a listing page.',
    pillar: 'query', weight: 2,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'FAQPage') ? pass('FAQPage schema present.')
      : c.facts.hasFaqHeading ? warn('FAQ section exists but isn’t marked up as FAQPage.', 'Add FAQPage JSON-LD.')
      : fail('No FAQ section.', 'Add a short FAQ addressing common questions for this category.')),
  },
  {
    id: 'c24_cat_car_count_dynamic', label: 'Car count is shown and looks real',
    why: 'Cars24 checklist CAT-H1-005. A stated count builds trust and gives an engine a concrete number to quote — but only if it looks like real inventory, not a placeholder.',
    pillar: 'answerability', weight: 1,
    run: (c) => {
      const m = c.t.match(/\b(\d[\d,]*)\+?\s*(cars?|results?|listings?)\s*(found|available)?\b/i);
      if (!m) return warn('No car count shown on the page.', 'Show the live inventory count, e.g. "450 Cars Found".');
      const n = parseInt(m[1].replace(/,/g, ''), 10);
      return n > 0 ? pass(`Shows a car count (${m[1]}).`) : warn('Car count shown is zero.', 'Verify this category actually has inventory, or noindex it if empty.');
    },
  },
  {
    id: 'c24_cat_sub_links', label: 'Sub-category filter links (brand / price / year)',
    why: 'Cars24 checklist CAT-LK-001. These are the internal links that let a crawler discover the narrower, higher-intent category pages beneath this one.',
    pillar: 'structure', weight: 1,
    run: (c) => {
      const hits = ['brand', 'price', 'budget', 'year', 'fuel', 'transmission'].filter((k) => new RegExp(`href=["'][^"']*${k}`, 'i').test(c.h) || new RegExp(`\\b${k}\\b`, 'i').test(c.t)).length;
      return hits >= 2 ? pass(`${hits} filter dimensions linked (brand/price/year/fuel).`)
        : warn('Few or no sub-category filter links found.', 'Link brand, price-range and year filter pages.');
    },
  },
  {
    id: 'c24_cat_breadcrumb', label: 'BreadcrumbList schema matches the visible trail',
    why: 'Cars24 checklist CAT-SC-001. This is what lets an engine place the category correctly in the site’s hierarchy (Home > Used Cars > Mumbai).',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'BreadcrumbList') ? pass('BreadcrumbList schema present.')
      : warn('No BreadcrumbList schema.', 'Add BreadcrumbList JSON-LD matching the visible breadcrumb.')),
  },
  {
    id: 'c24_cat_itemlist', label: 'ItemList schema for the car listings',
    why: 'Cars24 checklist CAT-SC-002. This declares the page as a ranked/ordered set of items rather than one long undifferentiated block.',
    pillar: 'structure', weight: 2,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'ItemList') ? pass('ItemList schema present.')
      : fail('No ItemList schema.', 'Add ItemList JSON-LD listing each car as a ListItem.')),
  },
  {
    id: 'c24_cat_clean_canonical', label: 'Canonical has no filter/sort parameters',
    why: 'Cars24 checklist CAT-TC-001. A canonical carrying ?sort= or ?page= params points crawlers at a URL variant instead of the one page that should rank.',
    pillar: 'structure', weight: 2,
    run: (c) => {
      const can = c.facts.canonical || '';
      if (!can) return fail('No canonical tag.', 'Add a self-referencing canonical.');
      return /\?/.test(can) ? warn('Canonical carries query parameters.', 'Canonicalize to the clean category URL with no filter/sort params.')
        : pass('Canonical is a clean URL.');
    },
  },
];

// =============================================================================
// CAR DETAIL PAGE (PDP)
// =============================================================================

const PDP_CHECKS: Check[] = [
  {
    id: 'c24_cdp_title_year_model', label: 'Title includes year, brand and model',
    why: 'Cars24 checklist CDP-TM-001. Buyers search by year + brand + model; a title missing any of those can’t match the query.',
    pillar: 'entity', weight: 3,
    run: (c) => {
      const hasYear = /\b(19|20)\d{2}\b/.test(c.facts.title);
      const hasBrand = brandRe.test(c.facts.title);
      if (hasYear && hasBrand) return pass('Title includes both a year and a recognizable brand.');
      const missing = [!hasYear && 'year', !hasBrand && 'brand'].filter(Boolean).join(' and ');
      return fail(`Title is missing the ${missing}.`, 'Format the title as "Year Brand Model Variant | Used Cars | Brand".');
    },
  },
  {
    id: 'c24_cdp_meta_specs', label: 'Meta description includes key specs and a CTA',
    why: 'Cars24 checklist CDP-TM-003. Km driven, fuel type and an inspection/EMI claim make the snippet itself answer the buyer’s first questions.',
    pillar: 'answerability', weight: 2,
    run: (c) => {
      const hasKm = /\b\d[\d,]*\s*km\b/i.test(c.facts.metaDescription);
      const hasFuel = /\b(petrol|diesel|cng|electric)\b/i.test(c.facts.metaDescription);
      return hasKm || hasFuel ? pass('Meta description includes real specs.')
        : warn('Meta description has no specs.', 'Include odometer reading and fuel type in the meta description.');
    },
  },
  {
    id: 'c24_cdp_h1_present', label: 'H1 names the specific car, not a generic label',
    why: 'Cars24 checklist CDP-H1-001. A generic "Used Car for Sale" H1 gives an engine nothing to distinguish this listing from any other.',
    pillar: 'entity', weight: 3,
    run: (c) => {
      const h1 = c.facts.headings.find((h) => h.level === 1)?.text || '';
      if (!h1) return fail('No H1.', 'Add an H1 naming year + brand + model.');
      return /\b(19|20)\d{2}\b/.test(h1) || brandRe.test(h1) ? pass(`H1 "${h1}" names the specific car.`)
        : warn(`H1 "${h1}" looks generic.`, 'Make the H1 specific to this exact car.');
    },
  },
  {
    id: 'c24_cdp_specs_table', label: 'Specifications as a real table or list',
    why: 'Cars24 checklist CDP-H1-002. Specs published as an image or inside a script-built widget don’t exist to a crawler that only reads HTML.',
    pillar: 'structure', weight: 3,
    run: (c) => ((c.facts.tables + c.facts.lists) >= 1 ? pass(`${c.facts.tables} table(s) / ${c.facts.lists} list(s) of specs.`)
      : fail('No spec table or list found.', 'Publish specs as a real HTML table, not an image.')),
  },
  {
    id: 'c24_cdp_key_details_text', label: 'Fuel type, transmission and ownership stated as text',
    why: 'Cars24 checklist CDP-H1-005. These three are the specific terms buyers search by, and they need to exist as plain text — not just icons in a spec widget.',
    pillar: 'query', weight: 2,
    run: (c) => {
      const fuel = /\b(petrol|diesel|cng|electric)\b/i.test(c.t);
      const trans = /\b(manual|automatic)\b/i.test(c.t);
      const owner = /\bowners?\b/i.test(c.t);
      const n = [fuel, trans, owner].filter(Boolean).length;
      return n === 3 ? pass('Fuel type, transmission and ownership are all stated.')
        : warn(`Only ${n}/3 of fuel type, transmission, ownership found as text.`, 'State all three plainly on the page.');
    },
  },
  {
    id: 'c24_cdp_similar_cars', label: 'Similar/recommended cars are real crawlable links',
    why: 'Cars24 checklist CDP-H1-007. If this section is JS-only, it’s also the internal-linking path that would otherwise help crawlers discover other listings.',
    pillar: 'structure', weight: 1,
    run: (c) => (/\b(similar cars?|you may also like|recommended cars?)\b/i.test(c.t) && count(c.h, /<a\s[^>]*href=/gi) > 5
      ? pass('A "similar cars" section with real links is present.')
      : warn('No clear "similar cars" section with links.', 'Add a similar-cars section with real <a href> links to other listings.')),
  },
  {
    id: 'c24_cdp_city_mentioned', label: 'City of the listing is stated as text',
    why: 'Cars24 checklist CDP-H1-008. "Available in Mumbai" grounds the listing geographically for location-scoped questions.',
    pillar: 'entity', weight: 1,
    run: (c) => (cityRe.test(c.t) ? pass('City of the listing is mentioned in text.') : warn('No city mentioned as text.', 'State the city the car is listed in.')),
  },
  {
    id: 'c24_cdp_vehicle_schema', label: 'Vehicle/Car schema with core properties',
    why: 'Cars24 checklist CDP-SC-001. This declares brand, model and model year as structured data instead of leaving an engine to parse them out of prose.',
    pillar: 'structure', weight: 3,
    run: (c) => {
      const has = hasSchema(c.facts.schemaTypes, 'Car', 'Vehicle', 'Product');
      if (!has) return fail('No Vehicle/Car/Product schema.', 'Add Car or Vehicle JSON-LD with brand, model and modelDate.');
      const brand = /"brand"\s*:/.test(c.h);
      const model = /"model"\s*:/.test(c.h);
      return brand && model ? pass('Vehicle schema includes brand and model.') : warn('Schema present but missing brand/model properties.', 'Add brand and model to the schema.');
    },
  },
  {
    id: 'c24_cdp_offer_schema', label: 'Offer schema with price and availability',
    why: 'Cars24 checklist CDP-SC-002. Price and availability as declared values are what let a shopping answer filter and quote this listing correctly.',
    pillar: 'answerability', weight: 3,
    run: (c) => {
      const offers = /"offers"\s*:/.test(c.h);
      const avail = /"availability"\s*:/.test(c.h);
      if (!offers) return fail('No offers block in schema.', 'Add an offers block with price, priceCurrency and availability.');
      return avail ? pass('Offer schema includes price and availability.') : warn('Offers present but no availability property.', 'Add availability (InStock/OutOfStock).');
    },
  },
  {
    id: 'c24_cdp_breadcrumb', label: 'BreadcrumbList schema for the car’s position in the catalog',
    why: 'Cars24 checklist CDP-SC-005. Home > Used Cars > Brand > this exact car is what places the listing correctly in the site’s structure.',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'BreadcrumbList') ? pass('BreadcrumbList schema present.')
      : warn('No BreadcrumbList schema.', 'Add a BreadcrumbList matching the visible trail.')),
  },
  {
    id: 'c24_cdp_click_to_call', label: 'Click-to-call phone link',
    why: 'Cars24 checklist CDP-TC-007. On mobile, a plain phone number that isn’t a tel: link is a real conversion loss, not just an SEO nitpick.',
    pillar: 'answerability', weight: 1,
    run: (c) => (/href=["']tel:/i.test(c.h) ? pass('Click-to-call link present.') : warn('No tel: link found.', 'Make the phone number/CTA a real <a href="tel:..."> link.')),
  },
];

// =============================================================================
// CITY PAGE
// =============================================================================

const CITY_CHECKS: Check[] = [
  {
    id: 'c24_city_title_exact', label: 'Title includes the exact city name',
    why: 'Cars24 checklist CITY-TM-001. "Used Cars in Hyderabad" needs the literal city name — a vague regional label won’t match the local query.',
    pillar: 'entity', weight: 3,
    run: (c) => (cityRe.test(c.facts.title) ? pass(`Title names a specific city.`) : fail('No specific city named in the title.', 'Include the exact city name in the title.')),
  },
  {
    id: 'c24_city_meta_count', label: 'Meta description mentions the car count for this city',
    why: 'Cars24 checklist CITY-TM-004. A city-specific inventory count ("1,200+ Used Cars in Hyderabad") is a concrete, local claim a template copy can’t fake.',
    pillar: 'answerability', weight: 1,
    run: (c) => (/\b\d[\d,]*\+?\s*(cars?|vehicles?)\b/i.test(c.facts.metaDescription)
      ? pass('Meta description states a car count.')
      : warn('No car count in meta description.', 'State the number of cars available in this city.')),
  },
  {
    id: 'c24_city_h1', label: 'H1 includes the city name and primary keyword',
    why: 'Cars24 checklist CITY-H1-001. This is the page’s strongest local-relevance signal.',
    pillar: 'query', weight: 3,
    run: (c) => {
      const h1 = c.facts.headings.find((h) => h.level === 1)?.text || '';
      if (!h1) return fail('No H1.', 'Add an H1 naming the city and category.');
      return cityRe.test(h1) ? pass(`H1 "${h1}" names the city.`) : fail(`H1 "${h1}" doesn’t name the city.`, 'Include the exact city name in the H1.');
    },
  },
  {
    id: 'c24_city_unique_content', label: 'City-specific content, not templated boilerplate',
    why: 'Cars24 checklist CITY-H1-002/003. A page that only swaps the city name into an otherwise-identical template is thin, near-duplicate content across every city — engines and Google both discount it.',
    pillar: 'structure', weight: 2,
    run: (c) => {
      const cityMentions = (c.t.match(cityRe) || []).length;
      if (c.facts.wordCount < 100) return fail('Very little unique text on this city page.', 'Add at least 50+ words specific to this city — local market insight, price ranges, popular brands here.');
      return cityMentions >= 2 ? pass(`${c.facts.wordCount} words with ${cityMentions} city mentions — looks locally specific.`)
        : warn('Content exists but the city is barely mentioned within it.', 'Weave the city name and local specifics through the content, not just the H1.');
    },
  },
  {
    id: 'c24_city_faq', label: 'City-specific FAQ section',
    why: 'Cars24 checklist CITY-H1-004. "Where to buy used cars in Hyderabad" style questions are exactly what an FAQ block on a city page should answer.',
    pillar: 'query', weight: 2,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'FAQPage') ? pass('FAQPage schema present.')
      : c.facts.hasFaqHeading ? warn('FAQ section exists but isn’t marked up as FAQPage.', 'Add FAQPage JSON-LD.')
      : fail('No FAQ section.', 'Add city-specific FAQs.')),
  },
  {
    id: 'c24_city_nearby_store', label: 'Nearby store/branch location mentioned',
    why: 'Cars24 checklist CITY-LS-002/003. A physical branch address is what makes this a genuine local page rather than a keyword-stuffed landing page.',
    pillar: 'entity', weight: 1,
    run: (c) => (/\b(branch|store|showroom)\b/i.test(c.t) || /\b\d{6}\b/.test(c.t)
      ? pass('Branch/store location or a pincode is mentioned.')
      : warn('No branch location or address found.', 'Mention the nearest physical branch and its address.')),
  },
  {
    id: 'c24_city_localbusiness_schema', label: 'LocalBusiness schema with address',
    why: 'Cars24 checklist CITY-LS-001. This is the structured version of "where is your branch in this city" — geo, address and openingHours as data.',
    pillar: 'structure', weight: 2,
    run: (c) => {
      const has = hasSchema(c.facts.schemaTypes, 'LocalBusiness', 'AutoDealer', 'AutomotiveBusiness');
      if (!has) return fail('No LocalBusiness/AutoDealer schema.', 'Add LocalBusiness JSON-LD with address and geo for this city’s branch.');
      return /"address"\s*:/.test(c.h) ? pass('LocalBusiness schema includes an address.') : warn('LocalBusiness schema present but no address property.', 'Add the address property.');
    },
  },
  {
    id: 'c24_city_nap_text', label: 'Name, address, phone visible as text',
    why: 'Cars24 checklist CITY-LS-003. NAP info locked inside an image or a JS-rendered widget doesn’t exist to a crawler.',
    pillar: 'structure', weight: 1,
    run: (c) => (/\b\d{10}\b|\+91[\s-]?\d{10}/.test(c.t) ? pass('A phone number is present as text.') : warn('No phone number found as text.', 'Render the branch phone number as plain HTML text.')),
  },
  {
    id: 'c24_city_breadcrumb', label: 'BreadcrumbList schema: Home > Used Cars > City',
    why: 'Cars24 checklist CITY-SC-001.',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'BreadcrumbList') ? pass('BreadcrumbList schema present.') : warn('No BreadcrumbList schema.', 'Add a breadcrumb matching Home > Used Cars > City.')),
  },
];

// =============================================================================
// BLOG PAGE
// =============================================================================

const BLOG_CHECKS: Check[] = [
  {
    id: 'c24_blog_title_len', label: 'Title under 60 characters',
    why: 'Cars24 checklist BLOG-TM-003.',
    pillar: 'structure', weight: 1,
    run: (c) => (c.facts.title.length > 0 && c.facts.title.length <= 60 ? pass(`Title is ${c.facts.title.length} characters.`)
      : c.facts.title.length === 0 ? fail('No title tag.', 'Add a title.') : warn(`Title is ${c.facts.title.length} characters.`, 'Shorten to 60 characters or fewer.')),
  },
  {
    id: 'c24_blog_author_byline', label: 'Named author byline',
    why: 'Cars24 checklist BLOG-EAT-001. This is the single most basic E-E-A-T signal, and the one most often skipped on programmatic blog templates.',
    pillar: 'attribution', weight: 3,
    run: (c) => (c.facts.hasAuthor ? pass('Author is identified.') : fail('No author byline.', 'Add a named author to every post.')),
  },
  {
    id: 'c24_blog_author_bio_link', label: 'Author name links to a bio/profile page',
    why: 'Cars24 checklist BLOG-EAT-002. A byline with no profile link gives an engine no way to establish who this person is or what else they’ve written.',
    pillar: 'attribution', weight: 2,
    run: (c) => (!c.facts.hasAuthor ? na('No author to check a bio link for.')
      : /href=["'][^"']*\/author\//i.test(c.h) || /rel=["']author["']/i.test(c.h)
      ? pass('Author name links to a profile page.')
      : warn('Author is named but doesn’t link to a bio page.', 'Link the author’s name to an author profile page.')),
  },
  {
    id: 'c24_blog_author_schema', label: 'Author schema with credentials',
    why: 'Cars24 checklist BLOG-EAT-003. author.jobTitle or a similar credential is what turns "some person wrote this" into a claim of expertise an engine can weigh.',
    pillar: 'attribution', weight: 2,
    run: (c) => {
      const hasAuthorProp = /"author"\s*:/.test(c.h);
      if (!hasAuthorProp) return fail('No author property in schema.', 'Add author to the Article/BlogPosting schema.');
      return /"jobtitle"\s*:/.test(c.h) ? pass('Author schema includes a credential/job title.') : warn('Author in schema but no jobTitle/credential.', 'Add a jobTitle or credential to the author schema.');
    },
  },
  {
    id: 'c24_blog_dates_visible', label: 'Published and modified dates visible',
    why: 'Cars24 checklist BLOG-EAT-004. Freshness is a direct ranking and citation signal, and it has to be both visible and in the schema.',
    pillar: 'freshness', weight: 2,
    run: (c) => (c.facts.datePublished || c.facts.dateModified ? pass('A published or modified date is present.') : fail('No published/modified date found.', 'Add datePublished and dateModified.')),
  },
  {
    id: 'c24_blog_sources_cited', label: 'Sources and references cited',
    why: 'Cars24 checklist BLOG-EAT-006. External authoritative links are what separate a sourced guide from unattributed opinion.',
    pillar: 'attribution', weight: 2,
    run: (c) => (c.facts.externalLinks >= 2 ? pass(`${c.facts.externalLinks} external links.`) : warn(`Only ${c.facts.externalLinks} external link(s).`, 'Cite at least 2-3 authoritative external sources.')),
  },
  {
    id: 'c24_blog_word_count', label: 'Not too thin for the target keyword',
    why: 'Cars24 checklist BLOG-CT-010. A sub-800-word post is rarely competitive against dedicated guides on the same topic.',
    pillar: 'structure', weight: 2,
    run: (c) => (c.facts.wordCount >= 800 ? pass(`${c.facts.wordCount} words.`) : warn(`Only ${c.facts.wordCount} words.`, 'Expand toward 800+ words of real substance, not padding.')),
  },
  {
    id: 'c24_blog_commercial_links', label: 'Links to commercial pages (category/listing)',
    why: 'Cars24 checklist BLOG-CT-006. A blog post with no path into inventory is a dead end for conversion, and a missed internal-linking opportunity for those category pages too.',
    pillar: 'structure', weight: 2,
    run: (c) => (/href=["'][^"']*(used-cars|\/buy|\/category)/i.test(c.h) ? pass('Links to a commercial/category page.') : warn('No links to commercial pages found.', 'Link contextually to relevant category or listing pages.')),
  },
  {
    id: 'c24_blog_article_schema', label: 'Article or BlogPosting schema',
    why: 'Cars24 checklist BLOG-SC-001.',
    pillar: 'structure', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'Article', 'BlogPosting', 'NewsArticle') ? pass('Article/BlogPosting schema present.') : fail('No Article/BlogPosting schema.', 'Add Article or BlogPosting JSON-LD with headline, author, datePublished and image.')),
  },
  {
    id: 'c24_blog_faq_schema', label: 'FAQ schema if the post has an FAQ block',
    why: 'Cars24 checklist BLOG-SC-002.',
    pillar: 'query', weight: 1,
    run: (c) => (!c.facts.hasFaqHeading ? na('No FAQ section on this post.')
      : hasSchema(c.facts.schemaTypes, 'FAQPage') ? pass('FAQPage schema present.') : warn('FAQ section exists but isn’t marked up.', 'Add FAQPage JSON-LD.')),
  },
];

// =============================================================================
// COMPARE PAGE
// =============================================================================

const COMPARE_CHECKS: Check[] = [
  {
    id: 'c24_cmp_title_both_cars', label: 'Title includes both car names in a "vs" format',
    why: 'Cars24 checklist CMP-TM-001. This is the exact phrase a buyer comparing two specific cars types into a search box.',
    pillar: 'entity', weight: 3,
    run: (c) => (/\bvs\.?\b/i.test(c.facts.title) ? pass('Title uses a "vs" comparison format.') : fail('Title doesn’t read as a comparison.', 'Format the title as "Car A vs Car B | Comparison".')),
  },
  {
    id: 'c24_cmp_h1_both', label: 'H1 includes both car model names',
    why: 'Cars24 checklist CMP-H1-001.',
    pillar: 'entity', weight: 2,
    run: (c) => {
      const h1 = c.facts.headings.find((h) => h.level === 1)?.text || '';
      if (!h1) return fail('No H1.', 'Add an H1 naming both cars being compared.');
      return /\bvs\.?\b/i.test(h1) ? pass(`H1 "${h1}" names the comparison.`) : warn(`H1 "${h1}" doesn’t clearly read as a comparison.`, 'Include "vs" and both car names in the H1.');
    },
  },
  {
    id: 'c24_cmp_spec_table', label: 'Specification comparison table is real HTML',
    why: 'Cars24 checklist CMP-H1-002. A side-by-side spec table is the core content of a compare page — as an image it’s invisible to a crawler.',
    pillar: 'structure', weight: 3,
    run: (c) => (c.facts.tables >= 1 ? pass(`${c.facts.tables} comparison table(s) in HTML.`) : fail('No HTML table found.', 'Publish the spec comparison as a real HTML table.')),
  },
  {
    id: 'c24_cmp_proscons', label: 'Pros and cons section',
    why: 'Cars24 checklist CMP-H1-003.',
    pillar: 'structure', weight: 2,
    run: (c) => (/\bpros\b/i.test(c.t) && /\bcons\b/i.test(c.t) ? pass('Pros and cons are present.') : warn('No pros/cons section found.', 'Add a pros-and-cons breakdown for each car.')),
  },
  {
    id: 'c24_cmp_verdict', label: 'Verdict/conclusion stated',
    why: 'Cars24 checklist CMP-H1-004. "Which is better" is the actual question a compare page exists to answer — leaving it implicit wastes the page.',
    pillar: 'answerability', weight: 3,
    run: (c) => (/\b(verdict|conclusion|our take|which is better|should you buy)\b/i.test(c.t) ? pass('A verdict/conclusion is stated.') : fail('No explicit verdict.', 'Add a clear conclusion on which car wins and why.')),
  },
  {
    id: 'c24_cmp_cta_links', label: 'CTA links to browse either car',
    why: 'Cars24 checklist CMP-H1-006.',
    pillar: 'structure', weight: 1,
    run: (c) => (/href=["'][^"']*(used-|buy)/i.test(c.h) ? pass('Links to browse the compared cars are present.') : warn('No links to browse either car.', 'Add "Browse Used [Car]" links for both cars.')),
  },
  {
    id: 'c24_cmp_breadcrumb', label: 'BreadcrumbList schema',
    why: 'Cars24 checklist CMP-SC-001.',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'BreadcrumbList') ? pass('BreadcrumbList schema present.') : warn('No BreadcrumbList schema.', 'Add a breadcrumb matching Home > Compare > Car A vs Car B.')),
  },
];

// =============================================================================
// GADGETS NOW (gadgetsnow.indiatimes.com) — AEO/rankings-focused, deliberately
// lighter than Cars24's per-type depth: schema.org, freshness and
// canonicalization are the checks that actually move an AI citation or a
// ranking, so those are what's covered here rather than editorial style.
// =============================================================================

const GN_NEWS_CHECKS: Check[] = [
  {
    id: 'gn_news_schema', label: 'NewsArticle/Article schema with a published date',
    why: 'An AI engine grounding "when did this happen" reads datePublished straight from schema — text-only dates are far less reliably parsed.',
    pillar: 'freshness', weight: 3,
    run: (c) => {
      const hasType = hasSchema(c.facts.schemaTypes, 'NewsArticle', 'Article');
      if (hasType && c.facts.datePublished) return pass('NewsArticle/Article schema with datePublished present.');
      if (hasType) return warn('Article schema present but no datePublished.', 'Add datePublished to the Article/NewsArticle schema.');
      return fail('No NewsArticle/Article schema.', 'Add NewsArticle JSON-LD with datePublished and dateModified.');
    },
  },
  {
    id: 'gn_news_author', label: 'Named author byline',
    why: 'A named byline is the baseline attribution signal an engine uses to weigh whether to trust and cite the claims in the piece.',
    pillar: 'attribution', weight: 2,
    run: (c) => (c.facts.hasAuthor ? pass('Author is identified.') : fail('No author byline.', 'Add a named author to the article and its schema.')),
  },
  {
    id: 'gn_news_meta_specific', label: 'Meta description states a concrete detail (spec, price, date)',
    why: 'A meta description that names a real number gives both search snippets and AI summaries something concrete to quote instead of paraphrasing vaguely.',
    pillar: 'answerability', weight: 2,
    run: (c) => (/\d/.test(c.facts.metaDescription) ? pass('Meta description includes a concrete figure.') : warn('Meta description has no concrete detail.', 'Work a real spec, price or date into the meta description.')),
  },
  {
    id: 'gn_news_internal_links', label: 'Links to related coverage (product/category pages)',
    why: 'Internal links to the product or category being discussed give an engine the entity graph it needs to place this story in context.',
    pillar: 'structure', weight: 1,
    run: (c) => (c.facts.internalLinks >= 2 ? pass(`${c.facts.internalLinks} internal links.`) : warn('Few or no internal links.', 'Link to the relevant product/category page(s) from the story.')),
  },
];

const GN_REVIEW_CHECKS: Check[] = [
  {
    id: 'gn_review_schema', label: 'Review schema with a rating',
    why: 'Review/AggregateRating schema is what lets an engine surface "rated X/5" directly in an answer instead of having to infer a verdict from prose.',
    pillar: 'structure', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'Review') || /"reviewrating"|"aggregaterating"/i.test(c.h)
      ? pass('Review/rating schema present.') : fail('No Review or rating schema.', 'Add Review JSON-LD with reviewRating and a named author.')),
  },
  {
    id: 'gn_review_verdict_visible', label: 'A rating or verdict is visible in the text, not only in schema',
    why: 'A verdict that only exists inside a hidden schema block gives an LLM (which mostly reads visible text) nothing to quote back.',
    pillar: 'answerability', weight: 2,
    run: (c) => (/\b\d(\.\d)?\s*(\/|out of)\s*5\b|\bverdict\b|\brating:\s*\d/i.test(c.text)
      ? pass('A visible rating/verdict is present.') : warn('No visible rating/verdict found in the text.', 'State the rating or verdict in visible text, not just in schema.')),
  },
  {
    id: 'gn_review_pros_cons', label: 'Pros/cons as a structured list',
    why: 'A structured pros/cons list is directly extractable; the same content buried in a paragraph forces an engine to parse prose to find it.',
    pillar: 'structure', weight: 2,
    run: (c) => (c.facts.lists >= 1 ? pass(`${c.facts.lists} list(s) found.`) : warn('No structured list found.', 'Publish pros/cons as a real HTML list.')),
  },
  {
    id: 'gn_review_title_says_review', label: 'Title signals this is a review',
    why: 'People ask AI assistants "is the X good" or "X review" — a title that doesn’t signal review intent is a weaker match for that exact query shape.',
    pillar: 'query', weight: 1,
    run: (c) => (/\breview\b/i.test(c.facts.title) ? pass('Title signals a review.') : warn('Title doesn’t say "review".', 'Work "review" into the title.')),
  },
];

const GN_PRODUCT_CHECKS: Check[] = [
  {
    id: 'gn_product_schema', label: 'Product schema with offers/price',
    why: 'Product schema with a price is what lets an engine answer "how much does X cost" directly from the page rather than guessing.',
    pillar: 'entity', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'Product') && /"offers"/i.test(c.h) ? pass('Product schema with offers present.')
      : hasSchema(c.facts.schemaTypes, 'Product') ? warn('Product schema present but no offers block.', 'Add offers with price and priceCurrency.')
      : fail('No Product schema.', 'Add Product JSON-LD with name, brand and offers.')),
  },
  {
    id: 'gn_product_specs_table', label: 'Specifications as a real table or list',
    why: 'Specs published as prose or an image are invisible to a crawler that reads structured HTML — a table is directly parseable.',
    pillar: 'structure', weight: 3,
    run: (c) => ((c.facts.tables + c.facts.lists) >= 1 ? pass(`${c.facts.tables} table(s) / ${c.facts.lists} list(s).`) : fail('No spec table or list.', 'Publish specs as a real HTML table.')),
  },
  {
    id: 'gn_product_rating', label: 'Aggregate rating present',
    why: 'AggregateRating is a strong trust signal AI shopping answers weigh directly — a page with genuine reviews but no rating markup is leaving that signal unused.',
    pillar: 'attribution', weight: 2,
    run: (c) => (c.facts.hasAggregateRating ? pass('AggregateRating present.') : warn('No AggregateRating found.', 'Add AggregateRating to the Product schema once reviews exist.')),
  },
  {
    id: 'gn_product_brand_entity', label: 'Brand declared in schema',
    why: 'An explicit brand property disambiguates the product entity — without it, an engine has to infer the brand from the title text alone.',
    pillar: 'entity', weight: 2,
    run: (c) => (/"brand"\s*:/i.test(c.h) ? pass('Brand declared in schema.') : warn('Brand not declared in schema.', 'Add brand to the Product JSON-LD.')),
  },
];

const GN_CATEGORY_CHECKS: Check[] = [
  {
    id: 'gn_category_itemlist', label: 'ItemList schema naming the products in order',
    why: 'ItemList schema is the explicit, machine-readable version of "here are the items in this category" — without it an engine has to infer the list from link text.',
    pillar: 'structure', weight: 3,
    run: (c) => (c.facts.hasItemList ? pass('ItemList schema present.') : fail('No ItemList schema.', 'Add ItemList JSON-LD naming each product in order.')),
  },
  {
    id: 'gn_category_canonical_clean', label: 'Canonical points to a clean URL',
    why: 'A category canonical that still carries sort/pagination parameters tells engines the parameterised URL is the "real" one, splitting authority across near-duplicate URLs instead of consolidating it.',
    pillar: 'structure', weight: 2,
    run: (c) => (!c.facts.canonical ? fail('No canonical tag.', 'Add a self-referencing canonical to the clean category URL.')
      : c.facts.canonical.includes('?') ? warn('Canonical still includes a query string.', 'Point canonical at the clean, parameter-free category URL.')
      : pass('Canonical points to a clean URL.')),
  },
  {
    id: 'gn_category_breadcrumb', label: 'BreadcrumbList schema',
    why: 'Breadcrumb schema gives an engine the category hierarchy explicitly, which is how it grounds "this is a subcategory of X".',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'BreadcrumbList') ? pass('BreadcrumbList schema present.') : warn('No BreadcrumbList schema.', 'Add a breadcrumb matching Home > Category.')),
  },
  {
    id: 'gn_category_no_noindex', label: 'Not accidentally noindexed',
    why: 'A category page is a primary entry point for both search and AI citation — a stray noindex here removes the whole category from consideration, not just one article.',
    pillar: 'structure', weight: 3,
    run: (c) => (/noindex/i.test(c.facts.robotsMeta) ? fail('Page is set to noindex.', 'Remove noindex — category pages should be indexable.') : pass('Not noindexed.')),
  },
];

const GN_FILTER_CHECKS: Check[] = [
  {
    id: 'gn_filter_canonical_present', label: 'Canonical tag present',
    why: 'Filter/facet URLs are the single most common source of duplicate-content dilution on a listing site — a canonical is the fix, and it’s the check most often skipped on programmatically generated filter pages.',
    pillar: 'structure', weight: 3,
    run: (c) => (c.facts.canonical ? pass('Canonical tag present.') : fail('No canonical tag.', 'Add a canonical pointing at the base category or a clean filtered URL.')),
  },
  {
    id: 'gn_filter_h1_present', label: 'H1 reflects the applied filter',
    why: 'Programmatically generated filter pages routinely skip the H1 entirely — without one, an engine has no on-page confirmation of what this specific filtered view actually is.',
    pillar: 'structure', weight: 2,
    run: (c) => (c.facts.headings.some((h) => h.level === 1) ? pass('H1 present.') : fail('No H1.', 'Add an H1 that names the applied filter, e.g. "5G Phones Under ₹20,000".')),
  },
  {
    id: 'gn_filter_no_thin_content', label: 'Not thin content',
    why: 'A filter page that’s just a product grid with near-zero surrounding text reads as thin, duplicate-adjacent content — a real risk for filter/facet URLs specifically.',
    pillar: 'answerability', weight: 2,
    run: (c) => (c.facts.wordCount >= 150 ? pass(`${c.facts.wordCount} words.`) : warn(`Only ${c.facts.wordCount} words.`, 'Add a short intro paragraph describing this filtered view.')),
  },
  {
    id: 'gn_filter_itemlist', label: 'ItemList schema still present on the filtered view',
    why: 'The filtered result set is still a list — it should still describe itself as one, the same as the unfiltered category page does.',
    pillar: 'structure', weight: 1,
    run: (c) => (c.facts.hasItemList ? pass('ItemList schema present.') : warn('No ItemList schema on this filtered view.', 'Keep ItemList JSON-LD on filtered result pages too.')),
  },
];

const GN_BRAND_CHECKS: Check[] = [
  {
    id: 'gn_brand_entity_schema', label: 'Brand/Organization entity described in schema',
    why: 'A dedicated Brand or Organization entity is what lets an engine treat "Samsung" (or whichever brand) as a distinct, groundable entity rather than a bare string in a title.',
    pillar: 'entity', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'Brand', 'Organization') ? pass('Brand/Organization schema present.') : fail('No Brand/Organization schema.', 'Add Brand or Organization JSON-LD for this brand page.')),
  },
  {
    id: 'gn_brand_itemlist', label: 'ItemList of the brand’s products',
    why: 'A brand page exists to answer "what does this brand sell" — an explicit ItemList is the direct, structured version of that answer.',
    pillar: 'structure', weight: 2,
    run: (c) => (c.facts.hasItemList ? pass('ItemList schema present.') : warn('No ItemList schema.', 'Add ItemList JSON-LD naming the brand’s products.')),
  },
  {
    id: 'gn_brand_description', label: 'Real descriptive text about the brand',
    why: 'A page that’s pure product grid with no brand description gives an engine nothing to summarise when asked "tell me about this brand".',
    pillar: 'answerability', weight: 2,
    run: (c) => (c.facts.wordCount >= 100 ? pass(`${c.facts.wordCount} words of text.`) : warn(`Only ${c.facts.wordCount} words.`, 'Add a short description of the brand above the product grid.')),
  },
  {
    id: 'gn_brand_h1_named', label: 'H1 names the brand',
    why: 'The H1 is the clearest on-page confirmation of which brand entity this page is about.',
    pillar: 'entity', weight: 1,
    run: (c) => (c.facts.headings.some((h) => h.level === 1) ? pass('H1 present.') : fail('No H1.', 'Add an H1 naming the brand.')),
  },
];

const GN_SALE_CHECKS: Check[] = [
  {
    id: 'gn_sale_validity_signal', label: 'Offer validity is explicit',
    why: 'An engine citing a sale page needs to know if the deal is still live — Offer schema’s priceValidUntil (or an explicit "valid till" date in text) is what makes that checkable.',
    pillar: 'freshness', weight: 3,
    run: (c) => (/"pricevaliduntil"/i.test(c.h) || /\b(valid\s*(till|until)|offer\s*ends|sale\s*ends)\b/i.test(c.text)
      ? pass('Offer validity is stated.') : fail('No validity date found.', 'Add priceValidUntil to Offer schema or state a clear "valid until" date in the text.')),
  },
  {
    id: 'gn_sale_specific_prices', label: 'Specific prices are named, not vague discount language',
    why: 'A price-specific answer ("₹14,999, down from ₹19,999") is directly quotable; "great discounts" is not.',
    pillar: 'answerability', weight: 3,
    run: (c) => (c.facts.priceCount >= 1 ? pass(`${c.facts.priceCount} price(s) mentioned.`) : fail('No specific prices found.', 'Name actual prices, not just "huge discounts".')),
  },
  {
    id: 'gn_sale_freshness', label: 'Page has a modified date',
    why: 'Sale pages go stale within days — a visible dateModified is what tells both engines and readers this listing was actually checked recently.',
    pillar: 'freshness', weight: 2,
    run: (c) => (c.facts.dateModified ? pass('dateModified present.') : warn('No dateModified.', 'Add and keep dateModified current as prices/offers change.')),
  },
  {
    id: 'gn_sale_product_links', label: 'Links to the actual product pages',
    why: 'A sale roundup that never links to the product page it’s discussing gives an engine no way to connect the deal to the entity.',
    pillar: 'structure', weight: 1,
    run: (c) => (c.facts.internalLinks >= 1 ? pass(`${c.facts.internalLinks} internal link(s).`) : warn('No internal links found.', 'Link each deal to its product page.')),
  },
];

// =============================================================================
// TIMES OF INDIA (timesofindia.indiatimes.com)
// =============================================================================

const TOI_NEWS_CHECKS: Check[] = [
  {
    id: 'toi_news_schema', label: 'NewsArticle schema with a published date',
    why: 'NewsArticle + datePublished is the baseline structured signal engines use to ground "when did this happen".',
    pillar: 'freshness', weight: 3,
    run: (c) => {
      const hasType = hasSchema(c.facts.schemaTypes, 'NewsArticle', 'Article');
      if (hasType && c.facts.datePublished) return pass('NewsArticle schema with datePublished present.');
      if (hasType) return warn('Article schema present but no datePublished.', 'Add datePublished to the NewsArticle schema.');
      return fail('No NewsArticle schema.', 'Add NewsArticle JSON-LD with datePublished and dateModified.');
    },
  },
  {
    id: 'toi_news_author', label: 'Named author byline',
    why: 'A named byline is the baseline attribution signal for a news story’s claims.',
    pillar: 'attribution', weight: 2,
    run: (c) => (c.facts.hasAuthor ? pass('Author is identified.') : fail('No author byline.', 'Add a named author to the story and its schema.')),
  },
  {
    id: 'toi_news_h1_present', label: 'H1 present and matches the story',
    why: 'A missing or mismatched H1 undermines the clearest on-page confirmation of what the story is actually about.',
    pillar: 'entity', weight: 1,
    run: (c) => (c.facts.headings.some((h) => h.level === 1) ? pass('H1 present.') : fail('No H1.', 'Add an H1 matching the headline.')),
  },
  {
    id: 'toi_news_wordcount', label: 'Not a bare blurb',
    why: 'A one- or two-line story gives an AI answer engine almost nothing to extract or cite beyond the headline itself.',
    pillar: 'answerability', weight: 2,
    run: (c) => (c.facts.wordCount >= 150 ? pass(`${c.facts.wordCount} words.`) : warn(`Only ${c.facts.wordCount} words.`, 'Add enough context that the story stands on its own.')),
  },
];

const TOI_LIVEBLOG_CHECKS: Check[] = [
  {
    id: 'toi_liveblog_schema', label: 'LiveBlogPosting schema',
    why: 'LiveBlogPosting is schema.org’s dedicated type for this format — without it, an engine has no structured way to know this page is an ongoing, updating feed rather than a single static article.',
    pillar: 'structure', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'LiveBlogPosting') ? pass('LiveBlogPosting schema present.') : fail('No LiveBlogPosting schema.', 'Add LiveBlogPosting JSON-LD with liveBlogUpdate entries.')),
  },
  {
    id: 'toi_liveblog_timestamps', label: 'Individual updates are timestamped',
    why: 'Visible per-update timestamps are what let a reader (or an engine) tell which entry is the latest, and cite the right one.',
    pillar: 'freshness', weight: 2,
    run: (c) => (count(c.text, /\b\d{1,2}:\d{2}\s*(am|pm|ist)?\b/gi) >= 3 ? pass('Multiple timestamped updates found.') : warn('Few or no visible timestamps.', 'Timestamp each individual update.')),
  },
  {
    id: 'toi_liveblog_coverage_window', label: 'Coverage start time in schema',
    why: 'coverageStartTime tells an engine exactly when this live coverage began, distinguishing it from a same-day static article.',
    pillar: 'freshness', weight: 1,
    run: (c) => (/"coveragestarttime"/i.test(c.h) ? pass('coverageStartTime present.') : warn('No coverageStartTime found.', 'Add coverageStartTime (and coverageEndTime once it wraps) to the LiveBlogPosting schema.')),
  },
  {
    id: 'toi_liveblog_title_signals_live', label: 'Title signals this is live coverage',
    why: 'People searching or asking an AI for live updates use "live" in the query — a title without it is a weaker match for that intent.',
    pillar: 'query', weight: 1,
    run: (c) => (/\blive\b/i.test(c.facts.title) ? pass('Title signals live coverage.') : warn('Title doesn’t say "live".', 'Work "Live" into the title if this is ongoing coverage.')),
  },
];

const TOI_VIDEO_CHECKS: Check[] = [
  {
    id: 'toi_video_schema', label: 'VideoObject schema',
    why: 'VideoObject is what gives an engine the title, description and duration of the video as structured data instead of having to infer it from the page around it.',
    pillar: 'structure', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'VideoObject') ? pass('VideoObject schema present.') : fail('No VideoObject schema.', 'Add VideoObject JSON-LD with name, description and uploadDate.')),
  },
  {
    id: 'toi_video_text_summary', label: 'Text summary or transcript accompanies the video',
    why: 'LLM crawlers do not watch video — a page that’s just an embed with no surrounding text is functionally empty to them.',
    pillar: 'answerability', weight: 3,
    run: (c) => (c.facts.wordCount >= 100 ? pass(`${c.facts.wordCount} words of accompanying text.`) : fail(`Only ${c.facts.wordCount} words of text alongside the video.`, 'Add a text summary or transcript excerpt covering the video’s key points.')),
  },
  {
    id: 'toi_video_duration', label: 'Duration declared in schema',
    why: 'duration lets an engine answer "how long is this video" without fetching the video file itself.',
    pillar: 'structure', weight: 1,
    run: (c) => (/"duration"\s*:/i.test(c.h) ? pass('duration present in schema.') : warn('No duration property found.', 'Add duration to the VideoObject schema.')),
  },
  {
    id: 'toi_video_thumbnail', label: 'Thumbnail declared in schema',
    why: 'thumbnailUrl is required for VideoObject to be eligible for rich video results at all.',
    pillar: 'structure', weight: 1,
    run: (c) => (/"thumbnailurl"/i.test(c.h) ? pass('thumbnailUrl present.') : warn('No thumbnailUrl found.', 'Add thumbnailUrl to the VideoObject schema.')),
  },
];

const TOI_LOCAL_CHECKS: Check[] = [
  {
    id: 'toi_local_geo_named', label: 'A specific place is named in the title or H1',
    why: 'Local news lives or dies on the place name — a story about "a fire" instead of "a fire in Andheri" is unanswerable for any location-specific query.',
    pillar: 'entity', weight: 3,
    run: (c) => {
      const h1 = c.facts.headings.find((h) => h.level === 1)?.text || '';
      return cityRe.test(c.facts.title) || cityRe.test(h1) ? pass('A recognizable place is named.') : warn('No recognizable place name found in title/H1.', 'Name the specific city/locality in the title and H1.');
    },
  },
  {
    id: 'toi_local_schema_location', label: 'Location declared in schema',
    why: 'contentLocation (or a comparable address property) makes the geo-scope explicit and machine-readable, not just implied by the wording.',
    pillar: 'structure', weight: 1,
    run: (c) => (/"contentlocation"|"address"\s*:/i.test(c.h) ? pass('Location property present in schema.') : warn('No location property found in schema.', 'Add contentLocation to the NewsArticle schema.')),
  },
  {
    id: 'toi_local_meta_specific', label: 'Meta description also names the location',
    why: 'A location-specific meta description is what makes the search/AI snippet itself answer "is this about my city" at a glance.',
    pillar: 'answerability', weight: 2,
    run: (c) => (cityRe.test(c.facts.metaDescription) ? pass('Meta description names the location.') : warn('Meta description doesn’t name the location.', 'Name the city/locality in the meta description.')),
  },
  {
    id: 'toi_local_wordcount', label: 'Not a bare blurb',
    why: 'A one-line local item gives an engine little to extract beyond the headline.',
    pillar: 'answerability', weight: 1,
    run: (c) => (c.facts.wordCount >= 150 ? pass(`${c.facts.wordCount} words.`) : warn(`Only ${c.facts.wordCount} words.`, 'Add enough context that the story stands on its own.')),
  },
];

const TOI_MOVIE_CHECKS: Check[] = [
  {
    id: 'toi_movie_review_schema', label: 'Review schema naming the movie',
    why: 'Review schema with itemReviewed lets an engine connect this specific verdict to this specific film entity, not just to "a movie".',
    pillar: 'structure', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'Review') || /"itemreviewed"/i.test(c.h) ? pass('Review schema present.') : fail('No Review schema.', 'Add Review JSON-LD with itemReviewed (Movie) and reviewRating.')),
  },
  {
    id: 'toi_movie_rating_visible', label: 'A rating is visible in the text',
    why: 'A star rating that only lives in schema gives a text-reading LLM nothing to quote — it needs to be visible too.',
    pillar: 'answerability', weight: 2,
    run: (c) => (/\b\d(\.\d)?\s*(\/|out of)\s*5\b|\bstars?\b/i.test(c.text) ? pass('A visible rating is present.') : warn('No visible rating found.', 'State the star rating in visible text.')),
  },
  {
    id: 'toi_movie_reviewrating_schema', label: 'reviewRating property present',
    why: 'reviewRating is the specific structured value ("3.5/5") an engine can quote directly, rather than paraphrasing a written verdict.',
    pillar: 'entity', weight: 2,
    run: (c) => (/"reviewrating"/i.test(c.h) ? pass('reviewRating present in schema.') : warn('No reviewRating property found.', 'Add reviewRating to the Review schema.')),
  },
  {
    id: 'toi_movie_title_says_review', label: 'Title signals this is a review',
    why: 'People ask "is [movie] good" or "[movie] review" — a title that doesn’t signal review intent is a weaker match for that query shape.',
    pillar: 'query', weight: 1,
    run: (c) => (/\breview\b/i.test(c.facts.title) ? pass('Title signals a review.') : warn('Title doesn’t say "review".', 'Work "review" into the title.')),
  },
];

const TOI_HEALTH_CHECKS: Check[] = [
  {
    id: 'toi_health_source_named', label: 'A named expert or institution is cited',
    why: 'Health is a YMYL (your-money-or-your-life) topic — engines weight attribution far more heavily here than on lower-stakes content, and "experts say" with no name is the weakest form of it.',
    pillar: 'attribution', weight: 3,
    run: (c) => (/\b(dr\.|according to|study (by|published)|expert)\b/i.test(c.text) ? pass('A named source or attribution pattern is present.') : fail('No named source found.', 'Name the doctor, study or institution behind the claims.')),
  },
  {
    id: 'toi_health_schema', label: 'Article/MedicalWebPage schema present',
    why: 'Structured markup lets an engine correctly classify this as health content, which is exactly the category where it applies the strictest sourcing bar.',
    pillar: 'structure', weight: 2,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'MedicalWebPage', 'Article', 'NewsArticle') ? pass('Article/MedicalWebPage schema present.') : fail('No Article/MedicalWebPage schema.', 'Add Article or MedicalWebPage JSON-LD.')),
  },
  {
    id: 'toi_health_freshness', label: 'Published/modified date present',
    why: 'Medical guidance changes — a health story with no visible date gives a reader (or an engine) no way to judge whether it’s still current.',
    pillar: 'freshness', weight: 3,
    run: (c) => (c.facts.datePublished || c.facts.dateModified ? pass('A published or modified date is present.') : fail('No date found.', 'Add and display datePublished/dateModified.')),
  },
  {
    id: 'toi_health_no_clickbait', label: 'Title avoids exaggerated claims',
    why: 'Sensational health claims ("miracle cure") are exactly the pattern engines are tuned to distrust and deprioritize for YMYL content.',
    pillar: 'attribution', weight: 1,
    run: (c) => (/\b(miracle|instant cure|doctors hate)\b/i.test(c.facts.title) ? warn('Title uses exaggerated/clickbait language.', 'Rewrite the title to state the finding plainly.') : pass('Title avoids exaggerated claims.')),
  },
];

const TOI_REALESTATE_CHECKS: Check[] = [
  {
    id: 'toi_realestate_data_specific', label: 'Specific figures are cited, not vague trend language',
    why: 'A price-per-sqft or growth-rate figure is directly quotable by an AI answer; "prices are rising" is not.',
    pillar: 'answerability', weight: 3,
    run: (c) => ((c.facts.statistics + c.facts.priceCount) >= 1 ? pass('Specific figures are present.') : fail('No specific figures found.', 'Cite real numbers — price/sqft, growth %, unit counts.')),
  },
  {
    id: 'toi_realestate_source_attribution', label: 'Data is attributed to a named source',
    why: 'Market data without a named source (a report, a firm, an index) reads as unverifiable, which weakens both trust and citation-worthiness.',
    pillar: 'attribution', weight: 3,
    run: (c) => (/\b(according to|data (from|by)|report (by|from))\b/i.test(c.text) ? pass('Data is attributed to a source.') : fail('No source attribution found.', 'Name the report/firm/index the figures come from.')),
  },
  {
    id: 'toi_realestate_schema', label: 'NewsArticle schema present',
    why: 'Baseline structured markup for freshness and authorship, same as any news story.',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'NewsArticle', 'Article') ? pass('NewsArticle schema present.') : warn('No NewsArticle schema.', 'Add NewsArticle JSON-LD.')),
  },
  {
    id: 'toi_realestate_location_named', label: 'A specific market/location is named',
    why: 'Real-estate data is meaningless without a geography attached — "prices rose 8%" needs a city/locality to be answerable at all.',
    pillar: 'entity', weight: 2,
    run: (c) => {
      const h1 = c.facts.headings.find((h) => h.level === 1)?.text || '';
      return cityRe.test(c.facts.title) || cityRe.test(h1) ? pass('A recognizable market/location is named.') : warn('No recognizable location found.', 'Name the specific city/locality this data is about.');
    },
  },
];

const TOI_LAW_CHECKS: Check[] = [
  {
    id: 'toi_law_specifics_named', label: 'Specific court/section/case is named',
    why: '"The court ruled" is unanswerable; "the Supreme Court, in [case]" is a groundable claim an engine can cite with confidence.',
    pillar: 'entity', weight: 3,
    run: (c) => (/\b(supreme court|high court|section\s*\d+|\bipc\b|\bcrpc\b|\bbns\b)\b/i.test(c.text) ? pass('Specific legal entities are named.') : fail('No specific court/section named.', 'Name the exact court, case or section being reported.')),
  },
  {
    id: 'toi_law_attribution', label: 'The ruling/order is attributed with specifics',
    why: 'A dated, sourced order ("order dated 12 March, bench of Justice X") is verifiable; a paraphrase with no order details is not.',
    pillar: 'attribution', weight: 3,
    run: (c) => (/\b(according to|order (dated|passed)|bench (of|led))\b/i.test(c.text) ? pass('The ruling is attributed with specifics.') : warn('No specific attribution found.', 'Cite the order date and bench/judge where possible.')),
  },
  {
    id: 'toi_law_schema', label: 'NewsArticle schema present',
    why: 'Baseline structured markup for freshness and authorship.',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'NewsArticle', 'Article') ? pass('NewsArticle schema present.') : warn('No NewsArticle schema.', 'Add NewsArticle JSON-LD.')),
  },
  {
    id: 'toi_law_dates', label: 'Published date present',
    why: 'Legal news ages fast (appeals, stays, reversals) — a missing date makes it impossible to know if this is still the current status.',
    pillar: 'freshness', weight: 2,
    run: (c) => (c.facts.datePublished ? pass('datePublished present.') : fail('No datePublished found.', 'Add datePublished to the schema.')),
  },
];

const TOI_QUOTE_CHECKS: Check[] = [
  {
    id: 'toi_quote_attributed', label: 'The quote is attributed with a speech verb',
    why: 'An unattributed quote is just a floating string — "said/told/says" tied to it is what makes it a sourced claim rather than an assertion.',
    pillar: 'attribution', weight: 3,
    run: (c) => (c.facts.quotedPhrases >= 1 && /\bsaid\b|\bsays\b|\btold\b/i.test(c.text)
      ? pass('A quote with attribution language is present.') : fail('No attributed quote found.', 'Attribute the quote with "said/told" and the speaker’s name.')),
  },
  {
    id: 'toi_quote_named_speaker_visible', label: 'Quote is present in visible text',
    why: 'A quote that exists only in an image or embedded post is invisible to an LLM crawler — it needs to be real, extractable text.',
    pillar: 'answerability', weight: 2,
    run: (c) => (c.facts.quotedPhrases >= 1 ? pass(`${c.facts.quotedPhrases} quoted phrase(s) in visible text.`) : fail('No quoted text found on the page.', 'Include the actual quote as real text, not just an embedded image/post.')),
  },
  {
    id: 'toi_quote_context', label: 'The quote has surrounding context',
    why: 'A bare quote with no context leaves "why does this matter" unanswered — the surrounding paragraph is what an AI answer actually draws on.',
    pillar: 'answerability', weight: 2,
    run: (c) => (c.facts.wordCount >= 100 ? pass(`${c.facts.wordCount} words of context.`) : warn(`Only ${c.facts.wordCount} words.`, 'Add context — who said it, when, and why it matters.')),
  },
  {
    id: 'toi_quote_title_reflects', label: 'Title reflects the quote itself',
    why: 'A title built around the actual quote text is a stronger match for someone searching or asking about exactly what was said.',
    pillar: 'query', weight: 1,
    run: (c) => (/["“]/.test(c.facts.title) ? pass('Title includes quoted text.') : warn('Title doesn’t include the quote.', 'Work the quote itself into the title.')),
  },
];

const TOI_FACTCHECK_CHECKS: Check[] = [
  {
    id: 'toi_factcheck_claimreview_schema', label: 'ClaimReview schema present',
    why: 'ClaimReview is schema.org’s dedicated type for fact-checks — without it, an engine has no structured way to distinguish this from an ordinary news story, and loses the single biggest AEO advantage this page type has.',
    pillar: 'structure', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'ClaimReview') || /"claimreview"/i.test(c.h) ? pass('ClaimReview schema present.') : fail('No ClaimReview schema.', 'Add ClaimReview JSON-LD with the claim, claimant and your rating.')),
  },
  {
    id: 'toi_factcheck_verdict_stated', label: 'A clear verdict is stated',
    why: 'A fact-check answer is only useful if the verdict is unambiguous — "some parts may be accurate" is a worse answer than "False".',
    pillar: 'answerability', weight: 3,
    run: (c) => (/\b(true|false|misleading|unverified|partly true|fake)\b/i.test(c.text) ? pass('A clear verdict word is present.') : fail('No clear verdict found.', 'State the verdict plainly (True/False/Misleading/etc.).')),
  },
  {
    id: 'toi_factcheck_claim_source', label: 'The original claim and where it circulated is named',
    why: 'A fact-check needs to name what’s being checked and where it came from — without that, the verdict has nothing concrete to attach to.',
    pillar: 'attribution', weight: 2,
    run: (c) => (/\b(claim(ed)?|viral|circulating|post (on|claims))\b/i.test(c.text) ? pass('The claim and its origin are described.') : warn('No claim/source description found.', 'Describe the original claim and where it was circulating.')),
  },
  {
    id: 'toi_factcheck_dates', label: 'Published date present',
    why: 'A fact-check’s currency matters — the claim may already be old news, or the verdict may need revisiting; a date lets a reader judge that.',
    pillar: 'freshness', weight: 1,
    run: (c) => (c.facts.datePublished ? pass('datePublished present.') : warn('No datePublished found.', 'Add datePublished to the schema.')),
  },
];

// =============================================================================
// TOI AUTO (auto.timesofindia.com) — page types are our own design (the
// client asked for "the same depth as Gadgets Now" without dictating an
// exact list), matched to what an automotive vertical actually publishes.
// =============================================================================

const TOIAUTO_NEWS_CHECKS: Check[] = [
  {
    id: 'toiauto_news_schema', label: 'NewsArticle/Article schema with a published date',
    why: 'Baseline structured freshness signal for any news story.',
    pillar: 'freshness', weight: 3,
    run: (c) => {
      const hasType = hasSchema(c.facts.schemaTypes, 'NewsArticle', 'Article');
      if (hasType && c.facts.datePublished) return pass('NewsArticle/Article schema with datePublished present.');
      if (hasType) return warn('Article schema present but no datePublished.', 'Add datePublished to the schema.');
      return fail('No NewsArticle/Article schema.', 'Add NewsArticle JSON-LD with datePublished.');
    },
  },
  {
    id: 'toiauto_news_brand_named', label: 'Title names a specific brand/model',
    why: 'Automotive news searches are almost always brand/model-specific — a title with neither is a weak match for that query shape.',
    pillar: 'entity', weight: 2,
    run: (c) => (brandRe.test(c.facts.title) ? pass('Title names a recognizable brand.') : warn('Title doesn’t name a recognizable brand.', 'Name the specific brand/model in the title.')),
  },
  {
    id: 'toiauto_news_author', label: 'Named author byline',
    why: 'Baseline attribution signal for the story’s claims.',
    pillar: 'attribution', weight: 1,
    run: (c) => (c.facts.hasAuthor ? pass('Author is identified.') : warn('No author byline.', 'Add a named author.')),
  },
  {
    id: 'toiauto_news_wordcount', label: 'Not a bare blurb',
    why: 'A one-line item gives an engine little beyond the headline to extract.',
    pillar: 'answerability', weight: 1,
    run: (c) => (c.facts.wordCount >= 150 ? pass(`${c.facts.wordCount} words.`) : warn(`Only ${c.facts.wordCount} words.`, 'Add enough context that the story stands on its own.')),
  },
];

const TOIAUTO_REVIEW_CHECKS: Check[] = [
  {
    id: 'toiauto_review_schema', label: 'Review schema with a rating',
    why: 'Review schema is what lets an engine surface a verdict directly instead of inferring one from prose.',
    pillar: 'structure', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'Review') || /"reviewrating"/i.test(c.h) ? pass('Review/rating schema present.') : fail('No Review schema.', 'Add Review JSON-LD with reviewRating and a named author.')),
  },
  {
    id: 'toiauto_review_verdict_visible', label: 'A rating/verdict is visible in the text',
    why: 'A verdict only in schema gives a text-reading LLM nothing to quote.',
    pillar: 'answerability', weight: 2,
    run: (c) => (/\b\d(\.\d)?\s*(\/|out of)\s*5\b|\bverdict\b|\brating:\s*\d/i.test(c.text) ? pass('A visible rating/verdict is present.') : warn('No visible rating/verdict found.', 'State the rating or verdict in visible text.')),
  },
  {
    id: 'toiauto_review_specs_table', label: 'Specifications as a real table or list',
    why: 'A specs table is directly parseable; the same specs in prose are not.',
    pillar: 'structure', weight: 2,
    run: (c) => ((c.facts.tables + c.facts.lists) >= 1 ? pass(`${c.facts.tables} table(s) / ${c.facts.lists} list(s).`) : warn('No spec table or list.', 'Publish specs as a real HTML table.')),
  },
  {
    id: 'toiauto_review_title_year_brand', label: 'Title includes year and brand/model',
    why: 'Buyers search by year + brand + model; a title missing either can’t match that query.',
    pillar: 'entity', weight: 2,
    run: (c) => {
      const hasYear = /\b(19|20)\d{2}\b/.test(c.facts.title);
      const hasBrand = brandRe.test(c.facts.title);
      if (hasYear && hasBrand) return pass('Title includes both a year and a recognizable brand.');
      const missing = [!hasYear && 'year', !hasBrand && 'brand'].filter(Boolean).join(' and ');
      return warn(`Title is missing the ${missing}.`, 'Include both the model year and the brand/model in the title.');
    },
  },
];

const TOIAUTO_COMPARE_CHECKS: Check[] = [
  {
    id: 'toiauto_compare_signals_comparison', label: 'Title signals a comparison',
    why: 'People search "X vs Y" — a title that doesn’t reflect that exact shape is a weaker match for the query.',
    pillar: 'query', weight: 2,
    run: (c) => (/\bvs\.?\b|\bcompare(d)?\b/i.test(c.facts.title) ? pass('Title signals a comparison.') : warn('Title doesn’t signal a comparison.', 'Use a "Brand A vs Brand B" style title.')),
  },
  {
    id: 'toiauto_compare_table', label: 'Side-by-side specs table',
    why: 'A comparison’s entire value is the side-by-side data — without a table, both readers and engines have to reconstruct it from prose.',
    pillar: 'structure', weight: 3,
    run: (c) => (c.facts.tables >= 1 ? pass(`${c.facts.tables} table(s) found.`) : fail('No comparison table found.', 'Publish the spec comparison as a real HTML table.')),
  },
  {
    id: 'toiauto_compare_itemlist', label: 'ItemList schema for the models being compared',
    why: 'ItemList makes explicit which entities are being compared, rather than leaving it to be inferred from the title alone.',
    pillar: 'structure', weight: 1,
    run: (c) => (c.facts.hasItemList ? pass('ItemList schema present.') : warn('No ItemList schema.', 'Add ItemList JSON-LD naming the models being compared.')),
  },
  {
    id: 'toiauto_compare_breadcrumb', label: 'BreadcrumbList schema',
    why: 'Breadcrumb schema gives an engine the page’s place in the site hierarchy explicitly.',
    pillar: 'structure', weight: 1,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'BreadcrumbList') ? pass('BreadcrumbList schema present.') : warn('No BreadcrumbList schema.', 'Add a breadcrumb matching Home > Compare > Model A vs Model B.')),
  },
];

const TOIAUTO_LAUNCH_CHECKS: Check[] = [
  {
    id: 'toiauto_launch_schema', label: 'Product/Car schema with price',
    why: 'Structured price data is what lets an engine answer "how much does the new X cost" directly.',
    pillar: 'entity', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'Product', 'Car') && /"offers"/i.test(c.h) ? pass('Product/Car schema with offers present.')
      : hasSchema(c.facts.schemaTypes, 'Product', 'Car') ? warn('Product/Car schema present but no offers/price block.', 'Add offers with price to the schema.')
      : fail('No Product/Car schema.', 'Add Product (or Car) JSON-LD with name, brand and offers.')),
  },
  {
    id: 'toiauto_launch_specs_table', label: 'Specifications as a real table or list',
    why: 'Launch specs published as prose or an image are effectively invisible to a crawler that reads structured HTML.',
    pillar: 'structure', weight: 3,
    run: (c) => ((c.facts.tables + c.facts.lists) >= 1 ? pass(`${c.facts.tables} table(s) / ${c.facts.lists} list(s).`) : fail('No spec table or list.', 'Publish specs as a real HTML table.')),
  },
  {
    id: 'toiauto_launch_price_specific', label: 'A specific price is named',
    why: 'A launch story with no ex-showroom figure forces a reader (and an engine) to go elsewhere for the one number that matters most.',
    pillar: 'answerability', weight: 2,
    run: (c) => (c.facts.priceCount >= 1 ? pass(`${c.facts.priceCount} price(s) mentioned.`) : fail('No specific price found.', 'Name the actual ex-showroom price.')),
  },
  {
    id: 'toiauto_launch_title_brand_model', label: 'Title names the brand/model',
    why: 'The clearest on-page confirmation of which car entity this launch story is about.',
    pillar: 'entity', weight: 2,
    run: (c) => (brandRe.test(c.facts.title) ? pass('Title names a recognizable brand.') : warn('Title doesn’t name a recognizable brand.', 'Name the specific brand/model in the title.')),
  },
];

const TOIAUTO_GUIDE_CHECKS: Check[] = [
  {
    id: 'toiauto_guide_schema', label: 'HowTo/Article schema present',
    why: 'HowTo schema is what lets an engine present the guide as discrete, ordered steps rather than an undifferentiated block of prose.',
    pillar: 'structure', weight: 2,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'HowTo', 'Article') ? pass('HowTo/Article schema present.') : fail('No HowTo/Article schema.', 'Add HowTo (or Article) JSON-LD.')),
  },
  {
    id: 'toiauto_guide_structured_steps', label: 'Steps/comparisons as structured lists or tables',
    why: 'A buying guide’s value is its structure — numbered steps or a comparison table are directly extractable; the same content in paragraphs is not.',
    pillar: 'structure', weight: 2,
    run: (c) => ((c.facts.lists + c.facts.tables) >= 1 ? pass(`${c.facts.lists} list(s) / ${c.facts.tables} table(s).`) : warn('No structured list/table found.', 'Break the guide into a numbered list or comparison table.')),
  },
  {
    id: 'toiauto_guide_faq', label: 'Common questions answered directly (FAQ)',
    why: 'A guide with an explicit Q&A section maps directly onto how people phrase questions to an AI assistant.',
    pillar: 'query', weight: 2,
    run: (c) => (c.facts.hasFaqHeading || hasSchema(c.facts.schemaTypes, 'FAQPage') ? pass('FAQ content found.') : warn('No FAQ section found.', 'Add a short FAQ covering the most common buyer questions.')),
  },
  {
    id: 'toiauto_guide_depth', label: 'Sufficient depth for a buying decision',
    why: 'A shallow guide can’t actually help someone decide — depth is what earns the citation over a thinner competing page.',
    pillar: 'answerability', weight: 1,
    run: (c) => (c.facts.wordCount >= 300 ? pass(`${c.facts.wordCount} words.`) : warn(`Only ${c.facts.wordCount} words.`, 'Expand the guide to cover the decision in real depth.')),
  },
];

const TOIAUTO_VIDEO_CHECKS: Check[] = [
  {
    id: 'toiauto_video_schema', label: 'VideoObject schema',
    why: 'VideoObject gives an engine the video’s title, description and duration as structured data.',
    pillar: 'structure', weight: 3,
    run: (c) => (hasSchema(c.facts.schemaTypes, 'VideoObject') ? pass('VideoObject schema present.') : fail('No VideoObject schema.', 'Add VideoObject JSON-LD with name, description and uploadDate.')),
  },
  {
    id: 'toiauto_video_text_summary', label: 'Text summary or transcript accompanies the video',
    why: 'LLM crawlers do not watch video — without accompanying text, the page is functionally empty to them.',
    pillar: 'answerability', weight: 3,
    run: (c) => (c.facts.wordCount >= 100 ? pass(`${c.facts.wordCount} words of accompanying text.`) : fail(`Only ${c.facts.wordCount} words alongside the video.`, 'Add a text summary covering the video’s key points.')),
  },
  {
    id: 'toiauto_video_duration', label: 'Duration declared in schema',
    why: 'Required for the video to be fully eligible for rich video results.',
    pillar: 'structure', weight: 1,
    run: (c) => (/"duration"\s*:/i.test(c.h) ? pass('duration present in schema.') : warn('No duration property found.', 'Add duration to the VideoObject schema.')),
  },
  {
    id: 'toiauto_video_title_brand', label: 'Title names the brand/model',
    why: 'The clearest on-page confirmation of which car this video is actually about.',
    pillar: 'entity', weight: 1,
    run: (c) => (brandRe.test(c.facts.title) ? pass('Title names a recognizable brand.') : warn('Title doesn’t name a recognizable brand.', 'Name the specific brand/model in the title.')),
  },
];

// =============================================================================
// CLIENTS
// =============================================================================

export const CLIENTS: ClientConfig[] = [
  {
    id: 'cars24-in', name: 'CARS24.com (India)', domain: 'cars24.com', vertical: 'automotive',
    pageTypes: [
      { id: 'homepage', label: 'Homepage', checks: HOMEPAGE_CHECKS },
      { id: 'category', label: 'Category page', checks: CATEGORY_CHECKS },
      { id: 'pdp', label: 'Car detail page', checks: PDP_CHECKS },
      { id: 'city', label: 'City page', checks: CITY_CHECKS },
      { id: 'blog', label: 'Blog page', checks: BLOG_CHECKS },
      { id: 'compare', label: 'Compare page', checks: COMPARE_CHECKS },
    ],
  },
  { id: 'cars24-au', name: 'CARS24.com.au (Australia)', domain: 'cars24.com.au', vertical: 'automotive', pageTypes: [] },
  { id: 'nykaa', name: 'Nykaa.com', domain: 'nykaa.com', vertical: 'beauty', pageTypes: [] },
  { id: 'nykaa-fashion', name: 'NykaaFashion.com', domain: 'nykaafashion.com', vertical: 'ecommerce', pageTypes: [] },
  { id: 'cred', name: 'CRED.club', domain: 'cred.club', vertical: 'fintech', pageTypes: [] },
  { id: 'kuvera', name: 'Kuvera.in', domain: 'kuvera.in', vertical: 'fintech', pageTypes: [] },
  {
    id: 'toi', name: 'Times of India', domain: 'timesofindia.indiatimes.com', vertical: 'news',
    pageTypes: [
      { id: 'news', label: 'News', checks: TOI_NEWS_CHECKS },
      { id: 'liveblog', label: 'Live Blog', checks: TOI_LIVEBLOG_CHECKS },
      { id: 'video', label: 'Videos', checks: TOI_VIDEO_CHECKS },
      { id: 'local', label: 'Local News', checks: TOI_LOCAL_CHECKS },
      { id: 'movie-review', label: 'Movie Reviews', checks: TOI_MOVIE_CHECKS },
      { id: 'health', label: 'Health News', checks: TOI_HEALTH_CHECKS },
      { id: 'realestate', label: 'Real Estate News', checks: TOI_REALESTATE_CHECKS },
      { id: 'law', label: 'Law News', checks: TOI_LAW_CHECKS },
      { id: 'quote', label: 'Quotes as News', checks: TOI_QUOTE_CHECKS },
      { id: 'factcheck', label: 'Fact Checks', checks: TOI_FACTCHECK_CHECKS },
    ],
  },
  {
    id: 'gadgetsnow', name: 'Gadgets Now', domain: 'gadgetsnow.indiatimes.com', vertical: 'reviews',
    pageTypes: [
      { id: 'news', label: 'News', checks: GN_NEWS_CHECKS },
      { id: 'review', label: 'Gadget Reviews', checks: GN_REVIEW_CHECKS },
      { id: 'product', label: 'Product page', checks: GN_PRODUCT_CHECKS },
      { id: 'category', label: 'Category page', checks: GN_CATEGORY_CHECKS },
      { id: 'filter', label: 'Filter page', checks: GN_FILTER_CHECKS },
      { id: 'brand', label: 'Brand page', checks: GN_BRAND_CHECKS },
      { id: 'sale', label: 'Sales/Offers article', checks: GN_SALE_CHECKS },
    ],
  },
  { id: 'toi-homes', name: 'TOI Homes', domain: 'toihomes.com', vertical: 'realestate', pageTypes: [] },
  {
    id: 'toi-auto', name: 'TOI Auto', domain: 'auto.timesofindia.com', vertical: 'automotive',
    pageTypes: [
      { id: 'news', label: 'News', checks: TOIAUTO_NEWS_CHECKS },
      { id: 'review', label: 'Car Reviews', checks: TOIAUTO_REVIEW_CHECKS },
      { id: 'compare', label: 'Car Comparisons', checks: TOIAUTO_COMPARE_CHECKS },
      { id: 'launch', label: 'New Car Launch/Specs', checks: TOIAUTO_LAUNCH_CHECKS },
      { id: 'guide', label: 'Buying Guides', checks: TOIAUTO_GUIDE_CHECKS },
      { id: 'video', label: 'Videos', checks: TOIAUTO_VIDEO_CHECKS },
    ],
  },
];

export function getClient(id: string): ClientConfig | undefined {
  return CLIENTS.find((c) => c.id === id);
}

export function getClientPageType(clientId: string, pageTypeId: string): ClientPageType | undefined {
  return getClient(clientId)?.pageTypes.find((p) => p.id === pageTypeId);
}
