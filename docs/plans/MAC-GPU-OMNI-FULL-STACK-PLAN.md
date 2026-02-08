# Mac GPU Omni Full Stack Plan

**Goal:** Run the **whole Omni package** E2E on Mac GPUs with **Rust + Mac-native** where possible: **Thinker (Qwen3-Omni-style), native STT, tools, TTS** – all on Apple Silicon (Metal / Core ML).

---

## Target Architecture

| Component   | Today                         | Mac GPU / Rust-native target                                                                            |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Thinker** | vLLM/HTTP (Linux or remote)   | **MLX on Mac**: mlx-omni-server or vLLM-Metal; Qwen3-Omni MLX when available                            |
| **STT**     | LiveKit/Deepgram or Thinker   | **Rust + Metal**: whisper-rs (whisper.cpp with Metal) **or** mlx-omni-server `/v1/audio/transcriptions` |
| **Tools**   | Rust OnnxRouter (Core ML try) | **Already Mac GPU**: Core ML (embedded ONNX) + CandleRouter (Metal when wired)                          |
| **TTS**     | Cartesia (cloud)              | **Mac-native**: mlx-omni-server `/v1/audio/speech` **or** Rust wrapper around native TTS                |

---

## 1. Thinker on Mac GPU

**Options (in order of fit):**

### A. mlx-omni-server (recommended for “full Omni on Mac” today)

- **What:** [mlx-omni-server](https://pypi.org/project/mlx-omni-server/) – OpenAI/Anthropic-compatible server on **Apple Silicon** using MLX (Metal).
- **APIs:** `/v1/chat/completions`, `/v1/audio/speech` (TTS), `/v1/audio/transcriptions` (STT), `/v1/embeddings`, etc.
- **Models:** MLX-community models (e.g. Gemma, Qwen3 text models). **Not** full Qwen3-Omni multimodal yet; use for chat + STT + TTS locally until Qwen3-Omni MLX exists.
- **Setup:**
  ```bash
  pip install mlx-omni-server
  mlx-omni-server  # port 10240 by default
  ```
- **Integration:** Point `QWEN3_OMNI_URL` (or a new `MAC_OMNI_THINKER_URL`) at `http://localhost:10240/v1`. Use same chat completions + optional STT/TTS endpoints for a single Mac-native “Omni” server.

### B. vLLM-Metal / vllm-mlx

- **What:** Community Metal/MLX backends for vLLM-style serving on Mac.
- **Use when:** You need vLLM-compatible API and are okay with community builds. Check [vllm-metal](https://github.com/vllm-project/vllm-metal) and [vllm-mlx](https://github.com/waybarrios/vllm-mlx) for Qwen3-Omni support as it appears.

### C. Qwen3-Omni on MLX (when available)

- **Status:** Qwen3-Omni (full multimodal + audio) does **not** have an official MLX release yet. Qwen3 **text** models exist in MLX (e.g. `Qwen/Qwen3-0.6B-MLX-4bit`, `LibraxisAI/Qwen3-14b-MLX-Q5`).
- **Action:** When the community or Qwen releases **Qwen3-Omni** in MLX, swap the model in mlx-omni-server (or the chosen Mac Thinker) and keep the same client wiring.
- **Building an MLX port ourselves:** See [MLX-QWEN3-OMNI-FEASIBILITY.md](./MLX-QWEN3-OMNI-FEASIBILITY.md) for scope and [MLX-QWEN3-OMNI-BUILD-PLAN.md](./MLX-QWEN3-OMNI-BUILD-PLAN.md) for the phased E2E build plan (we own the stack).

**Implementation (Phase 1):**

- Add env: `MAC_OMNI_USE_MLX=true` and `MAC_OMNI_THINKER_URL=http://localhost:10240` (or reuse `QWEN3_OMNI_URL`).
- When on darwin and `MAC_OMNI_USE_MLX=true`, voice agent uses `MAC_OMNI_THINKER_URL` for chat completions (and optionally STT/TTS from the same server).
- Document in [DIRECTOR-MODE-LOCAL-DEV.md](../guides/DIRECTOR-MODE-LOCAL-DEV.md) and [STRESS-TEST-QWEN-OMNI.md](../guides/STRESS-TEST-QWEN-OMNI.md): “For full Mac GPU Omni, run mlx-omni-server and set MAC_OMNI_THINKER_URL.”

---

## 2. Native STT on Mac (Rust + Metal)

**Options:**

### A. whisper-rs (Rust bindings to whisper.cpp)

- **What:** [whisper-rs](https://crates.io/crates/whisper-rs) – Rust bindings for [whisper.cpp](https://github.com/ggml-org/whisper.cpp). whisper.cpp supports **Metal** on Apple Silicon.
- **Where:** New crate or module in `apps/rust-perf` (e.g. `stt_whisper` feature) or a dedicated `apps/rust-stt` that exposes a single `transcribe(audio) -> String` API for Node via NAPI.
- **Build:** Depend on whisper.cpp (git submodule or system lib); build with Metal for macOS. Link from Rust and expose to Node.

### B. mlx-omni-server `/v1/audio/transcriptions`

- **What:** Use the same Mac-native server for STT (OpenAI-compatible transcriptions).
- **Pros:** No extra Rust STT; one server for Thinker + STT + TTS. **Cons:** Not Rust; depends on Python/MLX server.

**Recommendation:**

- **Phase 1:** Use mlx-omni-server for STT (and TTS) so the full Omni stack runs E2E on Mac with one process.
- **Phase 2:** Add optional **Rust STT** via whisper-rs + Metal for a fully Rust/native STT path; keep mlx-omni-server as fallback or for non-Rust builds.

---

## 3. Tools (already Mac GPU–capable)

- **OnnxRouter (Rust):** Core ML on macOS when the model is a single file. Use embedded ONNX:
  ```bash
  python scripts/embed-onnx-weights.py models/ferni-router-v7-stage1
  python scripts/embed-onnx-weights.py models/ferni-router-v7-stage2
  ```
  Point the hierarchical classifier at `model_embedded.onnx` on darwin so FTIS runs on Core ML.
- **CandleRouter (Rust):** Metal on Apple Silicon; not wired to the classifier yet. Optional Phase 2: export FTIS to Candle/safetensors and wire CandleRouter so tools run on Metal.

No change required for “tools on Mac GPU” beyond using embedded ONNX and, optionally, wiring CandleRouter later.

---

## 4. Native TTS on Mac

**Options:**

### A. mlx-omni-server `/v1/audio/speech`

- **What:** Same server as Thinker + STT; OpenAI-compatible TTS.
- **Pros:** One Mac-native process; consistent with “full Omni on Mac.” **Cons:** Not Rust; quality depends on MLX TTS model.

### B. Rust + native TTS

- **Options:** Piper-rs (if available), or Rust FFI to a C library (e.g. espeak, or a small onnx/Core ML TTS). Apple’s `NSSpeechSynthesizer` is ObjC; would need a small C/ObjC bridge from Rust.
- **Recommendation:** Phase 1 use mlx-omni-server TTS; Phase 2 explore Rust/Core ML TTS if we want everything in Rust.

---

## 5. E2E “Whole Omni on Mac GPU” Flow

1. **Start mlx-omni-server** (or future Qwen3-Omni MLX server) on Mac.
2. **Voice agent** (Node + Rust):
   - **STT:** Call mlx-omni-server `/v1/audio/transcriptions` (or, Phase 2, Rust whisper-rs + Metal).
   - **Thinker:** Call mlx-omni-server `/v1/chat/completions` (same as current Thinker client with different base URL).
   - **Tools:** Rust OnnxRouter with embedded ONNX → Core ML (or CandleRouter → Metal when wired).
   - **TTS:** Call mlx-omni-server `/v1/audio/speech` (or, Phase 2, Rust/native TTS).
3. **Director / Qwen3-Omni UI:** Unchanged; only the backend URLs and “use Mac Omni” flag change.

---

## 6. Phased Implementation

| Phase | Deliverable                                                                                                                                           | Owner          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **1** | Document mlx-omni-server as Mac Thinker + STT + TTS; add `MAC_OMNI_USE_MLX` and `MAC_OMNI_THINKER_URL`; wire agent to use it on darwin when set.      | Backend + docs |
| **2** | Optional Rust STT: whisper-rs + whisper.cpp (Metal) in `apps/rust-perf` or new crate; NAPI for Node; env to choose “Rust STT” vs mlx-omni-server STT. | Platform       |
| **3** | Prefer embedded ONNX on darwin (classifier loads `model_embedded.onnx` when present) so tools always use Core ML on Mac.                              | Platform       |
| **4** | When Qwen3-Omni MLX exists: document and support it as the Mac Thinker model (same client, new model name/URL).                                       | Backend        |
| **5** | (Optional) Wire CandleRouter to classifier with Candle-format FTIS model for Metal tools.                                                             | Platform       |
| **6** | (Optional) Rust or Core ML TTS path for full Rust/native TTS on Mac.                                                                                  | Platform       |

---

## 7. Environment Variables (proposed)

| Variable               | Default                  | Purpose                                                                          |
| ---------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| `MAC_OMNI_USE_MLX`     | `false`                  | When `true` and platform is darwin, use Mac-native Omni stack (mlx-omni-server). |
| `MAC_OMNI_THINKER_URL` | `http://localhost:10240` | Base URL for mlx-omni-server (chat, STT, TTS).                                   |
| `QWEN3_OMNI_URL`       | (unchanged)              | Thinker URL when not using Mac Omni (vLLM, etc.).                                |
| `MAC_OMNI_STT_RUST`    | `false`                  | When `true`, use Rust whisper-rs STT instead of mlx-omni-server transcriptions.  |

---

## 8. References

- [ONNX-APPLE-GPU-BUILD.md](../guides/ONNX-APPLE-GPU-BUILD.md) – Core ML + Metal tool routing
- [E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md](./E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md) – E2E and Mac GPU phase
- mlx-omni-server: https://pypi.org/project/mlx-omni-server/ , https://github.com/madroidmaq/mlx-omni-server
- whisper.cpp (Metal): https://github.com/ggml-org/whisper.cpp
- whisper-rs: https://crates.io/crates/whisper-rs
- vLLM-Metal: https://github.com/vllm-project/vllm-metal
- Qwen3-Omni: https://github.com/QwenLM/Qwen3-Omni ; Hugging Face `Qwen/Qwen3-Omni-30B-A3B-Instruct`

---

## 9. Summary

- **Thinker on Mac GPU:** Use **mlx-omni-server** today (chat + STT + TTS on MLX); switch to **Qwen3-Omni MLX** when a model is available.
- **STT:** Use mlx-omni-server transcriptions first; add **Rust + Metal** via **whisper-rs** (whisper.cpp) for a native STT path.
- **Tools:** Already Mac GPU–ready with **embedded ONNX + Core ML**; optionally **CandleRouter (Metal)** when wired.
- **TTS:** Use mlx-omni-server `/v1/audio/speech` first; optional Rust/native TTS later.

That gives you **everything E2E on Rust and Mac GPU**: native STT (Rust + Metal), tools (Rust + Core ML/Metal), and the whole Omni package (Thinker + STT + TTS) on Mac via mlx-omni-server until Qwen3-Omni runs on MLX.
