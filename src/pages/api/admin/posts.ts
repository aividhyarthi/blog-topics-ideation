import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';
import { isAdmin } from '../../../lib/billing';
import { listPostSummaries, getPostBySlug, deletePost } from '../../../lib/blogPosts';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// GET: list every post (slug/title/date) for the admin "Manage posts" panel.
// GET ?slug=...: the full post, for loading into the edit form.
export const GET: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);

  const slug = ctx.url.searchParams.get('slug');
  if (slug) {
    const post = await getPostBySlug(slug);
    if (!post) return json({ error: 'Not found.' }, 404);
    return json({ post });
  }
  const posts = await listPostSummaries();
  return json({ posts });
};

export const DELETE: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);

  let body: { slug?: string };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const slug = (body.slug || '').trim();
  if (!slug) return json({ error: 'slug is required.' }, 400);

  const ok = await deletePost(slug);
  if (!ok) return json({ error: `No post found with slug "${slug}".` }, 404);
  return json({ ok: true });
};
