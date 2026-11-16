// Raw-markdown sibling of /blog/[slug] — same content, no layout, nav, or
// ads, served as text/markdown. AEO/LLM crawlers that fetch a page and
// convert it to markdown themselves get a cleaner source here, and it's
// what llms.txt links to for each post (see llms.txt.ts).
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((post) => ({ params: { slug: post.slug }, props: { post } }));
}

export const GET: APIRoute = ({ props }) => {
  const { post } = props as { post: Awaited<ReturnType<typeof getCollection<'blog'>>>[number] };
  const body = `# ${post.data.title}

> ${post.data.description}

${post.body}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
