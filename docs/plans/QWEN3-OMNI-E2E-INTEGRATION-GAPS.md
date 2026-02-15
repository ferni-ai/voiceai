# Qwen3-Omni E2E Integration Gaps

**Summary:** The Qwen3-Omni **session manager** has all 8 "Better Than Human" systems. It **is** used in the **non-director** path when `USE_QWEN3_OMNI=true` and `USE_QWEN3_OMNI_FULL_STACK !== 'false'` (default). The **full pipeline** (Rust `full_omni_pipeline` in `apps/rust-perf`) is the STS backend either via Candle NAPI (in-process) or HTTP to the Rust server.

---

## Current E2E Paths

| Path                   | Trigger                                         | What runs                                                                                                                                                               | Session manager? |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Director Mode**      | `USE_QWEN3_OMNI_DIRECTOR=true` or room metadata | DirectorEngine + Qwen3OmniRealtimeModel + AudioRouter. AgentSession `llm` = realtime model. User audio → RealtimeSession (pushAudio/commit) → client + TTS → audio out. | **No**           |
| **Non-director Qwen full stack** | `USE_QWEN3_OMNI=true` and `USE_QWEN3_OMNI_FULL_STACK !== 'false'` | **SessionManagerRealtimeModel** (wraps Qwen3OmniSessionManager) or **NativeOmniRealtimeModel** (Candle NAPI). Session manager uses Qwen3OmniClient → Rust server (full_omni_pipeline) or mock. Emotion/quality/personality via `sendDataMessage`. | **Yes** (or native Candle pipeline) |
| **Non-director Qwen (no full stack)** | `USE_QWEN3_OMNI=true` and `USE_QWEN3_OMNI_FULL_STACK=false` | Qwen3OmniProvider → livekit-llm-adapter (Qwen3OmniClient) + livekit-tts-adapter. No session manager. | **No**           |

---

## What’s Missing for E2E

### 1. **Use session manager in at least one e2e path** (critical)

Until some path creates a `Qwen3OmniSessionManager` and drives it with user input, Better Than Human stays off the wire.

**Option A – Director Mode uses session manager (recommended)**

- Introduce a **SessionManagerRealtimeModel** (or equivalent) that implements LiveKit’s `RealtimeModel` / `RealtimeSession` and **delegates** to `Qwen3OmniSessionManager`:
  - On user input: call `session.processTurn(transcript)` or `session.processAudioTurn(audio)`.
  - Pass through `sendDataMessage` in session config (e.g. wrap LiveKit room’s data channel) so emotion/quality/personality events from the session manager are sent to the frontend.
  - Stream audio from `turnContext.audio` (and any streaming events) into the RealtimeSession’s audio/text streams.
- In **director-mode-setup** (or voice-agent-entry when Director Mode is on): create one session manager per session (or per lead persona), build config (userId, sessionId, personaId, serverUrl, ttsServerUrl, services, `streamingEnabled`, `sendDataMessage`), and use the new adapter as the `llm` instead of the current `Qwen3OmniRealtimeModel` when “full stack” is desired.

**Option B – New API/WebSocket for “full stack” sessions**

- Add e.g. `POST /api/qwen3-session/turn` (or a WebSocket) that creates/gets a session, calls `session.processTurn(transcript)`, returns audio + metadata.
- A dedicated client (e.g. web app or Director Console variant) uses this. Director Mode stays as-is; Better Than Human only applies to this API path.

### 2. **Provide `sendDataMessage` into the session manager when used**

- Session manager expects `config.sendDataMessage` for emotion/turn/quality events.
- When the session manager is used from the voice agent (Option A), the adapter must provide a `sendDataMessage` that sends to the room’s data channel (same contract as existing `sendDataMessage` in data-channel-handler / transcript-handler).
- Ensure the frontend (Director Console, EQ, etc.) already listens for the same event types the session manager emits (e.g. emotion, mood, qualityMetrics, personalitySignals); if not, add listeners.

### 3. **Director path: emotion/personality/quality if not using session manager**

If we **do not** adopt Option A:

- The current Director path (Qwen3OmniRealtimeSession) has **no** calls to emotion dispatcher, personality, superhuman, or quality tracking.
- To get “Better Than Human” behavior in Director Mode without the session manager, we’d need to duplicate or rewire that logic into `livekit-realtime-model.ts` (e.g. after “turn” equivalent: run analysis, dispatch emotion, send data messages). That’s more duplication and two sources of truth.

So the **preferred** way to get e2e is Option A: wire the session manager into Director Mode via an adapter and pass `sendDataMessage`.

### 4. **Tests and docs**

- **E2E / integration:** Add at least one test (or manual e2e) that: creates a session manager (or SessionManagerRealtimeModel) with mocked Thinker/TTS and a mock `sendDataMessage`, runs `processTurn` (and optionally `processAudioTurn`), and asserts that:
  - Emotion/turn/quality events are emitted and passed to `sendDataMessage`.
  - Audio (and optional streaming) is produced as expected.
- **Docs:** Update Director Mode and Qwen3-Omni guides to state when the session manager is used and how emotion/quality/personality reach the frontend (e.g. “When Director Mode uses the full stack, the session manager sends … over the data channel”).

---

## Checklist for “Better Than Human” E2E

- [x] **Use session manager in at least one path** — Non-director path uses SessionManagerRealtimeModel when USE_QWEN3_OMNI_FULL_STACK !== 'false' (voice-agent-entry.ts).
- [x] **Pass `sendDataMessage`** — sendDataMessageForQwen passed into SessionManagerRealtimeModel; forwards to frontend publisher.
- [ ] **Frontend** subscribes to emotion/mood/quality/personality events (or already does).
- [x] **Post-TTS** is already applied in session manager and in livekit-tts-adapter.
- [ ] **Integration test or e2e** that runs a turn through the session manager and asserts events + audio.
- [x] **Docs** — This doc updated; .env.example documents USE_QWEN3_OMNI_FULL_STACK.

---

## Files to Touch (for Option A)

| Area              | File(s)                                                   | Change                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter           | `src/integrations/qwen3-omni/adapters/` (new or existing) | Add `SessionManagerRealtimeModel` (or similar) that wraps `Qwen3OmniSessionManager`, implements RealtimeModel/RealtimeSession, forwards `sendDataMessage`.                   |
| Director setup    | `src/agents/voice-agent/director-mode-setup.ts`           | When using “full stack”, create `Qwen3OmniSessionManager`, build config with `sendDataMessage` from room, instantiate adapter with session manager, return adapter as `llm`. |
| Voice agent entry | `src/agents/voice-agent-entry.ts`                         | Ensure data channel / `sendDataMessage` is available and passed into Director setup when building session manager config (if not already).                                   |
| Types             | `src/integrations/qwen3-omni/types.ts`                    | Already has `sendDataMessage` on config; no change unless new options needed.                                                                                                |

This gives a clear “what’s next” and “what’s missing” for e2e so the session manager’s Better Than Human behavior is actually used in production flows.
