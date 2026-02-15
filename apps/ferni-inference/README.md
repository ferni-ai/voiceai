# Ferni Inference Gateway

Lightweight Rust proxy that routes inference requests to the appropriate backend pipeline.

## Architecture

```
                         ┌──────────────────────┐
                         │   ferni-inference     │
                         │   :8600 (gateway)     │
                         └──────┬───────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
     ┌────────▼────────┐ ┌─────▼──────┐  ┌───────▼────────┐
     │  Omni Pipeline   │ │  Quality    │  │  Speed (LFM2)  │
     │  :8505           │ │  Pipeline   │  │  :8506         │
     │  (Qwen3-Omni)    │ │             │  │  (future)      │
     └──────────────────┘ │  STT :8089  │  └────────────────┘
                          │  LLM :11434 │
                          │  TTS :8501  │
                          └─────────────┘
```

## Quick Start

```bash
cargo build --release
cargo run --release -- --port 8600

# Health check
curl http://127.0.0.1:8600/health

# List backends
curl http://127.0.0.1:8600/v1/backends

# Route to omni pipeline
curl -X POST http://127.0.0.1:8600/v1/inference \
  -H "Content-Type: application/json" \
  -d '{"mode": "omni", "payload": {"audio_base64": "..."}}'

# Direct omni route
curl -X POST http://127.0.0.1:8600/v1/inference/omni \
  -H "Content-Type: application/json" \
  -d '{"audio_base64": "..."}'
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Aggregate health from all backends |
| `/v1/backends` | GET | List backends with availability and latency |
| `/v1/inference` | POST | Route by `{"mode": "omni\|quality\|speed"}` |
| `/v1/inference/omni` | POST | Direct proxy to Omni pipeline |
| `/v1/inference/quality` | POST | Orchestrate STT → LLM → TTS |
| `/v1/inference/speed` | POST | Direct proxy to LFM2 pipeline |

## CLI Options

```
--port <PORT>          Gateway port [default: 8600]
--host <HOST>          Bind address [default: 127.0.0.1]
--omni-url <URL>       Omni pipeline [default: http://127.0.0.1:8505]
--kyutai-url <URL>     Kyutai STT [default: http://127.0.0.1:8089]
--ollama-url <URL>     Ollama LLM [default: http://127.0.0.1:11434]
--tts-url <URL>        Rust TTS [default: http://127.0.0.1:8501]
--lfm2-url <URL>       LFM2 speed pipeline [default: http://127.0.0.1:8506]
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OMNI_URL` | `http://127.0.0.1:8505` | Omni pipeline URL |
| `KYUTAI_STT_URL` | `http://127.0.0.1:8089` | Kyutai STT URL |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama LLM URL |
| `TTS_URL` | `http://127.0.0.1:8501` | TTS server URL |
| `LFM2_URL` | `http://127.0.0.1:8506` | LFM2 speed pipeline URL |
| `RUST_LOG` | `ferni_inference=info` | Log level |

CLI args take precedence over environment variables.
