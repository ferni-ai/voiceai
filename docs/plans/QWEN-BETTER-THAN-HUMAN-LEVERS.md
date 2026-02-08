# Leveraging What We Have: Make Qwen Better Than Human & Better Than Gemini+Cartesia

**Goal:** Use the existing Qwen3-Omni + session manager stack so the Qwen path is "Better Than Human" and **better** than the production Gemini Live + Cartesia path on experience, quality, and differentiation.

---

## What We Already Have

| Asset                               | Where                                 | Use It For                                                                                 |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Session manager** (8 BTH systems) | `session-manager.ts`                  | Emotion, personality v2, live superhuman, cross-persona, post-TTS, quality tracking, retry |
| **SessionManagerRealtimeModel**     | `livekit-session-manager-adapter.ts`  | Director Mode with FULL_STACK: transcribe → processTurn → events to frontend               |
| **sendDataMessage**                 | Passed when FULL_STACK=true           | qualityMetrics, personalitySignals, textChunk to frontend                                  |
| **Voice cloning** (Qwen3-TTS)       | Per-persona 3s reference              | Distinct persona voices; Cartesia path uses fixed voices                                   |
| **Post-TTS enhancement**            | Session manager + livekit-tts-adapter | Warmth, presence; same BTH preset as production                                            |
| **Native function calling**         | Thinker                               | No JSON workaround; reliable tool execution                                                |
| **transcribeAudio**                 | client.ts                             | Get transcript from audio for processTurn (session-manager path)                           |

---

## Levers to Make Qwen Better Than Human & Better Than Gemini+Cartesia

### 1. **Full stack by default when Qwen is on**

- **Current:** `USE_QWEN3_OMNI_FULL_STACK` is opt-in (default false).
- **Change:** When `USE_QWEN3_OMNI=true`, default `USE_QWEN3_OMNI_FULL_STACK=true` so every Qwen path (Director and non-Director) uses the session manager and BTH by default. Allow override for testing (e.g. `USE_QWEN3_OMNI_FULL_STACK=false`).
- **Why:** Ensures BTH (emotion, personality, superhuman, quality) is the norm on Qwen, not the exception.

### 2. **Wire session manager into the non-Director Qwen path**

- **Current:** Non-Director Qwen uses livekit-llm-adapter (Thinker) + livekit-tts-adapter. No session manager → no emotion/personality/superhuman/quality to frontend.
- **Change:** When `USE_QWEN3_OMNI=true` and **not** Director Mode, use a path that goes through the session manager:
  - **Option A:** Create an "LLM" that is a thin wrapper: on generate, get last user message (transcript) from chat context, call `session.processTurn(transcript)`, return agent text; inject session audio into the pipeline (skip separate TTS for that turn) and forward session events via sendDataMessage. Requires AgentSession to accept "LLM that returns text + audio" or a custom pipeline step.
  - **Option B:** Use the same SessionManagerRealtimeModel when not in Director Mode: single-persona "Director" with one actor; same flow (pushAudio → commitAudio → transcribe → processTurn). No cast/scene UI, but full BTH.
- **Why:** Single-persona Qwen calls get the same BTH stack as Director Mode, so Qwen is "better than human" on every call, not only in Director.

### 3. **Leverage Qwen-only strengths in product and docs**

- **Voice cloning:** Emphasize per-persona cloned voices (3s reference) vs fixed Cartesia voices. Ensure voice clone init runs and is cached so 97ms-first-packet TTS is achievable.
- **Post-TTS:** Keep applying BTH preset in session manager and in livekit-tts-adapter; tune if needed so Qwen audio feels as warm/present as or better than Cartesia.
- **Native FC:** No JSON workaround on Qwen → more reliable tools. Call this out in observability (e.g. "Qwen: native FC" vs "Gemini: JSON workaround") and in tuning (fewer tool failures).
- **Self-host / data:** Position Qwen path as "your data stays on your infra" and "no per-minute API" for teams that care about sovereignty and cost.

### 4. **Frontend: consume BTH events so the avatar is alive**

- **Current:** Session manager emits qualityMetrics, personalitySignals, textChunk; we send them via sendDataMessage (getFrontendPublisher().sendData).
- **Check:** Frontend EQ / Better Than Human UI must **subscribe** to these event types (e.g. `qualityMetrics`, `personalitySignals`, `mood`, `humanization_signal`) and drive avatar expressions, micro-expressions, and any "Ferni noticed" / quality UI. If the frontend only listens for events from the Gemini/OpenAI path (e.g. different event names or sources), add handlers for the same payloads from the Qwen path so the avatar responds identically.
- **Why:** BTH only "feels" better than human if the user **sees** the avatar respond to emotion/quality/personality. Same events, same UI.

### 5. **Reduce latency on the session-manager path**

- **Current:** Session-manager adapter: commitAudio → transcribeAudio (Thinker round-trip) → processTurn (Thinker + TTS). So we have **two** Thinker round-trips (transcribe + full turn).
- **Levers:**
  - **Parallel transcribe:** If we had a cheap STT (e.g. local or fast API), we could run transcribe in parallel with something else to hide latency (complex).
  - **processAudioTurn with BTH:** Enhance `processAudioTurn` in the session manager to run **after** the Thinker response: run analysis on the agent response or on a dedicated transcribe call, then dispatch emotion/quality/personality and sendDataMessage. Then the adapter could call processAudioTurn(audio) once (one Thinker round-trip: audio in → agent response + TTS), and still send BTH events derived from the turn. That gives one round-trip and BTH.
  - **Streaming:** Session manager already supports streamingEnabled; ensure we emit textChunk and stream TTS so first-packet latency is minimal.
- **Why:** Lower latency makes Qwen feel as responsive as or better than Gemini+Cartesia while keeping BTH.

### 6. **Prompt parity or better**

- **Current:** Session manager builds system prompt with memory, behavioral context, personality, live superhuman, cross-persona, humanization guidance.
- **Check:** Compare total prompt length and sections (e.g. `buildSystemPrompt` in session-manager.ts) to what we send to Gemini (e.g. modelBaseInstructions + agent prompt). Ensure Qwen gets **at least** the same context (memory, persona, tools, BTH instructions) and ideally **more** (e.g. live superhuman, cross-persona) so the model has more to work with.
- **Why:** Same or richer context → same or better reply quality.

### 7. **Observability and tuning**

- **Add:** E2E latency (audio in → audio out), TTS first-packet latency, BTH events sent per turn, and (if available) a simple quality or satisfaction signal. Log or metric by path: `qwen_full_stack` vs `gemini_cartesia` vs `openai_cartesia`.
- **Use:** Compare Qwen vs Gemini path on latency and quality; tune Thinker/TTS (e.g. quantization, batching, post-TTS) and adapter (e.g. when we call transcribe vs processTurn) so Qwen matches or beats Gemini on perceived quality and speed.
- **Why:** Data lets you make Qwen objectively "better" where it matters.

---

## Summary: Priority Order

1. **Default FULL_STACK=true when USE_QWEN3_OMNI=true** so BTH is the default. ✅ Done (voice-agent-entry, director-mode-setup, .env.example).
2. **Frontend:** Ensure EQ/avatar subscribes to qualityMetrics, personalitySignals, mood (and any humanization_signal) from the data channel so Qwen BTH events move the avatar. ✅ Done (data-message-handlers: handleQualityMetrics, handlePersonalitySignals).
3. **Non-Director Qwen:** Wire session manager into single-persona Qwen (Option B: SessionManagerRealtimeModel with one persona) so every Qwen call gets BTH. ✅ Done (voice-agent-entry: useQwenFullStack branch).
4. **Latency:** Consider processAudioTurn + BTH-on-response to reduce to one Thinker round-trip while keeping BTH events. ⬜ Follow-up.
5. **Product/docs:** Emphasize voice cloning, native FC, self-host, and post-TTS so "Qwen better than human" is clear to users and internal stakeholders. ⬜ Follow-up.
6. **Observability:** Add path-specific metrics and tune so Qwen path matches or beats Gemini on latency and perceived quality. ✅ Done (path logged at session creation: qwen_full_stack, qwen_director_full_stack, gemini_cartesia, openai_cartesia).

---

## Files to Touch (for 1–3)

| Lever                        | File(s)                                          | Change                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default FULL_STACK           | `voice-agent-entry.ts`, `director-mode-setup.ts` | When USE_QWEN3_OMNI=true, treat FULL_STACK as true unless USE_QWEN3_OMNI_FULL_STACK=false.                                                                           |
| Frontend BTH events          | `apps/web` (EQ / BTH / data-channel listener)    | Subscribe to qualityMetrics, personalitySignals, mood; drive avatar the same as Gemini path.                                                                         |
| Non-Director session manager | `voice-agent-entry.ts`                           | When USE_QWEN3_OMNI=true and not Director Mode, use SessionManagerRealtimeModel with single persona (same config as Director FULL_STACK, no DirectorEngine cast UI). |

This keeps a single BTH implementation (session manager), uses it everywhere Qwen is used, and leverages Qwen-only strengths so the Qwen path is better than human and better than the Gemini+Cartesia path where it matters.
