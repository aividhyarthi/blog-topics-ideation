// Topic sourcing for the auto-publish pipeline: r/AEO on Reddit, plus a
// small set of official AI-provider news/blog feeds. Every fetch here talks
// to a real external host, so it only actually works once this runs on
// Railway (or any host with normal internet egress) — it cannot be tested
// from a sandboxed dev environment with restricted egress.
//
// Every source is wrapped in its own try/catch. A dead feed URL, a Reddit
// rate-limit, a parse failure — any of these just yields fewer candidates
// for this cycle, never a crash. blogPipeline.ts already skips the cycle
// outright if there are zero usable candidates, per the "skip rather than
// force a low-quality post" choice made for this pipeline.
export interface TopicCandidate {
  title: string;
  summary: string;
  url: string;
  label: string; // shown as "Source: ..." on the published post
  publishedAt: string; // ISO, best-effort
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// Reddit requires a descriptive User-Agent or it 429s/blocks generic clients.
const REDDIT_UA = 'AIPageAuditBlogBot/1.0 (+https://www.aipageaudit.com; contact: support@aipageaudit.com)';

export async function fetchRedditTopics(limit = 15): Promise<TopicCandidate[]> {
  const { signal, done } = withTimeout(10000);
  try {
    const res = await fetch(`https://www.reddit.com/r/aeo/new.json?limit=${limit}`, {
      headers: { 'User-Agent': REDDIT_UA },
      signal,
    });
    if (!res.ok) {
      console.error(`blogSources: reddit fetch failed with HTTP ${res.status}`);
      return [];
    }
    const data: any = await res.json();
    const children: any[] = data?.data?.children || [];
    return children
      .map((c) => c.data)
      .filter((d) => d && d.title && !d.stickied)
      .map((d): TopicCandidate => ({
        title: d.title,
        summary: (d.selftext || '').slice(0, 1500),
        url: `https://www.reddit.com${d.permalink}`,
        label: `Reddit discussion: r/AEO`,
        publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString(),
      }));
  } catch (err: any) {
    console.error('blogSources: reddit fetch error', err?.message || err);
    return [];
  } finally {
    done();
  }
}

// Best-effort official feed list. Verify these against the real URLs before
// relying on this in production — provider blogs change RSS paths without
// notice, and this was written without live internet access to check them.
// Override/replace via the BLOG_SOURCE_FEEDS env var (comma-separated URLs)
// without needing a code change or redeploy.
const DEFAULT_FEEDS = [
  'https://openai.com/news/rss.xml',
  'https://blog.google/technology/ai/rss/',
  'https://www.anthropic.com/rss.xml',
];

function feedList(): { url: string; label: string }[] {
  const env = (process.env.BLOG_SOURCE_FEEDS || (import.meta as any).env?.BLOG_SOURCE_FEEDS || '').trim();
  const urls = env ? env.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_FEEDS;
  return urls.map((url) => ({ url, label: `Official update: ${new URL(url).hostname.replace(/^www\./, '')}` }));
}

function textBetween(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1]
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFeedItems(xml: string, label: string, limit: number): TopicCandidate[] {
  // Handles both RSS <item> and Atom <entry> without a real XML parser —
  // good enough for "grab title/link/summary/date", not a general feed reader.
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, limit).map((block): TopicCandidate => {
    const title = textBetween(block, 'title');
    let url = textBetween(block, 'link');
    if (!url) {
      const hrefMatch = block.match(/<link[^>]*href="([^"]+)"/i);
      url = hrefMatch ? hrefMatch[1] : '';
    }
    const summary = textBetween(block, 'description') || textBetween(block, 'summary') || textBetween(block, 'content');
    const dateRaw = textBetween(block, 'pubDate') || textBetween(block, 'updated') || textBetween(block, 'published');
    const publishedAt = dateRaw && !isNaN(Date.parse(dateRaw)) ? new Date(dateRaw).toISOString() : new Date().toISOString();
    return { title, summary: summary.slice(0, 1500), url, label, publishedAt };
  }).filter((c) => c.title && c.url);
}

export async function fetchProviderNews(limitPerFeed = 8): Promise<TopicCandidate[]> {
  const feeds = feedList();
  const results = await Promise.all(
    feeds.map(async ({ url, label }) => {
      const { signal, done } = withTimeout(10000);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'AIPageAuditBlogBot/1.0' }, signal });
        if (!res.ok) {
          console.error(`blogSources: feed ${url} failed with HTTP ${res.status}`);
          return [];
        }
        const xml = await res.text();
        return parseFeedItems(xml, label, limitPerFeed);
      } catch (err: any) {
        console.error(`blogSources: feed ${url} error`, err?.message || err);
        return [];
      } finally {
        done();
      }
    }),
  );
  return results.flat();
}

/** All candidates from every source, newest first. Dedup against already-used source URLs happens in blogPipeline.ts, since that needs a DB read. */
export async function fetchAllTopicCandidates(): Promise<TopicCandidate[]> {
  const [reddit, news] = await Promise.all([fetchRedditTopics(), fetchProviderNews()]);
  return [...reddit, ...news].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}
