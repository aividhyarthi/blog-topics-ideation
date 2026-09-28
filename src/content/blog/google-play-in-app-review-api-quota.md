---
title: "Google's In-App Review Prompt Has a Hidden Quota, and It's Intentional"
description: "Call the API twice in a short window and the second request often shows nothing. Google's own docs confirm a quota exists. They just won't say the exact number."
theme: "Reviews & Ratings"
keyword: "Google Play in-app review quota"
image: "/blog/og/google-play-in-app-review-api-quota.png"
publishDate: 2026-09-28
faqs:
  - question: "Why did my in-app review prompt not show up, even though I called the API correctly?"
    answer: "Google's own documentation confirms a real quota exists. Calling the review flow more than once in a short period, less than a month by Google's own wording, might not show a dialog the second time. This is expected behavior, not a bug in your code."
  - question: "What's the exact quota limit for Google's In-App Review API?"
    answer: "Google deliberately doesn't publish the exact number. Their own docs call it an implementation detail that can change without notice. Developer reports commonly describe a practical window of roughly 7 to 14 days, but treat that as a reported estimate, not an official figure."
  - question: "Should I add a button that lets users manually trigger the review prompt?"
    answer: "Google's own guidance advises against it. A user might have already hit their quota, and a visible button that does nothing when tapped is a broken, confusing experience. Trigger the flow from a good moment in your app instead, not a persistent UI element."
---

**Key points:**
- Google's own documentation confirms the in-app review flow has a real quota. It's not a bug when a second call in a short window shows nothing.
- The exact quota number is deliberately undocumented. Google's own words call it an implementation detail that can change without notice.
- Developer reports commonly describe a practical window of about 7 to 14 days. That's a reported estimate, not an official figure.
- Google's own guidance says not to build a visible button for this. A tap that silently does nothing is a worse experience than no button at all.

You call Google's In-App Review API at exactly the right moment. Nothing shows. You check your code twice. Nothing's wrong with it. Google's own quota is just doing what it's designed to do.

## What Google's own docs actually confirm

Google's official documentation states this plainly. Call the review flow method more than once in a short period, less than a month, and the second call might show nothing. That's not a glitch. It's a deliberate limit. It stops the same user from getting asked to rate an app over and over in a short span.

| What Google confirms | What Google doesn't confirm |
|---|---|
| A real quota exists | The exact number of days or calls |
| It can change without notice | Any guarantee it stays constant |
| It's per user, tied to the flow itself | A specific formula you can rely on |

## Why the exact number stays hidden

Google's own wording calls this an implementation detail. Publish an exact number, and developers would game it precisely. Timing prompts right at the edge of the window, every time. Keeping it vague pushes developers to pick a genuinely good moment instead.

Developer reports across many projects describe a practical window of roughly 7 to 14 days. Worth repeating: that's an outside estimate. Not a number Google has confirmed. Google can change the real value any time, without telling anyone.

> **Real-world scenario:** A team building a habit-tracking app called the review API after every major milestone a user hit, assuming each call was a fresh chance at a prompt. They noticed prompts seemed to appear only for a user's first milestone, never for later ones in the same month. Reading Google's own documentation explained why: their quota logic was already blocking the later calls silently. They redesigned their trigger to fire only once, at the single best milestone moment, instead of repeatedly hoping one of several calls would land.

## What to actually do about it

1. **Don't assume a failed prompt means broken code.** Google's own quota can silently block a call that's technically correct.
2. **Pick your single best moment, not several attempts.** Firing the request repeatedly doesn't increase your odds. It mostly wastes calls the quota is already blocking.
3. **Never build a visible button that triggers the flow.** Google's own guidance warns against this exact pattern, since a quota-blocked tap looks broken to the user.
4. **Treat the 7 to 14 day figure as a rough guide, not a rule.** Google can change the real number without any announcement.

[AppRankr's Rank Tracker](/rank) tracks your rating trend over time, so you can see whether a review-prompt strategy is actually moving your average, not just guess from a handful of prompts.
