# Rust Omni Stack – Audit: What’s Next, Broken, Missing, Not Production-Ready

> **Scope**: Rust + Candle Full Omni Stack (Phases 1–5).  
> **Last updated**: From codebase and plan review.

---

## 1. What’s Next (Recommended Order)

| Priority | Item                                               | Why                                                                                                                                                                                      |
| -------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**    | **Wire real TTS into rust-omni**                   | OmniEngine uses `MockSynthesisClient` only. Production needs Cartesia/CosyVoice via ferni-tts-core or HTTP.                                                                              |
| **2**    | **Add rust-omni to CI**                            | `rust-native.yml` only builds rust-perf and rust-audio. Add rust-omni build + test so it doesn’t regress.                                                                                |
| **3**    | **Expose rust-omni as a Node package**             | No `package.json` in rust-omni; root `package.json` has no `ferni-omni` / `rust-omni`. Add package and depend on it from the voice agent when ready.                                     |
| **4**    | **Integrate OmniEngine into the Node voice agent** | Voice agent still uses LiveKit/Deepgram STT and remote LLM/TTS. Add a code path (e.g. feature flag) that uses OmniEngine (transcribe → generate → speak) for local/server-side Omni.     |
| **5**    | **E2E test: STT → Thinker → TTS**                  | No end-to-end test with real models. Add a test (or script) that runs with a small Whisper model + Thinker dir + Mock TTS and asserts transcript → response → audio.                     |
| **6**    | **Unit tests for Candle Thinker and Whisper STT**  | `candle_thinker.rs` and `apps/rust-audio/src/stt.rs` have no `#[cfg(test)]` / `#[test]`. Add tests (e.g. config load, tokenizer round-trip, or small forward pass if feasible).          |
| **7**    | **UniFFI + iOS**                                   | Phase 5 is a stub: FerniOmniService.swift is placeholder; no UniFFI .udl, no `uniffi` feature, no iOS build. When you want on-device iOS: add UniFFI, cross-compile, then replace stubs. |
| **8**    | **Q4_K quantization and iOS runbook**              | README describes Phase 5 steps but there is no script or doc for “quantize Thinker to Q4_K” or “build for aarch64-apple-ios”. Add when targeting iOS.                                    |

---

## 2. What’s Broken

| Item                                  | Where                               | Notes                                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rust-omni not in CI**               | `.github/workflows/rust-native.yml` | Workflow only lists `apps/rust-perf/**` and `apps/rust-audio/**`. Changes to rust-omni (or ferni-tts-core) don’t trigger build/test; rust-omni can break silently.                                              |
| **No Node entry point for rust-omni** | `apps/rust-omni/`                   | Crate builds a cdylib for NAPI but there’s no `package.json`, no `index.js`/`index.d.ts` that require the `.node` binary. So Node can’t `require('ferni-omni')` today.                                          |
| **TTS in Omni is Mock only**          | `apps/rust-omni/src/napi.rs`        | `tts_client` is always `MockSynthesisClient`. Real voice requires either (a) ferni-tts-core supporting a real backend (e.g. Cartesia HTTP client in core), or (b) rust-omni calling the ferni-tts HTTP service. |

Nothing else was found “broken” in the sense of compile/runtime errors; the main gaps are integration and usage.

---

## 3. What’s Missing

| Category                   | Missing                                 | Location / Note                                                                                                                                                 |
| -------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tests**                  | Unit tests for Candle Thinker           | `apps/rust-perf/src/candle_thinker.rs` – no `#[test]`.                                                                                                          |
| **Tests**                  | Unit tests for Whisper STT              | `apps/rust-audio/src/stt.rs` – no `#[test]`.                                                                                                                    |
| **Tests**                  | Any tests in rust-omni                  | `apps/rust-omni/` – no test module.                                                                                                                             |
| **Tests**                  | E2E pipeline test                       | No test that runs transcribe → generate → speak with real or fixture data.                                                                                      |
| **Integration**            | rust-omni in workspace build            | Root/workspace may not build rust-omni by default; verify `cargo build -p ferni-omni` (and deps) from repo root.                                                |
| **Integration**            | Voice agent use of OmniEngine           | No TypeScript that instantiates OmniEngine or uses it for STT/LLM/TTS.                                                                                          |
| **iOS**                    | UniFFI interface and feature            | No `.udl` file, no `uniffi` feature in rust-omni, no Swift generated from Rust.                                                                                 |
| **iOS**                    | Real implementation in FerniOmniService | `FerniOmniService.swift` is stub only (returns empty string / empty array).                                                                                     |
| **Docs**                   | “How to run Omni E2E locally”           | README shows API usage but not “where to get models, how to run a full loop, how to point Node at the .node binary”.                                            |
| **Production TTS in core** | Cartesia/CosyVoice in ferni-tts-core    | `crates/ferni-tts-core` only has Mock; `create_client` returns `BackendUnavailable` for CosyVoice/Azure/etc. Real backends live in `services/ferni-tts` (HTTP). |

---

## 4. What’s Not Production-Ready

| Component                    | State                            | What’s needed for production                                                                                                                   |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **rust-omni**                | Library exists, NAPI API defined | Real TTS client, CI, Node package, integration in voice agent, E2E test.                                                                       |
| **OmniEngine (Node)**        | Not used anywhere                | Add to voice agent behind a feature flag or env; error handling, timeouts, logging.                                                            |
| **Candle Thinker**           | Implemented, no tests            | Unit tests, run against a real Qwen3-Omni checkpoint once, document model path/format.                                                         |
| **Whisper STT (rust-audio)** | Implemented, no tests            | Unit test (e.g. load model, or fixture audio → transcript), document model path.                                                               |
| **ferni-tts-core**           | Mock only in core                | Either add a Cartesia (and/or CosyVoice) client into core used by rust-omni, or have rust-omni call ferni-tts HTTP; then add integration test. |
| **iOS (Phase 5)**            | Stub only                        | UniFFI, iOS target, Q4_K flow, replace FerniOmniService stubs.                                                                                 |

---

## 5. What’s Validated

| What                                    | How                                                                                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rust-perf**                           | Many unit tests in lib, turn_analyzer, ssml_processor, signal_extractor, json_parser, fluency_analyzer, embedding_cache, fft_analyzer, token_counter; CI runs `cargo test`.   |
| **rust-audio**                          | Unit tests in lib, post_tts_processor, sola, pre_stt, yin, fft, post_tts, audio_processor, buffer_pool, feature_extraction; CI runs `cargo test`.                             |
| **Candle router (candle_router.rs)**    | Has tests in rust-perf (e.g. lib.rs); used in production path (FTIS V3).                                                                                                      |
| **@ferni/audio (NativeAudioProcessor)** | Used from `src/speech/audio-prosody/native-analyzer.ts`; optional/feature-flagged.                                                                                            |
| **RUST-MIGRATION-E2E-PLAN**             | Documents migration status: only one consumer (memory-jobs) uses rust-accelerator; 40+ files still on JS cosineSimilarity; no integration tests proving native in production. |

**Not validated**: Candle Thinker load/generate, Whisper STT transcribe, rust-omni pipeline, FerniOmniService.

---

## 6. What’s Proven E2E

| Pipeline                             | Proven? | Notes                                                                       |
| ------------------------------------ | ------- | --------------------------------------------------------------------------- |
| **Voice agent (current)**            | Yes     | LiveKit + Deepgram/STT + remote LLM + Cartesia TTS – production path.       |
| **STT → Thinker → TTS (Rust Omni)**  | No      | No test or script that runs OmniEngine with real models and asserts output. |
| **Node → rust-perf (Candle router)** | Yes     | CI verifies rust-perf loads and CandleRouter is used in a test.             |
| **Node → rust-audio**                | Yes     | CI verifies rust-audio loads and APIs are callable.                         |
| **Node → rust-omni**                 | No      | rust-omni not in CI; no Node package; no E2E.                               |

---

## 7. State of the Art Not Fully Implemented / Tested / Validated E2E

| Area                                    | State of the art / plan                                         | Current state                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **On-device STT**                       | whisper-rs with Metal (8–40× realtime)                          | Implemented in rust-audio/stt.rs; no tests; not used by voice agent.                                                                   |
| **On-device MoE LLM (Thinker)**         | Candle Qwen3-Omni with Metal, safetensors, generate loop        | Implemented in candle_thinker.rs; no tests; not run E2E with real weights.                                                             |
| **Single binary STT + Thinker + TTS**   | rust-omni with NAPI                                             | Implemented but TTS is Mock only; no CI, no Node package, no E2E.                                                                      |
| **Direct TTS (no HTTP)**                | ferni-tts-core as library                                       | Core extracted; service uses it. rust-omni uses only Mock; core does not expose Cartesia/CosyVoice to Rust.                            |
| **iOS on-device**                       | UniFFI, aarch64-apple-ios, Q4_K                                 | Stub only (FerniOmniService + README steps); no UniFFI, no iOS build.                                                                  |
| **Rust migration (audio + embeddings)** | RUST-MIGRATION-E2E-PLAN: zero-allocation audio, SIMD embeddings | Partial: NativeAudioProcessor used behind flag; 78 `new Float32Array` and 40+ JS cosineSimilarity usages remain; no integration tests. |

---

## 8. Summary Table

| Question                             | Answer                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **What’s next?**                     | Real TTS in rust-omni → CI for rust-omni → Node package → Voice agent integration → E2E test → Thinker/STT unit tests → UniFFI/iOS when needed. |
| **What’s broken?**                   | rust-omni not in CI; no Node package for rust-omni; OmniEngine TTS is Mock only.                                                                |
| **What’s missing?**                  | Tests (Thinker, STT, rust-omni, E2E); Node integration; UniFFI/iOS implementation; runbooks for models and iOS.                                 |
| **What’s not production-ready?**     | rust-omni (TTS, CI, package, integration); OmniEngine usage; iOS (stub).                                                                        |
| **What’s validated?**                | rust-perf and rust-audio (unit tests + CI); Candle router in production path; @ferni/audio in native-analyzer.                                  |
| **What’s proven E2E?**               | Current voice agent (LiveKit + cloud STT/LLM/TTS); Node → rust-perf and Node → rust-audio in CI. Not proven: full Rust Omni pipeline.           |
| **State of the art not fully done?** | On-device Whisper + Thinker + real TTS in one stack; iOS on-device; completion of Rust migration (audio hot path + embeddings).                 |

---

## 9. References

- Plan: `.cursor/plans/rust_candle_full_stack_*.plan.md`
- Rust migration: `docs/architecture/RUST-MIGRATION-E2E-PLAN.md`
- rust-omni: `apps/rust-omni/README.md`
- iOS stub: `apps/ios-native/Sources/Services/FerniOmniService.swift`
- CI: `.github/workflows/rust-native.yml`
