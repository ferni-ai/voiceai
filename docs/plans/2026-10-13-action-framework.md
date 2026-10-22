# Acting for you: one gate for everything Ferni does

Status: accepted (Seth, 2026-10-13: all nine decisions in section 6). Seth approved the direction on 2026-10-12: one safety frame for every action, low-risk actions first, and no money movement while Ferni is free (Stripe off). Owner: agency lane. Code map: origin/main e84c21f1b.

## Why

Ferni can already act for a person, but through five systems that overlap and disagree. Each one gets part of the job right:

| What exists | Where | What it gets right | What's wrong |
| --- | --- | --- | --- |
| Spoken-yes gate for outbound tools (on by default) | `outreach-confirm.ts:192`, list in `registry/outbound-gate.ts:35`, wrapped at `registry/index.ts:98`, listeners at `live-call-behaviors.ts:197` | Read-back word for word. Only the caller's next plain yes after the read-back counts (`isClearYes` :108, `confirmationState` :130). Owner only (`speakerIsAccountOwner` :209). Taken before sending, so a second call can't repeat it (:224) | In memory per session (`WeakMap` :78), so no record, receipt or audit. It gates tools by **name**, so a new sending tool missing from `OUTBOUND_TOOLS` isn't gated |
| Hash-bound page approvals (#881, #882, #889) | `approvals/pending-actions.ts`: `hashAction` :116, `consumePageApproval` :225, `/p/:id` | What runs is what was shown (sha256 of kind, owner, payload). Single use, 5 minute TTL. Money only with a passkey, never by voice (:130) | Nothing in production calls `createPendingAction`, so nothing runs through it |
| Trust levels and voice approval | `automation/trust-level-system.ts:132,540`, `agents/shared/action-approval-handler.ts:34,84,187`, `turn-handler.ts:556` | Nothing worth keeping | It earns autonomy: once `send_sms` reaches `trusted`, texts go out with no approval (`send-on-behalf.ts:169`). Its prefix classifier counts "yeah no" and "ok wait" as a yes, and it approves `pendingActions[0]` whatever was read back |
| `/api/automation` send routes | `automation-routes.ts:70,114`, `send-on-behalf.ts:188,291` | Nothing worth keeping | `execute` never checks approval or single use. It sends through raw Twilio with no STOP check and no quiet hours. **Reported to the lead 2026-10-12 as a security fix (P0 below)** |
| Two-phase action engine | `services/actions/action-engine.ts:211` | The prepare, confirm, execute, rollback states | In memory only (`action-store.ts:21`). `confirmAction` accepts a changed payload after the yes. Only commerce and rides use it |
| After-the-fact log | `action-tracker/tracker.ts:525` (`ferni_actions`), `tool-dispatcher-effects.ts:202`, `GET /api/story/actions` (`story-routes.ts:245`), shown in `activity.ui.ts:711` | The receipts panel exists | Written only after the tool ran. Failures are logged at debug level. It isn't linked to any confirmation |

The guards each path already has, which we keep:

- **Texts.** `sendOnBehalfText` (`guarded-text.ts`, #1277) sends only to a valid number, never after a STOP, not twice in 10 minutes, and not in quiet hours. It stores the number as a hash plus the last 4 digits. Since #1684 every text to a third party goes through it via `textOnBehalf`, behind the `ON_BEHALF_TEXT_GUARD` kill switch (on by default; `off` restores the unguarded send). `ON_BEHALF_TEXTS` never had a reader and was removed from the flag manifest on 2026-10-18.
- **Calls.**
  - `callOnBehalf` (`call-on-behalf.ts:380`) calls `initiateCall` (`on-behalf-call-orchestrator.ts:141`), which holds the call for call hours (:162) and then sends a signed dispatch (:356).
  - `call-confirm.ts` reads back the exact number that will ring.
  - Family check-ins (`family-checkin-caller.ts:62,161`) are set up by the sponsor and dispatched signed (:338).
- **Calendar.** `create/update/deleteCalendarEvent` (`smart-calendar-tools.ts:205,267,327`) write to Ferni's own calendar only (:257). They have no confirm step, and no undo beyond delete by id.
- **Reminders.** `setReminder` and `cancelReminder` (`reminders.ts:64,214`) go through `reminder-scheduler.ts:114`. `cancelReminder(id)` takes no user id (:414).
- **Routines.** `createRoutine` and `runRoutine` (`routines/index.ts:378,243`) live in `life_automation` (`firestore-life-adapter.ts:47`).
- **Proactive outreach.** The outreach orchestrator and `daily-outreach-job.ts` are gated by `outreach-consent.ts`: only channels the person turned on.
- **Executor path.** `outboundDispatchRefusal` (`tool-dispatcher.ts:173`) refuses outbound tools when there's no live call to hear a yes.
- **Idempotency.** Only the seed ledger has it (`seeds/ledger.ts:27`, `applySeeds` :167): each entry is keyed by its cause and written in one transaction.
- **Dispatch trust.**
  - Unsigned proactive dispatches are refused (#854).
  - A phone number is read from a signed dispatch only (`dispatch-phone.ts:24`).
  - Account claims come from signed metadata only (#1212, **still open**).
  - A join token is issued for the caller's own room only (#1217).
  - The unauthenticated check-in route was deleted (#1215).
  - The waitlist approval secret is required (#1189).
- **Bypass surface.** About 43 `.ts` files import a send primitive directly: Twilio SMS, the SMS or email delivery modules, SendGrid, or SIP (`git grep`, tests excluded).

**So we build no sixth system.** ActionGate combines three things that already work: outreach-confirm's spoken yes, pending-actions' hash binding, and the seed ledger's keyed transaction. It adds a durable record. The trust levels, `/api/automation` and the action engine retire once the gate covers their kinds.

## 1. The frame

1. **Intent.** A tool call. The model's arguments are a proposal, not a fact.
2. **Draft.** The gate turns the proposal into the exact effect:
   - what kind of action it is;
   - who it's for, as the resolved contact and the exact address;
   - what happens: the exact words, title or time;
   - when it happens.

   The draft is stored as a record in state `draft`, with `payloadHash = hashAction(kind, owner, payload)`. Nothing happens yet. Ferni reads it back.
3. **Confirm.** One of two things confirms a draft:
   - **Spoken:** the owner's plain yes, as the next caller turn after the read-back (`confirmationState`).
   - **Tap:** a tap in the app that carries the `payloadHash` the card showed (the `decidePendingAction` pattern, over the authenticated API, not the data channel).

   A changed draft needs a new yes. Nothing else confirms:
   - model text or tool output;
   - unsigned dispatch fields;
   - a guest or a third party on the line;
   - a phone session below full trust (`2026-10-11-phone-trust-levels.md`).
4. **Execute exactly once.**
   - The record id is the idempotency key. `confirmed → executing` is a single transaction, so two workers can't both take the record.
   - Effects in our own stores are written to a doc whose id comes from the action id, so a retry is a no-op (the seed-ledger rule).
   - External sends (Twilio, SIP) have no idempotency key, so they are **at most once**. A record left in `executing` is never sent again; it becomes `failed` with outcome `unknown`.
   - A repeated tool call with the same hash in the same session returns the existing record.
5. **Receipt.** `done` or `failed`, with the outcome, the time and the provider id. Shown in the panel and said on the call.
6. **Undo or cancel** within the kind's window, where the kind has a reverse step.

**Audit.** Every transition is appended to the same record: who made it, how, when, and from which state to which.

**Honesty.**
- A failure is said plainly, with its reason.
- An unknown outcome is said as unknown.
- Nothing is ever called sent before the record is `done`.

| From | To | When |
| --- | --- | --- |
| `draft` | `confirmed` | A yes or tap whose hash matches, within 5 minutes |
| `draft` | `cancelled` | A no, any other tool output, expiry, or a newer draft of the same kind |
| `confirmed` | `executing` | The executor takes it (lease transaction) |
| `confirmed` | `cancelled` | "Wait" or "stop" during the hold, or before a scheduled time |
| `executing` | `done` / `failed` | The executor's outcome (`failed.outcome`: `refused`, `error` or `unknown`) |
| `done` | `cancelled` | Undo inside the window, for kinds with a reverse step (`undoneAt` set) |

`failed` and `cancelled` are final. Retrying means a new draft.

## 2. Risk tiers

A kind's tier is set in code, never by the model.

| Tier | Examples | Confirmation | Read-back | Undo | Extra guards |
| --- | --- | --- | --- | --- | --- |
| **T0**: reversible, only affects you | reminders, notes, holds on your own calendar | The request itself, when every field came from the caller's words. Otherwise Ferni asks first | After acting: "Done, five pm today." | 10 minutes, by voice or tap | Owner only, full trust, at most 20 per day |
| **T1**: messages to others for you | texts, reachOut, setting up a family check-in | **Always**: spoken or tap | **The exact text, word for word.** A saved contact is read as name plus last four digits. A number the caller spoke is read in full (as `call-confirm.ts` does) | None once sent. A 15 second hold where "wait" cancels | guarded-text (STOP, gap, quiet hours), an identity line for the recipient, at most 10 per day |
| **T2**: commitments to third parties | booking, cancelling, calling a business for you | Always, plus the terms: time, party, cancellation policy, and what Ferni may agree to | Terms, and later the outcome | A cancel, which is its own T2 action | Ferni agrees only to what was confirmed. **Not in the first three** |
| **T3**: money | payments, purchases | **Out of scope.** The gate refuses any money kind and none is registered. A test fails if one is | n/a | n/a | When money returns, the bar is pending-actions' page plus passkey (never by voice) |

## 3. Where it lives in the code

- **`src/services/actions/action-record.ts`** (L3 agency, pure): the record type, the transition table and its checks, and `hashAction` (moved from approvals, which re-export it).
- **`src/services/actions/action-gate.ts`** (L3 agency): `propose`, `confirm`, `execute`, `undo` and `receipt`. Also a kind registry, where each kind has a tier, `draft(args, userId) → { payload, readBack }`, `execute(payload, key)` and an optional `undo`.
  - Executors are handed to the gate by L4 at session start, next to the outreach-confirm listeners in `live-call-behaviors.ts`. That is the same injection #1277 uses for its sender, so L3 never imports `services/outreach` (L4).
  - The session's transcript log (outreach-confirm) is the gate's spoken confirmation source. `withOutreachConfirmation` becomes a thin adapter over the gate until every `OUTBOUND_TOOLS` entry has moved.
- **`src/services/stores/action-record-store.ts`** (L1): Firestore `bogle_users/{uid}/action_records/{id}`. Every transition is a transaction.
- **Tools call `gate.propose(kind, args, ctx)`** instead of side-effect APIs.
- **The bypass test**, `src/services/actions/__tests__/action-gate-bypass.test.ts`, has two halves:
  - **(a) A static check, ratcheted.**
    - No file under `src/` may import a side-effect primitive: `external-apis/twilio-sms`, `twilio-sms`, `outreach/delivery/sms-delivery`, `email-delivery`, `@sendgrid/*`, `createSipParticipant`, the calendar write exports, or the reminder-scheduler writers.
    - The only exceptions are executor modules registered with the gate, and a baseline file listing today's ~43 importers, which may only shrink.
    - It uses the same comment-stripped scan as `menu-export-limits.emulator.test.ts:74` (#1263).
  - **(b) A runtime check.** Every registry tool mapped to a gated kind, built through `ToolRegistry`, returns a draft on its first call, while a fake executor counts 0 calls.
- **The record:**

| Field | Meaning |
| --- | --- |
| `id` | Idempotency key. `act_<uuid>`, or a hash of session, kind and payload when proposed in a call |
| `userId`, `kind`, `tier` | The owner comes from the verified session only, never from dispatch metadata (#1212) |
| `payload`, `payloadHash`, `readBack` | Exactly what runs and exactly what was said or shown |
| `state`, `transitions[]` | The state machine above. Each transition has `{ from, to, at, by: 'caller' \| 'tap' \| 'system', via }` |
| `origin` | `{ surface: 'voice' \| 'app', sessionId, toolCallId }` |
| `confirmation` | `{ how: 'spoken' \| 'tap' \| 'request', at, speakerVerified, transcriptSeq }` |
| `outcome` | `{ result: 'sent' \| 'written' \| 'refused' \| 'error' \| 'unknown', reason, providerId, at }` |
| `undoUntil`, `holdUntil`, `expiresAt` | The windows |
| `purgeAt` | A Firestore TTL that removes the recipient number and the body after 30 days. The receipt summary stays: kind, recipient name, last four, state, times |

- **Export and deletion.**
  - Deletion: covered already, because `bogle_users/{uid}` is a `USER_RECORD_ROOTS` entry (`user-stores.ts:18`).
  - Export: add `action_records` to the export allowlist (`KNOWN_USER_STORES`, #1263).
  - An emulator test asserts both.
- **Retire**, one PR each, once the gate covers the kind:
  - trust-level autonomy and the voice approval hook at `turn-handler.ts:556`;
  - `/api/automation` send and create;
  - new uses of the action engine;
  - `ferni_actions` writes. `GET /api/story/actions` will read `action_records` instead.

## 4. Voice UX

**Rules:**
- Ferni speaks as himself, in the first person, as a friend, never as an assistant.
- No AI talk with the person and no disclosure prompts (BRAND-VOICE-GUIDE.md: avoid "AI", "assistant", "As an AI").
- No em dashes or ellipses (`speech-markup-notes.ts`).
- Words that will be sent are quoted verbatim. Everything else is in his own words.
- Each proposal asks one question, a yes or no.
- He never says "done" before the record is `done`.
- No system words: action, executed, processing, request, confirmed.

| Moment | Ferni says |
| --- | --- |
| Propose a text to a saved contact | "Here's what I'll text your mom: 'Running ten minutes late, save me a seat.' Send it?" |
| Text to a number the caller spoke | "That's 801 555 4471, and I'll say: 'Call me when you land.' Is that right?" |
| Yes, after `done` | "Sent." (Later, if she replies: "Your mom wrote back. She says no rush.") |
| A change ("say twenty minutes") | Not a yes, so there's a new draft: "Okay: 'Running twenty minutes late, save me a seat.' Send that one?" |
| No | "Okay, I won't send it." |
| Refused (STOP) | "That one didn't go through. Her number has texts turned off, so I can't reach her that way." |
| Quiet hours | "It's late where she is. Want me to send it at eight tomorrow morning?" |
| Unknown outcome | "I'm not sure that went through, and I don't want to text her twice. I'll check and let you know." |
| Not the owner on the line | "I can only send that for the person whose phone this is." |
| T0 reminder | "Done. I'll remind you at five to call the pharmacy." |
| T0 undo ("actually, never mind") | "Gone, no reminder at five." |
| Calendar hold | "I've put a hold on Thursday, two to three, for the dentist. It's just on your calendar, nobody's invited." |
| Asking about a T0 field the caller didn't say | "Remind you when, this afternoon or tonight?" |

**Third parties.**
- Calls keep the opener approved on 2026-10-10 (#624): "Hi <name>, it's Ferni, <user>'s AI friend. <user> asked me to check in on you." The disclosure is said only there, and is never denied if sincerely asked.
- A text identifies itself the same way (decision 3).

**In the app**, the draft is a card showing the exact text, the recipient's name and last four digits, a Send button and a Don't send button. A tap goes to the same record. The receipts panel lists every record with its state, time, outcome and an Undo button while the window is open.

## 5. The first three actions

The build order is **reminders, then calendar holds, then texts.** This differs from the suggested order (texts first), on purpose: undo, receipts and exactly-once get proven on effects we can reverse before anything irreversible reaches another person. Texts are still the goal of this program. Every PR is ≤ ~400 reviewable lines and off by default.

| # | PR | Flag (default off) | Size |
| --- | --- | --- | --- |
| P0 | Delete or admin-gate `/api/automation` send-message, execute and create-event (security fix, not a feature). In progress (fix-reg-security): a minimal PR that makes the relay routes 404 goes first | none | about −150, plus about 60 of tests |
| 1 | `action-record.ts`, `action-record-store.ts` and `action-gate.ts`, with no callers. Export allowlist entry | `ACTION_GATE` | ~350 |
| 2 | Bypass test and baseline | none (test only) | ~150 |
| 3 | Reminders on the gate | `ACTION_GATE_REMINDERS` | ~200 |
| 4 | Calendar holds on the gate (Ferni calendar) | `ACTION_GATE_CALENDAR` | ~220 |
| 5 | Texts: reachOut's text branch goes through the gate to `sendOnBehalfText` | `ON_BEHALF_TEXT_GUARD` (the existing #1684 kill switch; no new flag) | ~300 |
| 6 | The receipts panel reads `action_records`, with undo | `ACTION_GATE` (web) | ~250 |

**Reminders (T0)**
- **Emulator contract** (`src/services/actions/__tests__/reminder-action.emulator.test.ts`):
  - A request writes one record and one reminder at `reminders/{actionId}`.
  - Replaying the tool call leaves the count at 1.
  - Undo inside 10 minutes deletes the reminder and leaves the record `cancelled` with `undoneAt`. After the window, undo refuses.
  - Another user can't cancel it (this fixes `reminder-scheduler.ts:414`).
  - With the flag off, today's path is unchanged.
- **Bypass:** `reminders.ts` comes off the baseline.
- **Voice eval** (`scenarios/action-reminder.txt`): the caller asks for a reminder, then changes their mind. It passes when one reminder is written and then removed for the eval user, Ferni's line names the time, and the judge finds no "AI" or "assistant" and no success claimed before `done`.

**Calendar holds (T0, own calendar)**
- **Emulator contract:**
  - The hold's event id comes from the action id.
  - Moving it is a new draft with a new hash.
  - Undo deletes it.
  - Overlapping a busy slot is said in the read-back.
  - Attendees are refused, because inviting someone is T1 or T2.
  - With the flag off, nothing changes.
- **Bypass:** the `smart-calendar-tools.ts` writes, including `blockRecoveryTime` (:1516), come off the baseline.
- **Voice eval** (`scenarios/action-calendar-hold.txt`): the caller holds a slot, then moves it. It passes with exactly one event at the moved time.

**Texts (T1)**
- **Emulator contract** with a fake sender:
  - The first tool call creates a draft and sends 0.
  - A caller's "yes" makes it `done` and sends 1. A replayed call returns the same record and still sends 1.
  - "Yeah, but to Bob" cancels it and sends 0.
  - A non-owner's yes doesn't confirm.
  - A number that sent STOP ends `failed/refused`, and Ferni says why.
  - A sender that throws after the provider accepted ends `failed/unknown` and is never re-sent.
  - In quiet hours nothing is sent and Ferni offers a time.
  - The draft expires at 5 minutes.
- **Bypass:** the reachOut text branch in `telephony-executor.ts` comes off the baseline.
- **Voice eval** (`scenarios/action-text.txt`): synthetic eval users never reach anyone (`testAccountReply`). The eval scores the verbatim read-back, the single question, and the honest "not sent" receipt. Seth checks one real send on dev to his own second number before the cohort flag.

**Rollout for each:** dev, then the friends-and-family cohort, then everyone. Never prod before dev has heard it (AGENTS.md).

## 6. Risks and decisions for Seth

**Accepted by Seth 2026-10-13:** all nine defaults below, as written.

1. **T0 confirmation.** **Act on the request, read it back, and allow undo for 10 minutes. Ask first only when a field wasn't in the caller's words.** The alternative is to ask every time, which is safer but chattier than a friend.
2. **Unsend window for texts.** **A 15 second hold where "wait" or "stop" cancels.** The alternative is to send instantly.
3. **How a text identifies itself to the recipient.** **The first text to a number starts "Ferni here, Seth's AI friend. Seth asked me to send this:", matching #624. Later texts are plain.** The alternative is the prefix on every text.
4. **Quiet hours.** **Offer to send at 8:00 their time, as a new draft with that time read back.** The alternative is to refuse.
5. **Retention.** **Remove the recipient number and the body after 30 days and keep the receipt summary.**
6. **Trust levels that earn autonomy.** **Retire them, so every T1 action is confirmed every time.**
7. **Google Calendar.** **Ferni's calendar first. Google write-through comes in its own PR after holds ship (it needs the write scope).**
8. **Phone sessions.** **Actions only at full trust once `PHONE_TRUST_LEVELS` ships. Until then, the owner-verified rule outreach-confirm already uses.**
9. **Daily caps.** **T0 at most 20 a day, T1 at most 10 a day, per person.**

**Risks:**
- **A gap in a name list.** A new sending tool is gated only if someone lists it. The ratcheted bypass test closes that, as long as the baseline only shrinks.
- **Two paths at once.** The legacy paths keep working until each retirement PR lands. P0 removes the dangerous one first.
- **Drafts are lost on restart.** The confirmation log is per session, so an agent restart drops pending drafts. They expire unsent, which is the safe direction.
- **Twilio has no idempotency key.** So texts are at most once: a crash mid-send is reported as "not sure", never sent twice.
- **#1212 is open.** Until it merges, the gate takes the user id only from the verified session, never from dispatch metadata.

**How we'll know:**
- The bypass baseline shrinks with each PR.
- No payload hash is ever `done` twice (a daily query).
- The counts of `done`, `failed` and `unknown`, with failure reasons, are reported on the receipts panel and in logs.
