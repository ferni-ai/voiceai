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

| Lane                                                                        | What                                                                                                                                                                                                                                        | Contract (testable)                                                                                                                                                  | Depends on               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **S0 Twilio public URL**                                                    | One shared helper that rebuilds the public URL Twilio signed (configured base, or `X-Forwarded-Host`, falling back to `Host`). All three Twilio routes use it: `sms-inbound`, `sms-status`, `conversational-call-status`. Tracked in #2679. | A real HMAC over the public URL passes on each route, and the same request over the internal host fails. In prod, the next inbound text logs `Inbound SMS received`. | none                     |
| **S1 Handoff desk**                                                         | The handing-off agent writes the caller's last request, any unfinished action and the open beat items into the brief. The arriving persona's first line comes from it, and a missing brief is never claimed.                                | Fixture: ask for a call to a contact, then hand off to Alex. Alex's first line names the call. 0 arrival lines claim a briefing when the brief is empty.             | call sheet M1/M6         |
| **S2 Beat declaration**                                                     | A `beat` field in each manifest; `beatFor()` (pure, in `memory/use-cases/`); one-owner resolution with Ferni as the fallback.                                                                                                               | Every open-item kind maps to exactly one owner. Each persona's view on a fixture life matches its table.                                                             | memory v2 C-lanes        |
| **S3 Persona relationship**                                                 | Wire the existing per-persona record: at each persona segment's end, write topics and one key moment through it into `relationships/{personaId}`. The desk reads it. No second relationship model.                                          | A second call to Maya opens with the last Maya topic, and Peter doesn't see Maya's note as his own.                                                                  | S1                       |
| **S4 Alex on the ledger**                                                   | The morning brief and Alex's desk read open items from the ledger and call sheet, not the legacy commitment stores.                                                                                                                         | Brief fixture: one dropped call, one done errand and one event appear. Junk commitments (sign-offs, bare pronouns) never appear.                                     | ledger lanes 1–2         |
| **S5 Rounds job**                                                           | One scheduled job runs each persona's round: new episodes and ledger entries → signals → at most one proposal → action gate → guarded sender in the persona's voice.                                                                        | Caps, quiet hours, the crisis quiet period and the minor hold all enforced (test each). Every send is a ledger entry.                                                | S2, S4, action framework |
| **S6 Maya's signals**                                                       | Habit signals from data already held: local call times, travel facts, mood trend, streaks.                                                                                                                                                  | Fixture life with five late-night calls: Maya proposes one sleep follow-up, and nothing for a fixture with no late nights.                                           | S5                       |
| **S7 Jordan's dates**                                                       | Dated facts (birthdays, trips, events) are extracted with `at`. Jordan follows up 14 days before and 1–2 days after.                                                                                                                        | A planted birthday fires exactly once at each cue, and not if cancelled (memory v2 R2).                                                                              | S5, R2                   |
| **S8 Peter's patterns**                                                     | A monthly pattern pass over episodes and the ledger. Insights are stored with provenance `ferni-inferred`.                                                                                                                                  | Fixture with a planted pattern: one insight; with no pattern: none. Never states an inference as fact.                                                               | S5, R1                   |
| **S9 Two-way texting**                                                      | An inbound text from a member goes into a text session with the same persona brain, guarded and replying as the thread's owner. The crisis screen runs first.                                                                               | A text answering Maya's follow-up gets Maya's reply within 60 s, and a crisis text gets the approved 988 reply (no persona). Opt-out is honoured.                    | S0, S5                   |
| **S10 Honest edges**                                                        | Persona prompt rules: name what isn't connected and offer to connect; no invented reasons.                                                                                                                                                  | Judge rubric (yes/no): 0 invented access excuses across the persona eval set.                                                                                        | none                     |
| **X1 Unknown callers and sexual content** (crisis lane, **Seth signs off**) | With an unidentified caller (no profile), a sexual topic gets a brief, warm boundary instead of engagement. No sexual-content entities are written to memory for unidentified callers. Also check why minor-care never flagged these calls. | A held-out set seen only by the verifier: 0 engaging replies, 0 such memory writes. Final copy approved by Seth.                                                     | crisis lane              |

## Order

1. **Now:** S0 (unblocks texts and call outcomes), S1 (the biggest felt gap), S10, and X1 (crisis lane, in parallel).
2. **After the ledger core:** S2, S3, S4.
3. **Then** S5, followed by S6, S7 and S8 in parallel (different files).
4. **Last** S9, once S0 is in prod and S5 caps are proven.

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
