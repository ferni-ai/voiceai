---
title: "How We've Been Building Mood Weighting and Voice Motion"
excerpt: "A look at how we've been building recency-weighted wellbeing estimates and natural voice movement for Ferni."
author: "The Ferni Team"
authorInitials: "FE"
authorColor: "#4a6741"
date: 2026-11-09
category: "Product"
image: "how-weve-been-building-mood-weighting-and-voice-motion.png"
imageAlt: "A stylized windswept tree features green outlines and soft orange and brown watercolor washes on a cream background"
readTime: 3
sources:
  - "PR #2495: feat(understanding): eval runner for the turn reading on the golden set (https://github.com/ferni-ai/voiceai/pull/2495)"
  - "PR #2043: feat(waitlist): ferni waitlist wave, with a one-time wave 0 (https://github.com/ferni-ai/voiceai/pull/2043)"
  - "PR #2052: feat(wellbeing): panel shows a recency-weighted estimate per field (https://github.com/ferni-ai/voiceai/pull/2052)"
  - "PR #2454: feat(tool-retrieval): track tool choice nightly against a 78% floor on a frozen set (https://github.com/ferni-ai/voiceai/pull/2454)"
  - "PR #2655: feat(ios): train 12, haptics, consent, the room and home (https://github.com/ferni-ai/voiceai/pull/2655)"
  - "PR #2542: feat(ios): one canvas avatar on one clock, honest about reduce motion (https://github.com/ferni-ai/voiceai/pull/2542)"
  - "PR #2450: feat(voice-eval): one release check that proves the build and compares it paired (https://github.com/ferni-ai/voiceai/pull/2450)"
  - "PR #2582: feat(tokens): semantic surfaces, inverse context, shadows (https://github.com/ferni-ai/voiceai/pull/2582)"
  - "PR #2362: feat(blog): posts publish only on the owner's blog-approved label (https://github.com/ferni-ai/voiceai/pull/2362)"
  - "PR #2510: feat(ios): ferni's mouth follows the real voice level (https://github.com/ferni-ai/voiceai/pull/2510)"
  - "PR #2488: feat(understanding): turn reading schema v0.1 and its model reader (https://github.com/ferni-ai/voiceai/pull/2488)"
  - "PR #2455: feat(voice-eval): realistic caller mode with turn-taking realism metrics (https://github.com/ferni-ai/voiceai/pull/2455)"
  - "PR #2451: feat(config): flags:migrate re-applies an open branch's flag edits after a move (https://github.com/ferni-ai/voiceai/pull/2451)"
  - "PR #2448: feat(voice-eval): schedule the nightly capability sweep with a launchd template (3/3) (https://github.com/ferni-ai/voiceai/pull/2448)"
  - "PR #2406: feat(voice-eval): nightly capability scorecard (1/2) (https://github.com/ferni-ai/voiceai/pull/2406)"
  - "PR #2408: feat(voice-eval): gate releases on transcript predicates and compare builds paired (https://github.com/ferni-ai/voiceai/pull/2408)"
  - "PR #2394: feat(ios): captions by transcribed track; one avatar state machine (https://github.com/ferni-ai/voiceai/pull/2394)"
  - "PR #2390: feat(ios): livekit call screen with captions; only the agent steers (https://github.com/ferni-ai/voiceai/pull/2390)"
  - "PR #2351: feat(ios): call session that waits for ferni, retries once, never sits silent (https://github.com/ferni-ai/voiceai/pull/2351)"
  - "brand/FERNI-CAPABILITIES.md [what we are aiming for, not what has shipped]"
  - "PR #1176: fix(website): stop presenting invented stories and stats as real in the blog (https://github.com/ferni-ai/voiceai/pull/1176)"
---

When you talk with a thoughtful friend, they do not let a single hard morning define how they see your whole month. If you mention feeling tired once on a rainy Tuesday, that single remark should not turn into a permanent tag attached to your name. We have been working on making sure Ferni understands how you feel over time with that same kind of balance and human care.

Recently, we've been building a state model for tracking wellbeing fields in [#2052](https://github.com/ferni-ai/voiceai/pull/2052). The goal is to show clear estimates for fields like mood, energy, worry, connection, purpose, and sleep. In the past, a saved snapshot from months ago could stay in place and hide your newer calls. We wanted to fix that so your profile reflects what is actually happening when you talk together.

To make this work fairly, the calculation looks at every observation saved over the last 90 days. Each observation gets a confidence weight with a 7-day half-life. That means something you shared yesterday carries more weight than something you mentioned three weeks ago. An old update from earlier than 90 days ago falls out of the calculation completely. This keeps a single passing remark from outweighing fresh conversations.

Each field tracks its own date and count based on when it actually came up in conversation. Ferni does not lump every field under one single date just because a new call happened. If you have not talked about sleep or energy lately, Ferni does not invent a number or fabricate an answer. Instead, those topics sit under a list that says we haven't talked about these lately, shown as name chips with no numbers next to them.

We also made sure direction indicators like rising, steady, or falling only show up when there is real history behind them. Ferni calculates a direction from a weighted slope only once a field has at least 3 observations over at least 5 days. Before reaching 3 observations over 5 days, no direction is shown at all, rather than showing a made-up label. There are no diagnoses or medical tags anywhere in this tracking.

Alongside how Ferni tracks conversation context, we've been working on how Ferni shows up on screen during a call. In [#2510](https://github.com/ferni-ai/voiceai/pull/2510), we've been building smooth mouth movements for iOS that follow the actual loudness of Ferni's voice track.

In earlier builds, the avatar mouth used a constant shape while Ferni spoke. Now, the app attaches directly to the agent audio track named roomio audio, while ignoring background music tracks. It calculates the audio root mean square on the audio thread, using a gated formula min(1, max(0, (rms - 0.02) * 4)) to match our web experience.

To keep the movement feeling natural across different devices, a smoother applies an attack value of 0.25 and a release value of 0.08 per 60 Hz frame. This calculation scales by the actual frame time so that 60 Hz and 120 Hz screens look identical. The face reads this level inside a view timer that runs only while Ferni is actively speaking.

We spend a lot of time on these quiet details because small touches build trust. Whether it is weighting mood observations over 90 days or matching mouth motion to a live voice track, we want every part of Ferni to feel calm, clear, and grounded. We will keep sharing updates right here as we continue building.
