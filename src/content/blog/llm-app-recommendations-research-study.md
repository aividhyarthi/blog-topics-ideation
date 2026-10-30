---
title: "A New Study Found Only 6 of 16 LLM App-Ranking Criteria Match ASO"
description: "An academic study of how general-purpose LLMs recommend mobile apps found 16 real ranking criteria at play, and just 6 overlap with traditional ASO metrics. Here's what that means if you're optimizing for AI discovery."
theme: "Fundamentals"
keyword: "LLM app recommendations research"
image: "/blog/og/llm-app-recommendations-research-study.png"
publishDate: 2026-10-30
faqs:
  - question: "Did this study test real AI assistants recommending real apps?"
    answer: "Yes, per the paper's own description, it's an empirical study of how general-purpose LLMs generate, justify, and rank app recommendations, covering both proprietary and open-source models, not just one assistant."
  - question: "What's the single most useful finding here?"
    answer: "That only 6 of the 16 ranking criteria the researchers identified overlap with traditional App Store Optimization metrics. Most of what actually drives an LLM's app recommendation isn't something standard ASO tracking covers at all."
  - question: "Were different AI models consistent with each other?"
    answer: "No. Per the paper, agreement between different LLMs' recommendations varied widely across model pairs, and one model, Gemini, showed noticeably more variability across its own repeated runs than others like GPT-4o, Claude, or Mistral."
---

**Key points:**
- An academic paper, "Understanding Mobile App Recommendation Dynamics in General-Purpose LLMs," studied how AI assistants actually pick and explain app suggestions.
- Researchers filtered over 5,000 raw reasons down to 16 real, repeatable ones. Only 6 match traditional ASO metrics.
- Different AI models often disagreed with each other. Gemini also showed more run-to-run inconsistency than GPT-4o, Claude, or Mistral.
- I could not reach the paper's own full text directly, so these figures come from its abstract and secondary summaries, not a full read.

Most ASO advice for "getting found by ChatGPT" assumes one thing. That the same signals moving a store ranking also move an AI pick. A new study says that's true for barely a third of what actually matters.

## What the study actually found

Researchers filtered over 5,000 raw reasons behind real LLM app picks. They narrowed that down to 16 real, repeatable ones. Of those 16, only 6 match what a normal ASO process tracks. That leaves 10 factors behind an AI's pick that most ASO work never touches at all.

| Detail | What the study found |
|---|---|
| Raw reasons collected | Over 5,000 |
| Final, repeatable criteria | 16 |
| Criteria matching ASO | 6 |
| Criteria outside ASO | 10 |

## Why the disagreement between models matters too

The study didn't just count criteria. It checked whether models agreed with each other. And with themselves. They didn't, not consistently. Agreement between different models varied a lot, pair by pair. One model, Gemini, showed more variation across its own repeat runs than GPT-4o, Claude, or Mistral. That's a real problem if you want one stable target to optimize toward. Winning over one model's logic doesn't mean winning over another's.

> **Real-world scenario:** A productivity app's team had been tracking their name in ChatGPT's answers the same way they tracked App Store rank. One check, one assistant, called it "AI visibility." Reading about this study, they saw the gap. That single check told them almost nothing about a different model. Or even the same model, asked again. They started sampling across several assistants instead. Treating consistency itself as a signal. Not just a single mention.

## What this means for the "ASO equals AEO" assumption

A lot of current advice treats App Store rank and AI recommendation as the same work. This study's own numbers argue against that. Only 6 of 16 real criteria overlap. Most of what actually moves an LLM's pick sits outside normal keyword-and-metadata work. That doesn't make ASO worthless here. It makes it incomplete. By the study's own math, for most of what drives the real result.

## What to actually do about it

1. **Don't assume your ASO work already covers AI discovery.** By this study's own count, most of what matters for an LLM pick sits outside that overlap.
2. **Check your standing across more than one assistant.** Model disagreement was real here. One check tells you about one model. Not "AI visibility" as a whole.
3. **Treat one good or bad AI mention as noise, not proof.** The study found real inconsistency, even within the same model, run twice.
4. **Watch for follow-up research on the other 10 criteria.** This study maps the gap. Closing it is still open work.

[AppRankr's ASO Inspector](/aso) reviews your current listing against known ranking signals, a useful baseline while the AI-discovery side of this picture is still being mapped out.
