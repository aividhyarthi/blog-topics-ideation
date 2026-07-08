import type { APIRoute } from 'astro';
import { analyzeHtml, crawlabilitySignals, buildVisibility, PAGE_TYPE_LABEL } from '../../lib/aeo';
import { accessGroups, renderInfo } from '../../lib/access';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// User agents we fetch the page as. Googlebot desktop/smartphone (mobile-first
// indexing) + real devices + GPTBot (the LLM crawler, which some sites block).
const UA = {
  gbot_d: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/124.0.0.0 Safari/537.36',
  gbot_m: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  chrome_d: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  chrome_m: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)',
};

interface Fetched { ok: boolean; status: number; body: string; redirected?: boolean; finalUrl?: string }
async function fetchAs(url: string, ua: string, timeoutMs: number): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    return { ok: res.ok, status: res.status, body: await res.text(), redirected: (res as any).redirected, finalUrl: res.url };
  } catch { return { ok: false, status: 0, body: '' }; }
  finally { clearTimeout(timer); }
}

// Cheap word count for the device fetches (we don't need a full analysis there).
const wc = (html: string): number => {
  const t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.split(' ').length : 0;
};
const rowNote = (f: Fetched, words: number): string =>
  f.ok ? `HTTP ${f.status} · ${words} words served` : `HTTP ${f.status || 'no response'} — blocked or unreachable`;

export const POST: APIRoute = async ({ request }) => {
  let body: { url?: string; html?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const inputUrl = (body.url || '').trim();
  const pasted = (body.html || '').trim();

  // ---- Pasted HTML: single-view audit (no live UA/robots context) ----
  if (!inputUrl && pasted) {
    const html = /<\w+[\s>]/.test(pasted) ? pasted : `<article><p>${pasted.replace(/</g, '&lt;')}</p></article>`;
    const facts = analyzeHtml(html, { isUrl: false });
    const crawl = crawlabilitySignals({ isUrl: false });
    const vis = buildVisibility(facts, crawl);
    const view = { render: renderInfo(html, facts), verdict: vis.verdict, access: [], groups: accessGroups(html, facts) };
    return json({ mode: 'pasted', url: null, host: null, pageType: facts.pageType, pageTypeLabel: PAGE_TYPE_LABEL[facts.pageType], overall: vis.verdict, viewers: vis.viewers, desktop: view, mobile: view, bots: [], llmCrawler: null, parity: null, llmsTxt: null });
  }

  if (!inputUrl) return json({ error: 'Enter a URL (or paste the page HTML).' }, 400);
  if (!/^https?:\/\//i.test(inputUrl)) return json({ error: 'URL must start with http:// or https://' }, 400);
  let host = '';
  try { host = new URL(inputUrl).host; } catch { return json({ error: 'Could not parse that URL.' }, 400); }
  const origin = (() => { try { return new URL(inputUrl).origin; } catch { return ''; } })();

  // Fetch the page as every agent + robots/llms, in parallel.
  const [gd, gm, cd, cm, gp, robots, llms] = await Promise.all([
    fetchAs(inputUrl, UA.gbot_d, 15000),
    fetchAs(inputUrl, UA.gbot_m, 15000),
    fetchAs(inputUrl, UA.chrome_d, 15000),
    fetchAs(inputUrl, UA.chrome_m, 15000),
    fetchAs(inputUrl, UA.gptbot, 15000),
    origin ? fetchAs(`${origin}/robots.txt`, UA.gbot_d, 6000) : Promise.resolve({ ok: false, status: 0, body: '' } as Fetched),
    origin ? fetchAs(`${origin}/llms.txt`, UA.gbot_d, 6000) : Promise.resolve({ ok: false, status: 0, body: '' } as Fetched),
  ]);

  const desktopHtml = gd.ok ? gd.body : (cd.ok ? cd.body : '');
  const mobileHtml = gm.ok ? gm.body : (cm.ok ? cm.body : desktopHtml);
  if (!desktopHtml && !mobileHtml) {
    return json({ error: `Could not read that URL${gd.status ? ` (HTTP ${gd.status})` : ''}. The site may be blocking bots — try pasting the HTML instead.` }, 502);
  }

  const robotsTxt = robots.ok ? robots.body : null;
  const llmsTxt = llms.ok && /\S/.test(llms.body) && !/<html/i.test(llms.body.slice(0, 400)) ? llms.body : null;

  const factsD = analyzeHtml(desktopHtml || mobileHtml, { isUrl: true, host, robotsTxt });
  const factsM = analyzeHtml(mobileHtml || desktopHtml, { isUrl: true, host, robotsTxt });
  const crawl = crawlabilitySignals({ isUrl: true, robotsTxt, llmsTxt });
  const visD = buildVisibility(factsD, crawl);
  const visM = buildVisibility(factsM, crawl);

  const desktop = {
    render: renderInfo(desktopHtml || mobileHtml, factsD), verdict: visD.verdict,
    access: [
      { who: 'Googlebot Desktop', kind: 'bot', status: gd.ok ? 'ok' : 'blocked', note: rowNote(gd, factsD.wordCount) },
      { who: 'Chrome (Desktop device)', kind: 'device', status: cd.ok ? 'ok' : 'blocked', note: rowNote(cd, wc(cd.body)) },
    ],
    groups: accessGroups(desktopHtml || mobileHtml, factsD),
  };
  const mobile = {
    render: renderInfo(mobileHtml || desktopHtml, factsM), verdict: visM.verdict,
    access: [
      { who: 'Googlebot Smartphone', kind: 'bot', status: gm.ok ? 'ok' : 'blocked', note: rowNote(gm, factsM.wordCount) },
      { who: 'Safari (iPhone device)', kind: 'device', status: cm.ok ? 'ok' : 'blocked', note: rowNote(cm, wc(cm.body)) },
    ],
    groups: accessGroups(mobileHtml || desktopHtml, factsM),
  };

  // Content parity: does mobile get materially less than desktop?
  const dW = factsD.wordCount, mW = factsM.wordCount;
  const ratio = dW > 0 ? mW / dW : 1;
  const parity = {
    same: dW === 0 || (ratio >= 0.75 && ratio <= 1.33),
    note: dW === 0 ? 'Could not compare.' : (ratio < 0.75
      ? `Mobile is served ~${Math.round((1 - ratio) * 100)}% less content than desktop (${mW} vs ${dW} words). With mobile-first indexing, Google ranks the mobile version — so this content gap hurts.`
      : ratio > 1.33
        ? `Mobile is served more content than desktop (${mW} vs ${dW} words).`
        : `Mobile and desktop are served the same content (${mW} vs ${dW} words).`),
  };

  // Overall = the worse of desktop/mobile (mobile-first framing).
  const rank = { no: 0, partial: 1, yes: 2 } as Record<string, number>;
  const overall = rank[visM.verdict.level] <= rank[visD.verdict.level] ? visM.verdict : visD.verdict;

  const bots = crawl.filter((s) => s.id.startsWith('bot_')).map((s) => ({
    label: s.label.replace(' crawler access', ''),
    status: s.score === 0 ? 'blocked' : s.score >= 100 ? 'allowed' : s.score >= 70 ? 'default' : 'partial',
    detail: s.detail,
  }));
  const llmsTxtSignal = crawl.find((s) => s.id === 'llms_txt');

  const llmCrawler = {
    status: gp.ok ? 'ok' : 'blocked',
    note: gp.ok ? `GPTBot was served ${wc(gp.body)} words (HTTP ${gp.status}).` : `GPTBot got HTTP ${gp.status || 'no response'} — this site may be blocking the ChatGPT crawler.`,
  };

  let fetchNote: string | undefined;
  if (factsM.wordCount < 120 && factsD.wordCount < 120) fetchNote = 'Both fetches returned very little text — the page is likely JavaScript-rendered (content loads client-side).';

  return json({
    mode: 'url', url: inputUrl, host,
    pageType: factsM.pageType, pageTypeLabel: PAGE_TYPE_LABEL[factsM.pageType],
    overall, viewers: visM.viewers, parity, bots, llmCrawler,
    llmsTxt: (llmsTxtSignal?.score ?? 0) >= 100,
    desktop, mobile, fetchNote,
  });
};
