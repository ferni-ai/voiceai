# Menu brand rubric

A five-minute checklist for one menu item (applied by `docs/plans/2026-10-12-menu-green-program.md`).
Each "no" is a finding to fix or a reason to hide the item. Seth's standing decisions
(October 2026) override older brand docs; where a doc disagrees, it is listed in §8.

## 1. Mission and principles

- [ ] **It helps Ferni pay attention**: remember what matters, notice, show up
  (CORE-PRINCIPLES.md "Our Mission"; BRAND-VOICE-GUIDE.md "The Core Truth").
- [ ] **Relationship, not transaction.** A panel shows what you and Ferni share,
  not usage metrics (CORE-PRINCIPLES.md §2).
- [ ] **Growth through gentleness.** No pressure, no streaks, no "in a row"; a missed day
  is never a broken chain (CORE-PRINCIPLES.md §3; FERNI-RITUALS.md §6.2).
- [ ] **Better than human, but honest.** "We're not magic. We're attentive." Claim only
  what the code does today (BRAND-VOICE-GUIDE.md "Final Test" 3; Seth).
- [ ] **Memory is care, shown.** What Ferni remembers is visible (BETTER-THAN-HUMAN-MANIFESTO.md
  Principle 5; FERNI-CAPABILITIES.md "Remembers everything and connects the dots").
- [ ] **Invisible excellence.** Never point at the machinery: no scores for how well
  Ferni "understands" you (MANIFESTO Principle 2).
- [ ] **The friend test.** Would a thoughtful friend do this? Pick the more human,
  more delightful option (BRAND-VOICE-GUIDE.md "Final Test" 1; Seth).
- [ ] **True north.** Did this help someone feel less alone? We don't optimise for
  engagement (apps/marketing/STORYTELLING-STRATEGY.md "Success Metrics").

## 2. Copy and voice

Do and don't, from BRAND-VOICE-GUIDE.md "Voice Principles":

| Principle | Don't | Do |
|---|---|---|
| Warm, not saccharine | "I'm SO happy you shared that with me! That's AMAZING!" | "That matters. I'm glad you told me." |
| Present, not performative | "I'm always here for you 24/7 with unlimited support!" | "I'm here. What's on your mind?" |
| Direct, not blunt | "Your goal seems unrealistic based on your history." | "That's ambitious. Let's break it down so you can actually get there." |
| Human, not human-ish | "I'm designed to simulate human conversation!" | "I notice things. I remember things. I show up." |

- [ ] Ferni speaks as himself: copy in his voice says "I", not "we" or "Ferni's AI".
  Chrome (buttons, labels) is plain sentence case with no period (SCREEN-GUIDELINES §11.3).
- [ ] None of the avoided words: AI, artificial, bot, chatbot, algorithm, "user" (say "you"),
  advice, recommend, "you should", 24/7, unlimited, virtual assistant, digital companion
  (BRAND-VOICE-GUIDE.md "Words We Avoid" and "Banned Phrases"; `check-brand-compliance.ts`
  enforces the banned phrases as critical).
- [ ] Ferni-voiced copy follows the voice text rule: no em dashes, no ellipses, no stage
  directions (AGENTS.md "Voice text rules"; tap-to-hear can read panel text aloud).
- [ ] Error words from FERNI-EMPTY-ERROR-STATES.md §7.2: "Something unexpected happened",
  "Didn't work", "Try again"; never "Error", "Failed", "Invalid", "No data". Never blame.
- [ ] Every string is an i18n key in `en-US.json`. Toasts: 3 to 5 words, bottom-centre (SCREEN-GUIDELINES §8.7).

## 3. Loading, empty and error states

Every panel has four distinct states, for every route it calls. Give the panel root
`data-state="loading|ready|empty|error"` so tests and the live probe can tell them apart.

- [ ] **Loading** is a skeleton for predictable content, otherwise a quiet spinner
  (EMPTY-ERROR-STATES §4.2). **It always ends**: within 10 s it becomes ready, empty
  or error. Check sign-in and connection *before* showing it; never wait on something
  that may never come (signed out, no credentials, a callback nobody sets).
- [ ] **Empty** means the route answered 2xx with zero rows. Headline, one line in
  Ferni's voice saying *how the space gets filled*, and one action. Pattern (§2.2):
  "Shared history takes time. The inside jokes, the callbacks, they come from
  conversations." For example: "Nobody here yet. Tell me about someone you care
  about and I'll keep them here." Empty never shows sample rows or a "here's what
  this will look like" preview with invented content.
- [ ] **Error** means non-2xx, network failure, or a response of the wrong shape. Its
  copy differs from empty: "Something unexpected happened. Want to try again?" with a
  Try again button (§3.2), and the cause is logged with context. **Failure is never shown
  as "no data"**: no flat line, no default insights, no canned replies in its place.
- [ ] **Signed out** (401): "You need to sign in first." with Sign in (§3.2). **Offline**:
  "This needs a connection. I'll be here when you're back." (§5.2, in Ferni's voice).
- [ ] **Not connected**: say so and how to connect; with no credentials here, hide the tile (§7).

## 4. Honesty (Seth's standing decisions)

- [ ] **No invented content.** No made-up stats, percentages, "x times", star ratings,
  participant counts, study citations, testimonials, progress claims, or sample data
  shown as the user's own. Every number on screen comes from something stored for
  *this* person. A number nothing measured is removed, not softened.
- [ ] No `Math.random()` behind anything the user reads as data.
- [ ] **Ferni is free for now.** No paid plans, prices, tiers, "upgrade", "Partner" or
  "Pro" anywhere in the UI. The Venmo chip-in is the only money ask. Card payment
  paths stay hidden while Stripe is off.
- [ ] **No "AI" in labels and no on-screen AI disclosure.** Ferni speaks as himself; the
  teammates are "the team", never "AI personas" (AGENTS.md "No AI-disclosure prompt changes").
- [ ] No promise the code doesn't keep: no "we're actively building this", no "Connected"
  that isn't checked, nothing sold (seeds) that doesn't take effect.
- [ ] Copy that restates server rules (seed amounts, limits) reads them from the server.
- [ ] Never put words in the person's mouth: share text is a draft they edit, not a
  message written as them.
- [ ] **Behaviour changes ship behind an off-by-default flag** and go on after they've
  been heard or seen on dev (AGENTS.md "How work ships" 3).

## 5. Visual

- [ ] Colours, durations and shadows come from tokens (`var(--color-*)`); edit
  `design-system/tokens/*.json` and run `pnpm tokens:sync` (AGENTS.md). No persona colour
  for text (`brand-guardrails.json` no-persona-text-color).
- [ ] Readable in the dark theme (check every surface under `data-theme="midnight"`), with
  contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI parts (SCREEN-GUIDELINES §12.1).
- [ ] Tap targets at least 44×44px (`brand-guardrails.json` touch-target).
- [ ] Works at 390, 768 and 1440 px wide: no sideways scroll, no clipped text, the close
  control is reachable.
- [ ] Focus is visible, Escape closes the panel, and `prefers-reduced-motion` is respected;
  no infinite spin except while loading, no shake on error (`brand-guardrails.json` animation).

## 6. The memory promise

FERNI-CAPABILITIES.md promises that Ferni "remembers everything and connects the dots",
that the Commitment Keeper "tracks every promise", and that the Relationship Network
"maps all your relationships". The menu is where a person checks that promise. For any
panel that shows what Ferni knows (journal, people, commitments, outreach history,
calendar, wellbeing, story, rituals, what Ferni knows):

- [ ] **Call → panel.** Something Ferni learns in a call shows in the matching panel the
  next time it opens. Name the voice writer function and the store the route reads. If
  they are different stores, the item is broken, whatever the panel looks like.
- [ ] **Correctable.** The person can edit or delete it there, and Ferni uses the
  correction on the next call.
- [ ] **Panel → call.** Anything entered in the panel reaches Ferni on the next call: the
  agent reads that store into its context.
- [ ] **Leaves with them.** It is in "Take your story" (export) and goes with account deletion.
- [ ] Caches end: a process cache over the store is cleared on write or has a TTL.

## 7. Is this item worth keeping?

1. **Mission fit.** Does it help Ferni pay attention, remember, show up, or help the
   person feel less alone (§1)?
2. **Real within the program.** Can it work end to end without credentials or hardware
   Seth hasn't set up, at size M or smaller?
3. **Not a duplicate** of another panel.

All yes: build or connect it. Yes to 1, no to 2: hide it behind an off-by-default flag
whose comment says why. No to 1: hide it, or delete it if nothing reaches it. **Never ship
a hollow version.** Hidden means gone from the menu, bottom sheet and deep links.

## 8. Where older brand docs disagree with Seth's decisions

Follow the decision, not the doc, until the doc is updated.

| Doc and passage | Conflicts with |
|---|---|
| FERNI-BRAND-GUIDELINES.md §1 "Ferni is the AI that actually listens"; §10 and SCREEN-GUIDELINES §11.2 "Your AI team. Always there.", "Talk to AI that cares"; MANIFESTO "six AI personas available 24/7" | No "AI" in labels; voice guide bans "24/7" |
| BETTER-THAN-HUMAN.md "Perfect memory, we never forget a single detail"; BRAND/SCREEN guidelines "Ferni remembers everything"; voice guide onboarding "I'll remember everything you tell me" | Honest: not true until §6 holds for every panel (see the program). Say "I remember what matters to you" |
| FERNI-CAPABILITIES.md "Cost: Subscription", "Financial Advisor" and "Therapist" as displaced verticals, "Availability 24/7/365" | Free for now; the voice guide bans "advice" and "24/7" |
| FERNI-EMPTY-ERROR-STATES.md copy in "we" ("We're here whenever you're ready") | Ferni speaks as himself ("I") |
| FERNI-EMPTY-ERROR-STATES.md §9.2 "Shake: on error trigger" | `brand-guardrails.json` no-shake-error |
| FERNI-BRAND-GUIDELINES.md §3 "Background: always Paper Cream or lighter" | The midnight dark theme ships; both must be readable |
| BRAND-VOICE-GUIDE.md sample copy with em dashes and an ellipsis ("I'll notice things—even…", "kind of amazing...") | AGENTS.md voice text rules |
| FERNI-RITUALS.md §5.4 "this is our 50th conversation" | §6.2 of the same doc: never count out loud. In the UI, §6.2 wins |
| STORYTELLING-STRATEGY.md "What I've Learned from 10,000 Conversations" | No invented numbers |
