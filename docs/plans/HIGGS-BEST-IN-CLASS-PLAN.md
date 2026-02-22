# Higgs Pipeline: Best-in-Class Improvement Plan

What it will take to make the Higgs integration **best in class** across **latency**, **quality**, and **code performance**. Each section lists concrete changes with impact and effort.

---

## Done (AGI-level wiring)

| Item | Status | Where |
|------|--------|--------|
| **Biomarker mapping** | Done | `transcript-handler.ts`: map Higgs `pitch_hz`/`speech_rate` → UserData `pitch`/`speechRate` |
| **24→16 kHz resampling** | Done | `higgs-stt-integration.ts`: resampleTo16k (optional @ferni/audio, else JS linear) |
| **Connection/session warmup** | Done | `HiggsPipelineProvider.warmup()`, called after room connect in `voice-agent-entry.ts` |
| **Phrase streaming for Higgs** | Done | `gateway-tts-node.ts`: usePhraseStreamingHiggs path — sentence loop + synthesizeStreaming per phrase |
| **Cache Higgs STT provider** | Done | `higgs-stt-integration.ts`: cachedProvider so we don’t call getTTSProvider() every frame |
| **Higgs STT as primary** | Done | `USE_HIGGS_STT_PRIMARY=true`: await Higgs transcript and use it for the turn; otherwise Higgs is biomarkers-only. See § Higgs STT modes below. |
| **Higgs as session STT** | Done | When `TTS_PROVIDER=higgs-pipeline`, Higgs is the session STT (LiveKit STT adapter). Turn detection from energy VAD; transcript + biomarkers from Higgs. No Gemini/OpenAI STT needed. |

### Higgs STT modes (TTS + STT)

Higgs pipeline supports **both TTS and STT** (Whisper in Rust). Three modes:

| Mode | Env | Transcript source | Biomarkers |
|------|-----|-------------------|------------|
| **Biomarkers only** (default when not session STT) | `TTS_PROVIDER=higgs-pipeline`, no session STT | Gemini/OpenAI (LLM STT) | Higgs (fire-and-forget on final transcript) |
| **Higgs STT primary** | `TTS_PROVIDER=higgs-pipeline` + `USE_HIGGS_STT_PRIMARY=true` (legacy) | Higgs (await `triggerTranscription()`, use `result.text` for turn) | Higgs (same request) |
| **Higgs as session STT** (recommended) | `TTS_PROVIDER=higgs-pipeline` | Higgs (HiggsSTT adapter: VAD + `triggerTranscription()`; transcript is the session STT) | Higgs (stored in session store, attached in transcript-handler) |

When **Higgs is session STT** (default when TTS is Higgs), the voice agent uses `HiggsSTT` as the LiveKit STT: audio is sent to Higgs, energy-based VAD detects turn boundaries, and `triggerTranscription()` returns transcript + biomarkers. No Gemini/OpenAI STT is used; you can run **Higgs STT + Higgs TTS + any LLM** (Gemini, OpenAI, Ollama, ChipChat, etc.).

When **USE_HIGGS_STT_PRIMARY=true** (legacy), we await `fetchHiggsTranscriptAndBiomarkers()` before calling `processFinalTranscript` and pass `event.transcript = result.text`. Fallback: if the fetch fails, we use the Gemini transcript.

---

## Can we use Higgs rather than Gemini / OpenAI Realtime?

**Short answer:** Higgs can replace **TTS** and **STT** (when `TTS_PROVIDER=higgs-pipeline`, Higgs is now the session STT by default). It **cannot** replace the **LLM** (Gemini Live or OpenAI Realtime). You still need a model provider for the conversation.

| Layer | What it does | Can Higgs replace it? |
|-------|----------------|------------------------|
| **LLM** (Gemini / OpenAI Realtime) | Takes user **text** (transcript), generates response **text** + tool calls (music, weather, etc.) | **No.** Higgs has no language model. |
| **STT** | User **audio** → **text** (transcript) | **Yes.** With `USE_HIGGS_STT_PRIMARY=true` we use Higgs (Whisper) transcript for the turn. |
| **TTS** | Response **text** → **audio** | **Yes.** With `TTS_PROVIDER=higgs-pipeline` we use Higgs for synthesis. |
| **Biomarkers** | Voice analysis (pitch, pace, etc.) from user audio | **Yes.** Higgs provides these when it’s the TTS provider. |

**Data flow today:**

1. User speaks → audio goes to **Gemini/OpenAI** (for turn detection + their STT) and to **Higgs** (sendUserAudio).
2. When user stops → we have a transcript (from **Gemini/OpenAI** or, if `USE_HIGGS_STT_PRIMARY=true`, from **Higgs**).
3. That **transcript** is sent to the **LLM** (Gemini Live or OpenAI Realtime) → LLM returns **response text** (+ tool calls).
4. **Response text** → **Higgs TTS** (or Cartesia) → audio to the user.

So you can use **Higgs for TTS + STT** and still use **Gemini or OpenAI for the LLM**. You cannot “use Higgs rather than Gemini and OpenAI Realtime” for the **conversation** — you must keep one of: Gemini Live, OpenAI Realtime, Qwen3 Omni, Local Pipeline, or Omni Pipeline for the LLM.

**If you want to avoid Gemini/OpenAI entirely:** Use another **model provider** (LLM), not Higgs. The codebase already supports:

- **OpenAI Realtime** — `USE_OPENAI_REALTIME=true` (different vendor, still cloud).
- **Qwen3 Omni** — `USE_QWEN3_OMNI=true` (self-hosted / Apache 2.0).
- **Local Pipeline** — `USE_LOCAL_PIPELINE=true` (local Rust/Candle).
- **Omni Pipeline** — `OMNI_PIPELINE_URL` (local Rust inference).

Higgs stays in the **TTS/STT** layer; the **LLM** is chosen separately via the model provider factory.

---

## 1. Latency

### 1.1 First-byte TTS (TTFB) — **Done**

**Was:** Gateway drained the entire LLM text stream before sending to Higgs.

**Done:** Phrase-by-phrase streaming for Higgs in `gateway-tts-node.ts`: when `provider.name === 'higgs-pipeline'` and provider has `synthesizeStreaming`, we use the sentence-boundary loop and call `synthesizeStreaming(phrase)` per phrase so first audio starts before the full reply is ready.

**Target:** ~200–400 ms faster TTFB.

---

### 1.2 Connection and session warmup — **Done**

**Was:** First TTS/STT paid full connection + `start_session` RTT.

**Done:** `HiggsPipelineProvider.warmup()` (ensureConnected + ensureSession). Called fire-and-forget after room connect in `voice-agent-entry.ts` when `TTS_PROVIDER=higgs-pipeline` or `higgs`.

---

### 1.3 Rust streaming latency — **Medium impact (Rust side)**

**Current:** Rust README mentions `chunk_steps` for `synthesize_streaming` (decode steps per chunk). Larger steps = fewer, bigger chunks; smaller steps = more, smaller chunks and lower latency with more overhead.

**Improvement:**

- Expose `chunk_steps` (or equivalent) in the TS client (e.g. in `HiggsPipelineConfig` or env) and pass it in `synthesize_streaming`.
- Tune default (e.g. smaller for low-latency, larger for throughput).
- In Rust, use **lightweight humanization** (stages 3–5) in streaming mode; keep full 9-stage for batch if needed.

**Target:** Lower time to first audio chunk and more consistent chunk delivery.

---

### 1.4 STT: Resample 24 kHz → 16 kHz — **Done**

**Was:** We only forwarded user audio when `frame.sampleRate === 16000`; 24 kHz rooms got no Higgs STT.

**Done:** In `higgs-stt-integration.ts`, `resampleTo16k()` resamples any input rate to 16 kHz (uses @ferni/audio resampleF32 when available, else JS linear interpolation). `sendUserAudioToHiggs()` now accepts any sample rate and resamples before sending.

### 1.5 Should Higgs support 24 kHz natively? (Node resample vs Rust accept-24)

**Short answer:** Making Higgs *accept* 24 kHz (and resample internally to 16 kHz) does **not** make it faster—it increases payload size (~50% more bytes for user audio), so wire latency and bandwidth go up. Prefer **Node-side 24→16 resampling** for lowest latency.

| Approach | Wire | Speed | Quality | Complexity |
|----------|------|--------|---------|------------|
| **Node resample 24→16, send 16k** | Less data | **Faster** (lower latency, less bandwidth) | Same | Resampler in Node |
| **Higgs accept 24k, resample internally** | 50% more bytes | Slower (more data to send) | Same | Resampler in Rust; single “send whatever you have” contract |

- **Better?** Quality is the same either way—ASR and biomarkers both run at 16 kHz. Running biomarkers at 24 kHz in Rust would be a marginal quality gain (finer temporal resolution) but adds two paths (ASR at 16k, biomarkers at 24k) and doesn’t justify the extra bytes.
- **Faster?** No. Sending 24 kHz raw means more bytes per second; resampling on Node and sending 16 kHz is strictly better for latency and bandwidth.
- **When “Higgs supports 24” still makes sense:** If you want a single contract (“client sends whatever sample rate the room has; Higgs handles it”) and are okay with higher WebSocket payload, add optional 24 kHz input in Rust: accept 24k, downsample to 16k, feed existing STT/biomarkers. Default recommendation: **resample on Node** for best latency.

---

## 2. Quality

### 2.1 Biomarker shape and usage — **Done**

**Was:** Higgs returns `pitch_hz`, `speech_rate`; UserData expects `pitch`, `speechRate`, `isBreathPause`.

**Done:** In `transcript-handler.ts`, when attaching Higgs biomarkers we map to UserData shape: `pitch_hz` → `pitch`, `speech_rate` → `speechRate`, `isBreathPause: false` (Higgs doesn’t provide; breath detector sets `isInBreathPause`). Turn-processor and BTH use the normalized shape.

---

### 2.2 Emotion and prosody mapping — **Medium impact**

**Current:** We pass `prosody.emotion` and `prosody.emotionIntensity` to Higgs. The Rust README lists direct emotions and aliases.

**Improvement:**

- Centralize **emotion → Higgs emotion** (and intensity) in one place (e.g. gateway or Higgs provider) so all callers use the same mapping.
- Optionally map **biomarker-derived emotion** (from turn-processor) back into the next TTS request (e.g. “user sounded anxious” → slightly gentler tone) for response quality.

**Target:** Consistent, predictable TTS tone and better match to user state.

---

### 2.3 Humanization and chunk size (Rust) — **Medium impact (Rust side)**

**Current:** Rust uses 9-stage humanization; streaming uses stages 3–5.

**Improvement:**

- Keep streaming humanization light; consider one or two extra stages (e.g. light pacing) if latency budget allows.
- Tune TTS chunk size (e.g. 200 ms) so playback is smooth and latency is still low; document recommended `chunk_steps` and chunk size in the Rust README.

**Target:** Best perceived quality for a given latency budget.

---

## 3. Code and runtime performance

### 3.1 Avoid per-frame provider lookup — **Low effort, small win**

**Current:** `sendUserAudioToHiggs()` calls `getHiggsSTTProvider()` on every frame. That’s a function call + env check + `getTTSProvider()` every time.

**Improvement:** Cache the “Higgs STT provider” (or a `{ sendUserAudio, triggerTranscription }` handle) per process or per session. Refresh only when config might change (e.g. provider reset). Reduces work in the tight audio loop.

**Target:** Slightly lower CPU in the audio path.

---

### 3.2 Zero-copy Int16Array when possible — **Low effort**

**Current:** When `frame.data` isn’t already `Int16Array`, we do `new Int16Array(frame.length).map(...)`, which allocates and copies.

**Improvement:** If the frame is already `Int16Array` (or a view of the right buffer), pass it through without copying. Only allocate/copy when we have to (e.g. Float32 or number[]). If we add resampling, do it in-place or into a reused buffer where possible.

**Target:** Fewer allocations and less GC in the audio pipeline.

---

### 3.3 Batch or throttle sendUserAudio — **Medium effort, optional**

**Current:** We send every frame to Higgs. That’s a lot of WebSocket writes and queue pressure.

**Improvement:** Optionally buffer N ms of audio (e.g. 20–40 ms) and send one `sendUserAudio` per buffer. Reduces WebSocket traffic and Rust-side queue pressure; may slightly increase STT latency. Make it configurable (e.g. env or `HiggsPipelineConfig`).

**Target:** Lower WebSocket and Rust load; tunable vs latency.

---

### 3.4 Speculative synthesis for Higgs — **Medium impact**

**Current:** Gateway has `enableSpeculativeSynthesis` (start synthesis in parallel with cache lookup). Higgs supports streaming; we could start streaming as soon as we have the first phrase, in parallel with cache.

**Improvement:** When provider is Higgs and streaming is enabled, start `synthesizeStreaming` on the first phrase as soon as it’s ready, while still filling the cache for that phrase. Ensures cache hits help future turns without delaying first chunk.

**Target:** Better latency on first phrase when cache is cold; no regression on cache hits if we cancel or discard speculative work on hit.

---

## 4. Summary table

| Area        | Change                              | Impact   | Effort   |
|------------|--------------------------------------|----------|----------|
| Latency    | Phrase streaming (don’t drain full text) | High     | High     |
| Latency    | 24→16 kHz resample for Higgs STT    | High     | Medium   |
| Latency    | Connection/session warmup           | Medium   | Low      |
| Latency    | Rust: expose/tune chunk_steps       | Medium   | Low      |
| Quality    | Map Higgs biomarkers → UserData     | High     | Low      |
| Quality    | Centralize emotion → Higgs mapping  | Medium   | Low      |
| Performance| Cache Higgs STT provider            | Small    | Low      |
| Performance| Zero-copy Int16 when possible       | Small    | Low      |
| Performance| Speculative streaming for Higgs     | Medium   | Medium   |

---

## 5. Suggested order of work

1. **Quality:** Map Higgs biomarkers to `UserData.voiceBiomarkers` (pitch, speechRate, isBreathPause) so emotion and BTH are correct. **Do this first.**
2. **Latency:** Add 24→16 kHz resampling so Higgs STT and biomarkers work at 24 kHz room rate.
3. **Latency:** Connection warmup when Higgs is enabled.
4. **Latency:** Phrase-by-phrase streaming for Higgs in the gateway (and Rust support if needed).
5. **Performance:** Cache Higgs STT provider and avoid Int16 copy when frame is already Int16.

After that, tune Rust `chunk_steps`, optional batching of `sendUserAudio`, and speculative streaming based on metrics and product priorities.

---

## 6. What’s still broken or not better than Gemini Live?

Audit of remaining gaps: **LLM/Gemini vs OpenAI**, **Higgs-specific**, and **general** issues.

### 6.1 LLM / Gemini Live (not Higgs)

| Gap | Severity | Notes |
|-----|----------|--------|
| **Function calling** | High | Gemini Live’s **native function calling is unreliable**; we use a **JSON workaround** (LLM outputs `{"fn":"toolName","args":{}}`, we intercept and execute). Code explicitly recommends: *“Consider switching to OpenAI Realtime (USE_OPENAI_REALTIME=true) for more reliable function calling.”* So with Gemini we are **not** better than Gemini Live on tools—we work around it. |
| **Tool call leakage** | Medium | When Gemini “narrates” a tool call instead of using the API, we detect **TOOL CALL LEAKAGE** and strip it; user can still hear a blip. OpenAI Realtime avoids this with native FC. |
| **Turn detection** | Low | Gemini has **built-in VAD** (`realtime_llm`). We also pass Silero VAD and semantic endpointer. Risk of overlap or double-wait; worth validating we’re not slower than Gemini-alone. |

**To be “better than Gemini Live” on the LLM side:** Use `USE_OPENAI_REALTIME=true` for native function calling and fewer tool leaks, or wait for Gemini to fix native FC and switch to it.

---

### 6.2 Higgs-specific (done)

| Gap | Severity | Status |
|-----|----------|--------|
| **`chunk_steps` not passed** | Medium | **Done.** `HiggsPipelineConfig.chunkSteps` and env `HIGGS_CHUNK_STEPS`; passed in `synthesize_streaming`. |
| **No WebSocket keepalive** | Medium | **Done.** `HIGGS_WS_KEEPALIVE_MS` (default 25000); `ws.ping()` interval in `higgs-pipeline.ts`. |
| **Emotion → Higgs not centralized** | Low | **Done.** `higgs-emotion.ts`: `mapProsodyToHiggsEmotion(prosody)`; used in Higgs provider. |
| **Zero-copy when resampling** | Low | **Done.** `resampleTo16k` returns same Int16Array when 16 kHz + Int16Array. |
| **Batch/throttle `sendUserAudio`** | Optional | **Done.** `HIGGS_STT_BATCH_MS` (default 0); when > 0, buffer and flush every N ms in `higgs-stt-integration.ts`. |

---

### 6.3 General (architecture, not broken)

| Item | Notes |
|------|--------|
| **Double STT** | Primary transcript comes from **Gemini/OpenAI** (LLM’s STT). Higgs STT is used only for **biomarkers** (we call `triggerTranscription()` on final turn and attach biomarkers to UserData). So we don’t “replace” Gemini STT with Higgs; we add voice analysis. If Higgs is down, we lose biomarkers but transcript is unchanged. Not broken. |
| **Transcript source** | Default: Gemini/OpenAI transcript for the turn; Higgs only for biomarkers. With **USE_HIGGS_STT_PRIMARY=true** we use Higgs transcript for the turn (see § Higgs STT modes above). |

---

### 6.4 Summary: what would make us "better than Gemini Live"?

1. **LLM:** Prefer **OpenAI Realtime** for reliable native function calling and fewer tool leaks; or adopt Gemini native FC once it's stable.
2. **Higgs:** ~~Expose **`chunk_steps`** (env or config), add **WebSocket keepalive**, and optionally **centralize emotion → Higgs** mapping.~~ **Done:** `HIGGS_CHUNK_STEPS`, `HIGGS_WS_KEEPALIVE_MS`, `higgs-emotion.ts`, zero-copy path, `HIGGS_STT_BATCH_MS`.
3. **Operational:** Validate **turn detection** (Gemini VAD vs our Silero/semantic) so we're not slower than Gemini-alone.

---

## 7. E2E validation and audit (Higgs STT + TTS)

To validate Higgs end-to-end (STT + TTS + biomarkers):

1. **Run Higgs pipeline** (Rust): `cd apps/rust-higgs-pipeline && cargo run` (or your deploy). Ensure `/health` and WebSocket `/ws` are up.
2. **Set env:** `TTS_PROVIDER=higgs-pipeline`, `HIGGS_PIPELINE_URL=ws://localhost:8600/ws`. Optional: `USE_HIGGS_STT_PRIMARY=true` to use Higgs transcript as primary.
3. **Start voice agent:** `LOG_FULL_RESPONSES=true pnpm dev` (or your entry). Join a room and speak.
4. **Biomarkers-only (default):** Final transcript comes from Gemini; Higgs biomarkers are attached to userData (check logs for "Higgs biomarkers attached").
5. **Higgs STT primary:** With `USE_HIGGS_STT_PRIMARY=true`, logs should show "Higgs STT primary: using Higgs transcript for turn" when Higgs returns text; the turn (addTurn, memory, LLM) uses Higgs transcript.
6. **24 kHz room:** If the room sends 24 kHz, Higgs STT still receives 16 kHz (resampled in Node); STT and biomarkers should work.
7. **Unit tests:** `pnpm vitest run src/agents/integrations/__tests__/higgs-stt-integration.test.ts`

---

## 8. Research: Gemma vs Qwen 3 and LLMs for Mac realtime (2026)

Summary of research on using **Gemma** vs **Qwen 3** for realtime voice, and **LLM options for Mac realtime** in 2026.

### 8.1 Can we use Gemma or is Qwen 3 better (for realtime voice)?

| Aspect | Gemma 3 / Gemma 3n (Google) | Qwen 3 / Qwen3-Omni (Alibaba) |
|--------|-----------------------------|-------------------------------|
| **Realtime voice API** | **No** — Google’s realtime voice API is **Gemini Live**, not Gemma. Gemma 3n has **audio input** (STT, AST) but is not a full duplex “Live” API. | **Yes** — **Qwen3-Omni** is built for realtime multimodal: audio in/out, streaming, ~211–234 ms audio-only latency. |
| **Audio** | Gemma 3n: STT, AST, 16 kHz, up to 30 s clips, 6.25 tokens/s. On-device via Google AI Edge. | Qwen3-Omni: end-to-end audio in + speech out, streaming, low latency. |
| **License** | Gemma license (more restrictive). | Apache 2.0 (permissive). |
| **In Ferni** | **Yes** — `USE_GEMMA3N=true`; Gemma 3n provider (Vertex/Gemini API, Live-compatible). | **Yes** — `USE_QWEN3_OMNI=true`; Qwen3-Omni provider, Director Mode, native Candle adapter. |

**Conclusion for realtime voice:** **Qwen 3 (Qwen3-Omni)** remains the better fit for native realtime multimodal. **Gemma 3n** is now **fully Live-compatible** in Ferni: same ModelProvider interface, Vertex/Gemini API generateContentStream (text-in, text-out), external STT/TTS. For Google's realtime WebSocket API you still use **Gemini Live**, not Gemma.

### 8.2 LLMs for Mac realtime interactions (2026)

| Option | Description | Latency / notes |
|--------|-------------|------------------|
| **Qwen3-Omni** | End-to-end omni-modal (text, image, audio, video). Real-time streaming; SOTA on many audio/video benchmarks. Apache 2.0. | ~211–234 ms audio-only; 507 ms audio+video. Run locally (e.g. Candle) or via API. |
| **ChipChat** (Apple) | Apple’s cascaded conversational agent (MLX). Streaming ASR → LLM → TTS → vocoder, all on-device. | Sub-second on Mac Studio (no dedicated GPU). |
| **Qwen3-ASR Swift** | Swift package: on-device ASR + TTS on macOS/iOS with MLX, Apple Silicon. | Real-time; 0.6B params, 4-bit quantized. |
| **Pipecat + MLX Whisper + Gemma 3B + Kokoro TTS** | Local voice agent stack on M-series Macs. | Voice-to-voice &lt;800 ms. |
| **Whisper.cpp** (Apple Silicon) | Local STT. | 8–40× realtime (M1–M3); sub-500 ms with push-to-talk in some setups. |
| **Gemini Live** | Google’s realtime API (not Gemma). Voice + optional video. | Cloud; turn detection, tools, session management. |
| **OpenAI Realtime** | OpenAI’s realtime API. | Cloud; native function calling, low latency. |

**Mac-specific advantages (2026):** Apple Silicon unified memory (low CPU–GPU copy), Neural Engine, Metal GPU. On-device options (ChipChat, Qwen3-ASR Swift, local Qwen3-Omni, Whisper.cpp) give privacy and offline use; cloud options (Gemini Live, OpenAI Realtime) avoid local compute.

**Ferni today:** You can try and compare:

- **Qwen3-Omni** — `USE_QWEN3_OMNI=true` (Director Mode, Candle backend). Best for native realtime multimodal.
- **ChipChat** — `USE_CHIPCHAT=true`, `CHIPCHAT_URL=http://127.0.0.1:8765`. Run a ChipChat-compatible server (OpenAI-style /v1/chat/completions) on the same machine for sub-second on-device voice.
- **Gemma 3n** — `USE_GEMMA3N=true`. **Local:** set `GEMMA3N_OLLAMA_URL=http://127.0.0.1:11434` and run Ollama (e.g. `ollama run gemma3n:e4b`). **Cloud:** Vertex or Gemini API. Live-compatible: same stack (STT → LLM → TTS), no Gemini Live WebSocket.

**Testing each provider one by one:** See **docs/guides/TEST-LLM-PROVIDERS-ONE-BY-ONE.md** for step-by-step instructions, prerequisites, and copy-paste commands to test Gemini Live, OpenAI Realtime, Qwen3-Omni, Gemma 3n, ChipChat, Local Pipeline, and Omni Pipeline.

For Google’s realtime WebSocket API the codebase uses **Gemini Live**; for text-in/text-out with Gemma 3n use **Gemma 3n provider**.
