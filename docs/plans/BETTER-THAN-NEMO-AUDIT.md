# Better-Than-NeMo: Implementation, Validation, Audit & Checklist

**Goal:** Ensure our voice pipeline is **actually better** than [NVIDIA NeMo SpeechLM2](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/speechlm2/models.html) (DuplexEARTTS, SALM, DuplexS2S) on the dimensions we care about: latency, full-duplex behavior, quality, and deployability. This doc lists what must be **fully implemented**, **validated**, **audited**, and **checked** before claiming we exceed NeMo.

---

## 1. NeMo baseline (what we’re comparing against)

| NeMo component | What it does | NeMo strength we must match or beat |
|----------------|--------------|-------------------------------------|
| **DuplexEARTTS** | Streaming TTS, RVQ codec, interruption-aware (BOS/EOS, gated fusion) | Low-latency streaming TTS; TTFA in the tens of ms in ideal conditions |
| **SALM** | Speech → embeddings → LLM → text | Speech-augmented language understanding |
| **DuplexS2SModel** | Full S2S: perception + LLM + codec; single model | Unified trainable S2S pipeline |
| **DuplexS2SSpeechDecoderModel** | High-quality speech decoder | Natural-sounding output |
| **Pretrained checkpoints** | From-pretrained usage | Production-ready quality out of the box |
| **Scaling / training** | FSDP, TP, SP, config-driven | Training at scale |

We do **not** need to beat NeMo on “single unified trainable S2S” or “research scaling.” We need to beat it on:

- **Latency** (TTFA, TTS TTFB, E2E user-stop → first audio)
- **Full-duplex UX** (backchannels over agent speech, turn-yield, no collisions)
- **Quality** (MOS or subjective parity; persona consistency)
- **Deployability** (single binary, no Python, predictable resources)

---

## 2. Implementation – what must be fully implemented

Items that are partial, placeholder, or optional today and must be **complete** before we claim “better than NeMo.”

### 2.1 Rust Higgs pipeline

| Item | Status | Action |
|------|--------|--------|
| **Parakeet STT** | Broken with `--all-features` (API drift: `transcribe_samples` vs `transcribe`, `Vec` vs `&[f32]`) | Fix `apps/rust-higgs-pipeline/src/stt/parakeet.rs` to match current parakeet-rs API, or gate Parakeet and document “Higgs STT requires Parakeet 0.3.x” and pin. |
| **Audio encoder** | Real ONNX; optional; needs model path | Document `AUDIO_ENCODER_MODEL_PATH`; run integration test with a real Whisper encoder ONNX so 768-dim embeddings are validated. |
| **Dynamics ONNX** | Backchannel + turn models optional; heuristic fallback | If we claim “neural turn prediction”: ship or document where to get ONNX models; add a test that runs with real models and checks output shape. |
| **Fish Speech** | Real ONNX encoder/decoder; no real tokenizer; codec encoder optional | For “voice cloning first-class”: add BPE tokenizer path or document “byte-level placeholder”; validate with real Fish Speech ONNX exports or mark “experimental.” |
| **Speaker embeddings** | Wired; bank optional | Ensure at least one persona has a `.safetensors` in `SPEAKER_EMBEDDINGS_DIR` in a test or doc so conditioning path is exercised. |
| **Mixer drain loop** | Implemented for full-duplex | Add a test or script that sends TTS + backchannel and asserts mixed PCM output shape and non-zero samples. |
| **TurnYield** | Sent from Rust; handled in TS | E2E test: connect to Higgs, trigger turn completion path, assert `turn_yield` received (or transcript_final → turn_yield). |

### 2.2 TypeScript / agent side

| Item | Status | Action |
|------|--------|--------|
| **Provider selection** | Higgs when `HIGGS_PIPELINE_URL` or `TTS_PROVIDER=higgs-pipeline` | Document in runbooks; ensure GCE/deploy sets `HIGGS_PIPELINE_URL` when Higgs is the intended TTS. |
| **E2E latency tracker** | Tracks TTS latency; message says “Cartesia is slow” | Make message provider-agnostic (“TTS latency > 500ms”) and tag timeline with `ttsProvider: 'higgs-pipeline' | 'cartesia' | ...` so we can compare by provider. |
| **Turn profiler** | `ttsTtfbMs` target < 150 ms | Ensure Higgs path reports into the same profiler and that we have a dashboard or export (e.g. `/api/performance/turns`) that includes provider name. |
| **generate_reply with Higgs** | Uses gateway; raw audio play registered when Higgs | Audit: when `TTS_PROVIDER=higgs-pipeline`, no code path falls back to Cartesia for the same session; reconnection and play use Higgs. |

### 2.3 Documentation and ops

| Item | Action |
|------|--------|
| **Runbook** | “Voice pipeline: Higgs vs Cartesia” – when to use which, how to switch, how to read latency metrics. |
| **Env matrix** | Table: `HIGGS_PIPELINE_URL`, `TTS_PROVIDER`, `USE_HIGGS_STT_PRIMARY`, etc., and resulting behavior (STT source, TTS source, biomarkers). |
| **SOTA plan** | If the SOTA plan (mixer, encoder, dynamics, speaker, Fish) is “done,” mark it and move remaining work to “tuning” or “validation” in this doc. |

---

## 3. Validation – what must be measured and benchmarked

To claim we’re better than NeMo we need **numbers** that we can compare to published or measured NeMo numbers.

### 3.1 Latency (required)

| Metric | Definition | Target (better than human / NeMo) | How to measure |
|--------|------------|-----------------------------------|----------------|
| **TTS TTFB** | Synthesize request → first PCM chunk | < 150 ms (gateway target); pipeline sub-200 ms | Timestamp in Higgs provider when request sent; timestamp when first binary chunk received; log or export to turn profiler / E2E tracker. |
| **STT first interim** | First PCM of user speech → first interim transcript | < 150 ms | Rust: time from first frame to first `transcript_partial`; TS: log delta. |
| **STT final** | End of user utterance → final transcript | < 300 ms | Rust/TS: utterance end timestamp to `transcript_final`. |
| **E2E time-to-first-audio** | User stop-speaking → first TTS audio at client | < 500 ms (stretch < 400 ms) | E2E latency tracker: `userSpeechEnded` → `ttsFirstAudio` (or `audioStarted`). |
| **Full-duplex** | Backchannel overlay during TTS | No extra latency; mixed stream correct | Manual or automated: play TTS + trigger backchannel; assert mixer output contains both and timing is plausible. |

**Validation deliverables:**

- **Benchmark script** (e.g. `scripts/higgs/benchmark-latency.ts` or Rust binary): run N synthesizes, report p50/p95 TTS TTFB; run N STT finalizations, report p50/p95; optionally drive a full E2E turn and report E2E.
- **CI or nightly:** Run benchmark on main (or on release tag); fail or warn if p95 regresses above threshold (e.g. TTS TTFB > 250 ms, E2E > 700 ms).
- **Dashboard or export:** Turn profiler + E2E tracker export by provider (e.g. `higgs-pipeline` vs `cartesia`) so we can compare in production or staging.

### 3.2 Quality (required for “better”)

| Metric | Definition | Target | How to measure |
|--------|------------|--------|----------------|
| **TTS quality** | Naturalness, clarity, persona match | Parity or better vs Cartesia (and vs NeMo if we have NeMo samples) | Subjective MOS on a fixed test set (same sentences, Higgs vs Cartesia); or use a proxy (e.g. similarity to reference, if available). |
| **STT WER** | Word error rate on test corpus | Match or beat Whisper/NeMo on same corpus | Run Higgs STT (Parakeet/Whisper) on LibriSpeech or internal corpus; compute WER; compare to baseline. |
| **Interruption / barge-in** | User can interrupt; agent stops cleanly | No glitches; no long tail after interrupt | Manual tests: interrupt at 0.5 s, 1 s, 2 s; check for artifacts and latency to stop. |

**Validation deliverables:**

- **Test set:** Fixed list of sentences (and optionally audio files for STT). Store in repo or artifact.
- **MOS or A/B:** At least one subjective evaluation (internal or crowd) Higgs vs Cartesia on the same set; document result (e.g. “Higgs within 0.2 MOS of Cartesia” or “Higgs preferred on X% of samples”).
- **WER report:** Script that runs STT on test set and outputs WER; run periodically or on release.

### 3.3 Full-duplex and behavior

| Check | Action |
|-------|--------|
| **Backchannel timing** | With dynamics ONNX or heuristics: verify backchannels fire during user speech (or at pauses) and appear in mixed stream; no double-speak. |
| **TurnYield** | Verify TS receives `turn_yield` when Rust sends it; optional: use it to start LLM earlier (speculative) or to show “user done” in UI. |
| **Mixer** | In full-duplex mode, TTS and backchannel both go through mixer; client gets one stream; verify in test or manual run. |

---

## 4. Audit – what must be audited

### 4.1 Code and security

- **Rust pipeline:** No unsafe except where necessary (e.g. safetensors mmap); no unchecked user input into command execution or file paths. Dependency audit: `cargo audit` clean.
- **TypeScript gateway and provider:** No credential or PII in logs; WebSocket URL from env; no eval or dynamic code execution on server messages.
- **Secrets:** No `HIGGS_PIPELINE_URL` or API keys in repo; runbooks reference env vars only.

### 4.2 Architecture and consistency

- **Single source of truth for “who does TTS”:** All paths (generate_reply, phrase streaming, batch synthesize) use `getTTSProvider()` (or equivalent) so that when `HIGGS_PIPELINE_URL` is set, no code path silently uses Cartesia for the same session.
- **STT source:** When Higgs is TTS provider, document whether STT is always Higgs (session STT) or can be Gemini/OpenAI; avoid duplicate or conflicting transcript sources.
- **Latency budget:** Document budget (e.g. STT 50 ms + LLM 200 ms + TTS 150 ms + 100 ms buffer = 500 ms) and where we measure each segment; ensure turn profiler / E2E tracker align with this.

### 4.3 Comparison vs NeMo (feature and behavior)

- **Feature parity for our use case:** Table: “We need X, Y, Z. NeMo has X, Y. We have X, Y, Z (plus backchannels, turn-yield, mixer).” So we’re not missing a must-have that NeMo has.
- **Where we intentionally differ:** e.g. “We use a separate LLM (Gemini/OpenAI) and don’t train S2S; we optimize for deployability and full-duplex UX, not single-model training.” Document so “better than NeMo” is scoped to latency, full-duplex, quality, deployability—not to research flexibility.

---

## 5. Pre-release / “better than NeMo” checklist

Before claiming we’re better than NeMo (e.g. in a blog post or sales slide), complete:

- [ ] **Implementation:** Parakeet fixed or gated; at least one of audio encoder, dynamics ONNX, or Fish Speech validated with real models (or explicitly marked experimental). Speaker path and mixer path tested.
- [ ] **Validation:** TTS TTFB and E2E measured and logged by provider; benchmark script runs and reports p50/p95; MOS or A/B vs Cartesia done; STT WER on test set reported.
- [ ] **Audit:** Code/security and architecture audits done; comparison table vs NeMo filled in and scoped.
- [ ] **Docs:** Runbook for Higgs vs Cartesia; env matrix; this doc updated with “Completed on &lt;date&gt;” and any remaining TODOs.
- [ ] **Regression:** CI or nightly runs latency benchmark; alert on regression (e.g. TTS TTFB or E2E above threshold).

After that, we can say we are **better than NeMo** on: latency (with numbers), full-duplex behavior (backchannels + mixer + turn-yield), and deployability (single Rust binary, no Python); and **on par or better** on quality (with MOS/WER evidence). We do **not** claim to beat NeMo on single-model S2S training or research scaling—only on the dimensions above.
