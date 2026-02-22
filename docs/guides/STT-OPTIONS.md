# Speech-to-Text (STT) Options

How the voice agent gets user speech as text, and how to switch between options.

## Default: LLM built-in STT (Gemini or OpenAI)

**When you're not using Higgs or Kyutai STT**, the **realtime LLM does speech-to-text**:

- **Gemini Live** (default): Gemini’s built-in STT turns user audio into transcript and emits `UserInputTranscribed`. Turn detection is `realtime_llm` (model decides when the user has finished).
- **OpenAI Realtime** (`USE_OPENAI_REALTIME=true`): OpenAI’s built-in STT and `server_vad` turn detection.

So **yes — with the default stack you are using Gemini for STT** (and for the LLM). No separate STT service is used.

Code: `src/agents/voice-agent-entry.ts` → `turnDetection: useHiggsSTT ? 'vad' : 'realtime_llm'`, and the session does not pass an `stt` adapter when not using Higgs.

---

## Option 1: Higgs pipeline STT (Parakeet only)

Use the **Rust Higgs pipeline** for STT with **Parakeet only** (0.6B or 1.1B). You get transcripts and optional voice biomarkers from the pipeline. Whisper is not used.

**Enable:**

1. **TTS provider** must be Higgs (so the pipeline is used):
   - `TTS_PROVIDER=higgs-pipeline` **or** `HIGGS_PIPELINE_URL=ws://localhost:8600/ws` (and no other TTS_PROVIDER).
2. **Opt in to Higgs STT:**
   - `USE_HIGGS_STT=true`

**Result:**

- User audio is sent to the Higgs pipeline (after resampling to 16 kHz if needed).
- Transcripts (and biomarkers) come from Parakeet (TDT 0.6B or 1.1B; optional EOU for 0.6B streaming partials).
- Turn detection switches to **VAD** (voice activity) instead of `realtime_llm`.

**Requirements:**

- Higgs pipeline server running (e.g. port 8600) with a Parakeet model.  
  See `apps/rust-higgs-pipeline/README.md` — “Run on Mac (state-of-the-art, low latency)”.

### Parakeet 1.1B (recommended)

For best accuracy, use **Parakeet TDT 1.1B** in TDT-only mode (no EOU):

1. Download the ONNX model from [dtgagnon/parakeet-tdt-1.1b-onnx](https://huggingface.co/dtgagnon/parakeet-tdt-1.1b-onnx) and extract it (e.g. `./models/parakeet-tdt-1.1b`).
2. Start the pipeline with **only** `--parakeet-model` (do **not** set `--parakeet-eou-model`):

   ```bash
   ./target/release/higgs-voice-pipeline --port 8600 \
     --parakeet-model ./models/parakeet-tdt-1.1b \
     --higgs-model ./models/higgs-audio-v2 \
     --xcodec-model ./models/xcodec
   ```

3. Use `scripts/higgs/try-higgs-stt.sh` or set `USE_HIGGS_STT=true` and `TTS_PROVIDER=higgs-pipeline` so the voice agent uses Higgs STT.

**Full local e2e (no Gemini):** Run `./scripts/higgs/start-higgs-e2e.sh` to start all servers with Parakeet STT + Ollama LLM + Cartesia TTS. Prereq: Ollama running (e.g. `ollama run llama3.2`).

**Relevant code:**

- `src/agents/integrations/higgs-stt-integration.ts` — `isHiggsSTTEnabled()`, `getHiggsSTTProvider()`, resampling.
- `src/speech/providers/higgs-stt-adapter.ts` — LiveKit `STT` adapter that uses the Higgs provider.
- `src/agents/voice-agent-entry.ts` — `useHiggsSTT`, `higgsStt`, `turnDetection`, `stt: higgsStt`.

---

## Option 2: Kyutai STT (Moshi / external ASR)

**Kyutai STT** is implemented as a LiveKit-compatible adapter (`KyutaiSTT` in `src/speech/providers/kyutai-stt-adapter.ts`) that talks to a Kyutai ASR WebSocket (e.g. `KYUTAI_STT_URL`, default `ws://localhost:8089/api/asr-streaming`).

**Current wiring:**

- The adapter is used in **e2e tests** and by **`KyutaiSTTClient`** in `src/speech/providers/kyutai-stt.ts`.
- It is **not** currently passed as the session `stt` in the main voice-agent path (`voice-agent-entry.ts` or multi-agent `agent-setup.ts`). So with the default app flow, **Kyutai STT is not used** even if `USE_KYUTAI_STT=true` for health checks.

To **try Kyutai STT** in the main session you would need to:

1. Instantiate `KyutaiSTT` (e.g. from `src/speech/providers/kyutai-stt-adapter.ts`).
2. Pass it as `stt` when creating `AgentSession` (and use VAD turn detection), in the same way Higgs STT is passed in `voice-agent-entry.ts`.

Health checks that consider Kyutai STT: `src/speech/kyutai-health.ts` (when `USE_KYUTAI_STT` or `TTS_PROVIDER=kyutai`).

---

## Summary

| STT source        | When it’s used                          | How to enable / try                          |
|-------------------|------------------------------------------|----------------------------------------------|
| **Gemini**        | Default when using Gemini Live          | No env needed (default)                      |
| **OpenAI**        | When using OpenAI Realtime              | `USE_OPENAI_REALTIME=true`                   |
| **Higgs pipeline**| Parakeet/Whisper in Rust pipeline       | `TTS_PROVIDER=higgs-pipeline` + `USE_HIGGS_STT=true` + pipeline running |
| **Kyutai**        | Adapter exists; not in main session yet | Wire `KyutaiSTT` into session creation       |

So: **by default the app uses Gemini for STT** (when the LLM is Gemini). To use another option, enable **Higgs STT** as above, or add wiring for **Kyutai STT** in the voice session.

---

## Try Higgs STT now

1. **Start Higgs pipeline with STT** (from `apps/rust-higgs-pipeline`):
   - **Parakeet 1.1B (recommended):** `--parakeet-model ./models/parakeet-tdt-1.1b` (no EOU; download from [dtgagnon/parakeet-tdt-1.1b-onnx](https://huggingface.co/dtgagnon/parakeet-tdt-1.1b-onnx)).
   - **Parakeet 0.6B + streaming:** `--parakeet-model`, `--parakeet-eou-model` (and `PARAKEET_MODEL_DIR` / `PARAKEET_EOU_MODEL_DIR` if using env).
2. **Run the voice agent with Higgs STT:**
   ```bash
   ./scripts/higgs/try-higgs-stt.sh
   ```
   Or set env and run `pnpm dev`:
   - `TTS_PROVIDER=higgs-pipeline`
   - `HIGGS_PIPELINE_URL=ws://localhost:8600/ws`
   - `USE_HIGGS_STT=true`
3. You should see `[voice-agent-entry] 🎯 Higgs STT enabled` and transcripts coming from the pipeline (with biomarkers if the pipeline returns them).

---

## Are Parakeet the right SOTA? (Better than baseline)

**Baseline:** Gemini Live’s built-in STT. No public WER; tuned for conversational latency and quality.

**What we use in Higgs (Parakeet only, no Whisper):**

| Model | Role | Typical WER / latency | Notes |
|-------|------|------------------------|------|
| **Parakeet TDT 1.1B** | Primary (TDT-only) | Better than 0.6B; >2000 RTFx | ONNX from dtgagnon/parakeet-tdt-1.1b-onnx; best Parakeet accuracy |
| **Parakeet TDT 0.6B** | Optional + EOU | ~1.69% LibriSpeech clean; good RTFx | Batch + streaming partials when EOU dir is set |

**Public SOTA (2024–2025):**

- **Accuracy (English):** Canary Qwen 2.5B (~5.63% WER), IBM Granite Speech 3.3 8B (~5.85%), Whisper Large V3 (~7.4%).
- **Streaming / low latency:** Parakeet TDT **1.1B** (>2000 RTFx), Whisper Large V3 **Turbo** (216 RTFx, ~7.75% WER).
- **Multilingual:** Whisper Large V3 (99+ languages).

**Current choice:** We use **Parakeet 1.1B (TDT-only)** or **Parakeet 0.6B + EOU** in the Rust pipeline for STT. No Whisper. To go beyond Parakeet we could add **Canary Qwen 2.5B** or **Faster-Whisper** as an optional backend; the pipeline design (batch `transcribe` + optional EOU) can host additional engines if needed.

---

## STT landscape: Apple, Google, open SOTA (2025–2027)

### Parakeet 1.1B

- **nvidia/parakeet-tdt-1.1b** (PyTorch) and **dtgagnon/parakeet-tdt-1.1b-onnx** (ONNX) on Hugging Face.
- 1.1B params, FastConformer TDT, English ASR; ONNX export is compatible with parakeet-rs–style pipelines.
- Better accuracy than 0.6B with still very high RTFx; good upgrade path inside our current Rust pipeline.

### Apple

- **SpeechAnalyzer** (WWDC 2025, iOS 26): replacement for SFSpeechRecognizer; on-device, low latency, progressive + final results, no server.
- Not released as an open model or cross-platform API; only usable inside Apple’s SDK on Apple devices. We can’t “use Apple STT” in the Higgs pipeline unless we run on-device iOS/macOS and call their framework.

### Google

- **Chirp 3** (Cloud Speech-to-Text v2, GA Oct 2025): 85+ languages, speaker diarization, denoising, streaming/batch; cloud API only.
- **Gemini Live** (our baseline): built-in STT in the multimodal model; no separate Chirp call. So “Google STT” for us = Gemini’s built-in unless we add a separate Chirp API client.

### Open SOTA (2025–2026, directionally 2027)

| Model | WER (English) | Latency / RTFx | Languages | Notes |
|-------|----------------|----------------|-----------|--------|
| **Canary Qwen 2.5B** | ~5.63% | 418 RTFx | English-focused | Best open English WER in common benchmarks |
| **IBM Granite Speech 3.3 8B** | ~5.85% | — | Multilingual | Enterprise-grade |
| **Parakeet TDT 0.6B v2/v3** | ~6.05% (leaderboard) | 3,386 RTFx | 25 | Ultra-low latency, we use 0.6B today |
| **Parakeet TDT 1.1B** | Better than 0.6B | >2000 RTFx | English | Best Parakeet accuracy, ONNX available |
| **Canary-1B-v2** | Beats Whisper large-v3 (English) | ~10× faster than Whisper large | 25 European | 1B params, 1.7M h training |
| **Whisper Large V3** | ~7.4% | — | 99+ | Multilingual standard |
| **Whisper Large V3 Turbo** | ~7.75% | 216 RTFx | 99+ | Faster, 809M params |

**Practical “state of the art” for us in 2026/2027:**

- **Streaming / low latency:** Parakeet TDT 1.1B (ONNX in Rust) or Parakeet 0.6B v3.
- **Best English accuracy (open):** Canary Qwen 2.5B or Canary-1B-v2 (if we add a new backend).
- **Multilingual:** Whisper Large V3 or Turbo; or Chirp 3 (cloud) if we add a Google client.
- **Apple/Google:** Use their SDK/API on their platforms; not replaceable by a single open model in our pipeline.

**Recommendation:** Add **Parakeet TDT 1.1B** (ONNX from Hugging Face) as the primary streaming STT in the Higgs pipeline for “better than baseline” with minimal stack change; keep Whisper for fallback and add Whisper large-v3-turbo or Canary later if we need more accuracy or multilingual.
