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
