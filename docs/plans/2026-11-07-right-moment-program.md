# Right-moment program: from follow-ups to the right moment

Status: plan, 2026-11-07. Docs only. Every flag named here is off (or shadow) by default in code.

Builds on: [follow-through](2026-10-12-follow-through.md), [right-moment memory](2026-10-31-right-moment-memory.md)
(caller card, one timely thing in the hello), [memory v2 retro](2026-10-29-memory-v2-retro-and-architecture.md)
(R2 cue triggers, R6 life-script eval) and [the memory call sheet](2026-10-27-memory-call-sheet.md).

## 1. Intent

The owner asked when Ferni will reach out and follow up like a person would, and then better than a person.
The program has three levels, and each one waits for the one before it:

1. **Human.** Ferni remembers what you told him, asks about it once, at a sensible time, and lets your answer
   close it. He does not ask twice, does not ask before it happened, and does not ask three things in one hello.
2. **Right moment.** He picks _when_ and _which_ from signals: your calendar, your time zone and quiet hours, how
   your last few calls felt, how you reacted to his past asks, and consented health data. Each ask is scored on
   how it landed, and the score tunes the next one.
3. **Predictive.** He notices what is likely coming (a deadline you always dread, a visit that usually goes
   badly) and prepares for it. A prediction reaches a prompt only once it is written down, measured and could be
   proven wrong.

For the people the owner cares about, Ferni never starts contact on his own. He suggests it to the owner, and
acts on a one-tap yes (section 7).

## 2. Today (source map on main, 2026-11-07)

"Default" is the code default from `src/config/flag-manifest*.ts` or `src/config/flags/*.ts`; it says nothing
about any environment's live value. LIVE = runs with no flag. OFF = flag off by default. DEAD = no runner.

| #   | Asker                                                                | Where (file:line)                                                                                                             | State                                                                                                                                |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | Proactive engine commitment insight, injected mid-call               | `intelligence/proactive/proactive-engine.ts:358`; gate `voice-agent/commitment-follow-up-gate.ts:247`; `turn-handler.ts:1908` | LIVE. Stable id since #2049; gated on crisis, heavy distress, 48 h per commitment, future events. **Does not use the opener claim.** |
| S2  | Greeting check-in (COACH_FOLLOW_THROUGH)                             | `multi-agent/greeting-direction.ts:141`; `commitment-follow-up.ts:247`                                                        | OFF (`flag-manifest.ts:80`), cohort-capable. Marks "followed up" at load (`commitment-follow-up.ts:278`), not when spoken.           |
| S3  | Same check-in in the first recall note                               | `multi-agent/memory-recall-hook.ts:302`                                                                                       | OFF (same flag). Shares S2's load.                                                                                                   |
| S4  | Recall open threads from summaries                                   | `session-recall.ts:256` `threadsForTurn`; `memory-recall-hook.ts:365`                                                         | OFF for the opener line (OPENER_FOLLOW_UP `flag-manifest-entries.ts:128`; RECALL_BRIDGE `flag-manifest-blocks.ts:49`).               |
| S5  | Recall-trigger commitment reminders                                  | `live-superhuman-reads.ts:159` → `triggers/recall-trigger-engine.ts:414`                                                      | LIVE path. `recordTriggerSurfaced` (`:194`) has no caller, so a surfaced reminder is never recorded.                                 |
| S6  | Dates that matter, asked at call start                               | `world-model/dates/recall.ts:57`; writer `dates/after-call.ts`                                                                | OFF (FRIEND_FOLLOWUPS `flag-manifest.ts:191`, DATES_THAT_MATTER `:101`).                                                             |
| S7  | Follow-through opener                                                | `multi-agent/follow-through-opener.ts:52`                                                                                     | OFF (`flag-manifest.ts:183`), cohort-capable.                                                                                        |
| S8  | Follow-through import (writer for S7, S9)                            | `agents/follow-through-import.ts:74`                                                                                          | OFF (`flag-manifest.ts:180`). Imports only caller-checked threads (#2092).                                                           |
| S9  | Follow-up texts job                                                  | `services/outreach/follow-up-texts.ts:46`, `:210`; route `background-delivery-jobs.ts:177`                                    | OFF (FOLLOW_THROUGH_JOB kill-switch `flag-manifest.ts:181`), plus a per-person flag. Re-reads forgotten topics before a text.        |
| S10 | Proactive-channels commitment trigger                                | `outreach/proactive-channels/more-triggers.ts:84`                                                                             | OFF (PROACTIVE_CHANNELS `flag-manifest.ts:320`, COACH_FOLLOW_THROUGH per person). Marks followed up after send (`:107`).             |
| S11 | Session-priming OVERDUE block + cooldown                             | `context-builders/superhuman/superhuman-session-priming.ts`                                                                   | DEAD: registry builders have no runner (`buildConversationContext` has no caller outside tests). PROACTIVE_COOLDOWN off.             |
| S12 | Commitment keeper "ready for caring follow-up"                       | `superhuman/commitment-keeper.ts:712`; computed at `better-than-human-integration.ts:296`                                     | UNCONFIRMED: computed live; whether the text reaches a prompt was not traced end to end.                                             |
| S13 | Trust-systems commitment follow-up builder                           | `context-builders/intelligence/commitment-follow-up.ts`                                                                       | DEAD (registry). Its asked-detector `noteAskedFollowUps` is called from `semantic-intelligence/follow-through.ts:78`.                |
| S14 | Greeting pondered ask, win, welcome-back, anniversary                | `multi-agent/greeting-direction.ts:402-405`                                                                                   | OFF (PONDERING `:310`, COACH_WINS `:82`, FRIEND_CELEBRATIONS `:187`). Already one-per-hello behind the first thread.                 |
| S15 | Weekly prediction check-in                                           | `multi-agent/prediction-check-in.ts:100`                                                                                      | OFF (WEEKLY_PREDICTION `flag-manifest.ts:448`).                                                                                      |
| S16 | Goodbye plans become commitments                                     | `personas/happy-exits.ts:44`                                                                                                  | OFF (HAPPY_EXITS `flag-manifest.ts:222`). A writer, not an asker.                                                                    |
| S17 | Pondered check-ins as app notes                                      | `proactive-channels/pondered-triggers.ts:133`                                                                                 | OFF (OUTREACH_PONDERED_NOTES `flag-manifest-entries.ts:144`).                                                                        |
| S18 | Long tail of "follow up" prompt strings (care points, handoff notes) | `memory/retrieval/session-priming.ts:366` and others                                                                          | UNCONFIRMED per string; care points take two summary follow-up items.                                                                |
| S19 | Between-call commitment pushes                                       | `api/scheduled-jobs/commitment-push.ts:117`                                                                                   | UNCONFIRMED: the handler exists; its trigger lives outside the repo.                                                                 |
| N1  | Date in the hello (#3238)                                            | `multi-agent/greeting-date.ts:124`; arbiter `first-thread.ts:22`                                                              | OFF (DATES_IN_HELLO). Claims the opener; skips on crisis risk (`:92`).                                                               |
| N2  | Call news in the hello                                               | `multi-agent/call-news-opener.ts:121`, `:270`                                                                                 | OFF (CALL_NEWS_OPENER), cohort-capable. Leads `firstThread`; skips on crisis risk. Does not claim.                                   |
| N3  | Connect asks (calendar first)                                        | `services/connect-moments/`; flag `CONNECT_MOMENT_CALENDAR`                                                                   | OFF. Invite and redeem landed (#3336, #3343); `createConnectInvite` has no caller yet, so the in-call ask is not on main.            |
| N4  | Promise check-ins keyed on "still open" (#3120)                      | `proactive-channels/triggers.ts:94`                                                                                           | OFF (OPEN_PROMISE_TRIGGERS).                                                                                                         |
| N5  | Reach-out cancel / reschedule (#3294)                                | `outreach/upcoming-outreach-actions.ts:114`, `:131`                                                                           | OFF (REACH_OUT_ACTIONS). An owner control, not an asker; texts reuse it.                                                             |
| N6  | Caller card (context, not an ask)                                    | `multi-agent/caller-card/index.ts:32`; `agent-setup.ts:345`                                                                   | OFF (CALLER_CARD). Skips MINOR_CARE accounts, fails closed.                                                                          |
| N7  | Emotional-moment check-in on the legacy voice path                   | `voice-agent/greeting-proactive-context.ts:54`                                                                                | UNCONFIRMED whether the legacy greeting handler still runs on calls. Marks followed up at load.                                      |

The ledger work landed: #2049 (stable S1 id), #2084 (ledger fields and a compare-and-set `ask`, still dormant:
no caller outside `services/follow-through/`), #2092 (import only caller-checked threads).

**The root problem is unchanged.** There are many askers. Only three of them (greeting check-in, greeting date,
recall thread) share the opener claim, and that claim is per process and keyed by user, not by call. S1 and S5
fire mid-call with their own memory. Several mark a topic "followed up" when it is _loaded_, not when it is
_said_. Nothing closes a topic from the caller's answer. Before #2049, a live asker fired on most call starts in
a week, often on the same topic.

## 3. One proactive budget

**Decided:** at most one Ferni-started thing per call, across every asker. A crisis resource is never an "asker"
and never waits for the budget.

**The seam.** `src/memory/recall/opener-claim.ts` already holds `OpenerAsker` and `claimOpenerFollowUp` /
`takeOpenerClaim` (#3238). This plan extends that file into the per-call budget (section 8b rule 5) instead of
adding a second mechanism. The askers call it at these points:

| Asker                                | Call site                                                               | Owner lane           |
| ------------------------------------ | ----------------------------------------------------------------------- | -------------------- |
| Hello: call news, letter, date       | `greeting-direction.ts`, after `firstThread()` picks                    | caller-card lane     |
| Hello: check-in, win, pondered ask   | `greeting-claim.ts:54` (already claims)                                 | caller-card lane     |
| Caller card                          | `caller-card/index.ts` `callerCardText`, read-only `peekProactiveSlot`  | caller-card lane     |
| Recall thread in the first note      | `memory-recall-hook.ts:395` (already takes the claim)                   | this program         |
| Mid-call commitment insight (S1)     | `commitment-follow-up-gate.ts` `surfaceProactiveInsight`, before inject | this program         |
| Recall-trigger reminders (S5)        | `live-superhuman-reads.ts`, before a reminder is added                  | this program         |
| Follow-up arbiter (PR3+)             | its runtime pick, before the line is added                              | this program         |
| Connect ask                          | the ask tool, before it speaks                                          | connect-moments lane |
| Outreach suggestion for someone else | the suggestion line, before it speaks                                   | this program         |

The caller card and the greeting date belong to the caller-card lane. This program only consumes them and asks
that lane to switch its two call sites to `claimProactiveSlot` (rule 5) when it is ready; the old functions keep
working until then.

`greeting-direction.ts` (489 lines) and `memory-recall-hook.ts` (487) sit near the 500-line ratchet, so new logic
goes into small helpers next to them, not into those files.

## 4. Level 1: human

Owner decisions, as decided: Ferni-started follow-ups come every other call at most, at most three a week, and
never the same topic within 48 h. A per-person learner adjusts from there. Ferni asks, and so does the persona
the caller told. Texts are for big, non-sensitive events only, when no call happened within two days, at most one
a week, never in quiet hours.

The design's PR1 and PR2 landed (#2049, #2084). The remaining PRs, updated for main:

| PR  | What                                                                                                                                                                                        | Flag (default)               | Files                                                                                  | Tests                                                                                                              | Size | First real reader                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------------- |
| B0  | **Budget API.** Extend `opener-claim.ts` per rule 5; old functions wrap the new one; the S1 gate and the recall hook call it.                                                               | PROACTIVE_BUDGET (off)       | `memory/recall/opener-claim.ts`, `proactive-budget.ts`, `commitment-follow-up-gate.ts` | one-per-call across two askers; crisis spends to zero for the rest of the call; off = today's behaviour (snapshot) | ≤250 | S1 gate and the recall hook                        |
| B1  | **Arbiter + appetite learner + after-call plan, shadow.** Pure `pickThread` with gates G1–G11, Beta(2,1) appetite, plan written after the call.                                             | FOLLOW_UP_BRAIN (off/shadow) | `services/follow-through/arbiter.ts`, `appetite.ts`, `plan.ts`, after-call register    | each gate red/green; learner moves budget both ways; shadow logs kinds and counts only                             | ≤380 | the after-call task that writes the plan           |
| B2  | **Salience writer.** One cheap judge per call marks which threads are big, sensitive, dated.                                                                                                | FOLLOW_UP_SALIENCE (off)     | `services/follow-through/salience.ts`, import path                                     | sensitive never texted; a dated thread is never premature; judge timeout fails closed                              | ≤380 | B1's arbiter                                       |
| B3  | **Spoken-only runtime, answers close threads.** The arbiter's pick claims the budget; "asked" is written only when the line is spoken (#2084 `ask`); the caller's answer closes or snoozes. | FOLLOW_UP_BRAIN=on           | runtime pick, `follow-through/follow-up.ts` callers, the recall hook helper            | asked only on speech; "already talked" closes; same topic never within 48 h                                        | ≤400 | the live call (first live caller of #2084's `ask`) |
| B4  | **Silence the legacy askers.** S1, S2/S3, S5, S10 and N7 stand down when FOLLOW_UP_BRAIN=on. Lands in the same release as B3; neither flips alone.                                          | FOLLOW_UP_BRAIN=on           | the five call sites                                                                    | with the flag on, each legacy asker is silent; off, unchanged                                                      | ≤300 | the live call                                      |
| B5  | **Answer effects and learning.** Answers update appetite; "don't ask me about that" forgets; a brush-off lowers appetite.                                                                   | FOLLOW_UP_BRAIN=on           | `appetite.ts`, `follow-through/answer-effects.ts`                                      | a forget removes future candidates; a brush-off lowers budget; never below the floor                               | ≤280 | B1's learner                                       |
| B6  | **Texts on the same brain.** S9 reads the arbiter; S17 and N4 go through it; cancel/reschedule (#3294) is the owner's control.                                                              | FOLLOW_THROUGH_TEXTS (off)   | `outreach/follow-up-texts.ts`, `proactive-channels/triggers.ts`                        | text rules above; quiet hours; one shared weekly count with calls                                                  | ≤320 | the follow-up texts job                            |

Dropped from the design: the "stop the live repeat" PR (#2049) and the ledger PR (#2084). Merged: the design's
"import only checked threads" step is #2092. S11 and S13 stay dead; no PR revives them.

## 5. Level 2: right moment

Starts only after Level 1's metrics hold for two weeks on the owner cohort (section 9).

- **Signals.** Calendar (only through a connect moment the owner said yes to), the caller's time zone and quiet
  hours, the mood and energy trend over recent calls, past reactions to asks, and consented health data. Each
  signal is optional; a missing signal never blocks an ask, it only removes a boost.
- **Per-person appetite.** The B1 learner gains context: time of day, call length, and whether the caller opened
  with their own reason.
- **Landing score.** Every ask gets one label after the call: _engaged_ (they talked about it), _brushed off_
  (short answer, topic change), or _irritated_ (pushback, "you asked me that"). Logged per ask as
  `{ kind, landing, persona, hour, topicHash }`, never the words. Labels come from a small judge with a
  cross-family check on a sample.
- **Shadow first.** Four to six weeks in shadow on the owner cohort: the right-moment picker logs what it would
  have chosen next to what Level 1 chose. It goes live only if its picks would have landed better on the labelled
  asks.

Flags: RIGHT_MOMENT (off/shadow), LANDING_SCORE (off).

## 6. Level 3: predictive

Precondition: Level 1's metrics are met, and Level 2 has run its shadow.

- **Built on** the bi-temporal facts store (what was true when), R2 cue-triggered intentions (a planted intention
  fires once at its cue, never when cancelled) and the activity ledger (dates and promises as kinds).
- **A prediction is a record**, not a sentence: `{ claim, cue, expectedBy, howWeWillKnow }`. It reaches a prompt
  only when `howWeWillKnow` names a later observation that could prove it wrong. Wrong predictions lower the
  predictor's weight for that person.
- **Measured** by the R6 life-script eval at three and nine weeks, judged cross-family. A predictive ask that
  scores worse than Level 2 on landing is turned off.

Flag: PREDICTIVE_MOMENTS (off).

## 7. Reaching other people: suggest, then yes

**Decided (2026-11-07):** Ferni never starts contact with anyone other than the owner on his own.

- He suggests it to the owner: "Sam's appointment was Tuesday. Want me to check in on her?" A one-tap yes (in the
  call, or on a text link) is the only thing that can start the contact.
- The suggestion spends the call's one budget slot like any other ask.
- Before any link or call, the owner-proven predicate must hold: the caller is the verified owner, alone on their
  own line. An unrecognised caller never hears a suggestion about someone else.
- The person contacted is never surprised: the first contact says who asked and why, in plain words.
- Quiet hours are the callee's, in the callee's time zone; unknown means daytime only.
- Nothing sensitive goes by text, to the owner or to the callee.
- Minors: no suggestion about a minor, and no contact with a number held under MINOR_CARE.
- A callee in crisis still reaches the owner at once (existing behaviour, unchanged).

PR B7: OUTREACH_SUGGEST (off), ≤300 lines, first reader the follow-up arbiter. Tests: the arbiter's output type
for a third-party candidate is a suggestion and nothing else; a yes is the only path to the existing send/dial
tools; unknown caller gets none.

## 8. Guardrails

- **Crisis.** No Ferni-started ask in a call where crisis risk fired (`crisisRiskThisCall`,
  `services/safety/crisis-call-risk.ts:176`) or within 72 h after one. Heavy topics wait seven days. Nothing here
  may lower crisis recall or change a crisis line; the crisis gate runs on every PR that touches a turn path.
- **Minors.** MINOR_CARE means nothing personal is asked and nothing is texted.
- **Forgotten topics fail closed.** A forget read that is late or fails means no ask on that topic.
- **Privacy.** Logs carry hashes, kinds and counts, never words. Answers are owner-only.
- **Latency.** Call start p50 adds 0 ms: the plan is precomputed after the call; the runtime only reads it.
- **Cost.** One salience judge per call, after the call. No extra in-call model calls.

## 8b. Hard seams

1. **Safety is outside the budget.** The budget can never delay or drop a crisis resource. On a crisis turn and
   for the rest of that call, every proactive asker is suppressed (budget spent to zero), not ranked lower.
   _Test:_ after a crisis-risk turn, `claimProactiveSlot` returns `{ ok: false, heldBy: 'safety' }` for every
   asker until the call ends, even after the risk TTL lapses; the crisis reply on that turn is byte-identical with
   the flag on and off.
2. **Holds win.** A DV hold, MINOR*CARE, an opt-out or STOP, or a forget request removes that caller's (or that
   topic's) candidates before the arbiter scores anything. No DV hold symbol exists on main yet, so the arbiter
   takes holds through one port that a DV hold can join. \_Tests:* one per hold, each asserting the candidate
   list is empty before scoring (the scorer is a spy that is never called).
3. **The third-party rule lives in code.** A candidate that would contact anyone but the caller can only produce
   a one-tap owner suggestion. _Test:_ an import-graph test proves the arbiter module cannot reach any send or
   dial function, and a type test proves a third-party candidate has no other output.
4. **Off or shadow by default.** Shadow logs record what would have been asked as counts and kinds only.
   _Test:_ a shadow-log test fails if any string field other than the kind and a hash is present.
5. **The claim API.** In `src/memory/recall/opener-claim.ts`, extending `OpenerAsker`:

   ```ts
   export type ProactiveAsker =
     | OpenerAsker // 'greeting' | 'greeting-date' | 'recall-thread'
     | 'call-news'
     | 'caller-card'
     | 'follow-up'
     | 'commitment-insight'
     | 'recall-trigger'
     | 'connect-ask'
     | 'outreach-suggestion';

   export type SlotResult = { ok: true } | { ok: false; heldBy: ProactiveAsker | 'safety' };

   /** Take this call's one proactive slot. False when taken, or when the call is safety-held. */
   export function claimProactiveSlot(
     sessionId: string,
     by: ProactiveAsker,
     now?: number
   ): SlotResult;
   /** Who holds the slot, without taking it (the caller card reads this). */
   export function peekProactiveSlot(sessionId: string): ProactiveAsker | 'safety' | undefined;
   /** Crisis: spend the slot for the rest of the call. Sticky; only call end clears it. */
   export function spendForSafety(sessionId: string): void;
   /** Call end. */
   export function releaseProactiveSlot(sessionId: string): void;
   ```

   Keyed by session, not user, so two calls never share a slot. `claimProactiveSlot` itself checks
   `crisisRiskThisCall(sessionId)` and calls `spendForSafety` on a true read, so no asker has to remember.
   `claimOpenerFollowUp` and `takeOpenerClaim` stay, as wrappers, until every caller moves. With
   PROACTIVE*BUDGET off, the wrappers behave exactly as today. \_Test:* two askers on one session, one wins; a
   second session is unaffected; the off snapshot matches main.

## 9. Metrics

Measured per call from logs (kinds, counts and hashes) on the owner cohort, then wider.

| Metric                                                 | Target                     |
| ------------------------------------------------------ | -------------------------- |
| Repeat-ask rate (same topic within 48 h)               | 0                          |
| "Already talked about this" rate                       | under 5% of asks           |
| Premature-ask rate (asked before the event)            | **0, hard**                |
| Answer rate (the caller engaged with the ask)          | rises vs Level 1 baseline  |
| Closure rate (the answer closed or snoozed the thread) | over 80% of answered asks  |
| Ferni-started asks per call                            | at most 1, always          |
| Engagement after a follow-up (call length, turns)      | no drop vs calls without   |
| Listening panel: "felt like a friend remembering"      | rises; "felt nagged" falls |

## 10. Rollout and order

1. B0 (budget API), then the caller-card lane moves its two call sites to it.
2. B1, B2 in shadow on dev, then the owner cohort.
3. B3 + B4 together on dev, then the owner cohort, then friends and family, then wider.
4. B5, B6, B7 in the same order.
5. Level 2 shadow (four to six weeks), then Level 3.

Every flag is off by default. A cohort widens only when section 9 holds on the one before it.

## 11. Open questions (each has a default)

1. **Does the persona the caller told count against the weekly three?** Default: yes, one shared count.
2. **Does a connect ask's own limit (two per 14 days, none on a first call) also apply on top of the one slot?**
   Default: yes, both apply.
3. **When call news and a due follow-up both qualify, which wins?** Default: call news (it is about something
   Ferni did for them), and the follow-up waits a call.
4. **What counts as "heavy" for the seven-day wait?** Default: the salience judge's sensitive label, plus any
   topic from a call where crisis risk fired.
5. **Does a text-link yes for a third-party suggestion expire?** Default: 24 h, single use.
6. **Is N7 (the legacy greeting path) still reachable?** Default: treat it as live and silence it in B4.
