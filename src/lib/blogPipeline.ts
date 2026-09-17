// One generation cycle: source a topic, dedupe it, draft it with Claude,
// publish it immediately (DB write, live with no rebuild). Fully automatic —
// no review queue — per explicit product decision, with "skip this cycle
// rather than force a weak post" as the only quality gate.
import { fetchAllTopicCandidates, type TopicCandidate } from './blogSources';
import { generatePostFromTopic } from './blogGen';
import { createPost, sourceUrlUsed, recentPostSummaries, logGenRun, type BlogPost } from './blogPosts';
import { coverDataUri } from './blogCover';

export interface CycleResult {
  status: 'published' | 'skipped' | 'error';
  detail: string;
  post?: BlogPost;
}

export async function runBlogGenCycle(): Promise<CycleResult> {
  try {
    const candidates = await fetchAllTopicCandidates();
    let chosen: TopicCandidate | null = null;
    for (const c of candidates) {
      if (!c.url) continue;
      if (await sourceUrlUsed(c.url)) continue;
      chosen = c;
      break;
    }
    if (!chosen) {
      const detail = candidates.length
        ? `${candidates.length} candidate(s) found, all already covered`
        : 'No candidates from Reddit r/AEO or provider feeds this cycle';
      await logGenRun('skipped', detail);
      return { status: 'skipped', detail };
    }

    const existing = await recentPostSummaries(40);
    const links = existing.map((p) => ({ slug: p.slug, title: p.title }));
    const draft = await generatePostFromTopic(chosen, links);

    const post = await createPost({
      ...draft,
      image: coverDataUri(draft.title, draft.tags[0] || 'AEO'),
      publishDate: new Date().toISOString(),
    });

    await logGenRun('published', `From: ${chosen.label} — ${chosen.url}`, post.slug);
    return { status: 'published', detail: `Published "${post.title}"`, post };
  } catch (err: any) {
    const detail = err?.message || String(err);
    console.error('blogPipeline: cycle failed', detail);
    await logGenRun('error', detail);
    return { status: 'error', detail };
  }
}
