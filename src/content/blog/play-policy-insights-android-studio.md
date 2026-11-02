---
title: "Android Studio Can Now Flag Play Policy Issues Before You Submit"
description: "Google's own documentation confirms Play Policy Insights runs as lint checks inside Android Studio, catching policy problems before submission instead of after a rejection. Here's what it actually covers."
theme: "Google Play"
keyword: "Play Policy Insights Android Studio"
image: "/blog/og/play-policy-insights-android-studio.png"
publishDate: 2026-11-02
faqs:
  - question: "What does Play Policy Insights actually check for?"
    answer: "Per Google's own documentation, it runs as lint checks inside Android Studio, flagging potential Google Play policy issues tied to certain permissions or app functionality, before you ever submit."
  - question: "Does it cover every Play policy?"
    answer: "No. Google's own words are direct: 'It doesn't cover every policy, nor does it provide final app review decisions.' It's pre-review guidance, not a substitute for actual review."
  - question: "How do I actually run it?"
    answer: "Per Google's own docs, go to Code > Inspect for Play Policy Insights in Android Studio. Results show up in the Problems tool window and as lint warnings directly in your files."
---

**Key points:**
- Google's own [Android Studio documentation](https://developer.android.com/studio/publish/insights) confirms Play Policy Insights runs as lint checks, flagging potential Google Play policy issues before you submit your app.
- Per Google's own words, it's meant to prevent "issues that could disrupt your launch process and cost more time and resources to fix later on."
- It explicitly doesn't cover every policy, and doesn't hand down a final review decision. Google's own text: always check the full policy in the Policy Center.
- It can run in CI too, through the insights-lint library added as a lintChecks dependency.

A rejection that used to arrive days after submission can now show up as a lint warning while you're still writing the code.

## What Google's own documentation actually confirms

Per Google's own words, these lint checks surface "an overview of the relevant policy," "dos and don'ts to avoid common pitfalls," and "links to Play policy pages" for more detail. That's a real shift from catching a policy problem at review time to catching it while the feature is still being built.

| Detail | What Google's own docs confirm |
|---|---|
| How to run it | Code > Inspect for Play Policy Insights |
| Where results appear | Problems tool window, plus inline lint warnings |
| Coverage | Not every policy. Two confirmed areas so far |
| CI support | Yes, via the insights-lint library as a lintChecks dependency |

## Why this isn't just another lint warning

Google's own docs draw a clear line here. A normal lint check suggests a specific code fix. This one doesn't. Per Google's own words, "quick fixes don't exist for Play Policy Insights lint checks." Not the way they do for other warnings. Instead, it's meant to trigger "a deeper review of your app's intended behavior." Some flagged issues aren't even fixable inside Android Studio. Some need a real change in Google Play Console itself. Not just code.

> **Real-world scenario:** A small team added a feature using the Advertising ID. They didn't realize it touched a real policy risk. In past releases, they'd only find out when a rejection came back from review. Days after the build was already locked for launch. This time, Android Studio flagged it right in the Problems window, while the feature was still in progress. They read the linked policy page. They adjusted how the ID was used. They avoided a rejection that would have landed right before their launch.

## What it explicitly does not replace

Google's own words are blunt about the limits here. "It doesn't cover every policy, nor does it provide final app review decisions." This is pre-review guidance. Not a compliance guarantee. A clean result in Android Studio doesn't mean a clean pass through actual review. Treat it as an early filter that catches real, known issues, not as a full substitute for reading the Policy Center directly.

## What to actually do about it

1. **Run it before your next submission, not after a rejection.** Code > Inspect for Play Policy Insights, right inside Android Studio.
2. **Don't expect a one-click fix for every flagged item.** Some findings need a real design change, or a change in Play Console itself.
3. **Add it to CI if your team ships frequently.** The insights-lint library catches this automatically, without anyone remembering to run it by hand.
4. **Keep checking the Policy Center directly for anything not covered yet.** Google's own words confirm this doesn't cover every policy, only a growing, specific set.

[AppRankr's ASO Inspector](/aso) reviews your current listing and permissions footprint, a useful companion check before a policy issue costs you review time.
