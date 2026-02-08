# Audit: What We Missed / Got Wrong / Failed to Test or Prove E2E

After the mlx-rs 0.25 API alignment (plan `fix_mlx-rs_rust_compile_a4ced9d0`), this doc captures gaps in testing, validation, and e2e proof.

---

## 1. Tests (fixed)

- **Conversion test** used `Array::from_float(1.0)` (old API). mlx-rs 0.25 uses `Array::from_f32(val)`.
- **Fix applied:** `conversion.rs` tests updated to `Array::from_f32(1.0)` / `Array::from_f32(2.0)`.
- **Status:** `cargo test test_map_weight_keys` passes.

---

## 2. What we did not run / validate

| Gap | Description | Recommendation |
|-----|-------------|----------------|
| **Release build** | `cargo build --release --features server` was started but timed out; not confirmed complete. | Run locally: `cargo build --release --features server` and confirm binary is produced. |
| **All tests** | Only `test_map_weight_keys` was run. No full `cargo test` run in CI. | Run `cargo test` (and add to CI if this crate is in scope). |
| **E2E pipeline** | No run with a real model: load, transcribe, synthesize, process_audio. | Add a manual or integration test: load a small/test model dir, call `transcribe`, `synthesize`, `process_audio` and assert no panic / reasonable output shape. |
| **Server E2E** | Server binary was not started or hit with HTTP. | Run `mlx-omni-server --model /path/to/model --port 8800`, then `curl localhost:8800/health` and `POST /v1/chat/completions`. |
| **CI for this crate** | No workflow references `rust-mlx-omni`; CI does not run check/test here. | Add a job (e.g. in `ci.yml`) that runs `cargo check` and `cargo test` for `apps/rust-mlx-omni`. |

---

## 3. Error type consistency (audited, OK)

- Pipeline returns `anyhow::Result`; internals use `Result<_, mlx_rs::error::Exception>`.
- We added `.map_err(|e| anyhow::anyhow!("...", e))` for `mel::mel_spectrogram` and `code2wav.forward`.
- Other `?` in pipeline (e.g. `audio_encoder.forward`, `talker.forward`, `thinker.forward_*`) rely on `Exception` being convertible to `anyhow::Error` (e.g. via `std::error::Error`). `cargo check` passes, so the conversion is valid.

---

## 4. Parameter loading (not proven)

- `#[param]` was removed from `Option<…>` and raw `Array`; learnable arrays use `Param<Array>` (e.g. SwitchLinear, SinusoidalPositionEmbedding).
- **Risk:** Safetensors loading might not find or fill those params if key names or structure changed.
- **Recommendation:** E2E load of a real (or minimal) safetensors model and spot-check that key params (e.g. thinker/talker/code2wav) are non-zero after load.

---

## 5. Numerical / API assumptions (not validated)

- **Mel:** `ops::pad(..., None, None)`, `ops::maximum`, `Array::repeat_axis::<f32>`, etc. — correct by API usage but not checked against a known-good mel output.
- **SDPA mask:** `Option<ScaledDotProductAttentionMask>`, single-arg `scaled_dot_product_attention` — matches mlx-rs 0.25; behavior (e.g. causal masking) not tested.
- **Indexing:** `indexing::argmax_axis`, `take_axis`, `squeeze_axes` — used consistently; no unit tests on shapes or values.

---

## 6. Summary

- **Fixed:** Conversion test API (`from_float` → `from_f32`); test passes.
- **Still missing:** Confirmed release build, full test run in CI, E2E pipeline run with a model, server E2E, CI for this crate, and validation of parameter loading and numerical behavior.
