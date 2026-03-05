# Voice stack direction: Cartesia TTS + Gemini STT

**Last updated:** March 2026

## Production stack

- **TTS:** **Cartesia** — persona voices via Cartesia API (or LiveKit Cartesia plugin when gateway is disabled).
- **STT:** **Gemini** — speech-to-text is provided by **Gemini Live** (realtime API); no separate STT service when using Gemini as the LLM backend.
- **LLM:** Gemini Live or OpenAI Realtime (text-only; output goes to TTS).

So: **Cartesia for TTS, Gemini for STT** is correct when using Gemini Live. With OpenAI Realtime, STT is also built into the realtime API.

## Optional: Sonata

**Sonata** (native NAPI addon in `apps/sonata/`) is an optional, self-hosted TTS path. When available and selected, the TTS gateway can use Sonata instead of Cartesia. It is not required for production; Cartesia is the default and recommended TTS.

## Ignore for new work

Do **not** prioritize or propose:

| Stack | What to ignore |
|-------|----------------|
| **Qwen / Qwen3-Omni** | Qwen3-Omni integration, rust-omni, qwen3-omni session manager E2E, MLX-Qwen3-Omni build/feasibility, Qwen TTS, Candle/Omni pipeline wiring, Director Mode Qwen paths, any "fix Qwen gaps" or "wire Qwen" work. |
| **Kyutai** | Kyutai DSM setup, Kyutai STT/TTS, Moshi/MLX bridge, Kyutai voice clone Ferni, Kyutai production deploy, Kyutai Rust/Candle roadmaps, "wire Kyutai STT" or Kyutai-focused gap-filling. |

Existing code and docs for Qwen and Kyutai may stay for reference or legacy; do not add new features or E2E for those stacks.

## Focus instead

- **Cartesia TTS** as the default production TTS (persona voices, gateway or LiveKit plugin).
- **Gemini Live** (and optionally OpenAI Realtime) as LLM backends; **STT is built into these** (no separate STT service).
- **Sonata** as an optional TTS path when the native addon is built and configured.
- **LiveKit** voice agent path and production stability.
- Gaps and improvements on the **Cartesia-based pipeline** first.

## What to work on next

For a single prioritized list of what to fix, wire, or prove (memory, tools, tests, debt, etc.) **excluding** Qwen/Kyutai, see **`docs/FOCUS-EVERYTHING-ELSE.md`**.

## References

- `CLAUDE.md` → "Voice stack direction: Sonata (ignore Qwen & Kyutai)"
- `.cursorrules` / Cursor rules → same directive for AI agents
