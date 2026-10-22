---
title: "Apple HomeView Can Show Your Widget by Default. Here's the Exact Legal Text"
description: "Apple's own Developer Program License Agreement confirms iOS widgets may appear on the new Apple HomeView device automatically. Here's what Section 6.4.1 actually says, and your one stated control."
theme: "App Store"
keyword: "Apple HomeView widgets"
image: "/blog/og/apple-homeview-widgets-carplay-developer-agreement.png"
publishDate: 2026-10-22
faqs:
  - question: "Does my widget show up on Apple HomeView automatically?"
    answer: "Per Apple's own license agreement, Section 6.4.1 says your widget 'may be made available on CarPlay and Apple HomeView.' No opt-in step is described. Your one named control is disfavoring it yourself with the disfavoredLocations function."
  - question: "What counts as an unsuitable widget, per Apple's own text?"
    answer: "Apple names two direct examples. A widget that needs a lot of user input while driving. A widget that needs the iPhone unlocked to use. Those are named examples, not a full list."
  - question: "Can Apple remove my widget from HomeView even if I don't?"
    answer: "Yes. Per Apple's own text, Apple can disfavor your widget on its own if it decides the widget isn't fit for CarPlay. That's a call Apple can make by itself, apart from anything you do."
---

**Key points:**
- Apple's own [Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/), Section 6.4.1, confirms iOS widgets may show up on the new Apple HomeView device and on CarPlay by default.
- No opt-in is described. Your named control is actively turning your own widget off with the disfavoredLocations function, if it's a bad fit.
- Apple can also turn your widget off on its own, apart from anything you do.
- A separate rule, Section 6.4.2, covers full CarPlay-entitled apps showing up on HomeView through a paired iPhone.

A widget built for a lock screen can now land on a $299 device sitting on someone's kitchen counter. Apple's own legal text confirms it. The default runs the opposite way most developers would guess.

## The exact text, from Apple's own agreement

Per Apple's own license agreement:

> **6.4.1 iOS Application Widgets on CarPlay and Apple HomeView**
> You agree that Your iOS Application widget may be made available on CarPlay and Apple HomeView. Furthermore, You are responsible for determining whether Your iOS Application widget is functional and suitable to use for CarPlay, and for using the disfavoredLocations function to disfavor Your iOS Application widget if it is not. For example, iOS Application widgets that are not functional or suitable include those that require extensive user interaction while driving, or that require the iPhone to be unlocked to be used. Apple reserves the right to disfavor Your iOS Application widget if Apple determines it is not functional or suitable for CarPlay.

| Detail | What Apple's own text confirms |
|---|---|
| Default state | On, unless you act to turn it off |
| Your control | The disfavoredLocations function |
| Apple's control | Can turn off your widget on its own |
| Named bad-fit examples | Lots of driving input; needs an unlocked phone |

## Why "turn it off yourself" beats "ask first"

Most new surfaces, a developer gets to choose into. Not this one. Per Apple's own words, joining the developer program already means your widget can show up here. Noticing a bad fit is your job. So is flagging it.

Picture a widget built around one idea. That idea can break on a shared home screen. It worked fine on just one person's lock screen. A widget showing private data at a glance is fine there. It acts very differently once a whole room can see it.

> **Real-world scenario:** A habit app's widget showed streaks and personal goals right on the lock screen. Only the phone's owner ever saw it, every time. Reading Apple's own 6.4.1 text, the developer checked their setup. Nothing in it turned that widget off for CarPlay or HomeView. On a shared home display, the same streak data would show to anyone walking by. Not just their one user. So they used the disfavoredLocations function. That kept the widget off both surfaces. A second, less personal widget from the same app stayed on, since it had nothing to hide.

## What Section 6.4.2 covers separately

Per Apple's own text, a different rule covers full apps, not widgets. Section 6.4.2 says an app with a CarPlay entitlement, in a category Apple names, gets made available on HomeView too. That happens while it runs on a paired iPhone or iPad. This is a separate path from the widget rule above. It runs off CarPlay entitlement categories. Not widget fit.

## What to actually do about it

1. **Check every widget you ship for a shared-screen problem.** Per Apple's own text, showing up is the default. Staying hidden is not.
2. **Use disfavoredLocations on purpose, not after the fact.** Apple's own named examples are a floor, not the whole list. Heavy driving input. An unlocked phone needed.
3. **Don't assume Apple's own call matches yours.** Apple can turn off your widget on its own too, per Apple's own text. That cuts both ways. It's a backstop. Not something only you control.
4. **Check your CarPlay entitlement category if you have one.** Per Apple's own 6.4.2 text, that's the separate path full apps take onto HomeView.

[AppRankr's ASO Inspector](/aso) reviews your current listing and assets, a good habit to pair with checking how your app's surfaces, widgets included, actually show up everywhere Apple now places them.
