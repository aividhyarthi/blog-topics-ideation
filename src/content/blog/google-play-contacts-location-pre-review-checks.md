---
title: "Google Play's Contacts and Location Permission Checks Start October 27"
description: "Play Console starts warning developers about contacts and location permission issues on October 27, 2026, well before the January 27, 2027 enforcement date. Here's exactly what triggers a flag."
theme: "Google Play"
keyword: "Google Play contacts location permission checks"
image: "/blog/og/google-play-contacts-location-pre-review-checks.png"
publishDate: 2026-10-01
faqs:
  - question: "When do Google Play's new permission pre-review checks start?"
    answer: "October 27, 2026, per Google's own Play Console documentation. These are warnings shown before you submit, not enforcement yet. Full enforcement of the underlying Contacts and Location Permissions policies starts January 27, 2027."
  - question: "What actually triggers a contacts permission warning?"
    answer: "Requesting READ_CONTACTS when the Android Contact Picker would work instead. Google's own policy says apps targeting Android 17 (API level 37) or later may only request broad contacts access when the Contact Picker genuinely isn't enough for a real, core feature."
  - question: "What changed for location permissions specifically?"
    answer: "Apps using precise location for a quick, one-off action, not continuous tracking, are expected to implement Android's location button using the onlyForLocationButton manifest flag, per Google's own documentation. A related change also removes geofencing as an approved foreground service use case, pointing developers to the Geofence API instead."
---

**Key points:**
- Google Play's checks for contacts and location issues start October 27, 2026. Per Google's own Play Console pages.
- These are warnings before you submit. Not real enforcement yet. That lands January 27, 2027. Real time to fix issues first.
- A contacts flag fires when an app asks for READ_CONTACTS where the Android Contact Picker would work instead.
- A related change drops geofencing as an approved foreground service use. Google points developers to the Geofence API instead.

A rule announced back in April 2026 now has real, firm dates. Warnings start October 27. Real enforcement follows January 27, 2027.

## The two dates that actually matter

Google draws a clear line between warning and enforcement. Play Console starts flagging contacts and location issues on October 27, 2026. Nothing gets blocked yet at that point. Full enforcement starts January 27, 2027. Exactly three months later.

| Date | What happens |
|---|---|
| October 27, 2026 | Play Console starts warning about flagged issues before you submit |
| January 27, 2027 | Real enforcement of the rules begins |

## What actually trips the contacts check

The rule centers on the Android Contact Picker. A standard, privacy-friendly way to let a user pick specific contacts. Without handing an app broad access to the whole address book. Per Google's own rule, an app targeting Android 17 (API level 37) or later may only ask for the broader READ_CONTACTS permission when the Picker genuinely can't cover a real, core feature. Using broad access out of habit, when the Picker would do the job fine, is exactly what the new check catches.

## What changed for location permissions

A related rule covers one-off, precise location requests. Say an app grabs precise location for a quick, single action. Not ongoing tracking. Google's own guidance describes using Android's location button instead. Set with the `onlyForLocationButton` flag. Not standing location access. Alongside this, Google is dropping geofencing as an approved foreground service use case. Apps using it that way now need the dedicated Geofence API instead.

> **Real-world scenario:** A team's app asked for broad contacts access just to let a user invite one friend from their address book. A single, rare action. Checking Google's own guidance ahead of the October 27 checks, they saw the Contact Picker covered that exact case. No need for READ_CONTACTS at all. They switched well before the warning stage even started. Their app had nothing flagged once the checks went live.

## What to actually do about it

1. **Check your contacts permission now, not in January.** If the Contact Picker covers your real use case, switch before the October 27 warnings start flagging it.
2. **Check any quick, one-off location requests against the new button rule.** The `onlyForLocationButton` flag is the exact fix Google names for this pattern.
3. **Move off geofencing as a foreground service use now.** The Geofence API is the named swap. This change isn't tied to the date above.
4. **Treat the October 27 warnings as a free check.** Three months before real enforcement is real time. Use it instead of waiting for a warning to force the issue.

[AppRankr's ASO Inspector](/aso) reviews your current listing and permissions posture, a useful gut check before a policy deadline like this one catches you flat-footed.
