# Qwen3-Omni on MLX (Rust)

Full E2E Qwen3-Omni on Apple Silicon: Thinker + Talker + Code2Wav + AudioEncoder. **No Python.** Uses [mlx-rs](https://github.com/oxideai/mlx-rs).

---

## Full E2E (recommended)

Use a **full** Qwen3-Omni checkpoint for real speech-in → speech-out quality. The server expects a model directory with:

- `model.safetensors` (or sharded weights when supported)
- `config.json` or `thinker_config.json`
- `tokenizer.json` — or set `QWEN3_OMNI_TOKENIZER_PATH`

```bash
cargo run --bin mlx-omni-server --features server -- --model /path/to/full/model --port 8800
```

Then point Ferni at `http://localhost:8800`. Full steps: [docs/guides/LIVE-VOICE-TEST-MLX.md](../../docs/guides/LIVE-VOICE-TEST-MLX.md).

---

## Test-only “minimal” model (optional)

`.test-model/` is a **tiny test checkpoint** (64-dim, 2 layers) for smoke tests only. Quality is poor; do **not** use it for real E2E.

If you want to try it anyway: add `tokenizer.json` to `.test-model` or set `QWEN3_OMNI_TOKENIZER_PATH`, then:

```bash
cargo run --bin mlx-omni-server --features server -- --model .test-model --port 8800
```

---

## Endpoints

- `GET /health` — health check
- `POST /v1/chat/completions` — chat
- `POST /v1/audio/speech` — text → WAV (24 kHz)
- `POST /v1/audio/transcriptions` — WAV (16 kHz mono) → text
