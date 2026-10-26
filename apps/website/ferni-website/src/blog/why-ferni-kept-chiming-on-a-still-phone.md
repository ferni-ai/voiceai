---
title: "Why Ferni Kept Chiming on a Still Phone"
excerpt: "How a small math mistake turned a hidden shake surprise into a constant chime on phone screens, and how we fixed it in PR #2102."
author: "The Ferni Team"
authorInitials: "FE"
authorColor: "#4a6741"
date: 2026-10-26
category: "Building in Public"
image: "why-ferni-kept-chiming-on-a-still-phone.png"
imageAlt: "A green branch features hanging peach, yellow, and orange buds and a ringing bell flower"
readTime: 3
series: "building-in-public"
seriesPart: 11
sources:
  - "PR #2464: fix(web): one lid colour rule, the page colour, so ios can't copy a dead one (https://github.com/ferni-ai/voiceai/pull/2464)"
  - "PR #2443: fix(website): keep night mode readable on a dark os (https://github.com/ferni-ai/voiceai/pull/2443)"
  - "PR #2358: fix(web): raise the touch target floor to 48px on coarse pointers (https://github.com/ferni-ai/voiceai/pull/2358)"
  - "PR #2155: fix(web): clear serious axe findings in menu panels, calm page-load retries (https://github.com/ferni-ai/voiceai/pull/2155)"
  - "PR #2157: fix(web): title each panel with its menu name, drop em dashes from copy (https://github.com/ferni-ai/voiceai/pull/2157)"
  - "PR #2136: fix(web): keep call buttons on screen, show the year's empty states (https://github.com/ferni-ai/voiceai/pull/2136)"
  - "PR #2202: fix(web): back closes the open panel instead of leaving the app (https://github.com/ferni-ai/voiceai/pull/2202)"
  - "PR #1983: fix(calendar): show google calendar as connected when it is (https://github.com/ferni-ai/voiceai/pull/1983)"
  - "PR #1979: fix(web): reduce motion shows the connect button, call buttons meet aa (https://github.com/ferni-ai/voiceai/pull/1979)"
  - "PR #2010: feat(blog): feeds, a developers sitemap, share cards and indexnow keys (https://github.com/ferni-ai/voiceai/pull/2010)"
  - "PR #2139: fix(web): the app shell fits a notched phone and scrolls (https://github.com/ferni-ai/voiceai/pull/2139)"
  - "PR #2109: fix(web): answer slow menu taps at once and make menu panels real dialogs (https://github.com/ferni-ai/voiceai/pull/2109)"
  - "PR #2110: fix(web): center the journey pill heart and stop it turning sideways (https://github.com/ferni-ai/voiceai/pull/2110)"
  - "PR #2102: fix(web): stop the shake easter egg chiming on a phone held still (https://github.com/ferni-ai/voiceai/pull/2102)"
  - "PR #2034: fix(web): second batch of audit contrast fixes, plain-text language tags (https://github.com/ferni-ai/voiceai/pull/2034)"
  - "PR #1176: fix(website): stop presenting invented stories and stats as real in the blog (https://github.com/ferni-ai/voiceai/pull/1176)"
---

Building in public means sharing the quiet fixes alongside the big steps. When we make a mistake, we want to talk about it openly. Today we are looking back at a bug on phone screens that turned a small hidden surprise into a constant noise, and how we resolved it in pull request [#2102](https://github.com/ferni-ai/voiceai/pull/2102).

We built a subtle shake surprise into Ferni. If you shake your phone, the app plays a small celebration chime and gives a brief vibration. It was meant to be a cheerful moment. But on phones, including the Android web app and iOS once motion access is allowed, things went wrong. Instead of waiting for a real shake, the app started playing the celebrate chime about every 2 s and vibrating about every 500 ms for the whole session. It even kept chiming and vibrating during calls. Ferni's owner noticed this constant chime and brought it to the team so we could find out what went wrong.

When we looked at the code, we realized we had made a simple math mistake. The code added up movement along three directions, but the measurement it used included gravity. Gravity is pulling on a phone all the time. On a phone lying flat, gravity measures 9.8. If a phone is tilted evenly across all three directions, gravity alone can add up to 17.0.

That meant normal handling registered as a sudden movement. A phone held still at a normal angle, like 45° pitch and 20° roll, added up to 15.8. Our code was set to trigger a shake whenever the total reached 15 m/s². Because 15.8 is larger than 15, every single motion update looked like a phone shake. The phone was sitting quietly in a hand, but the app thought it was being shaken continuously. To make matters worse, the sound director that would have gated the chime was turned off in production.

We fixed this in [#2102](https://github.com/ferni-ai/voiceai/pull/2102) by building a dedicated shake detector. The new detector measures only the phone's own movement, leaving gravity out of the total. If a phone cannot separate gravity from its movement, the code measures how far the total force moves away from 1 g.

We also set strict rules so quiet moments stay quiet. Now, a shake requires 5 hits over 12 m/s² within 2 s. The app reports a shake at most once per 30 s, so continuous movement will not flood your phone with sound. We also made sure the surprise never runs while a call is active.

We ran full tests to confirm the fix. We tested a phone held still at four different angles for 60 s, and it produced 0 chimes and 0 vibrations. In a browser simulation with a Pixel 7 profile held still for 20 s at 60 Hz motion events, the old code triggered 9 chimes with 36 notes and 35 vibrations at 45° pitch and 20° roll, and 9 chimes with 36 notes and 36 vibrations at 30° pitch and 30° roll. Under the new code, both tests stayed at 0. Moving the phone continuously now triggers at most 1 chime per cooldown period, and shaking during a call plays 0 chimes.

Ferni is new and has essentially no people using it yet. There are no quotes, testimonials, or usage numbers to share, but every detail matters as we get ready. Changes run on a development agent first and reach production later. We hope this small fix makes Ferni feel much more peaceful on your phone.
