---
title: "Apple's No-Consent Price Increase Limit Isn't Just $5. It Varies by Country"
description: "Apple's own App Store Connect reference table sets a different no-consent subscription price threshold for every country, and four markets require consent for any increase at all. Here's the real numbers."
theme: "App Store"
keyword: "Apple subscription price increase threshold"
image: "/blog/og/apple-subscription-price-increase-thresholds-by-country.png"
publishDate: 2026-10-31
faqs:
  - question: "What's the no-consent price increase limit in the US?"
    answer: "Per Apple's own App Store Connect reference table, $5 for non-annual subscriptions and $50 for annual ones, both also capped at 50% of the current price."
  - question: "Does every country get the same dollar-equivalent threshold?"
    answer: "No. Per Apple's own table, India's threshold is 500 INR non-annual and 5,000 INR annual, figures set independently, not a currency conversion of the US number. Other countries differ too."
  - question: "Are there countries where any price increase needs consent?"
    answer: "Yes. Apple's own table marks Austria, Germany, Poland, and the Republic of Korea as 'Consent required' for both subscription types, with no numeric threshold at all."
---

**Key points:**
- Apple's own [App Store Connect reference table](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-price-increase-thresholds) sets the US no-consent threshold at $5 for non-annual subscriptions and $50 for annual ones.
- Thresholds differ by country. India sits at 500 INR non-annual and 5,000 INR annual, per Apple's own table, a figure set on its own terms, not converted from the US number.
- Austria, Germany, Poland, and the Republic of Korea require consent for any price increase at all, per Apple's own table, with no numeric threshold listed.
- Apple's own table says thresholds "are subject to change based on changes in tax or foreign exchange rates," so a number worth checking again, not treating as permanent.

A lot of subscription teams treat this as one flat global rule. It's actually a different number in nearly every country Apple lists.

## What Apple's own table actually confirms

Per Apple's own words, a price increase above the listed threshold "results in a request for subscribers to consent to the new price." Stay below it, and the increase goes through. No extra step.

| Country | Currency | Non-annual threshold | Annual threshold |
|---|---|---|---|
| United States | USD | 5 | 50 |
| India | INR | 500 | 5,000 |
| Australia | AUD | 8 | 80 |
| Canada | CAD | 7 | 70 |
| Japan | JPY | 800 | 8,000 |
| Brazil | BRL | 40 | 400 |
| Austria, Germany, Poland, South Korea | Local | Consent required | Consent required |

## Why treating this as one global number actually backfires

A team planning a price change often starts from the US figure. They assume it roughly applies everywhere, maybe loosely adjusted for currency. Apple's own table shows that's wrong. India's threshold isn't a converted $5. It's its own number, 500 INR, set on its own. Four markets skip the threshold model entirely. Any increase there needs consent, no matter how small. A rollout planned off one number risks a surprise consent flow in several markets at once, right as the price change goes live.

> **Real-world scenario:** A subscription app planned a global price bump. They felt safe, sure their increase sat under the US $5 no-consent line everywhere. They hadn't checked Apple's own per-country table first. In Germany, the same increase triggered a consent request anyway. Germany requires consent for any increase, full stop. Subscribers there saw a prompt the team never planned for, right alongside their bigger launch. Checking the table first would have let them prepare support messaging for that one market. Instead of fielding confused tickets after the fact.

## What's genuinely unclear here

Apple's own table doesn't state a frequency limit. How often a no-consent increase can happen per year isn't on this page. Some secondary reporting claims once a year. That's not stated here, in Apple's own words. Treat that claim as unconfirmed. Don't build a repeat-increase schedule around a number you haven't verified yourself.

## What to actually do about it

1. **Check Apple's own per-country table before planning any price change.** Don't extend the US number to other markets by assumption.
2. **Flag the four consent-required markets specifically in your rollout plan.** Austria, Germany, Poland, and South Korea need a consent flow regardless of how small your increase is.
3. **Re-check the table close to your actual launch date.** Apple's own words say these numbers move with tax and exchange rates, not just once a year.
4. **Don't rely on an unconfirmed once-per-year rule for your planning.** Verify that specific claim directly before building a repeat-increase schedule around it.

[AppRankr's Rank Tracker](/rank) tracks how a pricing change actually lands on your visibility and reviews, worth watching closely around any rollout like this.
