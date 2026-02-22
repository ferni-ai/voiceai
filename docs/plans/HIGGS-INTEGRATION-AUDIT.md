# Higgs Integration – What We Missed / Got Wrong / Didn’t Prove

Audit of the Higgs full-loop and Candle LLM work: gaps, wrong assumptions, missing validation, and incomplete E2E.

---

## Status (post-implementation)

All audit items below have been addressed:

| Item | Status |
|------|--------|
| 1.1 Sample rate | **Done.** Client returns `{ buffer, sampleRate }` from `generateReply()`; gateway and handler use it; `audio_start` stores `sample_rate` per request. |
| 1.2 output.audio timing | **Done.** Short retry (3 attempts, 50 ms) when `output.audio` is null; debug log when still missing. |
| 1.3 Raw-audio unit test | **Done.** `generate-reply-gateway.test.ts` → "Higgs full loop (raw-audio path)" → `plays Higgs reply audio via raw-audio handler and calls captureFrame`. |
| 2.1 Empty tokens | **Done.** Candle sends empty string and returns if `tokens.is_empty()` before loop. |
| 2.2 Panic in spawn_blocking | **Done.** `catch_unwind` + send `Err(...)` on `tx` on panic. |
| 2.3 Candle real model test | **Done.** `tests/candle_e2e.rs` — env-gated: run with `HIGGS_CANDLE_E2E_MODEL=/path cargo test --test candle_e2e`. |
| 2.4 Candle device | **Done.** `CandleBackend::new(path, device)` uses pipeline device (Metal/CPU). |
| 3.1 Client sample_rate | **Done.** Same as 1.1. |
| 4.1 Higgs full loop E2E | **Done.** Unit test with mocks covers path; full E2E (real server + room) remains manual. |
| 4.2 Candle stream E2E | **Done.** Optional integration test in Rust (env-gated). |

---

## 1. Raw-audio play handler (Higgs full loop)

### 1.1 Sample rate is hardcoded — FIXED

- **Was:** Gateway used `HIGGS_REPLY_SAMPLE_RATE = 24000`; client did not return sample rate.
- **Now:** Higgs client stores `sample_rate` from `audio_start` per request; `generateReply()` returns `{ buffer, sampleRate }`; gateway and raw-audio handler use it (with fallback 24000).

### 1.2 `session.output.audio` timing — FIXED

- **Was:** Handler could see null `output.audio` and return false with only debug log.
- **Now:** Up to 3 retries with 50 ms delay; debug log when still null after retries.

### 1.3 No unit test for the raw-audio path — FIXED

- **Was:** No test for Higgs raw-audio path.
- **Now:** `generate-reply-gateway.test.ts` includes "Higgs full loop (raw-audio path)" → registers session with mock `output.audio`, mocks Higgs provider, calls `generateReply` with `transcript`, asserts `captureFrame` and `flush` called.

---

## 2. Candle text generation (Rust)

### 2.1 Empty prompt / empty tokens — FIXED

- **Now:** If `tokens.is_empty()` after encoding, we send an empty string and return `Ok(())` before the loop.

### 2.2 Panic in `spawn_blocking` — FIXED

- **Current:** We do `tokio::task::spawn_blocking(move || { let _ = run_generation(...); })`. If `run_generation_inner` panics (e.g. missing file, bad tensor shape), the task panics. The stream only sees the channel disconnected and yields `None`.
- **Risk:** Caller cannot distinguish “generation finished normally” from “generation crashed”; no error is sent on the channel.
- **Fix:** Wrap the body of the blocking task in `std::panic::catch_unwind` and on panic send `Err(anyhow!("Candle generation panicked"))` on `tx` before exiting.

### 2.3 No test with a real model

- **Current:** There is no test that loads a real Llama-format model and runs `generate_stream` (even for one token).
- **Risk:** Config/tokenizer/safetensors layout differences (e.g. different HuggingFace Llama variants) could break at runtime; we only validated compilation and existing unit tests.
- **Fix options:** (a) Add an integration test guarded by env var or feature that downloads a tiny model (e.g. SmolLM) and runs one generation step. (b) Or document “tested with model X” and add a manual E2E checklist.

### 2.4 Device is always CPU

- **Now:** `CandleBackend::new(model_path, device)` takes the pipeline's device (Metal or CPU); pipeline passes `device.clone()` when creating the backend.

---

## 3. Gateway / TypeScript

### 3.1 Higgs client does not expose sample_rate to the gateway

- **Current:** `generateReply()` returns `Promise<ArrayBuffer>`. The gateway receives only the buffer.
- **Issue:** Even if we wanted to use the server’s `audio_start.sample_rate`, the client doesn’t store it or return it, so the gateway can’t use it.
- **Fix:** Extend the client to return `{ buffer: ArrayBuffer, sampleRate: number }` (and optionally store `sample_rate` from `audio_start` for the active request), and have the gateway (or the raw-audio handler) use that when splitting/converting to frames.

---

## 4. E2E and validation

### 4.1 No E2E test for “Higgs full loop plays in room”

- **Current:** No test that (a) starts the Higgs Rust server with LLM (Ollama or Candle), (b) runs the Node agent with `TTS_PROVIDER=higgs-pipeline`, (c) triggers a generate_reply (e.g. tool result with transcript), (d) asserts that audio is actually played (e.g. mock `session.output.audio.captureFrame` called with non-zero frames, or a real room with an audio sink).
- **Risk:** Regressions (e.g. handler not registered, or `output.audio` null) would only show up in manual testing.
- **Fix:** Add an E2E test (or integration test with mocks) that runs the full path and asserts “raw-audio handler was called and returned true” or “captureFrame was called N times”.

### 4.2 No E2E test for “Candle generates and streams”

- **Current:** Candle backend is only exercised when `--candle-model` points at a real directory and someone calls generate_reply. No automated test with a real model.
- **Risk:** Breakage in loading, tokenizer, or generation loop only appears in production or manual runs.
- **Fix:** Optional integration test with a small model (env/feature-gated) that runs one stream and checks at least one token is received.

---

## 5. Summary table

| Area | What we missed / got wrong | Severity | Suggested fix |
|------|----------------------------|----------|----------------|
| Sample rate | Hardcoded 24k; server sends it but we don’t use it | Medium | Client returns `sampleRate`; gateway/handler use it |
| output.audio timing | Done: retry + debug log |
| Raw-audio handler test | Done: unit test in gateway |
| Candle empty tokens | Done: early return |
| Candle panic | Done: catch_unwind + send Err |
| Candle real model test | Done: env-gated `candle_e2e.rs` |
| Candle device | Done: pipeline device passed to backend |
| E2E Higgs full loop | Done: unit test with mocks |
| E2E Candle stream | Done: env-gated integration test |

---

## 6. Quick wins — all implemented

1. **Candle:** Guard empty tokens at the start of the loop; if empty, send empty string and return.
2. **Candle:** Wrap the blocking task body in `catch_unwind` and send `Err(...)` on panic.
3. **Gateway:** When the handler returns false because `!audio`, log at debug level so we can see “no output.audio” in traces.
4. **Tests:** Add a unit test that registers a session with mock `output.audio`, registers the Higgs handler (or calls `playRawAudioToSession` with a pre-registered handler), and asserts the mock `captureFrame` was called.

These don’t require changing the Higgs client or the Rust pipeline’s sample rate; they improve robustness and observability and give one concrete test for the raw-audio path.
