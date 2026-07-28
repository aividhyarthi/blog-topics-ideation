import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Theme groups posts on the /blog index (e.g. "Fundamentals", "Google
    // Play", "App Store", "Keywords", "Reviews & Ratings").
    theme: z.string(),
    // Nothing here schedules posts — every post in the collection is live the
    // moment it's built — so a future date is always a mistake, and a bad one:
    // Google can suppress or mis-sort a page dated in the future, and readers
    // see an article that hasn't "happened" yet. Fail the build instead of
    // shipping it. The 24h slack keeps a same-day post from tripping this
    // purely because the build server is on UTC and the author isn't.
    publishDate: z.date().refine(
      (d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
      { message: 'publishDate is in the future — posts are published immediately, so use today or earlier.' },
    ),
    author: z.string().default('AppRankr Team'),
    // Featured/OG image — required for Google Discover eligibility (needs a
    // real, prominent on-page image, not just a meta tag) and for a decent
    // link-preview card on social/WhatsApp/Slack shares. 1200x675 (16:9),
    // generated per-post so every article has a distinct card. Path is
    // relative to /public, e.g. "/blog/og/<slug>.png".
    image: z.string(),
    // Optional Q&A pairs rendered as an on-page FAQ section and emitted as
    // FAQPage JSON-LD — the direct-answer format AI Overviews and LLM
    // citations tend to favor. Omit on posts that don't naturally fit it.
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  }),
});

export const collections = { blog };
