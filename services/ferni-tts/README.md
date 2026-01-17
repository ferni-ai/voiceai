# Ferni TTS Service

**High-performance Text-to-Speech with superhuman prosody transforms.**

Better than Cartesia. Full SSML support. 8 "Better than Human" optimizations.

## Features

### Full W3C SSML 1.1 Support
- `<speak>`, `<voice>`, `<prosody>`, `<break>`, `<emphasis>`
- `<say-as>`, `<sub>`, `<phoneme>`, `<audio>`, `<mark>`
- `<p>`, `<s>`, `<w>`, `<lang>`

### Ferni SSML Extensions
- `<ferni:emotion>` - Emotional coloring
- `<ferni:memory>` - Memory entity emphasis
- `<ferni:breath>` - Natural breathing
- `<ferni:backchannel>` - Natural interjections
- `<ferni:silence>` - Meaningful pauses

### 8 Superhuman Transforms
1. **Circadian Rhythm** - Adjust tempo based on time of day (slower at 2am)
2. **Memory Prosody** - Emphasize remembered entities (names, places)
3. **Emotional Anticipation** - Express emotion before content
4. **Meaningful Silence** - Strategic pauses for impact
5. **Relationship Prosody** - Warmth based on relationship stage
6. **Energy Matching** - Mirror user's energy level
7. **Backchannels** - Natural "hmm", "uh-huh" sounds
8. **Breath Patterns** - Natural breathing rhythm

### Performance
- < 50ms transform latency
- Streaming audio output
- ~12x faster build with esbuild patterns

## Quick Start

```bash
# Run with mock backend (testing)
docker-compose up

# Run with CosyVoice backend
docker-compose --profile with-backend up

# Build locally
cargo build --release --features full

# Run tests
cargo test
```

## API Reference

### Synthesize Text

```bash
curl -X POST http://localhost:8080/v1/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, how are you today?",
    "voice_id": "ferni",
    "sample_rate": 24000,
    "superhuman": {
      "user_local_hour": 14,
      "relationship_stage": 0.7,
      "user_energy": 0.6
    }
  }' \
  --output audio.pcm
```

### Synthesize SSML

```bash
curl -X POST http://localhost:8080/v1/synthesize/ssml \
  -H "Content-Type: application/ssml+xml" \
  -d '<speak>
    <prosody rate="slow">
      Hello, <emphasis level="strong">friend</emphasis>.
    </prosody>
  </speak>' \
  --output audio.pcm
```

### Stream Audio

```bash
curl -X POST http://localhost:8080/v1/synthesize/stream \
  -H "Content-Type: application/json" \
  -d '{
    "text": "This is a longer message that will stream.",
    "voice_id": "maya"
  }' \
  --output audio.pcm
```

### List Voices

```bash
curl http://localhost:8080/v1/voices
```

### Health Check

```bash
curl http://localhost:8080/health
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FERNI_TTS_HOST` | `0.0.0.0` | Bind address |
| `FERNI_TTS_PORT` | `8080` | HTTP port |
| `FERNI_TTS_BACKEND` | `mock` | Backend: `mock`, `cosy_voice`, `azure`, `google`, `openai` |
| `COSY_VOICE_ENDPOINT` | `http://localhost:50051` | CosyVoice gRPC endpoint |
| `FERNI_TTS_SAMPLE_RATE` | `24000` | Output sample rate |
| `FERNI_TTS_LOG_LEVEL` | `info` | Log level |
| `FERNI_TTS_JSON_LOGS` | `true` | JSON log format |
| `FERNI_TTS_SUPERHUMAN` | `true` | Enable superhuman transforms |
| `FERNI_TTS_METRICS` | `true` | Enable Prometheus metrics |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      HTTP API (Axum)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────┐  │
│  │ SSML Parser │ -> │ Superhuman Layer │ -> │ Synthesis │  │
│  │ (W3C Spec)  │    │ (8 Transforms)   │    │  Backend  │  │
│  └─────────────┘    └──────────────────┘    └───────────┘  │
│                                                     │       │
│                              ┌──────────────────────┘       │
│                              ▼                              │
│                     ┌─────────────────┐                     │
│                     │ Audio Pipeline  │                     │
│                     │ (Format/Stream) │                     │
│                     └─────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Superhuman Context

The superhuman transforms use context about the user to adjust prosody:

```json
{
  "superhuman": {
    "user_local_hour": 14,
    "relationship_stage": 0.7,
    "user_energy": 0.6,
    "user_emotion": ["joy", 0.8],
    "topic_sensitivity": 0.3,
    "emotional_trajectory": "building_to_joy",
    "turn_number": 5,
    "user_speaking_rate": 1.1,
    "remembered_entities": [
      {
        "name": "Sarah",
        "entity_type": "person",
        "familiarity": 0.9,
        "emotional_valence": 0.7
      }
    ]
  }
}
```

## Available Voices

| Voice | Style | Use Case |
|-------|-------|----------|
| `ferni` | Warm, empathetic, gentle | Default coordinator |
| `maya` | Encouraging, nurturing | Coaching, habits |
| `peter` | Analytical, calm, precise | Research, finance |
| `jordan` | Organized, efficient | Planning, tasks |
| `alex` | Professional, articulate | Communication |
| `nayan` | Wise, contemplative | Wisdom, reflection |

## Development

```bash
# Build
cargo build --release --features full

# Run tests
cargo test

# Run with debug logging
FERNI_TTS_LOG_LEVEL=debug cargo run

# Format code
cargo fmt

# Lint
cargo clippy
```

## License

Proprietary - Ferni AI
