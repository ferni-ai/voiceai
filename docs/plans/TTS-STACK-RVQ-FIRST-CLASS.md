# TTS Stack: RVQ Codec + Streaming First-Class

**Goal:** Make our in-house RVQ-based codec and streaming TTS the first-class path; keep Cartesia only as a baseline until we exceed it, then remove it.

## First-class stack (in-house)

| Component | Implementation | Where |
|-----------|----------------|-------|
| **RVQ codec** | xCodec (8 codebooks, ONNX decoder) | `apps/rust-higgs-pipeline` (decoder.rs, generation → decode_audio) |
| **Streaming TTS** | Higgs Audio V2 (delay-pattern token generation) + optional Fish Speech | Same pipeline: `generate_audio_streaming()`, sentence-level streaming in gateway |
| **Delivery** | Single mixed PCM stream (TTS + backchannels) when full-duplex | `audio_mixer.rs`, `ws_handler` mixer drain |

This stack is **first-class** in the framework when:

1. **Provider selection:** Setting `HIGGS_PIPELINE_URL` (without `TTS_PROVIDER`) selects the Higgs pipeline. Setting `TTS_PROVIDER=higgs-pipeline` explicitly also selects it. See `src/speech/tts-gateway/providers/index.ts` → `getTTSProvider()`.
2. **Gateway:** The gateway uses `synthesizeStreaming` when the provider supports it (Higgs does), so phrase-level streaming and time-to-first-audio are already wired for our stack.
3. **Voice agent:** When the pipeline is the TTS provider, the agent uses the gateway’s provider (Higgs) for TTS and can use Higgs STT; reconnection and raw-audio play are registered for Higgs.

## Cartesia: baseline only

- **Role:** Fallback when no in-house pipeline is configured or when we explicitly want external TTS.
- **Removal path:** Once our pipeline consistently meets or exceeds Cartesia on quality and latency (and we’re ready to drop the dependency), we can:
  1. Change the default in `getTTSProvider()` so that when no provider is set we require an explicit choice (e.g. `higgs-pipeline` or fail fast), **or**
  2. Make `higgs-pipeline` the default when `HIGGS_PIPELINE_URL` is set (already done) and later remove Cartesia from the fallback chain when we no longer need it.

No code path should *require* Cartesia for core behavior; it is baseline/comparison only.

## Making RVQ + streaming “first-class” in the codebase

Done or in place:

- **Provider priority:** `TTS_PROVIDER=higgs-pipeline` or `HIGGS_PIPELINE_URL` set → Higgs pipeline (see `providers/index.ts`).
- **Streaming:** Gateway uses phrase streaming when provider has `synthesizeStreaming` (Higgs pipeline implements it).
- **Terminology:** Comments in `providers/index.ts` describe the first-class stack (RVQ codec + streaming TTS) and Cartesia as baseline.

Optional next steps:

- **Metrics:** Log or expose TTFA/latency and quality metrics for the active provider so we can compare Higgs vs Cartesia and know when we exceed baseline.
- **Feature flag:** e.g. `PREFER_RVQ_TTS=true` to force higgs-pipeline when URL is set (already implied by `HIGGS_PIPELINE_URL` alone).
- **Docs:** Point deployment/runbooks at this doc and at `HIGGS-BEST-IN-CLASS-PLAN.md` for latency/quality work.

**Run on Mac (low latency):** See `apps/rust-higgs-pipeline/README.md` — section "Run on Mac (state-of-the-art, low latency)" for build, `STREAM_CHUNK_STEPS=12`, and Parakeet/Whisper model paths. Optional TTS latency benchmark: `npx tsx scripts/higgs/benchmark-latency.ts` with `HIGGS_PIPELINE_URL=ws://localhost:8600/ws`.

## Proving we’re better than NeMo

To **validate and claim** we’re better than [NVIDIA NeMo SpeechLM2](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/speechlm2/models.html) (DuplexEARTTS, SALM, DuplexS2S), use the full checklist in **`docs/plans/BETTER-THAN-NEMO-AUDIT.md`**: implementation completeness, latency/quality validation, code and architecture audits, and pre-release checks. That doc defines what must be implemented fully, measured, audited, and checked before we state we exceed NeMo.

## NeMo-style RVQ (future)

If we later add a NeMo DuplexEARTTS-style model (or another RVQ streaming TTS), it can plug in as a second first-class provider:

- Implement the same gateway interface (`ITTSProvider`, `synthesizeStreaming`).
- Use the same 24 kHz mono PCM contract.
- Select via `TTS_PROVIDER=nemo` (or similar); no need to change “first-class” semantics, only add another option alongside Higgs/Fish.

The abstraction (RVQ codec + streaming TTS as the preferred path) is already in place; new backends are additional implementations.
