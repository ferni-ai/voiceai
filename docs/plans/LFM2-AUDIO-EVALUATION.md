# LFM2-Audio-1.5B Evaluation (Sub-100ms STS)

**Purpose:** Evaluate Liquid AI’s LFM2-Audio-1.5B as a path to sub-100ms speech-to-speech (Phase C of the Fastest STS roadmap).

---

## Model Summary

| Property | Value |
|----------|--------|
| **HuggingFace** | [LiquidAI/LFM2-Audio-1.5B](https://huggingface.co/LiquidAI/LFM2-Audio-1.5B) |
| **Parameters** | 1.5B (1.2B backbone + 115M FastConformer encoder) |
| **Audio codec** | Mimi (8 codebooks, 24 kHz) — same family as Moshi/Kyutai |
| **Context** | 32,768 tokens |
| **License** | LFM Open License v1.0 |
| **Format** | Safetensors (PyTorch); [LFM2-Audio-1.5B-GGUF](https://huggingface.co/LiquidAI/LFM2-Audio-1.5B-GGUF) for CPU/quantized |

---

## Latency & Quality

- **Claimed:** Sub-100ms suitable for real-time conversational STS (interleaved generation).
- **VoiceBench (audio input):** Overall 56.78 (vs Moshi 7B 29.51, Qwen2.5-Omni-3B 63.57).
- **ASR:** WER on par with Whisper-large-v3; supports audio-in/audio-out and text-in/audio-out.
- **Modes:** Interleaved (real-time STS) and sequential (ASR/TTS with modality switching).

---

## Relevance to Ferni

- **Mimi codec:** Same Kyutai Mimi as in our Kyutai bridge; we already have Mimi encode/decode in Candle (moshi crate).
- **Size:** 1.5B fits smaller GPUs or aggressive CPU/GGUF deployment.
- **Single model:** End-to-end audio↔audio; no separate STT/LLM/TTS hops for the STS path.

---

## Port to Candle Feasibility

| Component | Current (PyTorch) | Candle / Ferni |
|-----------|-------------------|----------------|
| Mimi | Kyutai Mimi (shipped in liquid-audio) | Already in use (moshi crate, Kyutai bridge) |
| Backbone | LFM2-1.2B | Would need LFM2 graph port + safetensors mapping |
| Audio encoder | FastConformer (NeMo/canary-180m-flash) | No Candle FastConformer; port or alternative encoder |
| RQ-Transformer (audio out) | PyTorch | Similar to existing talker/code-predictor ports (e.g. Qwen3-Omni) |

**Assessment:** Non-trivial but aligned with our stack. Main work: LFM2 backbone + FastConformer encoder in Candle; RQ-Transformer and Mimi decode are closer to existing Qwen3-Omni / Kyutai pipeline work. No requirement to complete a full port for this evaluation.

---

## Follow-ups

1. **Run PyTorch baseline:** Install `liquid-audio`, run `liquid-audio-demo` or multi-turn script, measure first-token and full-turn latency on target hardware.
2. **Compare to Moshi/Qwen3-Omni:** Same test set, compare latency (and optionally quality) vs Kyutai bridge and Qwen3-Omni full pipeline.
3. **Candle port (optional):** If sub-100ms is validated and product-critical, prioritize LFM2 backbone + FastConformer port; reuse Mimi and RQ-Transformer patterns from existing Candle code.

---

## References

- [LFM2-Audio-1.5B](https://huggingface.co/LiquidAI/LFM2-Audio-1.5B) (HuggingFace)
- [LFM2-Audio blog](https://www.liquid.ai/blog/lfm2-audio-an-end-to-end-audio-foundation-model)
- [liquid-audio](https://github.com/Liquid4All/liquid-audio) (Python package)
- Fastest STS roadmap (Phase C) — see strategic plan for sub-200ms STS options (Moshi full-duplex, Qwen3-Omni pipeline, LFM2-Audio)
