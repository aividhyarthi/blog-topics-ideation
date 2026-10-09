---
title: "Android's AppFunctions Let Gemini Call Code Inside Your App Directly"
description: "Google's own AppFunctions platform lets an Android app expose real functions that Gemini can discover and run, skipping screen-by-screen navigation entirely. Here's what it actually requires, and how far the rollout has reached."
theme: "Google Play"
keyword: "Android AppFunctions Gemini"
image: "/blog/og/android-appfunctions-gemini-call-your-app.png"
publishDate: 2026-10-09
faqs:
  - question: "What is Android AppFunctions?"
    answer: "Per Google's own documentation, it's a platform API plus a Jetpack library. It lets an app act as an on-device MCP server. Your app exposes real functions. Gemini and other authorized callers can discover and run them directly, instead of a user tapping through your app's own screens."
  - question: "Can any app use AppFunctions with Gemini today?"
    answer: "Not yet. Per Google's own page, Gemini integration is in a private preview with trusted testers as of May 2026. The API itself is an experimental preview, subject to change. Developers can build and register functions now, through an Early Access Program, ahead of a public rollout."
  - question: "What does a developer actually have to do to expose a function?"
    answer: "Per Google's own documentation, annotate a function with @AppFunction. Document it with KDoc describing what it does and what its parameters mean. Declare any custom parameter or return type with @AppFunctionSerializable. Requires Android 16 (API 36) or higher."
---

**Key points:**
- Google's own [AppFunctions overview](https://developer.android.com/ai/appfunctions) describes a platform API. An app can expose real functions that Gemini and other agents call directly, not just navigate to on screen.
- A function is declared with the `@AppFunction` annotation. It's documented with KDoc the agent reads to know when and how to call it.
- Requires Android 16 (API 36) or higher. Gemini's own integration is in private preview with trusted testers as of May 2026.
- The API itself is an experimental preview. Google's own page says the surface is subject to change before a public rollout.

An app's UI has always been the only way in. Google's own AppFunctions platform gives Gemini a second path. Calling a function inside the app directly.

## What this actually lets an agent do

Per Google's own documentation, AppFunctions are the mobile version of MCP tools. That's the same link that connects an AI agent to a tool on a server. Here it just runs locally on the device. No network round trip needed. An app hands over its own functions. A caller with the right access, Gemini named by name, can find those functions and run them to finish a real task. Google's own examples: build a task from a plain-text request. Build a playlist from a query. Pull ingredients out of an email and add them to a shopping list.

| Piece | What it requires, per Google's own docs |
|---|---|
| Declaring a function | `@AppFunction` annotation, described by KDoc |
| Parameter/return types | `@AppFunctionSerializable`, also KDoc-described |
| Platform | Android 16 (API 36) or higher |
| Caller permission | `EXECUTE_APP_FUNCTIONS` |

## Why KDoc is doing real work here

This isn't a config file listing what a function does. Per Google's own examples, the comment above a function IS what the agent reads. It decides whether and how to call it from that text alone. Down to each single part explained in plain words. A badly written comment makes a function invisible to an agent. The code itself can work fine and still never get picked. Simply because nothing explains it well enough.

Google's own tooling treats this as real work. A listed "AppFunctions agent skill" on GitHub covers comment quality as its own separate step, apart from writing the function itself. Writing something an agent can actually find and use right is treated as its own true skill. Not an afterthought once the code compiles.

> **Real-world scenario:** A team building a task-management app read Google's own AppFunctions page. They wrote a `createTask` function with a one-line KDoc comment: "creates a task." Testing it through the ADB command Google's own docs mention for checking registration, they found Gemini could see the function existed. But it kept failing to call it correctly, missing which parameter was the due date versus the location. They rewrote the KDoc to describe each parameter on its own, matching Google's own example format. That fixed it. The function itself never changed. Only its documentation did.

## What to actually do about it

1. **Treat this as early, not ready for every app yet.** Google's own page calls it an experimental preview. Gemini's own integration is still a private, trusted-tester preview as of May 2026.
2. **Register interest in the Early Access Program if agent-callable actions matter to your app.** Google's own page says it emails selected apps rather than opening broadly yet.
3. **Write KDoc like it's user-facing copy, not an internal comment.** It's the actual interface an agent reads to decide whether your function is the right tool.
4. **Check registration with the ADB command Google's own docs describe.** Don't just assume a function is discoverable because it compiled cleanly.

[AppRankr's ASO Inspector](/aso) reviews your current listing today, a useful baseline to compare against once agent-driven discovery becomes a real second channel alongside store search.
