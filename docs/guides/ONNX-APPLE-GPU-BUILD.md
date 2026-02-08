# ONNX and Apple GPU Builds

How to get inference running on **ONNX** and **Apple GPUs** (Metal / Core ML / Neural Engine) for local and Mac builds.

---

## Does everything run on Mac GPUs?

**In this repo:**

| Component                | Mac GPU?                  | How                                                                                                                                                                       |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool router (FTIS)**   | ✅ Yes (with one step)    | Core ML when using **embedded** ONNX models; otherwise CPU fallback. Node ONNX path also uses Core ML on darwin.                                                          |
| **CandleRouter (Metal)** | ✅ Yes (built, not wired) | Metal on Apple Silicon; not used by the classifier yet (needs Candle-format model).                                                                                       |
| **Qwen3-Omni Thinker**   | ❌ Separate service       | The Thinker (vLLM / chat completions) runs in its own process or server. vLLM can run on Mac with Metal elsewhere; this repo does not run the Thinker locally by default. |

So **tool routing** can run on Mac GPUs (Core ML or Metal path). The **conversation model (Qwen3-Omni)** is a separate Thinker service; run it where you deploy (e.g. vLLM on Linux/GPU or a Mac Metal build of vLLM if you set that up).

**Full Omni on Mac GPU (Thinker + STT + Tools + TTS):** For running the **whole Omni package** E2E on Mac (Thinker, native STT, tools, TTS) with Rust + Metal where possible, see **[MAC-GPU-OMNI-FULL-STACK-PLAN.md](../plans/MAC-GPU-OMNI-FULL-STACK-PLAN.md)**. That plan covers mlx-omni-server as Mac Thinker, optional Rust STT (whisper-rs + Metal), tools (Core ML/Metal), and native TTS.

---

## Summary

| Path                           | ONNX                  | Apple GPU                   | Notes                                                                                    |
| ------------------------------ | --------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| **Node (transformers-loader)** | ✅ `onnxruntime-node` | ✅ **Core ML** on macOS     | Use Core ML by default on darwin; set `ONNX_USE_COREML=false` to disable.                |
| **Rust FTIS (OnnxRouter)**     | ✅ ONNX Runtime       | ✅ **Core ML try** on macOS | On Mac: tries Core ML first, falls back to CPU if model uses external data (.onnx_data). |
| **Rust CandleRouter**          | N/A (Candle format)   | ✅ **Metal** on macOS       | Built when target is macOS; uses Apple Silicon GPU. Not wired to classifier yet.         |

---

## 1. Node: ONNX + Core ML (Apple GPU)

The Node.js ONNX path (`src/utils/transformers-loader.ts`) uses **onnxruntime-node**. On **macOS (darwin)** we register the **Core ML** execution provider so inference can use Apple GPU and Neural Engine.

- **Default on Mac:** Core ML is used when creating sessions (with CPU fallback).
- **Opt-out:** Set `ONNX_USE_COREML=false` to force CPU-only.

Prebuilt **onnxruntime-node** npm binaries for macOS (x64 and arm64) include Core ML; no custom build is required.

**Who uses this:** Any code that calls `createInferenceSession()` from `transformers-loader.ts`. The main FTIS classifier uses the Rust OnnxRouter instead (see below).

---

## 2. Rust: OnnxRouter (FTIS classifier)

The **hierarchical classifier** (tool routing) uses **Rust OnnxRouter** from `@ferni/perf` (`apps/rust-perf`), not the Node `createInferenceSession` path.

- **ONNX:** Yes – ONNX Runtime in Rust.
- **Apple GPU (macOS):** On Mac, OnnxRouter **tries Core ML first** (Apple GPU/Neural Engine). If the model uses **external data** (separate `.onnx_data` file), Core ML cannot load it and we **fall back to CPU** automatically. So:
  - **Current V7 models** (with `.onnx_data`): Core ML try fails → CPU used. No extra steps.
  - **If you use an embedded-weight ONNX model**: Core ML will be used on Mac for GPU/ANE acceleration.

Build with Core ML support: `ort` in `apps/rust-perf/Cargo.toml` has the `coreml` feature enabled. Build on macOS with `pnpm build` in `apps/rust-perf`.

**Optional: embed ONNX weights for Core ML.** If you want the FTIS classifier to use Core ML on Mac (instead of CPU fallback), embed external data into a single `.onnx` file so Core ML can load it:

```bash
pip install onnx
python scripts/embed-onnx-weights.py models/ferni-router-v7-stage1
python scripts/embed-onnx-weights.py models/ferni-router-v7-stage2
```

This creates `model_embedded.onnx` in each directory. Point the hierarchical classifier at `model_embedded.onnx` (e.g. via env or config) on macOS to use Core ML for those models.

---

## 3. Rust: CandleRouter (Metal on Apple Silicon)

`apps/rust-perf` includes **CandleRouter**, which uses the **Candle** ML framework with **Metal** on macOS for Apple Silicon GPU.

- **Build:** On macOS, `candle-core` is built with the `metal` feature (`apps/rust-perf/Cargo.toml`). No extra flags needed; build on a Mac to get Metal.
- **Usage:** CandleRouter is not currently used by the hierarchical classifier; the classifier uses OnnxRouter. CandleRouter would require a Candle-compatible model (e.g. safetensors), not the current ONNX export.

So today:

- **Build that works on ONNX:** Use the existing setup; OnnxRouter (CPU) is the active path.
- **Build that uses Apple GPU (Metal):** Build `@ferni/perf` on macOS; CandleRouter is available for future use when a Candle-format model and wiring exist.

---

## 4. Creating a build that works on ONNX or Apple GPUs

### ONNX (current production)

- **Node:** Install and run as usual. On Mac, Core ML is used for any session created via `createInferenceSession()` unless `ONNX_USE_COREML=false`.
- **Rust (FTIS):** Build `@ferni/perf` on any supported host. OnnxRouter runs on CPU; no extra steps.

### Apple GPUs (run flawlessly on Mac)

- **Core ML (Node):** Use a Mac; ensure `ONNX_USE_COREML` is not set to `'false'`. Uses prebuilt `onnxruntime-node` with Core ML for any `createInferenceSession()` usage.
- **Core ML (Rust FTIS):** On macOS, build `@ferni/perf`; OnnxRouter tries Core ML first, then CPU fallback:
  ```bash
  cd apps/rust-perf
  pnpm build
  ```
  If the model uses external data (current V7 stage1/stage2), you’ll see “Core ML unavailable or model incompatible, using CPU” and CPU is used. If you switch to embedded-weight ONNX models, Core ML will be used automatically.
- **Metal (Rust CandleRouter):** Same build on macOS; CandleRouter uses Metal when available. Not used by the classifier today (requires Candle-format model).

### Environment variables

| Variable          | Default             | Effect                                                                     |
| ----------------- | ------------------- | -------------------------------------------------------------------------- |
| `ONNX_USE_COREML` | (enabled on darwin) | Set to `false` to disable Core ML and use CPU only for Node ONNX sessions. |

---

## 5. References

- ONNX Runtime: [Core ML Execution Provider](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)
- Rust OnnxRouter: `apps/rust-perf/src/onnx_router.rs` (Core ML try on macOS, CPU fallback)
- Rust CandleRouter: `apps/rust-perf/src/candle_router.rs` (Metal on macOS)
- Node ONNX loader: `src/utils/transformers-loader.ts` (Core ML on darwin)
- Tool router: `src/tools/semantic-router/advanced/intelligent/hierarchical-classifier.ts` (uses OnnxRouter)
