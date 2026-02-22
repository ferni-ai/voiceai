# Higgs: Better Than ChipChat, Kyutai, Gemini Live, and OpenAI Realtime

**Goal:** Make the Higgs pipeline the **best-in-class** voice stack: better than Apple ChipChat, Kyutai DSM, Google Gemini Live, and OpenAI Realtime on the dimensions that matter for Ferni — latency, quality, features, and control.

This plan defines **what “better” means** for each competitor, **concrete improvements** (latency, quality, features), and a **phased roadmap** so we can execute and measure.

---

## 1. What “better” means per competitor

| Competitor | Their strength | We beat them by |
|------------|-----------------|------------------|
| **ChipChat** | ~920 ms E2E on-device; state-action LLM; interruption feedback | Match or beat E2E with Higgs + local LLM; add interruption feedback; keep tools, biomarkers, humanization, deployability. |
| **Kyutai** | BTH latency targets (<150 ms interim STT, <250 ms TTS TTFB, <500 ms E2E); streaming; DSM quality | Hit same or tighter latency targets; match or beat STT/TTS quality; single Rust binary, no Python. |
| **Gemini Live** | Cloud, built-in VAD/STT, one API | Reliable function calling (OpenAI or fixed Gemini); same or better latency; keep our stack (Higgs STT+TTS, biomarkers, 100+ tools). |
| **OpenAI Realtime** | Native function calling, low latency, one API | Match or beat latency with Higgs STT+TTS; keep full control (biomarkers, 9-stage humanization, deploy anywhere, on-device option). |

**We don’t have to beat them on every single axis.** We win by being **best overall** for a voice-first life coach: latency + quality + **tools + biomarkers + humanization + deployment flexibility**. The table below turns that into measurable criteria.

---

## 2. Measurable “better than” criteria

### 2.1 Latency (better than ChipChat & Kyutai)

| Metric | ChipChat / Kyutai bar | Higgs target | How we measure |
|--------|------------------------|--------------|----------------|
| **STT first interim** | Kyutai: <150 ms from speech start | **<150 ms** | First PCM in → first interim transcript (Higgs STT path). |
| **STT final** | Kyutai: <300 ms from end of utterance | **<300 ms** | Last PCM of utterance → final transcript. |
| **TTS TTFB** | Kyutai: <250 ms; ChipChat ~880 ms to TTS start | **<200 ms** (stretch <150 ms) | Synthesize request → first PCM chunk (gateway + Rust). |
| **E2E to first audio** | ChipChat ~920 ms; Kyutai <500 ms | **<600 ms** (stretch <500 ms) | User stop-speaking → first TTS audio at client (Higgs STT → LLM → Higgs TTS). |

**Note:** E2E depends on LLM (cloud RTT vs local). For “better than ChipChat” we use **Higgs + local LLM** (Ollama/Candle via generate_reply or Node local pipeline) and tune so total is ≤920 ms; for “better than Kyutai” we target <500 ms to first audio when colocated.

### 2.2 Quality (better than Kyutai & cloud APIs)

| Dimension | Bar | Higgs target |
|-----------|-----|--------------|
| **STT** | Kyutai/Gemini/OpenAI WER | Parity or better on test set; report WER for Higgs Whisper/Parakeet. |
| **TTS** | Cartesia / Kyutai DSM / ChipChat SpeakStream | MOS or A/B vs Cartesia; 9-stage humanization as differentiator. |
| **Biomarkers** | — | Only we do voice biomarkers → BTH/emotion; keep and expand. |

### 2.3 Features (we already lead; reinforce)

| Feature | ChipChat | Kyutai | Gemini Live | OpenAI Realtime | Higgs + Ferni |
|---------|----------|--------|-------------|-----------------|---------------|
| **Tools** | None | None | Unreliable (JSON workaround) | Native FC | **100+ tools** |
| **Biomarkers** | No | No | No | No | **Yes** |
| **Humanization** | Vocoder only | — | — | — | **9-stage DSP** |
| **Context / memory** | Conv only | — | Session | Session | **Firestore, context builders, personas** |
| **On-device option** | Yes | Yes (MLX) | No | No | **Yes (generate_reply, Candle)** |
| **Deploy anywhere** | No (research) | Python/MLX | Cloud | Cloud | **Rust, Mac/Linux/GCE** |

**Action:** Document and evangelize these differentiators; ensure no regression (e.g. tools always work with preferred LLM).

### 2.4 Reliability (better than Gemini Live / OpenAI Realtime)

| Issue | Today | Target |
|-------|--------|--------|
| **Function calling** | Gemini native FC unreliable; we use JSON workaround; OpenAI Realtime reliable | Prefer **OpenAI Realtime** when “reliable tools” is required; or adopt Gemini native FC once stable; document recommendation. |
| **Tool call leakage** | Gemini sometimes narrates tool calls; we detect and strip | Same as above; optional: “Higgs + OpenAI” as default for production. |
| **Uptime / ops** | Cloud APIs can have outages | Higgs is our pipeline; we control Rust binary, warmup, keepalive; document SLAs and fallbacks (e.g. Cartesia if Higgs down). |

---

## 3. Concrete improvements (prioritized)

### Phase 1: Measure and tune latency (beat Kyutai / ChipChat bar)

| # | Change | Owner | Done when |
|---|--------|--------|-----------|
| 1.1 | **Instrument E2E latency** in Node + Rust: STT first interim, STT final, TTS TTFB, user-stop → first audio. Log or expose via turn profiler / E2E tracker by provider (`higgs-pipeline` vs cartesia). | Node + Rust | Metrics in logs or dashboard; p50/p95 per metric. |
| 1.2 | **Benchmark script** (e.g. `scripts/higgs/benchmark-latency.ts` or Rust): run N STT finalizations, N TTS requests; report p50/p95. Optional: one full E2E turn. | Node or Rust | Script runs; CI or nightly can run it; fail or warn if p95 > threshold (e.g. TTS TTFB >250 ms). |
| 1.3 | **Tune Rust streaming**: `chunk_steps` (or equivalent) exposed and defaulted for low latency; lightweight humanization in streaming (stages 3–5); document recommended chunk size. | Rust | TTS TTFB p95 <200 ms (stretch <150 ms) in benchmark. |
| 1.4 | **STT latency**: If Higgs STT is used, ensure first interim and final are measured; tune buffer/VAD so we hit <150 ms / <300 ms when feasible. | Rust / Node | STT metrics in benchmark; targets documented. |
| 1.5 | **Latency budget doc**: e.g. STT 50 ms + LLM 200 ms + TTS 150 ms + 100 ms buffer = 500 ms; align turn profiler / E2E tracker with this. | Docs | Budget documented; instrumentation matches. |

**References:** `HIGGS-BEST-IN-CLASS-PLAN.md` (§1 Latency), `BETTER-THAN-NEMO-AUDIT.md` (metrics table), `KYUTAI-DSM-BETTER-THAN-HUMAN.md` (targets).

### Phase 2: Interruption and coherence (beat ChipChat on UX)

| # | Change | Owner | Done when |
|---|--------|--------|-----------|
| 2.1 | **Interruption feedback (ChipChat-style):** When user interrupts, TTS/gateway signals “last vocalized phrase” or “last word index”; Node (or future Rust loop) can pass that to LLM context so unvocalized content is not repeated. | Node (gateway + turn-processor) | Design doc; optional implementation (e.g. `lastVocalizedPhrase` in context). |
| 2.2 | **Turn cut:** Ensure streaming TTS is stopped as soon as next turn starts; no “ghost” tail. | Node | Verified in E2E; no audible overlap. |

**Reference:** `CHIPCHAT-VS-HIGGS.md` (interruption feedback).

### Phase 3: Quality and differentiation (beat Kyutai / cloud on quality)

| # | Change | Owner | Done when |
|---|--------|--------|-----------|
| 3.1 | **STT WER:** Run Higgs STT (Whisper/Parakeet) on a fixed test set; report WER; compare to Kyutai or published baselines if available. | Rust / eval | WER number in docs or CI. |
| 3.2 | **TTS quality:** A/B or MOS vs Cartesia (and optionally Kyutai) for Ferni voice; document “Higgs 9-stage humanization” as differentiator. | Product / eng | One A/B or MOS result documented. |
| 3.3 | **Emotion → Higgs:** Centralize emotion/prosody mapping (done per HIGGS-BEST-IN-CLASS); optionally feed biomarker-derived emotion into next TTS request for gentler tone when user sounded stressed. | Node | Mapping in one place; optional biomarker→TTS path. |

**Reference:** `HIGGS-BEST-IN-CLASS-PLAN.md` (§2 Quality).

### Phase 4: Reliability and LLM choice (beat Gemini Live / match OpenAI Realtime)

| # | Change | Owner | Done when |
|---|--------|--------|-----------|
| 4.1 | **Recommend OpenAI Realtime for production** when reliable function calling is required; document in deployment/ops docs and optionally default to `USE_OPENAI_REALTIME=true` for new deploys. | Docs / config | Recommendation in CLAUDE.md or runbook; optional default. |
| 4.2 | **Higgs + OpenAI Realtime:** Validate and document “Higgs STT + Higgs TTS + OpenAI Realtime LLM” as the **lowest-latency, most reliable** cloud stack (best of both). | Node / docs | E2E validated; one-page “best stack” doc. |
| 4.3 | **Fallback:** If Higgs is down, fall back to Cartesia (and optionally Gemini/OpenAI STT) so voice still works; document and test. | Node | Fallback path tested; doc updated. |

**Reference:** `HIGGS-BEST-IN-CLASS-PLAN.md` (§6 What’s still broken / better than Gemini Live).

### Phase 5: On-device and optional full stack (beat ChipChat on deployment)

| # | Change | Owner | Done when |
|---|--------|--------|-----------|
| 5.1 | **Higgs generate_reply (full local loop):** Already implemented (Ollama/Candle in Rust). Document “Higgs STT + Higgs TTS + generate_reply” as **on-device, no cloud** option; tune for E2E <920 ms on target hardware (e.g. Mac Studio / M2). | Rust + docs | E2E measured and documented; optional target <920 ms. |
| 5.2 | **Context in generate_reply:** Pass conversation history and optional context string from Node to Rust `GenerateReply` so local replies are coherent. | Node + Rust | Protocol supports context; Node sends last N turns or summary. |

**Reference:** `HIGGS-RUST-REALTIME-GAPS.md`, `HIGGS-INTEGRATION-STATUS.md` (generate_reply).

---

## 4. Summary: how we beat each

| Competitor | How Higgs is better |
|------------|---------------------|
| **ChipChat** | (1) Measure and tune E2E so Higgs + local LLM ≤920 ms or better. (2) Add interruption feedback (last vocalized phrase). (3) We already win: tools, biomarkers, humanization, real deployment. |
| **Kyutai** | (1) Hit BTH targets: STT interim <150 ms, final <300 ms, TTS TTFB <250 ms, E2E <500 ms where possible. (2) Single Rust binary, no Python. (3) Quality: WER + MOS parity or better; 9-stage humanization. |
| **Gemini Live** | (1) Prefer OpenAI Realtime when reliable tools matter; or adopt Gemini native FC when stable. (2) Same or better latency with Higgs STT+TTS. (3) We keep: biomarkers, 100+ tools, humanization. |
| **OpenAI Realtime** | (1) Match or beat latency with Higgs STT+TTS. (2) We keep: biomarkers, 9-stage humanization, deploy anywhere, on-device option (generate_reply). (3) Document “Higgs + OpenAI” as best cloud stack. |

---

## 5. Suggested order of work

1. **Phase 1 (latency):** Instrument and benchmark; tune Rust streaming and STT so we have numbers and targets (TTS TTFB <200 ms, E2E <600 ms stretch <500 ms).
2. **Phase 4 (reliability):** Document “Higgs + OpenAI Realtime” as recommended production stack; validate E2E.
3. **Phase 3 (quality):** STT WER and TTS A/B or MOS so we can say “parity or better.”
4. **Phase 2 (interruption):** Design and optionally implement last-vocalized feedback.
5. **Phase 5 (on-device):** Document and tune generate_reply for <920 ms E2E when needed.

---

## 6. References

- [HIGGS-BEST-IN-CLASS-PLAN.md](./HIGGS-BEST-IN-CLASS-PLAN.md) — Latency, quality, performance improvements; what’s done and what’s left.
- [CHIPCHAT-VS-HIGGS.md](./CHIPCHAT-VS-HIGGS.md) — What ChipChat offers vs Higgs; where each is stronger.
- [KYUTAI-DSM-BETTER-THAN-HUMAN.md](./KYUTAI-DSM-BETTER-THAN-HUMAN.md) — BTH latency targets (STT, TTS, E2E).
- [BETTER-THAN-NEMO-AUDIT.md](./BETTER-THAN-NEMO-AUDIT.md) — Metrics table, benchmark script, regression CI.
- [HIGGS-RUST-REALTIME-GAPS.md](./HIGGS-RUST-REALTIME-GAPS.md) — Full stack in Rust (generate_reply, tools, context).
- [HIGGS-INTEGRATION-STATUS.md](./HIGGS-INTEGRATION-STATUS.md) — What’s wired (STT, TTS, biomarkers, generate_reply).
