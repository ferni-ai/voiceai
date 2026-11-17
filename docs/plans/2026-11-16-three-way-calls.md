# Three-way calls: Ferni brings someone into your call

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You're on a web call with Ferni and say "get Sarah on the line." Sarah has already agreed to be called in. Ferni reads back who and which number, you say yes, and Sarah's phone rings. Ferni tells her he's taking notes for you and asks if that's okay. When she says yes, all three of you talk. Ferni knows exactly which of you said what, stays out of the way while you two talk to each other, and keeps Sarah's words out of your memories.

**Architecture:** The agent stays one `AgentSession`.
- When a guest joins, `RoomMixInput` (Task 1, merged) becomes `session.input.audio`. VAD and adaptive barge-in then hear both people, so either can interrupt Ferni.
- Attribution comes from the room, not from a model. Each person's track also feeds that person's own Cartesia ink-2 stream: the guest's at 8 kHz phone settings, with her name as a keyterm.
- A floor arbiter merges the streams into the one event stream the SDK expects. It labels each final with its speaker and holds the end of a turn until everyone is quiet.
- An addressee gate in `FerniAgent.onUserTurnCompleted` keeps Ferni quiet when the two humans are talking to each other.
- The guest is dialled into the caller's own room with LiveKit `createSipParticipant`, and only after she has opted in. The Dec 2024 Twilio conference path is deleted.

**Tech Stack:** TypeScript, `@livekit/agents` 1.9.3 (`sttNode`, `SpeechData.speakerId`, `onUserTurnCompleted` + `StopResponse`), `@livekit/rtc-node` 1.1.0, `livekit-server-sdk` `SipClient`, the Cartesia plugin (one WebSocket per `stt.stream()`), Vitest.

**Spec:** This document.
- Seth, 2026-11-16: "Me on web, Ferni calls someone and brings them into the room and then we all have a conversation together."
- Seth's rulings, 2026-11-16:
  1. The guest opener gets a note-taking clause and asks for a yes. This amends D3 for guests brought into a call only.
  2. Ferni dials only guests who opted in beforehand.
  3. Ferni never keeps a guest's voice print.
- Seth, 2026-11-17 ("Add all six"): the call should be engaging, not only correct. This adds six features: Ferni stays out of the humans' conversation (Task 6), hosts by example (Task 7), and Tasks 13–17 below (scoring a two-caller call, stepping out, a recap both people get, remembering a returning guest by name, small group moments). Ruling 3 stands: Task 16 recognises a guest by the number Ferni dialled, never by her voice, and only with her separate yes.
- Research behind the design: `.superpowers/research/reports/Speaker identity for group calls.md` in the main checkout (git-ignored). Its main findings:
  - **Speaker labels drive turn-taking.** A text model given correct speaker labels takes turns correctly 98.4% of the time, against 49% without them (MP-Bench, arXiv 2609.13076).
  - **Ferni's LLM speaks too early.** Gemini 3.5 Flash answered before it was addressed in 48% of multi-speaker probes (MSI-Bench, arXiv 2609.24812).
  - **Per-track transcription is the industry pattern.** LiveKit's multi-user transcriber and Recall.ai's "perfect diarization" both transcribe each participant's track separately.

## Why (read from the code, 2026-11-16)

- **Ferni hears one person.** `session.start()` links to a single participant ([persona-agent-factory.ts:240](../../src/agents/multi-agent/persona-agent-factory.ts)). A second human's audio reaches you and not Ferni.
- **Adding someone is switched off.**
  - `POST /api/group/call/add` returns 501 ([group-conversation-routes.ts:216](../../src/api/group-conversation-routes.ts)).
  - Nothing in `apps/web/src` sends `group_call_add`.
  - [conference-call-manager.ts](../../src/agents/group-conversation/conference-call-manager.ts) is a second, unreachable way to dial, through Twilio.
- **Voice ID can't attribute a turn.** The speaker-change detector only notices that a voice changed. With separate tracks, attribution doesn't need voice ID, because each track already says who it is.
- **Ferni would answer every line.** The SDK commits a reply after every user turn, including a turn where you were talking to Sarah.

**Why per-person STT instead of a loudness guess:** the first design attributed turns by comparing each track's loudness. It said `[unclear]` whenever nobody was clearly louder, and it failed open in three ways an automated security review found. Per-person streams make attribution exact by construction. The mixed audio stays as the session input only for VAD and barge-in. Cost: a second ink stream while a guest is on, billed on talk time.

## Global Constraints

- **One flag: `GROUP_CALL`**, off by default (`src/config/flags/GROUP_CALL.ts`, issue #3979).
  - With it off, every code path is unchanged: no mix, no extra streams, no gate, no tool.
  - It goes on in a deployed agent only after Tasks 2–6 are merged.
- **v1 supports one guest at a time, dialled by phone.** A second `addToCall` while a guest is on answers "Sarah's already on with us" and dials nothing.
- **Guest admission:** only a participant whose identity starts with `guest_` and whose kind is SIP or STANDARD. Only our server chooses that identity.
- **The guest's display name** is cleaned before it reaches any note or label (`guestDisplayName`).
- **Consent:** Ferni dials only a guest with a recorded opt-in for this owner. Her turns reach the conversation only after she says yes to the note-taking clause. Ferni never stores an embedding of a guest's voice.
- **Mix audio format:** 16 kHz, mono, 10 ms frames (160 samples). The guest's STT stream uses the phone STT options (8 kHz).
- **PR shape:** each PR is at most ~400 reviewable lines (`scripts/ci/reviewable.sh`), branched from `origin/main`, with `Refs #3979`.
- **Ratchet:** files over 500 lines may not grow. `ferni-agent.ts` and `agent-setup.ts` stay the same length or shrink. A function over 150 lines may grow by at most 7 lines per change.
- **Ferni's lines** follow `speech-markup-notes.ts`: no em dashes, no ellipses, no stage directions. Hosting behaviour is taught with example lines, not descriptions (#3764).
- **Crisis detection is never gated:** not by the addressee gate, not by consent hold, not by owner-only rules.
- **Fixtures and logs:**
  - Fixtures are fictional: 555-01xx numbers, made-up names.
  - Logs use `createLogger`, never a full phone number, and never a participant identity that could carry one.

## Review Focus

1. **One person stops while the other is mid-sentence.** Ferni must not reply over the second person (Task 3: `end of turn waits for everyone`).
2. **Speakerphone echo.** A guest's phone may send Ferni's voice back on her track. A guest final that matches Ferni's recent words is dropped (Task 3: `echo is dropped`). Rung 3 measures it on a real phone, including speakerphone.
3. **You and Sarah talk to each other.** Ferni stays quiet unless named or clearly asked, and still answers after a natural lull (Task 6).
4. **The owner hangs up, or drops and comes back, while the guest is on.**
   - When the owner leaves, the guest leaves the mix and Ferni waits.
   - When the owner's session closes, the guest is hung up (Tasks 2 and 10).
5. **The guest says no, or something personal.**
   - A no takes her out before any of her words reach the conversation (Task 10).
   - "I'm allergic to nuts" is never stored as the owner's fact (Task 4).

---

### Task 1: The room mix (merged, #3982)

`mixFrames`, `frameRms`, `RoomMixInput(ledger)` and `mixClock()` are on main. `TalkerLedger` is on main too; Task 3 deletes it once nothing reads it.

### Task 2: Ferni hears the guest (flag `GROUP_CALL`)

**Done, in three PRs:**
- **2a (#4006):** `guest-display-name.ts`, `group-call-notes.ts` and the admission predicate.
- **2b-A (#4023):** `group-hearing.ts`, the call in `persona-agent-factory.ts`, and `GROUP_CALL.ts`.
- **2b-B (#4030):** `sttChain`, with `[unclear]` labels.

**Files:** `src/config/flags/GROUP_CALL.ts`; `src/agents/group-conversation/group-hearing.ts`, `group-call-notes.ts`, `guest-display-name.ts`; `src/agents/personas/stt-chain.ts`; one call in `persona-agent-factory.ts`; `room-input-options.ts` (sample rate).

**Interfaces:**
- Produces: `hearGroupCall(persona, setup, call: { room; userParticipant }, sessionId): void`, called once right after `session.start`. It attaches the hearing (a no-op unless the flag is on) and wraps the persona's cleanup so the hearing detaches first.
- Produces: `groupHearingFor(session): GroupHearing | undefined`. On main it holds only `guestLastOnAt()`, the one getter the `[unclear]` labels read. Task 3 adds back the getters it reads (from `guestName`, `guestNames`, `guestOn`, `guestIdentity`, `ownerLabel`), and only those.
- Produces: `guestDisplayName(raw: string | undefined, ownerFirstName: string): string`.

Behaviour (tests exist on the branch):
- **The mix replaces the input** when an admitted guest joins. Each track is read at 16 kHz with that person's noise cancellation.
- **Join note:** "Sarah is on this call by phone with Seth. Lines that start with [Sarah (guest)] are hers, and lines that start with [Seth] are Seth's. A line marked [unclear] could be either of them: if it matters who said it, ask. Talk with both of them, use their names, and let them talk to each other. Sarah can hear everything you say, so don't bring up Seth's private things unless Seth does." Task 7 replaces the descriptive middle with example lines.
- **Guest leaves:** "Sarah has left the call."
- **Owner leaves:** the guest comes out of the mix, and the note says "Seth has dropped off the call. Wait for Seth to come back, and don't talk about Seth's private things with Sarah." When the owner returns, both tracks go back in.
- **The STT chain fails closed until Task 3 lands.** While a guest is on, and for 2000 ms after she was last on, every final is labelled `[unclear] `. An empty final passes through unlabelled. While lines are `[unclear]`, the join note says not to bring up Seth's private things at all. Task 3 restores "unless Seth does".
- **The loudness labelling and `TalkerLedger.attribute()` come out of this PR,** because Task 3 replaces them.

- [x] **Step 1:** Split the branch into 2a and 2b, rebased on `origin/main`. Remove the ledger-based labels so `sttChain` labels `[unclear]` while a guest is on. Both PRs must stay under ~400 lines.
- [x] **Step 2:** Run the tests, `pnpm typecheck`, `pnpm quality:knip`, the ratchet and `pnpm quality:arch`. Prove the tests can fail: admission, name cleaning, owner-leave, and fail-closed labels.
- [x] **Step 3:** Open the PRs: `feat(voice): clean group call guest names and notes` and `feat(voice): hear a second caller behind group_call`.

### Task 3: One speech stream per person, merged by a floor arbiter

**Files:**
- Create: `src/agents/group-conversation/floor-arbiter.ts` (pure)
- Create: `src/agents/group-conversation/person-stt.ts`
- Modify: `group-hearing.ts` (tee each track into its person stream), `stt-chain.ts`
- Delete: `talker-ledger.ts` and its test, and the ledger argument of `RoomMixInput`. Include grep proof that nothing else reads them.
- Test: `__tests__/floor-arbiter.test.ts`, `__tests__/person-stt.test.ts`, `stt-chain.test.ts`

**Interfaces:**
Status: 3a (the arbiter and its tests) is built and reviewed on `feat/group-call-floor-arbiter`. 3b-1 adds the person streams and the wiring. 3b-2 deletes the ledger and relaxes the join note.

- Produces: `floorArbiter(streams: AsyncIterable<{ identity: string; label: string; event: stt.SpeechEvent }>): ReadableStream<stt.SpeechEvent>`, with no clock. It enforces these rules:
  - **START_OF_SPEECH** passes when the floor goes from empty to busy.
  - **END_OF_SPEECH** passes only when every person's stream is quiet.
  - **FINAL_TRANSCRIPT** and **PREFLIGHT** pass with text `[<label>] <text>` and `alternatives[0].speakerId = identity`. The guest's label is `guestRole(name)` (`Sarah (guest)`), and the owner's is the owner's first name. An empty final passes through unlabelled.
  - **INTERIM_TRANSCRIPT** passes for the most recent speaker only, with `speakerId` set and its text unlabelled, so barge-in counts real words.
  - **Labels** are NFKC-normalised and checked against an allowlist; a label that fails becomes `unclear`. Spoken text is not NFKC-normalised (that would change "2½" and break echo alignment); it only loses bracket characters.
  - **PREFLIGHT** is dropped while any other person is speaking.
  - **Timestamps** pass through unchanged. Each person stream sets `startTimeOffset` so its times are relative to the session's `inputStartedAt`, the SDK's own base.
  - **A person's stream that ends, or a person who leaves,** emits a synthetic END_OF_SPEECH, so the floor never sticks.
- Produces: `stripTurnLabel(text): string`. Barge-in, the backchannel check and the echo check read text through it. Owner-only decisions (Tasks 4–6) read `speakerId` and the identity, never the text prefix.
- Produces: `personStream(identity, label, frames, stt, opts: { phone: boolean; keyterms: string[] })`. It opens `stt.stream()` and feeds silence while the agent's input should be discarded. The SDK's `shouldDiscardInputAudio()` is a private method of `AgentActivity`; mirror it through the existing read in `stt-audio-diagnostics.ts` rather than adding a second private access.
- `sttChain` behaviour:
  - With a hearing and a guest on, it drains the mixed input it is given and returns the arbiter's stream.
  - On solo calls, or with the flag off, it is unchanged, byte for byte.

- [ ] **Step 1: Write the failing tests.**
  - `end of turn waits for everyone`: Seth's END arrives while Sarah is mid-sentence, and no END is emitted until Sarah's END.
  - `finals carry the speaker`: Sarah's final comes out `[Sarah] see you at six` with her identity as `speakerId`.
  - `preflight waits`: Seth's preflight is dropped while Sarah is speaking.
  - `echo is dropped`: a guest final whose text `looksLikeEcho` matches Ferni's spoken text from the last 10 s is dropped and counted in the log.
  - `solo is unchanged`: with no guest, the base stream passes through untouched.
  - `the mix is drained`: the mixed input is read to the end, so it never grows without bound.
- [ ] **Step 2: Run and see them fail. Step 3: Implement. Step 4:** Run the tests, `pnpm typecheck`, knip and the ratchet.
- [ ] **Step 5:** Prove the tests can fail: pass any END at once; skip the label; keep echo. Then open the PR: `feat(voice): give each caller their own speech stream on a group call`.

### Task 4: Keep the guest's words out of the owner's memories

**Files:** create `src/agents/group-conversation/owner-turn.ts`; modify `speaker-change-feed.ts`, the `processAudioStream` tee in `ferni-agent.ts` (net lines ≤ 0), and the owner-memory writers found in Step 1. Tests: `__tests__/owner-turn.test.ts`, plus one test per writer changed.

**Interfaces:**
- Produces: `ownerTurnText(text: string, session): string | null`.
  - With no hearing, or no guest ever on the call, it returns `text` unchanged.
  - Once a guest has been on, it returns the text with the label stripped only when the text starts with `ownerLabel()`, and `null` otherwise. `[unclear]` and guest lines give `null`.
  - Owner-memory writers store only a non-null result.

- [ ] **Step 1: Map the writers.**
  - Run `git grep -n -l -E "UserInputTranscribed|user_input_transcribed|ConversationItemAdded|conversation_item_added" -- src ':!*__tests__*'` with the eight sealed-set exclusions.
  - Sort each hit into "writes something about the owner" or "doesn't". The PR body lists both.
  - Look first for one point every transcript passes through. If more than 8 writers still need their own guard, split into Task 4a (`owner-turn`, the speaker-change and voice-emotion pause, and the first 8 writers) and Task 4b (the rest).
- [ ] **Step 2: Write the failing tests.**
  - On a group call, `[Sarah] I'm allergic to nuts` stores nothing about the owner.
  - On a solo call, the same text from the owner is stored.
  - A guest turn that trips crisis detection still runs the crisis path.
  - `speaker check paused` and `voice emotion paused` while a guest is on.
- [ ] **Steps 3–5:** Run the tests and see them fail, implement, run them again, then `pnpm typecheck` and `pnpm quality:arch`. Prove each guard can fail. Open the PR: `fix(memory): keep a guest's words out of the owner's memories`.

### Task 5: Only the owner can trigger private actions on a group call

**Files:** create `src/agents/group-conversation/owner-only.ts`. Modify the gate where `OUTBOUND_TOOLS` is checked (`src/tools/registry/outbound-gate.ts` and its caller), plus the tools that read the owner's messages, email, calendar, contacts or memories, listed in the PR. Test: `__tests__/owner-only.test.ts` plus one gate test.

**Interfaces:**
- Produces: `ownerMayAct(session, lastUserText: string): true | { ask: string }`.
  - It returns `true` on a solo call, or when `ownerTurnText` is non-null.
  - Otherwise it returns `{ ask: 'Seth, is that something you want me to do?' }` with the owner's first name, and the tool does not run.
  - Crisis and support tools (for example `sendSupportCall`, and anything the crisis path calls) are never gated: a guest in crisis gets help at once. A test proves it.

- [ ] **Steps 1–6:**
  - List the gated tools.
  - Write the failing tests: on a group call, `callOnBehalf` from a `[Sarah]` turn returns the ask; the same request from `[Seth]` runs; solo calls are unchanged.
  - Implement, then prove the gate can fail.
  - Open the PR: `fix(tools): only the owner can trigger private actions on a group call`.

### Task 6: Ferni stays out of a conversation that isn't his

**Files:**
- Create: `src/agents/group-conversation/addressee-gate.ts`
- Modify: `FerniAgent.onUserTurnCompleted` (after the screening and roundtable checks; net lines ≤ 0 in `ferni-agent.ts`, so the logic lives in the new module)
- Test: `__tests__/addressee-gate.test.ts`

**Interfaces:**
- Produces: `addresseeDecision(turn: { speaker: 'owner' | 'guest' | 'unclear'; text: string }, call: { ferniLastSpokeTo?: 'owner' | 'guest' | 'both'; otherSpeaking: boolean; ownerName: string; guestName: string }): 'reply' | 'silent' | 'judge'`. The rules run in order:
  1. A crisis signal → `reply`.
  2. The turn names Ferni, or answers a question Ferni just asked that person → `reply`.
  3. The other person is speaking → `silent`.
  4. The turn names the other human, or follows the other human's line with no mention of Ferni → `silent`.
  5. Everything else → `judge`.
- Produces: `judgeAddressee(recentLabelledTurns: string[], timeoutMs = 400): Promise<'reply' | 'silent'>`. It is a short LLM check that leans toward silence, and its prompt says so. On a timeout or error it returns `silent`.
- **Lull rule:** after a `silent` decision, if nobody speaks for 2.5 s, Ferni replies to the last turn.
- **Wiring:** a `silent` result throws `StopResponse`, but only after the turn has been added to the chat context and passed to WrapUp's `observe`. The SDK drops the message on `StopResponse`, and the model must still see what was said.

- [ ] **Step 1: Write the failing tests.**
  - `[Seth] Sarah, did you book it?` → silent.
  - `[Sarah] Ferni, what's the weather there?` → reply.
  - A crisis line from either person → reply.
  - A silent turn still appears in `chatCtx`.
  - The lull fires after 2.5 s of quiet.
  - A judge timeout gives silent.
  - On a solo call the gate is never consulted.
- [ ] **Steps 2–5:** Run the tests and see them fail, implement, run them again, then `pnpm typecheck`. Prove it can fail: always reply; drop the chat append. Open the PR: `feat(voice): let ferni stay quiet while the two of you talk`.
- [ ] **Step 6 (after Task 13):** Score the gate with Task 13 on dev, and paste Ferni's talk share, cut-ins and addressed-reply latency into the PR or issue. A silent Ferni says nothing at all, not even "mm": from a third voice on a phone line, a backchannel lands as an interruption. Task 17 revisits this once there are numbers.

### Task 7: Hosting lines Ferni can copy the shape of

**Files:** `group-call-notes.ts` (the join note) and a flagged per-turn note following the `personaVoiceNote` pattern (`turn-request.ts`), never on a crisis turn. Test: the note tests.

- [ ] **Step 1: Write the examples,** in commas and full stops. They come from situations unlike the live call, so they are not copied word for word (#3764). There are four kinds:
  - introducing two people;
  - bridging ("Sarah, Seth was just telling me about the move");
  - stepping back ("I'll let you two sort that out");
  - a warm goodbye when someone leaves.

  The descriptive middle of the join note is replaced by these lines.
- [ ] **Step 2: Tests.**
  - The note contains the examples and no em dashes or ellipses.
  - The per-turn note is absent on crisis turns and on solo calls.
  - A bridge draws only on what was said on this call. With an owner memory present ("Seth is job hunting"), neither note contains it.
- [ ] **Step 3:** Open the PR: `feat(voice): teach ferni to host a three-way call by example`.

### Task 8: The end-of-call recap the owner confirms

**Files:** `src/agents/personas/wrap-up.ts` and its prompt; `src/agents/group-conversation/group-recap.ts`. Tests next to both.

**Interfaces:**
- WrapUp's prompt labels lines with real names instead of `Caller`.
- After the guest leaves, `groupRecapOffer(session): string | null` gives at most one line, for plans that involve the owner, e.g. "Want me to remember dinner with Sarah at six on Friday?"
- An owner-labelled yes saves the plan with `keepForRecall`. Anything else saves nothing.

- [ ] **Steps 1–5:**
  - Write the failing tests: a plan made with Sarah gives one offer; a yes from `[Seth]` saves it; a yes from `[Sarah]` saves nothing; no plan means no offer.
  - Implement, then prove the tests can fail.
  - Open the PR: `feat(memory): offer to remember plans made on a three-way call`.

### Task 9: A guest opts in before Ferni ever calls her

**Files:** a consent store with port and adapter under `src/agents/group-conversation/` (or the outreach context if a guest-consent store already exists; Step 1 finds out); an API route and a small web page for the yes; and an invite tool.

**Interfaces:**
- Produces: `hasGuestConsent(ownerUid: string, e164: string): Promise<boolean>`.
- Produces: `recordGuestConsent(ownerUid, e164, wordingVersion): Promise<void>`.
- Produces: `revokeGuestConsent(ownerUid, e164): Promise<void>`.
- Phone numbers are stored hashed.
- The page wording says: "Seth would like Ferni, his AI friend, to be able to bring you into his calls. Ferni takes notes for Seth on those calls. You can say no on any call, or stop this any time."

- [ ] **Step 1: Search for existing invite, SMS-consent or opt-in flows** (on-behalf outreach, `CALL_CAPTURE_CONSENT`) and reuse one. Name it in the PR.
- [ ] **Step 2: Write the failing tests.**
  - No record means no consent.
  - A yes recorded then revoked means no consent.
  - The new collection is classified in `copy-user.test.ts` as never copied.
- [ ] **Steps 3–5:** Implement, prove the tests can fail, then open the PR(s), split if over ~400 lines: `feat(voice): let a guest opt in to being called into a call`.

### Task 10: Dial the guest into the caller's own room

**Files:**
- Create: `src/agents/group-conversation/dial-guest.ts`
- Modify: `voice-integration.ts` (`group_call_add` and `group_call_remove`)
- Modify, for the D3 amendment: `docs/decisions/register.md` D3, a new guest opener next to `outboundOpener` in `src/services/outreach/opening-line.ts`, and a pinning test for it beside `src/agents/outbound-call/__tests__/call-screener.test.ts`. The register says "To change a decision, ask Seth": Seth ruled on this amendment on 2026-11-16, and the PR quotes the ruling.
- Delete: `conference-call-manager.ts` and the `/call/add`, `/call/remove` and `/call/answer` routes, with grep proof.
- Test: `__tests__/dial-guest.test.ts`

**Interfaces:**
- Produces: `dialGuest(req: { roomName; e164; name; callId; ownerUid }, sip?: GuestSipPort): Promise<{ joined: string } | { failed: 'no_consent' | 'no_answer' | 'busy' | 'already_on' | 'no_trunk' | 'error'; detail?: string }>`.
  - `joined` is `guest_<callId>`.
  - The default port uses `SipClient.createSipParticipant(SIP_TRUNK_ID, e164, roomName, { participantIdentity, participantName: name, playDialtone: false, ringingTimeout: 30, waitUntilAnswered: true, timeout: 40 })`.
- Produces: `hangUpGuest(roomName, identity, sip?)`.
- **The opener (Seth's ruling):** "Hi Sarah, it's Ferni, Seth's AI friend. Seth brought you into our call, and I'm taking notes for him, is that okay?"
  - Until she says yes, her finals are held, not added to the conversation. Crisis detection still runs on held finals, and a crisis signal releases the turn to the crisis path at once.
  - A no, or 10 s with no answer, hangs her up with the note "Sarah didn't want to join, so I let her go."

- [ ] **Step 1: Write the failing tests** with a fake port:
  - Without consent: `no_consent`, nothing is dialled.
  - Dials with identity `guest_<callId>`.
  - `already_on`.
  - `no_trunk`.
  - A ringing timeout gives `no_answer`.
  - Her yes releases the held finals; her no hangs up and nothing she said reaches `chatCtx`; a held guest turn with a crisis signal still reaches the crisis path.
  - The owner's session closing removes the guest.
  - The number is masked in logs.
- [ ] **Steps 2–5:** Run and see the tests fail, implement, then run the tests, `pnpm typecheck` and knip. Prove the tests can fail. Open the PR: `feat(voice): dial an opted-in guest into the caller's own room`.

### Task 11: The `addToCall` tool, with a read-back first

**Files:** `src/tools/domains/telephony/add-to-call.ts`, `add-to-call-confirm.ts`; register it flag-gated in `telephony/index.ts`; add it to `OUTBOUND_TOOLS` and `CALL_TOOLS`. Test: `__tests__/add-to-call.test.ts`.

**Interfaces:**
- Tool id `addToCall`, args `{ contactQuery: string; phoneNumber?: string }`.
- `addToCallConfirm: ConfirmSpec` with no `sameAction`.
- It runs only on an owner turn (Task 5).

- [ ] **Step 1: Write the failing tests.**
  - The read-back is `Bring Sarah into this call at 555-0123?`.
  - Nothing dials before the yes.
  - `no_consent` gives "Sarah hasn't said yes to being called in yet. Want me to send her an invite?"
  - `no_answer` gives "She didn't pick up."
  - `already_on` gives "Sarah's already on with us."
  - The tool is absent when the flag is off.
- [ ] **Steps 2–5:** Run and see the tests fail, implement, run them again. Prove they can fail. Open the PR: `feat(tools): bring someone into the call after a read-back`.

### Task 12: The web shows who's on and can hang up the guest

**Files:** `apps/web/src/app/group-data-messages.ts`, `apps/web/src/ui/call-guest-chip.ui.ts`. Test: `apps/web/src/ui/__tests__/call-guest-chip.test.ts`.

- [ ] **Tests:**
  - `added` then `connected` shows `Sarah · on the call`, with a speaking glow from her track's audio level.
  - "Hang up" publishes `group_call_remove`.
  - `removed` hides the chip.
  - Colours come from `var(--color-*)` tokens only.
- [ ] Open the PR: `feat(web): show a call guest and let you hang up on them`.

### Task 13: Score a two-caller call

The other features are about how the call feels, and tests can't judge that. This task builds the scoring that each of them is measured against. It runs before Tasks 14–17 merge, and every one of those PRs pastes its before and after numbers.

**Files:** `scripts/group-call/score-group-call.ts` (pure), scenarios in `scripts/group-call/scenarios/`, and the scorer wired into the rung 2 harness `scripts/group-call/two-bot-room.ts`. Test: `scripts/group-call/__tests__/score-group-call.test.ts`. It is a dev tool and never ships to the agent. It never reads or writes `scripts/voice-eval/` or any sealed set, and its people and numbers are fictional.

**Interfaces:**
- Produces: `scoreGroupCall(turns: ScriptedTurn[]): GroupCallScore`.
  - `ScriptedTurn` is `{ speaker: 'owner' | 'guest' | 'ferni'; heardAs?: string; text: string; startMs: number; endMs: number; addressedTo?: 'ferni' | 'owner' | 'guest' | 'both' }`. `addressedTo` comes from the scenario script, and `heardAs` is the label Ferni's transcript gave the turn.
  - `GroupCallScore` is `{ ferniTalkShare: number; cutIns: number; missedAddress: number; addressedReplyMs: { p50: number; p95: number }; misattributed: number }`.
  - A **cut-in** is Ferni speaking within 2 s after a human turn addressed to the other human.
  - A **missed address** is a turn addressed to Ferni that gets no reply within 3 s.
- Scenarios (five, two bots each): planning dinner (mostly human to human), asking Ferni a fact, a long lull, a friendly argument, and a goodbye.

- [ ] **Step 1: Write the failing tests** on hand-built turn lists. A Ferni line after `[Seth] Sarah, did you book it?` counts one cut-in. A question to Ferni with no reply counts one missed address. A `heardAs` that differs from `speaker` counts one misattribution. The talk share is Ferni's speaking time over everyone's.
- [ ] **Steps 2–4:** Implement, prove the tests can fail, then run the five scenarios on dev at rung 2. The first run's numbers are the baseline, and they go in the issue. No pass bar is invented ahead of time: Seth sets the bars from the baseline. Open the PR: `feat(voice): score how ferni behaves on a three-way call`.

### Task 14: Ferni steps out and comes back when he's named

**Files:** `src/agents/group-conversation/step-out.ts`, a check in Task 6's `addresseeDecision`, step-out examples in Task 7's notes. Test: `__tests__/step-out.test.ts`.

**Interfaces:**
- Produces: `stepOutState(session): { out: boolean; since?: number }`, `stepOut(session, why: 'asked' | 'offered')`, and `stepIn(session)`.
- **While he's stepped out,** `addresseeDecision` returns `silent` unless the turn names Ferni or carries a crisis signal, and the lull rule is off.
- **He steps out** when either person asks ("give us a minute"). He also offers to, after several silent turns in a row between the two humans: "I'll let you two catch up. Say my name if you need me." The exact count comes from the Task 13 baseline. Stepping out isn't a private action, so either person can ask for it.
- **He steps back in** when either person says his name as a whole word. STT spellings of the name come from the persona's keyterms. He also steps back in when the guest leaves.
- **Before the call ends,** if he's stepped out and a plan was made, he offers the recap once (Tasks 8 and 15).

- [ ] **Step 1: Write the failing tests.**
  - Stepped out, `[Sarah (guest)] what do you think?` gives silent.
  - Stepped out, `[Sarah (guest)] Ferni, what do you think?` gives reply, and he steps in.
  - A crisis line while stepped out gives reply.
  - The lull rule doesn't fire while he's stepped out.
  - "Fernie" (an STT spelling) brings him back. "inferno" doesn't, because the match is on whole words.
  - The guest leaving brings him back.
- [ ] **Steps 2–5:** Implement, prove the tests can fail, then score it with Task 13 before and after. Open the PR: `feat(voice): let ferni step out of a three-way call and come back when named`.

### Task 15: A recap you both get

This extends Task 8: the owner's confirmed plan goes out as a text.

**Files:** `group-recap.ts` (Task 8), scopes in `src/services/messaging/guest-consent/`, a second, optional choice on the guest's yes page, and the existing outbound SMS path. Step 1 finds that path and names it; the task never adds a second sender. Tests sit next to each file.

**Interfaces:**
- **The consent record gets `scopes`.** A guest's yes holds `'call'`, and optionally `'recap'` and `'remember'` (Task 16). Both optional choices are unticked by default. The page wording names each one, and adding them bumps the wording version to 2. A yes recorded at version 1 holds `'call'` only.
- Produces: `sendGroupRecap({ ownerUid, guest: { e164; name; phoneHash }, plan }): Promise<{ owner: 'sent' | 'failed'; guest: 'sent' | 'no_scope' | 'stopped' | 'declined' | 'failed' }>`.
  - The owner gets the plan they confirmed.
  - The guest gets it only if all three hold: her yes includes `recap`, she hasn't sent STOP, and the owner said yes to "Want me to text Sarah the plan too?"
  - Her number comes from the dial request and is kept in memory for this call only. It is never stored.
  - The text is the plan alone (what, when, where, who does what). It never includes a transcript or anything else that was said.

- [ ] **Step 1: Write the failing tests.**
  - No `recap` scope gives `no_scope`, and nothing is sent to her.
  - STOP gives `stopped`.
  - The owner saying no gives `declined`.
  - Her text holds the plan and nothing else.
  - A version-1 yes counts as `call` only.
  - Her number appears in no store and no log.
- [ ] **Steps 2–5:** Implement, prove the tests can fail, then open the PR: `feat(voice): text both callers the plan from a three-way call`.

### Task 16: Ferni remembers a returning guest by name, not by voice

**Files:** a small guest-notes store. By default it lives at `bogle_users/{uid}/guest_notes/{phoneHash}`, in the memory context, unless Step 1 finds an existing per-person store keyed by contact to extend. It gets a port and an adapter, an entry in copy-user's `EXCLUDED_SUBCOLLECTIONS`, a line in the join note, and Task 4's guard routing her facts. Tests sit next to each file.

**Interfaces:**
- **Only with her `remember` scope** (Task 15). She's recognised by the hash of the number Ferni dialled, never by her voice (ruling 3), so this works only for guests Ferni calls.
- **What's kept:** at most 10 notes per guest, each at most 140 characters. They are things she said about herself, with sensitive topics dropped by the existing sensitive-topic check; Step 1 finds it. Each note expires after 12 months. "Forget me" deletes her notes along with her consent.
- **The join note for a returning guest** says she has been on a call before and gives at most 3 notes, so Ferni can say "Sarah! Good to hear you again."
- **Without the scope,** nothing about her is kept, and the join note doesn't say "again".

- [ ] **Step 1: Write the failing tests.**
  - Without the scope, nothing is saved and there's no "again" line.
  - With the scope, a note is saved, and her next join note contains it.
  - A health fact is not saved.
  - "Forget me" deletes her notes.
  - `guest_notes` is classified as never copied in `copy-user.test.ts`.
  - The owner's private facts never appear in her notes.
- [ ] **Steps 2–5:** Implement, prove the tests can fail, then open the PR: `feat(memory): remember a returning call guest who said yes to it`.

### Task 17: Small group moments

**Files:** `src/agents/group-conversation/group-moments.ts` and example lines in Task 7's per-turn note. It reuses existing tools for celebrations, rituals and games. Step 1 searches the best-friend work and names what it reuses, and it never builds a second copy. Test: `__tests__/group-moments.test.ts`.

**Moments:**
- **Settling a friendly argument:** a fact both people want. Ferni answers it, or says he isn't sure.
- **Picking between two options:** a coin flip whose result comes from code, never from the model.
- **A toast:** when a birthday or a win comes up on the call.
- **A 60-second game:** offered only after a lull. Ferni asks first, and it starts only on a yes.

**Gate:**
- Moments go through `addresseeDecision`: they happen when asked, or on a lull.
- Never while he's stepped out, never on a crisis turn, and never on a solo call.
- At most one moment per call that nobody asked for. Task 13's numbers can raise that.
- Whether a silent Ferni may backchannel ("mm", a laugh) is decided here, from Task 13's cut-in numbers.

- [ ] **Step 1: Write the failing tests.**
  - The coin flip's result comes from the injected random source.
  - A second moment nobody asked for, on the same call, doesn't happen.
  - No moment happens while he's stepped out or on a crisis turn.
  - The example lines have no em dashes or ellipses.
- [ ] **Steps 2–5:** Implement, prove the tests can fail, then score it with Task 13 before and after. Open the PR: `feat(voice): give ferni a few small moments to host a three-way call`.

### Not in this plan (follow-up plan)

These are owner voice prints and the "owner or someone else" check for two people sharing one device: CAM++ ONNX in `onnxruntime-node`, off the reply path, one print per channel, opt-in, with deletion on a 24-month clock. Guests never get a print. Write that plan after rung 4 passes.

## Proof, one rung at a time

| Rung | When | What is real | Pass line |
|---|---|---|---|
| 1. Stream bench | after Task 3 merges; no deploy, flag on only in the bench process | Two fictional voices (two Cartesia TTS voices), each played into its own track, through `personStream`, the real ink-2 and `floorArbiter`. The scripts cover alternating turns, interruptions and a quiet speaker. | No final is ever attributed to the wrong person (must be 0). End of turn never fires while the other voice is still talking (must be 0). Report the latency each person's stream adds. |
| 2. Two-bot room on dev | after Tasks 2–6 are on dev with the flag on for dev | The dev agent in a real room. The owner bot uses a test uid; the guest bot gets a server-minted `guest_` identity. A third bot without the prefix is never heard. | Labels are right. Ferni replies before he's addressed on fewer than 10% of the scripted human-to-human turns. The test uid's memories hold nothing the guest said. A guest's request to call someone gets the ask. |
| 3. Phone on dev | after Tasks 9–11 | A real opted-in phone through the trunk, including one call on speakerphone | Read-back before ringing. The opener and her yes work; a no removes her and her words never reach the conversation. Echo drops are logged and none reach the conversation. Hang-up works. |
| 4. Seth's call | after Task 12 | Everything | The checks under Rollout step 4. |
| 5. Solo regression | before prod | The voice-eval skill's solo scenarios, flag on vs off | No change: solo calls must be identical. |

Rung 2 is scored by Task 13 from its first run onward.

Rung 1 is its own small PR (`scripts/group-call/stream-bench.ts`, a dev tool never shipped to the agent). Rungs 2 and 3 are scripted where they can be (`scripts/group-call/two-bot-room.ts`), and the transcripts go in the issue. The harnesses never read the sealed eval sets.

## Rollout

1. Merge Tasks 2–6 with `GROUP_CALL` off. Rung 1 runs once Task 3 is merged and before the flag goes on in dev, with the flag on only inside the bench process.
2. Deploy to dev from `main` (skill `deploy-agent`), with `lk room list --project ferni-dev` empty. Turn the flag on for dev only: `lk agent update-secrets --project ferni-dev --config livekit.toml --secrets "GROUP_CALL=on"` (the skill holds the exact command). Run rung 2.
3. Merge Tasks 7–12, deploy each to dev, and run rung 3.
4. Merge Task 13, record the baseline, then merge Tasks 14–17 one at a time. Each one is deployed to dev and scored before and after.
5. Seth places a real three-way call on dev (web, plus a phone Seth owns that has opted in). Seth checks:
   - the read-back and the opener;
   - that Ferni greets the guest by name;
   - that Ferni stays quiet while the two of them talk, and answers when asked;
   - that the owner's memories hold nothing the guest said;
   - the recap offer, and the text both of them get;
   - that Ferni steps out when asked and comes back when named;
   - on a second call, that Ferni greets a returning guest who said yes to being remembered;
   - that hanging up from the web removes the guest.

   Paste the labelled transcript into the issue.
6. **Before prod:** Seth confirms in writing that Cartesia and Vertex don't keep or train on call audio or transcripts for this account. Then run rung 5. Prod comes only after that.
7. Remove the flag once it's on in prod.
