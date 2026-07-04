// Site-wide password gate for internal (Nykaa) reporting.
//
// If SITE_PASSWORD is set, EVERY page and API route requires HTTP Basic Auth.
// Share one password with the team; the browser remembers it for the session.
// If SITE_PASSWORD is NOT set, the site stays open (handy for local dev) — so
// always set it on the deployed (Railway) environment.
import { defineMiddleware } from 'astro:middleware';
import { startScheduler } from './lib/rank/scheduler';

// Kicks off the Rank Tracker's daily auto-check loop once per server process.
// Module-level (not per-request) — this file is loaded once at server boot.
startScheduler();

export const onRequest = defineMiddleware(async (context, next) => {
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
