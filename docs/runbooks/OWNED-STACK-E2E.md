# Owned Stack E2E Runbook

## Install all models locally (one-time)

Run from repo root to download every model needed for the full owned stack (Higgs LLM + Higgs TTS + Parakeet STT):

```bash
bash scripts/install-local-models.sh
```

This downloads (into `apps/rust-higgs-pipeline/models/`):

1. **Higgs Audio V2 LLM** (~12GB) — text + TTS backbone  
2. **Higgs Audio V2 tokenizer** (~806MB) — `config.json` + `model.pth` for xCodec export  
3. **Parakeet TDT 1.1B** (~400MB) — STT  
4. **xCodec decoder ONNX** (~200–400MB) — exported from tokenizer (requires Python)

**If step 4 (xCodec) fails** — it needs Python + `boson_multimodal`:

```bash
# Clone Higgs Audio (provides boson_multimodal)
git clone https://github.com/boson-ai/higgs-audio.git
cd higgs-audio
pip install -r requirements.txt && pip install -e .
cd ..

# PyTorch + ONNX
pip install torch torchaudio onnx onnxruntime

# Export xCodec decoder (from repo root)
bash scripts/higgs/download_xcodec_onnx.sh \
  apps/rust-higgs-pipeline/models/higgs-audio-v2-tokenizer \
  apps/rust-higgs-pipeline/models/higgs-audio-v2/xcodec_decoder.onnx
```

Then build and run the Higgs pipeline (see “Full owned stack” below).

---

## Hybrid path (Ollama LLM + Cartesia TTS)

When Higgs has an LLM (Ollama or Candle) but **not** TTS (no Higgs model or no xCodec decoder), the gateway uses the **hybrid path**: Ollama for text generation, Cartesia for speech.

### Prerequisites

- Ollama running with a model (e.g. `ollama serve`, `ollama run llama3.2`)
- Higgs pipeline running with `--ollama-url` (no `--higgs-model` required)
- Token server, UI server, Vite, and voice agent running

### Start services

```bash
# 1. Ollama (if not already running)
ollama serve
ollama run llama3.2

# 2. Higgs (LLM only, no TTS)
cd apps/rust-higgs-pipeline
./target/release/higgs-voice-pipeline --port 8600 \
  --parakeet-model ./models/parakeet-tdt-1.1b \
  --ollama-url http://127.0.0.1:11434 --ollama-model llama3.2

# 3. Four dev servers (separate terminals)
pnpm token-server
pnpm ui-server
cd apps/web && pnpm dev
USE_OWNED_STACK=true TTS_PROVIDER=higgs-pipeline pnpm dev
```

### Verify

- Open http://localhost:3004
- Start a voice call
- Say "Hey Ferni" — greeting should play (Ollama text, Cartesia voice)
- Say "What time is it?" — tool call should execute, then reply spoken via Cartesia

Logs to watch: `Owned stack hybrid: Ollama reply spoken via Cartesia`, `Owned stack hybrid: LLM emitted tool call, executing and re-calling`.

---

## Full owned stack (Higgs LLM + Higgs TTS)

Requires Higgs TTS model **and** xCodec decoder ONNX.

### Prerequisites

- All models installed: `bash scripts/install-local-models.sh` (or at least Higgs model + tokenizer + xCodec decoder; Parakeet for STT)
- xCodec decoder: if step 4 of install failed, see “Install all models locally” above for Python + `boson_multimodal` and re-run `download_xcodec_onnx.sh`

### Start Higgs with TTS

```bash
cd apps/rust-higgs-pipeline
./target/release/higgs-voice-pipeline --port 8600 \
  --higgs-model ./models/higgs-audio-v2 \
  --xcodec-model ./models/higgs-audio-v2/xcodec_decoder.onnx \
  --parakeet-model ./models/parakeet-tdt-1.1b \
  --ollama-url http://127.0.0.1:11434 --ollama-model llama3.2
```

### Env for full stack

```bash
USE_OWNED_STACK=true
TTS_PROVIDER=higgs-pipeline
HIGGS_PIPELINE_URL=ws://localhost:8600/ws
```

Then start the four dev servers; voice will use Higgs for both LLM and TTS (no Cartesia).

---

## Better options (STT and LLM)

### STT: Kyutai STT (better than Parakeet)

We have **Kyutai STT** (1B en/fr, DSM-style) as a higher-quality option. It runs as a **separate service**, not inside the Higgs pipeline:

- **Config:** `configs/kyutai-stt.toml` (moshi-server) or **Rust kyutai-bridge** (`services/kyutai-bridge`).
- **Adapter:** `src/speech/providers/kyutai-stt-adapter.ts` — not yet wired as the main session STT when using Higgs.
- **To use:** Run moshi-server (or kyutai-bridge) on port 8089, then wire `KyutaiSTT` into session creation when `USE_KYUTAI_STT=true` and owned stack (see `docs/guides/STT-OPTIONS.md` and `docs/guides/KYUTAI-DSM-SETUP.md`).

The **Higgs pipeline** only has Parakeet (and optional Whisper) built in. So for “all in one” we use Parakeet; for “best STT” you’d run Kyutai STT separately and connect the agent to it.

### LLM: Candle (better than Ollama)

We have **Candle** — our own local LLM in the Rust pipeline (no Ollama dependency):

- **Set:** `CANDLE_LLM_MODEL_PATH` to a directory with Llama-format safetensors (`config.json`, `tokenizer.json`, `model.safetensors` or shards).
- **Start Higgs with Candle:**  
  `./target/release/higgs-voice-pipeline --port 8600 --candle-model /path/to/model --higgs-model ./models/higgs-audio-v2 --xcodec-model ./models/higgs-audio-v2/xcodec_decoder.onnx --parakeet-model ./models/parakeet-tdt-1.1b`  
  (omit `--ollama-url` when using Candle.)
- **Config:** `src/config/owned-model.ts` — when `CANDLE_LLM_MODEL_PATH` is set, Candle is preferred over Ollama automatically.
