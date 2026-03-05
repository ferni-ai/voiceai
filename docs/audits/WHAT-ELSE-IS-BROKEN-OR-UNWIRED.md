# What Else Is Broken, Unwired, or Needs Integration

> **Purpose:** Single consolidated view of broken code, unwired integrations, incomplete features, and wiring gaps across the repo.  
> **Sources:** SRC-ISSUES-AUDIT, VOICE-AGENT-PIPELINE-GAPS-AUDIT, ISSUES-GAPS-AND-DEBT, MEMORY-PIPELINE-AUDIT, KYUTAI-DSM-GAPS, HIGGS-INTEGRATION-STATUS, FIRESTORE-IMPLEMENTATION-AUDIT.  
> **Last updated:** February 2026
>
> **Voice stack:** We are moving to **Sonata**. Do **not** prioritize or propose work on **Qwen3-Omni** or **Kyutai** (see `docs/VOICE-STACK-DIRECTION.md`). Items below that are purely Qwen/Kyutai-related are intentionally deprioritized.
>
> **Focus list:** For a single "what to do next" list (everything except Qwen/Kyutai), see **`docs/FOCUS-EVERYTHING-ELSE.md`**.

---

## 1. Critical / Broken (Blocks Features)

| Item | Location | Detail |
|------|----------|--------|
| **Ferni TTS** | `tts-wrapper.ts`, `ferni-tts-core.ts`, `providers/ferni-tts.ts` | **Done:** `FerniTTSProvider` added; `getTTSProvider()` returns it when `TTS_PROVIDER=ferni-tts`. Gateway uses Ferni for synthesis. Superhuman context can be added later via gateway config. |
| **Pre-STT enhanced audio → STT** | pre-stt-frame-processor, voice-agent-entry | **Done:** When `preSTTAudioProcessing` is enabled, PreSTTFrameProcessor is used as session noiseCancellation so AGC + noise suppression are applied before STT. Twilio path already uses Pre-STT in twilio-stream-bridge. |
| **Human-signal extraction was broken** | `cleanup-handler.ts` (fixed) | Was reading `flow?.turns` (always empty). **Fixed** to use `historyTracker.getSimpleTurns()`. |
| **Memory pipeline underpopulated** | Dynamic memory, entity extraction | After fix, L2/L3 and entity extraction still need validation: backfill human signals, fix topic/keyPoints in summarization (MEMORY-PIPELINE-AUDIT). |
| **rust-omni TTS is Mock only** | `apps/rust-omni/src/napi.rs` | `tts_client` is always `MockSynthesisClient`. No real TTS (Cartesia/ferni-tts) in rust-omni for production. |
| **Gamification re-export** | Tests, `tools/gamification.ts` | **Done:** `tools/gamification.ts` re-export shim exists; maya-integration gamification tests un-skipped and passing. |

---

## 2. Unwired / Built But Not Used

| Item | Location | Detail |
|------|----------|--------|
| **Unified intelligence stub** | `tools/unified-intelligence-stub.ts`, `tools/intelligence/index.ts` | Full intelligence layer replaced by no-op stub; all methods return empty. Document as intentional or implement minimal behavior. |
| **Workflow LLM step** | `services/workflow-engine.ts` | Placeholder documented; step not wired to real LLM. Wire via getExtractionModel() / GoogleGenerativeAI or mark workflow unsupported. |
| **LocalCrossEncoder** | `memory/retrieval/cross-encoder.ts` | **Done:** JSDoc and log state "use GeminiCrossEncoder (getReranker default)". getReranker() already uses Gemini or Heuristic. |
| **Tools with no execute** | `tools/registry/loader.ts:1218` | When tool has no `execute`, uses `async () => ({ error: 'Not implemented' })`. Ensure all registered tools have `execute` or reject at registration. |
| **OmniEngine not in voice agent** | rust-omni, voice-agent-entry | No TypeScript path uses `OmniEngine` (transcribe → generate → speak) behind a feature flag. |
| **Event emissions** | transcript-handler, audio-processor, data-message-handlers | **Audited:** Frontend has handlers in `apps/web/src/app/data-message-handlers.ts` for `voice_prosody`, `avatar_cue`, `anticipation_signal`, `laughter_detected`, `humanization_signal` (emotion), `speech_state`, `breath_sync`, `partial_transcript`. Backend emits these; `engagement_trigger` is in types. |

---

## 3. Incomplete / TODO / Placeholder

| Item | Location | Detail |
|------|----------|--------|
| **TTS streaming latency** | `gateway-tts-node.ts:123` | "TODO (LATENCY-OPT): Implement streaming synthesis for true better than human latency." |
| **Cache hits not tracked** | `turn-processor-integration.ts:408` | "TODO: track cache hits" — passes `false`. |
| **Link reinforcement not tracked** | `memory/unified-store/facade.ts:810` | `linksStrengthened: 0` — "TODO: track link reinforcement." |
| **Agent messages across turns** | `turn-processor.ts:2297` | "TODO: Track agent messages across turns - currently services doesn't expose this easily." |
| **Retraining golden set** | `retraining-pipeline.ts:351` | "Placeholder - in production, you'd run against a golden set." |
| **Embedding cache key** | `firestore-vector-store/core.ts:614` | `cacheKey = '[embedding]'` — "Placeholder - fuzzy matching uses embedding." |
| **Context builder execution** | context-builders, turn-processor | 80+ builders registered; no metrics that they run or yield data (success/failure, injection yield, execution time). |
| **Session lifecycle verification** | Cleanup, disconnect | No verification that session cleanup hooks always fire on disconnect. |
| **Warmup verification** | `warmupResources` | Warmup runs at startup but no check that warmed modules are actually usable (e.g. no broken module detection). |

---

## 4. Deprecated But Still Referenced

| Deprecated | Prefer | Notes |
|------------|--------|--------|
| `switchAccent()` | `switchToLocalizedAccent()` | speech/tts/persona-aware.ts |
| `routeTranscript()` / routing | UTO | transcript-integration.ts |
| Tier 0/1/2 keyword routing | FTIS hierarchical classifier | dynamic-tool-router.ts |
| Old routing flag | `isFTISEnabled()` | tool-routing-config.ts |
| Global runtime helpers | `SessionBundleRuntimeManager` | personas/bundles/runtime.ts |
| Old delight/vulnerability detectors | `detectUserDelightWithContext`, `detectVulnerabilityWithContext` | emotion-event-dispatcher.ts |
| `rehydrateConversationEmbeddings()` | Do not use; FirestoreVectorStore is persistent | memory/index.ts |
| Old intelligence hooks | Context builders; hooks return null | conversation-session-integration.ts |
| `UserData` from old location | `UserData` from `shared/types.js` | session-init-handler.ts |
| FTIS observability route | "FTIS has been removed" — route deprecated | observability-routes.ts |

---

## 5. Tests / Quality

| Item | Detail |
|------|--------|
| **~80+ skipped/todo tests** | Many files use `describe.skip`, `it.skip`, or `it.todo`. Prioritize un-skipping critical paths. |
| **superhuman-memory-pipeline.test.ts** | Entire file skipped: "timing/rules.js module not yet implemented." |
| **memory-intelligence-e2e.test.ts** | Many `it.todo` for memory intelligence, injection, crisis blocking. |
| **maya-integration.test.ts** | Imports non-existent `../tools/gamification.js`; tests skipped. Fix import to `domains/habits/gamification` or add shim. |
| **100+ restricted imports** | ESLint no-restricted-imports: deep relative imports into `services/` instead of absolute/barrel. |
| **TypeScript** | Pre-existing errors in other files (e.g. legacy-fallback-executor.ts, createLogger signature, turn-handler audioEmbedding). |

---

## 6. Firestore (Done Recently)

| Item | Status |
|------|--------|
| TranscriptCleanupJob indexes | Done — fieldOverrides for conversations, group_sessions, conversation_summaries; deployed. |
| FAILED_PRECONDITION handling | Done — memory-jobs uses `runFirestoreQuery()`; optional for other collection-group call sites. |
| Other collection-group indexes | As-needed when FAILED_PRECONDITION is seen (calendar, family, outreach, etc.). |

---

## 7. External / Optional / Future

| Area | Detail |
|------|--------|
| **Kyutai MLX bridge** | `scripts/kyutai/mlx-bridge-server.py` with `--use-mlx` only prints "STT/TTS wiring TODO"; no real STT/TTS into moshi_mlx. |
| **Kyutai full-duplex** | Bidirectional inference loop TODO; function calling "pause and call" not integrated. |
| **Higgs** | TTS, STT, biomarkers, generate-reply, session lifecycle wired (HIGGS-INTEGRATION-STATUS). Optional: per-session STT connection for multi-session. |
| **Qwen3 Omni** | Candle pipeline and rust-omni in CI; E2E with real checkpoint via repo secrets. Voice agent integration (OmniEngine) not wired. |
| **iOS** | FerniOmniService.swift stub only; no UniFFI, no iOS build. |
| **MCP request_voice_input** | Queues question but does not block for voice response. |

---

## 8. Prioritized “Fix Next” (Suggested)

### P0 – Unblock features

1. ~~**Wire Ferni TTS**~~ **Done:** `FerniTTSProvider` in `providers/ferni-tts.ts`; `getTTSProvider()` returns it when `TTS_PROVIDER=ferni-tts`.
2. ~~**Pre-STT enhanced audio → STT**~~ **Done:** PreSTTFrameProcessor wired in voice-agent-entry when `preSTTAudioProcessing` is enabled; Twilio path uses Pre-STT in twilio-stream-bridge.
3. ~~**Fix gamification imports**~~ **Done:** Re-export shim exists; maya-integration gamification tests un-skipped.

### P1 – Reduce risk / improve quality

4. ~~**Context builder metrics**~~ **Done:** recordBuilderMetrics, recordTurnMetrics, getMetricsSummary in `context-builders/metrics.ts`; exposed via GET `/api/admin/builder-metrics` (builder-metrics.ts).
5. ~~**Workflow LLM step**~~ **Done:** Documented as unsupported; comment points to SRC-ISSUES-AUDIT.
6. ~~**Cross-encoder fallback**~~ **Done:** LocalCrossEncoder JSDoc and log say use Gemini (getReranker default).
7. ~~**Audit frontend data channel listeners**~~ **Done:** Handlers in `apps/web/src/app/data-message-handlers.ts` for voice_prosody, avatar_cue, anticipation_signal, laughter_detected, humanization_signal, speech_state, breath_sync, partial_transcript; engagement_trigger in types.

### P2 – Debt and observability

8. **Session lifecycle verification** — ensure cleanup hooks run on disconnect (optional; not implemented).
9. ~~**Warmup verification**~~ **Done:** GCE worker logs warning if warmup >15s.
10. ~~**Un-skip gamification tests**~~ **Done:** Maya gamification tests un-skipped and passing. superhuman-memory-pipeline still skipped (timing/rules not implemented).

---

## References

- `docs/audits/SRC-ISSUES-AUDIT.md` — Broken, unwired, dead code, TODOs.
- `docs/audits/VOICE-AGENT-PIPELINE-GAPS-AUDIT.md` — Pipeline wiring gaps (Ferni TTS, Pre-STT, events, context builders).
- `docs/architecture/ISSUES-GAPS-AND-DEBT.md` — Candle, rust-omni, ONNX, TypeScript debt, iOS.
- `docs/audits/MEMORY-PIPELINE-AUDIT-2026-01-25.md` — Memory promise, human signals, entity extraction.
- `docs/plans/KYUTAI-DSM-GAPS.md` — Kyutai MLX bridge, full-duplex, E2E.
- `docs/plans/HIGGS-INTEGRATION-STATUS.md` — Higgs wired status.
- `docs/audits/FIRESTORE-IMPLEMENTATION-AUDIT.md` — Indexes and FAILED_PRECONDITION (main items done).
- `src/docs/TECHNICAL-DEBT-TRACKER.md` — Migration TODOs, pagination, placeholders (if present).
