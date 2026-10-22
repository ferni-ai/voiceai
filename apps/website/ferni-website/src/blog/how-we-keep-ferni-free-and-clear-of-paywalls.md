---
title: "How We Keep Ferni Free and Clear of Paywalls"
excerpt: "Here is how we have been building our app and website so people can talk without payment screens or monthly plans."
author: "The Ferni Team"
authorInitials: "FE"
authorColor: "#4a6741"
date: 2026-10-18
category: "Product"
image: "how-we-keep-ferni-free-and-clear-of-paywalls.png"
imageAlt: "Flowing wind lines drawn in sage over soft amber washes on cream, moving freely"
readTime: 3
sources:
  - "PR #1647: feat(web): avatar settles in the evening and looks glad when you come back (https://github.com/ferni-ai/voiceai/pull/1647)"
  - "PR #749: feat(web): show payment ui only when the server turns the paywall on (https://github.com/ferni-ai/voiceai/pull/749)"
  - "PR #1035: feat(website): ask for a dollar on venmo instead of monthly gifts (https://github.com/ferni-ai/voiceai/pull/1035)"
  - "PR #928: feat(web): quiet, persistent \"AI companion\" label (https://github.com/ferni-ai/voiceai/pull/928)"
  - "brand/FERNI-CAPABILITIES.md [what we are aiming for, not what has shipped]"
  - "PR #1176: fix(website): stop presenting invented stories and stats as real in the blog (https://github.com/ferni-ai/voiceai/pull/1176)"
---

We want Ferni to be simple and warm to talk with. Right now, Ferni is free. On 2026-10-10, our team made a clear decision: the app should never ask you to pay, tip, upgrade, or join a paid plan to talk. We want you to be able to open Ferni and start talking without paywalls or counters standing in your way.

Behind the scenes, we've been working on how our app handles payments and limit checks. In [#749](https://github.com/ferni-ai/voiceai/pull/749), we built a central check for whether a paywall is active. The function checks server responses that the app already makes, such as checking subscription status. Unless the server explicitly turns the paywall on, the app treats it as off and hides all payment elements.

This means when you connect and talk with Ferni, the app does not count down your conversations. It never blocks a call, never shows a limit screen, and never asks you to upgrade. We turned off tip cards after hang-ups, upgrade modals, Stripe checkout screens, usage indicators, and badge trial countdowns. We also turned off payment buttons in settings, footer links, and seed planting views. If someone supported Ferni in the past, they still keep their perks and can access their account settings. But for everyone else, the experience stays completely open without any cost.

We also wanted our main website to match this promise. In [#1035](https://github.com/ferni-ai/voiceai/pull/1035), we removed monthly subscription cards that listed $5, $15, or $30 a month, as well as older $9.99 or $19.99 options. We reworded pages, removed paid offer data from search settings, and redirected old pricing links so we do not advertise or sell paid plans.

Instead of monthly plans, our support page has a tip jar. Ferni is free. If you ever want to help keep it that way, the jar is there, and it's never expected: nothing in Ferni changes either way, and the app itself never asks. The page shows a QR code, the handle @Seth-Ford-38, and an Open Venmo button linking directly to https://venmo.com/Seth-Ford-38?txn=pay&amount=1&note=Ferni. No part of Ferni is locked behind a payment.

Let us share an example of how this works during a normal day. Alex, a composite we wrote, not a real person, wants to talk through a busy morning schedule. Alex opens Ferni without seeing a banner asking for money or a message warning that conversations are limited. Today, a reply from Ferni takes around two seconds, which is slower than we want. Changes run on a development agent first and reach production later. But Alex can talk freely without paywalls or upgrades interrupting the flow.

Looking ahead, we have broad goals for what we want Ferni to do. Our list of capabilities shows what we are aiming for, not what has shipped yet. We aim to help people manage calendars, set reminders, track habits, draft emails, and plan life events. We are aiming for a full team that helps you stay organized and calm. We never present these future capabilities as done, because building them carefully takes time.

We are excited to keep building in the open. Ferni is new and has essentially no people using it yet, so we do not have quotes, testimonials, or usage numbers to share. But by keeping our code clear and keeping paywalls off, we can focus on making conversations better every single day.
