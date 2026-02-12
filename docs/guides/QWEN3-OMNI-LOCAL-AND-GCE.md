# Qwen3-Omni: Local (Mac) and GCE E2E

How to run Qwen3-Omni **perfectly locally** (Mac) and **E2E on GCE**, and how **MLX** fits in when it exists.

---

## 1. Local (Mac) – What Works Today

### Option A: Candle in-process (recommended for local)

Uses the Rust/Candle pipeline **inside the Node process** (NAPI). No separate server. Best latency.

**Prerequisites:** Model downloaded (see `scripts/qwen3-omni/download-model.sh`).

```bash
# .env or export
USE_QWEN3_OMNI=true
QWEN3_OMNI_BACKEND=candle
USE_QWEN3_OMNI_FULL_STACK=true
# Paths read by voice-agent-entry when BACKEND=candle (NativeOmniRealtimeModel)
QWEN3_OMNI_MODEL_PATH=/path/to/models/Qwen3-Omni-30B-A3B-Instruct
QWEN3_OMNI_TOKENIZER_PATH=/path/to/models/Qwen3-Omni-30B-A3B-Instruct/tokenizer.json

pnpm dev
```

- **Metal** is used automatically on Mac (Candle `Device::new_metal(0)`).
- Pipeline: Mel → Audio Encoder → Thinker → Talker → Code2Wav → 24 kHz audio.
- No HTTP server; `NativeOmniRealtimeModel` talks to `ferni-omni` NAPI.

### Option B: Candle HTTP server (same stack, different process)

Run the Rust server in one terminal, voice agent in another. Useful if you want to restart the agent without reloading the model.

**Terminal 1 – Rust server:**
```bash
cd apps/rust-perf
# From repo root; Rust server reads OMNI_MODEL_PATH or --model-path
cd apps/rust-perf
OMNI_MODEL_PATH=/path/to/models/Qwen3-Omni-30B-A3B-Instruct \
  cargo run --bin qwen3-omni-server --features server --no-default-features -- \
  --model-path /path/to/models/Qwen3-Omni-30B-A3B-Instruct
```

**Terminal 2 – Voice agent (HTTP client):**
```bash
# Do NOT set QWEN3_OMNI_BACKEND=candle so the agent uses HTTP
USE_QWEN3_OMNI=true
USE_QWEN3_OMNI_FULL_STACK=true
QWEN3_OMNI_URL=http://localhost:8000

pnpm dev
```

### Validate locally

```bash
# E2E with real checkpoint (Rust server + Node NAPI test)
# Script may use OMNI_MODEL_PATH / OMNI_TOKENIZER_PATH; agent uses QWEN3_OMNI_* (see below)
OMNI_MODEL_PATH=./models/Qwen3-Omni-30B-A3B-Instruct \
OMNI_TOKENIZER_PATH=./models/Qwen3-Omni-30B-A3B-Instruct/tokenizer.json \
  ./scripts/qwen3-omni/e2e-validate-omni-pipeline.sh

# NAPI shape test (test mode, no weights)
npx tsx scripts/qwen3-omni/e2e-native-sts-test.ts
```

---

## 2. MLX – When It Exists

**Current state:** The **Rust** MLX Qwen3-Omni server in `apps/rust-mlx-omni` provides full E2E (chat, speech, transcriptions). No Python required.

**To run the MLX Qwen3-Omni server:**

1. Run the **Rust** MLX server so it exposes **OpenAI-compatible** endpoints:
   ```bash
   cd apps/rust-mlx-omni && cargo run --bin mlx-omni-server --features server -- --model /path/to/model --port 8800
   ```
   - `POST /v1/chat/completions`
   - `POST /v1/audio/transcriptions` (if you use it for STT)
   - `POST /v1/audio/speech` (if you use it for TTS)
2. Point the Ferni voice agent at it:

```bash
USE_QWEN3_OMNI=true
QWEN3_OMNI_BACKEND=mlx
QWEN3_OMNI_URL=http://localhost:8800   # Rust MLX server (apps/rust-mlx-omni)

pnpm dev
```

The existing client (`Qwen3OmniClient`, `getQwen3OmniConfig()`) already uses `serverUrl` for all HTTP calls. No code change needed; only config.

**Until then:** Use **Candle (Metal)** on Mac for full Qwen3-Omni (in-process or HTTP as above). For a different “MLX stack” (e.g. Gemma + STT/TTS), see [MAC-GPU-OMNI-FULL-STACK-PLAN.md](../plans/MAC-GPU-OMNI-FULL-STACK-PLAN.md) and `mlx-omni-server` (non–Qwen3-Omni).

**Feasibility of building MLX Qwen3-Omni:** See [MLX-QWEN3-OMNI-FEASIBILITY.md](../plans/MLX-QWEN3-OMNI-FEASIBILITY.md).

---

## 3. GCE E2E – Two Patterns

### Pattern 1: Voice agent + Candle in the same container (optional)

Run the full Candle pipeline **inside** the voice-agent container on GCE. The model must be available to the container (e.g. mounted disk or downloaded at startup).

**Constraints:**

- **CPU only** on GCE (no Metal). The 30B model is heavy for CPU; expect high memory and slower inference.
- Need **~75 GB** for the model (persistent disk or NFS).
- Deploy must pass `OMNI_MODEL_PATH` and `OMNI_TOKENIZER_PATH` (and optionally `USE_QWEN3_OMNI`, `QWEN3_OMNI_BACKEND=candle`) into the container.

**Implementing it:**

1. **Model on GCE:**  
   - Option A: Attach a large persistent disk to the VM, download/copy the model once (e.g. `scripts/qwen3-omni/download-model.sh` with `HF_TOKEN`), mount it into the container.  
   - Option B: Store weights in GCS, and have an entrypoint script in the image download/cache them to a volume before starting the agent.

2. **Deploy (ferni deploy gce):**  
   - Add optional env (or from Secret Manager) such as:
     - `QWEN3_OMNI_MODEL_PATH=/path/inside/container/to/model`
     - `QWEN3_OMNI_TOKENIZER_PATH=/path/inside/container/to/model/tokenizer.json`
   - If you want Qwen3-Omni on by default on GCE, also set:
     - `USE_QWEN3_OMNI=true`
     - `QWEN3_OMNI_BACKEND=candle`
     - `USE_QWEN3_OMNI_FULL_STACK=true` (if you use full stack).

3. **Dockerfile.agent:**  
   - No need to bake the model into the image if you mount it or download at startup.  
   - Ensure the Rust/NAPI build (rust-perf, ferni-omni) is included (already is for the agent image).

4. **Machine type:**  
   - Use a large-memory instance (e.g. `e2-highmem-*` or `n2-highmem-*`) so the 30B Candle model fits and runs on CPU.

This gives you **E2E on GCE with Candle in the same box as the voice agent**, at the cost of a big VM and CPU inference.

### Pattern 2: Separate Qwen3-Omni server (recommended for GCE)

Run the Rust **qwen3-omni-server** (or vLLM) on a **dedicated** VM/instance with the model (and GPU if you use vLLM). The voice agent on GCE stays a normal, smaller container and talks to that server over HTTP.

**Steps:**

1. **Server VM:**  
   - One GCE (or GKE) instance with enough disk/RAM (and GPU if vLLM).  
   - Install/run `qwen3-omni-server` with `--model-path` (or run vLLM with Qwen3-Omni).  
   - Open firewall for the port (e.g. 8000) from the voice-agent VMs.

2. **Voice agent:**  
   - No Candle, no model in the agent container.  
   - Set:
     - `USE_QWEN3_OMNI=true`
     - `QWEN3_OMNI_URL=http://<omni-server-internal-ip>:8000`  
   - Do **not** set `QWEN3_OMNI_BACKEND=candle` so the agent uses HTTP only.

3. **E2E:**  
   - Place a call; the agent sends audio to the Omni server and gets responses.  
   - Same client code path as local HTTP (SessionManagerRealtimeModel, etc.).

**Why this is often better on GCE:**  
- Agent stays small and fast to deploy.  
- You can scale the Omni server independently (e.g. GPU for vLLM).  
- No 70GB+ in the voice-agent image or startup.

---

## 4. Summary

| Goal              | Solution |
|-------------------|----------|
| **Local Mac**     | Candle in-process (`QWEN3_OMNI_BACKEND=candle` + model path) or Candle HTTP server. |
| **MLX**           | Not available yet for Qwen3-Omni; when it is, set `BACKEND=mlx` and `QWEN3_OMNI_URL`. |
| **GCE E2E**       | (1) Candle in agent container + mounted model + big VM, or (2) Separate Omni server + agent with `QWEN3_OMNI_URL`. |

**Next steps:**

- **Local:** Use Option A (in-process) with your downloaded model; run `e2e-validate-omni-pipeline.sh` and the NAPI test script.
- **MLX:** Track MLX / Qwen repos for a Qwen3-Omni port; no Ferni code change needed beyond env.
- **GCE:** Choose Pattern 1 (Candle in container) or 2 (separate server); then add the corresponding env/mounts to `ferni deploy gce` (and optionally secrets for paths or URLs).

---

## 5. Env reference (what the code reads)

| Env | Used by | Purpose |
|-----|---------|---------|
| `USE_QWEN3_OMNI` | factory, voice-agent-entry | Enable Qwen3-Omni path. |
| `QWEN3_OMNI_BACKEND` | config, factory | `candle` = in-process NAPI; `vllm` / `mlx` = HTTP client. |
| `QWEN3_OMNI_URL` | config, client | Base URL when using HTTP (vLLM/MLX or Candle server). |
| `QWEN3_OMNI_MODEL_PATH` | voice-agent-entry | Model dir for Candle NAPI (NativeOmniRealtimeModel). |
| `QWEN3_OMNI_TOKENIZER_PATH` | voice-agent-entry | Tokenizer path for Candle NAPI. |
| `OMNI_MODEL_PATH` / `OMNI_TOKENIZER_PATH` | Rust server, E2E scripts | Same paths for Rust binary and validation scripts. |
