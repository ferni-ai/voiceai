# Recall ledger: one record of everything Ferni does for you

Date: 2026-10-27 · Owner: lead session (sethford-ee) · Status: approved by Seth ("fix lane 0 first, then write the plan and staff lanes 1–7"; "fully built, production ready, green e2e")

## The problem, in one line

Ask Ferni "did you call my dad?" a day later and it can't tell you, because what it did for you is spread across five systems, none of which the call path writes to, and the only recall surface forgets after one mention.

## What we measured (prod logs 10-24..10-26, code at main 8722d1236)

**Calls didn't go out.** On 10-26, 11 `callOnBehalf` attempts after an explicit "yes" placed zero calls. "Yeah, go ahead and call." → preview again one second later (18:48:18). Same for "Yes, it's okay with me. Give him a call." (21:46:41) and "Yes, you should." (22:23:14). The yes matcher took the first match ("you" beat "you should"), lacked common yeses, and a refused yes voided the pending call, so Ferni looped. Fix in #2939 (lane 0a).

**Numbers weren't kept.** Dad's number, given at 18:47, was only previewed. Contacts are saved only when a call is placed, and an existing phoneless contact never gets a number (`call-on-behalf.ts`, the `if (contact)` branch). At 22:20: "I don't have a number for Doug". Fix in lane 0b.

**Outcomes are forgotten after one mention.** `pending-call-results.ts` reads `on_behalf_calls` from the last 24 h (unified: `background_results`, 48 h), shows them on the first turn only, and marks them delivered when the context is *built*, not when it's spoken. After that, nothing answers "what did mom say?". The `call_history` tool is an alias of `checkvoicemail`, which says "voicemail checking isn't set up yet". `follow_up_actions` is written and never read.

**On-behalf calls write to a throwaway identity.** A call made for you runs as `onbehalf:<callId>`. Memory recall, timeline, fast capture and profile writes are guarded. But about ten session-end and per-turn writers are not: session summary, relationship arc, seeds, persona affinity, conversation plan and user model, data capture (which can save a number the callee says), the thread recorder, and own-account tools. They write under an id nothing ever reads. What the callee said never reaches the owner's memory.

**The pieces exist and aren't joined.**

| Piece | State |
|---|---|
| Errands (`services/errands`, `stores/errand-store.ts`, `errand-outbox.ts`) | Complete, tested state machine. It has revision compare-and-set, an append-only events subcollection and a transactional outbox with lease and claim. Nothing creates, steps or wakes an errand. `ERRANDS` is off. |
| Follow-through (`bogle_users/{uid}/follow_through`) | Live. A Cloud Scheduler job polls every 5 min. `owner:'ferni'` exists for Ferni's own promises, but nothing produces them (the 10-10 call-commitments plan's Part 2 never shipped). |
| Deferred calls (`bogle_users/{uid}/deferred_calls`) | Live. A per-minute job claims pending → placing in a transaction. A crash between claim and dial leaves the call in `placing` forever. |
| Timers | Everything durable is Cloud Scheduler polling Firestore. Cloud Tasks is installed in `apps/async` but unused. No Cloud Workflows. |
| Contacts | Four stores: `entity_store`, `contact_relationships`, `user_contacts`, `bogle_users/{uid}/contacts` (no writer found). Lookup order: entity_store → contact_relationships → user_contacts. |

## The design

### 1. One activity ledger per person

`bogle_users/{uid}/activity/{activityId}`, one document per thing Ferni does or promises for you: a call, a text, an email, a reminder, a promise, an errand.

```
kind:        call | text | email | reminder | promise | errand
subject:     { contactId?, name, relationship? }      // who it's about or to
asked:       { at, sessionId, words? }                // the owner's request (short, no transcript)
state:       asked → confirmed → scheduled → in_progress → done | failed | cancelled
reason:      closed enum: call_hours | owner_declined | no_answer | voicemail | … (no free text)
scheduledFor, outcome: { status, summary, theySaid?: reported speech, actionItems[] }
told:        [{ at, sessionId, channel }]             // every time the owner was told
followUps:   [activityId]
links:       { onBehalfCallId?, deferredCallId?, followThroughId?, errandId?, reminderId? }
revision, createdAt, updatedAt
```

Changes are appended to `activity/{id}/events/{seq}` in the same transaction as the revision bump, copying the errand store's pattern (compare-and-set on `revision`, strict parser, quarantine unknown shapes). The ledger is the source of truth. Memory, timeline, search and BigQuery are readers.

**Privacy from day one:** `activity` joins `ERASED_STORES` and the "take your story" export in the same PR that creates it. It is never readable by an on-behalf session. It never stores a transcript, only short reported speech. Logs carry ids and counts.

### 2. A reliable writer

`recordActivity(uid, change, expectedRevision)` is the only way to write. Producers call it inside the same Firestore transaction as their own write, for example the `on_behalf_calls` write or the `deferred_calls` claim. So the ledger and the action can't disagree. Fan-out to semantic memory and BigQuery runs through the existing data-layer hooks (`onCallResultChange` pattern). If indexing fails, the ledger is still right.

### 2b. Lane 2 strategy: hook the choke points, retire the dead paths

A read-only inventory found about 40 send paths:
- 12 call paths and 10 text paths;
- 4 email paths and 6 push or in-app paths;
- 5 calendar paths;
- 5 promise or errand paths, plus a few that aren't really sends.

There are about 15 partial records, and two near-ledgers. `ferni_actions` is written only from the text-chat dispatcher, for 12 lowercase tool names. `bogle_users/{uid}/audit_log` has a read API but no writer. Instrumenting 40 sites one by one won't hold. Instead:

1. **Tool-initiated sends go through the existing gates.** Hook `ToolRegistry.register`'s `gateOutboundTool` wrapper, `withOutreachConfirmation` (the single confirm point, where `sentConfirmThread` already fires), `gateLegacyTool` and `tool-dispatcher`. One hook in each gate gives every registry, legacy and executor tool a ledger record at asked → confirmed → sent. The duplicate `agents/shared/tool-executors/*` implementations are covered by the dispatcher hook.
2. **Job-initiated sends go through the transports.** Hook the send layer itself: `sms-delivery.ts` (`sendSms`), `guarded-text.ts` `lockedSend`, `voice-call.ts` `callWithPersonaVoice` (which also starts storing the Twilio SID and adds a `StatusCallback`), `email-delivery.ts` and `email-transport`, and the push senders. Each transport writes a ledger event keyed by the caller-supplied `activityId`, or a new one with `source` set to the job name.
3. **Outcomes go to the record.** Twilio call and SMS status webhooks, the on-behalf lifecycle's `captureCallResult`, and `deferred_calls` transitions all update the same activity record. A deferred call links to its eventual `on_behalf_calls` id (missing today).
4. **Retire, don't instrument, dead or deceptive paths.** These include:
   - the concierge "I'll call N hotels", which simulates and dials nothing;
   - latent senders with no callers (`sip-bridge`, `voice-message-service`, `personalized-outreach.sendBatchMessages`, `notification-delivery`, Gmail send, the `task-queue` `send_sms`/`send_email` handlers);
   - the thinking-of-you job's raw text to an unverified `profile.phone`.

   Each retirement is its own small PR, and each gets a grep proving it has no live caller.
5. **First producers, by harm:** on-behalf call at dial time; deferred calls; `callWithPersonaVoice` one-way calls; raw `communication-service` sends; on-behalf texts (including with `ON_BEHALF_TEXT_GUARD=off`); `email-delivery`; direct pushes; Google-created calendar events.

Known bugs found along the way get their own issues, not lane 2 scope:
- `reachOut`'s "conversation" channel may file `scheduled_calls` under the contact, and may report a placed call as failed.
- A callback-required call result may be emailed twice.
- `outreach-worker` marks failed sends as sent.

### 3. Durable steps: use what's already running

All durable timing today is Cloud Scheduler polling Firestore, so lane 3 adds a per-minute **errand waker** job over `ErrandStore.due()` and `EffectOutbox.claimEffect()`, with runners for each effect kind. It also fixes the stuck-`placing` gap in deferred calls with a lease, plus a provider check on expiry: was the Twilio call created? Then mark the result, don't redial.

Cloud Tasks (a timed task per wake, named by `idemKey`) is the upgrade if per-minute polling proves too coarse. It needs IAM, a queue and a deploy path, which none exist today. Cloud Workflows adds nothing, because the errand state machine is the workflow.

### 4. On-behalf calls: attribution, not impersonation

The call keeps a non-owner session identity, so the person Ferni is talking to never gets the owner's memories or tools. That's a safety property, and we keep it.

But "blank" was wrong too. When mom asked "does he have you do this every Sunday?", Ferni had nothing to say. So the call agent gets a **scoped call brief**, built from the dispatch and the ledger:
- who it's calling for, and the relationship ("Seth's mom");
- why;
- the last few ledger records *with this contact*: when Ferni last called, what she said, and anything she asked to pass on.

It gets nothing else: no other contacts, no owner facts, no tools that read the owner's account.

What changes is *where results land*:
- Every writer that today keys on `onbehalf:*` is gated off (`isMemberIdentity`).
- The call's outcome and what the other person said become the ledger record's `outcome` under the owner, plus a fact attributed to that contact ("Mom said she's going to church Sunday"), reported speech, never instructions.

Contract: zero new `onbehalf:*` documents after a test call.

### 5. Recall reads the ledger

- **A `recallActivity` tool** answers "did you call my dad?", "what did mom say?", "why did you email me?" and "what's still open?" by person, time and status. It replaces the dead `call_history` alias.
- **Session start** includes a short open-items summary (scheduled, in progress, outcomes not yet told), with no 24 h or deliver-once cut-off. An item leaves the summary when it's closed and told, not when the context was built. `told` is recorded when Ferni actually says it.
- **Honesty:** Ferni says "done" only when the ledger says done, and "scheduled for 9 AM because of call hours" when it's deferred. This extends `call-status`, which already refuses to claim outcomes it doesn't know.

#### 5b. Being in the loop: before, during and after a call

From the verifier's "human gaps" list (seen in Seth's 10-24..10-26 calls, or confirmed absent on main):

- **Now or later.** Today the call-hours guard silently moves an out-of-hours call to the next opening ("I'll call later today at 9:00 AM their time"). Ferni decides for you. Instead, Ferni asks: "It's 10:40 PM for your mom. Call now anyway, or first thing tomorrow at 9?" The guard still never dials out of hours without that explicit "now". The ledger records the choice and the reason.
- **Live updates in the app.** Ringing, answered, voicemail, ended, and a one-line "she says hi" summary, pushed to the requesting session (the existing data-channel path in `call-result-capture.ts`) and to the iOS Live Activity and app. Each update is a ledger event, so the app and recall can never disagree.
- **Stepping in.** Mid-call, the owner can relay a line ("tell her I love her"), ask Ferni to wrap up, or end the call. The relay goes through the call's control channel as reported speech from the owner, never as an instruction to the callee's agent. Ending is immediate. Taking over (bridging the owner onto the line) is a later step and needs a design note.
- **The obvious follow-up.** After the call, if the other person asked for something ("tell Seth to call me back"), Ferni offers it: "Your mom asked you to call her back. Want me to remind you tonight, or call her Sunday?" A yes becomes a new ledger record linked as a follow-up. A missed call's next-day retry (`CALL_FOLLOWTHROUGH`) becomes a ledger follow-up too, instead of a separate system.

## 6. A real recall measurement

- **A held-out recall set** from Seth's consented history: who, what, when, outcome, what's still open, and changes over weeks. It's scored nightly by the AI judge panel (cloud judges are OK on Seth's own data). It is published in the nightly scorecard, and it fails on a planted regression.
- **LongMemEval and LoCoMo** abilities (multi-session, temporal, knowledge updates, abstention) are a secondary check. Seth's set decides.

## Lanes

Every lane ships behind its own flag, default **off**, on for Seth first (cohort). PRs are ≤ ~400 reviewable lines, branched from origin/main. Each PR goes to an independent verifier with the contract below, and gets armed only on a ferni-verifier PASS for its exact head.

| Lane | Delivers | Contract the verifier checks | Depends on |
|---|---|---|---|
| **0a** (#2939) | Yes-matcher fix | Seth's three real 10-26 replies place the call. A 40+ held-out set has zero false accepts (call or text pending). No re-preview loop. | none |
| **0b** | Save a contact's number when the owner says it | The number is given, the session ends with no yes, and the next session finds it. A phoneless contact gets the number. A different number is never silently overwritten. Nothing is saved from `onbehalf:*`. | none |
| 0c–e | #2942 (details drift between preview and yes), #2943 (76 s with no tool call after "Yes."), #2944 (question joined into the yes) | Each fix comes with a replay of its timestamped turns. | none |
| 0f | Dead air at 22:25 ("Ferni?" ×4, "It's not a crisis", no reply) | Root cause from the logs, plus a replay that gets a spoken reply within the dead-air gate. | none |
| 0g | "Did you call my dad?" at 21:46 got a fresh offer to call | Until lane 5 lands, `call-status` answers from `on_behalf_calls`/`deferred_calls`: "not yet, here's why", never a fresh offer when one is pending or done. | none |
| **1** Ledger core | Schema, `recordActivity`, events, parser, erase + export | Every write bumps the revision exactly once, and a stale revision is refused. Erase removes it, export includes it. A mutation drops the write and turns tests red. | plan |
| **2** Producers | Calls (prepare, confirm, place, outcome), deferred calls, texts, email, reminders, follow-through, errands | Every send path writes the ledger in its own transaction. The grep shows a live caller per path. A send with no record turns its test red. | 1 |
| **3** Durable steps | Errand waker job + runners; deferred-call lease and provider check | Kill the worker mid-step and the step runs exactly once. A crash after claim never redials. | 1 |
| **4** Attribution | Gate the about ten `onbehalf:*` writers; route outcome and the callee's words to the owner's ledger and the contact | A test call through the real agent session leaves zero new `onbehalf:*` docs, and the outcome and theySaid land under the owner. | 1 (routing), none (gating) |
| **5** Recall | `recallActivity` tool, session-start open items, `told` tracked when spoken, honest status | "Did you call my dad?" is answered right 7 days later, on dev, through a real session. Nothing drops after one mention. | 1, 2 |
| **6** Measurement | Held-out recall set + nightly score | The score is published, and a planted regression fails it. | none to build; scores after 5 |
| **8** In the loop | 8a now-or-later ask; 8b live call updates (session + iOS Live Activity); 8c relay a line / wrap up / end mid-call; 8d offer the follow-up afterwards | 8a: an out-of-hours request asks, and never dials out of hours without an explicit "now". 8b: each call state reaches the requesting session within 2 s and matches the ledger. 8c: a relayed line is spoken to the callee as the owner's words, and "end it" ends the call within 2 s. 8d: a callee's request becomes an offered follow-up, and a yes creates a linked ledger record. | 1 (records), 2 (call producer) |
| **7** Backfill | `on_behalf_calls`, `follow_up_actions`, `background_results`, `follow_through`, `deferred_calls` → ledger | Seth's last 30 days of calls and emails are recallable. The backfill is idempotent, so a rerun changes nothing. | 1, 2 |

**Order:** 0 now. Then 1, 4 (gating) and 6 in parallel. Then 2, 3, 5 and 8a. Then 8b–d and 7. Then Seth's cohort on in prod after a dev e2e. Last, everyone.

**Done means:** on dev, a real session asks Ferni to call a test contact, says yes, the call completes, and seven days later (time-shifted in a test, real in a canary) "did you call my dad?" and "what did he say?" are answered right from the ledger. The nightly recall score is green. Erase removes every activity record.

## Out of scope here

The facade collapse of the tool list (2026-09-30 plan), research-ahead, and voice latency.

## Open items to settle in lane PRs

- Whether SIP on-behalf calls ever reach the Twilio status webhook (`getPendingCall(CallSid)` vs the SIP `participantId`). Lane 2 settles this with a dev call. Until then, SIP completion relies on the agent lifecycle alone.
- Whether the knowledge-graph Cloud Scheduler jobs are deployed (`gcloud scheduler jobs list`). This only matters if lane 5 reads the graph.
- Agent prod flag values aren't in the repo. Lane PRs state the flag they need and its prod value, read from EFFECTIVE_SETTINGS.
