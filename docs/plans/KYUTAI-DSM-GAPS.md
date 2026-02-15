# Kyutai DSM: Gaps, Next Steps, and Validation

> **Status:** Plan phases 1–7 implemented. This doc captures what’s missing, not wired, or not validated.

---

## ✅ Implemented and wired

| Area | Status |
|------|--------|
| Mock moshi-server | `src/speech/__tests__/mocks/mock-moshi-server.ts` – STT + TTS WebSocket protocol |
| Kyutai STT client | Unit tests, adapter, wired into AgentSession when `USE_KYUTAI_STT=true` |
| Kyutai TTS provider | Unit + integration tests, gateway uses `getTTSProvider()` (Kyutai when `TTS_PROVIDER=kyutai`) |
| Health checks | `kyutai-health.ts` + `/health/kyutai`, unit tested |
| CI | 7 Kyutai test files (38 tests) run in integration job; mock only, no MLX |
| Env | `.env.example` documents `USE_KYUTAI_STT`, `TTS_PROVIDER=kyutai`, `KYUTAI_*_URL`, `KYUTAI_API_KEY` |
| Docs | `docs/guides/KYUTAI-DSM-SETUP.md` – GCE + local options |

---

## 🔴 Not implemented / not wired

### 1. MLX bridge: real inference

**File:** `scripts/kyutai/mlx-bridge-server.py`

- **Current:** Server runs; without `--use-mlx` it returns mock STT/TTS. With `--use-mlx` it only imports `moshi_mlx` and prints “STT/TTS wiring TODO”.
- **Missing:** Actual STT/TTS calls into `moshi_mlx` (or DSM Python API). No `STT_MODEL` / `TTS_MODEL` load, no PCM → transcript, no text → PCM.
- **Next:** Wire STT (buffer → model → JSON transcript) and TTS (text + voice_id → model → PCM chunks) using Kyutai DSM / moshi-mlx APIs; keep mock as fallback when models not available.

### 2. Sample audio fixture (optional)

- **Plan mentioned:** `src/tests/fixtures/sample-audio-16khz.pcm` (a few seconds of speech).
- **Current:** E2E and adapter tests generate PCM in memory (e.g. 320-sample frames); no on-disk fixture.
- **Impact:** Low; tests are self-contained. Fixture would only help manual/local-proof runs with real audio.

---

## 🟡 Not documented in repo

### 3. Scripts not referenced in docs

- **`scripts/kyutai/mlx-bridge-server.py`** – Not mentioned in `docs/guides/KYUTAI-DSM-SETUP.md` or `scripts/kyutai/README.md`. Docs say “see scripts/kyutai/” but don’t list the bridge.
- **`scripts/kyutai/local-proof.ts`** – Not in setup guide or scripts README (usage: STT → TTS round-trip + latency).
- **`scripts/kyutai/compare-tts.ts`** – Not in docs (Kyutai vs Cartesia A/B + HTML).

**Next:** Add a short “Local validation” subsection to the setup guide (and/or scripts README) with:

- How to run the MLX bridge (mock and, when implemented, `--use-mlx`).
- How to run `local-proof.ts` (with/without `--input`).
- How to run `compare-tts.ts` and open the generated HTML.

---

## 🟠 E2E and validation

### 4. No automated E2E against real Kyutai

- **Current:** E2E runs in CI **only against the mock** (`src/tests/e2e/kyutai-dsm-e2e.test.ts`). No real moshi-server, no real MLX.
- **Missing:**  
  - Automated E2E vs real GCE moshi-server (would need CI job with network/env to GCE or a long-running fixture).  
  - Automated E2E vs MLX bridge with real models (would need Mac runner + MLX deps).
- **Practical “validated” path today:**  
  - **GCE:** Manually run voice agent with `USE_KYUTAI_STT=true`, `TTS_PROVIDER=kyutai`, and URLs pointing at GCE sidecars; do a live call and confirm STT/TTS.  
  - **Local:** Once MLX bridge is wired: start bridge with `--use-mlx`, run `local-proof.ts` (and optionally `compare-tts.ts`), then run the voice agent against the bridge and do a live call.

### 5. No formal “audit” checklist

- There is no single “Kyutai DSM E2E audit” doc or checklist (e.g. “smoke: mock CI green, manual: GCE STT/TTS, manual: MLX bridge STT/TTS, manual: voice agent end-to-end with Kyutai”).
- **Next:** Add a short `docs/runbooks/KYUTAI-DSM-VALIDATION.md` (or a section in the setup guide) that lists:  
  - CI (mock) – automated.  
  - GCE (real) – manual steps + env.  
  - MLX bridge (real, when wired) – manual steps.  
  - Voice agent E2E with Kyutai – manual test steps.

---

## Rust/Candle bridge: weight compatibility (validated, working)

**Bridge:** `services/kyutai-bridge/` (Rust, moshi crate v0.6, Candle 0.9).

- **Default repo:** `KYUTAI_MOSHI_REPO` defaults to `kyutai/moshiko-candle-bf16` (full 7B, safetensors ~15GB). HF download and config-driven filenames work.
- **7B model (32001×4096):** `load_asr` expects 1B ASR config (48001×2048). When the bridge sees that shape mismatch, it retries with **`Config::v0_1_asr()`** (7B ASR config: 32001×4096). STT and TTS both load from the same `moshiko-candle-bf16` weights; TTS uses `load_streaming` (v0_1_streaming), which already matches 32001×4096.
- **Repos:**  
  - `kyutai/moshiko-candle-q8`: only `model.q8.gguf` (no safetensors).  
  - `kyutai/stt-1b-en_fr`: safetensors but 8001×2048 (different vocab); no auto-fallback.  
  - `kyutai/moshiko-candle-bf16`: **supported**; bridge auto-uses v0_1_asr for STT.
- **Config-driven filenames:** If the HF repo has `config.json`, the bridge uses `mimi_name` and `tokenizer_name` from it. Otherwise fallbacks: `tokenizer-e351c8d8-checkpoint125.safetensors`, `tokenizer_spm_32k_3.model`.
- **Validation:** Run `cargo test` for protocol tests (mock). For real inference: `cargo run --release` (downloads from HF if needed; load + warmup ~5–6 min on CPU). Measure first interim, final, TTFB per [KYUTAI-DSM-BETTER-THAN-HUMAN.md](KYUTAI-DSM-BETTER-THAN-HUMAN.md).

### Full-duplex STS (load_streaming_both_ways)

- **Config:** `KYUTAI_FULL_DUPLEX=true` or `--full-duplex`. Loads a single model via `load_streaming_both_ways` for bidirectional audio (user and agent can overlap). Target: ~160ms (Kyutai published).
- **Route:** `ws://<host>:<stt_port>/api/sts-full-duplex`. When full-duplex is enabled, STT and TTS models are not loaded; only the full-duplex model is loaded.
- **Status:** Loading and WebSocket handler are wired; handler sends a JSON greeting and keeps the connection open. **Bidirectional inference loop TODO:** step both ways (user PCM in → model → agent PCM out) using the full-duplex LmModel; function calling requires a "pause and call" mechanism when integrated with the agent.

### GGUF quantized models (path resolution in place)

- **Config:** `KYUTAI_USE_GGUF=true` or `--use-gguf`. When set, the bridge resolves the LM path to `model.q8.gguf` (or `model.gguf`) from the HF repo (e.g. `kyutai/moshiko-candle-q8`). Target: ~4GB VRAM instead of ~15GB; enables T4 deployment.
- **Current limitation:** The **moshi** crate (v0.6) only loads safetensors via path; it does not expose VarBuilder/GGUF loading. If you pass a `.gguf` path or use `KYUTAI_USE_GGUF=true`, the bridge returns a clear error and suggests using `moshiko-candle-bf16` or waiting for moshi to add VarBuilder/GGUF support.
- **When moshi adds GGUF:** Wire `VarBuilder::from_gguf()` (e.g. from `candle_transformers::quantized_var_builder`) and a moshi `load_lm_model_from_vb`-style API if upstream adds it; path resolution and config are already in place.

---

## E2E audio validation (Phase 0)

**Goal:** Real audio in → STT → transcript; text → TTS → PCM out; measure latency and document.

### Procedure

1. **Test audio:** Record or generate ~5 s of 16 kHz mono PCM (Int16). Example: `sox -n -r 16000 -c 1 test-5s.pcm trim 0 5` (silence), or record speech and convert to 16 kHz mono.
2. **STT:** Start bridge (real mode). Send test PCM over WebSocket to `ws://127.0.0.1:8089/api/asr-streaming` (binary frames). Collect first interim and final transcript; verify output is real words (not garbage).
3. **TTS:** Send JSON `{"text":"Hello world"}` to `ws://127.0.0.1:8090/api/tts_streaming`. Collect binary PCM chunks; save to file and play back to verify audible speech.
4. **Measure and record:** First interim latency (ms), final STT latency (ms), TTS TTFB (ms). Run `scripts/kyutai/benchmark-bridge.sh` for repeatable numbers.

### Measured latency (update after running E2E)

| Metric | Target | Measured | Notes |
|--------|--------|-----------|--------|
| STT first interim | &lt; 300 ms | _TBD_ | From first PCM chunk to first interim JSON |
| STT final | &lt; 500 ms | _TBD_ | To final transcript |
| TTS TTFB | &lt; 250 ms | _TBD_ | Request to first PCM chunk |

*Fill in "Measured" and "Notes" after running E2E with real bridge (Metal/GPU recommended).*

---

## 🔧 Fixed in this pass

- **TypeScript:** `kyutai-stt-adapter.test.ts` was passing a global `ReadableStream` where `node:stream/web` was expected. Fixed by importing `ReadableStream` from `node:stream/web` in the test.

---

## Summary table

| Item | Status | Action |
|------|--------|--------|
| MLX bridge real STT/TTS | Not implemented | Wire moshi_mlx/DSM in `mlx-bridge-server.py` |
| Sample PCM fixture | Optional, not added | Add only if you want a shared fixture for manual runs |
| Docs for bridge + scripts | Missing | Add “Local validation” to setup guide and/or scripts README |
| E2E vs real Kyutai (GCE/MLX) | Not automated | Rely on manual validation; optionally add runbook/checklist |
| Kyutai STT/TTS adapter type error | Fixed | Use `ReadableStream` from `node:stream/web` in adapter test |

---

*Last updated from gap analysis (post–plan implementation).*
