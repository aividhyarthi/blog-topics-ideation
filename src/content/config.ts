import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Theme groups posts on the /blog index (e.g. "Fundamentals", "Google
    // Play", "App Store", "Keywords", "Reviews & Ratings").
    theme: z.string(),
    publishDate: z.date(),
    author: z.string().default('AppRankr Team'),
  }),
});

export const collections = { blog };
