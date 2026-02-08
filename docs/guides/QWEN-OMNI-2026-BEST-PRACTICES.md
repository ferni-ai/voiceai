# Qwen Omni: Use, Customize & Improve (2026)

Short guide on how to use, customize, and make Qwen3-Omni better in 2026, based on official EvalScope docs and vLLM guidance.

---

## Evaluation & Performance (EvalScope)

**Setup:**

- Install EvalScope: `pip install 'evalscope[app,perf]' -U`
- Use an **OpenAI API–compatible** inference service (vLLM / Qwen Thinker), not local transformers
- Use a dedicated Python env to avoid conflicts

**Deploy with vLLM:**

- **dtype:** `bfloat16`
- **max-model-len:** `32768` tokens
- Example:  
  `vllm serve Qwen/Qwen3-Omni-30B-A3B-Instruct --port 8801 --dtype bfloat16 --max-model-len 32768`

**Stress testing:**

- Example workload: 1024 tokens text + 512×512 image(s)
- A100 80G recommended for benchmarking
- Use EvalScope perf:  
  `evalscope perf --model Qwen3-Omni-30B-A3B-Instruct --url http://localhost:8801/v1/chat/completions ...`

---

## Output Modality Customization (Qwen2.5-Omni / vLLM)

You can restrict or control output modalities, e.g.:

- **Text-only:** `--modalities text`
- **Audio:** `--output-wav` for WAV output
- Mixed modalities (audio, video, images) or single types

Use these flags when serving or when building your pipeline so Qwen Omni only does what you need (e.g. text-only for our Thinker path, or audio for TTS).

**Our stack:** Set `QWEN3_OMNI_TEXT_ONLY=true` for text-in/text-out (stress testing). Run `node scripts/qwen3-omni/stress-test.mjs --requests 100 --concurrency 5` and see [STRESS-TEST-QWEN-OMNI.md](./STRESS-TEST-QWEN-OMNI.md).

---

## Input Processing

- Local media files (audio, video, images) via CLI or API
- Mixed multimodal inputs (video + images + audio)
- Audio extraction from video
- Generator mode for large-scale or batch prompt processing

---

## Making Qwen Omni “Better” in Our Stack

1. **Full stack by default** – When `USE_QWEN3_OMNI=true`, we default to the session manager (BTH: emotion, personality, quality). Set `USE_QWEN3_OMNI_FULL_STACK=false` to use the Realtime adapter only.
2. **Voice cloning** – Use per-persona 3s references; Qwen3-TTS supports cloning so we get distinct persona voices vs fixed Cartesia voices.
3. **Native function calling** – No JSON workaround; more reliable tool execution.
4. **Post-TTS** – Apply BTH preset (warmth, presence) in the session manager and in the livekit-tts-adapter.
5. **Observability** – We log path (`qwen_full_stack`, `gemini_cartesia`, etc.) at session creation so you can compare latency and quality.
6. **EvalScope** – For formal evaluation, use EvalScope with OmniBench and the recommended tokenizer/model settings from the [EvalScope Qwen3-Omni best practices](https://evalscope.readthedocs.io/en/latest/best_practice/qwen3_omni.html).

---

## References

- [EvalScope – Best practices for Qwen3-Omni](https://evalscope.readthedocs.io/en/latest/best_practice/qwen3_omni.html)
- [Hugging Face – Evaluating Qwen3-Omni](https://huggingface.co/blog/kelseye/eval-qwen3-omni)
- vLLM Qwen2.5-Omni: output modalities, `--modalities`, `--output-wav`
- Internal: `docs/plans/QWEN-BETTER-THAN-HUMAN-LEVERS.md`, `src/integrations/qwen3-omni/CLAUDE.md`
