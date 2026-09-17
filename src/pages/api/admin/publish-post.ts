import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';
import { isAdmin } from '../../../lib/billing';
import { createPost, type ChartSpec } from '../../../lib/blogPosts';
import { coverDataUri } from '../../../lib/blogCover';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Manual publish: takes an already-written post (no Anthropic/OpenAI call,
// no cost) and inserts it straight into the DB via the same createPost()
// the automated pipeline uses. For whenever a post is written directly
// (by an admin, or drafted by Claude Code in a session) instead of sourced
// and drafted by the scheduled pipeline in blogPipeline.ts.
export const POST: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);

  let body: {
    title?: string; description?: string; bodyMarkdown?: string;
    tags?: unknown; faqs?: unknown; charts?: unknown;
  };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  const bodyMarkdown = (body.bodyMarkdown || '').trim();
  if (!title || !description || !bodyMarkdown) {
    return json({ error: 'title, description and bodyMarkdown are all required.' }, 400);
  }
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 3) : ['AEO'];
  const faqs = Array.isArray(body.faqs)
    ? body.faqs.filter((f: any) => f && typeof f.q === 'string' && typeof f.a === 'string').slice(0, 6)
    : [];
  const charts: ChartSpec[] = Array.isArray(body.charts)
    ? body.charts
        .filter((c: any) => c && typeof c.title === 'string' && Array.isArray(c.items) && c.items.length)
        .slice(0, 2)
        .map((c: any) => ({
          type: c.type === 'gauge' ? 'gauge' : 'bar',
          title: String(c.title),
          unit: c.unit ? String(c.unit) : undefined,
          caption: c.caption ? String(c.caption) : 'Illustrative, based on this post’s own reasoning.',
          items: c.items.slice(0, 6).map((it: any) => ({ label: String(it.label), value: Number(it.value) || 0 })),
        }))
    : [];

  try {
    const post = await createPost({
      title, description, bodyMarkdown, tags, faqs, charts,
      image: coverDataUri(title, tags[0] || 'AEO'),
    });
    return json({ ok: true, slug: post.slug, url: `/blog/${post.slug}` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not publish that post.' }, 500);
  }
};
