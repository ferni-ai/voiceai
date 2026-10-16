---
title: "How We Are Making Visual Calls Feel More Human"
excerpt: "We have been working on new ways to show words arriving on screen and sync avatar movement with speech beats."
author: "The Ferni Team"
authorInitials: "FE"
authorColor: "#4a6741"
date: 2026-10-16
category: "Product"
readTime: 3
sources:
  - "PR #1561: feat(coach-media): link each sent pick to its answer card page (https://github.com/ferni-ai/voiceai/pull/1561)"
  - "PR #1560: feat(web): breath captions behind the captions-breath flag (https://github.com/ferni-ai/voiceai/pull/1560)"
  - "PR #841: feat(outreach): more reasons for proactive check-ins, and their settings (https://github.com/ferni-ai/voiceai/pull/841)"
  - "PR #1540: feat(handoff): single-session persona handoffs on by default (https://github.com/ferni-ai/voiceai/pull/1540)"
  - "PR #1551: feat(blog): draft grounded, on-brand blog posts and gate them (https://github.com/ferni-ai/voiceai/pull/1551)"
  - "PR #945: feat(memory): let a caller see, forget and correct the facts recall uses (https://github.com/ferni-ai/voiceai/pull/945)"
  - "PR #806: feat(voice): let ferni know when he snored, whistled or laughed (https://github.com/ferni-ai/voiceai/pull/806)"
  - "PR #1473: feat(web): prosody beats instead of the canned speaking loop (https://github.com/ferni-ai/voiceai/pull/1473)"
  - "PR #1122: feat(web): per-persona ai role label instead of \"ai companion\" (https://github.com/ferni-ai/voiceai/pull/1122)"
  - "PR #992: feat(context): send one context packet per turn behind an off flag (https://github.com/ferni-ai/voiceai/pull/992)"
  - "PR #866: feat(voice): check likely mishearings instead of answering them, behind a flag (https://github.com/ferni-ai/voiceai/pull/866)"
  - "PR #812: feat(voice): vocal bursts behind vocal_bursts, invited and rate-limited (https://github.com/ferni-ai/voiceai/pull/812)"
  - "PR #776: feat(personas): listen first when the caller is low on energy (https://github.com/ferni-ai/voiceai/pull/776)"
  - "PR #1414: feat(voice-eval): score how often ferni says the caller's name (https://github.com/ferni-ai/voiceai/pull/1414)"
  - "PR #660: feat(outreach): voicemail and hung-up outcomes, one next-day retry (https://github.com/ferni-ai/voiceai/pull/660)"
  - "PR #1066: feat(voice): give recognised phone callers their clock, behind a flag (https://github.com/ferni-ai/voiceai/pull/1066)"
  - "PR #749: feat(web): show payment ui only when the server turns the paywall on (https://github.com/ferni-ai/voiceai/pull/749)"
  - "PR #1143: feat(memory): store the dates that matter after each call, behind a flag (https://github.com/ferni-ai/voiceai/pull/1143)"
  - "PR #1365: feat(coach-media): learn from how sent picks went and rank the next one (https://github.com/ferni-ai/voiceai/pull/1365)"
  - "PR #1364: feat(coach-media): carry an answer card with each sent pick and read \"it helped\" (https://github.com/ferni-ai/voiceai/pull/1364)"
  - "brand/FERNI-CAPABILITIES.md [what we are aiming for, not what has shipped]"
  - "PR #1176: fix(website): stop presenting invented stories and stats as real in the blog (https://github.com/ferni-ai/voiceai/pull/1176)"
---

When you talk with someone face to face, conversation flows naturally. You pick up on subtle cues, like a gentle tilt of the head on an emphasized word or a quiet pause while someone gathers a thought. On a screen, rigid blocks of text and canned looping animations can feel cold and detached. We have been working on thoughtful visual features so talking with Ferni feels much closer to a conversation with a friend.

In this post, we want to share how recent pull requests bring more human rhythm to live captions and avatar movement in the web experience.

### Words That Arrive Like Speech

When listening to a voice, you hear words unfold one by one. You do not see a whole paragraph land all at once. Previously, live captions in our web application appeared as static blocks of text. The words were accurate, but the presentation felt like reading a transcript rather than hearing a voice.

In pull request [#1560](https://github.com/ferni-ai/voiceai/pull/1560), we have been building a feature called breath captions. Instead of fading in an entire line as a single piece, words rise in one at a time, timed by real transcript events as they arrive. Each word transitions from blurred to sharp and rises at most 6px. To help you track what is being said, the word currently being spoken carries a persona-colour underline.

Pauses are a natural part of talking. When someone stops for a second to think, you know they are still there. To reflect that on screen, a pause mid-turn displays three breath dots. These dots let you know Ferni is still in the middle of a thought without cluttering the screen.

We also made sure the text stays grounded. The underlying text remains untouched so screen readers see the exact same words.

### Movement Tied to the Rhythm of Voice

Alongside captions, we turned our attention to how Ferni moves while speaking. In earlier versions, the avatar played a canned repeating loop while audio played. The animation was the same whether Ferni was sharing a warm greeting, explaining an idea, or pausing. The motion had nothing to do with what was actually being said.

In pull request [#1473](https://github.com/ferni-ai/voiceai/pull/1473), we replaced that canned loop with prosody beats. Instead of repeating a fixed animation, Ferni's head moves only on stressed syllables in the voice. Each stressed syllable creates a 1 to 2 px dip with a 0.3° tilt that alternates sides. On strong beats, there is also a 1 px eye lift.

When speech is steady, the head stays still rather than moving continuously. When a spoken phrase finishes, a phrase-end event fires behind the scenes. This ensures that visual motion reflects the genuine cadences of voice.

### Designed for Comfort and Accessibility

Every detail we build is tested against accessibility standards. Under reduced motion settings, breath word animations do not play, and head gestures stay still, while the underlying events still fire correctly so the layout remains stable.

We take a careful approach to shipping updates. As described in pull request [#1176](https://github.com/ferni-ai/voiceai/pull/1176), changes run on a development agent first and reach production later. We also know that a reply from Ferni takes around two seconds today, which is slower than we want. Refining these visual elements helps make every interaction feel calm, clear, and easy to follow while we work on performance.

Building Ferni is an ongoing process of refining small details that matter. By aligning captions with speech arrival and syncing avatar movement with natural vocal beats, we are working to make voice calls feel grounded, human, and comfortable.
