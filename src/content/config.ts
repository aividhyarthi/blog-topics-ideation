import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.date(),
    updatedDate: z.date().optional(),
    author: z.string().default('AI Page Audit Team'),
    tags: z.array(z.string()).default([]),
    // Optional FAQPage schema for posts structured as Q&A — the same pattern
    // this tool itself checks for (u_faq_schema in checklists.ts): a real
    // FAQ section is a direct AEO win, so posts that have one should mark it
    // up, not just format it as bold questions.
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
