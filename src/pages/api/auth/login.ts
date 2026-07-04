import type { APIRoute } from 'astro';
import { login, createSession, sessionCookie } from '../../../lib/saas/auth';

export const POST: APIRoute = async ({ request, url }) => {
  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 }); }

  const { user, error } = login(String(body.email || '').trim(), String(body.password || ''));
  if (!user) return new Response(JSON.stringify({ error }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const { token } = createSession(user.id);
  return new Response(JSON.stringify({ ok: true, redirect: '/rank' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(token, url.protocol === 'https:'),
    },
  });
};
