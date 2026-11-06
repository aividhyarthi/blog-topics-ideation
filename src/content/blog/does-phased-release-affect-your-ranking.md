---
title: "Does Phased Release Affect Your App Store Ranking?"
description: "Apple lets you roll an update out over 7 days instead of releasing it to everyone at once. Here's what phased release actually controls, straight from Apple's own help page, and what it doesn't."
theme: "App Store"
keyword: "phased release App Store ranking"
image: "/blog/og/does-phased-release-affect-your-ranking.png"
publishDate: 2026-11-06
faqs:
  - question: "What does phased release actually control?"
    answer: "Per Apple's help page, it controls how fast users with automatic updates turned on get your new version. It follows a 7-day schedule, from 1% on day one up to 100% on day seven. It does not block manual downloads. Anyone can still grab the update by hand at any time."
  - question: "Does Apple say phased release affects ranking or search visibility?"
    answer: "No. Apple's page describes phased release as a simple rollout tool. It makes no claim about App Store ranking or search results at all."
  - question: "Can I pause a phased release if I spot a problem?"
    answer: "Yes. Apple's page allows up to 30 days of pause time in total, with no cap on how many times you pause. A paused release picks back up on the day it stopped, not from day one."
---

**Key points:**
- Phased release spreads your update to automatic-update users over 7 days, per [Apple's own help page](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/): 1%, 2%, 5%, 10%, 20%, 50%, then 100%.
- Manual downloads are never blocked. Anyone can grab the update by hand at any point.
- Apple's page never links phased release to App Store ranking or search visibility.
- You get up to 30 days of pause time in total, and a paused rollout resumes where it left off.

A slow rollout schedule sounds like it should touch your ranking somehow. Apple's own page says it doesn't.

## What phased release actually controls

The tool does one narrow job. Per Apple's page, "a random sample of users with automatic updates on eligible devices will receive the update, without any notification of their participation." That's the whole scope. Which users with auto-updates on get the new build, and when. The rollout runs on a fixed 7-day clock.

| Day | Share of automatic-update users reached |
|---|---|
| 1 | 1% |
| 2 | 2% |
| 3 | 5% |
| 4 | 10% |
| 5 | 20% |
| 6 | 50% |
| 7 | 100% |

Two limits matter just as much as the schedule. Manual downloads are never staged. Apple's page says plainly that apps and updates in phased release "can be manually downloaded from the App Store by anyone at any time." And the whole setting only touches automatic updates in the first place. Apple labels it "Phased Release for Automatic Updates."

## Why it's easy to assume a ranking link

A slow rollout feels like it should change how visible your app is. Soft launches and staged country rollouts really do touch discovery in other contexts, so phased release can read the same way at a glance. It doesn't work that way here. Apple's page names exactly one effect: how fast current users get a new build. It says nothing about ranking. Nothing about search placement. Nothing about discovery. The silence isn't a gap in the page. It's the full scope of what the feature does.

> **Real-world scenario:** A team shipped a build with a subtle bug and saw crash reports climb faster than expected on day one. They'd used phased release, so only 1% of auto-update users had the new build yet. They still had most of their 30 days of pause time left. They paused right away, fixed the bug, and resumed from day one rather than starting the whole schedule over. Ranking never came into the decision. Keeping the bug contained to a small group while they fixed it, that was the entire win.

## What to actually do about it

1. **Use phased release for what it's built to do: catch problems early, not move your ranking.** Treat it as a safety net for a small test group, nothing more.
2. **Remember manual downloads skip the schedule.** A low staged percent doesn't mean your update is hidden from everyone else.
3. **Use the pause option the moment early signals look off.** Thirty days of pause time, split however you need, is real room to fix a bug before more users see it.
4. **Don't look to phased release for a ranking boost it was never built to give.** Your app's real quality and review signals are what actually move that number.

[AppRankr's Rank Tracker](/rank) tracks your real ranking after a release, a clearer read than guessing whether a rollout setting played a part.
