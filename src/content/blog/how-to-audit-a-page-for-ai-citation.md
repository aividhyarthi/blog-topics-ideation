---
title: "How to Audit a Page for AI Citation Readiness (Free AEO Audit Tool)"
description: "A step-by-step walkthrough of checking whether ChatGPT, Perplexity, Claude and Google AI can actually read and cite your page, using a free AEO audit tool."
publishDate: 2026-09-09
author: "AI Page Audit Team"
tags: ["AEO", "Guide"]
faqs:
  - q: "Is this free?"
    a: "Yes — every account gets one free check. After that, buy a one-time credit pack for occasional use, or subscribe to Pro for volume. See /pricing for current rates."
  - q: "Do I need to install anything on my site?"
    a: "No. Paste a URL and the tool fetches it the same way the crawlers do — nothing to install, no tag to add, no waiting for a crawl."
  - q: "Can I audit a competitor's page, or does it have to be my own site?"
    a: "Either. The tool fetches any public URL the same way a crawler would; you don't need access to the site itself, just the URL."
---

If you want to know whether ChatGPT, Perplexity, Claude or Google AI can actually read and cite a page, the only reliable way to find out is to fetch it the way each of those crawlers does and look at what comes back — not to guess from an SEO score, which is measuring something different. Here's the actual process, using [AI Page Audit](/) as the AEO audit tool doing the fetching.

## Step 1: Check raw crawler access first

Before anything else, confirm the crawlers that matter can even reach the page and receive meaningful content. Run a [free LLM Access Check](/check):

1. Paste the page URL.
2. The tool fetches it as Googlebot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Bingbot — each with its real user-agent — both desktop and mobile.
3. Read the element-by-element breakdown: header, navigation, main content, footer, images, structured data, each checked separately.

The single most common failure here isn't a robots.txt block — it's **JavaScript-rendered content**. Google renders your JavaScript before indexing. ChatGPT, Perplexity and Claude's crawlers read the raw HTML response only. If your main content, your FAQ answers, or your product specs load client-side, Google sees a fully rendered page and every AI crawler sees an near-empty shell — from the same URL, at the same time. This single gap is worth checking before anything else, because no amount of content-quality work fixes it.

## Step 2: Run the full weighted audit

Once you know the crawlers can actually receive the content, run a [Full AEO Audit](/audit) to see how well that content is structured for citation. This scores the page against a [published checklist](/checklist) across six pillars — answerability, entity clarity, attribution and trust, structural readability, query matchability, and freshness — and returns:

- An overall score and letter grade, weighted by content category (a health page is weighted toward attribution/trust; breaking news toward freshness).
- A ranked list of fixes, each with a plain-English reason it affects AI citation and a concrete fix — not "structured data: 45/100" with no idea what to change.
- A desktop-vs-mobile and per-engine breakdown, so you can check a specific engine (ChatGPT, Perplexity, Claude, Google AI) on demand.

## Step 3: Fix in order of impact, not in the order you found them

The ranked fix list exists because not every gap matters equally. A missing datePublished on a breaking-news page is often more decisive than a missing alt attribute on a decorative image. Work down the list in the order given rather than picking off whichever fix looks easiest.

Common high-impact fixes, in roughly the order they tend to matter:

1. **Move JavaScript-rendered content into the initial HTML response** (SSR or prerendering) if the access check flagged it — this is the one gap that makes every other fix pointless until it's resolved.
2. **Add or complete schema.org markup** for the actual content type — Article, Product, Review, FAQPage, HowTo — with real values, not placeholder text.
3. **Name a real author and cite real sources**, not "our team" or "experts say."
4. **Add datePublished and dateModified**, both in schema and visibly on the page, and keep them current.
5. **State the direct answer early**, before the supporting detail — a model extracting an answer favors the page that doesn't make it scroll.

## Step 4: Re-check after you ship the fixes

Because everything above is checkable from the outside, you can verify a fix actually landed the same way you found the gap — re-run the check against the live URL rather than trusting that a deploy "should have" fixed it. If you're signed in, your [saved reports](/dashboard) track score history for the same URL over time, so you can see the actual delta, not just a new number with no context.

See also: [What Is AEO?](/blog/what-is-aeo) and [AEO vs SEO vs GEO](/blog/aeo-vs-seo-vs-geo) for the concepts behind why each of these checks exists.
