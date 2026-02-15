# Kyutai Rust/Candle Bridge

Rust WebSocket server that implements the Kyutai STT + TTS protocol, matching the Python `mlx-bridge-server.py` exactly. The voice agent connects via `KYUTAI_STT_URL` / `KYUTAI_TTS_URL` env vars — no code changes needed.

**Phase 1 (current):** Mock responses for protocol validation.
**Phase 2:** Real Candle inference (STT + TTS) behind the `inference` feature flag.

## Build

```bash
cargo build --release
```

## Run

```bash
# Default: port 8089, bind 127.0.0.1
cargo run --release

# Custom port/host
cargo run --release -- --port 8089 --host 0.0.0.0

# With debug logging
RUST_LOG=kyutai_bridge=debug cargo run --release
```

## Endpoints

| Endpoint | Protocol | Direction | Format |
|----------|----------|-----------|--------|
| `GET /health` | HTTP | Response | `{"status":"ok","mode":"mock","version":"0.1.0"}` |
| `GET /api/asr-streaming` | WebSocket | Client → Server | Binary PCM Int16, 16 kHz, mono |
| | | Server → Client | JSON `{"text":"...","is_final":false\|true}` |
| `GET /api/tts_streaming` | WebSocket | Client → Server | JSON `{"text":"...","voice_id":"ferni"}` |
| | | Server → Client | Binary PCM Int16, 24 kHz, mono chunks |
| | | Server → Client | JSON `{"done":true}` (synthesis complete) |

## Use with Voice Agent

Add to your `.env`:

```bash
USE_KYUTAI_STT=true
KYUTAI_STT_URL=ws://127.0.0.1:8089/api/asr-streaming
KYUTAI_TTS_URL=ws://127.0.0.1:8089/api/tts_streaming
TTS_PROVIDER=kyutai
```

Then start the voice agent normally (`pnpm dev`).

## Phase 2: Real Inference

When Candle STT/TTS models are ready:

```bash
cargo build --release --features inference
cargo run --release --features inference -- --port 8089
```

This will load Kyutai DSM models via Candle (Metal on Mac, CUDA on Linux) and serve real transcription and synthesis instead of mock responses.

## Protocol Details

### STT (`/api/asr-streaming`)

1. Client opens WebSocket connection
2. Client sends binary messages: raw PCM Int16 at 16 kHz mono
3. Server sends JSON interim transcripts: `{"text": "partial", "is_final": false}`
4. Server sends JSON final transcript: `{"text": "complete sentence", "is_final": true}`
5. Server sends VAD status: `{"vad": false, "is_speaking": false}`
6. Connection stays open for continuous audio

### TTS (`/api/tts_streaming`)

1. Client opens WebSocket connection
2. Client sends JSON: `{"text": "Hello world", "voice_id": "ferni"}`
3. Server sends binary PCM chunks: Int16 at 24 kHz mono (240 samples/chunk)
4. Server sends JSON: `{"done": true}`
5. Server closes connection

## References

- Roadmap: `docs/plans/KYUTAI-RUST-CANDLE-ROADMAP.md`
- Python bridge (protocol reference): `scripts/kyutai/mlx-bridge-server.py`
- Latency targets: `docs/plans/KYUTAI-DSM-BETTER-THAN-HUMAN.md`
