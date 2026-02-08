# Whisper vs Qwen3-Omni: When to Use Which

**Goal:** Production-ready, tested, validated, better-than-human Rust Omni stack. Do we need Whisper or can we do everything with Qwen3-Omni?

---

## Short Answer

- **Today (production):** Use **Whisper (STT) + Candle Thinker (text) + TTS**. Full Qwen3-Omni (audio in → audio out) would require porting the **audio encoder (AuT)** and **Talker** to Candle; we only have the Thinker (text in → text out).
- **Future (optional):** When we add **AuT + Talker** in Candle (or use a runtime that supports them), we can offer an **Omni-native** mode: audio in → Qwen3-Omni → audio out, no separate Whisper or TTS. Until then, Whisper + Thinker + TTS is the production path.

---

## What Qwen3-Omni Actually Is

Qwen3-Omni is **natively end-to-end omni-modal**:

- **Inputs:** Text, images, **audio**, video. It can understand **speech directly** (no separate STT).
- **Outputs:** Text and **real-time streaming speech** (Talker). So it can do **audio in → audio out** in one model.

Our **Candle implementation** is **Thinker-only**:

- **Thinker:** MoE transformer, text in → text out. Loads HF safetensors, Metal GPU, KV cache, generate loop.
- **Missing in Candle:**  
  - **AuT (audio encoder):** Encodes raw audio into the modality space the Thinker expects.  
  - **Talker:** Generates streaming speech from Thinker outputs (e.g. Code2Wav).  

So with **only** the Candle Thinker we **cannot**:

- Accept raw audio as input (we need text; hence Whisper or another STT).
- Produce speech directly (we need TTS).

---

## Why Keep Whisper for Production

| Reason | Detail |
|--------|--------|
| **Proven** | whisper-rs with Metal: 8–40× realtime on Apple Silicon, 19 languages. |
| **Already integrated** | rust-audio STT is implemented and wired in rust-omni. |
| **No extra port** | AuT in Candle is a large, separate port (audio encoder ~1280-dim, 32 layers). |
| **Same quality bar** | Qwen3-Omni’s speech understanding is comparable to Gemini 2.5 Pro; Whisper is SOTA for ASR. Using Whisper + Thinker matches our “better than human” bar for transcription + reasoning. |

So: **we do need Whisper (or another STT)** until we have AuT in Candle. “Everything Qwen3-Omni” in the sense of **audio → audio** is a **later phase** (AuT + Talker in Candle or another runtime).

---

## Production Pipeline (Current)

```
Audio (user) → Whisper (STT) → text → Candle Thinker (LLM) → text → TTS (ferni-tts/Cartesia) → Audio (agent)
```

- **STT:** whisper-rs (Metal on macOS).  
- **Thinker:** Candle Qwen3-Omni Thinker (Metal).  
- **TTS:** ferni-tts HTTP (Cartesia/CosyVoice) or Mock for tests.  

This pipeline is **production-ready** once: real TTS client in rust-omni, CI, Node package, E2E test, and voice-agent integration are in place.

---

## Future: Full Qwen3-Omni (Audio → Audio)

When we add **AuT + Talker** (in Candle or via another runtime):

```
Audio (user) → Qwen3-Omni (AuT + Thinker + Talker) → Audio (agent)
```

Then we could offer an **Omni-native** mode and optionally **deprecate** Whisper for that path. Until then, Whisper + Thinker + TTS remains the main, validated path.

---

## Summary

| Question | Answer |
|----------|--------|
| Do we need Whisper? | **Yes for production.** Our Candle stack is Thinker-only (text in/out). Audio in requires AuT; audio out requires Talker. |
| Can we do everything with Qwen3-Omni? | **Only when** we have AuT + Talker in our stack. Then we can do audio → audio without Whisper or external TTS. |
| What’s production-ready now? | **Whisper + Candle Thinker + TTS** (with real TTS client, CI, tests, voice-agent integration). |
| What’s “better than human”? | Same pipeline plus: superhuman context into TTS, latency targets, and acceptance criteria in docs/tests. |
