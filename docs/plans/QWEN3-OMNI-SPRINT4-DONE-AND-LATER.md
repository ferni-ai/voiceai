# Qwen3-Omni Candle: Sprint 4–8 Done + Remaining

**Status:** All phases complete. All stubs eliminated. Rust + TypeScript only (no Python in repo). Full pipeline + HTTP server (E2E wired) + Ferni voice agent integration complete.  
**Last updated:** 2026-02-08

---

## 1. Sprint 4 (Multimodal Thinker) — Done

- **Thinker:** `ThinkerModel::build_audio_token_sequence`, `forward_with_hidden_states_from_embeddings`; `Qwen3OmniThinker::forward_with_hidden_states_from_audio(audio_embeddings, input_ids, cache, seqlen_offset, extract_layer)` with truncation to `max_position_embeddings` and causal mask over full sequence.
- **Pipeline:** Step 3 uses `forward_with_hidden_states_from_audio`, then takes **last position** of extracted hidden (`extracted.narrow(1, seq_len - 1, 1)`) for Talker.
- **Tests:** `test_thinker_forward_with_audio_shape`, `test_thinker_forward_with_audio_conditioning`, `test_thinker_forward_with_audio_truncation` in `candle_thinker.rs`.
- **Docs:** `docs/architecture/QWEN3-OMNI-CANDLE-AUDIT.md` §2.1 and §3 updated; checklist "Audio → Thinker" marked done.

---

## 2. Sprint 5 (Code2Wav Weight Loading) — Done

- **Code2Wav:** Now loads `code2wav.*` weights from `model.safetensors.index.json` when present:
  - Codebook embedding: `code2wav.model.embed` → `Embedding(codebook_size, codebook_dim)`.
  - Output projection: `code2wav.model.output_proj` → `Linear(decoder_dim, upsample_factor)`.
- **Forward:** When weights loaded: embeds each quantizer's tokens, stacks, reshapes, projects to waveform. Without weights: returns zeros (graceful fallback).
- **`has_weights()`:** Exposes whether codebook was loaded for diagnostics.

---

## 3. Sprint 6 (Code2Wav Decoder + NAPI Gating + Test Suite) — Done

- **Code2Wav 8-layer Transformer Decoder:** Fully implemented in `candle_code2wav.rs`:
  - `Code2WavDecoderAttention`: Causal self-attention with QK-norm (no RoPE), GQA support.
  - `Code2WavDecoderMLP`: SiLU-gated MLP (gate_proj + up_proj + down_proj).
  - `Code2WavDecoderLayer`: Pre-norm attention + pre-norm MLP + residuals.
  - `Code2WavDecoder`: input_proj (embed → hidden_size) → 8 layers → final_norm → final_proj (hidden_size → decoder_dim).
  - Causal mask applied for seq_len > 1.
- **ConvNet Upsampler:** Fully implemented:
  - `UpsampleBlock`: ConvTranspose1d with SiLU at each rate [8, 5, 4, 3].
  - `ConvNetUpsampler`: decoder_dim → 512 → 256 → 128 → 64 → 1 channel (480x total upsample).
  - Channel-first convolution, tanh output normalization.
- **Forward pipeline:** embed → 8-layer decoder → ConvNet upsampler (preferred) or linear fallback → waveform.
- **`load_with_vb` / `load_with_vb_with_config`:** Builds full architecture from VarBuilder (zero/random weights for testing).
- **Full NAPI Feature Gating:** All NAPI code moved to `napi_bindings.rs`, gated behind `#[cfg(feature = "napi")]`. `cargo test --lib --no-default-features` runs all 83+ unit tests without NAPI linking.
- **Test Suite:** 83 tests pass, 4 slow tests marked `#[ignore]` (run with `cargo test -- --ignored`):
  - `test_thinker_forward_with_audio_shape` (~60s)
  - `test_thinker_forward_with_audio_conditioning` (~60s)
  - `test_thinker_forward_with_audio_truncation` (~60s)
  - `test_full_pipeline_shape_chain` (~70s)
- **Contiguity/broadcast fixes:** Fixed `gather` contiguity errors in Thinker/Talker MoE blocks (`.contiguous()` after `narrow()`), fixed shape mismatch in mul (`broadcast_mul()` instead of `*`).

---

## 4. Sprint 7 (No Python + HF Key Support + HTTP Server + Ferni Wiring) — Done

### No Python in Repo

- **Removed:** `apps/mlx-qwen3-omni` (all Python inference, conversion scripts, server, tests).
- **TypeScript config:** `InferenceBackend = 'candle' | 'vllm' | 'mlx'`; Candle default, MLX/vLLM as external servers. No Python in repo.
- **Docs updated:** Architecture, feasibility, and issues docs reflect Rust + TypeScript only.

### HuggingFace Direct Weight Loading (No Conversion)

All loaders now auto-detect HF key layout and load directly — no Python conversion step needed:

| Component         | HF Key Prefix                   | Direct Prefix             | Loader                    |
| ----------------- | ------------------------------- | ------------------------- | ------------------------- |
| **Thinker**       | `model.thinker.text_model.*`    | `thinker.model.*`         | `candle_thinker.rs`       |
| **Audio Encoder** | `model.thinker.audio_encoder.*` | `thinker.audio_encoder.*` | `candle_audio_encoder.rs` |
| **Talker**        | `model.talker.*`                | `talker.*`                | `candle_talker.rs`        |
| **Code2Wav**      | `model.code2wav.*`              | `code2wav.*`              | `candle_code2wav.rs`      |

### HTTP Server (`apps/rust-perf/src/bin/server.rs`)

OpenAI-compatible endpoints for the TypeScript Qwen3OmniClient:

| Endpoint                   | Method | Purpose                        |
| -------------------------- | ------ | ------------------------------ |
| `/health`                  | GET    | Health check + pipeline status |
| `/v1/chat/completions`     | POST   | Text chat (OpenAI format)      |
| `/v1/audio/transcriptions` | POST   | Audio → text (STT)             |
| `/v1/audio/speech`         | POST   | Text → audio (TTS)             |

Run: `cargo run --bin qwen3-omni-server --features server --no-default-features -- --model-path /path/to/weights`

### Ferni Voice Agent Integration (Already Wired)

The TypeScript integration is fully in place:

- `Qwen3OmniProvider` → `Qwen3LLMAdapter` → `Qwen3OmniClient` → Rust server
- `Qwen3TTSAdapter` for TTS
- `SessionManagerRealtimeModel` for Director Mode
- `NativeOmniEngine` for in-process NAPI

To enable: `USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:8000`

### Backend Selection

| Platform      | Default                 | Best Perf                  | Config                                       |
| ------------- | ----------------------- | -------------------------- | -------------------------------------------- |
| **Mac**       | Candle (Metal, in-repo) | MLX (external server)      | `QWEN3_OMNI_BACKEND=mlx QWEN3_OMNI_URL=...`  |
| **GCE/Linux** | Candle (CPU, in-repo)   | vLLM (external, multi-GPU) | `QWEN3_OMNI_BACKEND=vllm QWEN3_OMNI_URL=...` |

---

## 5. Sprint 8 (Stub Elimination — Full E2E Wiring) — Done

### Rust Pipeline Methods (3 new methods in `full_omni_pipeline.rs`)

| Method                                        | Input                       | Output                   | Wired To                   |
| --------------------------------------------- | --------------------------- | ------------------------ | -------------------------- |
| `generate_text(prompt, max_tokens, temp)`     | Text prompt (ChatML format) | Generated text           | `/v1/chat/completions`     |
| `transcribe_audio(samples, max_tokens, temp)` | 16kHz f32 PCM               | (text, timings)          | `/v1/audio/transcriptions` |
| `synthesize_speech(text, temp)`               | Text string                 | (24kHz f32 PCM, timings) | `/v1/audio/speech`         |

**`generate_text`**: Delegates to `Thinker.generate()` with KV cache, temperature sampling, EOS detection.

**`transcribe_audio`**: Mel → Audio Encoder → Thinker (audio-conditioned prefill) → text token generation.

**`synthesize_speech`**: Tokenize text → Thinker (hidden state extraction at layer 18) → Talker → Code2Wav → 24kHz waveform.

### Server Endpoints (all 3 placeholders replaced in `server.rs`)

| Endpoint                   | Before                 | After                                                      |
| -------------------------- | ---------------------- | ---------------------------------------------------------- |
| `/v1/chat/completions`     | Echo input text        | Full Thinker text generation with ChatML prompt formatting |
| `/v1/audio/transcriptions` | Report pipeline timing | Audio-conditioned Thinker text transcription               |
| `/v1/audio/speech`         | Return 1s silence      | Full Thinker → Talker → Code2Wav waveform                  |

### TypeScript Integration Stubs Eliminated

**`ssml-to-text.ts`** — Replaced 7 local stub functions with real imports:
| Stub Replaced | Real Module |
|---------------|-------------|
| `getAnticipatoryCues` | `src/speech/anticipation/anticipatory-cues.ts` |
| `getBackchannelResponse` | `src/speech/backchanneling/backchannel-engine.ts` |
| `getListeningSignals` | `src/speech/backchanneling/listening-signals.ts` |
| `getBreathingPattern` | `src/speech/breathing/breathing-patterns.ts` |
| `getNaturalSpeechPatterns` | `src/speech/natural/natural-speech-patterns.ts` |
| `getEmotionalProsody` | `src/speech/prosody/emotional-prosody.ts` |
| `getProsodyProfile` | `src/speech/prosody/prosody-profiles.ts` |

**`session-manager.ts`** — Replaced 4 stub classes/functions:
| Stub Replaced | Real Implementation |
|---------------|---------------------|
| `HumanizationEngine` (no-op) | Emotion→tone/pacing mapping with full emotion vocabulary |
| `evaluateHandoffTrigger` (always false) | Emotion detection + explicit phrase matching for persona handoff |
| `AnalysisEngine` (returns null) | `detectEmotion()` from `src/intelligence/detectors/emotion.ts` |
| `getBackchannelResponse` / `getListeningSignals` | Real speech subsystem imports |

---

## 6. Out-of-Scope (Documented, Not Implemented)

| Item                      | Decision                                                                                                                                                            | Where documented                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Cross-attention**       | This port uses **sequence concat** only (`[audio_emb; token_emb]`). No separate cross-attention module. HF Qwen3-Omni may use cross-attention; behavior may differ. | Audit §2.1; code comments in `candle_thinker.rs` |
| **Padding / batched API** | Single-batch pipeline only. Batched padding and padding masks are left for a future batched API.                                                                    | This doc; audit                                  |
| **Quantization**          | No INT4/INT8 quantization in the Candle port. Use vLLM or HF Transformers for quantized inference.                                                                  | This doc                                         |

---

## 7. Remaining Items

| Item                         | Status      | Notes                                                                       |
| ---------------------------- | ----------- | --------------------------------------------------------------------------- |
| E2E with real checkpoint run | 🟡 Waiting  | CI job ready; needs `OMNI_MODEL_PATH` secret pointing to real HF checkpoint |
| Batched / padding API        | 🔴 Deferred | Single-batch only for now                                                   |
| Cross-attention              | 🔴 Deferred | Concat-only port; may diverge from HF                                       |

---

## 8. Compatibility & Correctness Checklist

- [x] Thinker: sequence concat + causal mask + truncation; pipeline takes last position.
- [x] Thinker: HF key layout (`model.thinker.text_model.*`) auto-detected.
- [x] Thinker: `generate()` with KV cache, temperature, EOS detection.
- [x] Talker: code predictor + KV cache + causal mask; 4D logits; HF weight key detection.
- [x] Talker: HF key layout (`model.talker.*`) auto-detected.
- [x] Pipeline: audio → encoder → Thinker (audio + token) → Talker → Code2Wav.
- [x] Pipeline: `generate_text()` — text → Thinker → text.
- [x] Pipeline: `transcribe_audio()` — audio → Mel → Encoder → Thinker → text.
- [x] Pipeline: `synthesize_speech()` — text → Thinker → Talker → Code2Wav → 24kHz waveform.
- [x] Code2Wav: weight loading from checkpoint (codebook embed + output proj).
- [x] Code2Wav: 8-layer transformer decoder (attention + SiLU MLP + RMSNorm per layer).
- [x] Code2Wav: ConvNet upsampler (480x: [8,5,4,3] transposed convolutions → 24kHz).
- [x] Code2Wav: HF key layout (`model.code2wav.*`) auto-detected.
- [x] Audio Encoder: HF key layout (`model.thinker.audio_encoder.*`) auto-detected.
- [x] HTTP server: OpenAI-compatible endpoints — all 3 wired to real pipeline (no placeholders).
- [x] E2E CI workflow (optional, nightly/manual).
- [x] Weight-key validation script.
- [x] Full NAPI gating (`cargo test --no-default-features` runs all tests).
- [x] 83 unit tests passing, 4 slow tests available via `--ignored`.
- [x] No Python in repo. All inference is Rust (Candle) + TypeScript.
- [x] MLX as external backend (Mac, best Apple Silicon perf).
- [x] Ferni voice agent integration wired (Qwen3OmniProvider + SessionManager).
- [x] TypeScript SSML-to-text layer: real speech subsystem imports (7 functions).
- [x] TypeScript SessionManager: real emotion detection, humanization, handoff evaluation.
- [ ] E2E run with real model checkpoint.

**Next:** See [QWEN3-OMNI-LOCAL-AND-GCE.md](../guides/QWEN3-OMNI-LOCAL-AND-GCE.md) for MLX (when available), local Candle setup, and GCE E2E options.

---

## 9. File Reference

| File                                             | Role                                                            |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `apps/rust-perf/src/candle_thinker.rs`           | Thinker + multimodal forward + HF key support + tests           |
| `apps/rust-perf/src/candle_talker.rs`            | Talker (text decoder + code predictor + HF key support)         |
| `apps/rust-perf/src/candle_code2wav.rs`          | Code2Wav (8-layer decoder + ConvNet upsampler + HF key support) |
| `apps/rust-perf/src/candle_audio_encoder.rs`     | AuT audio encoder + HF key support                              |
| `apps/rust-perf/src/candle_mel.rs`               | Mel spectrogram                                                 |
| `apps/rust-perf/src/candle_moe.rs`               | Shared MoE building blocks                                      |
| `apps/rust-perf/src/full_omni_pipeline.rs`       | Full audio → audio pipeline                                     |
| `apps/rust-perf/src/bin/server.rs`               | HTTP server (axum, OpenAI-compatible)                           |
| `apps/rust-perf/src/napi_bindings.rs`            | All NAPI exports (feature-gated)                                |
| `apps/rust-perf/Cargo.toml`                      | Features: `napi` (default), `server`                            |
| `apps/rust-perf/build.rs`                        | Conditional napi_build                                          |
| `src/integrations/qwen3-omni/config.ts`          | Backend selection (candle/vllm/mlx)                             |
| `src/integrations/qwen3-omni/client.ts`          | HTTP client → Rust server                                       |
| `src/integrations/qwen3-omni/native-engine.ts`   | In-process NAPI engine                                          |
| `src/agents/model-provider/qwen3-omni.ts`        | Qwen3OmniProvider for voice agent                               |
| `scripts/qwen3-omni/validate-weight-keys.ts`     | Weight key validation                                           |
| `.github/workflows/qwen3-omni-e2e.yml`           | CI: build + E2E + weight validation                             |
| `docs/architecture/QWEN3-OMNI-CANDLE-AUDIT.md`   | Architecture audit                                              |
| `docs/architecture/MLX-ONNX-CANDLE-LOCAL-GCE.md` | What runs where (local vs GCE)                                  |
| `docs/guides/QWEN3-OMNI-LOCAL-AND-GCE.md`        | MLX, local Candle, GCE E2E (env, deploy, next steps)            |
