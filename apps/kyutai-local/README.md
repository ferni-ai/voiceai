# Kyutai Local (Self-Hosted STT + TTS on MLX)

Self-hosted speech-to-text and text-to-speech using Kyutai's Delayed Streams Modeling (DSM) on Apple Silicon via MLX.

## Quick Start

```bash
# 1. Create venv and install
cd apps/kyutai-local
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r requirements.txt

# 2. Start STT server (port 8089)
PYTHONUNBUFFERED=1 python stt_server.py --port 8089

# 3. Start TTS server (port 8090, separate terminal)
PYTHONUNBUFFERED=1 python tts_server.py --port 8090 --quantize 8

# 4. Health check
curl http://localhost:8089/health
curl http://localhost:8090/health
```

## Environment Variables

Add to `.env` in project root:

```bash
USE_KYUTAI_STT=true
KYUTAI_STT_URL=ws://localhost:8089/api/asr-streaming
TTS_PROVIDER=kyutai
KYUTAI_TTS_URL=ws://localhost:8090/api/tts_streaming
```

## Models

| Component       | Model                   | Size        | HuggingFace     |
| --------------- | ----------------------- | ----------- | --------------- |
| STT             | kyutai/stt-1b-en_fr-mlx | 1B params   | Auto-downloaded |
| TTS             | kyutai/tts-1.6b-en_fr   | 1.6B params | Auto-downloaded |
| Audio Tokenizer | Mimi (bundled)          | -           | Auto-downloaded |

## Performance (Apple Silicon)

### STT (Kyutai 1B, MLX)

- First interim: ~770ms (includes 500ms model delay)
- Accuracy: Excellent for natural speech
- Speed: ~35 tokens/sec

### TTS (Kyutai 1.6B, MLX)

- TTFB: ~640ms average
- Speed: 1.7x real-time (INT8), 1.2-1.85x (INT4)
- Sample rate: 24kHz

### Quantization Options

- `--quantize 0`: Full precision (bf16)
- `--quantize 4`: INT4 (fastest, slightly lower quality)
- `--quantize 8`: INT8 (recommended balance)

## Architecture

```
User Mic → STT Server (8089) → transcript → Gemini Flash (cloud) → text → TTS Server (8090) → audio
```

## Test Scripts

```bash
# Test STT on a WAV file
python benchmark_stt.py

# Test TTS for all personas
python compare_tts_personas.py

# Full E2E pipeline test
python test_e2e_pipeline.py
```

## Voice Customization

Currently all personas use the default expresso voice. To add custom persona voices:

1. Train voice embeddings using Kyutai's voice cloning
2. Place `.safetensors` files in the `kyutai/tts-voices` HuggingFace repo
3. The TTS server will automatically use persona-specific voices

## License

- Kyutai DSM code: MIT (Python) + Apache 2.0 (Rust)
- STT model weights: CC-BY 4.0
- TTS model weights: CC-BY 4.0
