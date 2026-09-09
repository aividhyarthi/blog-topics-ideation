import type { APIRoute } from 'astro';
import { getUser } from '../../lib/auth';
import { rateLimit } from '../../lib/ratelimit';
import { UA } from '../../lib/useragents';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// A quick "is it still live" reachability check for the home page's preflight
// panel — deliberately NOT a billable check (no consumeAccess call): it's a
// plain GET, not a crawler-visibility analysis.
export const POST: APIRoute = async (ctx) => {
  const user = await getUser(ctx);
  if (!user) return json({ error: 'Sign in required.' }, 401);
  const rl = rateLimit(`ping:${user.id}`, 20, 300);
  if (!rl.ok) return json({ error: 'Too many checks — try again shortly.' }, 429);

  let body: { url?: string };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const url = (body.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return json({ error: 'Invalid URL.' }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': UA.desktop } });
    return json({ live: res.status < 500, status: res.status });
  } catch {
    return json({ live: false, status: 0 });
  } finally {
    clearTimeout(timer);
  }
};
