---
title: "Apple's App Store Connect API Can Now Automate Accessibility Labels"
description: "Apple's own App Store Connect API 4.0 release notes confirm accessibility declarations can now be created, updated, and read through the API, per device family, instead of only by hand."
theme: "App Store"
keyword: "accessibility declarations API"
image: "/blog/og/apple-accessibility-declarations-api.png"
publishDate: 2026-10-25
faqs:
  - question: "What changed with accessibility declarations in App Store Connect API 4.0?"
    answer: "Per Apple's own release notes, the Accessibility declarations resources are now available through the API. You can create, update, and read them per device family, instead of setting them only by hand in the App Store Connect web interface."
  - question: "What are these accessibility labels actually showing on the App Store?"
    answer: "Per Apple's own App Store Connect Help page, a developer declares support for features like VoiceOver, Voice Control, Larger Text, Dark Interface, Sufficient Contrast, Reduced Motion, Captions, and Audio Descriptions. Apple's own rule: a user must be able to complete all common tasks in the app using that feature for it to count as supported."
  - question: "Does this change what shows on my app's product page?"
    answer: "No, not by itself. The API only changes how a declaration gets created or updated. What shows on the product page is the declaration's content, which is unchanged by this release."
---

**Key points:**
- Apple's own [App Store Connect API 4.0 release notes](https://developer.apple.com/documentation/appstoreconnectapi/app-store-connect-api-4-0-release-notes) confirm new tools for accessibility labels. You can now create, update, and read them, per device, through the API.
- The same release lets you update an app's `accessibilityURL` too, through the API, via the "Modify an app" call.
- Apple's own Help page lists nine features you can declare: VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate Without Color Alone, Sufficient Contrast, Reduced Motion, Captions, and Audio Descriptions.
- Before this, you had to set each one by hand. One app, one device family, at a time.

A label most teams set once and forget just became something a script can manage.

## What Apple's own release notes confirm

Per Apple's own words, API 4.0 makes accessibility labels "now available to automate creating, updating, and reading... per device family." One more detail sits right next to it. You can now use "Modify an app" to update the app's `accessibilityURL` too.

| Detail | What Apple's own release notes confirm |
|---|---|
| New resource | Accessibility declarations, via the API |
| Scope | Per device family, not one blanket setting |
| Related change | `accessibilityURL` now updatable via Modify an app |
| Prior method | Manual entry in the App Store Connect web interface |

## What these labels actually cover

These labels aren't new. Only the API path is new. Apple's own Help page names nine features. VoiceOver. Voice Control. Larger Text. Dark Interface. Differentiate Without Color Alone. Sufficient Contrast. Reduced Motion. Captions. Audio Descriptions. Not every feature fits every device. Voice Control skips Apple TV and Apple Watch. Larger Text skips Mac and Apple TV.

Apple's own bar for claiming support is strict. A user must finish every common task using that feature. Not just some tasks. All of them. Only then can a team mark it as supported.

## Why the API path actually matters

One app on iPhone, iPad, Mac, Apple TV, Apple Watch, and Vision Pro means several separate labels. Setting those by hand works fine for one app. It gets slow fast for a studio with many apps. Or one app shipping the same work on several platforms at once.

> **Real-world scenario:** A team shipped one app on iPhone, iPad, and Mac. They'd just added full VoiceOver and Larger Text support to all three builds, in the same release. Setting each device's label by hand meant three trips through the same web form. Every future release touching accessibility meant three more trips. Reading Apple's own API notes, the team scripted it instead. One call per device, run from the same pipeline that already handled their build uploads. The labels went live with the build. No one had to remember a manual step.

## What to actually do about it

1. **Check your current labels first.** If they were only ever typed in by hand, confirm they're still accurate before automating anything.
2. **Match your real feature support against Apple's own list.** Don't claim a feature unless every common task actually works with it.
3. **Script the update if you run several device families or several apps.** One call per declaration, from your existing release process. That's the real win here.
4. **Keep `accessibilityURL` current too.** It's part of the same automatable update now, through Modify an app.

[AppRankr's ASO Inspector](/aso) reviews your current listing alongside details like this, a quick way to check nothing's stale before a change like this ships.
