import type { APIRoute } from 'astro';
import { analyzeHtml, crawlabilitySignals, buildVisibility, PAGE_TYPE_LABEL } from '../../lib/aeo';
import { accessGroups, renderInfo } from '../../lib/access';
import { extractContent } from '../../lib/extract';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// User agents we fetch the page as. Googlebot desktop/smartphone (mobile-first
// indexing) + real devices + GPTBot (the LLM crawler, which some sites block).
const UA = {
  gbot_d: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/124.0.0.0 Safari/537.36',
  gbot_m: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  chrome_d: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  chrome_m: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)',
  oai_search: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  perplexity: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  claude: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +http://www.anthropic.com/claude-bot)',
  bing: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
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
    const pastedContent = extractContent(html);
    const pastedGaps: { label: string; detail: string }[] = [];
    const seenP = new Set<string>();
    for (const g of view.groups) for (const it of g.items) if (it.status === 'missed' && !seenP.has(it.label)) { seenP.add(it.label); pastedGaps.push({ label: it.label, detail: it.detail }); }
    if (!pastedContent.faqs.length) pastedGaps.push({ label: 'FAQ content', detail: 'No FAQ schema/content found — AI Overviews and ChatGPT favour Q&A-structured pages.' });
    return json({ mode: 'pasted', url: null, host: null, pageType: facts.pageType, pageTypeLabel: PAGE_TYPE_LABEL[facts.pageType], overall: vis.verdict, viewers: vis.viewers, content: pastedContent, gaps: pastedGaps, desktop: view, mobile: view, chatgpt: view, bots: [], llmCrawler: null, parity: null, llmsTxt: null });
  }

  if (!inputUrl) return json({ error: 'Enter a URL (or paste the page HTML).' }, 400);
  if (!/^https?:\/\//i.test(inputUrl)) return json({ error: 'URL must start with http:// or https://' }, 400);
  let host = '';
  try { host = new URL(inputUrl).host; } catch { return json({ error: 'Could not parse that URL.' }, 400); }
  const origin = (() => { try { return new URL(inputUrl).origin; } catch { return ''; } })();

  // Fetch as every agent — but NOT all at once. Hitting a host with 11 parallel
  // requests can trip its rate-limiter and produce false "no response" results
  // that look like blocks but are self-inflicted. So we wave it: core viewport
  // fetches first, then the AI bots at low concurrency.
  const [gd, gm, cd, cm, robots, llms] = await Promise.all([
    fetchAs(inputUrl, UA.gbot_d, 15000),
    fetchAs(inputUrl, UA.gbot_m, 15000),
    fetchAs(inputUrl, UA.chrome_d, 15000),
    fetchAs(inputUrl, UA.chrome_m, 15000),
    origin ? fetchAs(`${origin}/robots.txt`, UA.gbot_d, 6000) : Promise.resolve({ ok: false, status: 0, body: '' } as Fetched),
    origin ? fetchAs(`${origin}/llms.txt`, UA.gbot_d, 6000) : Promise.resolve({ ok: false, status: 0, body: '' } as Fetched),
  ]);
  // AI-bot wave: max 3 in flight.
  const aiTasks = [UA.gptbot, UA.perplexity, UA.claude, UA.bing, UA.oai_search].map((ua) => () => fetchAs(inputUrl, ua, 15000));
  const aiRes: Fetched[] = new Array(aiTasks.length);
  let ti = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (true) { const i = ti++; if (i >= aiTasks.length) break; aiRes[i] = await aiTasks[i](); }
  }));
  const [gp, pplx, claude, bing, oai] = aiRes;

  const desktopHtml = gd.ok ? gd.body : (cd.ok ? cd.body : '');
  const mobileHtml = gm.ok ? gm.body : (cm.ok ? cm.body : desktopHtml);
  if (!desktopHtml && !mobileHtml) {
    return json({ error: `Could not read that URL${gd.status ? ` (HTTP ${gd.status})` : ''}. The site may be blocking bots — try pasting the HTML instead.` }, 502);
  }

  // GPTBot can flake on a single try (timeout / edge rate-limit). Retry once on a
  // no-response (status 0) so we don't wrongly declare "blocked" from a timeout.
  let gpb = gp;
  if (!gpb.ok && gpb.status === 0) gpb = await fetchAs(inputUrl, UA.gptbot, 15000);

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

  // Reconcile the LIVE GPTBot result with robots.txt + content-in-HTML so the
  // panels tell one coherent story instead of contradicting each other.
  const robotsAllowsGpt = !bots.some((b) => /openai|chatgpt/i.test(b.label) && b.status === 'blocked');
  const gptExplicitBlock = gpb.status >= 400;        // 403/401/429 = the server said no
  const gptNoResponse = !gpb.ok && gpb.status === 0; // timeout / connection dropped
  const gptMsg = gpb.ok
    ? `GPTBot was served ${wc(gpb.body)} words (HTTP ${gpb.status}) — the ChatGPT crawler can read this page.`
    : gptExplicitBlock
      ? `GPTBot was blocked (HTTP ${gpb.status})${robotsAllowsGpt ? ' — even though robots.txt allows it, so the block is at your server/CDN (WAF), not robots. Many WAFs block the OpenAI user-agent by default.' : ' — consistent with your robots.txt disallowing it.'}`
      : `The live GPTBot request got no response (timed out or the connection was dropped, twice). ${robotsAllowsGpt ? 'robots.txt allows it and the content is in your HTML, so if this persists it’s likely an edge/CDN block on the OpenAI user-agent — not a robots issue.' : ''} Re-run to rule out a slow response.`;

  const llmCrawler = { status: gpb.ok ? 'ok' : 'blocked', note: gptMsg };

  // If the live fetch failed but robots allows + content is in HTML, downgrade the
  // "LLM crawlers" viewer from a flat "can read it" to an honest, reconciled note.
  if (!gpb.ok && robotsAllowsGpt) {
    const lv = visM.viewers.find((v) => /LLM crawlers/i.test(v.who));
    if (lv) {
      lv.access = gptExplicitBlock ? 'blocked' : 'partial';
      lv.sees = gptExplicitBlock
        ? `Blocked in practice — the live GPTBot request returned HTTP ${gpb.status}. Your robots.txt allows it, so the block is at your server/CDN, not robots.`
        : `In principle yes — the content is in your HTML and robots.txt allows AI bots — but the live GPTBot fetch got no response (a likely CDN/WAF block on the OpenAI user-agent, or a timeout). Worth confirming.`;
    }
  }

  // ChatGPT (GPTBot) view — exactly what OpenAI's crawler received (raw HTML, no JS).
  let chatgpt: any;
  if (gpb.ok) {
    const factsG = analyzeHtml(gpb.body, { isUrl: true, host, robotsTxt });
    chatgpt = {
      render: renderInfo(gpb.body, factsG), verdict: buildVisibility(factsG, crawl).verdict,
      access: [{ who: 'GPTBot (ChatGPT crawler)', kind: 'bot', status: 'ok', note: rowNote(gpb, factsG.wordCount) }],
      groups: accessGroups(gpb.body, factsG),
    };
  } else {
    chatgpt = { blocked: true, note: gptMsg };
  }

  // ---- Live AI-crawler access matrix ----
  const sigAllows = (id: string) => { const s = crawl.find((x) => x.id === id); return !s || s.score !== 0; };
  const robotsDisallowsAll = (uaToken: string) => Boolean(robotsTxt) && new RegExp(`user-agent:\\s*${uaToken}[\\s\\S]*?disallow:\\s*/\\s*(?:\\n|$)`, 'i').test(robotsTxt as string);
  const classifyBot = (label: string, engine: string, f: Fetched, robotsAllowed: boolean) => {
    const status = f.ok ? 'ok' : (f.status >= 400 ? 'blocked' : 'noresponse');
    const words = f.ok ? wc(f.body) : 0;
    const note = status === 'ok'
      ? `Served ${words} words (HTTP ${f.status}) — this crawler can read the page.`
      : status === 'blocked'
        ? `Blocked (HTTP ${f.status})${robotsAllowed ? ' at the server/CDN — robots.txt allows it, so this is a WAF/edge block on the user-agent.' : ' — matches your robots.txt disallow.'}`
        : `No response (timeout or connection dropped).${robotsAllowed ? ' robots.txt allows it, so if it persists it’s likely an edge/CDN block on this user-agent, not robots.' : ''}`;
    return { label, engine, status, words, note };
  };
  const googleExtendedAllowed = !robotsDisallowsAll('google-extended');
  const geBase = gd.ok ? 'ok' : (gd.status >= 400 ? 'blocked' : 'noresponse');
  const googleRow = {
    label: 'Google AI — Gemini · AI Overviews · AI Mode', engine: 'Google AI',
    status: gd.ok ? (googleExtendedAllowed ? 'ok' : 'partial') : geBase,
    words: gd.ok ? wc(gd.body) : 0,
    note: `There is no separate Gemini/AI-Overviews crawler — Google AI reads via Googlebot. Googlebot ${gd.ok ? `served ${wc(gd.body)} words` : (geBase === 'blocked' ? `was blocked (HTTP ${gd.status})` : 'was unreachable')}. Gemini/Vertex grounding & training permission (Google-Extended): ${googleExtendedAllowed ? 'allowed' : 'BLOCKED — you are opted out of Gemini grounding/training'}.`,
  };
  const aiCrawlers = [
    classifyBot('ChatGPT — GPTBot', 'ChatGPT', gpb, sigAllows('bot_openai')),
    classifyBot('ChatGPT Search — OAI-SearchBot', 'ChatGPT Search', oai, sigAllows('bot_openai')),
    classifyBot('Perplexity — PerplexityBot', 'Perplexity', pplx, sigAllows('bot_perplexity')),
    classifyBot('Claude — ClaudeBot', 'Claude', claude, sigAllows('bot_anthropic')),
    classifyBot('Copilot — Bingbot', 'Copilot', bing, !robotsDisallowsAll('bingbot')),
    googleRow,
  ];

  // "Is it us or them?" — if our own fetch is healthy (Googlebot/Chrome got 200)
  // then any bot failures below are the SITE discriminating by user-agent, not a
  // tool error. If nothing came back at all, it's the site/our IP, not the bots.
  const ourFetchOk = gd.ok || gm.ok || cd.ok || cm.ok;
  const anyAiBlocked = aiCrawlers.some((b) => b.status !== 'ok' && b.engine !== 'Google AI');
  const aiDiag = ourFetchOk
    ? (anyAiBlocked
      ? `Our fetch is healthy — Googlebot/Chrome got HTTP 200 (${wc(gd.ok ? gd.body : (cd.ok ? cd.body : mobileHtml))} words). So any “blocked / no response” above is the SITE treating that bot’s user-agent differently — a real block, not a tool error.`
      : `Our fetch is healthy and every AI crawler was served — no blocks detected.`)
    : `We couldn’t reach this site with ANY user-agent (including Googlebot). That points to the site being down, geo-blocking, or blocking our server’s IP — not something specific to the AI bots. Try again, or paste the HTML.`;

  // Content gaps ChatGPT/competitors would exploit — the "missed" items + no-FAQ.
  const content = extractContent(desktopHtml || mobileHtml);
  const gaps: { label: string; detail: string }[] = [];
  const seen = new Set<string>();
  for (const g of desktop.groups) for (const it of g.items) {
    if (it.status === 'missed' && !seen.has(it.label)) { seen.add(it.label); gaps.push({ label: it.label, detail: it.detail }); }
  }
  if (!content.faqs.length && !seen.has('FAQ content')) gaps.push({ label: 'FAQ content', detail: 'No FAQ schema/content found — AI Overviews and ChatGPT favour Q&A-structured pages.' });

  let fetchNote: string | undefined;
  if (factsM.wordCount < 120 && factsD.wordCount < 120) fetchNote = 'Both fetches returned very little text — the page is likely JavaScript-rendered (content loads client-side).';

  return json({
    mode: 'url', url: inputUrl, host,
    pageType: factsM.pageType, pageTypeLabel: PAGE_TYPE_LABEL[factsM.pageType],
    content, gaps,
    overall, viewers: visM.viewers, parity, bots, llmCrawler, aiCrawlers, aiDiag,
    llmsTxt: (llmsTxtSignal?.score ?? 0) >= 100,
    desktop, mobile, chatgpt, fetchNote,
  });
};
