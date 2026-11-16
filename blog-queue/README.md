# Scheduled blog queue

How posts get published with no manual step and no AI API call at publish
time (see `.github/workflows/publish-blog-queue.yml` and
`scripts/publish-queue.mjs`).

## How it works

1. A fully-written post goes in `pending/` as a JSON file, in the exact
   shape `POST /api/admin/publish-post` expects (see any existing file
   here, or `src/pages/api/admin/publish-post.ts`). Its `publishDate` can
   be in the future.
2. The `publish-blog-queue` GitHub Action runs every 6 hours. It POSTs
   every file in `pending/` to the live site (using `BLOG_PUBLISH_TOKEN`
   as a bearer token, not an admin login), then moves each one it
   successfully sent into `sent/` and commits that.
3. The post exists in the live database from that point on, but stays
   invisible (the public page 404s, it's excluded from every listing)
   until its own `publishDate` actually arrives — that part is handled
   entirely by `listPublishedPosts()` in `src/lib/blogPosts.ts`, not by
   this queue or the Action. The Action's only job is "make sure it
   exists before its date." It does not need to run at the exact minute a
   post should go live.

## One-time setup this needs (not something Claude can do from here)

Two secrets, same value in both places — generate one with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`:

- **Railway** (the live site's env vars): `BLOG_PUBLISH_TOKEN`
- **GitHub repo secrets** (Settings → Secrets and variables → Actions):
  `BLOG_PUBLISH_TOKEN` (same value) and `BLOG_SITE_URL` (e.g.
  `https://aipageaudit.com`, no trailing slash)

Until both are set, the Action will fail its "Drain queue" step with a
clear error instead of silently doing nothing.

## Keeping the queue filled

This only keeps "automode" going as long as `pending/` has posts in it.
Nothing writes new ones on its own — that's still a writing task, just
with the manual admin-panel step removed. Add more JSON files here
whenever the queue is running low.
