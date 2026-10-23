---
title: "Google's New MANAGE_CONTACTS Permission: Does Your App Actually Need It?"
description: "Google's own Android Developers Blog confirms WRITE_CONTACTS stops granting write access on the upcoming Android release, replaced by contact intents or a new declared permission. Here's who actually needs it."
theme: "Google Play"
keyword: "MANAGE_CONTACTS permission declaration"
image: "/blog/og/google-play-manage-contacts-permission-declaration.png"
publishDate: 2026-10-23
faqs:
  - question: "What actually happens to WRITE_CONTACTS?"
    answer: "Per Google's own October 21, 2026 developer post, apps that target the upcoming Android release and try to write to contacts directly with WRITE_CONTACTS get a SecurityException or a flat permission denial. Apps still targeting older SDKs keep their current behavior for now."
  - question: "What replaces it for most apps?"
    answer: "Per Google's own post, standard contact intents that need no permission at all. Creating a contact uses ACTION_INSERT. Editing uses ACTION_EDIT or ACTION_INSERT_OR_EDIT. Picking a contact uses the Contact Picker. Google's own examples say an app saving a contact from a chat, or adding a number to an existing one, should use these. Not request a special permission."
  - question: "Which apps actually need the new MANAGE_CONTACTS permission?"
    answer: "Per Google's own post, apps whose real core purpose is managing contacts, where plain intents genuinely aren't enough. Its own examples: a dedicated contact manager, a dialer replacement, a caller ID app that mass-updates entries, enterprise contact sync tools. Google's own words for most other apps: 'probably not.'"
---

**Key points:**
- Google's own [Android Developers Blog post](https://developer.android.com/blog/posts/reliable-way-to-add-and-edit-contacts-android), dated October 21, 2026, confirms WRITE_CONTACTS stops granting direct write access once an app targets the upcoming Android release.
- Most apps need no replacement permission at all. Plain contact intents, needing no permission, cover adding, editing, and picking contacts.
- A new MANAGE_CONTACTS permission exists for apps whose real job is contact management. Shipping it requires a Play Console declaration explaining why intents fall short.
- Per Google's own examples, most ordinary apps land on "probably not" for needing this new permission.

A permission most apps barely think about is changing. Google's own guidance says most apps won't need to replace it with anything.

## What Google's own post actually confirms

Per Google's own words: "Apps that target the upcoming Android release will no longer be able to directly write to contacts with the WRITE_CONTACTS permission." Try to write anyway, and you get a SecurityException or a permission denial, per the same post.

| Detail | What Google's own post confirms |
|---|---|
| What breaks | Direct contact writes using WRITE_CONTACTS |
| Who's affected | Apps targeting the upcoming Android release |
| Default fix | Contact intents, no permission needed |
| For real contact-management apps | A new declared permission, MANAGE_CONTACTS |

## The real question: do you actually need MANAGE_CONTACTS

This is where Google's own post earns a quick check. Not a full code rewrite. It gives direct examples on both sides.

Apps that don't need it, per Google's own list. Saving a contact pulled from a chat, a business card, or an order. Adding a number or email to a contact that already exists. Letting a user pick a contact from their list. Even your own branded screen for editing contacts doesn't qualify on its own. Per Google's own words: "a custom interface alone doesn't qualify."

Apps that likely do need it, per Google's own list. A dedicated contact manager or dialer replacement. A caller ID or spam app that mass-updates entries. Background enterprise or cloud contact sync. Bulk backup, restore, or device transfer tools. Apps setting custom ringtones per contact.

> **Real-world scenario:** A delivery app let users save a driver's number after a delivery. A small convenience feature, not the app's real job. Reading Google's own post, the team checked their use case straight against the examples. Saving one contact from an order matched the "no, use ACTION_INSERT" example exactly. No need to request MANAGE_CONTACTS. No Play Console declaration either. The fix was swapping one intent call. Not a new permission request users would have had to approve.

## Why the Play Console declaration matters if you do need it

Per Google's own post, shipping an app with MANAGE_CONTACTS means filing a Play Console declaration. You explain why plain intents just aren't enough for your case. This isn't a simple checkbox. Google reviews it. Pick this permission without a real reason, and you've added real review friction. Friction most apps never had to face at all.

## What to actually do about it

1. **Check your own code for WRITE_CONTACTS first.** Per Google's own migration guidance, search for WRITE_CONTACTS itself, plus direct calls to ContactsContract's RawContacts and Data content paths.
2. **Match your real use case against Google's own examples before assuming you need MANAGE_CONTACTS.** Most listed examples land on "probably not."
3. **Move call or message shortcut features to People Directory.** Per Google's own post, apps writing "Call with…" or "Message with…" entries should use this instead. It arrives in Android 17 QPR2.
4. **Don't wait for the deadline to start your Play Console declaration, if you do need MANAGE_CONTACTS.** Per Google's own timeline, that review step adds friction worth planning for now.

[AppRankr's ASO Inspector](/aso) reviews your current listing and permissions footprint, a useful check before a permissions change like this turns into a review delay.
