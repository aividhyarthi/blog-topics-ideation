// Two deployment modes, one repo:
//
// INTERNAL MODE (default, PRODUCT_MODE unset) — unchanged behavior: the whole
// site (Nykaa reporting tools + the single-tenant rank tracker) sits behind
// HTTP Basic Auth when SITE_PASSWORD is set.
//
// PRODUCT MODE (PRODUCT_MODE=1) — the deployment serves AppRankr, the paid
// app-store toolkit (Rank Tracker + ASO Inspector):
//   - public: landing page (/), /login, /signup, auth APIs
//   - everything else needs a session cookie; the two paid tools (/rank,
//     /aso and their APIs) additionally need an active subscription or a
//     live trial
//   - the internal Nykaa tools (Blog Topic Engine, AEO Auditor, WBR Builder,
//     Snapshot, Live AEO) are not part of the product and 404
import { defineMiddleware } from 'astro:middleware';
import { userFromSessionToken, readCookie, SESSION_COOKIE } from './lib/saas/auth';
import { checkAccess, isAdminEmail } from './lib/saas/plans';
import { checkDataPersistence } from './lib/rank/persistence-check';
import { startNightlyScheduler } from './lib/rank/scheduler';

// Runs once at server boot (module load, not per-request) — loud and early so
// it's impossible to miss in Railway's Deploy Logs. A missing/unmounted
// Volume is the #1 cause of tracked-app data vanishing on every redeploy.
if (process.env.PRODUCT_MODE) {
  const warning = checkDataPersistence();
  if (warning) console.warn(`\n⚠️⚠️⚠️  DATA PERSISTENCE WARNING  ⚠️⚠️⚠️\n${warning}\n`);
}

// /api/cron/* is reachable in both modes without a login/session or the
// Basic Auth password — it's gated entirely on its own CRON_SECRET (checked
// inside the route itself), so a free external URL-ping scheduler can hit it
// directly. See src/pages/api/cron/rank-check.ts.
// /blog is public content marketing — must be reachable (and crawlable by
// search engines) without a login, same as /about.
const PUBLIC_PREFIXES = ['/login', '/signup', '/about', '/blog', '/api/auth/', '/api/cron/', '/_astro/', '/favicon', '/robots', '/sitemap', '/llms', '/ads'];
// Product routes; anything NOT in this list is an internal tool and 404s in product mode.
const PRODUCT_PREFIXES = ['/', '/landing', '/login', '/signup', '/about', '/blog', '/account', '/rank', '/aso', '/admin', '/api/admin', '/api/auth/', '/api/rank', '/api/aso', '/api/aso-variants', '/api/cron/', '/_astro/', '/favicon', '/robots', '/sitemap', '/llms', '/ads'];
// The two paid tools — gated on a live trial/subscription (checked below).
const PAID_TOOL_PREFIXES = ['/rank', '/api/rank', '/aso', '/api/aso', '/api/aso-variants'];

const isJsonRoute = (path: string) => path.startsWith('/api/');
const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const onRequest = defineMiddleware(async (context, next) => {
  // Started on the first real incoming request, not at module load — see the
  // comment in scheduler.ts for why (a pending setTimeout at import time
  // would keep `astro build` alive until it fires). Safe to call on every
  // request: the module-level `started` flag makes every call after the
  // first a no-op.
  startNightlyScheduler();

  const path = context.url.pathname;

  /* ------------------------------ product mode ----------------------------- */
  if (process.env.PRODUCT_MODE) {
    const matches = (p: string) => (p === '/' ? path === '/' : path === p || path.startsWith(p));
    if (!PRODUCT_PREFIXES.some(matches)) {
      return new Response('Not found.', { status: 404 });
    }

    // Resolve the session for every request; pages read it from locals.
    const user = userFromSessionToken(readCookie(context.request.headers.get('cookie'), SESSION_COOKIE));
    context.locals.user = user;
    context.locals.productMode = true;

    if (path === '/') return next('/landing'); // rewrite: landing page is the storefront
    if (PUBLIC_PREFIXES.some(matches)) return next();

    if (!user) {
      return isJsonRoute(path)
        ? json({ error: 'Not logged in.' }, 401)
        : context.redirect(`/login?next=${encodeURIComponent(path)}`);
    }

    // Both paid tools need a live trial or an active subscription. Admins
    // (the owner) are whitelisted unconditionally — their own account never
    // locks itself out over trial/plan status.
    if (PAID_TOOL_PREFIXES.some(matches) && !isAdminEmail(user.email)) {
      const access = checkAccess(user.status, user.trialEndsAt);
      context.locals.access = access;
      if (!access.allowed) {
        return isJsonRoute(path)
          ? json({ error: 'Your trial has ended — choose a plan on the Account page to continue.', code: 'payment_required' }, 402)
          : context.redirect('/account?expired=1');
      }
    }
    return next();
  }

  /* ----------------------------- internal mode ----------------------------- */
  if (path.startsWith('/api/cron/')) return next(); // gated on CRON_SECRET inside the route itself
  const password = process.env.SITE_PASSWORD;
  if (!password) return next(); // no password configured => open (local dev)

  const expectedUser = process.env.SITE_USER || 'nykaa';
  const header = context.request.headers.get('authorization') || '';

  if (header.startsWith('Basic ')) {
    let decoded = '';
    try { decoded = atob(header.slice(6)); } catch { decoded = ''; }
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (user === expectedUser && pass === password) return next();
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      // NOTE: header values must be Latin-1 (ASCII-safe) — no em-dash / fancy
      // punctuation here, or Node throws a ByteString error (HTTP 500).
      'WWW-Authenticate': 'Basic realm="Nykaa WBR internal", charset="UTF-8"',
    },
  });
});
