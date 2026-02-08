# Qwen3-Omni Session Manager E2E Integration Plan

**Goal:** Wire `Qwen3OmniSessionManager` (full Better Than Human stack) into the voice agent so emotion, personality, superhuman, quality, and data-channel events reach the frontend when using Qwen3-Omni (Director Mode or non-Director).

**Trigger:** `USE_QWEN3_OMNI_FULL_STACK=true` with `USE_QWEN3_OMNI=true` (or Director Mode). When set, use the session manager path instead of the current Realtime/LLM adapter path.

---

## Phase 1: Plan and Config

- [x] Write this plan doc.
- [x] Add env flag `USE_QWEN3_OMNI_FULL_STACK` (default `false`). When `true` + Qwen3-Omni, use session manager path.

---

## Phase 2: Transcript-from-Audio

The session manager expects `processTurn(transcript)`. When the Realtime path has only audio (pushAudio → commitAudio), we need a transcript.

**Option A (chosen):** Use the Thinker as a transcriber: send audio with system prompt `"Transcribe the user's speech. Output only the exact words spoken, nothing else."` and treat the model response as the user transcript. Add `transcribeAudio(audio: Uint8Array): Promise<string>` to the Qwen3 client (or a small helper) that does this one-shot call.

**Option B:** Integrate a dedicated STT (e.g. Google, Deepgram). Deferred.

**Tasks:**

- [ ] Add `transcribeAudio(audio, sampleRate?)` to `src/integrations/qwen3-omni/client.ts` (or `utils/transcribe-audio.ts`) that calls the Thinker with transcribe-only prompt and returns the response as transcript.
- [ ] Handle empty/failed transcription (fallback to `"[audio input]"`).

---

## Phase 3: SessionManagerRealtimeModel Adapter

Create an adapter that implements LiveKit’s `RealtimeModel` / `RealtimeSession` and delegates to `Qwen3OmniSessionManager`.

**File:** `src/integrations/qwen3-omni/adapters/livekit-session-manager-adapter.ts`

**SessionManagerRealtimeModel:**

- Config: `sessionId`, `userId`, `personaId`, `serverUrl`, `ttsServerUrl`, `services`, `sendDataMessage`, `transcribeAudio` (or client that has it).
- `session()`: Create one `Qwen3OmniSessionManager` with that config; create and return a `SessionManagerRealtimeSession` that holds the session and the model reference.

**SessionManagerRealtimeSession:**

- Implements `llm.RealtimeSession`: `pushAudio`, `commitAudio`, `generateReply`, `interrupt`, etc.
- **pushAudio:** Buffer PCM (same as current RealtimeSession).
- **commitAudio:**
  1. Concatenate buffered audio.
  2. Call `transcribeAudio(audio)` to get transcript (or fallback `"[audio input]"`).
  3. Call `session.initialize()` if not yet initialized (or ensure init at session() time).
  4. Call `session.processTurn(transcript)`.
  5. On result: push `turnContext.agentResponse` to the text stream; decode `turnContext.audio` (PCM) and push frames to the audio stream.
  6. Forward session events: subscribe to session `emotion`, `qualityMetrics`, `personalitySignals` and call `sendDataMessage(type, payload)` for each (so frontend EQ gets them).
- **generateReply(instructions?):** If we already have a pending turn from commitAudio, we might not need a separate generateReply; the current flow uses commitAudio → generateReply. So either: (a) commitAudio triggers processTurn and we push to streams directly (no separate generateReply), or (b) commitAudio only enqueues the user message and generateReply runs processTurn. We follow (a): commitAudio runs the full turn and pushes text + audio to the streams that were created in generateReply. So we need: generateReply() creates the message/stream controllers and enqueues a “job” (e.g. processTurn), and commitAudio() triggers that job. Actually the LiveKit flow is: pushAudio → commitAudio (which in current impl calls generateReply()). So generateReply() is called from commitAudio(). So the flow is: generateReply() creates streams and returns them; then the session needs to run processTurn and fill those streams. So: generateReply() creates the streams, then kicks off an async flow: transcribeAudio → session.processTurn(transcript) → push text to textStream, push audio to audioStream, forward events to sendDataMessage. So commitAudio() calls generateReply() first (to get the stream handles?), then runs the transcription + processTurn and feeds the result into the streams. Looking at the current Qwen3OmniRealtimeSession: generateReply() creates the streams and calls runGeneration() which does the Thinker + TTS and enqueues to the controllers. So in our adapter: generateReply() creates the streams, then we need to get the buffered audio (from the last commitAudio?), run transcribe → processTurn, and push to the controllers. So the flow is: commitAudio() is called (we have buffered audio). We call generateReply() which creates streams and returns. Then we run: transcribe(bufferedAudio) → processTurn(transcript) → push agentResponse to text controller, push audio to audio controller. So we need commitAudio to call generateReply() first, then inside the session we need to run the async work. So generateReply() in our adapter creates the streams and stores the controllers somewhere the session can use; then commitAudio() calls generateReply(), then runs transcribe + processTurn and feeds the result to the stored controllers. So the session needs to hold the “current” stream controllers so that when commitAudio runs, it can feed them. So: SessionManagerRealtimeSession holds sessionManager, transcribeFn, sendDataMessage, and streamControllers (set in generateReply). commitAudio() concatenates buffer, calls generateReply() to create streams (and store controllers), then runs async: transcribe → processTurn → push to controllers, forward events. So generateReply() must be called from commitAudio() (as in the current RealtimeSession). So we’re good.

**Tasks:**

- [x] Implement `SessionManagerRealtimeModel` and `SessionManagerRealtimeSession` in `livekit-session-manager-adapter.ts`.
- [x] On session manager events (`qualityMetrics`, `personalitySignals`, `textChunk`), call `sendDataMessage(type, payload)`.
- [x] Map `turnContext.audio` (TTSSynthesisResult) to PCM frames and push to LiveKit audio stream.
- [x] Export from `adapters/index.ts`.

---

## Phase 4: Director Mode Wiring

When Director Mode is used and `USE_QWEN3_OMNI_FULL_STACK=true`, create the session-manager-based adapter instead of the current `Qwen3OmniRealtimeModel`.

**File:** `src/agents/voice-agent/director-mode-setup.ts`

- [x] Accept optional `sendDataMessage` and `services` in `DirectorModeSetupConfig` (or get it from the caller).
- [x] When `USE_QWEN3_OMNI_FULL_STACK=true`, create `SessionManagerRealtimeModel` with config (sessionId, userId, personaId, serverUrl, ttsServerUrl, services, sendDataMessage, transcribeAudio), and return it as `realtimeModel` instead of `Qwen3OmniRealtimeModel`.
- [ ] Ensure DirectorEngine and AudioRouter are still created and registered (for Director Console); the session manager path can still use the same engine for cast/scene state if we want, or we use a minimal engine. For MVP we can use the same DirectorEngine so the Director Console still works; the “LLM” is just the session manager under the hood.

**File:** `src/agents/voice-agent-entry.ts`

- [ ] When creating Director Mode session, build `sendDataMessage` from the room’s data channel (same way as for data-channel-handler). Pass it into `createDirectorModeSession({ ..., sendDataMessage })`.
- [ ] Ensure `sendDataMessage` is available at the time we call `createDirectorModeSession`. Currently the data channel is set up after the session is created, so we might need to pass a callback that resolves to sendDataMessage when the room is ready, or set up the data channel earlier. Prefer: create a wrapper that captures the room and implements sendDataMessage by publishing to the room’s data channel when connected.

---

## Phase 5: Pass sendDataMessage from Room

The session manager needs `sendDataMessage(type, payload)` so it can send emotion/quality/personality events to the frontend.

- [x] In voice-agent-entry, when full stack, pass `sendDataMessage` that uses the room’s data channel (e.g. `room.localParticipant?.publishData?(data, { reliable: false })` or the same mechanism used by the existing data-channel handler).
- [ ] Pass this into `createDirectorModeSession({ sendDataMessage })`.
- [ ] In director-mode-setup, when building SessionManagerRealtimeModel config, pass `sendDataMessage` into the session manager config.

**Note:** The data channel might not be open at the moment the session is created. Options: (1) Pass a lazy getter that returns sendDataMessage when available; (2) Have the session manager accept an optional sendDataMessage that can be set later; (3) Create sendDataMessage that no-ops if the channel isn’t ready. Prefer (1) or (3): pass a function that, when called, publishes to the room if the participant is connected; otherwise no-op.

---

## Phase 6: Services and Session Manager Config

- [x] voice-agent-entry passes `services` into `createDirectorModeSession`; director-mode-setup passes it into SessionManagerRealtimeModel config.

---

## Summary of New/Modified Files

| File                                                                      | Action                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/plans/QWEN3-OMNI-SESSION-MANAGER-E2E-PLAN.md`                       | Create (this plan)                                                                    |
| `.env.example`                                                            | Add `USE_QWEN3_OMNI_FULL_STACK`                                                       |
| `src/integrations/qwen3-omni/client.ts`                                   | Add `transcribeAudio()` (or new util)                                                 |
| `src/integrations/qwen3-omni/adapters/livekit-session-manager-adapter.ts` | Create (SessionManagerRealtimeModel + Session)                                        |
| `src/integrations/qwen3-omni/adapters/index.ts`                           | Export new adapter                                                                    |
| `src/agents/voice-agent/director-mode-setup.ts`                           | Use session manager adapter when FULL_STACK=true, accept sendDataMessage and services |
| `src/agents/voice-agent-entry.ts`                                         | Build sendDataMessage from room, pass to createDirectorModeSession; pass services     |

---

## Testing

- [ ] Manual: Enable `USE_QWEN3_OMNI_FULL_STACK=true` and Director Mode, join a room, speak; verify avatar/emotion/quality events in the frontend (Director Console or EQ).
- [ ] Unit test: SessionManagerRealtimeSession with mocked session manager and sendDataMessage; assert events forwarded.

---

## Rollout

- Keep `USE_QWEN3_OMNI_FULL_STACK` default `false` so production is unchanged.
- Enable for canary or specific rooms when ready.
- Once stable, consider making it the default when `USE_QWEN3_OMNI=true` (or keep as opt-in).
