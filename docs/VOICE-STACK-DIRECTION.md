# Voice stack direction: Cartesia cascade

**Last updated:** 2026-10-04

## Production stack

The voice agent runs the **Cartesia cascade** (`VOICE_PIPELINE` unset, the default):

- **STT:** Cartesia **Ink-2**.
- **LLM:** **Gemini 3.5 Flash** on Vertex (minimal thinking), with native function calling.
- **TTS:** Cartesia **Sonic** through the TTS gateway, using persona voices.

Defined in `src/agents/model-provider/factory.ts` and `cartesia-cascade.ts`. OpenAI Realtime (`USE_OPENAI_REALTIME=true`) and Gemini Live / Gemini native audio (`VOICE_PIPELINE=gemini-live` / `gemini-native-audio`) remain as legacy opt-ins.

## Optional: Sonata

**Sonata** (native NAPI addon in `apps/sonata/`) is an optional, self-hosted TTS/STT path that runs Kyutai's model weights on Apple Silicon. The TTS gateway can use it instead of Cartesia when it is built and selected. It is not required for production.

## Removed (2026-10-04)

These stacks were deleted from the codebase (decision D2). Do not reintroduce them:

| Stack | What was removed |
|-------|------------------|
| **Qwen3-Omni** | `src/integrations/qwen3-omni/`, the `qwen3-omni` provider and its `USE_QWEN3_*` env vars, the `ferni qwen3` CLI, the Rust Candle thinker/talker/code2wav modules and `qwen3-omni-server` binary, and their docs. |
| **Director Mode** | `director-mode-setup.ts`, `src/api/director-routes.ts` (`/ws/director`), and the web Director Console. The cascade's director notes and the TTS speech director are different features and remain. |
| **Local / Omni pipelines** | The Kyutai STT + Ollama `local-pipeline` provider and the Rust `omni-pipeline` provider. |
| **Kyutai sidecars** | The moshi-server Dockerfile and DSM compose file, the GPU agent image built for them, and the Kyutai STT/TTS configs and setup docs. |

The FTIS tool router's fine-tuned Qwen3-1.7B classifier is tool routing, not the voice stack, and stays.

## Focus instead

- The **Cartesia cascade** and production stability on LiveKit Cloud.
- **Sonata** as an optional TTS path when the native addon is built and configured.

## What to work on next

For a prioritized list of what to fix, wire, or prove (memory, tools, tests, debt), see **`docs/FOCUS-EVERYTHING-ELSE.md`**.

## References

- `CLAUDE.md` → "Current Production Stack" and "Voice stack direction"
