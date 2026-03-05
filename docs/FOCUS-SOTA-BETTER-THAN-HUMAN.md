# Make the Platform SOTA and Better Than Human

**Scope:** `src/` — what to build, wire, and prove so Ferni is **state-of-the-art** and **better than human**.

**Principles:**
- **SOTA** = best-in-class latency, reliability, tool routing, memory, and voice quality on the Sonata pipeline.
- **Better than human** = superhuman memory, presence, pattern recognition, emotional intelligence, and life coaching no human can match.

Use this with `docs/FOCUS-EVERYTHING-ELSE.md` for prioritization (this doc is the *vision*; that one is the *backlog*).

---

## 1. Better Than Human — What We Already Have (src/)

| Pillar | Where in src/ | Status |
|--------|----------------|--------|
| **Perfect memory** | `memory/dynamic/`, `memory/knowledge-graph/`, `services/unified-memory-service.ts`, STM → L2 → L3 | Wired; validate under load and backfill. |
| **Superhuman services (10+)** | `services/superhuman/`, `agents/integrations/better-than-human-integration.ts` | Commitment keeper, capacity guardian, values, dreams, life narrative, relationship network, etc. |
| **Live BTH injections** | `agents/processors/live-superhuman-injections.ts` | Social graph, data capture, emotional trajectory, pattern outreach, voice biomarkers, perfect timing, ambient context. |
| **Semantic intelligence** | `services/superhuman/semantic-intelligence/` | Correlation mining, emotional trajectories, relational semantics, growth fingerprint, cross-session threading. |
| **Predictive intelligence** | `intelligence/predictive/` | Markov, time series, multi-signal fusion, 8 BTH v4 capabilities. |
| **Emotion → frontend** | `agents/realtime/emotion-event-dispatcher.ts` | humanization_signal, concern, trajectory; bridges to avatar/EQ. |
| **Life coaching domains** | `personas/bundles/ferni/content/behaviors/`, life-coaching context builders | Second chances, connection, difficult conversations, life transitions, quiet growth. |
| **Naturalness & timing** | `speech/naturalness/`, `agents/shared/performance/adaptive-timing.ts`, `emotion-adaptive-timing.ts` | Stress-aware, emotion-aware fillers, adaptive timeouts. |

---

## 2. SOTA — Technical Excellence (src/)

| Area | Goal | Where in src/ | Action |
|------|------|----------------|--------|
| **Latency** | First response & TTS feel instant | `agents/shared/performance/`, `speech/tts-gateway/`, adaptive-timing, cache-aware-tts | Hit latency budget; streaming TTS (TODO in gateway-tts-node); measure and alert. |
| **Tool routing** | Correct tool, minimal LLM bloat | `tools/semantic-router/`, `tools/orchestrator/`, FTIS | SOTA routing already; ensure all tools have `execute`, reject stubs at registration. |
| **Memory** | Fast capture, rich recall | `memory/dynamic/fast-capture.ts`, `stm-buffer.ts`, unified-memory-service | Prove L2/L3 backfill and retrieval quality; track link reinforcement. |
| **Reliability** | No silent failures | `agents/`, `services/` | Session lifecycle verification; context builder metrics; circuit breakers for external calls. |
| **Observability** | Every BTH capability measurable | `services/better-than-human-validation/`, context-builders metrics, builder-metrics API | Ensure BTH signals and builder execution are logged/measured so we can tune. |

---

## 3. Remaining BTH Gaps (from BETTER-THAN-HUMAN-GAPS)

| Gap | Location | Action |
|-----|----------|--------|
| **Micro-expression events** | Backend should emit events for avatar (concern 60ms, delight 100ms, recognition 80ms) | In `emotion-event-dispatcher.ts` or transcript-handler, emit `humanization_signal` with `microExpression` type and duration; frontend already has Ferni EQ. |
| **Active listening signals** | Backend signals for when to nod / lean / contemplative | Emit on user speech pause and interest points (e.g. from transcript-handler or audio-processor) so frontend can drive nods/leans. |
| **Voice fingerprint** | Currently userId proxy | Optional: store/compare voice fingerprint for cross-device recognition; low priority. |

---

## 4. Prioritized src/ Actions (SOTA + BTH)

### P0 – Prove and harden

1. **Memory pipeline** — Validate L2/L3 and entity extraction; backfill human signals; fix topic/keyPoints in summarization (`memory/`, MEMORY-PIPELINE-AUDIT).
2. **Tools with no execute** — Audit `tools/registry/loader.ts` and tool domains; ensure every registered tool has a real `execute` or reject at registration.
3. **Session lifecycle** — Verify cleanup hooks always run on disconnect (test or health check in `agents/voice-agent/cleanup-handler.ts`).

### P1 – BTH completeness

4. **Micro-expression events** — In `src/agents/realtime/emotion-event-dispatcher.ts` (or callers), emit `humanization_signal` with `signalType: 'micro_expression'`, `subtype: 'concern'|'delight'|'recognition'`, and duration 60–120ms when concern/delight/recognition is detected; ensure frontend handles them.
5. **Active listening** — Emit pause/interest events from transcript-handler or audio-processor (e.g. `humanization_signal` with `signalType: 'active_listening'`, `subtype: 'nod'|'lean'`) so avatar can nod on pause and lean on interest.
6. **BTH observability** — Confirm all BTH signals and context builder execution are covered by `better-than-human-validation` and builder-metrics; add any missing instrumentation in `src/agents/` and `src/intelligence/`.

### P2 – SOTA polish

7. **TTS streaming** — Implement streaming synthesis in `speech/tts-gateway/` (Sonata path) for better-than-human latency (see TODO in gateway-tts-node).
8. **Cache and reinforcement** — Track cache hits in turn-processor-integration; track link reinforcement in memory unified-store facade.
9. **Deprecated cleanup** — Migrate off deprecated APIs in `src/` (switchAccent, old routing, rehydrateConversationEmbeddings, etc.) per WHAT-ELSE §4.

### P3 – Optional

10. **Voice fingerprint** — Implement storage and comparison in `src/` for cross-device recognition (currently userId proxy).
11. **ML ambient audio** — Replace prosody heuristics in `detectAmbientContext()` with audio classification when available.

---

## 5. References

- `design-system/docs/brand/BETTER-THAN-HUMAN.md` — Ferni EQ spec (micro-expressions, active listening, breath sync, concern, anticipation).
- `docs/audits/BETTER-THAN-HUMAN-GAPS.md` — What’s done vs remaining (micro-expression events, active listening backend).
- `src/services/superhuman/CLAUDE.md` — Superhuman services.
- `src/agents/integrations/better-than-human-integration.ts` — BTH load at session start.
- `src/agents/processors/live-superhuman-injections.ts` — Per-turn BTH injections.
- `src/agents/realtime/emotion-event-dispatcher.ts` — Backend → frontend BTH signals.
- `docs/FOCUS-EVERYTHING-ELSE.md` — Backlog (excludes Qwen/Kyutai).
- `docs/VOICE-STACK-DIRECTION.md` — Sonata only.

---

*Last updated: February 2026*
