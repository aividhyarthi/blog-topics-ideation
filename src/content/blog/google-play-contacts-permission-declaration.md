---
title: "Google Play's Contact Picker Switch: What Your READ_CONTACTS Permission Now Requires"
description: "Android's own Contact Picker page confirms a privacy-preserving alternative to broad contacts access. Reporting says Play Console is now prompting a declaration for apps that still request READ_CONTACTS. Here's what's confirmed and what's still reported."
theme: "Google Play"
keyword: "Google Play contacts permission"
image: "/blog/og/google-play-contacts-permission-declaration.png"
publishDate: 2026-09-18
faqs:
  - question: "What is the Android Contact Picker?"
    answer: "Android's own developer page describes it as a standardized, browsable interface for sharing contacts, available on Android 17 (API level 37) or higher. It's a privacy-preserving alternative to the broad READ_CONTACTS permission, since an app only sees the contacts a user picks."
  - question: "Do I need to remove READ_CONTACTS from my app?"
    answer: "Not necessarily. Android's own page says apps targeting Android 17 or later may only request READ_CONTACTS if the Contact Picker isn't sufficient for a real, core feature. Reporting describes a Play Console declaration form for apps that still need it. Check your own Play Console for your app's exact prompt and deadline."
  - question: "When does this become mandatory?"
    answer: "Reporting on this policy gives different dates for full enforcement, so this isn't settled here. Check your own Play Console's Policy Deadlines page for your app's specific date rather than relying on any single outside summary, including this one."
---

**Key points:**
- Android's own [Contact Picker page](https://developer.android.com/about/versions/17/features/contact-picker) confirms a standardized picker interface, live on Android 17 (API level 37) and higher, as a privacy-preserving alternative to READ_CONTACTS.
- Apps don't need to declare or request READ_CONTACTS in the manifest at all when using the Contact Picker, per Android's own page.
- Reporting describes Play Console now prompting a declaration form this month for apps that still request READ_CONTACTS, asking why the picker isn't enough. Not independently confirmed on an official Play Console Help page for this piece, since that page is unreachable from here.
- Reported enforcement dates for full compliance vary across sources. Check your own Play Console's Policy Deadlines page for your app's real date.

A permission that used to be a simple checkbox now needs a written reason. Android's own page confirms the technical fix exists. Reporting says Play Console already asks developers to justify skipping it.

## What Android's own page confirms

[Android's own Contact Picker page](https://developer.android.com/about/versions/17/features/contact-picker) is direct about how it works. On Android 17 (API level 37) or higher, apps get a standard, browsable picker. A user picks specific contacts. The app only sees the fields it asked for. Phone number or email. Nothing more. No full address book. And no manifest line for READ_CONTACTS at all, if the picker covers your use case.

| Question | What's confirmed | What's reported, not confirmed here |
|---|---|---|
| Does the Contact Picker exist? | Yes, Android's own page | n/a |
| Minimum OS for it? | Android 17, API level 37 | n/a |
| Play Console declaration prompt live now? | n/a | Yes, per multiple outlets |
| Full enforcement deadline | n/a | Reported dates vary by source |

## Why the declaration step is the part to plan for

Reporting describes something Android's own page doesn't cover. A Play Console declaration form. Apps that still request READ_CONTACTS reportedly get asked to explain, in real detail, which feature needs it. And why the picker can't do the job instead. That's a real process step. Not just a policy line to read once and forget.

The exact enforcement date is where sources disagree. One report ties it to an October deadline, linked to Android 17 targeting rules. Another names a January 2027 compliance date. Rather than guess and risk being wrong for your app, check your own Play Console's Policy Deadlines page directly.

> **Real-world scenario:** A messaging app's team had used READ_CONTACTS for years. It let users find friends already on the app. They treated it as a fixed, settled part of their manifest. Reading Android's own Contact Picker page showed the picker could cover this exact case. A user picks who to invite. The app never sees the full address book. They rebuilt the friend-finder flow around the picker instead. When their own Play Console later prompted a declaration for the old permission, they had already removed the need for it. Nothing left to justify.

## What to actually do about it

1. **Check your own Play Console for a declaration prompt.** Reporting says this is already showing up for apps with READ_CONTACTS. Don't wait to spot it by accident.
2. **Test whether the Contact Picker actually covers your feature.** Android's own page lists real capabilities: search, profile switching, multi-selection. Many "we need the whole address book" assumptions fall apart under an actual test.
3. **Check your own Policy Deadlines page for your exact date.** Reported enforcement dates conflict across outside sources. Only your own Play Console has the real number for your app.
4. **Don't treat a manifest permission as fixed forever.** A feature built around broad access years ago may not need it today. Not with a real picker now available.

[AppRankr's Rank Tracker](/rank) tracks your real Google Play visibility. A permissions policy shift doesn't move your rank on its own. But a rejected update over an undeclared permission can stall everything else you're tracking.
