# Kyutai DSM (Delayed Streams Modeling) Setup

Run Kyutai Speech-to-Text and Text-to-Speech with Ferni: locally on Mac (MLX) or in production on GCE (Rust/CUDA).

## Overview

[Kyutai Delayed Streams Modeling](https://github.com/kyutai-labs/delayed-streams-modeling) provides:

- **Kyutai STT** – streaming speech-to-text with semantic VAD and word timestamps
- **Kyutai TTS** – streaming text-to-speech with voice cloning (10s reference)

Implementations:

| Environment | STT | TTS | How |
|-------------|-----|-----|-----|
| **Mac (local dev)** | MLX (Python) or **Rust/Candle** | MLX (Python) or **Rust/Candle** | Python: `moshi-mlx`; Rust: `services/kyutai-bridge` (mock or real weights) |
| **GCE (production)** | Rust/CUDA server | Rust/CUDA server | `moshi-server` sidecar or **kyutai-bridge** (Candle) |

## Phase 1a: Local Mac Setup (MLX)

### Prerequisites

- Python 3.10+ with `uv` or `pip`
- Apple Silicon Mac (MLX is Apple's ML framework)

### Install MLX packages

```bash
# With uv (recommended)
uv pip install 'moshi-mlx>=0.2.6'

# Or with pip
pip install 'moshi-mlx>=0.2.6'
```

### Test Kyutai STT (MLX)

```bash
# From delayed-streams-modeling repo (clone once)
git clone https://github.com/kyutai-labs/delayed-streams-modeling.git
cd delayed-streams-modeling

# Transcribe an audio file (e.g. 16kHz mono)
python -m moshi_mlx.run_inference --hf-repo kyutai/stt-1b-en_fr-mlx audio/bria.mp3 --temp 0
```

### Test Kyutai TTS (MLX)

```bash
# From delayed-streams-modeling repo
echo "Hey, how are you?" | python scripts/tts_mlx.py - - --quantize 8
# Plays audio immediately; use output file for non-interactive:
python scripts/tts_mlx.py text_to_say.txt audio_output.wav
```

### Use Kyutai with Ferni locally

For local Mac, the **Rust server** does not run (it requires CUDA). Options:

1. **Use cloud STT/TTS** – Keep Cartesia/Gemini for local dev; use Kyutai only on GCE.
2. **Run a local bridge** – Start the WebSocket bridge so the agent can use Kyutai STT + TTS (mock or, when wired, real MLX).

**Quick local test (mock, no models):**

**Option A – Rust/Candle bridge (recommended; no Python/MLX):**

```bash
# Terminal 1: start Rust bridge (mock STT/TTS, same ports)
cd services/kyutai-bridge && cargo run --release -- --mock

# Terminal 2: run voice agent with Kyutai
export USE_KYUTAI_STT=true
export TTS_PROVIDER=kyutai
# Optional: KYUTAI_STT_URL=ws://127.0.0.1:8089/api/asr-streaming KYUTAI_TTS_URL=ws://127.0.0.1:8090/api/tts_streaming
pnpm dev
```

**Option B – Python MLX bridge:**

```bash
# Terminal 1: start bridge (mock STT/TTS)
pip install -r scripts/kyutai/requirements-mlx.txt
python scripts/kyutai/mlx-bridge-server.py --stt-port 8089 --tts-port 8090

# Terminal 2: run voice agent with Kyutai
export USE_KYUTAI_STT=true
export TTS_PROVIDER=kyutai
pnpm dev
```

**Real weights (Rust):** Run the bridge without `--mock`; it will download from HuggingFace (`KYUTAI_MOSHI_REPO=kyutai/moshiko-candle-bf16`, ~15GB). Metal/CUDA used if available. Validate with `./scripts/kyutai/validate-bridge.sh` (mock) or `./scripts/kyutai/validate-bridge.sh --real`.

Full steps, env reference, and how to get **real** Kyutai locally (MLX): **[KYUTAI-LOCAL-TEST.md](KYUTAI-LOCAL-TEST.md)**. Weight compatibility (Rust): **[KYUTAI-DSM-GAPS.md](../plans/KYUTAI-DSM-GAPS.md)**.

## Phase 1b–1c: GCE Production (Rust/CUDA)

### GPU instance

- **Recommended:** `g2-standard-4` with 1x NVIDIA L4 (24 GB VRAM)
- **Alternative:** `n1-standard-4` + 1x T4 (16 GB VRAM) – tight for STT + TTS

To deploy the voice agent MIG with GPU (for Kyutai bridge STT/TTS):

```bash
export GCE_USE_GPU=true
ferni deploy gce --mig
```

- **CLI (deploy-gce.ts):** When `GCE_USE_GPU=true`, the instance template uses `g2-standard-4` and `--accelerator=count=1,type=nvidia-l4`.
- **Terraform (infra/gce/autoscaling):** Set `use_gpu = true` (and optionally `gpu_machine_type`, `gpu_accelerator_type`) so the instance template gets a `guest_accelerator` block (L4) and `on_host_maintenance = "TERMINATE"`.
- Optional env: `GCE_GPU_MACHINE_TYPE=g2-standard-4`, `GCE_GPU_ACCELERATOR_TYPE=nvidia-l4`.
- Kyutai-bridge sidecar: Run the Rust bridge (e.g. in the same image or as a second container) and point `KYUTAI_*_URL` at it; run `scripts/kyutai/benchmark-bridge.sh` on the instance to verify STT/TTS latency.
- For GPU builds use `docker/Dockerfile.agent-gpu` (e.g. in Cloud Build when `GCE_USE_GPU=true`).

### Install moshi-server (Rust)

```bash
cargo install --features cuda moshi-server
```

### Config files

Use configs from [delayed-streams-modeling/configs/](https://github.com/kyutai-labs/delayed-streams-modeling/tree/main/configs):

- STT (en/fr): `config-stt-en_fr-hf.toml`
- STT (en only): `config-stt-en-hf.toml`
- TTS: `config-tts.toml`

### Run STT and TTS servers

**Option A – Docker Compose (recommended for GCE / local GPU):**

Ferni includes configs and a compose file for moshi-server sidecars:

```bash
# From repo root: build and run STT + TTS sidecars (requires NVIDIA GPU)
docker compose -f docker/docker-compose.dsm.yml build
docker compose -f docker/docker-compose.dsm.yml up -d

# Configs: configs/kyutai-stt.toml (port 8089), configs/kyutai-tts.toml (port 8090)
```

**Option B – Manual (clone Kyutai repo):**

```bash
# Terminal 1: STT (e.g. port 8089)
moshi-server worker --config configs/config-stt-en_fr-hf.toml

# Terminal 2: TTS (e.g. port 8090)
moshi-server worker --config configs/config-tts.toml
```

### Ferni env for GCE

```bash
USE_KYUTAI_STT=true
KYUTAI_STT_URL=ws://localhost:8089/api/asr-streaming
USE_KYUTAI_TTS=true
TTS_PROVIDER=kyutai
KYUTAI_TTS_URL=ws://localhost:8090/api/tts_streaming
```

### Health checks for STT/TTS sidecars

When using Kyutai STT or TTS, the voice agent (or UI server) can check sidecar connectivity:

- **Endpoint:** `GET /health/kyutai` or `GET /api/diagnostics/kyutai`
- **Behavior:** If `USE_KYUTAI_STT` or `TTS_PROVIDER=kyutai` is set, attempts a short WebSocket connection to the STT/TTS URLs and returns `stt.ok` / `tts.ok` and latency.
- **Use:** Call before routing traffic or in readiness probes when running with DSM sidecars.

## Phase 2a: Ferni voice embedding (custom voice)

1. **Get ~10s reference audio** – Same speaker, clean (e.g. from Cartesia samples or new recording, WAV 16 kHz mono).
2. **Extract embedding** – Run `./scripts/kyutai/extract-voice.sh path/to/ferni-10s.wav ferni` (see `scripts/kyutai/README.md`). If the Kyutai repo has no extract script yet, follow their docs or place a pre-made `.safetensors` in `models/ferni-voices/ferni/ferni-voice.safetensors`.
3. **Configure TTS** – Use `configs/kyutai-tts-ferni.toml` and mount `models/ferni-voices` to `/voices` in the TTS container so `default_voice = "ferni/ferni-voice.safetensors"` is used.
4. **Tune** – Adjust `cfg_coef` in the config (e.g. 2.0 default; higher = more voice fidelity, may affect quality).

## Phase 2b: Fine-tune TTS (optional)

If voice cloning quality is insufficient, fine-tune Kyutai TTS with LoRA on Ferni conversation (text, audio) pairs (~1–10 hours). See `scripts/kyutai/fine-tune-tts.sh` and data in `data/kyutai-tts-training/`. Use moshi-finetune or Kyutai’s training pipeline; GPU: A100 80GB. After training, quantize for MLX (Mac).

## Phase 2c: STT vocabulary (Ferni terms)

Kyutai STT supports vocabulary steering. Use `data/kyutai-stt-ferni-vocab.txt` (persona names, tool terms) and pass it to the STT server as `--prompt_text` (or equivalent in config) so proper nouns are recognized. Add terms as needed.

## Phase 2d: Per-persona voices and handoff

- **Voice embeddings:** Create one embedding per persona in `models/ferni-voices/<persona>/` (e.g. `ferni/ferni-voice.safetensors`, `maya/maya-voice.safetensors`). Use `scripts/kyutai/extract-voice.sh` for each.
- **Voice switching:** When `TTS_PROVIDER=kyutai`, the Kyutai TTS provider maps persona IDs to voice paths (e.g. `ferni` → `ferni/ferni-voice.safetensors`). On handoff, the gateway passes the new persona’s voiceId, so TTS uses the correct embedding automatically.

## Model specs

| Model | Params | VRAM | Latency |
|-------|--------|------|---------|
| Kyutai STT 1B (en/fr) | ~1B | 2.5 GB | 500 ms delay |
| Kyutai STT 2.6B (en) | ~2.6B | ~5 GB | 2.5 s delay |
| Kyutai TTS 1.6B (en/fr) | ~1.6B | 5.3 GB | 220–350 ms |

## Phase 3: Self-hosted LLM (optional)

- **3a. Fine-tune:** Use `scripts/kyutai/fine-tune-llm.sh`. Data: Ferni conversation transcripts (Firestore L2), persona prompts (`src/personas/bundles/`), tool-calling examples. Base: Qwen2.5-3B-Instruct; LoRA (rank 8–16) with Unsloth; quantize to Q4_K_M GGUF (~2 GB).
- **3b. Deploy:** Add vLLM or llama.cpp as a fourth sidecar on GCE; expose OpenAI-compatible API on localhost:8091; point the voice agent at the local LLM when `USE_LOCAL_LLM=true` (or equivalent).
- **3c. Hybrid routing:** Use self-hosted LLM for simple turns; fall back to cloud (OpenAI/Gemini) for complex reasoning. Compare cost and latency; degrade gracefully if the GPU instance is down.

## Phase 4: Full Moshi end-to-end (optional)

Deploy the full Moshi model (7B, ~4 GB quantized) for true speech-to-speech and full-duplex. Fine-tune with [moshi-finetune](https://github.com/nu-dialogue/moshi-finetune). Use a tool-calling bridge (extract text from Moshi’s Helium layer, route through existing JSON function calling). Hybrid routing: Moshi for simple queries, STT→LLM→TTS for tool-heavy turns.

## References

- [Delayed Streams Modeling (DSM)](https://github.com/kyutai-labs/delayed-streams-modeling)
- [Unmute – voice AI built on Kyutai](https://github.com/kyutai-labs/unmute)
- [DSM pre-print](https://arxiv.org/abs/2509.08753)
