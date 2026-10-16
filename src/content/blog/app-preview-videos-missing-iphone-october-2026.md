---
title: "App Preview Videos Went Missing on iPhone. Here's What Developers Found"
description: "Starting around October 5, 2026, App Preview videos stopped showing on iPhone for some apps, and Apple confirmed it's investigating. Here's what developers documented, and how to check your own listing."
theme: "App Store"
keyword: "App Preview videos missing iPhone"
image: "/blog/og/app-preview-videos-missing-iphone-october-2026.png"
publishDate: 2026-10-16
faqs:
  - question: "What actually broke with App Preview videos?"
    answer: "Per developer reports on Apple's own forum, starting around October 5, 2026, iPhone pages on the App Store stopped serving the App Preview video. iPad pages kept showing it. The asset itself was still listed in App Store Connect, with a working video link from the API. It just wasn't being served on iPhone."
  - question: "Did Apple confirm this was a real bug?"
    answer: "Yes. Per the developer forum thread, an App Store Connect engineer from Apple replied, thanked reporters, and said the team was looking into it. Several Feedback Assistant reports were filed, including FB25109947, plus a Developer Support case."
  - question: "Is this fixed now?"
    answer: "Only partly, as of the latest posts developers shared. Some apps, including Candy Crush Saga and Wordscapes, had their iPhone preview return by October 13. At least one reporter's app still showed no iPhone preview at that point. Check your own listing directly rather than assume it's fixed."
---

**Key points:**
- Developers on [Apple's own forum](https://developer.apple.com/forums/thread/850189) reported App Preview videos missing from iPhone starting around October 5, 2026. iPad pages kept showing them.
- An Apple engineer confirmed the team was looking into it, per replies in that same thread.
- The timing lines up with Apple's own Asset Library and creative-assets launch, also dated October 5, 2026.
- As of October 13, the fix was only partial. Some apps recovered. Others, including one tied to a specific display-size asset setup, reportedly had not.

A video live on your listing one day can vanish the next. Nothing in App Store Connect tells you why. That's what a group of developers documented this month.

## What developers actually found

Per the forum thread, the break was specific. iPhone pages stopped showing the App Preview video stream. iPad pages for the same apps kept working fine. Developers checked the raw page code for both views. The video reference was simply gone on iPhone. Not broken. Not erroring. Just absent.

| What developers checked | What they found |
|---|---|
| App Store Connect asset status | Still listed as complete |
| App Store Connect API | Returned a working video link |
| iPhone page source | Video reference missing |
| iPad page source | Video reference present and working |
| In-App Event videos | Unaffected, played fine |

This wasn't a broken upload or a rejected asset. The video existed. It was approved. The API could reach it. iPhone visitors just never saw it.

## Why this is worth a check even if nothing looks wrong

Per the forum thread, one developer checked the Internet Archive. A snapshot of a major app's iPhone page showed the video present through October 5, then gone after. That's the same day Apple's own Asset Library and creative-assets feature went live. Apple hasn't confirmed the two are linked. But the dates sit close enough that it's worth checking your own listing, not just assuming either way.

> **Real-world scenario:** A developer read about the forum thread and checked their own iPhone product page, assuming their app was fine since they hadn't touched anything. The page loaded with no video. Just a static screenshot where the preview used to autoplay. App Store Connect still listed the preview as complete. Nothing in the developer's own activity explained the gap. They filed a Feedback Assistant report, adding one more data point for Apple. Checking back a few days later, it had come back.

## What to actually do about it

1. **Check your own iPhone product page directly, not just App Store Connect.** Per the forum thread, an asset can read as complete in Connect while still missing live on iPhone.
2. **Compare your iPad and iPhone pages side by side.** A video on one and not the other matches exactly what developers documented.
3. **File a Feedback Assistant report if you're hit by this.** Several developers did, including FB25109947, which Apple's own engineer acknowledged in the thread.
4. **Don't assume a fix reached everyone yet.** As of October 13, recovery was uneven. One app relying on an asset shared across display sizes reportedly stayed affected after others came back.

[AppRankr's ASO Inspector](/aso) checks your live listing as it actually appears, a useful way to catch a gap like this before a visitor does.
