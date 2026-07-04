// Two deployment modes, one repo:
//
// INTERNAL MODE (default, PRODUCT_MODE unset) — unchanged behavior: the whole
// site (Nykaa reporting tools + the single-tenant rank tracker) sits behind
// HTTP Basic Auth when SITE_PASSWORD is set.
//
// PRODUCT MODE (PRODUCT_MODE=1) — the deployment serves AppRankr, the paid
// multi-user rank tracker:
//   - public: landing page (/), /login, /signup, auth APIs, Stripe webhook
//   - everything else needs a session cookie; /rank + /api/rank additionally
//     need an active subscription or a live trial
//   - the internal Nykaa tools are not part of the product and 404
import { defineMiddleware } from 'astro:middleware';
import { userFromSessionToken, readCookie, SESSION_COOKIE } from './lib/saas/auth';
import { checkAccess } from './lib/saas/plans';

const PUBLIC_PREFIXES = ['/login', '/signup', '/api/auth/', '/api/billing/webhook', '/_astro/', '/favicon', '/robots'];
// Product routes; anything NOT in this list is an internal tool and 404s in product mode.
const PRODUCT_PREFIXES = ['/', '/landing', '/login', '/signup', '/account', '/rank', '/api/auth/', '/api/billing/', '/api/rank', '/_astro/', '/favicon', '/robots'];

const isJsonRoute = (path: string) => path.startsWith('/api/');
const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const onRequest = defineMiddleware(async (context, next) => {
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

    // The tracker itself needs a live trial or an active subscription.
    if (path === '/rank' || path.startsWith('/api/rank')) {
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
