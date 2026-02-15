# Kyutai Bridge (Rust) — Production DSM STT+TTS

Production-ready Rust/Candle WebSocket server for Kyutai DSM speech-to-text and text-to-speech. Same protocol as the Python MLX bridge — the voice agent uses `KYUTAI_STT_URL` and `KYUTAI_TTS_URL` unchanged.

**Better-than-human latency targets:** STT first-interim < 150 ms, STT final < 300 ms, TTS TTFB < 250 ms. See [KYUTAI-DSM-BETTER-THAN-HUMAN.md](../../docs/plans/KYUTAI-DSM-BETTER-THAN-HUMAN.md).

## Architecture

```
User audio → [STT WebSocket] → moshi::asr::State → transcript JSON
                                    ↑
                              Mimi codec + LM (Candle/Metal/CUDA)
                                    ↓
Text → [TTS WebSocket] → moshi::tts_streaming::State → PCM audio
```

- **Engine:** Kyutai `moshi` crate v0.6 (published on crates.io) with Candle 0.9
- **STT:** `moshi::asr::State` — streaming ASR with word timestamps
- **TTS:** `moshi::tts_streaming::State` — streaming TTS with speaker conditioning
- **Codec:** `moshi::mimi::Mimi` — neural audio codec (encode/decode)
- **GPU:** Metal (Mac), CUDA (GCE), CPU fallback

## Quick start

```bash
# Mock mode (no models, protocol testing)
cargo run -p kyutai-bridge --release -- --mock

# Real inference (downloads models from HuggingFace on first run)
cargo run -p kyutai-bridge --release

# Force CPU inference (no GPU)
cargo run -p kyutai-bridge --release -- --cpu

# Custom model repo
cargo run -p kyutai-bridge --release -- --moshi-repo kyutai/moshiko-candle-bf16
```

## Use with the voice agent

```bash
# Terminal 1: Start bridge
cargo run -p kyutai-bridge --release

# Terminal 2: Start voice agent
USE_KYUTAI_STT=true TTS_PROVIDER=kyutai pnpm dev:real
```

## Configuration

| Flag / Env | Default | Description |
|---|---|---|
| `--stt-port` / `KYUTAI_STT_PORT` | 8089 | STT WebSocket port |
| `--tts-port` / `KYUTAI_TTS_PORT` | 8090 | TTS WebSocket port |
| `--bind-addr` / `KYUTAI_BIND_ADDR` | 127.0.0.1 | Bind address |
| `--cpu` / `KYUTAI_CPU` | false | Force CPU (no GPU) |
| `--mock` / `KYUTAI_MOCK` | false | Mock mode (no models) |
| `--moshi-repo` / `KYUTAI_MOSHI_REPO` | kyutai/moshiko-candle-bf16 | HuggingFace model repo (safetensors) |
| `--lm-model-file` / `KYUTAI_LM_MODEL_FILE` | (auto) | Local LM weights path |
| `--mimi-model-file` / `KYUTAI_MIMI_MODEL_FILE` | (auto) | Local Mimi weights path |
| `--tokenizer-file` / `KYUTAI_TOKENIZER_FILE` | (auto) | Local tokenizer path |

## Protocol (same as Python bridge)

- **STT:** `ws://127.0.0.1:8089/api/asr-streaming`  
  Client sends binary PCM 16 kHz mono Int16; server sends JSON `{ text, is_final }` (and optional `vad`, `is_speaking`).

- **TTS:** `ws://127.0.0.1:8090/api/tts_streaming`  
  Client sends JSON `{ text, voice_id }`; server sends binary PCM 24 kHz Int16 chunks, then `{ done: true }`.

## Health endpoints

- `GET /health` — Liveness: always 200 when server is running
- `GET /health/ready` — Readiness: 200 when models loaded and warm; 503 during loading

## Production features

- **Graceful shutdown:** Handles SIGTERM/SIGINT for clean Docker/GCE shutdown
- **Connection limits:** Max 32 concurrent STT/TTS sessions (configurable)
- **Buffer overflow protection:** 10 MB max input buffer per connection
- **Idle timeout:** 30s WebSocket idle timeout prevents zombie connections
- **Text length limit:** 10K character max for TTS requests
- **Model warmup:** Runs dummy inference at startup to avoid cold-start latency
- **Latency instrumentation:** Logs STT first-interim, final, and TTS TTFB with targets

## Tests

```bash
cargo test                    # 10 tests (6 unit + 4 integration)
cargo test -- --nocapture     # With output
```

## Roadmap

- **[KYUTAI-DSM-BETTER-THAN-HUMAN.md](../../docs/plans/KYUTAI-DSM-BETTER-THAN-HUMAN.md)** — Latency targets and quality plan
- **[KYUTAI-RUST-CANDLE-ROADMAP.md](../../docs/plans/KYUTAI-RUST-CANDLE-ROADMAP.md)** — Candle path, ported DSM, Phase 0–4
