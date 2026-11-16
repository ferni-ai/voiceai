# Three-way calls: Ferni brings someone into your call

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You're on a web call with Ferni and say "get Sarah on the line." Ferni reads back who and which number, you say yes, Sarah's phone rings, and when she answers all three of you talk. Ferni hears both of you, knows which of you said what, and keeps Sarah's words out of your memories.

**Architecture:** The agent stays one `AgentSession` with one STT stream. A new audio input, `RoomMixInput`, takes the place of the SDK's single-participant input when the first guest joins. It reads each human's track with that person's own noise cancellation, mixes them into the one stream, and records who was loud in each 10 ms frame. The STT chain uses that record to tag a guest's final transcripts `[Sarah] …`, so the model, the captions and the memory guard all see who spoke. The guest is dialled into the caller's own room with LiveKit `createSipParticipant`, the same method the on-behalf path uses. The Dec 2024 Twilio conference path is deleted.

**Tech Stack:** TypeScript, `@livekit/agents` 1.9.3, `@livekit/rtc-node` 1.1.0 (`AudioStream` with per-track `noiseCancellation`), `livekit-server-sdk` `SipClient`, Vitest.

**Spec:** This document. Seth, 2026-11-16: "Me on web, Ferni calls someone and brings them into the room and then we all have a conversation together."

## Why (read from the code, 2026-11-16)

- **Ferni hears one person.** `session.start()` links to a single participant ([persona-agent-factory.ts:240](../../src/agents/multi-agent/persona-agent-factory.ts)). `RoomIO` has `setParticipant` but no multi-participant input. A second human's audio reaches you and not Ferni.
- **Adding someone is switched off.** `POST /api/group/call/add` returns 501 ([group-conversation-routes.ts:216](../../src/api/group-conversation-routes.ts)). The `group_call_add` data message is handled in [voice-integration.ts:157](../../src/agents/group-conversation/voice-integration.ts), but nothing in `apps/web/src` sends it. Behind it, [conference-call-manager.ts](../../src/agents/group-conversation/conference-call-manager.ts) dials through Twilio and relays over TwiML `<Sip>`, a second way to dial that nothing reaches.
- **On-behalf calls use their own room** (`onbehalf-${callId}`, [on-behalf-call-orchestrator.ts:290](../../src/services/outreach/on-behalf-call-orchestrator.ts)), so you are never on that call.
- **Voice ID can't attribute a turn.** The speaker-change detector only notices that a voice changed and asks "Someone new?". The `guest` tag it sets never reaches the prompt. With separate tracks, attribution doesn't need voice ID: each person's track says who they are.

**Why mix rather than switch the linked participant:** switching with `roomIO.setParticipant` on `ActiveSpeakersChanged` restarts the STT stream at every change. It loses the first syllables after each one, and it can't hear cross-talk. Mixing keeps one STT stream and the SDK's turn handling unchanged. When two people talk at once, STT hears both as one turn, which is how a person on the call would hear it.

## Global Constraints

- One flag: `GROUP_CALL`, made with `pnpm flags:new GROUP_CALL --default off --owner voice --kind experiment --issue '#<n>'`. With it off, every code path is unchanged: no mixer, no labels, no tool.
- v1 supports **one guest at a time**, dialled by phone. A second `addToCall` while a guest is on the call answers "Sarah's already on with us" and dials nothing.
- Audio format for the mix: 16 kHz, mono, 10 ms frames (160 samples), `frameSizeMs: 10`.
- Each PR is at most ~400 reviewable lines, branched from `origin/main`, with `Closes #<n>` in the body.
- Files over 500 lines may not grow (ratchet). `ferni-agent.ts` (817 lines) and `agent-setup.ts` (2353 lines) stay the same length or shrink.
- Ferni's lines follow `speech-markup-notes.ts`: no em dashes, no ellipses, no stage directions. No AI-disclosure changes.
- Fixtures are fictional: 555-01xx numbers, made-up names.
- Logs use `createLogger`, never a phone number in full (mask it like `maskPhone` in the on-behalf orchestrator).

## Review Focus

1. **The owner hangs up while the guest is still on.** Sarah must not be left in a room with Ferni. The session close removes the guest (Task 4 test `owner leaving removes the guest`).
2. **The guest hangs up or never answers.** Ferni says so once, in plain words, and the mix drops her track without a gap in the owner's audio (Task 1 test `a stream that ends becomes silence`; Task 4 tests `no answer` and `guest left`).
3. **The "Someone new?" prompt and voice emotion during a three-way call.** Both read the mixed audio as one person, so they would prompt or mislabel. While a guest is on the call, both pause (Task 3 tests).
4. **The guest says something personal** ("I'm allergic to nuts"). It must not be stored as the owner's fact (Task 3 memory guard).
5. **The owner's web reconnect mid-call.** `RoomIO` re-links its own input on reconnect and could replace the mix. The mix must still be the session input after the owner's track comes back (Task 2 test `owner reconnect keeps the mix`).

---

### Task 1: The room mix (no wiring)

**Files:**
- Create: `src/agents/group-conversation/audio-mix.ts`
- Create: `src/agents/group-conversation/talker-ledger.ts`
- Create: `src/agents/group-conversation/room-mix-input.ts`
- Test: `src/agents/group-conversation/__tests__/audio-mix.test.ts`, `__tests__/talker-ledger.test.ts`, `__tests__/room-mix-input.test.ts`

**Interfaces:**
- Produces: `mixFrames(frames: readonly Int16Array[]): Int16Array` (sum, clipped to int16), `frameRms(samples: Int16Array): number`.
- Produces: `class TalkerLedger { constructor(owner: string); readonly owner: string; note(identity: string, atMs: number, rms: number): void; dominant(fromMs: number, toMs: number): string | null }`, plus `VOICED_RMS = 500`.
- Produces: `class RoomMixInput extends voice.AudioInput { constructor(ledger: TalkerLedger); addTrack(identity: string, frames: ReadableStream<AudioFrame>): void; removeTrack(identity: string): void; get guests(): string[] }`. The owner is `ledger.owner`.
- Produces: `mixClock(): number` (`performance.now()`), the one clock for ledger notes and for every window a later task asks the ledger about.

- [ ] **Step 1: Write the failing tests**
  - `mixFrames`: `[1000, -1000] + [2000, -2000]` gives `[3000, -3000]`; `30000 + 10000` clips to `32767`; `-30000 + -10000` clips to `-32768`; frames of unequal length throw.
  - `frameRms`: all zeros gives `0`; a constant `1000` frame gives `1000`.
  - `TalkerLedger.dominant`: owner voiced for 30 ms and guest for 120 ms in the window gives the guest. Nothing voiced gives `null`. A tie gives the owner. Frames outside `[from, to)` don't count. Frames below `VOICED_RMS` don't count.
  - `RoomMixInput`: with fake `ReadableStream<AudioFrame>`s, an owner frame of `500`s plus a queued guest frame of `700`s comes out as one frame of `1200`s, and the ledger records both. `a stream that ends becomes silence`: after the guest stream closes, owner frames come out unchanged and `guests` is `[]`. `a slow guest never delays the owner`: with no guest frame queued, the owner frame is emitted at once.
- [ ] **Step 2: Run and see them fail.** `pnpm vitest run src/agents/group-conversation/__tests__/audio-mix.test.ts src/agents/group-conversation/__tests__/talker-ledger.test.ts src/agents/group-conversation/__tests__/room-mix-input.test.ts`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.** The mix is clocked by the owner's track: on each owner frame, take the oldest queued frame from each guest (silence if none), mix, `note()` each person's RMS, and push the mixed frame into `this.multiStream`. Each guest queue holds at most 5 frames (50 ms), and when it's full the oldest is dropped. A guest is never waited on.
- [ ] **Step 4: Run the tests and see them pass.** Then `pnpm typecheck`.
- [ ] **Step 5: Prove the tests can fail.** Change the clip to wrap instead of clamp, and make `dominant` return the owner always. Watch the named tests fail, revert, and note it in the PR.
- [ ] **Step 6: Commit and open the PR.** Message: `feat(voice): mix several callers into one audio input`.

### Task 2: Ferni hears the guest and knows it's her (flag `GROUP_CALL`)

**Files:**
- Create: `src/config/flags/GROUP_CALL.ts` (via `pnpm flags:new`, see Global Constraints)
- Create: `src/agents/group-conversation/group-hearing.ts`
- Create: `src/agents/personas/stt-chain.ts`
- Modify: `src/agents/personas/ferni-agent.ts:650-653` (the `return sttWithNameFix(...)` becomes one `return sttChain(...)` call: net line count ≤ 0)
- Modify: `src/agents/multi-agent/persona-agent-factory.ts:249` (one call right after `session.start` closes)
- Test: `src/agents/group-conversation/__tests__/group-hearing.test.ts`, `src/agents/personas/__tests__/stt-chain.test.ts`

**Interfaces:**
- Consumes: `new RoomMixInput(new TalkerLedger(ownerIdentity))` and `mixClock()` (Task 1); `roomInputOptions(participant, sessionId)` from `room-input-options.ts` for each person's noise cancellation; `dispatchedUserName` (`src/utils/ferni-intro.ts`) for the owner's first name, falling back to `the caller`.
- Produces: `attachGroupHearing(args: { session: voice.AgentSession; agent: voice.Agent; room: Room; ownerIdentity: string; sessionId: string }): () => void`. It returns a detach function, and it does nothing unless `flagOn('GROUP_CALL')`.
- Produces: `groupHearing(sessionId: string): { guestName(identity: string): string | undefined; guestNames(): string[]; ledger: TalkerLedger; guestOn(): boolean } | undefined`. `guestNames()` is every guest seen this call, including ones who left (Task 3 needs them).
- Produces: `sttChain(session, audio, base): Promise<ReadableStream<stt.SpeechEvent | string> | null>`, composing first-turn-fast, name-fix and `labelGuestTurns` in that order.
- Produces: `labelGuestTurns(events, sessionId): ReadableStream<...>`. On a `FINAL_TRANSCRIPT` whose window (end of the previous final to now) has a guest as `dominant`, it rewrites `alternatives[0].text` to `[<guestName>] <text>`. Owner turns are unchanged.

- [ ] **Step 1: Write the failing tests**
  - `group-hearing`: with the flag off, a second participant connecting leaves `session.input.audio` as it was. With it on, the first non-agent participant other than the owner sets `session.input.audio` to a `RoomMixInput` and adds a system note to the chat context, in the same way as `recall-note.ts`. The note says: `Sarah is on this call by phone with <owner first name>. Lines that start with [Sarah] are hers. Every other user line is <owner first name>'s. Talk with both of them, use their names, and let them talk to each other.`
  - `owner reconnect keeps the mix`: the owner's `participantDisconnected` then `participantConnected` (same identity) leaves `session.input.audio === mix` and re-adds the owner's track.
  - `guest left`: the guest's `participantDisconnected` calls `removeTrack` and adds the note `Sarah has left the call.`
  - `stt-chain`: a final transcript in a guest-dominant window comes out as `[Sarah] see you at six`. One in an owner-dominant window is unchanged. With no `groupHearing` for the session (solo call, or flag off), every event passes through untouched.
- [ ] **Step 2: Run and see them fail.** `pnpm vitest run src/agents/group-conversation/__tests__/group-hearing.test.ts src/agents/personas/__tests__/stt-chain.test.ts`
- [ ] **Step 3: Implement.** Each track is read with `new AudioStream(track, { sampleRate: 16000, numChannels: 1, frameSizeMs: 10, noiseCancellation })`. The guest's name is the SIP participant's `name` (set when dialled in Task 4), falling back to `the guest`.
- [ ] **Step 4: Run the tests, then the existing STT tests unchanged.** `pnpm vitest run src/agents/personas/__tests__/` and `pnpm typecheck`.
- [ ] **Step 5: Prove the tests can fail.** Skip the `session.input.audio` assignment and drop the prefix, and watch the tests go red. Note it in the PR.
- [ ] **Step 6: Commit and open the PR.** `feat(voice): hear a second caller and label their turns behind group_call`. Note: the PR subject must be all lower case.

### Task 3: Guards that assume one voice (before any dialling)

**Files:**
- Create: `src/agents/group-conversation/guest-turn.ts`
- Modify: `src/agents/voice-agent/speaker-change-feed.ts` (skip feeding while `groupHearing(sessionId)?.guestOn()`)
- Modify: `src/agents/personas/ferni-agent.ts` sttNode tee: `processAudioStream` is not started while a guest is on (net lines ≤ 0; move the call into `stt-chain.ts` if needed)
- Modify: the owner-memory writers found in Step 1
- Test: `src/agents/group-conversation/__tests__/guest-turn.test.ts`, plus one test per memory writer changed

**Interfaces:**
- Produces: `isGuestTurn(text: string, sessionId: string): boolean`. It is true only when `groupHearing(sessionId)` exists and `text` starts with `[<a current or past guest's name>] `. An owner who says "[Sarah]" on a solo call is not a guest turn.

- [ ] **Step 1: Map the writers.** Run `git grep -n -l -E "UserInputTranscribed|user_input_transcribed|ConversationItemAdded|conversation_item_added" -- src ':!*fixtures*' ':!*heldout*' ':!*held-out*' ':!*blind*' ':!*sealed*' ':!*corpus*' ':!scripts/crisis-eval/**' ':!scripts/voice-eval/**' ':!*__tests__*'` (36 files on 2026-11-16). Put each file in one of two lists: "writes something about the owner" (facts, people, emotions, commitments, open loops) or "doesn't". The PR body lists both.
- [ ] **Step 2: Write the failing tests.** For each owner writer: a turn `[Sarah] I'm allergic to nuts` in a group call stores nothing about the owner. The same text from the owner on a solo call is stored as before. Crisis detection is **not** gated: a guest turn that trips it still runs the crisis path. Also test `speaker check paused` (no `feedAudio` while a guest is on) and `voice emotion paused`.
- [ ] **Step 3: Run and see them fail.**
- [ ] **Step 4: Implement** `isGuestTurn` and an early return in each writer.
- [ ] **Step 5: Run the tests, then `pnpm typecheck` and `pnpm quality:arch`.**
- [ ] **Step 6: Prove each guard can fail** by removing the early return. Commit and open the PR: `fix(memory): keep a guest's words out of the owner's memories`.

### Task 4: Dial the guest into the caller's own room

**Files:**
- Create: `src/agents/group-conversation/dial-guest.ts`
- Modify: `src/agents/group-conversation/voice-integration.ts`: `group_call_add` and `group_call_remove` call `dial-guest`, and it keeps publishing the existing `group_call_participant_added|status|removed` messages
- Delete: `src/agents/group-conversation/conference-call-manager.ts`, the `/call/add`, `/call/remove` and `/call/answer` routes in `src/api/group-conversation-routes.ts`, and their tests (grep proof in the PR that nothing else imports them)
- Test: `src/agents/group-conversation/__tests__/dial-guest.test.ts`

**Interfaces:**
- Produces: `dialGuest(req: { roomName: string; e164: string; name: string; callId: string }, sip?: GuestSipPort): Promise<{ joined: string } | { failed: 'no_answer' | 'busy' | 'already_on' | 'no_trunk' | 'error'; detail?: string }>`, where `joined` is the participant identity `guest_<callId>`.
- Produces: `hangUpGuest(roomName: string, identity: string, sip?: GuestSipPort): Promise<void>` and `type GuestSipPort = { dial(...): Promise<void>; remove(room: string, identity: string): Promise<void>; participants(room: string): Promise<{ identity: string; kind: string }[]> }`. The default port uses `SipClient.createSipParticipant(SIP_TRUNK_ID, e164, roomName, { participantIdentity, participantName: name, playDialtone: false, ringingTimeout: 30, waitUntilAnswered: true, timeout: 40 })` and `RoomServiceClient.removeParticipant`.

- [ ] **Step 1: Write the failing tests** with a fake `GuestSipPort`:
  - Dials into the given room with identity `guest_<callId>`.
  - `already_on` when a `guest_` participant is present, and nothing is dialled.
  - `no_trunk` when `SIP_TRUNK_ID` is unset.
  - `no answer`: a ringing timeout maps to `no_answer`.
  - `owner leaving removes the guest`: closing the session calls `remove` for the guest.
  - The log line masks the number (`+1555****0123`).
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Hook "owner leaving" onto the session's `close` event inside `attachGroupHearing`'s detach (Task 2).
- [ ] **Step 4: Run the tests, `pnpm typecheck`, and `pnpm quality:knip`** (no new dead code once the Twilio path is gone).
- [ ] **Step 5: Prove the tests can fail.** Commit and open the PR: `feat(voice): dial a guest into the caller's own room`.

### Task 5: The `addToCall` tool, with a read-back first

**Files:**
- Create: `src/tools/domains/telephony/add-to-call.ts`, `add-to-call-confirm.ts`
- Modify: `src/tools/domains/telephony/index.ts` (register, flag-gated like `TOOLS_REAL_CALL_USER`), `src/tools/registry/outbound-gate.ts` (`addToCall: addToCallConfirm`), `src/tools/domains/communication/outreach/outreach-confirm-family.ts` (`addToCall` in `CALL_TOOLS`), and the telephony semantic definition
- Test: `src/tools/domains/telephony/__tests__/add-to-call.test.ts`

**Interfaces:**
- Consumes: `findContact`, `checkDialableNumber`, `checkCallCompliance`, `callConfirm.prepare` (wrapped), and `dialGuest` (Task 4). The room name comes from `getJobContext().room.name`, as in `call-timeline-session.ts`.
- Produces: tool id `addToCall`, args `{ contactQuery: string; phoneNumber?: string }`, and `addToCallConfirm: ConfirmSpec`. That spec has **no** `sameAction`: a yes to `callOnBehalf` must not confirm bringing someone into this call, or the reverse.

- [ ] **Step 1: Write the failing tests:**
  - The read-back is `Bring Sarah into this call at 555-0123?`.
  - Nothing dials before the yes. On a yes, `dialGuest` gets the read-back number and no other.
  - On `joined`, Ferni's next instruction is to greet her by name and tell her who asked: `Hi Sarah, it's Ferni. <Owner first name> asked me to bring you in.`
  - Each `failed` reason has its own honest line: `no_answer` gives `She didn't pick up.`; `already_on` gives `Sarah's already on with us.`
  - The tool is absent when `GROUP_CALL` is off.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and `pnpm typecheck`.**
- [ ] **Step 5: Prove the tests can fail.** Commit and open the PR: `feat(tools): bring someone into the call after a read-back`.

### Task 6: The web shows who's on and can hang up the guest

**Files:**
- Modify: `apps/web/src/app/group-data-messages.ts` (render the guest from `group_call_participant_added|status|removed`)
- Create: `apps/web/src/ui/call-guest-chip.ui.ts` (name, status `ringing | on the call | left`, and a "Hang up" button that sends `{ type: 'group_call_remove', participantId }`)
- Test: `apps/web/src/ui/__tests__/call-guest-chip.test.ts`

- [ ] **Step 1: Write the failing tests.** `added` then `status: connected` shows `Sarah · on the call`. "Hang up" publishes `group_call_remove` with her id. `removed` hides the chip. Colours come from `var(--color-*)` tokens only.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, then `pnpm typecheck`.**
- [ ] **Step 5: Prove the tests can fail.** Commit and open the PR: `feat(web): show a call guest and let you hang up on them`.

## Rollout

1. Merge Tasks 1–6 with `GROUP_CALL` off, in order. Tasks 3 and 4 must both be merged before the flag is turned on anywhere.
2. Deploy to dev from `main` (skill `deploy-agent`), with `lk room list --project ferni-dev` empty. Then `lk agent update-secrets --secrets "GROUP_CALL=on"` on dev.
3. Seth places a real three-way call on dev (web plus a phone he owns) and checks:
   - the read-back;
   - that Ferni greets the guest by name;
   - that Ferni answers a question the guest asks;
   - that the owner's memories after the call hold nothing the guest said;
   - that hanging up from the web removes the guest.

   Paste the call transcript, with labels, into the issue.
4. Prod only after that dev call, and after a voice-eval run of the solo scenarios shows no change with the flag on. The mixer must be invisible on solo calls.
5. Remove the flag once it's on in prod.
