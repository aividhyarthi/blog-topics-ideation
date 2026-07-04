import type { APIRoute } from 'astro';
import { destroySession, clearedSessionCookie, readCookie, SESSION_COOKIE } from '../../../lib/saas/auth';

export const POST: APIRoute = async ({ request, url }) => {
  destroySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE));
  return new Response(JSON.stringify({ ok: true, redirect: '/' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearedSessionCookie(url.protocol === 'https:'),
    },
  });
};
