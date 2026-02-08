# Live Voice Test: MLX Qwen3-Omni + Ferni

Run a live voice test with the MLX Qwen3-Omni server and Ferni voice agent on your Mac.

## Prerequisites

- **Mac with Apple Silicon** (M1/M2/M3/M4)
- **Python 3.10+** with MLX app deps:
  ```bash
  cd apps/mlx-qwen3-omni && pip install mlx transformers fastapi uvicorn scipy sse-starlette python-multipart
  ```
- **Node/pnpm** for Ferni (token server, UI server, Vite, voice agent)
- **Optional:** Full converted Qwen3-Omni checkpoint (Thinker + Talker + Code2Wav) for real TTS; otherwise use minimal test model for chat-only

## Quick start (minimal model — chat only)

Use a tiny Thinker-only model so the MLX server starts without a full checkpoint. Chat works; TTS will return 501 until you add a full model.

### 1. Create minimal test model (one-time)

```bash
cd apps/mlx-qwen3-omni
PYTHONPATH=src python scripts/create_minimal_test_model.py
# Writes to .test-model/
```

### 2. Start the MLX server

```bash
cd apps/mlx-qwen3-omni
PYTHONPATH=src python -m mlx_qwen3_omni.server \
  --model .test-model \
  --tokenizer Qwen/Qwen2.5-0.5B-Instruct \
  --port 8800
```

Leave this running. You should see `Model loaded`, then `Starting server on 127.0.0.1:8800`.

### 3. Start Ferni dev stack (4 terminals)

In **separate** terminals:

| Terminal | Command | Purpose |
|----------|---------|---------|
| 1 | `pnpm token-server` | Token server (3001) |
| 2 | `pnpm ui-server` | UI server (3002) |
| 3 | `cd apps/web && pnpm dev` | Vite frontend (3004) |
| 4 | `USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:8800 QWEN3_TTS_URL=http://localhost:8800 QWEN3_OMNI_BACKEND=mlx LOG_FULL_RESPONSES=true pnpm dev` | Voice agent (Qwen3-Omni via MLX) |

### 4. Verify and call

1. **Health:** `curl -s http://localhost:8800/health` → `{"status":"ok","model_loaded":true,...}`
2. **Chat:** Open the app at http://localhost:3004, start a voice room, and talk. With the minimal model you get **text chat** from the Thinker; TTS may fall back to Cartesia or show an error if the stack expects Qwen TTS (501).

## Full voice test (Thinker + Talker + Code2Wav)

For real **speech-in → speech-out** you need a full MLX checkpoint that includes Thinker, Talker, and Code2Wav (and optionally the audio encoder for transcription).

1. **Convert a full checkpoint** (HuggingFace Qwen3-Omni or similar) so that `model.safetensors` contains:
   - Thinker: `model.*`, `lm_head.*`
   - Optional: `audio_encoder.*` for `/v1/audio/transcriptions`
   - Talker: `talker.*`
   - Code2Wav: `code2wav.*`

2. **Start the MLX server** with that model dir (no need for `--tokenizer` if the dir has tokenizer files):

   ```bash
   cd apps/mlx-qwen3-omni
   PYTHONPATH=src python -m mlx_qwen3_omni.server --model /path/to/full_mlx_model --port 8800
   ```

3. **Start Ferni** with the same env as above. Then place a call; you should get Thinker text → Talker → Code2Wav → 24 kHz audio.

## Environment reference

| Variable | Value for MLX live test |
|----------|-------------------------|
| `USE_QWEN3_OMNI` | `true` |
| `QWEN3_OMNI_URL` | `http://localhost:8800` |
| `QWEN3_TTS_URL` | `http://localhost:8800` (same server; MLX serves `/v1/audio/speech`) |
| `QWEN3_OMNI_BACKEND` | `mlx` |
| `LOG_FULL_RESPONSES` | `true` (optional, for debugging) |

## Troubleshooting

- **503 Model not loaded:** MLX server not ready or wrong `--model` path. Check `curl http://localhost:8800/health`.
- **501 Talker/Code2Wav not in checkpoint:** Using minimal test model; use a full converted model for TTS.
- **Connection refused to localhost:8800:** Start the MLX server first and ensure nothing else is using port 8800.
- **Tokenizer errors:** Pass `--tokenizer Qwen/Qwen2.5-0.5B-Instruct` (or another Qwen HF repo) when your model dir has no tokenizer files.
