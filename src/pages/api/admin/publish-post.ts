import type { APIRoute } from 'astro';
import { getUser } from '../../../lib/auth';
import { dbEnabled } from '../../../lib/db';
import { isAdmin } from '../../../lib/billing';
import { createPost, updatePost, getPostBySlug, type ChartSpec } from '../../../lib/blogPosts';
import { coverDataUri } from '../../../lib/blogCover';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Manual publish (and edit): takes an already-written post (no Anthropic/
// OpenAI call, no cost) and inserts or updates it directly in the DB. Pass
// `editSlug` to update that existing post in place instead of creating a
// new one — added after a published post needed a real content fix and
// there was no way to correct it short of editing the database directly.
export const POST: APIRoute = async (ctx) => {
  if (!dbEnabled) return json({ error: 'Not configured.' }, 503);
  const user = await getUser(ctx);
  if (!isAdmin(user)) return json({ error: 'Not authorized.' }, 403);

  let body: {
    title?: string; description?: string; bodyMarkdown?: string;
    tags?: unknown; faqs?: unknown; charts?: unknown; focusKeyword?: string;
    editSlug?: string;
  };
  try { body = await ctx.request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  const bodyMarkdown = (body.bodyMarkdown || '').trim();
  if (!title || !description || !bodyMarkdown) {
    return json({ error: 'title, description and bodyMarkdown are all required.' }, 400);
  }
  // Optional, but capped generously past "3-5 words" rather than hard-capped
  // at word count — a real reader's search phrase, not enforced grammar.
  const focusKeyword = (body.focusKeyword || '').trim().slice(0, 60) || null;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 3) : ['AEO'];
  const faqs = Array.isArray(body.faqs)
    ? body.faqs.filter((f: any) => f && typeof f.q === 'string' && typeof f.a === 'string').slice(0, 8)
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

  const editSlug = (body.editSlug || '').trim();

  try {
    if (editSlug) {
      const existing = await getPostBySlug(editSlug);
      if (!existing) return json({ error: `No post found with slug "${editSlug}".` }, 404);
      // Always regenerate an auto-generated cover (a data: SVG URI), even if
      // the category didn't change — this is what lets a cover-design fix
      // actually reach an already-published post on its next edit, instead
      // of the old design being silently kept forever. A real uploaded
      // image (the 3 seed posts' PNGs, e.g. /blog/what-is-aeo.png) is left
      // alone either way, since that's a deliberate asset, not generated.
      const isAutoCover = Boolean(existing.image && existing.image.startsWith('data:image/svg+xml'));
      const image = isAutoCover ? coverDataUri(tags[0] || 'AEO') : existing.image;
      const post = await updatePost(editSlug, { title, description, bodyMarkdown, tags, faqs, charts, focusKeyword, image });
      return json({ ok: true, slug: post!.slug, url: `/blog/${post!.slug}` });
    }
    const post = await createPost({
      title, description, bodyMarkdown, tags, faqs, charts, focusKeyword,
      image: coverDataUri(tags[0] || 'AEO'),
    });
    return json({ ok: true, slug: post.slug, url: `/blog/${post.slug}` });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not publish that post.' }, 500);
  }
};
