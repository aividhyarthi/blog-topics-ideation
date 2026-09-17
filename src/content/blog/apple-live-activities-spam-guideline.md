---
title: "Apple's New Rule 4.5.3: Live Activities Can't Be Used to Spam Users"
description: "Apple's own App Store Review Guidelines now name Live Activities directly in its anti-spam rule. Here's the exact wording, and what still counts as a legitimate use."
theme: "App Store"
image: "/blog/og/apple-live-activities-spam-guideline.png"
publishDate: 2026-09-17
faqs:
  - question: "What does App Store Review Guideline 4.5.3 say?"
    answer: "It bans spam and unwanted messages sent through Game Center, Push Notifications, or Live Activities. It also bans misuse of Game Center Player IDs."
  - question: "When did this change?"
    answer: "Apple updated this rule on June 9, 2026. It added Live Activities by name to a rule that already covered Push Notifications and Game Center."
  - question: "Are real, time-sensitive Live Activities still allowed?"
    answer: "Yes. This rule targets spam and unwanted messages. A live score, a delivery tracker, or a ride update is a normal, allowed use. None of that changes."
---

**Key points:**
- Apple's own [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), rule 4.5.3, now name Live Activities right next to Push Notifications and Game Center.
- The rule's own words: don't use these to spam or send unwanted messages to customers.
- Apple updated this rule on June 9, 2026. It builds on a rule that already covered other Apple services.
- A real, time-sensitive Live Activity, sports scores, delivery tracking, ride status, is not the target. It stays fully allowed.

Live Activities exist for one thing. A real update that matters right now. Apple's own rule now says it in plain terms. Use them for anything else, fake urgency, a push dressed up as a live update, and that's a rule break. Not a gray area.

## What Apple's own guideline actually says

Rule 4.5.3, quoted directly from [Apple's own App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):

> "Do not use Apple Services to spam, phish, or send unsolicited messages to customers, including Game Center, Push Notifications, Live Activities, etc. Do not attempt to reverse lookup, trace, relate, associate, mine, harvest, or otherwise exploit Player IDs, aliases, or other information obtained through Game Center, or you will be removed from the Apple Developer Program."

Two rules in one. First: the spam ban now names Live Activities by name, next to the services it already covered. Second: a harder, separate rule against Game Center data misuse. The cost there is real. Removal from the Apple Developer Program.

| Question | What Apple's own guideline confirms |
|---|---|
| Is Live Activities named directly? | Yes, next to Push Notifications and Game Center |
| What's banned? | Spam and unwanted messages |
| When did this change? | June 9, 2026 |
| Worst case for Game Center data misuse | Removal from the Apple Developer Program |

## Why this doesn't touch real Live Activities

A real Live Activity shows something happening right now. A live score. A delivery on its way. A ride a few minutes out. None of that looks like spam by any normal reading. Apple's rule targets the behavior, not the feature itself. The risk sits with apps that stretch the format. Turn a Live Activity into a recurring ad, or a fake "urgent" update just to pull someone back in, and that's exactly what this rule catches.

> **Real-world scenario:** A shopping app kept a Live Activity running long after a delivery had arrived. They refreshed it with ads to stay on a user's lock screen. Reading rule 4.5.3 made the risk clear right away. A Live Activity with no real event left is exactly the unwanted message this rule now names. They cut the Live Activity's life to the real delivery window. They moved the ad content to a normal push notification, one the user could see clearly for what it was.

## What to actually do about it

1. **Tie every Live Activity to a real event with a clear end.** No real thing still happening means it should not still run either.
2. **Don't turn Live Activities into a marketing channel.** That's a push notification's job. Not this one's.
3. **Review any Live Activity that updates on a timer, not a real change.** A refresh tied to a clock instead of an event is worth a second look.
4. **Read the full rule before you ship a new Live Activities feature.** This piece covers 4.5.3. The rules nearby, on notifications and Game Center, matter too.

[AppRankr's ASO Inspector](/aso) checks what shapes your listing's visibility. A rule break like this can hurt your standing with Apple directly. Often well before it ever shows up as a ranking problem.
