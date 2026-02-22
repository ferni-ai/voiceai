# Testing each LLM provider one by one

How to test and compare all voice-agent LLM providers (Gemini Live, OpenAI Realtime, Qwen3-Omni, Gemma 3n, ChipChat, Local Pipeline, Omni Pipeline) **one at a time**.

---

## Rule: one provider at a time

- Set **only one** of: `USE_OMNI_PIPELINE`, `USE_GEMMA3N`, `USE_CHIPCHAT`, `USE_LOCAL_PIPELINE`, `USE_QWEN3_THINKER_LOCAL`, `USE_QWEN3_OMNI`, `USE_OPENAI_REALTIME`.
- Unset the others (or don't set them). Default = **Gemini Live**.
- **Restart the voice agent** after changing env (provider is cached at startup).

---

## Keeping Cartesia + local / realtime STT & LLM

**TTS:** Cartesia is the default and is **kept** for all providers below unless you explicitly set `TTS_PROVIDER=higgs-pipeline` or use full Qwen3-Omni with `USE_QWEN3_OMNI` and Qwen3-TTS. So "try different STT/LLM" = keep Cartesia, swap STT and/or LLM.

**Realtime:** The stack is built for **realtime voice**: streaming STT → LLM → TTS, turn detection (VAD or `realtime_llm`), interruptions, and preemptive generation. Changing STT or LLM does not change that; the pipeline stays realtime.

| Layer | Default (Gemini Live) | Local / optional options |
|-------|------------------------|---------------------------|
| **STT** | Gemini built-in (Live API) | **Kyutai** (`USE_KYUTAI_STT=true`) — only pluggable external STT today |
| **LLM** | Gemini Live | Ollama (Local Pipeline, Gemma 3n), ChipChat, Qwen3-Omni, etc. |
| **TTS** | Cartesia | Cartesia (keep); or Higgs / Qwen3-TTS if you switch |

**Cartesia + local STT + local LLM:**

- **Local Pipeline** already uses Cartesia + (optional) Kyutai STT + Ollama LLM. Set `USE_LOCAL_PIPELINE=true`; Kyutai is auto-enabled for local pipeline but you can set `USE_KYUTAI_STT=true` explicitly.
- **Gemma 3n (Ollama)** and **ChipChat** have no built-in STT; use **Kyutai** for STT so the session has speech input: set `USE_KYUTAI_STT=true` and `KYUTAI_STT_URL` (default `ws://localhost:8089/api/asr-streaming`) with Kyutai STT server running.

Example: Cartesia + Kyutai STT + Gemma 3n (local):

```bash
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_CHIPCHAT USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL
export USE_GEMMA3N=true GEMMA3N_OLLAMA_URL=http://127.0.0.1:11434 GEMMA3N_MODEL=gemma3n:e4b
export USE_KYUTAI_STT=true
LOG_FULL_RESPONSES=true pnpm dev
```

Example: Cartesia + Kyutai STT + ChipChat:

```bash
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL
export USE_CHIPCHAT=true CHIPCHAT_URL=http://127.0.0.1:8765
export USE_KYUTAI_STT=true
LOG_FULL_RESPONSES=true pnpm dev
```

### Higgs full pipeline (Higgs STT + Higgs TTS + any LLM)

When **TTS_PROVIDER=higgs-pipeline**, Higgs is automatically used as the **session STT** (LiveKit STT adapter). You get Higgs transcript + biomarkers + Higgs TTS with **any** LLM (Gemini Live, OpenAI Realtime, Ollama, ChipChat, etc.). No Kyutai or Gemini STT needed.

```bash
# Higgs TTS + Higgs STT + Gemini Live (default LLM)
export TTS_PROVIDER=higgs-pipeline
export HIGGS_PIPELINE_URL=ws://localhost:8600/ws
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_CHIPCHAT USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL
LOG_FULL_RESPONSES=true pnpm dev
```

Ensure the Higgs Rust pipeline server is running at `HIGGS_PIPELINE_URL`. Then join a room and speak; transcript and biomarkers come from Higgs, response from the chosen LLM, and TTS from Higgs.

---

## Quick reference

| Provider | Env to set | Prerequisites | Log line to verify |
|----------|------------|---------------|--------------------|
| **Gemini Live** (default) | _(none)_ | `GOOGLE_API_KEY` or Vertex | `🤖 Model provider initialized: Gemini Live API` |
| **OpenAI Realtime** | `USE_OPENAI_REALTIME=true` | `OPENAI_API_KEY` | `🔮 Model provider initialized: OpenAI Realtime API` |
| **Qwen3-Omni** | `USE_QWEN3_OMNI=true` | Qwen3-Omni server (or Candle); optional `QWEN3_TTS_URL` | `🌊 Model provider initialized: Qwen3-Omni (Self-hosted S2S)` |
| **Qwen3 Thinker (local)** | `USE_QWEN3_THINKER_LOCAL=true` | Thinker at `QWEN3_OMNI_URL` (default 8000) | `🌊 ... Qwen3-Omni Thinker (Local Text-Only)` |
| **Gemma 3n** | `USE_GEMMA3N=true` | **Local:** Ollama (`GEMMA3N_OLLAMA_URL`, e.g. `ollama run gemma3n:e4b`). **Cloud:** `GOOGLE_GENAI_API_KEY` or Vertex | `🌿 ... Gemma 3n ...` (local Ollama or Vertex/Gemini API) |
| **ChipChat** | `USE_CHIPCHAT=true` | Server at `CHIPCHAT_URL` (default 8765) with `/v1/chat/completions` | `🍎 Model provider initialized: ChipChat (Local Apple MLX...)` |
| **Local Pipeline** | `USE_LOCAL_PIPELINE=true` | Ollama (e.g. `qwen3:8b`); optional Kyutai STT | `🏠 Model provider initialized: Local Pipeline (Kyutai STT + Ollama LLM...)` |
| **Omni Pipeline** | `USE_OMNI_PIPELINE=true` | Rust FullOmniPipeline at `OMNI_PIPELINE_URL` (default 8505) | `🦀 Using Omni Pipeline (local Rust/Candle inference)` |

---

## Step-by-step: test one provider

1. **Choose the provider** (e.g. Gemma 3n).
2. **Unset other LLM flags** (in your shell or `.env`):
   ```bash
   unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_QWEN3_THINKER_LOCAL USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_CHIPCHAT USE_GEMMA3N
   ```
3. **Set the one flag** (and any required vars):
   ```bash
   export USE_GEMMA3N=true
   export GOOGLE_GENAI_API_KEY=your_key   # or use Vertex
   ```
4. **Start the 4 dev servers** (token, UI, Vite, voice agent). For the voice agent:
   ```bash
   LOG_FULL_RESPONSES=true pnpm dev
   ```
5. **Check logs** on startup for the log line in the table (e.g. `🌿 Model provider initialized: Gemma 3n ...`).
6. **Join a room** from the web app and speak; confirm the agent replies (and optional: check latency/quality).

---

## Per-provider prerequisites and commands

### Gemini Live (default)

- **Prereq:** `GOOGLE_API_KEY` or Vertex (`GOOGLE_CLOUD_PROJECT`, `USE_VERTEX_AI=true`).
- **Run:** `pnpm dev` (no extra env).

### OpenAI Realtime

- **Prereq:** `OPENAI_API_KEY`.
- **Run:** `USE_OPENAI_REALTIME=true LOG_FULL_RESPONSES=true pnpm dev`.

### Qwen3-Omni

- **Prereq:** Qwen3-Omni server (e.g. Candle) on 8000, or Candle NAPI (`QWEN3_OMNI_BACKEND=candle`). Optional: `QWEN3_TTS_URL` for full stack.
- **Run:** `USE_QWEN3_OMNI=true QWEN3_OMNI_URL=http://localhost:8000 LOG_FULL_RESPONSES=true pnpm dev`.
- **See:** `docs/guides/FULL-E2E-QWEN3-OMNI.md`.

### Qwen3 Thinker (local)

- **Prereq:** Thinker server at 8000 (text-only LLM). TTS = Cartesia.
- **Run:** `USE_QWEN3_THINKER_LOCAL=true QWEN3_OMNI_URL=http://localhost:8000 pnpm dev`.

### Gemma 3n

- **Local (Ollama):** Prereq: Ollama with Gemma 3n (e.g. `ollama run gemma3n:e4b`). Run: `USE_GEMMA3N=true GEMMA3N_OLLAMA_URL=http://127.0.0.1:11434 GEMMA3N_MODEL=gemma3n:e4b LOG_FULL_RESPONSES=true pnpm dev`.
- **Cloud:** Prereq: `GOOGLE_GENAI_API_KEY` (Gemini API) or Vertex (`GEMMA3N_USE_VERTEX_AI=true`, `GOOGLE_CLOUD_PROJECT`). Run: `USE_GEMMA3N=true LOG_FULL_RESPONSES=true pnpm dev` (do not set `GEMMA3N_OLLAMA_URL`).

### ChipChat

- **Prereq:** Local server exposing OpenAI-style `/v1/chat/completions` (e.g. Pipecat + ChipChat) at `CHIPCHAT_URL` (default `http://127.0.0.1:8765`).
- **Run:** `USE_CHIPCHAT=true CHIPCHAT_URL=http://127.0.0.1:8765 LOG_FULL_RESPONSES=true pnpm dev`.

### Local Pipeline

- **Prereq:** Ollama with e.g. `qwen3:8b`. Optional: Kyutai STT.
- **Run:** `USE_LOCAL_PIPELINE=true OLLAMA_URL=http://127.0.0.1:11434 pnpm dev`.

### Omni Pipeline

- **Prereq:** Rust FullOmniPipeline (Candle) at 8505.
- **Run:** `USE_OMNI_PIPELINE=true OMNI_PIPELINE_URL=http://127.0.0.1:8505 pnpm dev`.

---

## Switching quickly (copy-paste)

### Reset to Gemini Live

```bash
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_QWEN3_THINKER_LOCAL USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_CHIPCHAT USE_GEMMA3N
LOG_FULL_RESPONSES=true pnpm dev
# → Gemini Live
```

### Try Gemma 3n (cloud)

```bash
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_QWEN3_THINKER_LOCAL USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_CHIPCHAT GEMMA3N_OLLAMA_URL
export USE_GEMMA3N=true
LOG_FULL_RESPONSES=true pnpm dev
# → Gemma 3n via Vertex/Gemini API (ensure GOOGLE_GENAI_API_KEY or Vertex is set)
```

### Try Gemma 3n (local Ollama)

```bash
# First: ollama run gemma3n:e4b  (in another terminal, or pull once)
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_QWEN3_THINKER_LOCAL USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_CHIPCHAT
export USE_GEMMA3N=true
export GEMMA3N_OLLAMA_URL=http://127.0.0.1:11434
export GEMMA3N_MODEL=gemma3n:e4b
LOG_FULL_RESPONSES=true pnpm dev
# → Gemma 3n via local Ollama
```

### Try Qwen3-Omni (server on 8000)

```bash
unset USE_OPENAI_REALTIME USE_GEMMA3N USE_CHIPCHAT USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL
export USE_QWEN3_OMNI=true
export QWEN3_OMNI_URL=http://localhost:8000
LOG_FULL_RESPONSES=true pnpm dev
```

### Try ChipChat (server on 8765)

```bash
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_LOCAL_PIPELINE USE_OMNI_PIPELINE
export USE_CHIPCHAT=true
export CHIPCHAT_URL=http://127.0.0.1:8765
LOG_FULL_RESPONSES=true pnpm dev
```

### Try OpenAI Realtime

```bash
unset USE_QWEN3_OMNI USE_GEMMA3N USE_CHIPCHAT USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL
export USE_OPENAI_REALTIME=true
LOG_FULL_RESPONSES=true pnpm dev
```

### Try Local Pipeline (Ollama)

```bash
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_CHIPCHAT USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL
export USE_LOCAL_PIPELINE=true
export OLLAMA_URL=http://127.0.0.1:11434
pnpm dev
```

---

## Full dev stack (4 terminals)

For voice testing you need all four servers. Start each in a **separate** terminal:

| Terminal | Command |
|----------|---------|
| 1 | `pnpm token-server` |
| 2 | `pnpm ui-server` |
| 3 | `cd apps/web && pnpm dev` |
| 4 | _(one of the voice-agent commands above, e.g. `USE_GEMMA3N=true LOG_FULL_RESPONSES=true pnpm dev`)_ |

Then open the web app (e.g. http://localhost:3004), join a room, and speak to verify the chosen provider.

---

## Run variations: what to try and what to check

Use these as a short list of runs to compare behavior. For each variation, **restart the voice agent** (terminal 4) with the env below, then run the checks.

### Variation matrix

| # | Variation | Voice agent env (terminal 4) | What to check |
|---|-----------|------------------------------|---------------|
| 1 | **Gemini Live** (baseline) | `unset USE_*; LOG_FULL_RESPONSES=true pnpm dev` | Log: `🤖 Gemini Live API`. Say "play some music" → tool runs? Response latency? |
| 2 | **OpenAI Realtime** | `USE_OPENAI_REALTIME=true LOG_FULL_RESPONSES=true pnpm dev` | Log: `🔮 OpenAI Realtime API`. Same phrase → tool runs? Compare latency to #1. |
| 3 | **Gemma 3n local** (Ollama) | `USE_GEMMA3N=true GEMMA3N_OLLAMA_URL=http://127.0.0.1:11434 GEMMA3N_MODEL=gemma3n:e4b LOG_FULL_RESPONSES=true pnpm dev` | Log: `🌿 ... (local Ollama)`. Same phrase → tool runs (FTIS)? Latency? |
| 4 | **Local Pipeline (Qwen3 4b)** | `USE_LOCAL_PIPELINE=true OLLAMA_MODEL=qwen3:4b pnpm dev` | Log: `🏠 Local Pipeline`. Same phrase → tool runs? Faster/slower than #3? |
| 5 | **Local Pipeline (Qwen3 8b)** | `USE_LOCAL_PIPELINE=true OLLAMA_MODEL=qwen3:8b pnpm dev` | Same as #4; compare quality/latency vs 4b. |
| 6 | **FTIS off** (JSON path) | Same as #1 but `USE_FTIS=false LOG_FULL_RESPONSES=true pnpm dev` | Log: JSON workaround enabled. Say "play some music" → LLM outputs JSON? Tool still runs? |
| 7 | **Gemini Live + Higgs TTS** | As #1 plus `TTS_PROVIDER=higgs-pipeline HIGGS_PIPELINE_URL=ws://localhost:8600/ws` | Higgs pipeline must be running. Voice quality vs Cartesia. |

### Quick checklist per run

1. **Start** token server, UI server, Vite, then voice agent with the variation env.
2. **Log line** — Confirm the expected "Model provider initialized" (or "Using Omni Pipeline") line.
3. **FTIS** — If default: log should show `🎯 FTIS MODE` or `🧠 FTIS routing` when you speak. If `USE_FTIS=false`: log should show JSON workaround / no FTIS.
4. **Tool** — Say e.g. "play some music" or "what's the weather" and confirm a tool runs (music plays or weather response).
5. **Latency** — Note how long until first word (subjective).
6. **Quality** — Note if the reply is on-topic and natural.

### One-liner variations (copy-paste for terminal 4)

```bash
# 1. Gemini Live (baseline)
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_CHIPCHAT USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL GEMMA3N_OLLAMA_URL
LOG_FULL_RESPONSES=true pnpm dev

# 2. OpenAI Realtime
unset USE_QWEN3_OMNI USE_GEMMA3N USE_CHIPCHAT USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL GEMMA3N_OLLAMA_URL
export USE_OPENAI_REALTIME=true
LOG_FULL_RESPONSES=true pnpm dev

# 3. Gemma 3n local (Ollama)
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_CHIPCHAT USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL
export USE_GEMMA3N=true GEMMA3N_OLLAMA_URL=http://127.0.0.1:11434 GEMMA3N_MODEL=gemma3n:e4b
LOG_FULL_RESPONSES=true pnpm dev

# 4. Local Pipeline Qwen3 4b
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_CHIPCHAT USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL GEMMA3N_OLLAMA_URL
export USE_LOCAL_PIPELINE=true OLLAMA_MODEL=qwen3:4b
pnpm dev

# 5. Local Pipeline Qwen3 8b
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_CHIPCHAT USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL GEMMA3N_OLLAMA_URL
export USE_LOCAL_PIPELINE=true OLLAMA_MODEL=qwen3:8b
pnpm dev

# 6. Gemini Live with FTIS off (JSON path)
unset USE_OPENAI_REALTIME USE_QWEN3_OMNI USE_GEMMA3N USE_CHIPCHAT USE_LOCAL_PIPELINE USE_OMNI_PIPELINE USE_QWEN3_THINKER_LOCAL GEMMA3N_OLLAMA_URL
export USE_FTIS=false
LOG_FULL_RESPONSES=true pnpm dev
```

After each run, stop the voice agent (Ctrl+C), then paste the next block and start again. Jot down which variation felt best for latency, tool reliability, and voice quality.
