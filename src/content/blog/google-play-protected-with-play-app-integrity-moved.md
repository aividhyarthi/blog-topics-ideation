---
title: "Play Console Renamed App Integrity to Protected with Play. Here's Where Things Moved"
description: "If you're hunting for the old App integrity page in Play Console and can't find it, Google replaced it. Here's exactly where App signing and your other protection settings moved to, per Google's own help page."
theme: "Google Play"
keyword: "Protected with Play"
image: "/blog/og/google-play-protected-with-play-app-integrity-moved.png"
publishDate: 2026-10-12
faqs:
  - question: "Where did the App integrity page in Play Console go?"
    answer: "Per Google's own Play Console help page, it was replaced by a new page called Protected with Play. The old bookmark or menu path no longer works. Protected with Play sits in the Play Console navigation and groups your protection settings into one place."
  - question: "Where is App signing now?"
    answer: "Per Google's own help page, App signing now lives under Play Store protection, one of four grouped sections inside Protected with Play. It's no longer a standalone page."
  - question: "What are the four sections inside Protected with Play?"
    answer: "Per Google's own help page: Automatic Protection, Play Integrity API, Play Store protection, and Play Billing protection. Each expands into its own settings. A status badge at the top reads Default, Good, or High depending on how many of the four you're actually using."
---

**Key points:**
- Google's own [Play Console help page](https://support.google.com/googleplay/android-developer/answer/13857328) confirms the old App integrity page was replaced by a new page called Protected with Play.
- App signing didn't disappear. Per Google's own page, it moved under a section called Play Store protection, inside the new page.
- Protected with Play groups everything into four sections: Automatic Protection, Play Integrity API, Play Store protection, and Play Billing protection.
- A status badge reads Default, Good, or High, based on how many of those four sections you're actually using.

A bookmark that used to work stops working. That's usually the first sign a Play Console page got renamed, not removed. App integrity is one of those pages.

## What actually happened

Per Google's own Play Console help page, the old App integrity page is gone. In its place is a new page called Protected with Play. It's not a cosmetic rename either. The new page pulls together settings that used to live in different corners of Play Console, so one page now shows your app's full protection picture at once.

| Old location | Where it is now |
|---|---|
| App integrity page | Replaced by Protected with Play |
| App signing (used to be standalone) | Inside Protected with Play, under Play Store protection |
| Play Integrity API settings | Inside Protected with Play, its own section |

## The four sections, and the badge that scores them

Per Google's own page, Protected with Play splits into four expandable sections. Automatic Protection guards against unauthorized changes and reuploads. Google's own page says this turns on with one click, with no backend work needed on your side. Play Integrity API is its own section, handled entirely on the device by the Play Store app itself. Play Store protection is where App signing now sits. Play Billing protection rounds out the fourth group.

A status badge sits at the top of the page. Per Google's own description, it reads Default, Good, or High, based on how many of the four grouped areas your app is actually using. Not a number, not a raw list. A single word that tells you, at a glance, whether you've left most of this turned off.

> **Real-world scenario:** A developer went looking for their app's signing key settings using an old internal wiki link to the App integrity page. The link loaded a 404. Checking the Play Console's left navigation directly, they found Protected with Play instead. Opening the Play Store protection section inside it, App signing was right there, same settings, just nested one level deeper than before. The badge at the top read "Default," which prompted them to open the other three sections and turn on Automatic Protection, something they hadn't known was available with one click.

## What to actually do about it

1. **Stop looking for App integrity. Go to Protected with Play instead.** The old page isn't coming back, per Google's own help page describing it as a replacement.
2. **Check your badge status, not just App signing.** Default means you're likely leaving real protection turned off. Good and High mean you're actually using more of the four grouped sections.
3. **Turn on Automatic Protection if you haven't.** Per Google's own page, it requires no backend integration and switches on with one click directly in Play Console.
4. **Update any internal docs, wikis, or onboarding guides that still point to the old App integrity path.** A renamed page breaks saved links silently, with no redirect notice most developers will ever see.

[AppRankr's Rank Tracker](/rank) keeps an eye on your actual store visibility day to day, a useful habit to pair with checking your app's protection settings whenever Play Console reorganizes again.
