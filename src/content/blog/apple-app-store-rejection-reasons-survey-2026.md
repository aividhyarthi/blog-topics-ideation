---
title: "What's Actually Getting Apps Rejected on the App Store, by the Numbers"
description: "A 2026 survey of 404 iOS developers found most rejections trace back to just two guidelines. Here's the actual breakdown, clearly labeled as survey data, not an Apple-confirmed stat."
theme: "App Store"
keyword: "App Store rejection reasons survey"
image: "/blog/og/apple-app-store-rejection-reasons-survey-2026.png"
publishDate: 2026-10-02
faqs:
  - question: "What's the single biggest reason iOS apps get rejected?"
    answer: "A June 2026 survey of 404 iOS developers by Rent-A-Mac found Guideline 2.1, app completeness and metadata, behind 34% of reported rejections. That's a reported survey figure, not a number Apple itself has published."
  - question: "How many developers actually deal with a rejection in a given year?"
    answer: "The same survey found 63% of respondents hit at least one App Store rejection in the past year. Treat that as this specific survey's finding, not a universal rate every developer should expect."
  - question: "What's the second most common rejection reason?"
    answer: "Guideline 5.1.1, privacy or data issues, accounted for 21% of reported rejections in the same survey. Together with Guideline 2.1, that's 55% of rejections tracing back to just two guidelines."
---

**Key points:**
- A June 2026 survey of 404 iOS developers, by Rent-A-Mac, found 63% hit at least one App Store rejection in the past year. A reported figure. Not an Apple-published rate.
- Guideline 2.1, app completeness and metadata, was behind 34% of reported rejections. The single biggest named cause.
- Guideline 5.1.1, privacy or data issues, came in second at 21%. Together, these two cover 55% of reported rejections.
- The remaining 45% spread across spam, copycat concerns, design issues, and other causes. Per the same survey.

Most developers assume a rejection means something unusual went wrong. A 2026 survey says otherwise. More than half trace back to just two guidelines.

## The actual breakdown

A June 2026 survey of 404 iOS developers, by Rent-A-Mac, found 63% had hit at least one App Store rejection in the past year. This is one sample's data. Not an official rate Apple has shared anywhere. Within that group, two rules covered more than half of all reported rejections.

| Guideline | What it covers | Share of reported rejections |
|---|---|---|
| 2.1 | App completeness and metadata | 34% |
| 5.1.1 | Privacy or data issues | 21% |
| Everything else | Spam, copycat concerns, design, other | 45% |

## Why these two guidelines dominate

Rule 2.1 covers the basics most teams assume they've already handled. A broken feature. Missing content. Placeholder text. Listing text that doesn't match what the app actually does. It's a basic check, not a judgment on the app's quality or category. This survey's finding suggests a lot of rejections aren't about a tricky feature or gray-area content. They're about something half-done or mismatched at submission time.

Rule 5.1.1 covers privacy and data. A missing or wrong privacy note. A permission asked for with no clear reason. Data use that doesn't match what's declared. Together with rule 2.1, these two cover the kind of rejection a careful check before you submit can often catch first.

> **Real-world scenario:** A small team shipped an update with a new data export feature. They'd updated the privacy note for most of the new data use, but missed one data type the export touched. The app got rejected under rule 5.1.1 for the mismatch. Reading about this survey after, they built a simple checklist. It checks every new feature's real data use against the privacy note before they submit. No more relying on memory to catch every change.

## What to actually do about it

1. **Treat rule 2.1 as a pre-submission checklist item, not an afterthought.** Test every feature end to end. Check that your listing text matches what the app does right now.
2. **Check privacy notes against real data use on every update.** A new feature touching data not yet in your note is a real rule 5.1.1 risk, per this survey.
3. **Treat this survey as a pattern to watch, not a guarantee.** It's one sample of 404 developers. Not an Apple-confirmed rate for everyone.
4. **Don't assume a rejection means your app idea is the problem.** This survey's own numbers point to half-done work and bad disclosures. Not the idea itself.

[AppRankr's ASO Inspector](/aso) reviews your live listing against what your app actually does, a useful habit to build alongside your own pre-submission checklist.
