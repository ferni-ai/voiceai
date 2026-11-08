# Sit on hold for me

Date: 2026-10-31 · Status: design, decisions made by the lead are marked "decided"; open questions at the end carry defaults · Code at `origin/main` `1427f545a`

Design findings from the drafting pass, each **accepted by lead**: the hold flag is read once in the owner's session and carried in the signed dispatch (section 6); input STT keeps flowing while `onUserTurnCompleted` plus `StopResponse` stops the model (5.4); the bridge prefers a screened self-call then `moveParticipant`, or `WarmTransferTask`, and the plain same-room dial stays owner-only until the human check is proven (5.7, O1); only the owner's quiet hours are overridden and the recipient's `CALL_HOURS_GUARD` still applies (section 4, O5); net-zero edits on files at or over 500 lines (section 3).

Builder-check rulings (lead, 2026-10-31) follow section 4. They override anything earlier in this document, and the sections they touch are updated to match.

Evidence (outside the repo, in the research folder; what matters is restated here): `killer-features-2026-10-31/design-inputs-A-memory-B-hold.md`, section B. Every file and line below was read at `1427f545a` unless it says UNCONFIRMED.

Builds on: [`2026-10-27-recall-ledger.md`](2026-10-27-recall-ledger.md) (on-behalf calls are attribution, not impersonation; the on-behalf session never sees owner data) and the errands model in `src/services/errands/`.

## 1. Intent and why

Waiting on hold is the most hated 45 minutes of a normal week: the cable company, the insurer, the airline, the tax office. Ferni already places calls for people (`callOnBehalf`). The next step a friend would take is: "Give me the number. I'll wait. I'll ring you the second a real person picks up."

That is the whole feature:

1. The owner asks Ferni to hold for them. Ferni reads back what will happen, and the owner says yes.
2. Ferni calls, gets through the phone menu, and waits quietly.
3. When a person answers, Ferni says who it is and "one moment", and rings the owner's phone. The owner is asked "someone's on the line for <business>, ready?" and says yes or presses 1. Only then does the person hear "connecting you now" and the owner join. Ferni leaves, and the owner talks to the person (ruling 4).
4. The owner is texted when the hold starts and when it ends, and can see the state of it. A hold whose call silently dies is caught within minutes and the owner is told (ruling 1).

Why it is worth building now: the stack to place, supervise and report on a call exists (section 5.1). What is missing is small and specific: nothing in `src` sends a tone, recognises hold, tells a person from a recording, or lets a call live past 15 minutes. Today an IVR gets a quiet hang-up, a long silence trips a 35-second hang-up, and the AMD dial option kills the SIP leg at 15 minutes.

## 2. Goals, non-goals, anti-goals

### Goals
- G1. Mode (a), decided: hold, detect a human, bridge the owner in. The owner only talks to people.
- G2. A hold costs almost nothing while waiting: no LLM turn per hold message, no speech from Ferni, bounded minutes.
- G3. Never a wrong bridge: a recording must not be mistaken for a person (the owner is rung for nothing), and a person must not be left waiting.
- G4. Safe by construction: nothing credential-shaped is ever sent to a phone menu, and no personal data goes to a menu or a person beyond what the owner approved in the read-back.
- G5. Honest at every step: the person hears an AI disclosure when they appear, the owner always knows the state, and a failure ends in a text, not silence.
- G6. All behind a cohort flag, off by default, owner first.

### Non-goals (this build)
- Mode (b): Ferni handles the errand itself after the person appears. Later, as an `ERRANDS` runner effect (section 12).
- Payments, anything a bank or card needs, and health or insurance PHI disclosure. Decided: not in this build.
- A per-owner concurrent-hold cap. Decided: not in this build; the default value for it is 1 (section 12, O4).
- Recording audio. Nothing records audio today (`grep Egress|startRoomComposite|startTrackEgress` finds nothing in `src`), and this build adds none.
- Texting the business, emailing, or any channel other than the phone call and texts to the owner.

### Anti-goals (never)
- Entering an account number, PIN, date of birth, card digits or any digit string the menu did not offer as a choice.
- Ferni deciding things for the owner in a live conversation with a person. Decided mode (a) exists to avoid that.
- Saying "this call may be recorded". Nothing is recorded; the line would be false (`compliance.ts:190` builds it and no one sends it; do not wire it).
- Hanging on forever. Every hold has a hard stop and an honest ending.
- Ringing the owner for a recording, or at a number the model supplied.

## 3. Constraints

- `AGENTS.md`: flag-off PRs of 400 reviewable lines or fewer; clean architecture; names that say what a thing does (`hold-line.ts`, not `manager.ts`); one way to do each thing; fictional fixtures (business "Northwind Cable", numbers 555-01xx).
- No dead code: each PR lands with its first reader (`pnpm quality:knip`). Files over 500 lines may not grow: `on-behalf-call-orchestrator.ts` is 902 lines, so every edit there is net zero or negative and new logic goes in new modules.
- Layer map (`apps/cli/src/commands/quality/architecture-layers.ts`): `src/agents/outbound-call` is L5, `src/services/outreach` is L4, `src/agents/multi-agent` is L4. New pure logic in `outbound-call/` imports no LiveKit; the LiveKit adapter is a separate file, like `call-opening.ts` and `livekit-call-opening.ts`.
- *(Accepted by lead.)* Cohort flags are written into `process.env` at call start for the owner's own session, and only while one call runs per process. The outbound hold call runs in a different process, dispatched with a signed payload. So **`HOLD_ERRAND` is read in exactly one place: the dispatch decision in the owner's session**, and the result travels in the signed dispatch (section 6). The outbound session never re-reads the flag.
- Files at or over 500 lines: edits are net zero or negative *(accepted by lead)*.
- Voice text rules: no em dashes, ellipses or stage directions in anything Ferni says. No AI-disclosure prompt changes: Ferni speaks as himself and the existing outbound disclosure line is reused word for word.
- Platform: `@livekit/agents` 1.9.3 (ships `beta.sendDtmfEvents` and `workflows.WarmTransferTask`), `@livekit/rtc-node` 1.1.0 (`publishDtmf`), `livekit-server-sdk` 2.19.1. Prod is LiveKit Cloud; how long Cloud lets a job live through a deploy is UNCONFIRMED, so deploys are never done with a hold live (section 11).
- Deploys: prod claim before any prod `lk agent` change; deploy only commits on `origin/main`; never restart dev with a room open. A deploy or secrets update drops live calls, and a 45-minute hold is a live call.

## 4. Decisions already made (not reopened here)

- First build is mode (a) only. Mode (b) later, as an `ERRANDS` runner effect.
- `HOLD_ERRAND` is a cohort flag, off by default.
- State machine in `src/agents/outbound-call/hold-line.ts`: `dialing -> ivr -> hold -> human -> bridging | done | owner_unreached`.
- An interactivity probe tells a person from a recording.
- While on hold, mute the session's audio input and output so the LLM takes no turns.
- `beta.sendDtmfEvents` is registered only in hold sessions, with a DTMF allow-list that refuses anything credential-shaped (menu choices only: no account numbers, PINs or card digits).
- `machine-ivr` routes to hold instead of hanging up, only when `HOLD_ERRAND` is on and the call objective is hold.
- Timers lifted only for hold sessions: silent-line 35 s / 120 s; the AMD 15-minute SIP cap becomes 60 minutes; call-result-watch 30 becomes 90 minutes; cap LLM turns; filter hold chatter out of transcript intelligence.
- Bridge: when a person answers, say the existing outbound disclosure line plus "one moment", dial the owner's verified phone into the same room, then Ferni leaves while the room stays up. Evaluate `WarmTransferTask` from `@livekit/agents` 1.9.3 first. Ruling 4 adds an owner readiness check before the owner joins, which needs a private owner leg (5.7).
- Consent: the read-back captures the owner's explicit yes to "ring me when someone answers", which overrides quiet hours for that call only. Never give the IVR or the human personal data beyond what the owner approved in the read-back.
- Live status goes to `on_behalf_calls/{id}`: `on_hold`, `human_detected`, `bridged`, `owner_unreached`. The owner gets a short text when the hold starts (with an estimate if the IVR says one) and when it ends.
- Not in this build: payments, health or insurance PHI disclosure, a per-owner concurrent-hold cap (default 1).

Two clarifications of "overrides quiet hours for that call only" that the builder must keep (accepted by lead): it covers **the owner's own** quiet hours and Focus (the ring and the two status texts), and it does **not** cover the recipient's calling hours. `CALL_HOURS_GUARD` (on) still applies outside 9:00 to 20:30 in the recipient's zone, but a hold is never deferred silently: the owner is told the business is closed and asked whether to try at opening (ruling 2). `CALL_NOW_OWNER_OVERRIDE` stays a separate, off, owner-words-only switch (open question O5).

## Builder-check rulings (lead, 2026-10-31)

The builder checks came back; these rulings override anything earlier in this document and are applied in the sections they touch.

1. **Heartbeat and stale-hold sweeper.** The hold session writes `heartbeatAt` every 30 s. A stale-hold sweeper, its own PR (H8), sets `holdStatus=failed` after 3 minutes with no heartbeat and texts the owner "the hold call dropped; want me to try again?". The deploy check ignores stale heartbeats. (5.2, 7 row 10, 9, 11, 13)
2. **Outside the recipient's hours, never defer silently.** Ferni replies "they're closed now; want me to try when they open at <time>?". On a yes it schedules the hold and re-confirms by text before dialing. Consent is fresh for every dial. (4, 8, 13 H1b, O5)
3. **The H0 spike uses a test IVR we own.** A Twilio number with a TwiML menu, hold music and a scripted "rep", plus dev calls to Seth's own phone. No real businesses. H0 also checks that DTMF passes over the outbound trunk. (5.1, 10.2, 10.3, 13 H0)
4. **The owner confirms before the join.** "Someone's on the line for <business>, ready?", answered by a spoken yes or keypad 1. The person at the business hears "connecting you now". Bar: p50 at most 35 s from person detected to bridged. (1, 5.3, 5.7, 8, 10.4, 13 H6, O1, O10)
5. **A business voicemail gets nothing.** Leave no message, set `endReason` to `voicemail`, text the owner. (5.3, 9)
6. **The reducer gets a periodic tick event** as well as `onUserTurnCompleted`: VAD- or transcript-delta-driven, at least every 10 s. (5.3, 5.4, 13 H4)
7. **Owner progress texts go through the guarded owner sender, regardless of `CALL_RESULT_TEXT`.** The owner's SMS opt-out still applies. (6, 9)

## 5. Architecture

### 5.1 What exists (verified) and what the hold reuses

The on-behalf stack, end to end:
1. Tool `callOnBehalf` (`src/tools/domains/telephony/call-on-behalf.ts`, schema `call-on-behalf-schema.ts`), in every persona's core set. `OUTBOUND_CONFIRM` (on) enforces a server-side read-back and a spoken yes, owner proven on the live call (`src/tools/registry/outbound-gate.ts`, `call-confirm.ts`), 5-minute window.
2. `initiateCall` in `src/services/outreach/on-behalf-call-orchestrator.ts`: opt-out and DNC checks, `holdForCallHours` (may defer to `deferred_calls`; for a hold the silent deferral is replaced by the closed-now reply, ruling 2), `checkCallCompliance`, `createRoom` (`emptyTimeout: 300`, `maxParticipants: 3`), signed agent dispatch (`signOnBehalfDispatch`), `createSipParticipant` (trunk `SIP_TRUNK_ID`, identity `phone_<callId>`). Room `onbehalf-<callId>`, session id `onbehalf:<callId>`.
3. The dispatch lands in the multi-agent entry (`src/agents/voice-agent-entry/index.ts`), `metadata-parser.ts` builds the outbound context, `beginOnBehalfCall` starts an in-memory transcript. Prompt: `src/intelligence/context-builders/external/outbound-call-context.ts`. Only an `endCall` tool exists (`src/agents/outbound-call/call-control.ts`).
4. Opening: `livekit-call-opening.ts` waits up to 60 s for an answer, runs LiveKit `voice.AMD` on the first words (categories `human | machine-ivr | machine-vm | machine-unavailable | uncertain`), then `call-opening.ts` decides. `machine-ivr` is a quiet hang-up (`call-opening.ts:132`; the screener loop keeps waiting, `call-screener.ts:81`). `call-screener.ts` is the template to copy for waiting without talking.
5. Reporting: at session end `completeOnBehalfCall` then `reportCall` (`on-behalf-call-lifecycle.ts`) writes `on_behalf_calls/{id}` through `captureCallResult`, with push, email and "while you were away". `call-result-watch.ts` polls every 5 s for 30 minutes to speak a result into the owner's open call (`CALL_RESULT_LIVE_REPORT`, off). Texts go through the guarded sender (`call-result-text.ts`, `CALL_RESULT_TEXT`, off).
6. Calling the owner: `placeSelfCall` (`src/services/outreach/proactive-channels/self-call.ts:97-175`) dials the account's verified phone (`user-reach.ts` `resolveVerifiedPhone`) into a room with a dispatched live agent, screens the line (`screened()`: hangs up on a machine) and returns `answered | no_answer | failed`. Self-call rooms hold 2 people; the on-behalf room holds 3.
7. Errands: a tested workflow model and store exist (`src/services/errands/`, `ERRANDS` off); no runner places a call effect. That is why mode (b) is later.

What does not exist, and is the feature:

| Need | Today |
|---|---|
| Send a DTMF tone | nothing in `src` (inbound Twilio events only). The platform has `beta.sendDtmfEvents` (300 ms between digits) and `publishDtmf`; unused. Whether tones pass over our outbound trunk to a phone menu is UNCONFIRMED; H0 checks it against a test IVR we own (ruling 3). |
| Recognise a phone menu and keep going | AMD `machine-ivr` at pickup only, mapped to hang-up |
| Recognise hold | nothing. The only hold text in `src` is a restaurant script line. |
| Tell a person from a recording, continuously | pickup-time only (`line-screen.ts`, AMD, screener rounds) |
| Stay quiet without model turns | `call-screener.ts` pattern (`interruptOnMachine` skips the model reply to a machine turn) |
| A call longer than 15 minutes | killed by the AMD dial option (`call-opening-flag.ts:29-31`: `maxCallDuration: 15 * 60`); the orchestrator's `maxCallDurationMinutes: 15` is never read (dead config) |
| Survive a long silence | killed at 35 s (`silent-line.ts:34`), 120 s after a "hold on" (`:42`, from `silence-response-blockers.ts:58`) |
| Ring the owner into a live call | not built; `transferSipParticipant` exists in the SDK and is never called |

### 5.2 The shape

```
Owner's live session (cohort flags apply here)
  callOnBehalf(holdForMe=true)
    -> HOLD_ERRAND on?  no: refuse honestly ("I can't do that yet")
    -> read-back includes the hold promise + "ring me when someone answers"
    -> owner says yes -> pending record holds holdConsent
    -> initiateCall -> signed dispatch { objective: 'hold', hold: {...} }  <- the flag decision is carried here

Outbound session (different process; trusts only the signed dispatch)
  hold-session registry marks the session
  opening: AMD forced on for hold sessions
    machine-ivr -> runHold()  (not hang-up)
  hold-line.ts: pure reducer  dialing -> ivr -> hold -> human -> bridging | done | owner_unreached
  livekit-hold.ts: LiveKit adapter (mute, audio-in only STT, probe, AMD rounds, DTMF, bridge)
  status writes to on_behalf_calls/{id}.holdStatus, heartbeatAt every 30 s
  texts to the owner at hold start and end (guarded owner sender)
  bridge: disclosure + one moment -> ring owner's verified phone (private leg)
          -> "someone's on the line for <business>, ready?" -> yes or key 1
          -> person hears "connecting you now" -> owner joins -> Ferni leaves, room stays up

Separate job (own PR)
  hold-sweeper: no heartbeat for 3 min -> holdStatus=failed + text "the hold call dropped; want me to try again?"
```

Files (all new unless noted; each pure file has a LiveKit-free test):

| File | Layer | Job |
|---|---|---|
| `src/agents/outbound-call/hold-line.ts` | L5 pure | the reducer: state, events, actions, constants. No I/O. |
| `src/agents/outbound-call/hold-phrases.ts` | L5 pure | classify what the far end said (whole-word matching): `menu`, `hold_phrase`, `wait_estimate`, `credential_request`, `speech`; extract menu options and the wait estimate. |
| `src/agents/outbound-call/hold-dtmf.ts` | L5 pure | the allow-list: `checkDtmf(digits, lastMenu)` returns ok or a refusal reason. |
| `src/agents/outbound-call/hold-tools.ts` | L5 | builds the two tools registered in hold sessions: `pressKey` (guarded `sendDtmfEvents`) and `sayToMenu` (closed word list). |
| `src/agents/outbound-call/hold-session.ts` | L5 | `markHoldSession(sessionId)`, `isHoldSession(sessionId)`: the one switch every lifted timer reads. |
| `src/agents/outbound-call/livekit-hold.ts` | L5 adapter | implements `HoldPorts` over LiveKit: mutes, listens, probes, presses, bridges. Modelled on `livekit-call-opening.ts` and `call-screener.ts`. |
| `src/services/outreach/bridge-owner.ts` | L4 | rings the owner into the on-behalf room and reports the outcome (`bridged | owner_unreached`). |
| `src/services/outreach/hold-status.ts` | L4 | writes `holdStatus` and `heartbeatAt`, and sends the owner texts through the guarded owner sender. |
| `src/services/outreach/hold-sweeper.ts` | L4 | the stale-hold sweeper: fails a hold with no heartbeat for 3 minutes and texts the owner (ruling 1). |
| edits: `call-opening.ts`, `livekit-call-opening.ts`, `call-screener.ts`, `silent-line.ts`, `silence-response-blockers.ts`, `call-opening-flag.ts`, `call-result-watch.ts`, `call-control.ts`, `on-behalf-call-lifecycle.ts`, `call-result-capture.ts`, `outbound-call-context.ts`, `metadata-parser.ts`, `on-behalf-dispatch.ts`, `call-on-behalf-schema.ts`, `call-on-behalf.ts`, `call-confirm.ts`, `self-call.ts` (export the dial), orchestrator (net zero) | | small, listed per PR in section 13 |

### 5.3 The state machine (`hold-line.ts`)

Pure: `step(state, event, now) -> { state, actions }`. The adapter feeds events and performs actions. No timers inside; time arrives as events and `now`.

States and what each means:
- `dialing`: SIP leg created, waiting for an answer. Existing `ANSWER_WAIT_MS` 60 s applies.
- `ivr`: a phone menu is talking. The LLM may navigate with the two guarded tools, capped.
- `hold`: waiting. The session is muted. No LLM turns.
- `human`: a candidate person spoke. A probe runs. On a confirmed person, Ferni speaks the disclosure and "one moment".
- `bridging`: ringing the owner on a private leg, then waiting for the owner to say they are ready (ruling 4).
- terminal `done` (with a reason: `completed`, `gave_up`, `stuck_in_menu`, `needs_credentials`, `refused`, `no_answer`, `voicemail`, `hangup_by_far_end`) and `owner_unreached`.

Events: `answered(category)`, `heard(text, atMs)`, `silence(forMs)`, `probe_result(responded, text?)`, `far_end_hung_up`, `owner_ringing`, `owner_ready`, `owner_not_ready`, `owner_joined`, `owner_no_answer`, `tick(nowMs)`.

`tick` is emitted by the adapter at least every 10 s, driven by voice activity or transcript deltas, in addition to the turn-level events from `onUserTurnCompleted` (ruling 6). Every time limit below runs on ticks, so a hold whose audio never produces an end-of-turn still reaches its limits.

Actions: `press(digits)`, `say(phrase)` (only from the closed list), `mute()`, `unmute()`, `probe()`, `speak_disclosure()`, `ring_owner()`, `ask_owner_ready()`, `say_connecting()`, `hand_over_and_leave()`, `apologise_and_hang_up()`, `write_status(status)`, `text_owner(kind)`, `hang_up(disposition)`.

Transitions that matter:
- `dialing --answered(machine-ivr)--> ivr` when the session is a hold session (else today's hang-up). `answered(human)` goes to `human` directly (a person picked up at once: disclosure and bridge, no hold). `answered(machine-vm)` on a hold session: say nothing, leave no message, hang up, `done: voicemail` (`endReason: voicemail`), and text the owner (ruling 5). A normal session keeps today's voicemail path. `answered(machine-unavailable)` keeps the quiet hang-up.
- `ivr`: for each `heard` that classifies as `menu`, the LLM gets the turn (it sees the transcript) and may call `pressKey` or `sayToMenu`. A `credential_request` is never answered: the reducer escapes (`press 0`, `say "representative"`), at most twice, then `done: needs_credentials`. A `hold_phrase` or `wait_estimate` moves to `hold`. Limits: at most 12 LLM turns in `ivr`, at most 3 repeats of the same menu text, at most 6 minutes in `ivr`; any limit hit is `done: stuck_in_menu`.
- `hold`: `mute()` on entry. Everything heard is fingerprinted (normalised text) and counted. A fingerprint seen twice is a recording and is never a candidate. New speech that is not a `hold_phrase`, `menu` or `wait_estimate` and not a seen fingerprint moves to `human`. A `menu` heard again (the IVR re-prompting) moves back to `ivr`. Hard stop at `HOLD_MAX_MINUTES` (60, counted from answer) is `done: gave_up`.
- `human`: `probe()` once ("Hello? Are you there?" through the single permitted unmute). A response within 4 s that is not a seen fingerprint and that AMD (or the transcript) calls `human` confirms a person: `speak_disclosure()` then `ring_owner()` and `bridging`. No response, or a repeat of a fingerprint, goes back to `hold`. At most 3 probes per hold, at least 45 s apart.
- `bridging`: the owner is rung on a private leg (5.7). When the owner answers, `ask_owner_ready()`: "someone's on the line for <business>, ready?" A spoken yes or keypad 1 is `owner_ready`: `say_connecting()` (the person hears "connecting you now"), the owner is moved into the room, and `owner_joined` is `bridged`: `hand_over_and_leave()`. `owner_no_answer` (one ring of 25 s, no second attempt), or no yes and no key 1 within 20 s of the owner answering (`owner_not_ready`), is `owner_unreached`: Ferni tells the person it cannot reach the owner right now, will try again later, thanks them, and hangs up (`apologise_and_hang_up()`), and the owner is texted. While ringing, one reassurance line to the person at about 15 s ("Thanks for waiting, he's just coming on").
- `far_end_hung_up` in any state is `done: hangup_by_far_end` with an honest outcome; if the far end hung up after a person had been confirmed, it is a "they hung up before you got on" text.

### 5.4 Hearing without talking: muting that still listens

The decided mute needs care: if the session's audio input is disabled, STT receives nothing, and AMD and the reducer hear nothing. The hold cannot work that way. The design:
- **Output stays muted** (`session.output.setAudioEnabled(false)`) for the whole hold; unmuted only for the closed-list actions (`probe`, `speak_disclosure`, `say`) for the length of the phrase.
- **Input keeps flowing to STT** *(accepted by lead)*, but a hold-session agent subclass overrides `onUserTurnCompleted` to forward the transcript to the reducer and then throws the framework's `StopResponse`, so no LLM turn runs for hold speech. The LLM runs only in `ivr` (capped) and `human` (capped, section 7). This is the same idea as `interruptOnMachine` in the screener, applied to every turn. **The reducer also gets a periodic `tick` (ruling 6):** `onUserTurnCompleted` fires only at the end of a turn, and hold music or a long recording may never produce one, so the adapter emits `tick` at least every 10 s, driven by voice activity or transcript deltas (H0 shows which is reliable on a live SIP leg). The reducer's limits (6 minutes in `ivr`, 60 minutes of hold, probe spacing, the ring timeout) run on ticks, not on turn ends.
- STT cost continues for the hold (Cartesia Ink streaming): on the order of cents to under 0.40 USD for 45 minutes at the rates in `cost-tracking.ts` (those rates are approximate and do not list Ink; LiveKit agent and SIP minutes are extra and UNCONFIRMED, not in the repo). Ink's behaviour over 45 minutes of music (hallucinated words, idle websocket limits) is UNCONFIRMED; the spike (H0) measures it. If Ink misbehaves on music, the fallback is to gate STT on a voice-activity detector so music never reaches it.
- `StopResponse`, `onUserTurnCompleted` and the audio enable switches all exist in the installed 1.9.3 typings (`dist/voice/agent.d.cts`, `dist/voice/io.d.ts`); that they behave as described on a live SIP leg is checked in H0. If not, the fallback is the screener's existing pattern: hold the reply back per turn (`interruptOnMachine`).

### 5.5 Telling a person from a recording

AMD gives a category from the first words only, with no confidence and no beep detection (`call-opening.ts:144-145`). A recorded "thank you for your patience" can read as a person. So detection has three layers, all in the reducer except the probe itself:
1. **Fingerprint repeats.** Hold recordings loop. Any normalised utterance heard twice is a recording, permanently, and never raises a candidate.
2. **Phrase classes.** `hold_phrase` ("your call is important", "please continue to hold", "a representative will be with you", "all of our agents are busy"), `wait_estimate` ("estimated wait time is 12 minutes"), `menu` ("press one for..."). Whole-word matching; the lists live in `hold-phrases.ts` with tests that include near-misses (a person saying "I'll put you on hold" is not a hold phrase to ignore: it is a person).
3. **The probe.** New speech that survives 1 and 2 gets one short question. A recording does not answer a question; a person does. The probe is the only thing Ferni says before disclosure, and it claims nothing.

A person who answers with a prerecorded-sounding line ("Thank you for calling Northwind, this is Pat") is not in a repeating loop and gets probed like any other new speech. A person who stays silent after being probed is not bridged; the next utterance is a new candidate. The cost of a missed person is a few seconds' delay; the cost of a false person is ringing the owner for a recording. The reducer prefers the delay.

### 5.6 DTMF and menu choices

- Registered tools exist **only in hold sessions** (a session not marked by `hold-session.ts` has neither): `pressKey({ digits })` and `sayToMenu({ word })`.
- `pressKey` is built on the platform primitive (`beta.sendDtmfEvents`, or a thin wrapper over `room.localParticipant.publishDtmf`; H0 picks one). Our guard runs in code **before any digit is sent**; the framework tool is never exposed raw.
- The allow-list (`hold-dtmf.ts`), refusing by default:
  - only `0-9`, `*`, `#`;
  - at most 2 characters per call (a menu choice), and at most 3 calls in a row without new far-end speech between them;
  - every digit must have been offered by the last menu the far end spoke ("press 2 for billing" offers `2`; `0` and `#` are allowed only when the menu or a hold phrase offers them, or as the escape in the reducer);
  - anything where the far end last asked for an account number, PIN, passcode, date of birth, card number, security code or "enter your" something (`credential_request`) refuses everything except the reducer's own escape digit;
  - the request text is checked with the existing contact and credential rules (`hasContactData` from `src/intelligence/person-model`, `src/memory/spoken-credential.ts`, `src/memory/credential-shapes.ts`) so a digit string that looks like a number a person owns is refused even if it is two characters long next to another;
  - spoken or full-width digit forms ("four one five", full-width numerals) normalise first, then the same rules.
- `sayToMenu` accepts only a closed list: `representative`, `agent`, `operator`, `customer service`, `yes`, `no`, plus a department word that appeared in the last menu text. Anything else is refused. Output is unmuted for the phrase only.
- The owner's personal data is never in the hold prompt (section 8), so even a model failure has nothing to send.
- Every refusal is logged as a counter with a reason, never the digits.

### 5.7 Bridging the owner in (decided: same room; evaluate WarmTransferTask first)

Decided: say the existing outbound disclosure line plus "one moment", dial the owner's verified phone into the same room, then Ferni leaves while the room stays up. Ruling 4 changes the order: the owner is rung on a private leg, confirms they are ready, and is only then put in the room with the person.

The disclosure line is the existing business opener (`src/services/outreach/opening-line.ts`): "Hi, this is Ferni, an AI calling for <owner>." followed by "One moment, he's just coming on." It is said when the person appears, not at pickup, because a phone menu has no one to hear it.

Mechanics:
- The owner's number is only ever `resolveVerifiedPhone` (`user-reach.ts`), never a model-supplied value.
- `createSipParticipant(trunk, ownerE164, room, { participantIdentity: 'owner_<callId>', participantName: <owner first name>, playDialtone: false, ringingTimeout: 25, waitUntilAnswered: true })`. Under ruling 4 the owner is dialed into a private room first and moved into the on-behalf room after "ready"; the on-behalf room already allows 3 participants (agent, business leg, owner). `placeSelfCall`'s dial is exported from `self-call.ts` and reused (no second copy of the dial).
- **Owner readiness before the join (ruling 4).** The owner is not put in earshot of the person until they say so. Ferni speaks to the owner on the private leg: "Someone's on the line for <business>, ready?" The answer is a spoken yes (read by the same closed yes/no judge the confirm gate uses; the builder greps for the helper, name UNCONFIRMED) or keypad 1. On yes or 1, Ferni tells the person "connecting you now" and the owner is moved into the room. A no, silence, or nothing within 20 s is `owner_not_ready`, handled as `owner_unreached`. Bar: `humanDetectedAt` to `bridgedAt` p50 at most 35 s (10.4).
- Once the owner is in, Ferni says one line to both ("<Owner>, this is Northwind Cable about your internet bill. I'll leave you two to it.", purpose text only from the read-back), flushes the call report, and leaves **without deleting the room**. `call-control.ts:98` `deleteRoom` is the end-call behaviour and must not run. New `leaveRoomKeepingCall` sits beside it; every session-close path that deletes the room is audited and suppressed for a bridged call, with a test.
- **Evaluate `workflows.WarmTransferTask` first (H0).** It dials a human into a private briefing room, lets the agent brief them, plays hold audio to the caller, then `moveParticipant`s the human into the caller's room, and cancels if the caller hangs up. It is structurally this case with roles renamed (business leg = caller, owner = human agent). Questions for the spike: does it accept `SIP_TRUNK_ID` (its default is `LIVEKIT_SIP_OUTBOUND_TRUNK`)? Does it work with our single linked participant? Do we want it to play hold audio at the business (default no)? Does it leave the room alive?
- **Bridge method, accepted by lead:** prefer the screened self-call followed by `moveParticipant`, or `WarmTransferTask`; the plain same-room dial (the original decided approach) stays owner-only until an owner-leg human check is proven. **Ruling 4 supersedes the fallback:** the readiness check needs a private owner leg, so the plain same-room dial is dropped.
- **Known hazard with a plain same-room dial: the owner's voicemail.** A SIP answer is also a voicemail greeting. A same-room dial would connect the person at the business to the owner's voicemail. `WarmTransferTask`'s private briefing room, or the self-call path (`placeSelfCall` screens the line and hangs up on a machine) followed by `RoomServiceClient.moveParticipant` into the on-behalf room, both avoid it. H0 must answer how the same-room path is guarded, and the rule is: **the same-room dial without an owner-leg human check does not go beyond Seth's account** (open question O1, default: use whichever of WarmTransferTask or screened-then-move the spike supports; the plain same-room dial is no longer a fallback after ruling 4, because it has no private leg for the readiness check).
- App-side bridging (owner inside a Ferni app call) is out: it needs a token minted for the on-behalf room and no code exists. The phone path is the one with precedent.

## 6. Flags and the dispatch contract

| Flag | New? | Default | Cohort-capable | Read where |
|---|---|---|---|---|
| `HOLD_ERRAND` | new (`pnpm flags:new HOLD_ERRAND --default off --owner outreach --kind experiment`) | off | yes: add to `COHORT_FLAGS` in `src/services/platform/cohort-flags.ts` and the pinned list in `__tests__/cohort-flags-list.test.ts` | once, in `callOnBehalf` in the owner's session, to accept `holdForMe` and sign the dispatch |
| `CALL_RESULT_TEXT` | existing | off | no | owner progress texts (start, end, voicemail, dropped, the scheduled-dial re-confirm) go through the guarded owner sender regardless of this flag (ruling 7), because the owner's yes in the read-back asks for them. The owner's SMS opt-out still applies: an opted-out owner gets no text, and the state stays on `on_behalf_calls` and in the existing push. Do not turn `CALL_RESULT_TEXT` on as a side effect. |
| `CALL_OPENING_AMD` | existing | off (prod value UNCONFIRMED, masked) | no | **not a prerequisite.** Hold sessions force the AMD path themselves (`isCallOpeningAmdEnabled() \|\| session is hold`), so this build does not depend on, or change, the global switch. |
| `SILENT_LINE_HANGUP` | existing | on | no | stays on; hold sessions are exempted per session in `armSilentLine`, never by turning it off |

Dispatch contract (signed, `on-behalf-dispatch.ts`, parsed in `metadata-parser.ts:204-260`): add one optional field

```ts
hold?: {
  v: 1;
  ownerRingConsent: true;        // the owner said yes to "ring me when someone answers" (section 8)
  readBackId: string;            // ties the yes to the exact read-back text
  maxMinutes: 60;                // hold ceiling, set by the owner session, not by the model
  purposeApproved: string;       // the purpose text exactly as read back; the only owner data the hold prompt gets
}
```

The outbound session treats a call as a hold session only when this field is present and the signature verifies. Absent field: today's behaviour byte for byte. The flag decision cannot be spoofed by a model because the model never sets the field; `callOnBehalf` sets it after the confirm gate passes.

Removal: `HOLD_ERRAND` is deleted with its `COHORT_FLAGS` entry once it is on for everyone and the soak has passed.

## 7. Timers: what would kill a hold, and the per-session lift

Every row is lifted for hold sessions only; every other call behaves exactly as today (a test for each lift asserts both).

| # | Killer | Today | Hold-session change | Where |
|---|---|---|---|---|
| 1 | Silent-line hang-up | 35 s far-end silence; 120 s after "hold on" (`silent-line.ts:34,42,153-175`) | `armSilentLine` returns false when `isHoldSession(sessionId)`; `silence-response-blockers.ts:58` does not pass `{hold:true}` for a hold session (nothing arms) | `silent-line.ts`, `silence-response-blockers.ts` |
| 2 | SIP dial cap | with AMD on, `maxCallDuration: 15 * 60` and `ringingTimeout: 45` (`call-opening-flag.ts:29-31`); with AMD off, no cap set | hold dispatch gets `maxCallDuration: 60 * 60`, `ringingTimeout: 45` | `callOpeningDialOptions(hold)` in `call-opening-flag.ts`; the orchestrator's `createSipParticipant` options (`:409-418`) call a helper from a new file so the 902-line orchestrator does not grow. Delete or wire the dead `maxCallDurationMinutes` (`:98,132`) in the same PR, with grep proof. |
| 3 | Result watch | 30 min (`call-result-watch.ts:41`) | 90 min: `maxMs` chosen when the watch starts, from `objective === 'hold'` | `call-result-watch.ts` |
| 4 | Idle disconnect | 90 s warn, 120 s disconnect (`shared/constants.ts:84,90`) only if `onIdleTimeout` is passed; the multi-agent path does not pass it (`agent-setup.ts:1996-2005`, `reopen-idle.ts:3`) | believed already inert on the on-behalf path; confirm in the first dev hold (H0/E) rather than trust the reading | none expected |
| 5 | Room | `emptyTimeout: 300` applies only to an empty room; `SESSION_MAX_AGE` 4 h (`session/constants.ts:59`) | none | none |
| 6 | Worker drain on deploy | UNCONFIRMED on LiveKit Cloud | none in code; the process rule in section 11. A hold that dies anyway is caught by the heartbeat and sweeper (row 10). | runbook, `hold-sweeper.ts` |
| 7 | STT/LLM cost | a model turn per end-of-turn | muted + `StopResponse` in `hold`; capped in `ivr` (12) and `human` (4 turns after confirmation) | `hold-line.ts`, `livekit-hold.ts` |
| 8 | Transcript | in-memory text per call, analysed once at the end (`call-transcript-intelligence.ts`); a 45-minute loop bloats it and is lost if the job dies | before `human`, record nothing from the far end except a structured summary (`ivrSteps`, `waitedSeconds`, `estimateMinutes`, `probes`); after `human`, record normally | `on-behalf-transcript-capture.ts`, `call-transcript-intelligence.ts` |
| 9 | Concurrency | no per-owner cap on simultaneous on-behalf calls; one call per worker process (`AGENT_MAX_JOBS_PER_WORKER` unset) | not built (decided); default value 1 (O4). Mitigation now: owner cohort only. | follow-up |
| 10 | A hold that dies silently (crash, drain, lost job) | nothing notices: the document stays `on_hold` and the owner waits for a ring that never comes | the session writes `hold.heartbeatAt` every 30 s; the sweeper (own PR) sets `holdStatus=failed` after 3 minutes with no heartbeat and texts the owner "the hold call dropped; want me to try again?" (ruling 1) | `hold-status.ts`, `hold-sweeper.ts` |

The hold's own ceiling is `hold.maxMinutes` (60) counted from the answer. When it is reached: hang up, `done: gave_up`, text the owner "I waited 60 minutes at Northwind Cable and nobody came on. Want me to try again later?".

## 8. Privacy, consent and safety

Consent (the read-back is the contract):
- `callOnBehalf` gains `holdForMe: boolean` (default false) in `call-on-behalf-schema.ts`. Its description tells the model to use it when the owner asks Ferni to wait on hold or sit in a queue.
- The read-back (built in `call-confirm.ts` from the same pending record the current read-back uses) says, in plain words and in one breath: who it will call and why; that it will wait on hold and press menu numbers but never enter account numbers or personal details; that when a person answers it will say it is an AI calling for the owner and ring the owner's phone, even if it is late, and connect the person only after the owner says they are ready; that it will text when the hold starts and ends, or if the call drops; and asks for a yes.
- The owner's yes (judged by the existing consent v2 judge, `#2962`, which judges the answer to the latest read-back) stores `holdConsent { ringMeWhenAnswered: true, readBackId, at }` on the pending record, and `callOnBehalf` copies it into the signed dispatch field. A conditional or partial yes ("yes, but not after nine") is not a clean yes; the existing judge re-asks.
- That yes is what exempts the ring and the two status texts from the owner's quiet hours and Focus for this call only. It reuses the existing exemption pattern (`asOwnCallMe` / `userAsked`, `held-call.ts:14-22`, `call-hours-guard.ts`). It does not exempt the recipient's calling hours (O5). **Consent is fresh for every dial (ruling 2):** it does not carry to the next call, and a hold scheduled for opening time is re-confirmed by text before it is dialed.
- **Closed now (ruling 2).** For `holdForMe`, the recipient-hours check runs in `callOnBehalf` before `initiateCall`, so `holdForCallHours` never defers a hold silently. When the business is closed, Ferni replies "they're closed now; want me to try when they open at <time>?", where the time is the next 9:00 in the recipient's zone (the `CALL_HOURS_GUARD` window; no business-hours data exists in `src`, UNCONFIRMED). On a yes, the hold is scheduled (a `deferred_calls` entry carries the hold request, not the consent). Before the dial, an owner text re-confirms ("Northwind Cable is open now. Want me to start the hold? Reply yes."), and the dial happens only on a reply the consent judge reads as a clean yes. A no, no reply, or a reply after the window (O15) cancels the hold with a text.

Personal data:
- The hold prompt contains only the owner's first name and `purposeApproved`. No profile, no memory, no contacts, no account details. The on-behalf session stays blind to owner data, as in the recall-ledger design.
- `outbound-call-context.ts` gains a hold section (only for hold sessions): do not share anything about the owner beyond the purpose above; if a person asks for verification details (date of birth, address, account numbers, anything medical or financial), say the owner is coming on to answer that; never agree to anything or promise anything for the owner; if a person refuses to speak with an AI, thank them, hang up, and the outcome is `refused` (existing wording at `outbound-call-context.ts:284`).
- The reducer and the tool allow-list make this true even if the model misbehaves: before a person, the model cannot speak and can only send menu digits.
- Not in this build, and refused by the read-back step with an honest line: payments, anything where the purpose mentions a card or payment, and health or insurance PHI. The builder adds a refusal in `callOnBehalf` for `holdForMe` when `purpose` or `additionalContext` matches payment or PHI cues (whole-word classifier, with the held-out test below). Default: refuse and say "I can wait on hold for that, but I can't give them payment or health details; you'd talk to them yourself once someone answers." A hold where the owner will talk to the person is allowed for such topics, because the owner supplies the details live; the refusal is for any request that Ferni itself provide them. (O6)

Safety:
- Honesty to the person: the disclosure is the existing outbound line, said as soon as a person is confirmed, before anything else. The probe claims nothing. If a person asks "are you a robot?", the prompt never denies it (`outbound-call-context.ts:61-62`).
- Dialable numbers: `checkDialableNumber` (`compliance.ts:99`) still blocks emergency and premium numbers. Default: also refuse a hold to 988 and 211 (a crisis line is not an errand).
- Do-not-call and opt-outs: `assertNotOptedOut` runs before the first dial and `ON_BEHALF_DNC_CHECK` (on, fails closed) stays. If a person says "do not call this number again", the existing opt-out cues record it.
- Minors: an owner account held under 18 gets no dial (existing).
- Crisis on the callee's side (a rep says something alarming): no on-behalf-specific handling exists by search (UNCONFIRMED); with the owner bridged in seconds, this is accepted. The reports to the owner never quote the callee and never speak while the owner's own call has crisis risk (existing rules).
- Recording: none, and none is claimed.
- The owner is rung only at the verified phone. If there is none, `callOnBehalf` refuses `holdForMe` at the read-back step with an honest line.
- Logs: ids, counts, durations, states. No digits sent, no phone numbers, no far-end text.

## 9. Data shapes

`on_behalf_calls/{callId}` (existing document, server-written only) gains:

```ts
holdStatus?: 'on_hold' | 'human_detected' | 'bridged' | 'owner_unreached' | 'failed';
hold?: {
  startedAt: string;              // ISO, when the line went to ivr/hold
  humanDetectedAt?: string;
  ownerReadyAt?: string;          // the owner said yes or pressed 1 (ruling 4)
  bridgedAt?: string;
  heartbeatAt?: string;           // ISO, written every 30 s while the hold session lives (ruling 1)
  ownerRangAt?: string;
  waitedSeconds: number;          // updated on each state change and at the end
  estimateMinutes?: number;       // only if the IVR said a number of minutes
  ivrSteps: number;               // menu choices pressed or said
  probes: number;
  llmTurns: number;               // ivr + human turns
  dtmfSent: number;               // count only; the digits are never stored
  dtmfRefused: number;
  endReason?: 'completed' | 'gave_up' | 'stuck_in_menu' | 'needs_credentials' | 'refused' | 'no_answer' | 'voicemail' | 'hangup_by_far_end' | 'owner_unreached';
};
```

`holdStatus` maps from the machine: `ivr` and `hold` are `on_hold`; `human` and `bridging` are `human_detected`; `bridged` and `owner_unreached` are themselves; `failed` is written only by the stale-hold sweeper (ruling 1). A finished call that did not bridge carries `hold.endReason` in the outcome, not a `holdStatus`.

The `outcome` text (`buildCallOutcome`) gains hold outcomes in plain words: "gave up after 60 minutes", "owner didn't pick up, texted you", "they hung up before you got on", "bridged you after 38 minutes", "the hold call dropped", "went to voicemail, left no message". It never contains menu text or far-end words.

Owner texts (the guarded owner sender regardless of `CALL_RESULT_TEXT`, with the owner's SMS opt-out still applied, ruling 7; owner exemption from the read-back yes; at most 3 per hold, plus one re-confirm per scheduled dial; business name only, no purpose, since SMS is not private):
- start: "I'm on hold with Northwind Cable for you. They say about 12 minutes. I'll ring you the moment a person comes on." (estimate only if the IVR said a number of minutes)
- end, bridged: "A person came on at Northwind Cable and I rang you in."
- end, otherwise: the outcome wording above.
- voicemail (ruling 5): "Northwind Cable's line went to voicemail. I didn't leave a message. Want me to try again?"
- dropped (sweeper, ruling 1): "The hold call dropped; want me to try again?"

A "want me to try again?" yes starts a fresh read-back, not an automatic redial (O7).

Firestore rules, erase and export: no new collection or subcollection; `on_behalf_calls` is already classified in `scripts/devdb/copy-user.ts` as staying in prod (people Ferni was asked to reach). The new fields are in that document and inherit its handling. The PR that adds them re-runs `copy-user.test.ts`.

Signed dispatch field: section 6. Pending-record field: `holdConsent` (section 8), not persisted beyond the pending record's 5-minute window and the call document.

## 10. Testing and evals

### 10.1 Unit (each PR; fail-on-mutation proven and said in the PR)
- Reducer (`hold-line.ts`): table tests over event sequences for every transition in 5.3; each limit (12 LLM turns, 3 menu repeats, 6 min in `ivr`, 60 min hold, 3 probes, 45 s between probes, 25 s ring); a fingerprint heard twice never raises a candidate; far end hangs up in every state; `answered(human)` skips hold.
- Phrases: near-misses both ways ("I'll put you on hold" from a person is speech; "press the pound key" is a menu); whole-word matching only ("informal" lesson); estimate parsing ("about twelve minutes", "less than five", "over an hour").
- DTMF allow-list: adversarial inputs the builder did not write: digit strings of 3 and 10 digits, full-width numerals, spoken digits, `*` and `#` sequences, a digit that was not offered, a digit after a credential request, a request that carries a phone-shaped string. All refused. The verifier writes its own set (the 10-29 retro: every privacy guard needed inputs the builder never wrote).
- Timers: for each of the rows 1 to 3 in section 7, the lift applies for a hold session and is absent for a normal session.
- Bridge: a fake SIP API asserts `createSipParticipant` is called with the verified phone, the same room, identity `owner_<callId>`, ring 25 s; `deleteRoom` is never called on a bridged call; `owner_no_answer` ends with the apology and a text; a model-supplied number is ignored.
- Dispatch: a hold dispatch with a bad signature is a normal call; the field absent is today's behaviour.
- Consent: a partial yes does not set `holdConsent`; the read-back text contains the ring-me clause, the no-account-numbers clause, and the text-updates clause.
- Both flag states for `callOnBehalf`: `HOLD_ERRAND` off refuses `holdForMe` honestly and the schema/prompt output is unchanged for every other call.
- Ticks (ruling 6): with no `onUserTurnCompleted` event for the whole run, ticks alone reach the 6-minute `ivr`, 60-minute hold, probe-spacing and ring limits (fake clock); the adapter emits a tick within 10 s of any voice activity or transcript delta.
- Readiness (ruling 4): the owner answers and says nothing, or says no: never moved into the room, `owner_unreached`, the person is told; a spoken yes and keypad 1 each lead to "connecting you now" to the person before the owner is moved; the owner is never in the room before `owner_ready`.
- Voicemail (ruling 5): `machine-vm` on a hold session says nothing, leaves no message, ends `voicemail` and sends one text; a normal session is unchanged.
- Heartbeat and sweeper (ruling 1): a heartbeat every 30 s; with a fake clock, a hold at 2 min 59 s is untouched and at 3 min 01 s is `failed` with exactly one text; a `bridged` or ended hold is never touched; running the sweeper twice sends one text; the section 11 deploy check ignores a hold with a stale heartbeat.
- Closed hours (ruling 2): a closed business gets the reply and no `deferred_calls` write without the owner's yes; no dial without the re-confirm text's yes; a no, no reply or a late reply never dials; consent from the first read-back is not reused for the scheduled dial.
- Texts (ruling 7): with `CALL_RESULT_TEXT` off the hold texts still go; with the owner's SMS opt-out set, none go.

### 10.2 The simulated business line (dev)
**A real phone path that we own (ruling 3).** The simulated participant below skips the phone network, so it cannot show that DTMF tones or hold music survive our outbound trunk. For that, H0 and the first dev holds call a test IVR we own: a Twilio number whose TwiML plays a menu (`<Gather>` on 1 and 2), looped hold music, a repeating "your call is important" recording and, after a set delay, a scripted "rep", plus dev calls to Seth's own phone for the owner leg. No real business is called in H0. H0 also checks that DTMF reaches the TwiML `<Gather>` over the outbound trunk, which no code has ever sent (5.1).

Real businesses are not a test bench. Add `scripts/voice-eval/hold-line-sim.*`: a LiveKit participant with identity `phone_<callId>` that plays pre-rendered audio (Cartesia TTS clips via the existing `caller-tts.mjs`, plus looped music) on a script, and listens for DTMF events from the agent. Scripts:
1. Clean path: greeting, menu (press 2 for billing), music, a looping "your call is important" every 30 s, "estimated wait 3 minutes", then a person says "Thanks for calling, this is Pat."
2. Recording that sounds human: "Thank you for holding, a representative will be with you shortly" every 40 s for 10 minutes, no person.
3. Credential menu: "enter your 10 digit account number". Expect: no digits sent, escape tried, `needs_credentials`.
4. Menu loop with no way out. Expect `stuck_in_menu`.
5. Person answers at once (no hold).
6. Person appears, owner does not answer. Expect apology, `owner_unreached`, text.
7. Person says "I'll put you on hold" mid-conversation: stays a person, does not drop.
8. The business hangs up during hold.
The owner leg in dev is a second simulated SIP participant (answers, or not). Run each script at least twice; one call is an anecdote. Real-time scripts are long, so a compressed-time variant runs the clips at normal speed with the hold segment shortened to 3 minutes; one full-length 45-minute soak is run once on dev (cost and STT behaviour over music).

### 10.3 Real calls
- Dev: calls to the test IVR we own (ruling 3), then the owner leg to Seth's phone.
- Prod, Seth's account: a real low-stakes hold (a utility or retailer line) after the dev bars pass. This is the first time a real business is called; H0 and dev never call one.

### 10.4 Measures and bars (defaults, set before the run)
| Measure | How | Bar |
|---|---|---|
| False person (recording judged a person) | sim scripts 2 and others, n at least 30 hold-minutes of recordings; real holds | 0 in sim; 0 owner rings for a recording in the first 20 real holds |
| Missed person (person spoke, not bridged within 15 s) | sim scripts 1, 5, 7, n at least 20 | at most 5% |
| Credential digits sent | `dtmfSent` vs menu offers; `dtmfRefused` reasons | 0 sent that were not offered; every credential prompt refused |
| Person wait while owner is rung and confirms | `humanDetectedAt` to `bridgedAt`, which now includes the readiness check | p50 at most 35 s (ruling 4); p95 reported until the first dev holds set it |
| Owner answered | `bridged` over `human_detected` | report only (depends on the owner) |
| Cost per hold minute | `hold.waitedSeconds`, `llmTurns`, STT minutes from the cost tracker | LLM turns at most 16 per hold; STT minutes equal hold minutes; report LiveKit minutes when the Cloud rate is known |
| Hold survives to the real end | sim 45-minute soak | no dropped call from any lifted timer |
| Dropped hold caught | kill a sim hold's job mid-hold | `failed` set and the text sent within 4 minutes of the last heartbeat (3 minutes stale plus a sweeper cadence of at most 1 minute, O13) |
| Room survives a bridge | after `bridged`, both SIP legs stay up until a party hangs up | 100% in sim |

Prod measurement: structured log line `HOLD_RECEIPT` at the end of every hold session (`callId` tag, state durations, probes, llmTurns, dtmfSent, dtmfRefused, endReason; no text). The always-on call reviewer reads the bridged part of the call. Seth listens to the first holds.

## 11. Rollout order

Dev first, then Seth's account, then wider.

1. Land the PRs in section 13 flag-off. Deploy `main` to dev. Nothing changes for anyone (`HOLD_ERRAND` absent).
2. **Dev**: cohort `seth-dev` with `HOLD_ERRAND=on` for the eval user. Run the simulated lines (10.2), then the 45-minute soak, then the real SIP call (10.3). Fix until the bars hold.
3. **Decide O1** from H0 before any prod step: the bridge method must have an owner-leg human check.
4. **Seth's account, prod**: prod claim, deploy a commit already on `main` and already run on dev, cohort `seth`: `HOLD_ERRAND=on`. First real hold at a low-stakes line, Seth watching. Then three more over a week.
5. **Wider** only after: the per-owner cap (default 1) is built, the false-person bar held over at least 20 real holds, and the bridge method is the screened one. Then friends-and-family, then beta, then default; each step per `docs/runbooks/cohort-rollout.md`.

**Never deploy, restart or update secrets while a hold is live.** A deploy drops the call; a 45-minute hold straddles a deploy easily. Before any prod `lk agent` change: `lk room list --project ferni-prod`, and a query for `on_behalf_calls` with `holdStatus` in (`on_hold`, `human_detected`) whose `hold.heartbeatAt` is under 3 minutes old. A stale heartbeat is ignored (ruling 1): a hold with no heartbeat for 3 minutes is already dead, and the sweeper fails it. If a live one remains, wait. (The prod claim from `claim.py` is the existing mitigation; this is the check that goes with it.)

Rollback: `set-flag seth HOLD_ERRAND off` (or `disable seth`): `callOnBehalf` stops accepting `holdForMe` for new calls. A hold already running finishes by itself, because the outbound session never reads the flag.

## 12. Later (not this build)

- **Mode (b)**: Ferni handles the errand after a person appears, as an `ERRANDS` runner effect. Needs the errands runner that places the call effect (none exists), the ledger (`2026-10-27-recall-ledger.md`), and a consent model for Ferni acting in an unplanned conversation. The hold PRs leave `bridging` as the one place mode (b) would branch.
- **Per-owner concurrent-hold cap**, default 1, in the confirm step with a transactional check on `on_behalf_calls` (`holdStatus` live), and an honest refusal line.
- **Business DNC and consent** if `MESSAGING_PIPELINE` is ever turned on (`consentBlocks(phone, 'call')` would refuse a first call to a business that has not opted in).
- **Auto retry** of a missed bridge through `CALL_FOLLOWTHROUGH`.
- Owner-assisted credentials: ring the owner into the menu to type their own digits. Not planned; it needs its own consent design.

## 13. PR breakdown (each 400 reviewable lines or fewer, flag-off, each with its first reader)

| PR | Title | Content | Est. |
|---|---|---|---|
| H0 | `docs(plans): hold spike results` | Findings, written into this plan as an appendix: (1) `StopResponse` and mute behaviour in 1.9.3 on a live SIP leg; (2) Ink STT over 30 minutes of music; (3) `WarmTransferTask` vs screened-then-`moveParticipant` vs same-room dial, and the owner-voicemail guard; (4) `sendDtmfEvents` as registered tool vs wrapper; (5) idle-timeout behaviour on the on-behalf path; (6) DTMF tones passing over the outbound trunk; (7) whether voice activity or transcript deltas gives a tick at least every 10 s on a live leg. **Run against a test IVR we own (a Twilio number with a TwiML menu, hold music and a scripted "rep") plus dev calls to Seth's own phone; no real businesses (ruling 3).** Throwaway scripts are not committed. | ~120 (docs) |
| H1 | `feat(telephony): hold for me entry, consent and signed hold dispatch` | `HOLD_ERRAND` flag + `COHORT_FLAGS` + pinned list; `holdForMe` in the schema; read-back clause (ring-me, ready-before-join, text-updates) and `holdConsent` in `call-confirm.ts`; payment/PHI refusal; dispatch field in `on-behalf-dispatch.ts` and `metadata-parser.ts`; hold section in `outbound-call-context.ts` (reader: the parser and prompt) | ~330 |
| H1b | `feat(telephony): closed-now reply and a re-confirmed scheduled hold` | the recipient-hours check for `holdForMe` before `initiateCall` (no silent deferral); the closed-now reply; the `deferred_calls` entry for a hold; the text re-confirm and the fresh-consent check before the dial; cancel on a no, no reply or a late reply (ruling 2) | ~300 |
| H2 | `feat(outbound-call): hold sessions keep their call alive` | `hold-session.ts`; `armSilentLine` and `silence-response-blockers` exemptions; `callOpeningDialOptions(hold)` + dial helper in a new file (orchestrator net zero, dead `maxCallDurationMinutes` removed); `call-result-watch` 90 min; AMD forced for hold. Tests assert normal sessions unchanged. | ~220 |
| H3 | `feat(outbound-call): hold line state machine and menu guard` | `hold-line.ts`, `hold-phrases.ts`, `hold-dtmf.ts`, `hold-tools.ts`; `call-opening.ts` and `call-screener.ts` route `machine-ivr` to a new optional `ports.runHold` when the session is a hold session (else unchanged); the port type. First reader: `call-opening.ts`. | ~400 |
| H4 | `feat(outbound-call): hold line on LiveKit` | `livekit-hold.ts` implementing the ports: output mute, STT-without-LLM-turn, the periodic `tick` (voice activity or transcript deltas, at least every 10 s), AMD rounds, probe, `pressKey`/`sayToMenu` registration only for hold sessions, transcript filter; wiring in `livekit-call-opening.ts` | ~380 |
| H5 | `feat(outreach): hold status and honest report` | `hold-status.ts`; `holdStatus`/`hold` writes in `call-result-capture.ts` and `on-behalf-call-lifecycle.ts`; hold outcomes in `buildCallOutcome`; the owner texts (start, end, voicemail) through the guarded owner sender regardless of `CALL_RESULT_TEXT`, SMS opt-out honoured (ruling 7); the `heartbeatAt` write every 30 s; `HOLD_RECEIPT` log; `copy-user.test.ts` run | ~340 |
| H6 | `feat(outreach): bridge the owner into the held call` | `bridge-owner.ts`; `self-call.ts` dial export; `leaveRoomKeepingCall` in `call-control.ts`; session-close `deleteRoom` audit; `owner_unreached` path; the owner readiness check ("someone's on the line for <business>, ready?", spoken yes or key 1) and "connecting you now" to the person (ruling 4). Method per H0. | ~390 |
| H7 | `test(voice-eval): simulated business hold line` | `hold-line-sim`, scripts 1 to 8, owner-leg sim, scoring | ~380 |
| H8 | `feat(outreach): stale hold sweeper` | `hold-sweeper.ts`: a hold with `holdStatus` `on_hold` or `human_detected` and no `heartbeatAt` for 3 minutes becomes `failed`, and the owner is texted once ("the hold call dropped; want me to try again?"); the section 11 deploy-check wording in the runbook ignores stale heartbeats (ruling 1) | ~200 |
| Ops | flag flips | no code; section 11, under a prod claim | none |

Dependencies: H0 before H4 and H6 (it chooses their method); H1 before H3 and H1b (the dispatch field, the consent record); H5 before H8 (the heartbeat the sweeper reads); H2 and H3 before H4; H5 can run in parallel with H4; H6 after H4; H7 after H4 and H6. If H3 or H4 would cross 400, split the phrases and DTMF guard into the PR whose reader is `hold-tools.ts` (a registered tool), and keep the reducer with its port.

## 14. Open questions, each with a default

| # | Question | Default |
|---|---|---|
| O1 | Which bridge method, given the owner-voicemail hazard? | Use what H0 shows works: `WarmTransferTask` first, else screened self-call then `moveParticipant`. The plain same-room dial is dropped (ruling 4): it has no private leg for the readiness check. If H0 shows neither works, the bridge is not built and the question returns to the lead. |
| O2 | A speech-only menu ("say 'billing'")? | `sayToMenu` with the closed word list (section 5.6). If the menu wants anything else, escape and end as `stuck_in_menu`. |
| O3 | Credential prompts: ring the owner in to type their own digits? | No. Escape twice, then `needs_credentials`, hang up, text the owner. |
| O4 | Per-owner concurrent holds | 1 when it is built; not built now. Interim: owner cohort only. |
| O5 | A 24/7 support line at 7 am: respect `CALL_HOURS_GUARD`? | Yes, but never silently (ruling 2): Ferni replies "they're closed now; want me to try when they open at <time>?" On a yes it schedules the hold and re-confirms by text before dialing; consent is fresh for every dial. `CALL_NOW_OWNER_OVERRIDE` stays the separate, off, owner-words-only escape. |
| O6 | Payment or PHI topics | Refuse any request where Ferni itself would supply them. An owner who will talk to the person live may still ask Ferni to wait and ring them. |
| O7 | Retry after `owner_unreached` | No automatic retry. The text offers "say 'hold again'". The dropped-hold and voicemail texts ask "want me to try again?"; a yes there goes through a fresh read-back (consent is fresh for every dial), not an automatic redial. |
| O8 | Hold ceiling | 60 minutes from answer; not owner-settable in this build. |
| O9 | Text content | Business name and the wait estimate only; never the purpose. |
| O10 | Ring length for the owner | 25 s (one attempt), then up to 20 s for the owner's yes or key 1 (ruling 4). |
| O11 | A person at the business asks to speak to the owner before the owner joins | The model (capped at 4 turns after confirmation) says the owner is on his way and answers nothing else. |
| O12 | Crisis handling on the callee's speech | Accepted gap (the owner joins within seconds); revisit before any audience wider than the owner. |
| O13 | Heartbeat and sweeper numbers | Heartbeat every 30 s, stale after 3 minutes, sweeper runs at least once a minute (ruling 1). The cadence is a default for the builder to confirm. |
| O14 | What the readiness prompt says and how long it waits | "Someone's on the line for <business>, ready?", 20 s for a spoken yes or key 1, then `owner_unreached` (ruling 4). |
| O15 | How long a scheduled hold waits for its re-confirm yes | 30 minutes after the business opens, then it is cancelled with a text (ruling 2). Default for the builder to confirm. |
| O16 | An owner who opted out of SMS | No text is sent (ruling 7). The state stays on `on_behalf_calls` and in the existing push, and the dropped-hold case is still failed by the sweeper. |

## 15. Definition of done

- Each PR merged through the queue with an independent verifier's PASS on the exact head; digit-guard and consent tests re-derived by the verifier from adversarial inputs.
- On dev from `main`: scripts 1 to 8 pass at the bars in 10.4, the 45-minute soak survives every lifted timer, one real SIP hold, placed to the owned test IVR, bridges to a real phone after the owner's readiness yes, and a killed sim hold is failed and texted by the sweeper.
- On Seth's account in prod: three real holds, no false person, no digit that the menu did not offer, an honest text at start and end, the room staying up after Ferni leaves.
- `CLAUDE.md` for `src/agents/outbound-call/` documents the hold files as merged.
- The H0 appendix records each decision it changed.
