# Higgs Voice Pipeline

Rust-native voice pipeline with STT (Whisper), TTS (Higgs Audio V2), real-time DSP humanization, and voice biomarker analysis. Communicates with TypeScript voice agents via WebSocket.

## Quick Start

```bash
# Build
cargo build --release

# Run (no models — server starts in degraded mode)
cargo run -- --port 8600

# Run with models
cargo run -- --port 8600 \
  --whisper-model ./models/whisper-base.bin \
  --higgs-model ./models/higgs-audio-v2 \
  --xcodec-model ./models/xcodec
```

## Health Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Liveness check — returns `{"status":"ok"}` |
| `/health/ready` | GET | Readiness check — returns STT/TTS availability |
| `/stats` | GET | Active sessions, transcriptions, syntheses, uptime |

## WebSocket Protocol

Connect to `ws://host:port/ws` and exchange JSON + binary messages.

### Client → Server Messages

| Type | Fields | Description |
|------|--------|-------------|
| `start_session` | `session_id`, `persona?` | Initialize a session |
| `transcribe` | (none) | Transcribe buffered audio |
| `synthesize` | `text`, `emotion?`, `intensity?`, `request_id?` | Full TTS synthesis |
| `synthesize_streaming` | `text`, `emotion?`, `intensity?`, `chunk_steps?`, `request_id?` | Streaming TTS (`chunk_steps`: decode steps per streaming chunk; default: server-configured) |
| `end_session` | (none) | Close session |
| Binary frames | i16 LE PCM @ 16kHz | Raw audio for STT |

### Server → Client Messages

| Type | Fields | Description |
|------|--------|-------------|
| `transcript` | `text`, `biomarkers?`, `latency_ms` | STT result |
| `audio_start` | `sample_rate`, `request_id?` | TTS audio begins |
| Binary frames | i16 LE PCM @ 24kHz | TTS audio chunks (200ms) |
| `audio_done` | `duration_ms`, `humanization?`, `request_id?` | TTS complete |
| `error` | `code`, `message`, `request_id?` | Error response |

### Valid Emotions

**Direct**: `neutral`, `gentle`, `whisper`, `serious`, `playful`, `empathetic`, `excited`

**Aliases** (mapped internally): `sad` → `gentle`, `concern` → `gentle`, `joy` → `excited`, `anger` → `serious`, `warmth` → `empathetic`, `calm` → `gentle`, `vulnerable` → `whisper`, `curious` → `playful`

### Voice Biomarkers (in transcript response)

| Field | Type | Description |
|-------|------|-------------|
| `pitch_hz` | f32 | Fundamental frequency |
| `energy` | f32 | RMS energy (0-1) |
| `jitter` | f32 | Pitch instability (0-1) |
| `shimmer` | f32 | Amplitude instability (0-1) |
| `breathiness` | f32 | Breath component (0-1) |
| `speech_rate` | f32 | Syllables/sec estimate |
| `is_speech` | bool | Voice activity detected |

## DSP Humanization Pipeline

9-stage pipeline making TTS output sound human:

1. **Breath** — Natural breathing at phrase boundaries
2. **Filler** — "um", "hmm" insertions
3. **Prosody** — Pitch contour, declination
4. **Emotion** — Emotion coloring (warmth, brightness)
5. **Texture** — Jitter, shimmer (vocal fold simulation)
6. **Pacing** — Adaptive speech rate
7. **Paralinguistic** — Sighs, chuckles, tongue clicks
8. **Physiological** — Tired, congested, breathless states
9. **Biomarker feedback** — Adapt to user's vocal state

Streaming mode uses lightweight stages (3-5) for low latency.

## Architecture

```
WebSocket ←→ ws_handler.rs ←→ pipeline.rs
                                    ├── stt/ (Whisper)
                                    ├── tts/ (Higgs Audio V2 + xCodec)
                                    ├── dsp/ (9-stage humanization)
                                    └── analysis/ (voice biomarkers)
```

## Configuration

All configuration is via CLI arguments:

| Argument | Default | Description |
|----------|---------|-------------|
| `--port` | `8600` | Server port |
| `--higgs-model` | (none) | Path to Higgs Audio V2 model weights |
| `--whisper-model` | (none) | Path to Whisper model (ggml format) |
| `--xcodec-model` | (none) | Path to xCodec ONNX decoder |

Logging is configured via `RUST_LOG` environment variable (e.g., `RUST_LOG=debug`).

## Constraints

| Limit | Value | Source |
|-------|-------|--------|
| Max audio frame | 30 seconds (960,000 bytes at 16 kHz i16 LE PCM) | `ws_handler.rs` |
| Min audio frame | 2 bytes | `ws_handler.rs` |
| STT input rate | 16 kHz mono | `pipeline.rs` |
| TTS output rate | 24 kHz mono | `audio.rs` |
| Max text length | ~32 KB (limited by model context of 8,192 tokens) | `pipeline.rs` |
| Max audio buffer per session | 5 minutes (4,800,000 samples at 16 kHz) | `session.rs` |
| Session TTL | 1 hour of inactivity | `session.rs` |

## Testing

```bash
cargo test --no-default-features  # Skip NAPI (requires Node.js)
```

## TypeScript Integration

Set `TTS_PROVIDER=higgs-pipeline` and `HIGGS_PIPELINE_URL=ws://host:8600/ws` in the voice agent's environment. The TypeScript `HiggsPipelineProvider` handles WebSocket connection, protocol marshaling, and audio streaming.
