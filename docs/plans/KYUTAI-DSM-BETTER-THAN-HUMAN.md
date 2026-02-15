# Kyutai DSM: Better Than Human Quality & E2E Latency

**Goal:** Port Delayed Streams Modeling (DSM) STT + TTS to the Rust/Candle bridge and tune for **better-than-human** quality and end-to-end latency. Same protocol as the Python bridge; no Python, no MLX crash.

---

## 1. Better-than-human targets

Research: human turn-taking has **median response latency &lt; 300 ms** and gaps ~200 ms. We have three hops (STT → LLM → TTS), so we optimize each stage and the full pipeline.

| Metric | Human / baseline | Our target (better than human) | How we measure |
|--------|-------------------|---------------------------------|-----------------|
| **STT first interim** | Perception “instant” ~100–150 ms | **&lt; 150 ms** from speech start to first interim transcript | Time from first PCM chunk to first JSON `{ is_final: false }` |
| **STT final** | — | **&lt; 300 ms** from end of utterance to final transcript | Time from last PCM of utterance to `{ is_final: true }` |
| **TTS first byte (TTFB)** | Kyutai DSM ~220 ms | **&lt; 250 ms** from “synthesize” request to first PCM chunk | Request timestamp → first binary chunk |
| **E2E to first audio** | Turn-taking ~200–300 ms | **&lt; 500 ms** from user stop-speaking to first TTS audio | STT final → LLM first token → TTS first chunk; we measure bridge contribution (STT + TTS) and document full E2E with agent |
| **Quality** | Match Python/MLX bridge | **Parity or better**: WER (STT), MOS / similarity (TTS Ferni voice) | Compare Rust bridge vs Python bridge on same corpus |

**Design principle:** Streaming everywhere. Interim STT and streaming TTS so the user hears the reply as soon as the first tokens are ready; no “wait for full sentence” delay.

---

## 2. Pipeline and where we optimize

```
User speech → [STT bridge] → transcript → [LLM] → text → [TTS bridge] → audio → user
                ↑                              ↑
           < 150 ms interim              < 250 ms TTFB
           < 300 ms final
```

- **Rust bridge (this plan):** STT and TTS latency + quality. We port DSM to Candle and tune chunk sizes, batch sizes, and streaming so we hit the targets above.
- **Agent/LLM:** E2E also depends on LLM TTFT and agent piping; we document “bridge-only” vs “full E2E” and work with agent team so total “user stops → first audio” stays **&lt; 500 ms** when possible.

---

## 3. Implementation plan (ported DSM in Rust)

| Phase | What | Outcome |
|-------|------|---------|
| **Phase 1 (done)** | Mock STT/TTS WebSocket server, same protocol as Python | Voice agent can talk to Rust bridge; protocol validated. |
| **Phase 2a** | Port DSM **STT** to Candle (Lm + Mimi + tokenizer) | Real streaming STT: 16 kHz PCM in → JSON `{ text, is_final }` out; measure first-interim and final latency. |
| **Phase 2b** | Port DSM **TTS** to Candle (TTSModel + Mimi decode) | Real streaming TTS: text + voice_id in → 24 kHz PCM out; measure TTFB and chunk latency. |
| **Phase 2c** | **Latency tuning** | Chunk sizes (e.g. 1280 samples @ 16k → 1920 @ 24k for STT; 240-sample TTS chunks), single inference at a time or small pool, optional CPU fallback; hit &lt; 150 ms / &lt; 250 ms / &lt; 300 ms targets. |
| **Phase 2d** | **Quality validation** | Same test set for Rust vs Python bridge: WER (STT), A/B listen (TTS). Document parity or better. |
| **Phase 3** | Docs, CLI (`ferni dev kyutai-bridge`), optional E2E latency script | Devs can run Rust bridge and see “better than human” metrics. |
| **Phase 4 (optional)** | GCE/CUDA build and deploy | Same binary or variant on GCE with Candle CUDA for production. |

---

## 4. Technical notes (DSM port)

- **STT:** Same architecture as Python: Lm (decoder-only LM), Mimi audio tokenizer, SentencePiece text tokenizer. Input 24 kHz float (we resample 16 kHz → 24 kHz); block size 1920 samples per step; streaming via repeated `encode_step` + `step`. References: `scripts/kyutai/mlx-bridge-server.py` (`_load_stt_model`, `_run_stt_on_buffer`), Kyutai `stt-1b-en_fr` (MLX/PyTorch); Candle port from PyTorch/MLX graph and safetensors.
- **TTS:** Same as Python: TTSModel (conditioning + autoregressive decode), Mimi decode to PCM. Input: text (script) + voice embedding (safetensors); output: 24 kHz float → Int16. References: `mlx-bridge-server.py` (`_load_tts_model`, `_run_tts_sync`), Kyutai DSM TTS repos; Candle port from PyTorch/MLX.
- **Latency instrumentation:** In the bridge, record timestamps at: (1) first PCM received (STT), (2) first interim sent, (3) final sent, (4) TTS request received, (5) first TTS PCM sent. Log or expose via optional `/metrics` or structured logs for “better than human” dashboards.

---

## 5. Success criteria

- **Latency:** STT first interim &lt; 150 ms, STT final &lt; 300 ms, TTS TTFB &lt; 250 ms; E2E (bridge contribution) documented and &lt; 500 ms to first audio when combined with agent.
- **Quality:** STT WER and TTS quality (Ferni voice) at least parity with Python/MLX bridge.
- **Stability:** No Python, no MLX; single Rust binary, Metal on Mac, CUDA on GCE (Phase 4).
- **Protocol:** Unchanged; voice agent uses same `KYUTAI_STT_URL` / `KYUTAI_TTS_URL`.

---

## 6. References

- [KYUTAI-RUST-CANDLE-ROADMAP.md](KYUTAI-RUST-CANDLE-ROADMAP.md) – Candle path, Moshiko vs ported DSM
- [KYUTAI-LOCAL-TEST.md](../guides/KYUTAI-LOCAL-TEST.md) – Local bridge usage
- [VOICE-LATENCY-MAC-GCE.md](../guides/VOICE-LATENCY-MAC-GCE.md) – Where STT/LLM/TTS run
- Python bridge: `scripts/kyutai/mlx-bridge-server.py`
- Kyutai: [delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling), [stt-1b-en_fr](https://huggingface.co/kyutai/stt-1b-en_fr-mlx)
