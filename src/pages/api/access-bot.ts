import type { APIRoute } from 'astro';
import { analyzeHtml, crawlabilitySignals, buildVisibility } from '../../lib/aeo';
import { accessGroups, renderInfo } from '../../lib/access';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const UA = {
  gbot_d: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/124.0.0.0 Safari/537.36',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)',
  oai: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  perplexity: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  claude: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +http://www.anthropic.com/claude-bot)',
  bing: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
};
// Each runnable crawler → its UA + the robots signal id used for reconciliation.
const BOT: Record<string, { ua: string; label: string; engine: string; sig: string | null; google?: boolean }> = {
  gptbot: { ua: UA.gptbot, label: 'ChatGPT — GPTBot', engine: 'ChatGPT', sig: 'bot_openai' },
  oai: { ua: UA.oai, label: 'ChatGPT Search — OAI-SearchBot', engine: 'ChatGPT Search', sig: 'bot_openai' },
  perplexity: { ua: UA.perplexity, label: 'Perplexity — PerplexityBot', engine: 'Perplexity', sig: 'bot_perplexity' },
  claude: { ua: UA.claude, label: 'Claude — ClaudeBot', engine: 'Claude', sig: 'bot_anthropic' },
  bing: { ua: UA.bing, label: 'Copilot — Bingbot', engine: 'Copilot', sig: null },
  googlebot: { ua: UA.gbot_d, label: 'Google AI — Gemini · AI Overviews · AI Mode', engine: 'Google AI', sig: 'bot_google', google: true },
};

interface Fetched { ok: boolean; status: number; body: string }
async function fetchAs(url: string, ua: string, timeoutMs: number): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch { return { ok: false, status: 0, body: '' }; }
  finally { clearTimeout(timer); }
}
const wc = (html: string): number => { const t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return t ? t.split(' ').length : 0; };

// Run ONE crawler against the URL (on-demand, so the client can space them out).
export const POST: APIRoute = async ({ request }) => {
  let body: { url?: string; bot?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const url = (body.url || '').trim();
  const cfg = BOT[body.bot || ''];
  if (!cfg) return json({ error: 'Unknown bot.' }, 400);
  if (!/^https?:\/\//i.test(url)) return json({ error: 'A valid URL is required.' }, 400);
  let host = ''; try { host = new URL(url).host; } catch { return json({ error: 'Could not parse URL.' }, 400); }
  const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();

  const robotsRes = origin ? await fetchAs(`${origin}/robots.txt`, UA.gbot_d, 6000) : { ok: false, status: 0, body: '' };
  const robotsTxt = robotsRes.ok ? robotsRes.body : null;

  let f = await fetchAs(url, cfg.ua, 15000);
  if (!f.ok && f.status === 0) f = await fetchAs(url, cfg.ua, 15000); // retry once on no-response

  const crawl = crawlabilitySignals({ isUrl: true, robotsTxt, llmsTxt: null });
  const robotsAllowed = cfg.sig ? ((crawl.find((s) => s.id === cfg.sig)?.score ?? 100) !== 0) : true;
  const googleExtended = !robotsTxt || !/user-agent:\s*google-extended[\s\S]*?disallow:\s*\/\s*(?:\n|$)/i.test(robotsTxt);

  const status = f.ok ? 'ok' : (f.status >= 400 ? 'blocked' : 'noresponse');
  const words = f.ok ? wc(f.body) : 0;

  let note: string;
  if (cfg.google) {
    note = `There is no separate Gemini/AI-Overviews crawler — Google AI reads via Googlebot. Googlebot ${f.ok ? `served ${words} words` : (status === 'blocked' ? `was blocked (HTTP ${f.status})` : 'was unreachable')}. Gemini/Vertex grounding & training (Google-Extended): ${googleExtended ? 'allowed' : 'BLOCKED — you are opted out of Gemini grounding/training'}.`;
  } else if (status === 'ok') {
    note = `Served ${words} words (HTTP ${f.status}) — this crawler can read the page.`;
  } else if (status === 'blocked') {
    note = `Blocked (HTTP ${f.status})${robotsAllowed ? ' at the server/CDN — robots.txt allows it, so this is a WAF/edge block on the user-agent.' : ' — matches your robots.txt disallow.'}`;
  } else {
    note = `No response (timeout or connection dropped, twice).${robotsAllowed ? ' robots.txt allows it, so if it persists it’s likely an edge/CDN block on this user-agent, not robots.' : ''}`;
  }

  const out: any = { bot: body.bot, label: cfg.label, engine: cfg.engine, status: cfg.google && f.ok && !googleExtended ? 'partial' : status, httpStatus: f.status, words, note };
  if (f.ok) {
    const facts = analyzeHtml(f.body, { isUrl: true, host, robotsTxt });
    out.render = renderInfo(f.body, facts);
    out.verdict = buildVisibility(facts, crawl).verdict;
    out.groups = accessGroups(f.body, facts);
  }
  return json(out);
};
