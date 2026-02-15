# Test Kyutai DSM Locally (Mac)

How to run the voice agent with Kyutai STT + TTS on your Mac and compare to Gemini + Cartesia.

---

## What “better than Gemini / current platform” means here

| Dimension | Current (Gemini + Cartesia) | Kyutai DSM (goal) |
|-----------|----------------------------|-------------------|
| **STT** | Gemini Live / OpenAI realtime | Kyutai STT (streaming, semantic VAD, word timestamps) |
| **TTS** | Cartesia (cloud API) | Kyutai TTS (streaming, voice cloning from 10s ref) |
| **Latency** | Cloud round-trip | Local MLX or same-box GCE → lower RTT |
| **Cost** | Per-minute API | Self-hosted → no per-minute once infra is paid |
| **Privacy** | Audio to Google/OpenAI/Cartesia | Audio stays on-device (MLX) or your GCE |

To actually compare, you need to run the **full voice agent** with Kyutai STT + Kyutai TTS and do a live call (or use the local-proof script for STT→TTS only).

---

## What’s in place today

- **Wiring:** With `USE_KYUTAI_STT=true` and `TTS_PROVIDER=kyutai`, the agent uses Kyutai STT and Kyutai TTS.
- **URLs:** Agent expects WebSocket servers at `KYUTAI_STT_URL` (default `ws://localhost:8089/api/asr-streaming`) and `KYUTAI_TTS_URL` (default `ws://localhost:8090/api/tts_streaming`).
- **Bridge (mock):** `scripts/kyutai/mlx-bridge-server.py` runs STT + TTS servers that speak the same protocol but return mock data. No models required.
- **Bridge (real):** With `--use-mlx`, the bridge loads moshi-mlx STT and TTS models and runs real inference (Apple Silicon, Python 3.12+). First run may download Hugging Face weights.

So you can **test the wiring and UI** locally with the mock bridge, or run **real** STT+TTS with `--use-mlx` (see Option B).

---

## Option A: Test wiring only (mock, no models)

Use the mock bridge so the agent uses “Kyutai” end-to-end without any STT/TTS models. Good to confirm env, URLs, and UI.

### 1. Install bridge deps (Python)

```bash
pip install -r scripts/kyutai/requirements-mlx.txt
# or: pip install websockets
```

### 2. Start the mock bridge

```bash
python scripts/kyutai/mlx-bridge-server.py --stt-port 8089 --tts-port 8090
```

Leave it running. You should see:

- `STT WebSocket: ws://127.0.0.1:8089/api/asr-streaming`
- `TTS WebSocket: ws://127.0.0.1:8090/api/tts_streaming`

### 3. Set env and run the voice agent

In a **second terminal** (repo root):

```bash
export USE_KYUTAI_STT=true
export TTS_PROVIDER=kyutai
# Optional if you use defaults:
# export KYUTAI_STT_URL=ws://127.0.0.1:8089/api/asr-streaming
# export KYUTAI_TTS_URL=ws://127.0.0.1:8090/api/tts_streaming

pnpm dev
```

Start a voice session. The agent will use Kyutai STT + TTS; you’ll get **mock** transcript and **silence** (or mock audio) because the bridge doesn’t run real models yet.

### 4. Optional: STT → TTS round-trip (no agent)

```bash
npx tsx scripts/kyutai/local-proof.ts
```

Uses the same URLs; with the mock bridge you’ll see “mock transcript” and a WAV of silence. Confirms the Node ↔ bridge path.

---

## Option B: Real Kyutai locally (MLX)

To get **real** STT and TTS on your Mac the bridge loads moshi-mlx and runs inference on Apple Silicon.

### 1. Install bridge deps (Python 3.12+, Apple Silicon)

```bash
pip install -r scripts/kyutai/requirements-mlx.txt
```

This installs `moshi-mlx`, `mlx`, `sentencepiece`, and `huggingface_hub`. First run will download STT and TTS weights from Hugging Face.

### 2. Start the bridge with real models

```bash
python scripts/kyutai/mlx-bridge-server.py --stt-port 8089 --tts-port 8090 --use-mlx
```

You should see “Loading STT model…”, “STT model ready.”, “Loading TTS model…”, “TTS model ready.”, then the WebSocket URLs. Optional: `--stt-repo kyutai/stt-2.6b-en-mlx` for English-only STT; `--tts-quantize 8` (default) for 8-bit TTS.

### 3. Same env and agent as Option A

In a second terminal:

```bash
export USE_KYUTAI_STT=true
export TTS_PROVIDER=kyutai
pnpm dev
```

Start a voice session. You get **real** Kyutai STT (16 kHz PCM in → interim/final transcript) and **real** Kyutai TTS (text → 24 kHz PCM). You can compare latency and quality to Gemini + Cartesia.

### 4. Optional: round-trip without agent

```bash
npx tsx scripts/kyutai/local-proof.ts
```

With the bridge running with `--use-mlx`, this produces a real transcript and real TTS WAV (or use `--input` for a PCM/WAV file).

---

## Run all local servers for real (no mocks)

Use real Kyutai STT/TTS (MLX bridge) and the full dev stack. Run each in its own terminal so you can see logs.

**One-time:** Kyutai bridge needs Python 3.12 (MLX wheels; 3.13+ may not have compatible mlx). Use a venv:

```bash
python3.12 -m venv scripts/kyutai/.venv
scripts/kyutai/.venv/bin/pip install -r scripts/kyutai/requirements-mlx.txt
```

If you don’t have Python 3.12: `brew install python@3.12` then use `python3.12` above. After that, `pnpm dev:kyutai-bridge` uses the venv automatically (see `scripts/kyutai/run-kyutai-bridge.sh`).

**Then start these 5 processes:**

| # | Terminal | Command | Port / role |
|---|-----------|----------|--------------|
| 1 | Token server | `pnpm token-server` | 3001 |
| 2 | UI server | `pnpm ui-server` | 3002 |
| 3 | Vite frontend | `cd apps/web && pnpm dev` | 3004 |
| 4 | **Kyutai bridge (real)** | `pnpm dev:kyutai-bridge` | 8089 STT, 8090 TTS |
| 5 | **Voice agent (real Kyutai)** | `pnpm dev:real` | LiveKit worker |

Or use the Ferni CLI to see the standard dev commands, then add bridge + real agent:

```bash
ferni dev cursor    # prints token-server, ui-server, Vite, dev
# Then run bridge and agent as above (terminals 4 and 5).
```

**Quick checks:**

```bash
curl -s http://localhost:3001/health && echo
curl -s http://localhost:3002/health && echo
curl -s http://localhost:3004/ | head -c 80
# Bridge: connect to ws://127.0.0.1:8089 and ws://127.0.0.1:8090 when testing STT/TTS
```

---

## Env reference (local)

```bash
# Kyutai STT (replaces Gemini/OpenAI STT for speech input)
USE_KYUTAI_STT=true
KYUTAI_STT_URL=ws://127.0.0.1:8089/api/asr-streaming

# Kyutai TTS (replaces Cartesia)
TTS_PROVIDER=kyutai
KYUTAI_TTS_URL=ws://127.0.0.1:8090/api/tts_streaming

# Optional auth (bridge mock doesn’t require it)
# KYUTAI_API_KEY=public_token
```

---

## Known issue: MLX/Metal crash on some Macs

On some Apple Silicon Macs (e.g. M4 Pro) with macOS 15.x, the **real** Kyutai bridge (`--use-mlx`) can crash with **SIGSEGV** inside MLX/Metal during TTS or STT GPU work. The crash is in the Apple GPU driver (AGXMetalG16X) when MLX submits Metal work—a null/invalid resource is passed. This is a known class of MLX/Metal issues on certain hardware/OS combinations; we cannot fix it from our code.

**Workarounds:**

| Option | What to do |
|--------|------------|
| **Mock bridge** | Run the bridge **without** `--use-mlx` (Option A). You get no real STT/TTS but can test wiring and UI. |
| **Force CPU (if supported)** | Try starting the bridge with `MLX_FORCE_CPU=1` (or `MX_FORCE_CPU=1`) so MLX skips Metal. Slower but may avoid the crash. Example: `MLX_FORCE_CPU=1 pnpm dev:kyutai-bridge`. |
| **Cloud STT/TTS** | Use default agent (`pnpm dev`) with Gemini + Cartesia instead of Kyutai for local calls. |
| **Rust/Candle path** | When the Rust-only Kyutai bridge exists (see [KYUTAI-RUST-NO-PYTHON-PLAN.md](../plans/KYUTAI-RUST-NO-PYTHON-PLAN.md)), it will not use Python/MLX and may avoid this crash. |
| **GCE** | Use Kyutai Rust sidecars on GCE (see [KYUTAI-DSM-SETUP.md](KYUTAI-DSM-SETUP.md)); no MLX on the server. |

If you hit this crash, use mock mode or cloud STT/TTS for local dev until MLX/moshi-mlx or macOS/Metal fixes are available.

---

## Summary

| Goal | What to do |
|------|------------|
| **Test that the stack is wired** | Option A: mock bridge + env + `pnpm dev` (and optionally `local-proof.ts`). |
| **Test real Kyutai vs Gemini/Cartesia** | Option B: install deps, start bridge with `--use-mlx`, then same env and `pnpm dev`; compare on a live call. |
| **Bridge crashes (SIGSEGV)** | See **Known issue: MLX/Metal crash** above; use mock, MLX_FORCE_CPU, cloud, or GCE. |
| **Today** | Option A (mock) or Option B (real MLX) both work; or use GCE sidecars (see KYUTAI-DSM-SETUP.md). |

See also: [KYUTAI-DSM-SETUP.md](KYUTAI-DSM-SETUP.md), [KYUTAI-DSM-GAPS.md](../plans/KYUTAI-DSM-GAPS.md), [KYUTAI-RUST-NO-PYTHON-PLAN.md](../plans/KYUTAI-RUST-NO-PYTHON-PLAN.md) (Rust-only bridge, no Python), `scripts/kyutai/README.md`.
