---
title: "Google Play's In-App Update API: Flexible vs Immediate, and What Each Requires"
description: "Google's own in-app update flows let you prompt users to update without sending them to the store listing. The two modes work very differently, and picking the wrong one costs you either retention or urgency."
theme: "Google Play"
keyword: "in-app update api flexible immediate"
image: "/blog/og/in-app-update-api-flexible-vs-immediate.png"
publishDate: 2026-11-23
faqs:
  - question: "What's the real difference between a flexible and an immediate in-app update?"
    answer: "A flexible update downloads in the background while the user keeps using the app, per Google's own Play Core documentation. An immediate update is a fullscreen flow that requires the user to update and restart before they can continue using the app at all."
  - question: "Which one should I use for a routine update?"
    answer: "Google's guidance points to flexible for anything the user can keep using the app without, like a new feature that isn't core to the app working. Immediate is meant for updates that are critical to core functionality."
  - question: "Does this API work on every device and every app?"
    answer: "It's supported on Android 5.0 (API level 21) and up, on Android phones, tablets, and ChromeOS devices. Google's documentation notes it isn't compatible with apps that use APK expansion (.obb) files."
---

**Key points:**
- Flexible updates download and install in the background while the user keeps using the app, per [Google's Play Core documentation](https://developer.android.com/guide/playcore/in-app-updates).
- Immediate updates are a fullscreen flow that blocks the app until the user updates and restarts.
- Google's own guidance ties each mode to how critical the update is, not to how big it is.
- The feature needs Android 5.0 (API level 21) or higher and doesn't work with apps using APK expansion files.

Most apps only ask you to update with a banner on the store listing. You have to go find it. Google Play's In-App Update API skips that step. It asks right inside the app, in one of two very different ways.

## What flexible actually does

A flexible update downloads and installs in the background. The user just keeps doing what they were already doing. Google's docs call this the right fit when it's fine for the user to keep using the app while the update downloads. Their own example: a new feature that isn't core to how the app works. Nothing stops the user. Nothing gets in their way. The update is simply ready once it's done.

## What immediate actually does

An immediate update works the opposite way. It's a fullscreen screen that blocks the app. The user has to update and restart before they can do anything else. Google's own guidance is blunt about when to use it: when the update is critical to the app's core function. Once the user accepts, Google Play itself handles the install and the restart. You don't build a custom install screen for this.

| | What the user sees | When Google says to use it |
|---|---|---|
| Flexible | Keeps using the app; update finishes quietly | Smaller changes, like a new feature |
| Immediate | Full block until update and restart | Changes the app truly needs to work |

## Why picking the wrong one actually costs you

Use immediate for a minor update, and you'll likely annoy someone who just wanted to open the app and get something done fast. Use flexible for a real fix, and some users will keep running the broken version, since nothing pushed them off it. These two modes aren't just two settings for the same job. Each one assumes something different about how much the update can wait.

> **Real-world scenario:** A team shipped a plain visual refresh using an immediate update, thinking it would get everyone onto the new look fast. Support soon flagged a jump in one-star reviews. Users wrote that they felt "forced to update just to open the app." The team moved that kind of release to flexible instead, and saved immediate for real, critical fixes. The complaints stopped. Most users still picked up the new look just as fast as before.

## What to actually do about it

1. **Ask if the update is truly critical to the app working.** That's Google's own line to draw, not file size or how excited you are about the release.
2. **Default to flexible for anything the user doesn't need right now.** A quiet background update costs you nothing you actually needed.
3. **Save immediate for updates users truly can't do without.** A critical fix or a breaking change is exactly what Google built it for.
4. **Check your minimum API level and build setup support it first.** The feature needs API level 21 or higher, and it won't work with apps still using APK expansion files.

[AppRankr's Rank Tracker](/rank) watches how a release lands in your real numbers, a clearer read than guessing which update flow mattered.
