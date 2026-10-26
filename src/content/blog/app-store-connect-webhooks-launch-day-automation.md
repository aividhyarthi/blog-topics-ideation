---
title: "App Store Connect Webhooks: Know the Second Your App Goes Live"
description: "Apple's own App Store Connect Help page confirms webhooks can now notify your server the moment an app version's status changes, instead of you polling for it. Here's exactly how it works."
theme: "App Store"
keyword: "App Store Connect webhooks"
image: "/blog/og/app-store-connect-webhooks-launch-day-automation.png"
publishDate: 2026-10-26
faqs:
  - question: "What exactly can an App Store Connect webhook notify me about?"
    answer: "Per Apple's own Help page, five events: a build upload's status changing, a beta build's status changing, an app version's status changing, an Apple-hosted asset pack version's status changing, and new TestFlight feedback from a tester."
  - question: "How many webhooks can I set up?"
    answer: "Per Apple's own page, a webhook applies to exactly one app, and you can create up to ten webhooks per app."
  - question: "Who can create or manage webhooks in App Store Connect?"
    answer: "Per Apple's own page, the Account Holder, Admin, or App Manager role. The page doesn't say whether other roles can view existing ones."
---

**Key points:**
- Apple's own [App Store Connect Help page](https://developer.apple.com/help/app-store-connect/manage-your-team/manage-webhooks) confirms webhooks that notify your server automatically when something about your app changes, instead of you checking manually.
- Five event triggers exist: build upload status, beta build status, app version status, asset pack version status, and new TestFlight feedback.
- A webhook covers one app. You can create up to ten per app, per Apple's own stated limit.
- Delivery history is visible for up to 20 of the most recent deliveries over the last week, and a failed delivery can be resent.

Checking App Store Connect over and over on launch day to see if your version went live is a habit a lot of teams never questioned. Apple's own webhooks exist to end it.

## What a webhook actually does

Per Apple's own words, a webhook lets App Store Connect send "automatic notifications to your web server when there are updates or changes to your apps." You implement an endpoint on your own server, and Apple's own page calls that endpoint the webhook itself.

| Detail | What Apple's own page confirms |
|---|---|
| Scope | One app per webhook |
| Limit | Up to 10 webhooks per app |
| Required role | Account Holder, Admin, or App Manager |
| Events available | 5, plus a test "Ping" trigger |

## The five things it can actually tell you

Apple's own page lists five real event triggers. A build upload's status changing. A beta build's status changing. An app version's status changing. An asset pack version's status changing. New TestFlight feedback from a tester. The app version trigger matters most for a launch. It fires the moment your review status actually moves. Approval. Rejection. Going live. No refreshing a browser tab to find out.

> **Real-world scenario:** A small team used to have someone refresh App Store Connect every hour on launch day. They were waiting to confirm a new version had gone live before telling marketing to start the push. One release slipped past them by nearly three hours. Everyone assumed someone else was watching. Reading Apple's own webhook documentation, they set one up against their Slack channel, watching the app version trigger. The next release posted the moment it went live. No one had to watch a tab again.

## What else is worth knowing before setting one up

Deliveries get logged. Apple's own page says you can see "the event ID, event type, created date, and status for up to 20 of the most recent deliveries over the last week." A failed delivery can be resent. One your server didn't acknowledge. A resend creates a new delivery record, and that new record can only be resent once itself. You also can't move a webhook to a different app after creating it. Per Apple's own page, that needs a brand new webhook.

Apple's own page doesn't document the exact signature header or algorithm your server should check. It does say the secret you set is "used by your server to verify that a webhook delivery is from App Store Connect and authentic." For the real mechanics, Apple's page points elsewhere, to its API documentation on configuring webhook notifications.

## What to actually do about it

1. **Start with the app version status trigger if launch-day visibility is your goal.** That's the one event that actually tells you when your review status moves.
2. **Set up the Ping test first.** Apple's own page describes a built-in test delivery before you wire up anything that matters.
3. **Don't skip signature verification.** The secret field exists specifically so your server can confirm a delivery is genuinely from Apple, not a forged request.
4. **Check your delivery history after setup, not just on day one.** Apple's own 20-delivery, one-week window is enough to catch a quiet failure before it becomes a habit.

[AppRankr's Rank Tracker](/rank) tracks your actual visibility once a version goes live, a natural next check right after a webhook tells you it has.
