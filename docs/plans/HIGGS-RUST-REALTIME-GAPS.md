# Gaps: Full Realtime Stack in Rust Using Higgs

**Goal:** Build our own realtime voice stack in Rust using the existing Higgs Rust code, instead of OpenAI Realtime or Gemini Live. No dependency on OpenAI Realtime.

**What Higgs has today (Rust):**

| Layer | In Higgs? | Where |
|-------|-----------|--------|
| **STT** | ✅ Yes | Whisper in `stt/`, triggered by `Transcribe` |
| **TTS** | ✅ Yes | Higgs Audio V2 + xCodec + 9-stage humanization in `tts/`, `dsp/` |
| **Biomarkers** | ✅ Yes | `analysis/biomarkers.rs` |
| **Session** | ✅ Yes | `session.rs` (audio buffer, persona, last biomarkers) |
| **Protocol** | ✅ Yes | WebSocket: `StartSession`, `Transcribe`, `Synthesize` / `SynthesizeStreaming`, `GenerateReply`, `EndSession`, binary audio |
| **LLM (generate_reply)** | ✅ Yes | Ollama HTTP in `llm/ollama.rs`; Candle in `llm/candle.rs` (Llama-format: config.json, tokenizer.json, safetensors; streams tokens via spawn_blocking). Prefer Candle when `--candle-model` set; else Ollama. |

**What is not in Higgs (today in Node):**

| Layer | In Higgs? | Today | Gap |
|-------|-----------|--------|------|
| **LLM** | ❌ No | Node calls Gemini/OpenAI Realtime; gets response text + tool calls | Need LLM in Rust or Rust-orchestrated |
| **Turn orchestration** | ❌ No | Node: transcript → LLM → response text → TTS | Need “conversation loop” in Rust |
| **Tool/function calling** | ❌ No | 100+ tools in Node (music, weather, handoff, etc.) | Need tool definitions + execution in Rust or via sidecar |
| **Context / memory** | ❌ No | Node: Firestore, context builders, conversation history | Need session/conversation state in Rust or call out to API |
| **Realtime transport** | ❌ No | LiveKit agent in Node receives audio, sends audio | Need client ↔ Rust path (extend Higgs WS or new service) |

**Status update (generate_reply):** The Higgs WebSocket protocol has `GenerateReply { transcript, context?, max_tokens?, request_id? }`. The Rust server runs transcript → LLM (Ollama HTTP or Candle Llama-format) → response text → Higgs TTS (`SynthesizeStreaming`) → AudioStart/binary/AudioDone. The Node gateway registers a raw-audio handler when TTS is Higgs and session is registered; reply audio is played via `session.output.audio.captureFrame()` with sample rate from `audio_start`. Candle backend in `llm/candle.rs` uses the pipeline device (Metal/CPU), streams tokens (empty-token guard, panic catch_unwind); env-gated E2E test in `tests/candle_e2e.rs`. All audit items done — see `HIGGS-INTEGRATION-AUDIT.md`.

---

## 1. LLM (conversation model)

**Gap:** Higgs has no language model. It does **not** take “user said X, generate a reply.” It only does: audio → transcript, and text → audio.

**Options:**

| Option | Description | Effort | Notes |
|--------|-------------|--------|--------|
| **A. Local LLM in Rust** | Add an LLM to the Higgs repo (or a sibling Rust crate) using Candle: load a small model (Qwen, Llama, Gemma, etc.), run inference with streaming text output. | High | Reuse patterns from `apps/rust-perf` (Candle, Qwen3-Omni). Need streaming decode + optional tool-calling support. |
| **B. Rust calls external LLM** | Keep Higgs as STT+TTS; add a “realtime orchestrator” in Rust that: receives transcript → HTTP/gRPC to Ollama / Gemini API / OpenAI API → streams response text back → feeds Higgs TTS. | Medium | No local model; Rust owns the loop and latency to LLM API. |
| **C. Hybrid** | Use existing **Qwen3-Omni** (Candle) in-repo for “realtime” LLM when available; otherwise Rust orchestrator calls external API. | Medium | Reuse `apps/rust-perf` + optional HTTP fallback. |

**Needed in Rust (any option):**

- **Input:** Transcript (string) + optional conversation history / context.
- **Output:** Stream of response text (and optionally tool calls).
- **Integration:** Pipe response stream into existing Higgs TTS (`SynthesizeStreaming` or equivalent) so audio is streamed out.

---

## 2. Realtime conversation loop

**Gap:** Today the loop is in Node: “user stopped speaking” → get transcript → call LLM → stream text → send to Higgs TTS → stream audio to client. None of that is in Higgs.

**Options:**

| Option | Description | Effort |
|--------|-------------|--------|
| **A. Extend Higgs WebSocket protocol** | Add a message type, e.g. `GenerateReply { transcript, context? }`. Server runs: STT buffer already in session → (or use provided transcript) → call LLM (in-process or HTTP) → stream text into Higgs TTS → send audio chunks back. Client sends audio as today; on “turn end” client sends `GenerateReply` (or server infers from `Transcribe` + VAD). | Medium |
| **B. New Rust “realtime” service** | Separate binary: WebSocket that accepts audio and optionally “end of turn.” Service holds a Higgs client (or in-process STT/TTS), runs STT → LLM → TTS, returns transcript + reply audio. Node/LiveKit only forwards audio to this service and forwards audio back. | Medium |
| **C. LiveKit agent in Rust** | Rewrite the LiveKit voice agent in Rust (if SDK exists): receive audio from room → run Higgs STT (in-process or HTTP to Higgs) → LLM → Higgs TTS → send audio to room. | High |

**Needed in Rust:**

- **Turn detection / VAD:** Either in Rust (e.g. silence after speech) or client sends “end of turn”; Higgs already has buffered audio and `Transcribe`.
- **Single pipeline:** transcript → LLM → response stream → TTS input. TTS is already streaming in Higgs (`SynthesizeStreaming`).

---

## 3. Tool / function calling

**Gap:** Today 100+ tools live in Node (music, weather, handoff, habits, etc.). Gemini/OpenAI do tool-calling in the API; Higgs has no notion of tools.

**Options:**

| Option | Description | Effort |
|--------|-------------|--------|
| **A. Tools in Rust** | Port a subset of tools to Rust (e.g. play_music, get_weather, handoff). LLM returns tool name + args; Rust executes and injects result back into LLM context. | High |
| **B. Rust calls Node for tools** | Rust orchestrator calls Node (or a small “tool service”) via HTTP/RPC: “execute tool X with args Y.” Node runs existing tool registry and returns result; Rust sends result back to LLM. | Medium |
| **C. Local LLM with tool-calling** | Use a model with native function-calling (e.g. Llama 3, Qwen with tools). Rust parses tool_calls from model output, executes (A or B), and continues. | Medium–High |

**Needed in Rust:**

- Tool **definitions** (name, schema) for the LLM.
- Tool **execution** (in Rust or via sidecar).
- **Loop:** LLM says “call tool X” → execute → append result to context → LLM continues (or one-shot “tool then reply”).

---

## 4. Context / memory / session

**Gap:** Node has: conversation history, user memory (Firestore), context builders (persona, memory, BTH, etc.). Higgs only has: session id, persona, audio buffer, last biomarkers.

**Options:**

| Option | Description | Effort |
|--------|-------------|--------|
| **A. Minimal in Rust** | Rust keeps only: conversation history (last N turns) in memory; optional “context string” per request from client. No memory DB. | Low |
| **B. Rust calls Node/API** | “Get context for user X” and “Append turn” via HTTP. Node keeps using Firestore and context builders; Rust stays stateless except for in-flight conversation. | Medium |
| **C. Port context/memory to Rust** | Conversation and user memory in Rust (e.g. SQLite, or call existing APIs). Larger product/design scope. | High |

**Needed for “better than Gemini Live”:**

- Enough **context** (persona, recent turns, optional user facts) for the LLM to generate good replies.
- Optional **memory** (persistent) if you want parity with current Node behavior.

---

## 5. Transport: client ↔ Rust

**Gap:** Today the client talks to LiveKit; the Node agent talks to Higgs over WebSocket. To own everything in Rust you need a path from client to the Rust stack.

**Options:**

| Option | Description | Effort |
|--------|-------------|--------|
| **A. Keep LiveKit in Node, Rust as “brain”** | Node agent: receives LiveKit audio → forwards to Rust WebSocket (e.g. extended Higgs or new realtime service). Rust returns transcript + reply audio; Node sends audio back to LiveKit. No change for client. | Low–Medium |
| **B. Client talks to Rust directly** | Web (or app) connects to Rust WebSocket for voice (no LiveKit, or LiveKit only for signaling). Rust does: audio in → STT → LLM → TTS → audio out. | Medium (auth, scaling, mobile) |
| **C. LiveKit agent in Rust** | One Rust process: LiveKit SDK + Higgs STT/TTS + LLM. Replaces Node agent. | High (SDK, ops) |

---

## 6. Summary: minimal set to “realtime in Rust with Higgs”

To build our own realtime stack in Rust using Higgs **without** OpenAI Realtime:

1. **LLM in Rust or orchestrated by Rust**  
   Local (Candle) or HTTP to Ollama/Gemini/OpenAI; streaming text out.

2. **Realtime loop in Rust**  
   Transcript (from Higgs STT) → LLM → response stream → Higgs TTS (`SynthesizeStreaming`); reply audio streamed back.

3. **Tool calling**  
   Either in Rust (port subset) or Rust calls Node/tool-service; LLM gets tool definitions and results.

4. **Context**  
   At least: conversation history + persona/context string; optionally call Node/API for memory.

5. **Transport**  
   Extend Higgs WebSocket with a “generate_reply” path, or new Rust WebSocket service that uses Higgs for STT+TTS and runs the loop.

**Suggested order:**

1. **Extend Higgs protocol** with `GenerateReply { transcript, context? }` (or equivalent) and implement in Rust: call LLM (HTTP to Ollama or Gemini first), stream response into existing `SynthesizeStreaming`, return audio. No tools yet.  
2. **Add tool-calling:** LLM returns tool_calls; Rust executes (or calls Node) and feeds result back.  
3. **Tighten latency:** Move to local LLM (Candle) if needed; tune chunk_steps, VAD, and batching.

This document can live in the repo and be updated as you close each gap (e.g. “LLM: done (Ollama HTTP)”; “Tools: done (Rust calls Node)”).
