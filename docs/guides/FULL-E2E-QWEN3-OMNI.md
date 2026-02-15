# Full E2E: Qwen3-Omni + Ferni (Real Quality)

Run **full** speech-in → speech-out with the **real** Qwen3-Omni-30B-A3B model and Ferni. No minimal/test mode.

---

## What you get

- **Model:** Qwen3-Omni-30B-A3B-Instruct (~70 GB, 15 shards) from HuggingFace
- **Server:** Rust **Candle** pipeline (Metal on Mac, CPU on Linux) — chat, `/v1/audio/speech`, `/v1/audio/transcriptions`
- **Ferni:** Voice agent points at that server; full E2E call with real quality

---

## 1. Prerequisites

- **~75 GB free disk**
- **Rust** (for Candle server)
- **huggingface-cli** and **git-lfs** (for download)
- **HF token** if the model is gated: https://huggingface.co/settings/tokens
- **Node/pnpm** for Ferni (token server, UI server, Vite, voice agent)

---

## 2. Download the full model (one-time)

From repo root:

```bash
# Optional: check disk space first
./scripts/qwen3-omni/download-model.sh --check-only

# Download (~70 GB). Set HF_TOKEN if the repo is gated.
HF_TOKEN=hf_xxx ./scripts/qwen3-omni/download-model.sh
```

Default output: `./models/Qwen3-Omni-30B-A3B-Instruct`. Or pass a path:

```bash
./scripts/qwen3-omni/download-model.sh /path/to/large/drive/models/Qwen3-Omni-30B-A3B-Instruct
```

---

## 3. Start the Candle Omni server

In a **dedicated terminal** (leave it running):

```bash
# From repo root. Use the path where the model was downloaded.
export OMNI_MODEL_PATH="${OMNI_MODEL_PATH:-./models/Qwen3-Omni-30B-A3B-Instruct}"

cargo run --bin qwen3-omni-server --features server --no-default-features -p rust-perf -- \
  --model-path "$OMNI_MODEL_PATH"
```

Server binds to **port 8000** by default. You should see:

- `Model: .../Qwen3-Omni-30B-A3B-Instruct`
- `Pipeline: Mel → AuT → Thinker → Talker → Code2Wav`
- `Listening on 0.0.0.0:8000`

Check:

```bash
curl -s http://localhost:8000/health
```

---

## 4. Start Ferni (4 terminals)

In **separate** terminals:

| Terminal | Command |
|----------|---------|
| 1 | `pnpm token-server` |
| 2 | `pnpm ui-server` |
| 3 | `cd apps/web && pnpm dev` |
| 4 | `USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:8000 QWEN3_TTS_URL=http://localhost:8000 LOG_FULL_RESPONSES=true pnpm dev` |

(You can omit `QWEN3_OMNI_BACKEND`; the client uses the URL. If your config expects a backend, use the value that means “HTTP client” or “candle”.)

---

## 5. Run a full E2E call

1. Open the app at **http://localhost:3004**
2. Start a voice room and join
3. Speak: you get **speech-in → Thinker → Talker → Code2Wav → speech-out** with the full 30B-A3B model

Optional checks:

- **TTS:** `curl -s -X POST http://localhost:8000/v1/audio/speech -H "Content-Type: application/json" -d '{"input":"Hello, this is full E2E."}' -o out.raw && ffplay -f f32le -ar 24000 -ac 1 out.raw` (or convert to WAV and play)
- **Health:** `curl -s http://localhost:8000/health | jq`

---

## Environment reference

| Variable | Value for full E2E |
|----------|---------------------|
| `USE_QWEN3_OMNI` | `true` |
| `QWEN3_OMNI_URL` | `http://localhost:8000` |
| `QWEN3_TTS_URL` | `http://localhost:8000` |
| `OMNI_MODEL_PATH` | Path to downloaded model (for the Candle server) |
| `LOG_FULL_RESPONSES` | `true` (optional) |

---

## Troubleshooting

- **“Model path empty” / server in test mode:** Set `OMNI_MODEL_PATH` and pass `--model-path "$OMNI_MODEL_PATH"` so the server loads the real weights.
- **Out of memory:** 30B-A3B is large; use a Mac with enough RAM/Metal or a Linux machine with sufficient RAM.
- **Connection refused to 8000:** Start the Candle server first (step 3) and ensure nothing else is using port 8000.
- **Download fails / gated repo:** Set `HF_TOKEN` and accept the model terms on HuggingFace if required.

---

## MLX (Mac-only, optional)

For an **MLX**-based server (Apple Silicon, no Candle), you need a checkpoint **converted to MLX format** (single `model.safetensors` + config). The repo’s **Candle** path above uses the **HF model as-is** and is the supported way to run **full E2E** today. See [LIVE-VOICE-TEST-MLX.md](./LIVE-VOICE-TEST-MLX.md) for the MLX server when you have an MLX-converted model.
