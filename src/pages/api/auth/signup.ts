import type { APIRoute } from 'astro';
import { signup, createSession, sessionCookie, isSecureRequest } from '../../../lib/saas/auth';

export const POST: APIRoute = async ({ request, url }) => {
  let body: { email?: string; password?: string; name?: string };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid request.' }), { status: 400 }); }

  const { user, error } = signup(String(body.email || '').trim(), String(body.password || ''), String(body.name || ''));
  if (!user) return new Response(JSON.stringify({ error }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const { token } = createSession(user.id);
  return new Response(JSON.stringify({ ok: true, redirect: '/rank' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(token, isSecureRequest(request, url)),
    },
  });
};
