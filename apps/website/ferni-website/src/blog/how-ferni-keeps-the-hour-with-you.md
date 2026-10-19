---
title: "How Ferni's Face Keeps the Hour With You"
excerpt: "We've been working on the face on our homepage, so it settles down late at night and looks glad when you come back."
author: "The Ferni Team"
authorInitials: "FE"
authorColor: "#4a6741"
date: 2026-10-16
category: "Product"
image: "how-ferni-keeps-the-hour-with-you.png"
imageAlt: "A crescent moon resting inside a flower bud, drawn in sage and amber lines on cream"
readTime: 3
sources:
  - "PR #1647: feat(web): avatar settles in the evening and looks glad when you come back (https://github.com/ferni-ai/voiceai/pull/1647)"
  - "PR #1176: fix(website): stop presenting invented stories and stats as real in the blog (https://github.com/ferni-ai/voiceai/pull/1176)"
---

When you walk into a room late at night, the people who know you don't greet you the way they would at noon. They lower their voice. They lean back a little. And when you've been away for a while, their face does something before they say a word: it lights up, because they're glad you came back.

We've been working on giving the face on our homepage a bit of that. It's a small change in one corner of Ferni, and we want to share what it does and why we cared about it.

### A calmer face after dark

Ferni's face on the homepage moves through a set of moods while you read. During the day it still does: it opens curious, then moves through eleven moods, a new one every four seconds.

Late in the evening, that pace felt wrong. So from nine at night until just before five in the morning, the face opens settling instead. Its lids are lowered, its gaze drifts down, and its head rests to one side under a soft dusk glow. Then it moves through a shorter, calmer list of moods: settling, listening, warm, caring and neutral, one every six seconds.

Those are the same hours when our homepage already asks "Winding down?" and "Can't sleep?". Now the words and the face say the same thing: it's late, and there's no rush.

### Glad you're back

The second change is about coming back. If you were last on the homepage more than six hours ago, the face gives a quick flash of recognition and a lifted, tilted look, a kind of "oh, hi", for about two and a half seconds. Then it moves into its usual opening mood.

To know when you were last here, the page keeps one small note in your browser: the time of your last visit. We didn't use the page's visit counter for this, because it goes up on every page you open, so clicking from one page to the next would have counted as coming back. If your browser blocks that kind of storage, you simply don't get the glad look. Nothing breaks, and nothing shows an error.

### The details we checked

A face that changes with the hour has a few ways to go wrong, so we tested them. If you hover away from the face or come back to the tab, it picks up where its current list left off, so a night page never shows a daytime mood.

There's one limit we know about. The pace is chosen once, when the page loads. If you leave a page open as nine o'clock passes, the face moves to its night moods but keeps the faster daytime pace until the page loads again.

### Why a face on a homepage matters to us

Ferni is new, and hardly anyone has met him yet. For many people who find us, the homepage is where they first see Ferni. We want that first look to feel like someone who notices the hour and remembers that you've been here before, not like an animation running on a loop.

These are small touches. They don't make Ferni's replies faster: a reply still takes around two seconds today, which is slower than we want, and we're working on that too. But being present starts with noticing small things, and a face that knows it's late is one place to practice that.

You can read how we built it in [#1647](https://github.com/ferni-ai/voiceai/pull/1647).
