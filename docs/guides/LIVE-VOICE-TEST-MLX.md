# Live Voice Test: Qwen3-Omni (Rust/MLX) E2E + Ferni

Run **full** speech-in → speech-out E2E with the Rust Qwen3-Omni server and Ferni. No Python.

---

## Full E2E with Candle (recommended)

For **real quality** with the **full** Qwen3-Omni-30B-A3B model (~70 GB), use the **Candle** server and the HuggingFace download. No MLX conversion needed.

1. **Download:** `./scripts/qwen3-omni/download-model.sh` (one-time)
2. **Start Candle server:** `OMNI_MODEL_PATH=./models/Qwen3-Omni-30B-A3B-Instruct cargo run --bin qwen3-omni-server --features server --no-default-features -p rust-perf -- --model-path ./models/Qwen3-Omni-30B-A3B-Instruct` (port **8000**)
3. **Start Ferni:** `USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:8000 QWEN3_TTS_URL=http://localhost:8000 pnpm dev` (voice agent terminal)

**Full runbook:** [FULL-E2E-QWEN3-OMNI.md](./FULL-E2E-QWEN3-OMNI.md)

---

## What “minimal” was (avoid it for real use)

**“.test-model” / “minimal”** = a **test-only** tiny checkpoint (64-dim, 2 layers) so the server can start without a real model. Quality is poor; use it only for smoke tests (e.g. “does the server start?”). **For real E2E you want a full Qwen3-Omni checkpoint.**

---

## Full E2E (recommended): use a full checkpoint

For **good quality** speech-in and speech-out, use a **full** Qwen3-Omni checkpoint in MLX format.

### 1. Get a full model

You need a model directory that has:

- **Weights:** `model.safetensors` (or sharded `model-00001-of-0000N.safetensors` + `model.safetensors.index.json` when sharded loading is supported)
- **Config:** `config.json` or `thinker_config.json` (Rust accepts both shapes)
- **Tokenizer:** `tokenizer.json` in the model dir, or set `QWEN3_OMNI_TOKENIZER_PATH` to a path that contains it

**Ways to get a full checkpoint:**

- **Pre-converted MLX:** If you have a Qwen3-Omni checkpoint already converted to MLX (single `model.safetensors` + config + tokenizer), point the server at that dir. The server currently supports a **single** `model.safetensors` file; sharded loading (e.g. `model-00001-of-00003.safetensors` + index) is planned.
- **Convert from HuggingFace:** Official Qwen3-Omni is [Qwen/Qwen3-Omni-30B-A3B-Instruct](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct) (Transformers/vLLM format). Converting that to our MLX format (Thinker + Talker + Code2Wav + audio encoder, key mapping, MoE stacking) requires a conversion step; see `docs/plans/MLX-QWEN3-OMNI-BUILD-PLAN.md` and `MLX-QWEN3-OMNI-FEASIBILITY.md` for options.
- **Candle / other Rust:** The same config/weight layout expected by the Rust MLX server can be produced by other tooling; use that dir as the model path.

### 2. Tokenizer (if not in model dir)

Either put `tokenizer.json` inside the model dir, or:

```bash
export QWEN3_OMNI_TOKENIZER_PATH=/path/to/dir/containing/tokenizer.json
```

You can download the Qwen tokenizer from HuggingFace (e.g. Qwen2.5 or Qwen3-Omni repo) and point this at that directory.

### 3. Start the Rust MLX server

```bash
cd apps/rust-mlx-omni
cargo run --bin mlx-omni-server --features server -- --model /path/to/full/model/dir --port 8800
```

Leave this running. You should see “Model loaded” and “MLX Omni server listening on http://0.0.0.0:8800”.

### 4. Start Ferni (4 terminals)

In **separate** terminals:

| Terminal | Command |
|----------|---------|
| 1 | `pnpm token-server` |
| 2 | `pnpm ui-server` |
| 3 | `cd apps/web && pnpm dev` |
| 4 | `USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:8800 QWEN3_TTS_URL=http://localhost:8800 QWEN3_OMNI_BACKEND=mlx LOG_FULL_RESPONSES=true pnpm dev` |

### 5. Verify and call

1. **Health:** `curl -s http://localhost:8800/health` → `{"status":"ok", "backend":"mlx-rs", ...}`
2. **TTS:** `curl -s -X POST http://localhost:8800/v1/audio/speech -H "Content-Type: application/json" -d '{"input":"Hello"}' -o out.wav && file out.wav` → WAV
3. **App:** Open http://localhost:3004, start a voice room, and talk. You get full E2E: speech-in → Thinker → Talker → Code2Wav → 24 kHz audio.

---

## Optional: test-only “minimal” model

Only if you want to **smoke-test** the server without a full download:

- **Location:** `apps/rust-mlx-omni/.test-model` (tiny 64-dim, 2-layer checkpoint; quality is bad).
- **Tokenizer:** Add `tokenizer.json` into `.test-model` or set `QWEN3_OMNI_TOKENIZER_PATH`.
- **Run:** `cargo run --bin mlx-omni-server --features server -- --model .test-model --port 8800`

Use this to confirm the server and Ferni wiring; for “working perfectly E2E” use a **full** checkpoint as above.

---

## Environment reference

| Variable | Value for MLX E2E |
|----------|-------------------|
| `USE_QWEN3_OMNI` | `true` |
| `QWEN3_OMNI_URL` | `http://localhost:8800` |
| `QWEN3_TTS_URL` | `http://localhost:8800` (same server) |
| `QWEN3_OMNI_BACKEND` | `mlx` |
| `QWEN3_OMNI_TOKENIZER_PATH` | Optional; dir or path to `tokenizer.json` if not in model dir |
| `LOG_FULL_RESPONSES` | `true` (optional, for debugging) |

---

## Troubleshooting

- **Failed to load tokenizer:** Add `tokenizer.json` to the model dir or set `QWEN3_OMNI_TOKENIZER_PATH`.
- **503 / connection refused:** Start the Rust MLX server first; ensure port 8800 is free.
- **Poor or broken audio:** You are likely using the test-only `.test-model`. Use a **full** Qwen3-Omni checkpoint for real E2E quality.
