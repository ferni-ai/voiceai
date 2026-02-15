# Kyutai DSM Scripts

Scripts and instructions for running Kyutai STT/TTS (Delayed Streams Modeling) with Ferni.

## Test Kyutai locally (voice agent)

To run the **voice agent** with Kyutai STT + TTS on your Mac:

1. **Bridge (choose one):**  
   - **Rust/Candle (recommended):** Mock: `pnpm dev:kyutai-rust-bridge` or real: `./scripts/kyutai/run-kyutai-rust-bridge.sh --real`  
   - **Python MLX:** Mock: `python scripts/kyutai/mlx-bridge-server.py --stt-port 8089 --tts-port 8090`  
   - Real STT+TTS (MLX): `pip install -r scripts/kyutai/requirements-mlx.txt` then  
     `python scripts/kyutai/mlx-bridge-server.py --stt-port 8089 --tts-port 8090 --use-mlx`
2. **Env:** `USE_KYUTAI_STT=true` and `TTS_PROVIDER=kyutai` (default URLs point to localhost:8089/8090).
3. **Agent:** `pnpm dev` (or `pnpm dev:real` for Kyutai env pre-set) in a second terminal.

See **[docs/guides/KYUTAI-DSM-SETUP.md](../../docs/guides/KYUTAI-DSM-SETUP.md)** and **[KYUTAI-LOCAL-TEST.md](../../docs/guides/KYUTAI-LOCAL-TEST.md)** for full steps.

**If the bridge crashes (SIGSEGV) on your Mac:** Some Apple Silicon + macOS 15.x setups hit an MLX/Metal crash. Use mock mode (no `--use-mlx`), try `MLX_FORCE_CPU=1 pnpm dev:kyutai-bridge`, or use cloud STT/TTS. Details: [KYUTAI-LOCAL-TEST.md § Known issue](../../docs/guides/KYUTAI-LOCAL-TEST.md#known-issue-mlxmetal-crash-on-some-macs).

| Script | Purpose |
|--------|--------|
| `run-kyutai-rust-bridge.sh` | Rust/Candle bridge: mock or `--real` (same protocol as Python; no MLX). |
| `validate-bridge.sh` | Validate Rust bridge: tests + mock health; optional `--real` to run with weights. |
| `mlx-bridge-server.py` | WebSocket server: mock by default; real STT+TTS with `--use-mlx` (moshi-mlx on Mac). |
| `local-proof.ts` | STT → TTS round-trip + latency; optional `--input` PCM/WAV. |
| `compare-tts.ts` | Kyutai vs Cartesia TTS; writes WAVs + HTML for side-by-side listen. |

## Local Mac (MLX – DSM repo)

1. Clone Kyutai's repo (one-time):

   ```bash
   git clone https://github.com/kyutai-labs/delayed-streams-modeling.git /tmp/delayed-streams-modeling
   ```

2. Install Python deps:

   ```bash
   uv pip install 'moshi-mlx>=0.2.6'
   # or: pip install 'moshi-mlx>=0.2.6'
   ```

3. Test STT:

   ```bash
   cd /tmp/delayed-streams-modeling
   python -m moshi_mlx.run_inference --hf-repo kyutai/stt-1b-en_fr-mlx audio/bria.mp3 --temp 0
   ```

4. Test TTS:

   ```bash
   echo "Hello from Ferni." | python scripts/tts_mlx.py - - --quantize 8
   ```

## Voice embedding extraction (Phase 2a)

To create a Ferni persona voice from ~10s reference audio:

```bash
./scripts/kyutai/extract-voice.sh /path/to/ferni-10s.wav ferni
```

Output: `models/ferni-voices/ferni/ferni-voice.safetensors`. Use `configs/kyutai-tts-ferni.toml` and mount `models/ferni-voices` to `/voices` in the TTS container.

See `models/ferni-voices/README.md` and `docs/guides/KYUTAI-DSM-SETUP.md` (Phase 2a).

## Rust bridge (no Python) – future

For a **Rust-only** Kyutai STT/TTS server (no Python, no venv), see **`docs/plans/KYUTAI-RUST-NO-PYTHON-PLAN.md`**. Options: Candle (moshiko-candle or standalone STT/TTS) or MLX from Rust (mlx-rs). Same WebSocket protocol so the voice agent keeps using `KYUTAI_*_URL`.

## Production (GCE Rust server)

See `docs/guides/KYUTAI-DSM-SETUP.md` and `docker/docker-compose.dsm.yml` for deploying STT/TTS sidecars on GCE.
