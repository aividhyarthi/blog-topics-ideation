// Minimal session probe for STATIC pages.
//
// The blog is prerendered (see the note in blog/index.astro) so it stays fast
// and reliably crawlable — which also means it renders once at build time and
// can't know whether the visitor is logged in, so its nav always showed the
// logged-out "Start free trial" CTA even to a signed-in owner. Making those
// pages SSR would fix that at the cost of the static/SEO benefit we
// deliberately want there, so instead they call this on load and swap the CTA
// client-side.
//
// Returns only what the nav needs. No plan, no billing state, nothing that
// isn't already visible to this session on its own account page.
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user || null;
  return new Response(
    JSON.stringify(user ? { loggedIn: true, email: user.email } : { loggedIn: false }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Per-session answer — must never be held in a shared/CDN cache, or
        // one visitor's nav state gets served to everyone else.
        'Cache-Control': 'private, no-store',
      },
    },
  );
};
