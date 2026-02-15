# LFM2-Audio Candle Port Plan (Sub-100ms STS)

**Goal:** Port Liquid AI LFM2-Audio-1.5B to Candle so we can run sub-100ms speech-to-speech in Rust. Reuse Mimi codec from the Kyutai/moshi stack.

---

## Components

| Component | Source | Candle status | Effort |
|-----------|--------|---------------|--------|
| **FastConformer encoder** | NeMo/canary-180m-flash style | No Candle impl; port required | Main |
| **LFM2 backbone** | LFM2-1.2B (hybrid conv+attention) | No Candle impl; port required | Main |
| **Mimi codec** | Kyutai Mimi (8 codebooks, 24 kHz) | In use (moshi crate, kyutai-bridge) | Reuse |
| **RQ-Transformer (audio out)** | PyTorch | Similar to Talker/Code2Wav (rust-perf) | Port |

---

## Phases

1. **Phase A – FastConformer encoder**
   - Port FastConformer from PyTorch/NeMo to Candle (conv + attention blocks, subsampling).
   - Map safetensors from LFM2-Audio-1.5B encoder weights.
   - Unit test: encode fixed PCM → feature shape matches LFM2 expectation.

2. **Phase B – LFM2 backbone**
   - Port LFM2-1.2B backbone (hybrid conv+attention) to Candle.
   - Load backbone weights from HuggingFace safetensors.
   - Unit test: forward pass from encoder output → hidden sequence.

3. **Phase C – Mimi + RQ-Transformer**
   - Reuse Mimi encode/decode from moshi crate (already in kyutai-bridge).
   - Port RQ-Transformer audio output head (similar to candle_talker / candle_code2wav).
   - Wire: encoder → backbone → RQ-Transformer → Mimi decode → PCM.

4. **Phase D – Pipeline and latency**
   - Single pipeline: PCM in → Mimi encode → FastConformer → LFM2 → RQ-Transformer → Mimi decode → PCM out.
   - Target: sub-100ms first-chunk latency on GPU.
   - Benchmark script and comparison to Moshi full-duplex / Qwen3-Omni.

---

## Repo layout

- **Plan:** `docs/plans/LFM2-AUDIO-CANDLE-PORT.md` (this file).
- **Stubs / implementation:** `apps/rust-perf/src/lfm2/`
  - `mod.rs` – module root, re-exports.
  - `fast_conformer.rs` – FastConformer encoder (port).
  - `lfm2_backbone.rs` – LFM2 backbone (port).
  - `rq_transformer.rs` – RQ-Transformer for audio output (port).
  - `pipeline.rs` – End-to-end STS pipeline (Mimi + encoder + backbone + RQ-Transformer).

---

## References

- [LFM2-Audio-1.5B](https://huggingface.co/LiquidAI/LFM2-Audio-1.5B)
- [LFM2-Audio evaluation](LFM2-AUDIO-EVALUATION.md)
- Existing Candle pieces: `candle_audio_encoder.rs`, `candle_talker.rs`, `candle_code2wav.rs` (apps/rust-perf); Mimi in moshi crate / kyutai-bridge.
