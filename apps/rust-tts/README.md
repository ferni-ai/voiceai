# Qwen3-TTS Rust Server

Pure Rust TTS server using the `qwen_tts` crate (Candle + Metal). Exposes OpenAI-compatible and custom API endpoints for Ferni's `LocalTTSProvider`.

## Quick Start

```bash
# Build (first time compiles Candle + Metal — ~3-5 min)
cargo build --release

# Run (auto-downloads ~4GB model from HuggingFace on first run)
cargo run --release -- --port 8501

# Or use a pre-downloaded model
cargo run --release -- --model-path /path/to/Qwen3-TTS-1.7B-VoiceDesign --port 8501
```

## Endpoints

| Endpoint | Method | Format | Used By |
|----------|--------|--------|---------|
| `/v1/audio/speech` | POST | OpenAI API (WAV response) | `LocalTTSProvider` with `LOCAL_TTS_API=openai` |
| `/synthesize` | POST | Custom API (raw s16le PCM) | `LocalTTSProvider` with `LOCAL_TTS_API=custom` |
| `/health` | GET | JSON | Health checks |

## Usage with LocalTTSProvider

```bash
# In your .env
TTS_PROVIDER=local
LOCAL_TTS_URL=http://127.0.0.1:8501
LOCAL_TTS_API=openai
```

## Test

```bash
# Health check
curl http://127.0.0.1:8501/health

# OpenAI API (returns WAV)
curl -X POST http://127.0.0.1:8501/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input":"Hello world","voice":"ferni","model":"tts-1"}' \
  --output test.wav && afplay test.wav

# Custom API (returns raw PCM)
curl -X POST http://127.0.0.1:8501/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","voice_id":"ferni","sample_rate":24000}' \
  --output test.pcm
```

## Voices

All 9 Ferni personas are supported via VoiceDesign mode:

| Voice | Description |
|-------|-------------|
| `ferni` | Male, 30, warm baritone |
| `maya` | Female, 28, alto, encouraging |
| `peter` | Male, 45, deep tenor, thoughtful |
| `alex` | Female, 32, mezzo-soprano, professional |
| `jordan` | Female, 26, bright soprano, enthusiastic |
| `nayan` | Male, 60, bass-baritone, wise |
| `joel` | Male, 55, authoritative baritone |
| `lynch` | Male, 65, warm tenor, folksy |
| `bogle` | Male, 70, deep resonant, principled |

Full persona names also work (e.g., `maya-santos` → `maya`).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HF_TOKEN` | — | HuggingFace token (if model is gated) |
| `RUST_LOG` | — | Log level (`info`, `debug`, `trace`) |

## CLI Options

```
--port <PORT>            Server port [default: 8501]
--host <HOST>            Bind address [default: 127.0.0.1]
--model-path <PATH>      Local model directory (skips download)
--model-id <ID>          HuggingFace model ID [default: Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign]
```
