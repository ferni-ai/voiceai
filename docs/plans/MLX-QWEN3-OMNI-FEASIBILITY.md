# MLX Implementation of Qwen3-Omni: Feasibility

**Question:** Can we build an MLX implementation of Qwen3-Omni?

**Short answer:** **Yes, it’s feasible**, but it’s a **major project**. There is no official or community MLX port of Qwen3-Omni today. Building one would mean porting the **Thinker** (MoE + multimodal encoders) and **Talker** (streaming speech) stacks to MLX, plus conversion and testing.

---

## 1. What Qwen3-Omni Is

Qwen3-Omni is a **natively omni-modal** model from Alibaba’s Qwen team:

| Component    | Role                            | Tech                                                                  |
| ------------ | ------------------------------- | --------------------------------------------------------------------- |
| **Thinker**  | Multimodal understanding → text | MoE transformer; text, image, **audio**, **video** in; text out       |
| **Talker**   | Streaming speech out            | Multi-codebook decoder, MTP residual codebooks, **Code2Wav** renderer |
| **Encoders** | Audio / image / video           | **AuT** audio encoder (20M hrs); vision encoders for image/video      |

- **Official stack:** Hugging Face Transformers (`Qwen3OmniMoeForConditionalGeneration`, `Qwen3OmniMoeProcessor`), **vLLM** (vLLM-Omni), DashScope API. PyTorch/CUDA; no MLX.
- **Model size:** Qwen3-Omni-30B-A3B (30B params, ~3B active MoE). Also Thinking-only and Captioner variants.

So an “MLX implementation” means implementing **Thinker + Talker + encoders** in MLX and a path from HF/vLLM weights to MLX.

---

## 2. What Exists Today

| Ecosystem                     | Qwen3-Omni support                      | MLX                                                           |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| **Hugging Face Transformers** | ✅ Full (4.57.3)                        | ❌ PyTorch only                                               |
| **vLLM / vLLM-Omni**          | ✅ Full (0.13+)                         | ❌ CUDA; vLLM-Metal/MLX are separate, no Qwen3-Omni there yet |
| **mlx-lm**                    | ❌ No Qwen3-Omni                        | ✅ Text LLMs only; no multimodal, no audio I/O                |
| **mlx-vlm**                   | ❌ No Qwen3-Omni                        | ✅ Vision-language (image + text), no audio                   |
| **mlx-omni-server**           | ❌ Other models (e.g. Gemma)            | ✅ Chat + STT + TTS on MLX; not Qwen3-Omni                    |
| **MLX Community (HF)**        | Qwen3 **text** (e.g. 0.6B, 14B 4bit/Q5) | ✅ Text only, not Omni                                        |

So: **no MLX implementation of Qwen3-Omni** exists yet. Only text Qwen3 variants are available in MLX.

---

## 3. What Building an MLX Implementation Would Require

### 3.1 Thinker (multimodal MoE → text)

- **MoE transformer** in MLX: map `Qwen3OmniMoe` (or equivalent) from PyTorch to MLX (layers, attention, MoE routing, norms).
- **Multimodal encoders in MLX:**
  - **AuT audio encoder** (and any audio front-end): port or bind; large, trained on 20M hrs.
  - **Image encoder(s):** port or reuse existing MLX vision components if compatible.
  - **Video encoder(s):** port or adapt; often the heaviest part.
- **Processor / tokenizer:** chat template, modality tokens, padding; either port `Qwen3OmniMoeProcessor` or reimplement behavior in MLX pipeline.
- **Weights:** conversion from Hugging Face (safetensors) to MLX format; handle MoE and any custom ops.

### 3.2 Talker (streaming speech)

- **Multi-codebook decoder** in MLX: autoregressive codebook prediction.
- **MTP (residual codebooks)** and **Code2Wav** in MLX: incremental waveform synthesis, frame-by-frame.
- **Speaker/voice control** (e.g. Ethan, Chelsie, Aiden): port conditioning and any extra weights.

### 3.3 Integration and Quality

- **Conversion pipeline:** HF/vLLM → MLX (scripts + tests; compare outputs on same inputs).
- **Quantization:** 4-bit/8-bit for Mac memory (mlx-lm-style) if we want to run 30B on consumer Macs.
- **Performance:** Metal backend, memory layout, KV-cache; match or approach vLLM/Transformers latency where possible.
- **Testing:** parity tests (text, audio-in, audio-out) vs Transformers/vLLM; regression tests.

Rough scope: **several engineer-months** for a minimal Thinker+Talker port and conversion; more for full parity and optimization.

---

## 4. Options

### A. Build it ourselves (new repo or fork)

- **Option A1 – In this repo (`apps/rust-mlx-omni/`):**
  - **Status: DONE.** Rust MLX server (no Python). Chat, `/v1/audio/speech`, `/v1/audio/transcriptions`. Run: `cargo run --bin mlx-omni-server --features server -- --model /path --port 8800`.
  - **Build plan:** See [MLX-QWEN3-OMNI-BUILD-PLAN.md](./MLX-QWEN3-OMNI-BUILD-PLAN.md).
- **Option A2 – Extend mlx-omni-server:**
  - Add a “Qwen3-Omni” backend that loads an MLX-converted Qwen3-Omni (once we have one). Today mlx-omni-server uses other models; we’d first need the MLX model implementation (e.g. from A1) or a community port.

### B. Contribute upstream

- **mlx-lm:** Open an issue/PR to add “Qwen3-Omni” (or “Qwen3OmniMoe”) as a supported architecture. mlx-lm is text-focused; Qwen3-Omni is multimodal + audio, so this likely implies either (1) a significant expansion of mlx-lm (multimodal + audio), or (2) a separate package that mlx-lm could depend on. Still, registering interest and a minimal “Thinker-only” path could help.
- **MLX (Apple):** Signal interest (e.g. GitHub discussions) for an official or blessed Qwen3-Omni example or model support; no guarantee of timeline.
- **Qwen (Alibaba):** Ask (e.g. Qwen3-Omni repo issues) if they plan an MLX port or would accept/co-maintain one; they might share tips or weights.

### C. Use alternatives until an MLX port exists

- **Today:** Use [mlx-omni-server](https://pypi.org/project/mlx-omni-server/) with **non–Qwen3-Omni** models (e.g. Gemma, Qwen3 text) for Mac-native chat + STT + TTS; or use **vLLM/vLLM-Metal** for Qwen3-Omni where Metal is supported.
- **When a port exists:** Switch our Mac Thinker URL to the MLX Qwen3-Omni server (as in [MAC-GPU-OMNI-FULL-STACK-PLAN.md](./MAC-GPU-OMNI-FULL-STACK-PLAN.md)).

---

## 5. Recommendation

- **If the goal is “Qwen3-Omni on Mac GPU soon”:** Treat an MLX implementation as **medium–long term**. Use **mlx-omni-server** (other models) or **vLLM-Metal** (if/when Qwen3-Omni is supported) for now, and keep our client ready to point at a future MLX Qwen3-Omni endpoint.
- **If the goal is “we want to own the MLX port”:** Start with a **Thinker-only** slice: MoE + multimodal encoders in MLX, text-out only (no Talker). That gives Mac-native “Qwen3-Omni understanding” and can be paired with existing TTS (e.g. mlx-omni-server or Cartesia). Then add Talker and conversion in a second phase.
- **If the goal is “someone else builds it”:** Contribute requirements and use cases upstream (mlx-lm, MLX, Qwen), and optionally sponsor or collaborate with whoever picks up the port.

---

## 6. References

- [Qwen3-Omni (GitHub)](https://github.com/QwenLM/Qwen3-Omni) – official repo, Transformers/vLLM/DashScope
- [Qwen3-Omni technical report](https://arxiv.org/pdf/2509.17765) – Thinker–Talker, MoE, AuT, Code2Wav
- [mlx-lm](https://github.com/ml-explore/mlx-lm) – MLX LLMs (text); convert, load, generate
- [mlx-omni-server](https://pypi.org/project/mlx-omni-server/) – Mac chat + STT + TTS (non–Qwen3-Omni)
- [MAC-GPU-OMNI-FULL-STACK-PLAN.md](./MAC-GPU-OMNI-FULL-STACK-PLAN.md) – how we use Mac Omni today and when Qwen3-Omni MLX exists
- **Rust + TypeScript only:** Qwen3-Omni inference in `apps/rust-perf` (Candle); no Python in repo.

---

**Summary:** Building an MLX implementation of Qwen3-Omni is **feasible** but **non-trivial**: port Thinker (MoE + multimodal encoders) and Talker (Code2Wav, etc.) to MLX, plus conversion and testing. No such port exists today. We can either **build it** (e.g. Thinker-first), **contribute upstream**, or **rely on alternatives** (mlx-omni-server, vLLM-Metal) until the community or Qwen ship an MLX version.

**We are building it:** See [MLX-QWEN3-OMNI-BUILD-PLAN.md](./MLX-QWEN3-OMNI-BUILD-PLAN.md) for the phased E2E build plan (Thinker-only → Talker + Code2Wav → server + Ferni integration).
