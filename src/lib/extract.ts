// Content EXTRACTOR — pulls the actual values off the page (like ChatGPT shows),
// not just presence checks. Reads JSON-LD schema (the clean, reliable source for
// name/brand/price/rating/FAQs/reviews/attributes) plus HTML section headings
// (Ingredients / How to use / Benefits…). Everything is best-effort & optional.

const clean = (s: string): string =>
  s.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&rsquo;|&apos;/gi, "'").replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();

export interface Extracted {
  name?: string; brand?: string; price?: string; availability?: string;
  rating?: { value?: string; ratings?: string; reviews?: string };
  description?: string;
  attributes: { name: string; value: string }[];
  sections: { heading: string; text: string }[];
  faqs: { q: string; a: string }[];
  reviews: string[];
  hasAny: boolean;
}

// ---- JSON-LD: collect every node (walk @graph / mainEntity / arrays) ----
function parseJsonLd(html: string): any[] {
  const nodes: any[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        nodes.push(n);
        if (Array.isArray(n['@graph'])) n['@graph'].forEach(walk);
        if (n.mainEntity) walk(n.mainEntity);
      };
      walk(JSON.parse(m[1].trim()));
    } catch { /* tolerate malformed */ }
  }
  return nodes;
}
const typesOf = (n: any): string[] => {
  const t = n?.['@type'];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map((x) => String(x).toLowerCase());
};
const CUR: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

// ---- HTML sections: grab text after known headings ----
const SECTION_RE = /^(ingredients?|key ingredients?|how to use|directions?|benefits?|key benefits?|about (?:the )?(?:product|brand)?|description|product description|suitable for|who (?:can|should) use|features?|highlights?|specifications?|expert tips?)$/i;
function extractSections(html: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  const heads: { text: string; start: number; contentStart: number }[] = [];
  const re = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) heads.push({ text: clean(m[2]), start: m.index, contentStart: m.index + m[0].length });
  for (let i = 0; i < heads.length && out.length < 8; i++) {
    if (!SECTION_RE.test(heads[i].text)) continue;
    const end = i + 1 < heads.length ? heads[i + 1].start : Math.min(html.length, heads[i].contentStart + 2500);
    const text = clean(html.slice(heads[i].contentStart, end)).slice(0, 600);
    if (text.length >= 20) out.push({ heading: heads[i].text, text });
  }
  return out;
}

export function extractContent(html: string): Extracted {
  const nodes = parseJsonLd(html);
  const product = nodes.find((n) => typesOf(n).some((t) => t === 'product' || t === 'productgroup'));
  const faqPage = nodes.find((n) => typesOf(n).includes('faqpage'));

  const out: Extracted = { attributes: [], sections: [], faqs: [], reviews: [], hasAny: false };

  if (product) {
    if (product.name) out.name = clean(String(product.name));
    const brand = product.brand?.name || product.brand;
    if (brand) out.brand = clean(String(brand));
    if (product.description) out.description = clean(String(product.description)).slice(0, 400);
    // offers (object or array)
    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    if (offer) {
      const cur = CUR[offer.priceCurrency] || (offer.priceCurrency ? offer.priceCurrency + ' ' : '');
      if (offer.price) out.price = `${cur}${offer.price}`;
      const av = String(offer.availability || '').split('/').pop();
      if (av) out.availability = av.replace(/([a-z])([A-Z])/g, '$1 $2');
    }
    const ar = product.aggregateRating;
    if (ar) out.rating = {
      value: ar.ratingValue != null ? String(ar.ratingValue) : undefined,
      ratings: ar.ratingCount != null ? String(ar.ratingCount) : undefined,
      reviews: ar.reviewCount != null ? String(ar.reviewCount) : undefined,
    };
    // additionalProperty -> attributes
    const props = Array.isArray(product.additionalProperty) ? product.additionalProperty : [];
    for (const p of props) if (p?.name && p?.value != null) out.attributes.push({ name: clean(String(p.name)), value: clean(String(p.value)).slice(0, 120) });
    // reviews
    const revs = Array.isArray(product.review) ? product.review : (product.review ? [product.review] : []);
    for (const r of revs) { const b = r?.reviewBody || r?.description; if (b) out.reviews.push(clean(String(b)).slice(0, 240)); }
  } else {
    // Non-product page: still surface name/description from meta.
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (og) out.name = clean(og[1]); else if (title) out.name = clean(title[1]);
    const md = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (md) out.description = clean(md[1]).slice(0, 400);
  }

  // FAQs from schema
  if (faqPage) {
    const q = Array.isArray(faqPage.mainEntity) ? faqPage.mainEntity : (faqPage.mainEntity ? [faqPage.mainEntity] : []);
    for (const it of q) {
      const a = it?.acceptedAnswer?.text || it?.acceptedAnswer;
      if (it?.name && a) out.faqs.push({ q: clean(String(it.name)), a: clean(String(a)).slice(0, 300) });
      if (out.faqs.length >= 10) break;
    }
  }

  // Attributes fallback: spec tables / definition lists (name -> value)
  if (out.attributes.length === 0) {
    for (const m of html.matchAll(/<tr[^>]*>\s*<t[hd][^>]*>([\s\S]{1,60}?)<\/t[hd]>\s*<t[hd][^>]*>([\s\S]{1,200}?)<\/t[hd]>/gi)) {
      const name = clean(m[1]), value = clean(m[2]);
      if (name.length >= 2 && name.length <= 40 && value && /[a-z0-9]/i.test(value) && out.attributes.length < 20) out.attributes.push({ name, value: value.slice(0, 120) });
    }
    for (const m of html.matchAll(/<dt[^>]*>([\s\S]{1,60}?)<\/dt>\s*<dd[^>]*>([\s\S]{1,200}?)<\/dd>/gi)) {
      const name = clean(m[1]), value = clean(m[2]);
      if (name && value && out.attributes.length < 20) out.attributes.push({ name, value: value.slice(0, 120) });
    }
  }

  // Section prose (ingredients / how to use / benefits…)
  out.sections = extractSections(html);

  // Review snippets fallback from HTML if schema had none
  if (out.reviews.length === 0) {
    for (const m of html.matchAll(/<[^>]+class=["'][^"']*\breview[-_](?:text|body|content|description)\b[^"']*["'][^>]*>([\s\S]{20,300}?)<\/[^>]+>/gi)) {
      const t = clean(m[1]); if (t.length >= 20) out.reviews.push(t.slice(0, 240));
      if (out.reviews.length >= 6) break;
    }
  }
  out.reviews = out.reviews.slice(0, 6);

  out.hasAny = Boolean(out.name || out.price || out.rating || out.attributes.length || out.sections.length || out.faqs.length || out.reviews.length);
  return out;
}
