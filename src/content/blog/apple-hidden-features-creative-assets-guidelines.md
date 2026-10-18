---
title: "Apple's New Guidelines: No Hidden Features, and Real Rules for Creative Assets"
description: "Apple's October 16, 2026 guideline update adds two new rules worth knowing: 2.5.19 bans hidden or undocumented features, and 2.3.14 sets real content rules for creative assets. Here's the exact wording."
theme: "App Store"
keyword: "Apple App Review guidelines update"
image: "/blog/og/apple-hidden-features-creative-assets-guidelines.png"
publishDate: 2026-10-18
faqs:
  - question: "What does the new hidden features guideline actually say?"
    answer: "Per Apple's own rules, 2.5.19 bans hidden, dormant, or undocumented features. Your app's function should be clear to users and to App Review. It names code obfuscation by name. That's grounds for removal and account termination."
  - question: "What are the new rules for creative assets?"
    answer: "Per Apple's own rules, 2.3.14 says creative assets must match your app's real content, function, or brand. No misleading references to other apps. No claims you can't prove. No specific or discounted pricing in the asset."
  - question: "Is this a brand-new policy or a clarification of an old one?"
    answer: "Both, depending on the rule. Per Apple's own announcement, 2.5.19 clarifies an old rule. It used to sit under guideline 2.3.1. Rule 2.3.14 is new. It covers the creative assets feature that launched October 5, 2026."
---

**Key points:**
- Apple's own [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) got updated on October 16, 2026. New rule 2.5.19 bans hidden, dormant, or undocumented app features.
- The same update adds rule 2.3.14. It sets real content rules for the creative assets feature that launched October 5, 2026.
- Per Apple's own wording, rule 2.5.19 names code obfuscation by name. Grounds for removal and account termination.
- Apple's own announcement ties this update to a wider push. Apps that hide what they do during review, then change it later.

A feature your app doesn't advertise isn't automatically against the rules. Apple's own updated guidelines now spell out exactly when it is.

## The exact wording, rule by rule

Per Apple's own guidelines page, here's what changed. Read each quote slowly. The exact words matter here.

**Rule 2.5.19**, hidden, dormant, or undocumented features:

> Don't include any hidden, dormant, or undocumented features in your app; your app's functionality should be clear to end users and App Review. Attempting to hide undocumented features in your app binary, such as through code obfuscation or other methods, is grounds for removal of your app from the App Store and termination of your developer account.

**Rule 2.3.14**, creative assets:

> Creative assets allow you to highlight the value of your app in new ways compared to app-in-use screenshots and preview videos, and can be used across the App Store, including the product page header and in search results. Creative assets must pertain to your app's content and functionality or overarching brand, follow standard metadata guidelines, and be appropriate for all audiences. They should not include inappropriate content, references to other apps with an intent to mislead, unverifiable product claims, or specific or discounted pricing information.

| Rule | What it covers | Status |
|---|---|---|
| 2.5.19 | Hidden, dormant, or undocumented features | Clarifies an old rule, formerly under 2.3.1 |
| 2.3.14 | Creative assets content rules | New. Tied to the October 5 creative assets launch |

## Why 2.5.19 matters even if you've hidden nothing

This isn't just about apps that hide bad things on purpose. It covers anything App Review can't see at submission time. A feature flag set to turn on later. A beta feature sitting quiet in the code. Obfuscation used for some other reason. All of these sit closer to this rule than most devs think.

> **Real-world scenario:** A team used a feature flag system. It turned on new things from the server, no new binary needed. A normal setup for staged rollouts. Reading Apple's own new 2.5.19 text closely, they spotted a problem. One flag was for an unreleased feature. It sat quiet in the current build, ready to flip on by remote. That technically matched "undocumented features" in the binary. So they wrote the planned feature into their next submission notes instead. They stopped leaving it silent. Disclosure became the safer choice. Not a hope that Apple would read their intent kindly.

## What the creative assets rule actually restricts

Per the 2.3.14 text, three limits stand out. No references to other apps meant to mislead. That matters if your assets ever compare you to a rival. No claims you can't prove. A real limit on marketing words that sound good but mean nothing. No pricing or discounts shown in the asset itself. Pricing promos are common elsewhere in app marketing. Not here.

## What to actually do about it

1. **Check any feature flags or remote-config setups in your build.** Per Apple's own text, "undocumented" is the key word. Write down what's there. Do this even if it's off by default.
2. **Don't use code obfuscation as a review workaround.** Apple's own text names it directly. Removal and account termination, not just a rejected build.
3. **Check your creative assets for claims you can't back up.** Per Apple's own text, "unverifiable product claims" is now spelled out plainly. It's not just implied anymore.
4. **Keep pricing and discounts out of creative assets entirely.** Per Apple's own text, that's a direct limit. Not just a suggestion.

[AppRankr's ASO Inspector](/aso) reviews your current listing and assets, a useful check against new rule wording like this before it turns into a rejection.
