# Issues, Gaps, Wiring, and Code Quality

> Consolidated view of what’s broken, buggy, incomplete, or not well architected.  
> **Last updated:** 2026-02-07 (Sprint 1 fixes applied)

---

## 1. Qwen3-Omni / Candle Pipeline (rust-perf, rust-omni)

### 1.1 Gaps / Not Fully Implemented

| Item                         | Location                                     | Detail                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Audio fed into Thinker**   | `full_omni_pipeline.rs`, `candle_thinker.rs` | ✅ **Fixed (Sprint 4):** `forward_with_hidden_states_from_audio` builds `[audio_emb; token_emb]`, causal mask, truncation. Pipeline takes last position for Talker. Uses sequence concat (no cross-attention).           |
| **Talker fully implemented** | `candle_talker.rs`                           | ✅ **Sprint 3 complete:** Text decoder (20 MoE layers) + code predictor (5 dense layers) fully implemented. `forward()` runs input_proj → text_decoder → code_predictor, producing real logits `(batch, seq, 32, 2048)`. |
| **Code2Wav weight loading**  | `candle_code2wav.rs`                         | ✅ **Sprint 5:** Loads `code2wav.*` weights (codebook embed + output proj) from checkpoint. Forward uses weights when loaded, zeros otherwise. Full 8-layer decoder not yet ported.                                      |
| **E2E with real checkpoint** | Scripts / CI                                 | ✅ **CI ready:** `.github/workflows/qwen3-omni-e2e.yml` + `scripts/qwen3-omni/validate-weight-keys.ts`. Enable via `OMNI_E2E_ENABLED=true` repo var + `OMNI_MODEL_PATH` / `OMNI_TOKENIZER_PATH` secrets.                 |

### 1.2 Bugs (Fixed or Known)

| Item                               | Location                | Status                                                                                                                                                                  |
| ---------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Thinker full-checkpoint prefix** | `candle_thinker.rs`     | **Fixed:** detect `thinker.*` in weight_map and use `vb.pp("thinker")` before `vb.pp("model")`.                                                                         |
| **Empty audio**                    | `full_omni_pipeline.rs` | **Fixed:** `process_audio(&[])` returns `Ok(Vec::new())` without running pipeline.                                                                                      |
| **Config mismatches**              | `candle_talker.rs`      | ✅ **Fixed (Sprint 1):** `accept_hidden_layer` 24→18, `num_code_groups` 16→32, `num_experts_per_tok` 6→8, `shared_expert_intermediate_size` 768→0 to match HF defaults. |
| **Weak RNG**                       | `candle_thinker.rs`     | ✅ **Fixed (Sprint 1):** Replaced `SystemTime::now().as_nanos() % 1M` with `rand::random::<f32>()`.                                                                     |
| **extract_layer no bounds check**  | `candle_thinker.rs`     | ✅ **Fixed (Sprint 1):** Added bounds validation; returns `Err` if `extract_layer >= layers.len()`.                                                                     |
| **Hardcoded EOS token**            | `candle_thinker.rs`     | ✅ **Fixed (Sprint 1):** Named constant `QWEN3_EOS_TOKEN_ID`, tries `<\|endoftext\|>` and `[PAD]` from tokenizer vocab before fallback.                                 |

### 1.3 Testing / Validation

| Item                    | Detail                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rust-perf lib tests** | ✅ **Fixed (Sprint 1):** CI now uses `cargo check --release --lib` (compile verification) since NAPI crates can't link test binaries. Integration tests run via Node.js in Verify job. |
| **Weight loading**      | ✅ **Fixed:** `scripts/qwen3-omni/validate-weight-keys.ts` checks required prefixes (`thinker.*`, `talker.*`) and optional `code2wav.*`. Integrated into CI workflow.                  |

---

## 2. rust-omni (NAPI, OmniEngine)

### 2.1 Broken / Wiring

| Item                                       | Location                            | Detail                                                                                                                                        |
| ------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **rust-omni not in CI**                    | `.github/workflows/rust-native.yml` | ✅ **Fixed (Sprint 1):** Added to CI with path triggers, build, artifact upload, and verify steps.                                            |
| **Duplicate export in generated index.js** | `apps/rust-omni/index.js`           | ✅ **Fixed (Sprint 1):** Removed duplicate `getLibraryInfo`. `require("./apps/rust-omni")` now loads with 146 exports.                        |
| **TTS is Mock only**                       | `apps/rust-omni/src/napi.rs`        | `tts_client` is always `MockSynthesisClient`. No Cartesia/CosyVoice in rust-omni; production needs real TTS client or HTTP call to ferni-tts. |

### 2.2 Missing / Not Wired

| Item                        | Detail                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Node package**            | rust-omni has `package.json` and napi build now; root/workspace may not publish or depend on `ferni-omni` for voice agent. |
| **Voice agent integration** | No TypeScript path that uses `OmniEngine` (transcribe → generate → speak) behind a feature flag.                           |
| **E2E STT → Thinker → TTS** | No test or script that runs OmniEngine with real Whisper + Thinker + (real or mock) TTS and asserts output.                |

---

## 3. Qwen3-Omni (Rust + TypeScript only)

| Item                  | Detail                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **No Python in repo** | `apps/mlx-qwen3-omni` (Python/MLX) was removed. Inference is **Candle (Rust)** + TypeScript only.                    |
| **Weights**           | HuggingFace safetensors load directly in Rust; Thinker loader supports HF key layout (`model.thinker.text_model.*`). |
| **Mac + Linux**       | Candle runs on Metal (Mac) and CPU (Linux/GCE). vLLM optional for multi-GPU.                                         |

---

## 4. ONNX (Tool Router / FTIS)

| Item                                    | Location                          | Detail                                                                                                                                                 |
| --------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Core ML on Mac**                      | `ort` crate with `coreml` feature | On Linux/GCE, Core ML not used; CPU only. Embedded-weight ONNX needed for Core ML on Mac (current V7 models use external `.onnx_data` → CPU fallback). |
| **No duplicate fix in rust-omni index** | Generated `index.js`              | ✅ **Fixed (Sprint 1):** Manual fix applied. Note: napi-rs codegen may re-introduce on re-generate; consider post-build de-dupe script.                |

---

## 5. TypeScript / Voice Agent (src/)

### 5.1 Technical Debt (from TECHNICAL-DEBT-TRACKER.md)

| Priority      | Count          | Examples                                                                                                                                                                         |
| ------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH**      | 5              | Migration TODOs: cognitive-persistence, cognitive-memory, learned-memories → unified-memory-service; entity store migration; post-migration cleanup.                             |
| **MEDIUM**    | 8              | Pagination not implemented (memories); missing complexity/urgency/audio params in tool orchestrator; no batched inference in router; async task processing not truly async; etc. |
| **LOW**       | 25+ test skips | Many tests skipped or deferred.                                                                                                                                                  |
| **Threshold** | ~48 `as any`   | Quality gate tracks `as any`; should stay under threshold.                                                                                                                       |

### 5.2 Clean Code / Architecture

| Item               | Detail                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| **`as any` usage** | Dozens of files use `as any`; improves over time via quality check.                     |
| **Console usage**  | ~1000+ references; standard is `createLogger()`; pre-commit/CI may allow limited count. |
| **Large files**    | Some modules >500 lines; codebase standards prefer splitting.                           |

---

## 6. CI / Build / Deploy

| Item                                 | Detail                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rust-omni not in rust-native.yml** | ✅ **Fixed (Sprint 1):** Added to CI with path triggers, build steps, artifact uploads, and verify step.                                                |
| **rust-perf tests**                  | ✅ **Fixed (Sprint 1):** CI now uses `cargo check --release --lib` for all NAPI crates; integration verification via Node.js smoke tests in Verify job. |

---

## 7. iOS / UniFFI

| Item                       | Detail                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| **FerniOmniService.swift** | **Stub only** (returns empty string / empty array). No UniFFI .udl, no `uniffi` feature, no iOS build. |
| **Q4_K / iOS runbook**     | No script or doc for “quantize Thinker to Q4_K” or “build for aarch64-apple-ios”.                      |

---

## 8. MCP / Ferni CLI

| Item                    | Detail                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| **.mcp.json path**      | **Fixed:** was `./scripts/mcp/ferni-mcp-server.ts`; now `./apps/cli/src/mcp/ferni-mcp-server.ts`.            |
| **request_voice_input** | MCP queues question but does not block for voice response; “full implementation would wait for voice input.” |

---

## 9. Summary Tables

### By severity

| Severity              | Area                   | Items                                                                                                     |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **Critical / Broken** | rust-omni CI, TTS Mock | rust-omni not in CI; OmniEngine TTS is Mock only.                                                         |
| **Gaps / Incomplete** | Candle Omni            | Audio→Thinker not wired; Talker/Code2Wav stubs; E2E with real checkpoint not automated.                   |
| **Wiring**            | Node, voice agent      | No voice-agent use of OmniEngine; duplicate getLibraryInfo in index.js (workaround: load .node directly). |
| **Debt / Quality**    | TypeScript             | Migration TODOs, `as any`, pagination, incomplete features (see TECHNICAL-DEBT-TRACKER).                  |
| **Stubs / Future**    | MLX, iOS               | MLX encoders/Talker stubs; iOS FerniOmniService stub, no UniFFI.                                          |

### By area

| Area            | Issues              | Bugs                   | Gaps                                 | Wiring                    | Clean / Arch                |
| --------------- | ------------------- | ---------------------- | ------------------------------------ | ------------------------- | --------------------------- |
| **Candle Omni** | -                   | Thinker prefix (fixed) | Audio→Thinker; Talker/Code2Wav stubs | -                         | -                           |
| **rust-omni**   | Not in CI; TTS Mock | -                      | E2E, Node pkg, voice integration     | getLibraryInfo duplicate  | -                           |
| **MLX**         | -                   | -                      | Encoders/Talker stubs                | -                         | -                           |
| **ONNX**        | -                   | -                      | Core ML needs embedded weights       | -                         | -                           |
| **TypeScript**  | -                   | -                      | Pagination, params, batching         | -                         | `as any`, migrations, skips |
| **CI**          | rust-omni missing   | -                      | -                                    | Add rust-omni to workflow | -                           |
| **iOS**         | -                   | -                      | UniFFI, Q4_K runbook                 | -                         | Stub only                   |

---

## 10. References

- **Candle Omni audit:** `docs/architecture/QWEN3-OMNI-CANDLE-AUDIT.md`
- **Rust Omni stack audit:** `docs/architecture/RUST-OMNI-STACK-AUDIT.md`
- **Technical debt:** `src/docs/TECHNICAL-DEBT-TRACKER.md`
- **MLX/ONNX/GCE:** `docs/architecture/MLX-ONNX-CANDLE-LOCAL-GCE.md`
- **ONNX Apple:** `docs/guides/ONNX-APPLE-GPU-BUILD.md`
