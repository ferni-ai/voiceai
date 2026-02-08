# Qwen3-Omni E2E Integration Gaps

**Summary:** The Qwen3-Omni **session manager** now has all 8 "Better Than Human" systems (streaming, emotion dispatch, personality v2, live superhuman, cross-persona, post-TTS, quality tracking, retry/circuit breaker). It is **not used in any current e2e path**. Director Mode and the non-director Qwen3 path use **Qwen3OmniRealtimeModel** / **Qwen3OmniClient** directly, so emotion, personality, superhuman, quality, and data-channel signals never reach the frontend in those flows.

---

## Current E2E Paths (No Session Manager)

| Path                   | Trigger                                         | What runs                                                                                                                                                               | Session manager? |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Director Mode**      | `USE_QWEN3_OMNI_DIRECTOR=true` or room metadata | DirectorEngine + Qwen3OmniRealtimeModel + AudioRouter. AgentSession `llm` = realtime model. User audio → RealtimeSession (pushAudio/commit) → client + TTS → audio out. | **No**           |
| **Non-director Qwen3** | `USE_QWEN3_OMNI=true`                           | Qwen3OmniProvider → livekit-llm-adapter (Qwen3OmniClient) + livekit-tts-adapter. Same AgentSession pipeline as Gemini/OpenAI but with different LLM/TTS.                | **No**           |

`createQwen3OmniSession()` / `Qwen3OmniSessionManager` is only referenced in:

- `src/integrations/qwen3-omni/session/` and `index.ts`
- `src/integrations/qwen3-omni/CLAUDE.md` (example)

So **no** voice-agent entry point, API route, or Director flow creates or uses the session manager.

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

- [ ] **Use session manager in at least one path** (Director Mode adapter or new API).
- [ ] **Pass `sendDataMessage`** into session config when used from the voice agent (data channel).
- [ ] **Frontend** subscribes to emotion/mood/quality/personality events (or already does).
- [ ] **Post-TTS** is already applied in session manager and in livekit-tts-adapter; no extra e2e work for that.
- [ ] **Integration test or e2e** that runs a turn through the session manager and asserts events + audio.
- [ ] **Docs** updated (Director Mode, Qwen3-Omni) to describe the chosen integration.

---

## Files to Touch (for Option A)

| Area              | File(s)                                                   | Change                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter           | `src/integrations/qwen3-omni/adapters/` (new or existing) | Add `SessionManagerRealtimeModel` (or similar) that wraps `Qwen3OmniSessionManager`, implements RealtimeModel/RealtimeSession, forwards `sendDataMessage`.                   |
| Director setup    | `src/agents/voice-agent/director-mode-setup.ts`           | When using “full stack”, create `Qwen3OmniSessionManager`, build config with `sendDataMessage` from room, instantiate adapter with session manager, return adapter as `llm`. |
| Voice agent entry | `src/agents/voice-agent-entry.ts`                         | Ensure data channel / `sendDataMessage` is available and passed into Director setup when building session manager config (if not already).                                   |
| Types             | `src/integrations/qwen3-omni/types.ts`                    | Already has `sendDataMessage` on config; no change unless new options needed.                                                                                                |

This gives a clear “what’s next” and “what’s missing” for e2e so the session manager’s Better Than Human behavior is actually used in production flows.
