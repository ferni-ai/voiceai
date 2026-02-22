# src/ Issues Audit: Broken, Unwired, Dead, Incomplete, and Architecture Gaps

> **Generated:** February 2026  
> **Scope:** `src/` — broken code, unwired integrations, dead code, incomplete features, clean code/architecture violations.

---

## Summary

| Category | Count | Priority |
|----------|-------|----------|
| **Not implemented / stubs** | 10+ | HIGH |
| **Placeholder / TODO** | 20+ | MEDIUM |
| **Deprecated but still used** | 25+ | MEDIUM |
| **Skipped / broken tests** | 80+ files | MEDIUM |
| **Architecture (restricted imports)** | 100+ files | LOW |
| **Dead / legacy references** | 5+ | LOW |

---

## 1. Not Implemented / Stub Code

### High impact

| Location | Issue | Action |
|----------|--------|--------|
| **`tools/unified-intelligence-stub.ts`** | Full intelligence layer replaced by no-op stub. All methods return empty/sensible defaults. | Document as intentional; remove when callers no longer depend on it, or implement minimal real behavior. |
| **`tools/intelligence/index.ts`** | Re-exports stub only. "Full intelligence features have been removed in favor of LLM native function calling." | Same as above. |
| **`services/workflow-engine.ts:570`** | LLM prompt step returns placeholder string: `LLM response placeholder for prompt: ${prompt.slice(0, 100)}...` | Wire to real LLM (e.g. Gemini) or mark step as unsupported. |
| **`memory/retrieval/cross-encoder.ts`** | `LocalCrossEncoder` throws "Local ONNX cross-encoder not implemented"; `score`/`scoreBatch` throw. | Use `GeminiCrossEncoder` or implement ONNX path; document fallback. |
| **`tools/registry/loader.ts:1218`** | When tool has no `execute` function, uses `async () => ({ error: 'Not implemented' })`. | Ensure all registered tools have `execute` or reject at registration time. |

### Lower impact (documented stubs)

| Location | Issue |
|----------|--------|
| **`speech/prosody/emotional-prosody.ts`** | "Stub module for Qwen3-Omni SSML-to-text translation." — Heuristic-only, no real model. |
| **`memory/knowledge-graph/index.ts:189–194`** | Stub methods for backward compatibility: `resolveMention`, `addFact`, `recordMention` delegate or no-op. |
| **`memory/index.ts:110–111`** | "History Tracker Stubs (legacy - history tracking is now handled by session state)" — no-op stubs. |

---

## 2. Unwired / Placeholder / TODO

### Features not fully wired

| Location | Issue |
|----------|--------|
| **`speech/tts-gateway/gateway-tts-node.ts:123`** | "TODO (LATENCY-OPT): Implement streaming synthesis for true better than human latency." |
| **`tools/semantic-router/learning/retraining-pipeline.ts:351`** | "This is a placeholder - in production, you'd run against a golden set." |
| **`tools/semantic-router/integration/turn-processor-integration.ts:408`** | "TODO: track cache hits" — passes `false`. |
| **`memory/unified-store/facade.ts:810`** | `linksStrengthened: 0` — "TODO: track link reinforcement." |
| **`agents/processors/turn-processor.ts:2297`** | "TODO: Track agent messages across turns - currently services doesn't expose this easily." |
| **`memory/firestore-vector-store/core.ts:614`** | `cacheKey = '[embedding]'` — "Placeholder - fuzzy matching uses embedding." |

### Technical debt tracker (existing)

See **`src/docs/TECHNICAL-DEBT-TRACKER.md`** for:

- Migration TODOs (memory service, entity store, data-capture).
- Incomplete features (pagination memories API, complexity/urgency/audio params, workflow cron parser, etc.).
- Placeholder values (e.g. `newUsers: 0`, `throughput: 0`, `linksStrengthened: 0`).

---

## 3. Dead Code / Broken Tests

### Tests importing deleted/moved modules

| File | Issue |
|------|--------|
| **`tests/maya-integration.test.ts`** | `describe.skip('Maya Gamification System')` imports `../tools/gamification.js` — **root `tools/gamification.js` does not exist** (gamification lives in `domains/habits/gamification.ts`). Tests are skipped with TODO. |
| **`tests/maya-integration.test.ts:325`** | `it.skip('should import gamification tools')` imports `../tools/gamification.js` (same). |

**Action:** Point tests at `../tools/domains/habits/gamification.js` (or re-export shim at `tools/gamification.ts` if compatibility is required) and un-skip, or remove obsolete tests.

### Skipped / todo tests (scale)

- **~80+ test files** use `describe.skip`, `it.skip`, or `it.todo`.
- **`tests/synthetic/superhuman-memory-pipeline.test.ts`** — entire file skipped: "timing/rules.js module not yet implemented."
- **`tests/synthetic/memory-intelligence-e2e.test.ts`** — many `it.todo` for memory intelligence, injection, crisis blocking, etc.

**Action:** Prioritize un-skipping tests that guard critical paths; document or implement missing modules (e.g. timing/rules).

---

## 4. Deprecated but Still Referenced

### Deprecated APIs still in use

| Area | Deprecated | Prefer |
|------|------------|--------|
| **`speech/tts/persona-aware.ts`** | `switchAccent()` | `switchToLocalizedAccent()` |
| **`tools/semantic-router/integration/transcript-integration.ts`** | `routeTranscript()` / routing | UTO (see module header) |
| **`tools/dynamic-tool-router.ts`** | Tier 0/1/2 keyword routing | FTIS hierarchical classifier |
| **`config/tool-routing-config.ts`** | Old routing flag | `isFTISEnabled()` |
| **`personas/bundles/runtime.ts`** | Global runtime helpers | `SessionBundleRuntimeManager` |
| **`agents/realtime/emotion-event-dispatcher.ts`** | Old delight/vulnerability detectors | `detectUserDelightWithContext`, `detectVulnerabilityWithContext` |
| **`memory/index.ts`** | `rehydrateConversationEmbeddings()` | Do not use; FirestoreVectorStore is persistent |
| **`agents/integrations/conversation-session-integration.ts`** | Old intelligence hooks | Context builders; hooks return null |
| **`agents/voice-agent/session-init-handler.ts`** | `UserData` from old location | `UserData` from `shared/types.js` |
| **`api/observability-routes.ts`** | FTIS observability | "FTIS has been removed" — route marked deprecated |

### Deprecated modules (re-exports / shims)

- **`tools/RATIONALIZATION.md`** lists root `gamification.ts` as "Re-export shim" from `domains/habits/gamification.ts`, but **no `tools/gamification.ts` exists** in repo — either add shim or update all references to habits domain.

---

## 5. Clean Architecture Violations

### Restricted imports (no-restricted-imports)

ESLint reports **100+ files** using deep relative imports into `services/` (e.g. `../services/observability/finops.js`) instead of configured absolute/barrel imports.

**Examples:**

- `agents/voice-agent-entry.ts` → `../services/model-config.js`, `../services/observability/finops.js`
- `agents/agent-lifecycle.ts` → `../services/observability/finops.js`
- `agents/gce-voice-worker.ts` → `../services/deployment/container-watchdog.js`, `../services/ops-orchestrator.js`, `../services/analytics/call-quality-monitor.js`
- `agents/index.ts` → `../services/cache/edge-cache.js`

**Action:** Introduce barrel exports (e.g. `services/index.ts` or domain barrels) and use path alias or barrel imports so application layer does not depend on deep service paths.

### Large files / high complexity

- **`agents/voice-agent-entry.ts`** — ~2238 lines, max-lines 500; `runFullVoiceAgentEntry` complexity 270 (max 15). Refactor into phases/handlers/modules.
- Other files over 500 lines or with high cyclomatic complexity are called out in lint and technical-debt tracker.

---

## 6. Other Clean Code / Consistency Issues

- **Console usage:** Technical debt tracker reports ~1000+ console usages (threshold ≤100). Prefer `createLogger({ module: 'name' })` in production code.
- **`as any`:** Tracked in technical debt tracker; keep ≤30 and document necessity.
- **Express mock in production:** `servers/api/index.ts` uses `mockApp(req as any, res as any)` — move to test-only or remove.

---

## Recommended Priorities

1. ~~**HIGH:** Wire workflow-engine LLM step~~ **DONE** — Workflow engine now calls Gemini when GOOGLE_API_KEY or GEMINI_API_KEY is set; falls back to placeholder with warning.
2. ~~**HIGH:** Resolve gamification import~~ **DONE** — Added `tools/gamification.ts` re-export shim; un-skipped maya gamification tests; added `calculateLevel` for XP tests.
3. ~~**MEDIUM:** Loader "Not implemented" path~~ **DONE** — Loader now logs a warning when legacy tools have no `execute`; fallback message clarified.
4. ~~**MEDIUM:** Cross-encoder init~~ **DONE** — LocalCrossEncoder.initialize() no-ops; score/scoreBatch throw with clear message to use GeminiCrossEncoder.
5. ~~**MEDIUM:** Deprecated switchAccent~~ **DONE** — Voice-manager test now uses switchToLocalizedAccent().
6. ~~**MEDIUM:** Unified intelligence stub doc~~ **DONE** — Added production-use note to stub header.
7. ~~**MEDIUM:** Un-skip superhuman-memory-pipeline tests~~ **DONE** — Un-skipped `superhuman-memory-pipeline.test.ts` and `memory-intelligence-e2e.test.ts`; suites now run with it.todo specs visible (pending implementation).
8. **MEDIUM:** routeTranscript migration — Call sites (data-channel-handler, synthetic-test) still use deprecated routeTranscript. Full migration = use UTO in turn processor (tool-orchestrator.routeAndExecute); larger refactor, not a drop-in replacement.
9. **MEDIUM:** rehydrateConversationEmbeddings — Deprecated, does nothing; only exported from memory/index and referenced in skipped test. No call sites to fix.
10. **LOW:** Reduce restricted-imports by introducing service barrels/path aliases; split voice-agent-entry and reduce complexity.

---

## References

- **`src/docs/TECHNICAL-DEBT-TRACKER.md`** — Migration TODOs, placeholder list, `as any`/console guidelines.
- **`src/tools/RATIONALIZATION.md`** — Tool domain moves, deprecated root files, gamification/memory locations.
- **`docs/architecture/CLEAN-ARCHITECTURE.md`** — Layer and import rules.
