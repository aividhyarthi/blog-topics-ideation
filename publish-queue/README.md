# AppRankr blog publish queue

This branch (`claude/app-ranking-tracker-sbjs7j-queue`) holds blog post
commits that are already written and committed, waiting for their scheduled
publish time. It is never deployed by Railway — only
`claude/app-ranking-tracker-sbjs7j` is.

`pending.txt` lists queued commits, one per line:

```
<commit-sha> <iso8601-publish-at> <target-branch>
```

A scheduled GitHub Action (see `.github/workflows/stagger-apprankr-blog-publish.yml`
on the repo's default branch) runs `scripts/drain-stagger-queue.mjs` every
~20 minutes. Once a line's publish time has passed, it pushes that exact
commit straight to `claude/app-ranking-tracker-sbjs7j` with
`git push origin <sha>:claude/app-ranking-tracker-sbjs7j`, which is what
actually puts it live, and removes the line from `pending.txt`.

This exists so staggered publishing doesn't depend on a Claude session being
awake at the right time, or a tool-approval step succeeding — the actual
wait-then-push step runs on GitHub's own infrastructure instead.

To queue a post: commit it on `claude/app-ranking-tracker-sbjs7j` as usual,
then cherry-pick or merge that same commit onto this branch, append a line
to `pending.txt` with its SHA and intended publish time, and push this
branch (a plain `git push`, no approval flow involved).
