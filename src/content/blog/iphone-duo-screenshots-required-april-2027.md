---
title: "iPhone Duo Screenshots Go From Optional to Required in April 2027"
description: "Apple's own timeline confirms a real deadline. Starting April 2027, every submission needs iPhone Duo screenshots, and needs to be built with the iOS 27 SDK or later. Here's what that actually means for your next release."
theme: "App Store"
keyword: "iPhone Duo screenshots required deadline"
image: "/blog/og/iphone-duo-screenshots-required-april-2027.png"
publishDate: 2026-10-06
faqs:
  - question: "Do I need iPhone Duo screenshots to submit my app right now?"
    answer: "Not yet. Apple's own timeline keeps this optional until April 2027. Starting that month, any app or game submission needs to include iPhone Duo screenshots, per Apple's own requirements."
  - question: "Is the April 2027 deadline only about iPhone Duo screenshots?"
    answer: "No, there's a second part. Starting April 2027, apps and games uploaded to App Store Connect must also be built with the iOS 27 and iPadOS 27 SDK or later, per Apple's own requirement. That part applies to every app, not just ones adding Duo-specific assets."
  - question: "What sizes do the actual iPhone Duo screenshots need to be?"
    answer: "Apple's own screenshot specifications list four sizes. Outer display: 1398x2034 portrait, 2034x1398 landscape. Inner display: 2007x2853 portrait, 2853x2007 landscape."
---

**Key points:**
- Apple's own timeline confirms a real deadline. iPhone Duo screenshots become required for every submission starting April 2027. Optional until then.
- A second, wider requirement lands the same month. Every app and game uploaded to App Store Connect must be built with the iOS 27 and iPadOS 27 SDK or later.
- The SDK rule hits every app. Not just titles adding iPhone Duo support specifically.
- Apple is now accepting iPhone Duo-ready submissions built with Xcode 27.1, ahead of the device's own October 23 launch.

A new device almost always means a "do this eventually" period before a real deadline lands. Apple just confirmed when that deadline actually is.

## The two real requirements, and their one shared date

Apple's own announcements name April 2027 twice. For two different things. First, iPhone Duo screenshots. Every submission needs them starting that month. Second, and separately, every app built for App Store Connect needs the iOS 27 SDK or later. Also starting that month. One is about new assets. The other is a baseline build rule touching every app on the platform.

| Requirement | What it covers | When it's required |
|---|---|---|
| iPhone Duo screenshots | Outer and inner display assets | April 2027 |
| iOS 27 / iPadOS 27 SDK | Every app build, regardless of Duo support | April 2027 |

## Why the SDK part matters more than it looks

It's easy to read "iPhone Duo screenshots required" and assume this only hits teams actively adding Duo support. The SDK rule doesn't work that way. Any app or game submitted after the deadline needs a build on the newer SDK. Full stop. It doesn't matter whether that app does anything Duo-specific at all. A plain utility app still needs a rebuild on the current SDK just to keep shipping updates past that date.

The screenshot sizes themselves haven't changed from what Apple's own specs already listed. Outer display: 1398x2034 portrait, 2034x1398 landscape. Inner display: 2007x2853 portrait, 2853x2007 landscape. What's new here is the real enforcement date. Not the dimensions.

> **Real-world scenario:** A team building a plain utility app, with no plans to ever support iPhone Duo's dual-screen layout, assumed this deadline didn't touch them. Reading Apple's own requirement closely, they saw the SDK part covered every app regardless of Duo support. They scheduled a routine SDK update well ahead of April 2027. They treated it like any other yearly baseline rule, not a last-minute scramble closer to the real date.

## What to actually do about it

1. **Treat the SDK rule as universal, not Duo-specific.** Every app needs the iOS 27 SDK by April 2027. Whether or not it ever touches iPhone Duo features.
2. **Start iPhone Duo screenshots now if you genuinely support the dual-screen layout.** Apple is already taking submissions built with Xcode 27.1, ahead of the hard deadline.
3. **Don't wait until close to April 2027 for either rule.** An SDK rebuild and new screenshot assets both take real production time most teams underestimate.
4. **Use the sizes that are already confirmed.** The screenshot dimensions are stable and settled. Only the enforcement date was the open question.

[AppRankr's ASO Inspector](/aso) reviews your current listing assets, a useful check before a required asset refresh like this one adds new work to your next release cycle.
