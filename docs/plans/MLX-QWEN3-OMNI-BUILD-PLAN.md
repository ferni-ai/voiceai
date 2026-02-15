# MLX Qwen3-Omni: All-Rust E2E Build Plan

**Goal:** Own the **full multimodal+audio** Qwen3-Omni stack on Apple Silicon via **Rust + MLX** — no Python anywhere. Voice-in → voice-out on Mac GPU, same repo.

---

## 0. Why This Works

[`mlx-rs`](https://github.com/oxideai/mlx-rs) (v0.21, Apache-2.0/MIT) provides safe Rust bindings to Apple's `mlx-c` C API. It has **every nn module we need**:

| Need | `mlx-rs` provides |
|------|--------------------|
| Linear layers | `nn::Linear` |
| Conv2d (audio encoder stem) | `nn::Conv2d` |
| Conv1d (Code2Wav upsampler) | `nn::Conv1d` |
| ConvTranspose1d (Code2Wav upsample blocks) | `nn::ConvTranspose1d` |
| Embedding (token + codebook) | `nn::Embedding` |
| RMSNorm | `nn::RmsNorm` |
| LayerNorm | `nn::LayerNorm` |
| Positional encoding | `nn::positional_encoding` |
| Transformer building blocks | `nn::transformer` |
| Quantized layers (4-bit/8-bit) | `nn::quantized` |
| Safetensors load/save | `safetensors` feature flag |
| Ops: matmul, softmax, silu, tanh, argmax, concat, reshape, transpose | `ops::*` |
| Metal GPU + unified memory | Default features: `metal`, `accelerate` |

Plus: lazy evaluation, same unified memory model as Python MLX, `Module` trait with `load_safetensors()`. **Direct 1:1 port from the Python MLX code.**

---

## 1. Crate: `apps/rust-mlx-omni`

New Rust crate in this repo. Produces:
- A **library** (for NAPI bindings / direct use from voice agent)
- A **binary** (OpenAI-compatible HTTP server, like the Candle one)

```
apps/rust-mlx-omni/
├── Cargo.toml
├── src/
│   ├── lib.rs              # Re-exports
│   ├── mel.rs              # Mel spectrogram (port from candle_mel / Python mel.py)
│   ├── audio_encoder.rs    # AuT: Conv2d stem + 32 transformer layers (port from Python encoders/audio.py)
│   ├── thinker.rs          # MoE backbone: SwitchGLU + attention + RoPE (port from Python thinker/)
│   ├── talker.rs           # Codebook decoder: 20 MoE + 5 dense (port from Python talker/)
│   ├── code2wav.rs         # 8-layer decoder + ConvNet upsampler 480x (port from Python code2wav/)
│   ├── pipeline.rs         # Full pipeline: mel → encoder → thinker → talker → code2wav
│   ├── conversion.rs       # HF safetensors → MLX weight key mapping + MoE stacking
│   ├── config.rs           # Model config loading (from JSON)
│   ├── tokenizer.rs        # Tokenizer wrapper (tokenizers crate)
│   ├── generate.rs         # Autoregressive generation (text + audio)
│   └── bin/
│       └── server.rs       # axum HTTP server: /v1/chat/completions, /v1/audio/transcriptions, /v1/audio/speech
├── tests/
│   ├── test_mel.rs
│   ├── test_encoder.rs
│   ├── test_thinker.rs
│   ├── test_talker.rs
│   ├── test_code2wav.rs
│   └── test_pipeline.rs
└── README.md
```

### Reference Sources (1:1 Port)

Each Rust file ports from **two** references — Python MLX (shapes/logic) and Candle (Rust patterns):

| Rust file | Python MLX source | Candle reference |
|-----------|-------------------|------------------|
| `mel.rs` | `audio/mel.py` | `candle_mel.rs` |
| `audio_encoder.rs` | `encoders/audio.py` | `candle_audio_encoder.rs` |
| `thinker.rs` | `thinker/model.py` + `thinker/layers.py` | `candle_thinker.rs` |
| `talker.rs` | `talker/model.py` | `candle_talker.rs` |
| `code2wav.rs` | `code2wav/model.py` | `candle_code2wav.rs` |
| `pipeline.rs` | `pipeline.py` | `full_omni_pipeline.rs` |
| `conversion.rs` | `convert_weights.py` | — |
| `server.rs` | `server.py` | `bin/server.rs` |

---

## 2. Phases

### Phase 1 — Scaffold + Thinker (~1 week)

| # | Task | Details |
|---|------|---------|
| 1 | **Crate setup** | `Cargo.toml` with `mlx-rs`, `tokenizers`, `axum`, `safetensors`. Feature flags: `metal` (default on Mac), `server`. |
| 2 | **Config** | Load `config.json` from model dir (thinker_config, talker_config, audio_config, code2wav_config). |
| 3 | **Conversion / weight loading** | HF safetensors → MLX: key mapping + MoE expert stacking. Fix the bugs from the Python audit (validate all experts, verify shapes, no silent skip). |
| 4 | **Thinker** | MoE backbone: `SwitchLinear`, `SwitchGLU`, `Attention` (RoPE, QK norm, GQA), `DecoderLayer`, `ThinkerModel`, `Qwen3OmniThinker`. Port from Python `thinker/layers.py` + `thinker/model.py` using `mlx-rs` `nn::Linear`, `nn::RmsNorm`, ops. |
| 5 | **Tokenizer** | Wrap `tokenizers` crate; load `tokenizer.json` from model dir. |
| 6 | **Generate (text)** | Autoregressive text generation: prefill + decode loop, temperature sampling, KV cache. |
| 7 | **Test** | Load converted weights, generate text, compare output to Python MLX or Candle. |

**Milestone:** `cargo run --bin mlx-omni-server -- --model /path/to/model` → `/v1/chat/completions` works.

### Phase 2 — Audio Encoder + STT (~1 week)

| # | Task | Details |
|---|------|---------|
| 1 | **Mel** | Mel spectrogram (STFT + mel filterbank). Port from `mel.py` / `candle_mel.rs`. |
| 2 | **Audio Encoder (AuT)** | Conv2d stem (3 layers, stride 2) + sinusoidal pos embed + 32 transformer encoder layers + projection. Port from `encoders/audio.py`. Uses `mlx-rs` `nn::Conv2d`, `nn::LayerNorm`, `nn::Linear`. |
| 3 | **Thinker audio conditioning** | `forward_with_hidden_states(input_ids, audio_features, extract_layer)` — concat audio features with text embeddings. Already in Python; port to Rust. |
| 4 | **Transcribe endpoint** | `/v1/audio/transcriptions`: audio → mel → encoder → thinker → text. |
| 5 | **Test** | Record audio → transcribe → compare text output to Python/Candle. |

**Milestone:** Audio-in → text-out works via HTTP.

### Phase 3 — Talker + Code2Wav + Full Pipeline (~1–2 weeks)

| # | Task | Details |
|---|------|---------|
| 1 | **Talker** | `input_proj` → 20 MoE decoder layers → 5 dense `CodePredictorLayer` → `lm_head` → codec logits `(B, L, 32, 2048)`. Port from `talker/model.py`. |
| 2 | **Code2Wav** | Codebook embedding → 8-layer decoder (causal attn + SiLU MLP) → ConvNet upsampler (ConvTranspose1d, rates [8,5,4,3] = 480x) → tanh → 24kHz. Port from `code2wav/model.py`. Uses `mlx-rs` `nn::ConvTranspose1d`, `nn::Conv1d`. |
| 3 | **Full pipeline** | `process_audio()`: mel → encoder → thinker(layer 18 hidden) → talker → argmax → code2wav → waveform. |
| 4 | **TTS endpoint** | `/v1/audio/speech`: text → thinker → talker → code2wav → WAV. |
| 5 | **Test** | Text → speech → listen; audio → audio round-trip. |

**Milestone:** Full audio-in → audio-out. All three endpoints working.

### Phase 4 — Quantization + NAPI + Ferni Integration (~1 week)

| # | Task | Details |
|---|------|---------|
| 1 | **Quantization** | 4-bit/8-bit via `mlx-rs` `nn::quantized`. Convert and verify 30B fits on 32GB Mac. |
| 2 | **NAPI bindings** (optional) | Export `process_audio_omni`, `generate_text`, `transcribe_audio`, `synthesize_speech` via napi-rs, like rust-perf. For in-process use (no HTTP). |
| 3 | **Streaming** | Token-by-token streaming for `/v1/chat/completions` (SSE). Chunk-by-chunk audio streaming for TTS. |
| 4 | **Function calling** | Parse OpenAI-style `tools` in chat completions; return tool_calls in response. |
| 5 | **Ferni integration** | Verify: `USE_QWEN3_OMNI=true QWEN3_OMNI_BACKEND=mlx QWEN3_OMNI_URL=http://localhost:8800 pnpm dev` → full voice E2E. |
| 6 | **Docs** | Update `QWEN3-OMNI-LOCAL-AND-GCE.md`, README for `apps/rust-mlx-omni`. |

**Milestone:** Production-quality E2E on Mac with quantized model. Zero Python.

---

## 3. Key Differences from Candle Implementation

| Aspect | Candle (`apps/rust-perf`) | MLX (`apps/rust-mlx-omni`) |
|--------|--------------------------|---------------------------|
| **Backend** | `candle-core` (custom Metal kernels) | `mlx-rs` → `mlx-c` → Apple MLX (optimized Metal kernels) |
| **Memory** | Manual device placement | Unified memory (CPU + GPU share) |
| **Lazy eval** | Eager | Lazy (graph-based, like PyTorch 2.0 compile) |
| **Platform** | Mac (Metal) + Linux (CPU) | **Mac only** (MLX is Apple Silicon only) |
| **Safetensors** | `candle_nn::VarBuilder` | `mlx-rs` `Module::load_safetensors()` |
| **Quantization** | Manual | Built-in `nn::quantized` |

**Important:** MLX (and `mlx-rs`) is **Apple Silicon only**. This crate won't compile on Linux/GCE. For GCE, keep using Candle (`apps/rust-perf`) or vLLM. The `QWEN3_OMNI_BACKEND` env var already handles this: `mlx` on Mac, `candle` or `vllm` on GCE.

---

## 4. `Cargo.toml`

```toml
[package]
name = "ferni-mlx-omni"
version = "0.1.0"
edition = "2021"
description = "Qwen3-Omni on Apple MLX (Rust) — Thinker + Talker + Code2Wav"

[features]
default = ["metal"]
metal = ["mlx-rs/metal"]
accelerate = ["mlx-rs/accelerate"]
server = ["dep:axum", "dep:tokio", "dep:tower-http"]
napi = ["dep:napi", "dep:napi-derive"]

[dependencies]
mlx-rs = { version = "0.21", features = ["safetensors"] }

# Tokenizer
tokenizers = "0.21"

# Config
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Server (optional)
axum = { version = "0.8", optional = true }
tokio = { version = "1", features = ["full"], optional = true }
tower-http = { version = "0.6", features = ["cors"], optional = true }

# NAPI (optional)
napi = { version = "2", features = ["napi9"], optional = true }
napi-derive = { version = "2", optional = true }

# Logging
tracing = "0.1"
tracing-subscriber = "0.3"

# Error handling
anyhow = "1"
thiserror = "2"

[[bin]]
name = "mlx-omni-server"
path = "src/bin/server.rs"
required-features = ["server"]
```

---

## 5. Timeline Summary

| Phase | What | Duration | Milestone |
|-------|------|----------|-----------|
| **1** | Scaffold + Thinker + text gen | ~1 week | `/v1/chat/completions` works |
| **2** | Audio encoder + STT | ~1 week | `/v1/audio/transcriptions` works |
| **3** | Talker + Code2Wav + TTS | ~1–2 weeks | Full audio-in → audio-out |
| **4** | Quantization + NAPI + Ferni | ~1 week | Production E2E on Mac, zero Python |

**Total: ~4–5 weeks** to full E2E, all Rust, all in this repo.

---

## 6. References

| Resource | Location |
|----------|----------|
| Rust MLX server | `apps/rust-mlx-omni/` (no Python) |
| Candle implementation (reference for Rust patterns) | `apps/rust-perf/src/candle_*.rs` |
| `mlx-rs` crate | [github.com/oxideai/mlx-rs](https://github.com/oxideai/mlx-rs) |
| `mlx-rs` nn modules | `nn::Linear`, `Conv1d`, `Conv2d`, `ConvTranspose1d`, `Embedding`, `RmsNorm`, `LayerNorm` |
| Apple `mlx-c` | [github.com/ml-explore/mlx-c](https://github.com/ml-explore/mlx-c) |
| Qwen3-Omni architecture | [arxiv.org/pdf/2509.17765](https://arxiv.org/pdf/2509.17765) |
| Ferni integration env | `QWEN3_OMNI_BACKEND=mlx`, `QWEN3_OMNI_URL=http://localhost:8800` |
| Ferni config | `src/integrations/qwen3-omni/config.ts` |
