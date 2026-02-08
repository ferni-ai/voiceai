# ONNX and Candle: What Runs Where (Local vs GCE)

**Short answers:**

- **Stack:** **ONNX** (tool router) and **Candle** (Qwen3-Omni Thinker + full Omni pipeline). **Rust + TypeScript only**; no Python in repo.
- **Best perf per platform:** Mac → Candle (Rust, Metal) in-repo, or **MLX (external server)** via `QWEN3_OMNI_BACKEND=mlx` for best Apple Silicon. GCE → Candle (Rust, CPU) or vLLM (external).
- **Can we run locally and on GCE?** Locally (Mac): ONNX + Candle Metal (or point at MLX server). GCE (Linux): ONNX and Candle run on CPU (or vLLM). “Flawless” depends on real checkpoints and full implementations (Talker/Code2Wav still stubs).

---

## 1. What Each Stack Is

| Stack      | Purpose                                                                                                         | Where it runs                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **ONNX**   | **Tool router (FTIS)** – two-stage classifier for intent → tool routing. Qwen3-1.7B–style model.                | Mac (Core ML try, else CPU), Linux/GCE (CPU). |
| **Candle** | **Qwen3-Omni in Rust** – Thinker (+ optional full pipeline: Mel, encoder, Thinker, Talker stub, Code2Wav stub). | Mac (Metal), Linux/GCE (CPU).                 |

So: ONNX (tool routing) and Candle (Omni Thinker/pipeline). Optional: **MLX** (Mac, external server) or **vLLM** (external) for best GPU perf; no Python in this repo.

---

## 2. Local (macOS)

| Component                       | Runs? | Notes                                                                                                                               |
| ------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **ONNX (tool router)**          | ✅    | Node + Rust OnnxRouter. Core ML tried on Mac; fallback CPU.                                                                         |
| **Candle (Thinker)**            | ✅    | rust-perf/rust-omni – Metal. HF safetensors load directly (Thinker supports `model.thinker.text_model.*` keys).                     |
| **Candle (full Omni pipeline)** | ✅    | Mel → encoder → Thinker (layer 24) → Talker stub → Code2Wav stub. Needs 30B checkpoint for real weights; Talker/Code2Wav are stubs. |
| **MLX (external server)**       | ✅    | Optional: set `QWEN3_OMNI_BACKEND=mlx` and `QWEN3_OMNI_URL` to your MLX server for best Apple Silicon perf. No Python in this repo. |

**Flawless locally:** Yes for ONNX + Candle. For best Mac GPU perf, run an MLX server externally and use backend=mlx. Full Candle Omni is “flawless” for wiring and shapes; real audio quality needs Talker/Code2Wav implemented and audio→Thinker injection.

---

## 3. GCE (Linux)

| Component                       | Runs? | Notes                                                                |
| ------------------------------- | ----- | -------------------------------------------------------------------- |
| **ONNX (tool router)**          | ✅    | CPU. Rust `ort` and Node onnxruntime; no Core ML on Linux.           |
| **Candle (Thinker)**            | ✅    | CPU. `candle-core` without Metal on `cfg(not(target_os = "macos"))`. |
| **Candle (full Omni pipeline)** | ✅    | CPU. Same pipeline as Mac; Talker/Code2Wav still stubs.              |

**Flawless on GCE:** ONNX and Candle run. Production voice agent on GCE today is typically **Whisper (STT) + Thinker (Candle CPU or remote vLLM) + TTS**; full Candle Omni (audio→audio) can run on GCE CPU but is not yet “full” (stubs, no audio conditioning).

---

## 4. Summary Table

|                        | Local (Mac)                     | GCE (Linux)    |
| ---------------------- | ------------------------------- | -------------- |
| **ONNX (FTIS)**        | ✅ Core ML try / CPU            | ✅ CPU         |
| **Candle (Thinker)**   | ✅ Metal (Rust, in-repo)        | ✅ CPU         |
| **Candle (full Omni)** | ✅ Metal (stubs)                | ✅ CPU (stubs) |
| **MLX (external)**     | ✅ Optional, best Apple Silicon | ❌ N/A         |
| **vLLM (external)**    | Optional                        | ✅ Optional    |

---

## 5. References

- **ONNX / Apple:** `docs/guides/ONNX-APPLE-GPU-BUILD.md`
- **Candle Omni audit:** `docs/architecture/QWEN3-OMNI-CANDLE-AUDIT.md`
- **Whisper vs Qwen3-Omni:** `docs/architecture/RUST-OMNI-WHISPER-VS-QWEN.md`
- **GCE deploy:** `ferni deploy gce` / `apps/cli/src/commands/deploy/deploy-gce.ts`
- **MLX + local + GCE E2E:** `docs/guides/QWEN3-OMNI-LOCAL-AND-GCE.md`
