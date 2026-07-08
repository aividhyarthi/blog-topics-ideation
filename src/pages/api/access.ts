import type { APIRoute } from 'astro';
import { analyzeHtml, crawlabilitySignals, buildVisibility } from '../../lib/aeo';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

async function fetchText(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal, redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch { return { ok: false, status: 0, body: '' }; }
  finally { clearTimeout(timer); }
}

// Simple, deterministic "Can LLMs access this page?" check. No AI key needed.
// Fetches the raw HTML (exactly what LLM crawlers get), decides whether the
// content is in the HTML or injected by JS, and reports bot access.
export const POST: APIRoute = async ({ request }) => {
  let body: { url?: string; html?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const inputUrl = (body.url || '').trim();
  const pasted = (body.html || '').trim();
  let html = '', host = '', isUrl = false, robotsTxt: string | null = null, llmsTxt: string | null = null, fetchNote: string | undefined;

  if (inputUrl) {
    if (!/^https?:\/\//i.test(inputUrl)) return json({ error: 'URL must start with http:// or https://' }, 400);
    isUrl = true;
    try { host = new URL(inputUrl).host; } catch { return json({ error: 'Could not parse that URL.' }, 400); }
    const page = await fetchText(inputUrl, 15000);
    if (!page.ok || page.body.length < 50) {
      return json({ error: `Could not read that URL${page.status ? ` (HTTP ${page.status})` : ''}. The site may be blocking bots — try pasting the HTML instead.` }, 502);
    }
    html = page.body;
    const origin = (() => { try { return new URL(inputUrl).origin; } catch { return ''; } })();
    if (origin) {
      const [robots, llms] = await Promise.all([
        fetchText(`${origin}/robots.txt`, 6000),
        fetchText(`${origin}/llms.txt`, 6000),
      ]);
      robotsTxt = robots.ok ? robots.body : null;
      llmsTxt = llms.ok && /\S/.test(llms.body) && !/<html/i.test(llms.body.slice(0, 400)) ? llms.body : null;
    }
  } else if (pasted) {
    html = /<\w+[\s>]/.test(pasted) ? pasted : `<article><p>${pasted.replace(/</g, '&lt;')}</p></article>`;
    // Pasted HTML has no live site context, so bot/robots checks don't apply;
    // treat it as a rendering check only.
    isUrl = false;
  } else {
    return json({ error: 'Enter a URL (or paste the page HTML).' }, 400);
  }

  const facts = analyzeHtml(html, { isUrl, host, robotsTxt });
  const crawl = crawlabilitySignals({ isUrl, robotsTxt, llmsTxt });
  const visibility = buildVisibility(facts, crawl);

  if (isUrl && facts.wordCount < 120 && !fetchNote) {
    fetchNote = 'This URL returned almost no readable text — it looks JavaScript-rendered.';
  }

  const bots = crawl.filter((s) => s.id.startsWith('bot_')).map((s) => ({
    label: s.label.replace(' crawler access', ''),
    status: s.score === 0 ? 'blocked' : s.score >= 100 ? 'allowed' : s.score >= 70 ? 'default' : 'partial',
    detail: s.detail,
  }));
  const llmsTxtSignal = crawl.find((s) => s.id === 'llms_txt');

  return json({
    url: inputUrl || null,
    host: host || null,
    mode: isUrl ? 'url' : 'pasted',
    render: {
      type: facts.jsDependent ? 'js' : 'html',
      framework: facts.framework,
      staticWords: facts.wordCount,
      textRatioPct: facts.textRatioPct,
    },
    verdict: visibility.verdict,
    viewers: visibility.viewers,
    elements: visibility.elements,
    bots: isUrl ? bots : [],
    llmsTxt: isUrl ? (llmsTxtSignal?.score ?? 0) >= 100 : null,
    fetchNote,
  });
};
