# Kyutai Rust/Candle Path – Implementation Roadmap

**Goal:** Replace the Python/MLX Kyutai bridge with a **Rust/Candle** STT+TTS server. Same WebSocket protocol so the voice agent and `KYUTAI_*_URL` config work unchanged. No Python, no MLX crash on Mac. We commit to **ported DSM** (dedicated STT + TTS) and **better-than-human** quality and E2E latency — see [KYUTAI-DSM-BETTER-THAN-HUMAN.md](KYUTAI-DSM-BETTER-THAN-HUMAN.md).

---

## Is Rust/Candle as fast as MLX?

| Dimension | MLX (Python) | Candle (Rust) |
|-----------|--------------|----------------|
| **Mac (Metal)** | Apple-tuned, often 5–15% faster for some kernels | Candle Metal backend is solid; we already use it in `rust-perf` (Qwen3-Omni). Latency is comparable for real-time STT/TTS. |
| **GCE (CUDA)** | N/A (MLX is Apple-only) | **Candle is the standard.** We can run the same Rust binary with `candle-core` CUDA feature on GCE. |
| **Stability** | SIGSEGV on some Mac/macOS (Metal driver) | No Python/Metal crash; single Rust binary, same stack as rest of Ferni. |
| **Deploy** | Python venv, pip, MLX wheels | Single binary; no venv, no Python version matrix. |

**Bottom line:** On Mac, Candle Metal is **comparable** to MLX for this workload (STT/TTS are not the most GPU-heavy). You may give up a small percentage of peak throughput for **stability and one stack**. On GCE, Candle is **required** for GPU (CUDA); MLX doesn’t run there. So: Rust/Candle is “as fast as we need” and is the right long-term path for Mac + GCE.

---

## What we need to build

### Moshiko vs ported DSM — which is better for us?

| | **Moshiko (Candle)** | **Ported DSM (STT + TTS)** |
|--|----------------------|----------------------------|
| **What it is** | Full Moshi in Candle: one model for full-duplex speech dialogue (audio in → audio out, “Inner Monologue” for text). | Dedicated STT and TTS models (same as Python/MLX bridge): `stt-1b-en_fr` / DSM TTS, ported from PyTorch/MLX to Candle. |
| **Our pipeline** | We do **STT → LLM (Gemini) → TTS**. We don’t need one model doing full duplex; we need best-in-class **transcribe** and best-in-class **synthesize** as separate steps. | Matches our pipeline exactly: STT = “PCM → text”, TTS = “text + voice_id → PCM”. Same I/O and protocol as the current Python bridge. |
| **Fit** | Generalist; STT-only or TTS-only might be a subset of its API (if exposed at all). Optimized for dialogue, not necessarily for standalone ASR or TTS. | Purpose-built for streaming ASR (VAD, word timestamps) and streaming TTS (voice cloning, ~220 ms start latency). |
| **Effort** | Use if moshiko-candle exposes clean “transcribe” / “synthesize” APIs and quality is good. | Port DSM STT + TTS from delayed-streams-modeling (PyTorch/MLX) to Candle. More work up front; same behavior and quality as current Python bridge. |

**Recommendation:** **Ported DSM is better for our use case.** We want dedicated STT and TTS, not a single full-duplex model. The Python bridge already uses DSM (moshi_mlx STT + DSM TTS); porting those to Candle gives us the same behavior in Rust with no dependency on moshiko’s API shape. Evaluate moshiko-candle in Phase 0 only to see if it exposes STT/TTS cleanly and is good enough; if not (or if we want to match the Python bridge exactly), **port DSM to Candle** and use that in the Rust bridge.

---

### 1. Evaluation (Phase 0) – answer “can we get STT + TTS from Candle?”

| Task | What to do | Outcome |
|------|------------|---------|
| **0.1 Inspect moshiko-candle** | Clone or depend on Kyutai’s Candle Moshi code; read API and examples. | Know if we can call “transcribe PCM” (STT) and “synthesize text” (TTS) from Rust. |
| **0.2 Check Kyutai HF + repos** | Look for standalone Candle STT/TTS (e.g. `stt-1b-en_fr` Candle, DSM TTS Candle). | If moshiko is chat-only, we need standalone Candle models or a port. |
| **0.3 Decide path** | Prefer **ported DSM** for best fit. If moshiko-candle exposes STT + TTS and quality is good, we can use it to ship faster; otherwise port DSM to Candle. | Go/no-go and which repo/crate to build on. |

**References:** [moshiko-candle-q8](https://huggingface.co/kyutai/moshiko-candle-q8), [moshiko-candle-bf16](https://huggingface.co/kyutai/moshiko-candle-bf16), [delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling).

---

### 2. Rust crate (Phase 1) – Kyutai bridge server

| Deliverable | Description |
|-------------|-------------|
| **New crate** | `services/kyutai-bridge` (or `apps/kyutai-bridge`). Standalone binary; optional lib for reuse. |
| **Dependencies** | `candle-core` (Metal on Mac, CUDA on Linux when needed), `tokio`, `tokio-tungstenite` (or `axum` with WebSockets), `safetensors`, tokenizer (e.g. `sentencepiece` or HF tokenizers). |
| **Protocol** | Same as Python bridge (and current Node client): |
| | **STT:** `GET/WS` → `/api/asr-streaming`. Client sends binary PCM 16 kHz mono Int16; server sends JSON `{ "text", "is_final" }` (and optional `vad`, `is_speaking`). |
| | **TTS:** `GET/WS` → `/api/tts_streaming`. Client sends JSON `{ "text", "voice_id" }`; server sends binary PCM 24 kHz Int16 chunks, then `{ "done": true }`, then close. |
| **Config** | Ports (default 8089 STT, 8090 TTS), model paths or HF repo IDs, device (Metal/CUDA/CPU). |

**Existing patterns:** Reuse WebSocket and server patterns from `apps/rust-perf/src/bin/server.rs` (axum, tokio) and protocol details from `scripts/kyutai/mlx-bridge-server.py` and `docs/guides/KYUTAI-LOCAL-TEST.md`.

---

### 3. STT + TTS implementation (Phase 2)

| Component | What to do |
|-----------|------------|
| **STT** | Load Candle STT model (from moshiko-candle or standalone); accept 16 kHz Int16 PCM; run streaming or chunked inference; emit `{ text, is_final }`. Resampling if model expects different sample rate. |
| **TTS** | Load Candle TTS model; accept `text` + `voice_id`; run inference; stream 24 kHz Int16 PCM chunks, then `{ done: true }`. Voice fallback (e.g. default Expresso) if `voice_id` not found. |
| **Concurrency** | One inference at a time per model (or small pool) to avoid OOM; queue or reject if busy. |

---

### 4. Integration (Phase 3)

| Task | What to do |
|------|------------|
| **Agent** | No code change: keep `USE_KYUTAI_STT=true`, `TTS_PROVIDER=kyutai`, `KYUTAI_STT_URL` / `KYUTAI_TTS_URL` pointing at the Rust server (e.g. `ws://127.0.0.1:8089/api/asr-streaming`, `ws://127.0.0.1:8090/api/tts_streaming`). |
| **Dev** | Document in KYUTAI-LOCAL-TEST: “Rust bridge: run `./target/release/kyutai-bridge` (or `cargo run -p kyutai-bridge --release`) then same env + `pnpm dev:real`.” |
| **CLI** | Optional: `ferni dev kyutai-bridge` (or similar) that starts the Rust binary instead of the Python script. |

---

### 5. GCE / CUDA (Phase 4, optional)

| Task | What to do |
|------|------------|
| **Build** | Feature `cuda` for `candle-core`; build on Linux with CUDA, or use prebuilt Docker image. |
| **Deploy** | Same binary (or second binary) as sidecar next to voice agent; expose 8089/8090 internally. |
| **Docs** | Update KYUTAI-DSM-SETUP to mention Rust bridge as an alternative to Python or other sidecars. |

---

## Build order (we can build anything)

1. **Phase 0 (1–2 days)**  
   - Clone/evaluate moshiko-candle; confirm STT + TTS entry points or identify gaps.  
   - Decide: moshiko-candle API vs port DSM to Candle vs mlx-rs PoC.

2. **Phase 1 (2–4 days)**  
   - New crate `kyutai-bridge`; axum or raw tokio-tungstenite; WebSocket routes for `/api/asr-streaming` and `/api/tts_streaming` with **mock** responses (no model).  
   - Verify Node client and voice agent work against this server (same protocol).

3. **Phase 2 (1–2 weeks)**  
   - Wire real Candle STT (from moshiko or ported DSM).  
   - Wire real Candle TTS (from moshiko or ported DSM).  
   - Test on Mac (Metal) with real PCM; tune chunk sizes and latency.

4. **Phase 3 (1–2 days)**  
   - Docs, optional CLI, and “Rust bridge” as default in KYUTAI-LOCAL-TEST when binary is present.

5. **Phase 4 (optional)**  
   - CUDA build and GCE deployment when we want Kyutai on GPU in the cloud.

---

## Success criteria

- Single Rust binary (or two: one for Mac, one for GCE with CUDA); no Python on the host.
- Same WebSocket protocol and URLs as today; voice agent works with existing env vars.
- Real inference (no mocks in production); **ported DSM** STT + TTS; same or better quality than Python/MLX bridge.
- **Better-than-human latency:** STT first interim &lt; 150 ms, STT final &lt; 300 ms, TTS TTFB &lt; 250 ms; E2E to first audio &lt; 500 ms (see [KYUTAI-DSM-BETTER-THAN-HUMAN.md](KYUTAI-DSM-BETTER-THAN-HUMAN.md)).
- No SIGSEGV on Mac; stable under load.
- GCE: same binary or variant runs with Candle CUDA for production Kyutai STT/TTS.

---

## References

- **Better-than-human targets:** [KYUTAI-DSM-BETTER-THAN-HUMAN.md](KYUTAI-DSM-BETTER-THAN-HUMAN.md)
- Plan (high-level): [KYUTAI-RUST-NO-PYTHON-PLAN.md](KYUTAI-RUST-NO-PYTHON-PLAN.md)
- Protocol and local test: [KYUTAI-LOCAL-TEST.md](../guides/KYUTAI-LOCAL-TEST.md)
- Python bridge (protocol reference): `scripts/kyutai/mlx-bridge-server.py`
- Existing Candle usage: `apps/rust-perf` (Candle + Metal, Qwen3-Omni, server in `src/bin/server.rs`)
- Kyutai: [moshiko-candle](https://huggingface.co/kyutai/moshiko-candle-q8), [delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling)
