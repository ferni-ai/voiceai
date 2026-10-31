# Specialist beats: each agent tracks its part of your life, arrives prepared, and follows up

Date: 2026-10-29. Status: plan, approved by Seth ("get it planned and organized").

## Why

Today, moving from agent to agent gives you a fresh stranger each time. Each one is warm but knows nothing. On the owner's real call of 2026-10-29 (Ferni → Maya → Peter → Alex, 12 minutes, the 736th conversation):

- **Maya** (habits) had no habits for the caller and proposed a generic one. She knew none of the recent trip or sleep signals that earlier calls hold.
- **Peter** (patterns) answered a question about long-term plans with general advice, and invented an excuse for not seeing accounts that aren't connected.
- **Alex** (chief of staff) introduced himself and had nothing open, although minutes earlier the caller had said yes to an on-behalf call, and no call was placed.
- **No context crossed any handoff.** Every handoff logged `hadPreBriefing=False`. The arrival lines were generic, and one claimed a briefing that never happened.
- **No open items were ever fetched:** about 50 recall injections, every one with `followUps: 0`.
- **Texts back to Ferni never arrive.** All 10 inbound texts since 10-17 failed the Twilio signature check, because Twilio signs the public `app.ferni.ai` URL and the server checks against its internal host. Nothing after the check ran. The same bug refuses outbound-call status callbacks (#2679).

The manifests already promise beats: Maya's domains include `habit-tracking`, `accountability` and `setback-recovery`; Jordan's `milestone-events`; Alex's `follow-up-coordination`; Peter's `proactive-intelligence`. Nothing in the code gives a persona a beat, briefs it, or lets it act between calls.

## What the code audit found (origin/main 1e46861e1, read-only, 2026-10-29)

1. **Four specialists' insight builders never run.**
   - `getPersonaBuilder` (`agents/processors/injection-builders/intelligence-builders.ts:30-86`) switches on `'maya'`, `'jordan'`, `'alex'` and `'nayan'`, but the live ids are `maya-santos`, `jordan-taylor`, `alex-chen` and `nayan-patel`.
   - Prod logs, 10-22 to 10-29: `Persona-specific context injected` fired 596 times for `ferni` and 23 for `peter-john`, and **0** times for the other four. Over the same week there were 38–62 arrivals at each of them (Maya 38, Jordan 62, Alex 56, Nayan 48, in 25–41 calls each).
2. **Maya's builder would read the wrong data.** It reads `enhancedHabits` with no `loadUserData` (`maya-coaching-insights/data-fetchers.ts:37-41`). Her `createHabit` writes `habits`. Habits also live in two stores: `bogle_users/{uid}.productivityData` from the voice tools, and `bogle_users/{uid}/habits`, which the app reads.
3. **Handoffs drop what matters.**
   - Function-call history is excluded (`agents/multi-agent/persona-swap.ts:27-32`).
   - Only the last 3 tool results survive, at 200 characters each.
   - The pre-briefing reads `pre_briefings` (`predictive-handoff.ts:601-628`), which nothing on the live path writes.
   - `HandoffContext` (`handoff/types.ts:38-52`) carries no open items.
4. **The persona id is frozen at call start.** `services.personaId` stays the first persona, so `capturedBy` on commitments and the post-call Maya check record `ferni` after a handoff.
5. **No follow-up has an owner.**
   - `FollowUp` (`services/follow-through/follow-up.ts:45-80`) has no persona owner: its `owner` field is `'caller' | 'ferni'` (who owes the item).
   - The guarded sender speaks as Ferni (`guarded-text.ts:291`).
   - Only the morning brief and scheduled texts carry a persona.
6. **Open items live in 12+ stores** with 6+ schemas. Memory plan lane M10 and the activity ledger have no code yet.
7. **Proactive plumbing is dead or split.**
   - Jordan's `ProactiveScheduler` (`startup.ts:254`) feeds an in-process bus nothing reads.
   - Peter's `ProactiveInsightsService` is never started; its only reference is `.stop()` in `shutdown.ts`.
   - `PERSIST_AGENT_PROFILES` decides whether habits, tasks and goals reach Firestore at all. The agent writes them, and readers in other services (`apps/async`, the UI server) read them.
8. **Most of the specialists' tools are not offered.** Maya gets 4 of her 31 habit tools on turn 1 unless `SPECIALIST_TOOLS` is on (default off), which gives her 12.

Full report: `/Volumes/Work/verify/specialist-followup-2026-10-29/code.md` (local). UNCONFIRMED there: prod values of `PERSIST_AGENT_PROFILES`, `SPECIALIST_TOOLS` and `MORNING_BRIEF`.

## What actually reached people (prod logs, 10-15 to 10-29, read-only)

1. **Volume.** 15 texts were accepted by the provider and 2 emails went out. No push was verified, and no unprompted calls were placed.
   - Every one went to **one** account; every gated path has a cohort of one.
   - Nothing went out as Maya, Jordan or Alex, and 238 of 243 calls opened as Ferni.
2. **The proactive tick does nothing.** It has run every minute since 10-18 (16,161 runs) and sent nothing.
   - The promise trigger stands down when the person has talked since the promise (`triggers.ts:120-128`), and an active user always has.
   - Only 4 commitments were captured in 14 days.
3. **The morning brief has nothing to say.** It composes `nothing-today` every morning: no calendar, reminders or tasks. Commitments are excluded (`MORNING_BRIEF_COMMITMENTS` off).
4. **Pondering has no Cloud Scheduler job.** The job was declared in `infra/cloud-scheduler-delivery.yaml` but never created, and the route got 0 requests in 30 days.
5. **On-behalf call follow-ups are off.** `CALL_RESULT_TEXT` and `CALL_FOLLOWTHROUGH` are both off.
6. **Failures are logged as successes.**
   - The FCM helper returns "No push tokens registered" because no caller passes `onlyToken`, and earlier code logged "Push notification sent" anyway.
   - On 10-24 a SendGrid 401 was logged as "Email notification sent". The Gmail-only fix (#2968) is on web but not yet on the prod agent.

Full report: `/Volumes/Work/verify/specialist-followup-2026-10-29/delivery.md` (local).

## What this builds on (no new stores)

| Existing plan                                                                        | What it gives this one                                                                                               |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `2026-10-27-memory-call-sheet.md` + `2026-10-29-memory-v2-retro-and-architecture.md` | One store per kind (facts, people, episodes, open items) and the call sheet. Beats are **views** over these stores.  |
| `2026-10-27-recall-ledger.md`                                                        | The activity ledger: everything Ferni did and how it turned out. Lane 8 covers now-or-later, step-in and follow-ups. |
| `2026-10-12-follow-through.md`                                                       | One record of what's open and one delivery path (the follow-through job and the guarded sender).                     |
| `2026-10-13-action-framework.md`                                                     | The gate: confirm tiers, receipts, undo, quiet hours. Every outward follow-up goes through it.                       |

This plan adds the **persona dimension**: who owns which item, what each specialist sees when it arrives, and who follows up.

## The model

1. **Beat.** Each persona declares its beat in its manifest: which item kinds and topics it owns. A pure function, `beatFor(personaId, callSheet)` in `memory/use-cases/` (the memory v2 target layout), filters the canonical stores into that persona's view. An item has exactly one owner. When no specialist claims it, Ferni owns it.
2. **Desk.** When a persona arrives (call start or handoff), it gets a short brief built from three things:
   - what the caller just asked for (the handing-off agent's last request and any unfinished action);
   - what's open on its beat;
   - the last conversation the caller had with this persona.

   The arrival line comes from the desk. A persona never claims a briefing it didn't get.

3. **Rounds.** Between calls, a scheduled job reads new episodes and ledger entries for each persona's beat. It notes signals and may propose **one** follow-up. The follow-up goes through the action gate and guarded sender in that persona's voice and name, within quiet hours.
4. **Honest edges.** When a persona lacks access (no calendar, no accounts), it says so plainly and offers to connect. It never invents a reason.
5. **Relationship per persona.** Each persona keeps its own short history with the caller, so "last time we talked, you were dreading the trip" comes from the right voice.
   - The model already exists: `services/persona/per-persona-relationship.ts` holds topics, key moments and the last interaction.
   - Its writer, `applyRelationshipUpdateToProfile`, has no live caller found; it's only re-exported from `services/humanization/index.ts`. UNCONFIRMED: not exhaustively checked.
   - The canonical home is `relationships/{personaId}` from the call-sheet plan.

## Beats

| Persona                          | Owns (item kinds and topics)                                                 | Notices (signals Ferni already has)                                        | Needs access to                                                                | Follows up how                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Ferni** (friend, coordinator)  | Promises made in calls; anything no specialist owns; the people in your life | Dropped requests; mood over the week; who keeps coming up                  | Ledger, call sheet, every persona's desk (read)                                | Opens with one named thread ("your mom", never "her"). Comes back to a dropped request on the next call. |
| **Maya** (habits)                | Habits you actually live: sleep, movement, spending, routines, setbacks      | Local call times (late nights), travel, stress in tone, streaks and breaks | Call metadata and mood history. Later, with consent: Apple Health, Screen Time | Names one habit she **noticed**, never a generic one. At most one text a week.                           |
| **Jordan** (milestones)          | Dated things: birthdays, trips, anniversaries, family events, holidays       | Dates said in passing; trips; upcoming family milestones                   | Facts with dates (`validFrom`/`at`); calendar when connected                   | About 14 days ahead ("gift, call, or both?") and 1–2 days after ("how was it?")                          |
| **Alex** (chief of staff)        | Every open item and errand; replies owed; outcomes of what Ferni did         | Anything unfinished on any channel; failed or unanswered actions           | Ledger, calendar, email, texts, calls                                          | Morning brief text: what's open, what was done, one decision. Arrives naming the top open item.          |
| **Peter** (patterns)             | Cross-domain patterns over the whole history                                 | When you call, what precedes worry, promises kept vs dropped               | Episodes and ledger (read). Read-only accounts only with Seth's yes            | At most one insight a month. Honest about what he can't see.                                             |
| **Nayan, Joel** (wisdom, mentor) | Long-arc themes you return to                                                | Themes that recur over months; anniversaries of hard moments               | Episode summaries                                                              | Rarely, and only when a theme recurs                                                                     |

## Rules for every follow-up

- **One owner per thread.** A reply to a persona's text goes back to that persona.
- **Caps.** One proactive follow-up per persona per week, and three per week across all personas (defaults; Seth can change them). A follow-up the caller ignores twice pauses that persona's rounds for two weeks.
- **Quiet hours** in the caller's zone, as set by the action framework.
- **Crisis wins.** No proactive follow-up within 14 days of a crisis signal, using the shared helper in `services/human-transfer/crisis-signals.ts`.
- **Minors:** no rounds, no beats, no memory writes (memory v2 R7).
- **Third-party legs** (on-behalf rooms) never feed a beat.
- **Every follow-up is a ledger entry** with its outcome (sent, failed, replied).

## Lanes

Each lane is one PR of ≤ ~400 reviewable lines, behind an off-by-default flag, with fictional fixtures and an independent verifier's pass on the exact head. **The done line is fixed before round 3** (frozen failure list, or "never worse than main" plus declared gaps, or a split).

| Lane                                                            | What                                                                                                                                                                                                                                                                                                                                                                       | Contract (testable)                                                                                                                                                                             | Depends on               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **S0 Twilio public URL**                                        | One shared helper that rebuilds the public URL Twilio signed (configured base, or `X-Forwarded-Host`, falling back to `Host`). All three Twilio routes use it: `sms-inbound`, `sms-status`, `conversational-call-status`. Tracked in #2679.                                                                                                                                | A real HMAC over the public URL passes on each route, and the same request over the internal host fails. In prod, the next inbound text logs `Inbound SMS received`.                            | none                     |
| **S1a Persona builder dispatch**                                | `getPersonaBuilder` switches on `getCanonicalPersonaId(personaId)` (`personas/voice-registry.ts`), so all 7 personas reach their insight builder. Maya's builder reads `habits` after `loadUserData`, not `enhancedHabits`. Behind a flag.                                                                                                                                 | A test per persona proves the live id reaches its builder. In prod, `Persona-specific context injected` appears for each specialist after a handoff (today 0 for Maya, Jordan, Alex and Nayan). | none                     |
| **S1b Active persona id**                                       | `services.personaId` follows the handoff, so `capturedBy`, the post-call Maya check and attribution record who actually spoke. A call keeps the set of personas it visited.                                                                                                                                                                                                | Fixture: Ferni hands off to Maya, and a commitment captured after that records `maya-santos`. The post-call habit check runs when Maya spoke at any point.                                      | none                     |
| **S1 Handoff desk**                                             | The handing-off agent writes the caller's last request, any unfinished action and the open beat items into the brief. That replaces the `pre_briefings` read, which nothing writes, and extends `HandoffContext` with open items. The arriving persona's first line comes from the brief, and a missing brief is never claimed.                                            | Fixture: ask for a call to a contact, then hand off to Alex. Alex's first line names the call. 0 arrival lines claim a briefing when the brief is empty.                                        | call sheet M1/M6         |
| **S2 Beat declaration**                                         | A `beat` field in each manifest; `beatFor()` (pure, in `memory/use-cases/`); one-owner resolution with Ferni as the fallback; a `personaOwner` field on `FollowUp` (separate from the existing `owner`, which says who owes the item).                                                                                                                                     | Every open-item kind maps to exactly one owner. Each persona's view on a fixture life matches its table.                                                                                        | memory v2 C-lanes        |
| **S3 Persona relationship**                                     | Wire the existing per-persona record: at each persona segment's end, write topics and one key moment through it into `relationships/{personaId}`. The desk reads it. No second relationship model.                                                                                                                                                                         | A second call to Maya opens with the last Maya topic, and Peter doesn't see Maya's note as his own.                                                                                             | S1                       |
| **S4 Alex on the ledger**                                       | The morning brief and Alex's desk read open items from the ledger and call sheet, not the legacy commitment stores.                                                                                                                                                                                                                                                        | Brief fixture: one dropped call, one done errand and one event appear. Junk commitments (sign-offs, bare pronouns) never appear.                                                                | ledger lanes 1–2         |
| **S5 Rounds job**                                               | One scheduled job runs each persona's round: new episodes and ledger entries → signals → at most one proposal → action gate → guarded sender in the persona's voice (`guarded-text.ts` takes a persona instead of a hard-coded Ferni). Jordan's `ProactiveScheduler` bus and Peter's never-started `ProactiveInsightsService` are deleted, or folded in as signal sources. | Caps, quiet hours, the crisis quiet period and the minor hold all enforced (test each). Every send is a ledger entry.                                                                           | S2, S4, action framework |
| **S6 Maya's signals**                                           | Habit signals from data already held: local call times, travel facts, mood trend, streaks. First, one habit store: the voice tools and the app read and write the same place (today `productivityData` and `habits/` split). `SPECIALIST_TOOLS` goes on for her cohort.                                                                                                    | Fixture life with five late-night calls: Maya proposes one sleep follow-up, and nothing for a fixture with no late nights.                                                                      | S5                       |
| **S7 Jordan's dates**                                           | Dated facts (birthdays, trips, events) are extracted with `at`. Jordan follows up 14 days before and 1–2 days after.                                                                                                                                                                                                                                                       | A planted birthday fires exactly once at each cue, and not if cancelled (memory v2 R2).                                                                                                         | S5, R2                   |
| **S8 Peter's patterns**                                         | A monthly pattern pass over episodes and the ledger. Insights are stored with provenance `ferni-inferred`.                                                                                                                                                                                                                                                                 | Fixture with a planted pattern: one insight; with no pattern: none. Never states an inference as fact.                                                                                          | S5, R1                   |
| **S9 Two-way texting**                                          | An inbound text from a member goes into a text session with the same persona brain, guarded and replying as the thread's owner. The crisis screen runs first.                                                                                                                                                                                                              | A text answering Maya's follow-up gets Maya's reply within 60 s, and a crisis text gets the approved 988 reply (no persona). Opt-out is honoured.                                               | S0, S5                   |
| **S11 Honest delivery**                                         | Every send path records the provider's real result: push passes the token it means to use; email throws on a non-2xx. "Sent" is logged only on provider acceptance, and failures reach the ledger. Create the declared-but-missing `pondering` scheduler job, or delete its route and declaration.                                                                         | A forced provider failure on each channel logs `failed`, never `sent` (test per channel). The push helper with a registered token delivers on dev.                                              | ledger lane 2            |
| **S12 Capture worth following up**                              | Proactive triggers key on what's still **open**, not on "they've talked since". After-call extraction captures plans, promises and dates through the memory writer. `MORNING_BRIEF_COMMITMENTS` turns on once S4 reads the ledger.                                                                                                                                         | A fixture call with two real plans and a sign-off captures 2 items, not 3. A promise still open after the next call still triggers.                                                             | memory writer, S4        |
| **S10 Honest edges**                                            | Persona prompt rules: name what isn't connected and offer to connect; no invented reasons.                                                                                                                                                                                                                                                                                 | Judge rubric (yes/no): 0 invented access excuses across the persona eval set.                                                                                                                   | none                     |
| **X1 Crisis-lane item** (tracked privately, **Seth signs off**) | Scope, evidence and copy are tracked outside this public repo.                                                                                                                                                                                                                                                                                                             | Held-out verify by the crisis lane; Seth approves the final copy.                                                                                                                               | crisis lane              |

## Order

1. **Now:** S0 (unblocks texts and call outcomes), S1a and S1b (small; they wake up four specialists' existing context), then S1 (the biggest felt gap). S10 and X1 (crisis lane) run in parallel.
2. **With the ledger core:** S11 (honest delivery), then S2, S3, S4 and S12.
3. **Then** S5, followed by S6, S7 and S8 in parallel (different files).
4. **Last** S9, once S0 is in prod and S5 caps are proven.

Throughout, **widen the cohorts**: once a lane proves itself on the owner, roll it out cohort by cohort. A path with one recipient can't show whether it works.

## How we'll know

- **Prod, weekly:**
  - share of calls whose recall injects ≥ 1 follow-up (today 0);
  - share of handoffs with a non-empty brief (today 0);
  - per-persona follow-ups sent, failed and replied;
  - inbound texts accepted (today 0 of 10) and answered.
- **Eval:** a beat bucket in the memory v2 R6 life-script eval. It plants beat items and asks each persona on arrival "what's open with me?", scored on yes/no rubric items. It also covers arrival relevance after a handoff and invented-briefing count (target 0).
- **The owner's test:** an agent-hop call where every persona opens with something true and specific to its beat.

## Decisions for Seth (defaults applied until changed)

1. **Caps:** one follow-up per persona per week, three a week in total.
2. **Channel:** text by default; email only for long briefs; calls only for time-sensitive items you said yes to.
3. **Texts sign as the persona** ("— Maya, from Ferni"), so you know who to answer.
4. **Accounts:** Peter gets no portfolio connection for now. Read-only accounts are a later, separate decision.
5. **Health data:** Apple Health and Screen Time are a later, opt-in decision.
