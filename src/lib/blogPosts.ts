// DB-backed blog posts. Replaces the old Astro content-collection markdown
// files (src/content/blog/*.md) as the single source of truth, because a
// content collection only picks up a new file on the next build+deploy —
// the auto-publish pipeline (blogGen.ts) needs a post to go live the moment
// it's generated, with no rebuild in between.
import { query } from './db';

export interface BlogFaq { q: string; a: string }

// A small, reusable set of inline chart shapes a post can carry — rendered
// as plain inline SVG (see blogCharts.ts), never a fabricated precise
// statistic. `items` are illustrative comparisons the post's own reasoning
// supports (e.g. "checks passed before vs after"), not invented market data.
export interface ChartSpec {
  type: 'bar' | 'gauge';
  title: string;
  caption?: string;
  unit?: string;
  items: { label: string; value: number }[];
}

export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  description: string;
  bodyMarkdown: string;
  tags: string[];
  faqs: BlogFaq[];
  charts: ChartSpec[];
  author: string;
  image: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  publishDate: string;
  createdAt: string;
}

function rowToPost(r: any): BlogPost {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    bodyMarkdown: r.body_markdown,
    tags: JSON.parse(r.tags || '[]'),
    faqs: JSON.parse(r.faqs || '[]'),
    charts: JSON.parse(r.charts || '[]'),
    author: r.author,
    image: r.image || null,
    sourceUrl: r.source_url || null,
    sourceLabel: r.source_label || null,
    publishDate: r.publish_date,
    createdAt: r.created_at,
  };
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

// ---- one-time seed: the 3 hand-written launch posts, ported verbatim from
// the old markdown files (frontmatter split from body) so the switch to a DB
// backend doesn't lose or reset them. Runs once — the unique slug index
// makes re-seeding a no-op after the first successful insert.
const SEED_POSTS: Array<Omit<BlogPost, 'id' | 'createdAt'>> = [
  {
    slug: 'what-is-aeo',
    title: 'What Is AEO (Answer Engine Optimization)? A Practical Guide',
    description:
      "AEO is the practice of making a page easy for ChatGPT, Perplexity, Claude and Google AI Overviews to read, extract, trust and cite. Here's what actually changes.",
    tags: ['AEO', 'Basics'],
    image: '/blog/what-is-aeo.png',
    author: 'AI Page Audit Team',
    sourceUrl: null,
    sourceLabel: null,
    publishDate: '2026-09-09T00:00:00.000Z',
    charts: [],
    faqs: [
      {
        q: 'Is AEO the same as SEO?',
        a: 'No, though they overlap. SEO optimizes for ranking in a list of blue links a human clicks through. AEO optimizes for being the specific source an AI model reads, trusts and quotes inside a generated answer. The human may never click through to your page at all.',
      },
      {
        q: 'Do I need to do anything special, or does good SEO already cover it?',
        a: "Good SEO helps, but it isn't sufficient. Google renders your JavaScript before indexing; ChatGPT, Perplexity and Claude's crawlers read raw HTML only. A page can rank on page one of Google and be functionally invisible to every AI answer engine at the same time, if the content it's being judged on loads client-side.",
      },
      {
        q: 'Which AI crawlers actually matter for AEO?',
        a: "The ones that power live, cited answers: OAI-SearchBot (ChatGPT Search), PerplexityBot, ClaudeBot, and Google-Extended (Gemini and AI Overviews grounding). GPTBot is a separate, training-only crawler; blocking it doesn't affect whether ChatGPT cites you today.",
      },
    ],
    bodyMarkdown: `<div class="callout"><span class="callout-label">Quick answer</span><p><strong>AEO (Answer Engine Optimization)</strong> is the practice of structuring a page so ChatGPT, Perplexity, Claude and Google AI Overviews can read it, extract a clear answer from it, and trust it enough to cite it. The two biggest gaps most sites have: content that only loads via JavaScript (invisible to AI crawlers, visible to Google), and robots.txt rules that block AI crawlers by accident.</p></div>

AEO is the discipline SEO becomes once a meaningful share of search happens inside a generated answer instead of a list of links. It's not a rebrand of SEO, and it's not optional if you want to show up in an AI-generated answer, because AI answer engines read pages differently from how Google does.

## Why this became its own thing

Search used to have one audience: a crawler that rendered your page roughly the way a browser does, then a human who clicked a blue link. AI answer engines break that model in two specific ways.

**First, most AI crawlers don't execute JavaScript.** Googlebot does: it renders your page, waits for client-side content to load, then indexes what a human would see. GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot do not. They fetch the raw HTML response and read exactly that, nothing more. If your headline, your pricing, your FAQ answers, or your review content is injected by JavaScript after the initial page load, Google sees it and an AI answer engine does not, even though both crawlers hit the exact same URL.

**Second, there's often no click at all.** In a generated answer, the model has already decided what to say. Your page's job isn't to win a click, it's to be the source the model actually pulled a fact from, ideally with a visible citation. That means the unit of optimization shifts from "rank for this query" to "be extractable and trustworthy enough to quote."

## What AEO actually changes about a page

None of this is exotic. It's mostly things good technical SEO already cared about, pushed further because the reader is now a model with no patience for ambiguity:

- **Direct answers, early.** A model extracting an answer favors a page that states the answer plainly near the top, not one that makes a reader (or a model) scroll through three paragraphs of preamble first.
- **Explicit structured data.** Schema.org markup (Article, Product, FAQPage, Review, HowTo) turns an implicit fact into an explicit, machine-readable one. A model doesn't have to guess; it can read the <span class="stat">ratingValue</span> directly.
- **Named, checkable attribution.** "Experts say" is close to worthless as a trust signal. A named author, a named source, a cited study, or a quoted person with a title is what a model (and increasingly, a human) can actually verify.
- **Visible freshness.** datePublished and dateModified, both in schema and visibly on the page, tell an engine whether this is still current. This is especially decisive for anything time-sensitive.
- **Crawler access, explicitly.** robots.txt has to actually name and allow the AI crawlers that matter (OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended). A lot of sites block them by accident while trying to opt out of something else entirely.

## How to check where you actually stand

| Question | How to check it |
|---|---|
| Can AI crawlers even reach the page? | Fetch it with each crawler's real user-agent and compare |
| Is the content in the raw HTML, or JS-injected? | Diff what Googlebot receives against what GPTBot receives |
| Is structured data present and complete? | Parse the schema.org JSON-LD and check required fields |
| Is there a named author and a real date? | Read the byline and datePublished/dateModified |

The honest way to find out whether a page is AEO-ready is to fetch it as each crawler actually would and look at what comes back, not to guess from a Lighthouse score or a generic SEO checklist, since neither of those is looking at raw-HTML-only rendering the way an AI crawler does.

That's the entire premise behind [AI Page Audit](/): paste a URL, and it fetches the page as Googlebot, GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot, shows you element-by-element what each one received, then scores it against a [published checklist](/checklist) and ranks the fixes by impact. The [free LLM Access Check](/check) is the fastest way to see the raw gap; the [Full AEO Audit](/audit) adds the weighted score and the ranked fix list.

For the full list of terms that come up once you start digging into this (GPTBot vs. OAI-SearchBot, what "citation likelihood" means, what entity clarity is), see the [AEO/GEO glossary](/glossary). And for how AEO relates to SEO and GEO specifically, see [AEO vs SEO vs GEO](/blog/aeo-vs-seo-vs-geo).`,
  },
  {
    slug: 'aeo-vs-seo-vs-geo',
    title: "AEO vs SEO vs GEO: What's the Difference (and Do You Need All Three)?",
    description:
      "SEO, AEO and GEO overlap but aren't the same thing. Here's what each one actually optimizes for, in plain terms, and why most sites need all three.",
    tags: ['AEO', 'Comparison'],
    image: '/blog/aeo-vs-seo-vs-geo.png',
    author: 'AI Page Audit Team',
    sourceUrl: null,
    sourceLabel: null,
    publishDate: '2026-09-09T00:05:00.000Z',
    charts: [],
    faqs: [
      {
        q: 'Is GEO just a rebrand of AEO?',
        a: "They're close enough that people use them interchangeably, and for most sites that's fine in practice. If there's a distinction worth keeping: AEO is usually used for structured, direct-answer optimization (the kind that also serves featured snippets and voice search), while GEO specifically means optimizing for generative AI answers: ChatGPT, Perplexity, Gemini. The technical work is nearly identical either way.",
      },
      {
        q: 'If I already rank well in Google, do I still need AEO?',
        a: "Ranking well in Google search results doesn't guarantee AI visibility, because Google Search's own AI Overviews and every other AI answer engine largely ignore JavaScript-rendered content. A page can rank on page one and be invisible to ChatGPT, Perplexity and Claude at the same time, if the content Google ranked it on loads client-side.",
      },
      {
        q: 'Which should I prioritize first?',
        a: 'Technical AEO fixes (crawler access, static HTML content, structured data) tend to be cheap and high-leverage: often a handful of concrete changes rather than months of content work. Start there, then layer in the content-quality work SEO and GEO both reward: clear answers, named attribution, freshness.',
      },
    ],
    bodyMarkdown: `<div class="callout"><span class="callout-label">Quick answer</span><p>SEO, AEO and GEO all optimize for being found, but by different audiences. <strong>SEO</strong> targets a ranking algorithm that shows a human a list of links to click. <strong>AEO/GEO</strong> target an AI model that reads your page directly and decides whether to cite it, often with no click at all. Most sites need both, because the technical overlap is large and the AEO-specific gaps are usually a short, fixable list.</p></div>

SEO, AEO and GEO all describe making content easier to find. The difference is *who's* doing the finding, and what "found" actually means to them.

## SEO: optimizing for a ranked list a human clicks

Search Engine Optimization is the original discipline: get a page to rank highly in a search engine's results page, so a human sees it in a list and clicks through. The audience is a ranking algorithm; the success metric is position and click-through rate. Google's crawler renders JavaScript before it ranks a page, so client-side content generally counts.

## AEO: optimizing for extraction and citation

Answer Engine Optimization targets a different moment: a model reading your page to construct or ground an answer, then deciding whether to cite it. The audience is an AI crawler and the model behind it; the success metric is whether your page gets pulled as a source and whether it's cited when it does. Two things make this meaningfully different from SEO:

1. **Most AI crawlers don't render JavaScript.** OAI-SearchBot, PerplexityBot, ClaudeBot and Google-Extended read raw HTML only. Content injected client-side is invisible to them even when it's fully visible to Googlebot and to a human in a browser.
2. **There's often no click.** A generated answer can fully satisfy the reader without them ever visiting your page, so being *cited* matters even when it doesn't drive traffic in the traditional sense.

## GEO: optimizing for generative answers specifically

Generative Engine Optimization is the newer term, and in practice it overlaps with AEO almost completely: both describe optimizing content to be favored by generative AI systems (ChatGPT, Perplexity, Gemini) rather than a traditional ranked list. Where people draw a line, it's usually: AEO covers the broader "structured, direct-answer content" discipline that also helps with featured snippets and voice search, while GEO is specifically about generative AI answers. The technical checklist is nearly identical either way; this is much more a naming difference than a practical one.

## The overlap, and where it breaks

| | SEO | AEO / GEO |
|---|---|---|
| Reader | Ranking algorithm, then a human | AI model, directly |
| JavaScript rendered? | Yes (Googlebot) | Usually no |
| Success looks like | Rank + click | Extraction + citation |
| Structured data | Helps rankings | Often decisive |
| Freshness | A ranking signal | A trust/grounding signal |

A page that's genuinely well-built for SEO (fast, well-structured, clear headings, real schema.org markup) is most of the way to being AEO-ready too. The gaps are specific and checkable: is the actual content in the static HTML, or does it load after JavaScript runs? Does robots.txt name and allow the AI crawlers that matter, not just Googlebot? Is there a named author and a real published date, not just implied trust?

## Do you need all three?

For most sites publishing content anyone might ask an AI about: yes, practically speaking, because the overlap is large and the AEO-specific gaps are usually a short, concrete list rather than a separate content strategy. The fastest way to find your actual gaps, not a generic checklist but what's true of *your* page right now, is to fetch it the way each crawler does and look at what comes back. That's what [AI Page Audit](/) does: a [free LLM Access Check](/check) shows the raw element-by-element gap between what Googlebot and each AI crawler receive, and the [Full AEO Audit](/audit) turns that into a weighted score with ranked fixes.

See also: [What Is AEO? A Practical Guide](/blog/what-is-aeo) and the full [AEO checklist](/checklist) this tool is scored against.`,
  },
  {
    slug: 'how-to-audit-a-page-for-ai-citation',
    title: 'How to Audit a Page for AI Citation Readiness (Free AEO Audit Tool)',
    description:
      'A step-by-step walkthrough of checking whether ChatGPT, Perplexity, Claude and Google AI can actually read and cite your page, using a free AEO audit tool.',
    tags: ['AEO', 'Guide'],
    image: '/blog/how-to-audit-a-page-for-ai-citation.png',
    author: 'AI Page Audit Team',
    sourceUrl: null,
    sourceLabel: null,
    publishDate: '2026-09-09T00:10:00.000Z',
    charts: [],
    faqs: [
      {
        q: 'Is this free?',
        a: 'Yes: every account gets one free check. After that, buy a one-time credit pack for occasional use, or subscribe to Pro for volume. See /pricing for current rates.',
      },
      {
        q: 'Do I need to install anything on my site?',
        a: 'No. Paste a URL and the tool fetches it the same way the crawlers do: nothing to install, no tag to add, no waiting for a crawl.',
      },
      {
        q: "Can I audit a competitor's page, or does it have to be my own site?",
        a: "Either. The tool fetches any public URL the same way a crawler would; you don't need access to the site itself, just the URL.",
      },
    ],
    bodyMarkdown: `<div class="callout"><span class="callout-label">Quick answer</span><p>Run a <a href="/check">free LLM Access Check</a> first to confirm AI crawlers can actually reach your content (the most common failure is JavaScript-rendered text that Google sees and ChatGPT doesn't), then a <a href="/audit">Full AEO Audit</a> for a weighted score and a ranked fix list. Work the fixes in the order given, then re-check the live URL to confirm each one actually landed.</p></div>

If you want to know whether ChatGPT, Perplexity, Claude or Google AI can actually read and cite a page, the only reliable way to find out is to fetch it the way each of those crawlers does and look at what comes back, not to guess from an SEO score, which is measuring something different. Here's the actual process, using [AI Page Audit](/) as the AEO audit tool doing the fetching.

## Step 1: Check raw crawler access first

Before anything else, confirm the crawlers that matter can even reach the page and receive meaningful content. Run a [free LLM Access Check](/check):

1. Paste the page URL.
2. The tool fetches it as Googlebot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Bingbot, each with its real user-agent, both desktop and mobile.
3. Read the element-by-element breakdown: header, navigation, main content, footer, images, structured data, each checked separately.

The single most common failure here isn't a robots.txt block. It's <strong>JavaScript-rendered content</strong>. Google renders your JavaScript before indexing. ChatGPT, Perplexity and Claude's crawlers read the raw HTML response only. If your main content, your FAQ answers, or your product specs load client-side, Google sees a fully rendered page and every AI crawler sees a near-empty shell, from the same URL, at the same time. This single gap is worth checking before anything else, because no amount of content-quality work fixes it.

## Step 2: Run the full weighted audit

Once you know the crawlers can actually receive the content, run a [Full AEO Audit](/audit) to see how well that content is structured for citation. This scores the page against a [published checklist](/checklist) across six pillars, weighted by content category (a health page is weighted toward attribution/trust; breaking news toward freshness):

| Pillar | What it checks |
|---|---|
| Answerability | Can an AI extract the answer fast? |
| Entity Clarity | Are entities explicit and consistent? |
| Attribution & Trust | Can an AI trust the claims? |
| Structural Readability | Is it machine-readable? |
| Query Matchability | Does it mirror how people ask AI? |
| Freshness | Is it timely and dated? |

The report returns an overall score and letter grade, a ranked list of fixes (each with a plain-English reason it affects AI citation and a concrete fix, not "structured data: 45/100" with no idea what to change), and a desktop-vs-mobile and per-engine breakdown so you can check a specific engine on demand.

## Step 3: Fix in order of impact, not in the order you found them

The ranked fix list exists because not every gap matters equally. A missing datePublished on a breaking-news page is often more decisive than a missing alt attribute on a decorative image. Work down the list in the order given rather than picking off whichever fix looks easiest.

Common high-impact fixes, roughly in the order they tend to matter:

1. **Move JavaScript-rendered content into the initial HTML response** (SSR or prerendering) if the access check flagged it. This is the one gap that makes every other fix pointless until it's resolved.
2. **Add or complete schema.org markup** for the actual content type: Article, Product, Review, FAQPage, HowTo, with real values, not placeholder text.
3. **Name a real author and cite real sources**, not "our team" or "experts say."
4. **Add datePublished and dateModified**, both in schema and visibly on the page, and keep them current.
5. **State the direct answer early**, before the supporting detail. A model extracting an answer favors the page that doesn't make it scroll.

## Step 4: Re-check after you ship the fixes

Because everything above is checkable from the outside, you can verify a fix actually landed the same way you found the gap: re-run the check against the live URL rather than trusting that a deploy "should have" fixed it. If you're signed in, your [saved reports](/dashboard) track score history for the same URL over time, so you can see the actual delta, not just a new number with no context.

See also: [What Is AEO?](/blog/what-is-aeo) and [AEO vs SEO vs GEO](/blog/aeo-vs-seo-vs-geo) for the concepts behind why each of these checks exists.`,
  },
];

let seeded = false;
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  const { rows } = await query<{ c: number }>('SELECT COUNT(*) as c FROM blog_posts', []);
  if ((rows[0] as any)?.c > 0) return;
  for (const p of SEED_POSTS) {
    await query(
      `INSERT INTO blog_posts (slug, title, description, body_markdown, tags, faqs, charts, author, image, source_url, source_label, publish_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        p.slug, p.title, p.description, p.bodyMarkdown,
        JSON.stringify(p.tags), JSON.stringify(p.faqs), JSON.stringify(p.charts),
        p.author, p.image, p.sourceUrl, p.sourceLabel, p.publishDate,
      ],
    );
  }
}

export async function listPublishedPosts(limit = 200): Promise<BlogPost[]> {
  await ensureSeeded();
  const { rows } = await query('SELECT * FROM blog_posts ORDER BY publish_date DESC LIMIT $1', [limit]);
  return rows.map(rowToPost);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  await ensureSeeded();
  const { rows } = await query('SELECT * FROM blog_posts WHERE slug = $1', [slug]);
  return rows[0] ? rowToPost(rows[0] as any) : null;
}

export async function sourceUrlUsed(url: string): Promise<boolean> {
  await ensureSeeded();
  const { rows } = await query('SELECT 1 FROM blog_posts WHERE source_url = $1 LIMIT 1', [url]);
  return rows.length > 0;
}

/** Titles/descriptions of recent posts, handed to the generator so it can link to real posts and avoid re-covering the same angle. */
export async function recentPostSummaries(limit = 40): Promise<{ slug: string; title: string; description: string; tags: string[] }[]> {
  await ensureSeeded();
  const { rows } = await query('SELECT slug, title, description, tags FROM blog_posts ORDER BY publish_date DESC LIMIT $1', [limit]);
  return (rows as any[]).map((r) => ({ slug: r.slug, title: r.title, description: r.description, tags: JSON.parse(r.tags || '[]') }));
}

export interface NewPostInput {
  title: string;
  description: string;
  bodyMarkdown: string;
  tags: string[];
  faqs: BlogFaq[];
  charts?: ChartSpec[];
  author?: string;
  image?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  publishDate?: string;
}

export async function createPost(input: NewPostInput): Promise<BlogPost> {
  await ensureSeeded();
  const base = slugify(input.title) || 'post';
  let slug = base;
  let n = 2;
  while (await getPostBySlug(slug)) { slug = `${base}-${n++}`; }
  const publishDate = input.publishDate || new Date().toISOString();
  await query(
    `INSERT INTO blog_posts (slug, title, description, body_markdown, tags, faqs, charts, author, image, source_url, source_label, publish_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      slug, input.title, input.description, input.bodyMarkdown,
      JSON.stringify(input.tags), JSON.stringify(input.faqs), JSON.stringify(input.charts || []),
      input.author || 'AI Page Audit Team', input.image || null, input.sourceUrl || null, input.sourceLabel || null, publishDate,
    ],
  );
  return (await getPostBySlug(slug))!;
}

export async function listGenRuns(limit = 30): Promise<{ id: number; status: string; detail: string | null; postSlug: string | null; createdAt: string }[]> {
  const { rows } = await query('SELECT * FROM blog_gen_runs ORDER BY created_at DESC LIMIT $1', [limit]);
  return (rows as any[]).map((r) => ({ id: r.id, status: r.status, detail: r.detail, postSlug: r.post_slug, createdAt: r.created_at }));
}

export async function logGenRun(status: string, detail?: string, postSlug?: string): Promise<void> {
  await query('INSERT INTO blog_gen_runs (status, detail, post_slug) VALUES ($1,$2,$3)', [status, detail || null, postSlug || null]);
}
