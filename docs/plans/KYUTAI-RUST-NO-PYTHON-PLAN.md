# Kyutai Voice in Rust (No Python) – Plan

**Goal:** Full real Ferni voice (Kyutai STT + TTS) on Mac using **Rust only** – no Python, no MLX bridge. Same protocol (WebSocket STT/TTS) so the existing voice agent and `KYUTAI_*_URL` config work unchanged.

---

## Why Rust, no Python?

- Single binary: no venv, no `pip install`, no Python version matrix.
- Same stack as rest of Ferni (rust-perf, ferni-tts, rust-audio): Candle/Metal, NAPI, etc.
- No MLX Python dependency on the host; optional use of MLX via C API from Rust, or Candle only.

---

## Options (high level)

| Path | Inference | Pros | Cons |
|------|-----------|------|------|
| **A. Candle** | Kyutai Candle models (Metal/CUDA) | We already use Candle in rust-perf; Kyutai has `moshiko-candle-*` | Moshiko is full Moshi (chat); need to confirm STT/TTS extraction or standalone Candle STT/TTS |
| **B. MLX from Rust** | MLX C API via Rust (mlx-rs / mlx-rust) | Same weights as Python (safetensors); Apple Silicon native | mlx-rs is low-level; we must implement/port Mimi, Lm, LmGen, TTS pipeline |
| **C. Hybrid** | Candle for one of STT/TTS, MLX for the other | Reuse what exists per model | Two stacks to maintain |

---

## Option A: Candle (recommended first step)

**What exists today:**

- **Kyutai:** `kyutai/moshiko-candle-bf16`, `kyutai/moshiko-candle-q8` – full Moshi model in Candle (Rust).
- **Ferni:** `apps/rust-perf` – Candle + Metal (Qwen3-Omni Thinker, Talker, Code2Wav, etc.).

**Open questions:**

1. Does **moshiko-candle** expose STT (audio → text) and TTS (text → audio) in a way we can call from a Rust server? Or is it only full-duplex “chat” (audio in → audio out)?
2. Does Kyutai publish **standalone** STT and/or TTS in Candle (e.g. `stt-1b-en_fr` Candle, DSM TTS Candle)? If yes, we can add a Rust WebSocket server that loads those and speaks the current protocol.

**Concrete steps:**

1. **Evaluate moshiko-candle**  
   Clone or depend on the Candle Moshi code; check API for:
   - “Transcribe this PCM” (STT).
   - “Synthesize this text” (TTS).  
   If both exist, we can build a Rust STT+TTS server (same ports 8089/8090, same WebSocket protocol).

2. **If moshiko is chat-only**  
   - Check Hugging Face / Kyutai for any Candle release of `stt-1b-en_fr` or DSM TTS.  
   - If only PyTorch/MLX exists for STT/TTS, then Option B (MLX from Rust) or keep Python bridge for local Mac.

3. **Rust server shape**  
   - New crate (e.g. `apps/kyutai-bridge` or under `services/`) or extend an existing Rust service.
   - Dependencies: Candle (Metal), tokio, tokio-tungstenite (or similar) for WebSockets.
   - Endpoints: same as Python bridge – `/api/asr-streaming` (STT), `/api/tts_streaming` (TTS); same message formats so `KYUTAI_STT_URL` / `KYUTAI_TTS_URL` and the current Node gateway do not change.

---

## Option B: MLX from Rust (same models as Python bridge)

**What exists:**

- **Apple:** [mlx-c](https://github.com/ml-explore/mlx-c) (C API for MLX).
- **Rust:** [mlx-rs](https://github.com/oxideai/mlx-rs) (OxideAI), [edfix/mlx-rust](https://github.com/edfix/mlx-rust) – bindings to MLX.  
- **Reality:** mlx-rs is low-level (arrays, ops). No Hugging Face loader, no Mimi/Lm/TTSModel helpers. We would need to:
  - Load Kyutai safetensors (STT + TTS).
  - Implement or port: Mimi encode/decode, Lm, LmGen (STT); TTS model + Mimi decode (TTS).
  - Run in a Rust WebSocket server (same protocol as Python bridge).

**Effort:** High – effectively port the Python inference graph and tokenizers into Rust + MLX C API.

**When it’s worth it:** If we must avoid Python entirely and no Candle STT/TTS is available, this is the path to “same weights, same quality, Rust binary.”

**Possible first step:** A minimal PoC in a new crate: use mlx-rs to load **one** of the Kyutai STT or TTS models (e.g. STT), run one inference (e.g. from a small PCM file), print transcript. No WebSocket yet. That validates the toolchain and model loading before committing to the full bridge.

---

## Option C: Hybrid

- Use **Candle** for STT if Kyutai (or community) provides Candle STT.
- Use **Candle** for TTS if Kyutai provides Candle TTS; otherwise keep Python TTS bridge or invest in MLX-from-Rust TTS only.

Reduces Python surface area stepwise without implementing both STT and TTS in MLX-Rust at once.

---

## Recommended order

1. **Short term:** Keep the **Python MLX bridge** for local Mac (“full real” with `--use-mlx`). It’s already wired and works.
2. **Next:** **Evaluate Candle path (Option A):**  
   - Inspect moshiko-candle and any Kyutai Candle STT/TTS.  
   - If we can get STT + TTS from Candle in Rust, implement a **Rust WebSocket server** that matches the current protocol and replace the Python bridge for local (and optionally GCE) use.
3. **If Candle can’t cover STT and TTS:**  
   - Consider **Option B** (mlx-rs PoC for one model), or  
   - Stay on Python bridge for “real” Kyutai and use Rust only for other services (e.g. ferni-tts, rust-perf).

---

## Success criteria (Rust bridge)

- Single (or few) Rust binaries; no Python on the host.
- Same WebSocket protocol as today:  
  - STT: binary PCM 16 kHz mono Int16 → JSON `{ text, is_final }` (and optional `vad`, `is_speaking`).  
  - TTS: JSON `{ text, voice_id }` → binary PCM 24 kHz Int16, then `{ done: true }`, then close.
- Voice agent works with `USE_KYUTAI_STT=true`, `TTS_PROVIDER=kyutai`, `KYUTAI_STT_URL` / `KYUTAI_TTS_URL` pointing at the Rust server (e.g. `ws://127.0.0.1:8089/...`, `ws://127.0.0.1:8090/...`).
- Real inference (no mocks): same Kyutai models (Candle or MLX) as today’s Python bridge.

---

## Implementation roadmap

For a **concrete build order**, performance notes (Candle vs MLX), and the stub crate, see **[KYUTAI-RUST-CANDLE-ROADMAP.md](KYUTAI-RUST-CANDLE-ROADMAP.md)**. The stub `services/kyutai-bridge` (Phase 1 mock) is in place; Phase 0 is to evaluate moshiko-candle, then Phase 2 adds real Candle STT/TTS.

---

## References

- Kyutai STT: [kyutai/stt-1b-en_fr](https://huggingface.co/kyutai/stt-1b-en_fr), [Delayed Streams Modeling](https://github.com/kyutai-labs/delayed-streams-modeling).
- Kyutai Candle: [moshiko-candle-q8](https://huggingface.co/kyutai/moshiko-candle-q8), [moshiko-candle-bf16](https://huggingface.co/kyutai/moshiko-candle-bf16).
- MLX: [ml-explore/mlx](https://github.com/ml-explore/mlx), [mlx-c](https://github.com/ml-explore/mlx-c).
- Rust: [oxideai/mlx-rs](https://github.com/oxideai/mlx-rs), [edfix/mlx-rust](https://github.com/edfix/mlx-rust).
- Current bridge: `scripts/kyutai/mlx-bridge-server.py`, `scripts/kyutai/run-kyutai-bridge.sh`; protocol in `docs/guides/KYUTAI-LOCAL-TEST.md`.
