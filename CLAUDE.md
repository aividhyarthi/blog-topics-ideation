# AI Page Audit — notes for Claude Code

An AEO/GEO audit tool ("an initiative by AI Vidhyarthi, built by Rudra Kasturi") at aipageaudit.com, on branch `aeo-checker`. Fetches pages as Googlebot/GPTBot/ClaudeBot/PerplexityBot and scores them for AI citation readiness.

## Blog content style guide (durable — apply to every post, always)

Every blog post is itself a live example of AEO/GEO. If a post wouldn't score well on this tool's own checklist, it shouldn't ship. Concretely:

- **Write for a regular reader, not a copywriter.** Plain, simple English. Short sentences. No literary flourishes, no jargon dressed up as insight ("undifferentiated," "corroboration," "retrieval pool" — say it plainly instead). If a word wouldn't come up in normal conversation, don't use it.
- **Headings are conversational questions**, not essay-style section titles. "Why did Google do this?" not "Implications of the policy shift." This isn't a style preference — question-phrased headings are a scored check (`u_question_headings`) because they match how people actually ask AI engines things.
- **The explicit goal of every structural choice is getting cited** — by ChatGPT, Bing Copilot, Google AI Overviews, Google AI Mode, and Perplexity. When deciding how to structure a section, ask "does this make it easier for a model to extract and trust this" first.
- **Spread data, tables and visuals through the whole post**, not clustered near the top. A table or chart roughly every 2-3 sections, not one obligatory box and then a wall of text.
- **Minimum 5 FAQs per post**, each a real, distinct, directly-answerable question. FAQ content is some of the most directly extractable material for an AI answer engine.
- **Every post still needs**: a quick-answer callout as the very first line, a "key takeaways" checklist box, at least one chart (real data if it exists, clearly labeled "Illustrative" if it's a conceptual/structural illustration instead), at least one pull-quote blockquote, and 2-4 internal links woven into real sentences (never a trailing "see also" list).
- **Never fabricate a statistic, quote, or study.** Real numbers get a named, linkable source. A conceptual illustration (no real number behind it) is always labeled "Illustrative" in its caption, never presented as if it were measured.
- **No em dashes anywhere** — commas, periods, or parentheses instead.
- **Assign a real focus keyword per post** (3-5 words, the actual phrase a person would search or ask an AI — not a topic label), used as the admin form's Focus keyword field. One keyword per post, never shared between two posts.
- **Tag with the real primary category first** (`AEO` or `GEO` as `tags[0]`), plus a secondary tag (`Guide`, `News`, `Technical`, `Comparison`, `Basics`).
- Post publishing is manual via `/admin/payments` → "Publish a post manually" (title, description, tags, focus keyword, body markdown, FAQs JSON, charts JSON). The automated pipeline was removed twice this project (see git log) over an unresolved Anthropic/OpenAI credit issue — don't assume it's running.
- Topic sourcing: Reddit r/AEO, official AI-provider blogs, and SEO trade press (Search Engine Land, Search Engine Roundtable, Search Engine Journal) via `src/lib/blogSources.ts` — use these for **topic discovery only** (title + short excerpt). Never rewrite or closely paraphrase someone else's reporting; every post is original analysis grounded honestly in what the source actually said.
