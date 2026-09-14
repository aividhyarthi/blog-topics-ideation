---
title: "Google Play's July 2026 Policy Update: Chat Apps, Call Log Permissions, and AI Data"
description: "Google's July 15, 2026 policy update changes rules for anonymous chat apps, removes a common use for the Call Log permission, and confirms user data rules cover third-party AI too. Here's what's actually required."
theme: "Google Play"
image: "/blog/og/google-play-july-2026-policy-update.png"
publishDate: 2026-09-14
faqs:
  - question: "What changed for the Call Log permission?"
    answer: "Google's policy update drops account verification via phone call as an allowed use for the READ_CALL_LOG permission. Reporting on Google's own guidance points to the Digital Credentials API or the SMS Retriever API instead."
  - question: "Does this affect apps using third-party AI features?"
    answer: "Yes. Google's update makes clear its existing user data rules, limited use, disclosure, and consent, apply to third-party AI too. You stay responsible for compliance even when an outside AI provider handles the data."
  - question: "How much time do developers have to comply?"
    answer: "Reporting on Google's July 15, 2026 announcement describes at least 30 days from that date to update apps for compliance."
---

**Key points:**
- Google's July 15, 2026 policy update tightens rules for anonymous and random chat apps under its Families Policy and Child Safety Standards.
- The SMS and Call Log Permissions policy drops phone-call account verification as an allowed use for READ_CALL_LOG. The Digital Credentials API or SMS Retriever API are the stated alternatives.
- User data rules, limited use, disclosure, and consent, now explicitly cover third-party AI integrations too. Not just a developer's own systems.
- Developers get at least 30 days from July 15, 2026 to bring apps into line.

One policy update. Three separate things. Chat safety. A specific Android permission. AI data handling. Easy to skim past in one pass. Each piece carries its own real deadline. Here's what Google's July 2026 update actually asks for, piece by piece.

## Anonymous and random chat apps

Google's update adds rules here. Under its Families Policy. Under its Child Safety Standards. Aimed straight at anonymous chat and random chat apps. The direction fits Google's wider child-safety push this year. These apps can't target children now. New rules stack on top of Google's existing age-restricted content policy. Got a chat feature that pairs up strangers, even as a small side feature? Worth a direct check. Don't assume this only touches apps built purely for chat.

## The Call Log permission change

This is the sharpest, most technical piece. The SMS and Call Log Permissions policy no longer allows account verification via phone call as a valid reason for READ_CALL_LOG. Request that permission just to confirm a user's identity through an incoming call? That reason no longer holds up.

| Old approach | What Google points to instead |
|---|---|
| READ_CALL_LOG for phone-call verification | No longer an allowed use case |
| Alternative 1 | Digital Credentials API |
| Alternative 2 | SMS Retriever API |

Both alternatives verify a user without the wide access READ_CALL_LOG grants. That's the real point here. Narrower permission. Same result.

## Third-party AI and your data duties

Google's update closes a gap too. Some developers may have assumed it was open. User data rules apply here now. Limited use. Real disclosure. Real consent. They cover a third-party AI provider doing the work. Not just a developer handling data directly. Send user data through an outside AI tool, and the job doesn't move with it. It stays with you.

> **Real-world scenario:** A messaging app used READ_CALL_LOG for years, purely to confirm a new user's phone number matched a recent incoming call. A quick verification shortcut, nothing more. Reading Google's updated policy directly showed that exact use case was gone. The team swapped it for the SMS Retriever API. Users got verified through an incoming text instead of call history. No broad permission needed at all. The new flow ended up simpler for users too. Not just more compliant.

## What to actually do about it

1. **Audit any chat feature that pairs strangers, not just apps built entirely around chat.** Google's rule targets the behavior. Not just apps labeled as chat apps.
2. **Check whether you request READ_CALL_LOG for account verification.** If so, that reason is gone now. Move to the Digital Credentials API or SMS Retriever API before enforcement catches up.
3. **Review every third-party AI integration for real data compliance.** Limited use, disclosure, consent. All apply there now, just as much as your own systems.
4. **Count your compliance window from July 15, 2026. Not from today.** Reporting says at least 30 days from that date. Check how much runway you have left.

[AppRankr's Rank Tracker](/rank) tracks your real Google Play visibility. But a policy violation here can hurt your app's standing before it ever shows up as a rank change. Check compliance against Google's own current pages. Not a summary written before enforcement details settled.
