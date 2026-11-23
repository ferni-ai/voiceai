---
title: "Getting Your Local Time Right"
excerpt: "We updated how Ferni saves your local time zone so check-ins don't arrive at the wrong hour."
author: "The Ferni Team"
authorInitials: "FE"
authorColor: "#4a6741"
date: 2026-11-23
category: "Building in Public"
image: "getting-your-local-time-right.png"
imageAlt: "A minimalist arch frames a golden sun over terracotta hills with a green leafy branch below"
readTime: 3
series: "building-in-public"
seriesPart: 11
sources:
  - "PR #3779: fix(web): remember the time zone only after the server accepts it (https://github.com/ferni-ai/voiceai/pull/3779)"
  - "PR #1176: fix(website): stop presenting invented stories and stats as real in the blog (https://github.com/ferni-ai/voiceai/pull/1176)"
---

When you talk with Ferni, timing matters. A check-in ought to land when you expect it, not while you're fast asleep. Imagine Sam (a composite we wrote, not a real person), who opens the app after getting home from work. If the app gets Sam's local clock wrong, outreach might arrive at odd hours instead of during a quiet evening.

Recently, we noticed something wasn't right in how our web code remembered local time zones. When your browser opens Ferni, it tries to send your local time zone details to our server. Our server relies on that information so check-ins, outreach, and quiet hours line up with your local clock.

However, inside our web app, the code stored your time zone in browser memory before checking whether our server actually accepted it. If that sync was skipped because your account sign-in was still finishing up, or if a temporary network hiccup occurred, or if the server returned an error, the browser marked the zone as sent anyway.

Because the web app thought its job was complete, it wouldn't try to send the time zone again unless you moved to a different time zone. That meant our server could hold onto a stale or default setting, and check-ins could arrive at the wrong hour.

We fixed this issue in pull request [#3779](https://github.com/ferni-ai/voiceai/pull/3779).

Our change is simple. We updated the web app so it saves the time zone in your browser cache only after the server confirms that the sync succeeded. If a sync fails or gets skipped, the zone stays uncached. When you open the app next time, the web code sees that the zone isn't saved yet and tries to send it again.

When the app loads, it waits for sign-in steps to finish before starting other web services. Once your account identifier is ready, the next attempt carries the right details to the server. If the server doesn't receive it on the first try, the browser doesn't pretend that the update succeeded.

We tested several situations to make sure this worked as expected. We checked what happens when no account identifier exists yet, when the server rejects a request, when a network request fails, and when a sync succeeds. In the past, the web code failed those initial checks because it saved the time zone too early. With our update, the app keeps the zone unsaved until the server approves it.

We also took a close look at what we might still be unsure about. We chose not to add extra code that listens for immediate sign-in updates right away. We wanted to keep this change small and focused. That means if a temporary network drop happens right as your access token lands, the app won't retry instantly. Instead, it waits for your next app load to sync the time zone.

For Sam, this means that once sign-in completes and the connection is stable, the correct local time zone gets saved properly on the server. That keeps outreach and check-ins aligned with Sam's local day.

Ferni is about making space for genuine connection in your daily routine. Getting tiny details right, like keeping your local clock accurate, helps make sure Ferni is there when you need a listening ear.

If you'd like to experience how Ferni fits into your day, open Ferni, say hello, and start a conversation.
