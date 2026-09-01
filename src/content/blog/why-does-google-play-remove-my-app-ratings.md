---
title: "Why Does Google Play Remove Some of My App's Ratings?"
description: "A drop in your rating count that you didn't cause usually traces to one of a few documented causes: policy enforcement, a platform migration, or a ratings recalculation. Here's how to tell which."
theme: "Reviews & Ratings"
image: "/blog/og/why-does-google-play-remove-my-app-ratings.png"
publishDate: 2026-09-01
faqs:
  - question: "Why did my Google Play ratings count suddenly drop?"
    answer: "Three documented causes cover most cases: Google removed reviews that violated its Comment Posting Policy (fake, incentivized, or off-topic reviews), a ratings recalculation changed which reviews count toward your average, or reviews tied to an account/device that got flagged for policy violations were removed along with it. None of these are things you did wrong to your listing."
  - question: "Can I get removed reviews restored?"
    answer: "If you believe legitimate reviews were removed in error, Google Play Console has a review-reporting flow, and developers have used the Play Console Help Community to flag cases where recent legitimate reviews disappeared. There's no guaranteed restoration, but flagging it is the only path."
  - question: "Does a drop in rating count hurt my ranking?"
    answer: "The count itself isn't the ranking signal — your average score and recent rating trend are. Losing reviews that were dragging your average down can actually look neutral-to-positive on ranking; losing recent positive reviews can look worse. Check whether your average moved, not just whether the count did."
---

**Key points:**
- A sudden drop in your ratings count almost always means one thing: Google enforced its [Comment Posting Policy](https://play.google/comment-posting-policy/). It removed fake, paid, or off-topic reviews. This is not a bug. It is not something you did wrong.
- Google's [User Ratings, Reviews, and Installs policy](https://support.google.com/googleplay/android-developer/answer/9898684) bans review manipulation, including forced pop-ups and paid reviews. When Google catches violators, it can remove reviews in bulk.
- You can [report reviews you think broke policy](https://support.google.com/googleplay/android-developer/answer/7318385) through Play Console. There is no guaranteed way to get reviews restored.
- Ranking cares about your average score and its recent trend, not the raw count. Check if your average actually moved. Don't just look at the count.

Your ratings count drops by dozens, or hundreds, overnight. You changed nothing. That's worrying to see. But the real causes are few, and well documented. Here's how to work through it.

## The three real causes

**1. Policy enforcement against fake or manipulated reviews.** Google's Comment Posting Policy bans fake reviews, paid reviews, and reviews from bot accounts. Google's systems mix automated checks with human review. When they catch a batch of bad reviews, they remove them. Sometimes this happens in one visible sweep. This is the most common cause developers report on the [Play Console Help Community](https://support.google.com/googleplay/android-developer/community?hl=en).

**2. An account-level or device-level enforcement action.** Google can flag a group of accounts or devices for policy violations that have nothing to do with your app. When it does, reviews tied to those accounts vanish too. This happens even when those reviews looked, to you, like normal genuine feedback.

**3. A ratings recalculation.** Google Play weights recent reviews more than old ones in your average. It also adjusts, from time to time, how ratings get counted and windowed. This can shift your visible count. No single review needs to be a policy violation for this to happen.

| Cause | What it looks like | What to do |
|---|---|---|
| Policy enforcement | A batch of reviews vanish at once, often ones that looked odd in hindsight | Nothing needed — Google removed violations, not a mistake to fix |
| Account/device action | Reviews disappear tied to specific reviewers, unrelated to review content | Nothing to do on your side; this isn't reversible from your end |
| Ratings recalculation | Count shifts slowly, average stays roughly stable | Compare your average before and after — if it barely moved, this is likely it |

## What to actually check

1. **Compare your average score, not just the count.** If your average held steady or rose, the reviews you lost were likely low-value or fake ones dragging it down. That's a wash, or even a win, not a problem.
2. **Check whether the lost reviews were recent or old.** A sweep of reviews all posted in one tight window often points to a fake-review push aimed at your app. Google caught it and rolled it back, sometimes without you asking.
3. **Check the [Play Console Help Community](https://support.google.com/googleplay/android-developer/community?hl=en) for similar reports.** Developers regularly post threads titled things like "recent legitimate reviews removed from the console listing." If others saw the same thing that same week, it's likely a platform-wide sweep, not something about your app specifically.
4. **If you genuinely believe good reviews got caught by mistake**, [report it through Play Console](https://support.google.com/googleplay/android-developer/answer/7318385). There's no guarantee of getting them back. But it's the only real channel.

> **Real-world scenario:** A finance app's ratings count dropped by around 300 overnight. The team's first guess was a bug in Play Console. They checked the average instead. It had actually risen slightly, from 4.1 to 4.2. They then checked the dates on the missing reviews. Almost all of them were posted in a single 48-hour window, three weeks earlier. That pattern matches a coordinated review-bombing attempt, likely from a competitor or a bad-faith actor. Google's fake-review detection caught it and reversed it. The team had nothing to fix. The count drop was the fix.

## Why this doesn't necessarily hurt your ranking

Rating count and rating average are different signals. Ranking cares more about your average, and its recent trend, than the raw count. Losing a batch of fake or low-quality reviews that were dragging your average down helps you, or at worst does nothing. What's actually worth investigating is a drop in your *average* alongside the count change. That's a real quality signal worth chasing. Use [the negative-review theme analysis](/rank) to see what real complaints, if any, remain.

A shrinking review count with a steady average is usually just Google doing its own cleanup. It's not a sign anything is wrong with your app.
