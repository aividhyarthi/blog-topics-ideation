---
title: "Apple's New EU Tracking Prompt Comes With a Real Second Chance"
description: "Apple's own page confirms an alternative App Tracking Transparency prompt in the EU, mandatory in five countries, plus a real annual re-prompt. Here's what actually changed for attribution."
theme: "App Store"
keyword: "EU App Tracking Transparency prompt"
image: "/blog/og/eu-app-tracking-transparency-alternative-prompt.png"
publishDate: 2026-09-21
faqs:
  - question: "What changed with App Tracking Transparency in the EU?"
    answer: "Apple's own page confirms an alternative version of the ATT prompt, available starting with iOS 27.2 and iPadOS 27.2. It carries different formatting and language, plus an optional \"Additional Information\" button. The rules for when you must ask permission stay the same."
  - question: "Is the alternative prompt optional?"
    answer: "Not everywhere. Apple's own page says it's the only version available for apps distributed in Germany, France, Italy, Poland, and Romania, due to legal requirements there. Elsewhere in the EU, developers can choose either version."
  - question: "Can I ask a user for tracking permission more than once?"
    answer: "Yes, under specific conditions. Apple's own page confirms EU users can be re-prompted one year after their previous choice, accept or reject. A user who has turned off the setting in their device's own Settings can't be re-prompted at all."
---

**Key points:**
- Apple's own [developer news](https://developer.apple.com/news/?id=idsft9ai) confirms an alternative ATT prompt in the EU, starting with iOS 27.2 and iPadOS 27.2.
- The alternative prompt is mandatory, not optional, for apps distributed in Germany, France, Italy, Poland, and Romania.
- Apple's own page confirms a real annual re-prompt: EU users can be asked again one year after their last choice, whether they said yes or no.
- The rules for when tracking permission is required haven't changed. Only the prompt itself, and how often you can ask.

A tracking prompt most developers treat as a one-time ask just gained a real second chance. At least in the EU. Apple's own page confirms both a new prompt format and a genuine annual re-ask.

## What Apple's own page confirms

[Apple's own developer news](https://developer.apple.com/news/?id=idsft9ai) is specific about what changed. And what didn't. The alternative prompt carries different formatting and language. Plus an optional text button labeled "Additional Information," which can surface more detail about the actual request. One thing stays fixed. The underlying rule for when you need to ask permission at all.

| Detail | What Apple's own page confirms |
|---|---|
| Where it applies | European Union, starting iOS 27.2 / iPadOS 27.2 |
| Mandatory in | Germany, France, Italy, Poland, Romania |
| Optional elsewhere in the EU | Yes, developer's choice of prompt version |
| Re-prompt window | One year after the user's last choice |
| Blocked from re-prompting | Users who disabled tracking permission in Settings |

## Why the annual re-prompt is the real story here

A single tracking decision used to feel close to permanent. A user who declined once stayed declined, in practice. Unless they dug into Settings themselves. Apple's own page confirms that's no longer strictly true in the EU. One year after a user's last choice, accept or reject, you get a real second ask. A genuine, scheduled shot at recovering consent. Not a workaround. Not a gray area.

It's not unconditional, though. A user who's flipped off the master tracking toggle on their device can't be re-prompted at all. No matter how much time passes. The opportunity is real. But it has a real ceiling too.

> **Real-world scenario:** An ad-supported app in the EU had written off a chunk of its users as permanently opted out. Based on a decline from over a year back. Reading Apple's own page directly showed a real annual re-prompt window existed for exactly this group. They built a simple check into their next release. Track each user's last ATT response date. Re-prompt automatically once a full year had passed, for anyone who hadn't disabled tracking at the device level. A real slice of that written-off group opted in on the second ask.

## What to actually do about it

1. **Check whether the mandatory countries apply to you.** Germany, France, Italy, Poland, and Romania get only the alternative prompt. Confirm your distribution footprint against that list.
2. **Track each EU user's last ATT response date.** The one-year re-prompt window only helps if you actually know when to use it.
3. **Build the re-prompt into your release cycle, not a one-off script.** This is an ongoing mechanic now, recurring every year per user, not a single migration task.
4. **Don't expect a re-prompt for everyone.** A user who disabled tracking at the device level stays out of reach no matter how much time passes.

[AppRankr's ASO Inspector](/aso) reviews the parts of your App Store presence you can directly control. Tracking and attribution sit on the ad-measurement side, separate from organic ranking, but both shape how you read your own growth numbers.
