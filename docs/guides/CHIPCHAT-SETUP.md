# Trying ChipChat with Ferni

How to use [ChipChat](https://machinelearning.apple.com/research/chipchat) (Apple’s low-latency cascaded conversational agent in MLX) as the **LLM** in the Ferni voice agent. ChipChat itself is research-only and not publicly released; this guide covers how to point Ferni at a ChipChat-compatible server when one exists, and how to test the integration today.

---

## What ChipChat is (from the paper)

- **Paper:** [ChipChat: Low-Latency Cascaded Conversational Agent in MLX](https://arxiv.org/abs/2509.00078) (ASRU 2025, Best Demo Paper).
- **Stack:** Streaming ASR (MoE) → state-action LLM (Mixtral 8×7B) → TTS (SpeakStream) → neural vocoder, all on-device in Python + MLX.
- **Latency:** Sub-second E2E on Mac Studio (e.g. ~920 ms in the paper).
- **Status:** No open-source or public server yet. When a server appears (e.g. Pipecat + ChipChat, or a native ChipChat API), it will likely expose an **OpenAI-compatible** `/v1/chat/completions` endpoint.

Ferni’s **ChipChat provider** assumes such a server: it talks to `CHIPCHAT_URL` and uses `/v1/chat/completions` (streaming). Higgs (or Cartesia) stays as STT/TTS; ChipChat is only the **LLM** in the loop.

---

## When a ChipChat-compatible server exists

1. **Run the server** (e.g. on port 8765) so it serves `/v1/chat/completions` (streaming).
2. **Set env and start the agent:**
   ```bash
   unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_LOCAL_PIPELINE USE_OMNI_PIPELINE
   export USE_CHIPCHAT=true
   export CHIPCHAT_URL=http://127.0.0.1:8765   # default
   export USE_KYUTAI_STT=true                  # ChipChat has no built-in STT in our setup
   LOG_FULL_RESPONSES=true pnpm dev
   ```
3. **Or use Higgs for STT+TTS** (no Kyutai):
   ```bash
   export TTS_PROVIDER=higgs-pipeline
   export HIGGS_PIPELINE_URL=ws://localhost:8600/ws
   export USE_CHIPCHAT=true
   export CHIPCHAT_URL=http://127.0.0.1:8765
   LOG_FULL_RESPONSES=true pnpm dev
   ```
4. **Check logs** for: `🍎 Model provider initialized: ChipChat (Local Apple MLX...)`.

---

## Testing the integration today (no ChipChat server)

ChipChat isn’t released, so you can **test the Ferni integration** with any OpenAI-compatible server on 8765:

- **Ollama** (default port 11434) exposes `/v1/chat/completions`. Run a second process that **proxies** 8765 → 11434, or run Ollama on 8765 if you can reconfigure it.
- **Mock server:** Run a tiny HTTP server on 8765 that responds to `POST /v1/chat/completions` with SSE streaming (e.g. echo or short replies).

Example with **Ollama on 11434** and a simple proxy (e.g. `socat` or a small Node script that forwards `http://127.0.0.1:8765` → `http://127.0.0.1:11434` for `/v1/*`):

```bash
# Terminal 1: Ollama
ollama run qwen3:8b

# Terminal 2: Proxy 8765 → 11434 (example: Node one-liner or socat)
# Then:
export USE_CHIPCHAT=true
export CHIPCHAT_URL=http://127.0.0.1:8765
export CHIPCHAT_MODEL=qwen3:8b
export USE_KYUTAI_STT=true
LOG_FULL_RESPONSES=true pnpm dev
```

You’re then exercising the **ChipChat code path** (same HTTP streaming, same provider) with Ollama as the backend.

---

## Env reference

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_CHIPCHAT` | `false` | Use ChipChat as the LLM provider. |
| `CHIPCHAT_URL` | `http://127.0.0.1:8765` | Base URL of the ChipChat-compatible server. |
| `CHIPCHAT_MODEL` | `chipchat` | Model name sent in `/v1/chat/completions` requests. |

---

## One provider at a time

Set **only one** of: `USE_CHIPCHAT`, `USE_OPENAI_REALTIME`, `USE_QWEN3_OMNI`, `USE_GEMMA3N`, `USE_LOCAL_PIPELINE`, `USE_OMNI_PIPELINE`. Unset the others, then restart the voice agent. See **docs/guides/TEST-LLM-PROVIDERS-ONE-BY-ONE.md**.

---

## ChipChat vs Higgs

ChipChat is a **full cascade** (ASR + LLM + TTS + vocoder); in Ferni we use it only as the **LLM**. STT and TTS remain **Higgs** (or Kyutai STT + Cartesia). For a comparison of what ChipChat offers vs what Higgs offers, see **docs/plans/CHIPCHAT-VS-HIGGS.md**.
