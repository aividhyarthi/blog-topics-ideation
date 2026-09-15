import type { APIRoute } from 'astro';
import { analyzeHtml, crawlabilitySignals, buildVisibility } from '../../lib/aeo';
import { accessGroups, renderInfo } from '../../lib/access';
import { getUser } from '../../lib/auth';
import { dbEnabled } from '../../lib/db';
import { cached } from '../../lib/fetchcache';
import { UA } from '../../lib/useragents';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Each runnable crawler → its UA + the robots signal id used for reconciliation.
const BOT: Record<string, { ua: string; label: string; engine: string; sig: string | null; google?: boolean }> = {
  gptbot: { ua: UA.gptbot, label: 'ChatGPT — GPTBot', engine: 'ChatGPT', sig: 'bot_openai' },
  oai: { ua: UA.oaiSearchBot, label: 'ChatGPT Search — OAI-SearchBot', engine: 'ChatGPT Search', sig: 'bot_openai' },
  perplexity: { ua: UA.perplexityBot, label: 'Perplexity — PerplexityBot', engine: 'Perplexity', sig: 'bot_perplexity' },
  claude: { ua: UA.claudeBot, label: 'Claude — ClaudeBot', engine: 'Claude', sig: 'bot_anthropic' },
  bing: { ua: UA.bingbot, label: 'Copilot — Bingbot', engine: 'Copilot', sig: null },
  googlebot: { ua: UA.googlebotDesktop, label: 'Google AI — Gemini · AI Overviews · AI Mode', engine: 'Google AI', sig: 'bot_google', google: true },
};

interface Fetched { ok: boolean; status: number; body: string }
async function fetchAs(url: string, ua: string, timeoutMs: number): Promise<Fetched> {
  // Cached across tools/tabs — see fetchcache.ts.
  return cached(`${ua}::${url}`, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' } });
      return { ok: res.ok, status: res.status, body: await res.text() };
    } catch { return { ok: false, status: 0, body: '' }; }
    finally { clearTimeout(timer); }
  }, (v) => v.ok);
}
const wc = (html: string): number => { const t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return t ? t.split(' ').length : 0; };

// Real crawlers are verified by bot-management vendors (Cloudflare, Akamai,
// Imperva/Incapsula, DataDome…) by checking the REQUEST'S SOURCE IP against
// the crawler's published IP ranges, not just the User-Agent string. Our
// probe sends the right UA but fetches from this server's own IP, which is
// not OpenAI's / Perplexity's / Anthropic's real range — so a site using
// IP-verified bot management can 403 or challenge OUR request even though
// the genuine crawler, hitting from its real IP, would sail through. This
// fingerprints the common vendor challenge/block pages so that case gets
// reported as inconclusive rather than as a confirmed block.
const CHALLENGE_RE = /Just a moment\.\.\.|Checking your browser before accessing|cf-browser-verification|cf_chl_|Attention Required! \| Cloudflare|Please verify you are a human|Pardon Our Interruption|used by our security service|Access denied\b.{0,80}\bCloudflare|reference #[\d.]+ (?:error|for this request)/i;
function isBotChallenge(body: string): boolean {
  return CHALLENGE_RE.test(body.slice(0, 4000));
}

// Run ONE crawler against the URL (on-demand, so the client can space them out).
// Login required (no separate charge — this is a bonus deep-dive within a
// page the account already ran the main check on).
export const POST: APIRoute = async (ctx) => {
  const { request } = ctx;
  if (!dbEnabled) {
    return json({ error: 'Accounts are temporarily unavailable. Please try again shortly.', serviceDown: true }, 503);
  }
  if (!(await getUser(ctx))) {
    return json({ error: 'Sign in to run per-crawler checks.', requireAuth: true }, 401);
  }
  let body: { url?: string; bot?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const url = (body.url || '').trim();
  const cfg = BOT[body.bot || ''];
  if (!cfg) return json({ error: 'Unknown bot.' }, 400);
  if (!/^https?:\/\//i.test(url)) return json({ error: 'A valid URL is required.' }, 400);
  let host = ''; try { host = new URL(url).host; } catch { return json({ error: 'Could not parse URL.' }, 400); }
  const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();

  const robotsRes = origin ? await fetchAs(`${origin}/robots.txt`, UA.googlebotDesktop, 6000) : { ok: false, status: 0, body: '' };
  const robotsTxt = robotsRes.ok ? robotsRes.body : null;

  let f = await fetchAs(url, cfg.ua, 15000);
  if (!f.ok && f.status === 0) f = await fetchAs(url, cfg.ua, 15000); // retry once on no-response

  const crawl = crawlabilitySignals({ isUrl: true, robotsTxt, llmsTxt: null });
  const robotsAllowed = cfg.sig ? ((crawl.find((s) => s.id === cfg.sig)?.score ?? 100) !== 0) : true;
  const googleExtended = !robotsTxt || !/user-agent:\s*google-extended[\s\S]*?disallow:\s*\/\s*(?:\n|$)/i.test(robotsTxt);

  const status = f.ok ? 'ok' : (f.status >= 400 ? 'blocked' : 'noresponse');
  const words = f.ok ? wc(f.body) : 0;
  const challenged = !f.ok && isBotChallenge(f.body);
  const ipCaveat = ' Bot-management services (Cloudflare, Akamai, Imperva…) usually verify a crawler by its real source IP, not just this header — our check can send the right user-agent but not the real GPTBot/PerplexityBot/ClaudeBot IP, so this may be a false block that the genuine crawler never hits. Treat it as inconclusive rather than a confirmed block, and check your bot-management vendor’s dashboard for the real crawler’s traffic if you can.';

  let note: string;
  if (cfg.google) {
    note = `There is no separate Gemini/AI-Overviews crawler — Google AI reads via Googlebot. Googlebot ${f.ok ? `served ${words} words` : (status === 'blocked' ? `was blocked (HTTP ${f.status})` : 'was unreachable')}. Gemini/Vertex grounding & training (Google-Extended): ${googleExtended ? 'allowed' : 'BLOCKED — you are opted out of Gemini grounding/training'}.`;
  } else if (status === 'ok') {
    note = `Served ${words} words (HTTP ${f.status}) — this crawler can read the page.`;
  } else if (status === 'blocked') {
    if (!robotsAllowed) {
      note = `Blocked (HTTP ${f.status}) — matches your robots.txt disallow.`;
    } else if (challenged) {
      note = `Hit an automated bot-verification wall (HTTP ${f.status}), not a plain block — robots.txt allows this crawler.${ipCaveat}`;
    } else {
      note = `Blocked (HTTP ${f.status}) at the server/CDN — robots.txt allows it, so this is a WAF/edge rule on the user-agent.${ipCaveat}`;
    }
  } else {
    note = `No response (timeout or connection dropped, twice).${robotsAllowed ? ` robots.txt allows it, so if it persists it’s likely an edge/CDN block on this user-agent, not robots.${ipCaveat}` : ''}`;
  }

  const out: any = { bot: body.bot, label: cfg.label, engine: cfg.engine, status: cfg.google && f.ok && !googleExtended ? 'partial' : status, httpStatus: f.status, words, note, inconclusive: challenged };
  if (f.ok) {
    const facts = analyzeHtml(f.body, { isUrl: true, host, robotsTxt });
    out.render = renderInfo(f.body, facts);
    out.verdict = buildVisibility(f.body, facts, crawl).verdict;
    out.groups = accessGroups(f.body, facts);
  }
  return json(out);
};
