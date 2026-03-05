# Focus: Everything Else

**Purpose:** Single list of what to fix, wire, or prove next — **excluding Qwen and Kyutai** (we're on Sonata; see `docs/VOICE-STACK-DIRECTION.md`).

Use this for prioritization and sprint planning. Update as items are done.

**SOTA / Better than human:** For the *vision* and src/-level plan to make the platform state-of-the-art and better than human, see **`docs/FOCUS-SOTA-BETTER-THAN-HUMAN.md`**.

**Last updated:** February 2026

---

## P0 – Unblock / Critical

| # | Item | Location | Action |
|---|------|----------|--------|
| 1 | **Tools with no `execute`** | `tools/registry/loader.ts:1218` | When a tool has no `execute`, loader uses a no-op that returns "Not implemented". Audit registered tools; add `execute` or reject at registration so callers don't get silent no-ops. |
| 2 | **Memory pipeline underpopulated** | Dynamic memory, entity extraction | Validate L2/L3 and entity extraction; backfill human signals; fix topic/keyPoints in summarization (see MEMORY-PIPELINE-AUDIT). |

---

## P1 – Reduce Risk / Quality

| # | Item | Location | Action |
|---|------|----------|--------|
| 3 | **Unified intelligence stub** | `tools/unified-intelligence-stub.ts`, `tools/intelligence/index.ts` | Stub returns empty for everything. Document as intentional (e.g. "LLM native FC only") or implement minimal behavior so callers don't rely on no-ops. |
| 4 | **Workflow LLM step** | `services/workflow-engine.ts` | Placeholder step not wired to real LLM. Already documented as unsupported; ensure comment points to this or SRC-ISSUES-AUDIT so no one wires it by accident. |
| 5 | **Session lifecycle verification** | Cleanup, disconnect | No automated check that session cleanup hooks always run on disconnect. Add test or health check that verifies cleanup path. |
| 6 | **Skipped E2E tests** | persona-handoff, tool-calling, memory-browser, custom-agent | ~80+ skipped/todo tests; prioritize un-skipping critical paths (persona handoff, tool calling, memory browser) or document why skipped. |
| 7 | **superhuman-memory-pipeline.test.ts** | `src/tests/synthetic/` | Entire file skipped ("timing/rules.js not implemented"). Either implement minimal timing/rules or remove/move to doc as "future". |

---

## P2 – Debt / Observability

| # | Item | Location | Action |
|---|------|----------|--------|
| 8 | **TTS streaming latency** | `gateway-tts-node.ts:123` | TODO: implement streaming synthesis for better-than-human latency (Sonata path). |
| 9 | **Cache hits not tracked** | `turn-processor-integration.ts:408` | "TODO: track cache hits" — currently passes `false`. Wire or remove TODO. |
| 10 | **Link reinforcement not tracked** | `memory/unified-store/facade.ts:810` | `linksStrengthened: 0` — TODO to track link reinforcement. |
| 11 | **Agent messages across turns** | `turn-processor.ts:2297` | TODO: track agent messages across turns (services doesn't expose easily). Document or implement. |
| 12 | **Embedding cache key** | `firestore-vector-store/core.ts:614` | Placeholder `cacheKey = '[embedding]'`; document or implement proper key. |
| 13 | **Retraining golden set** | `retraining-pipeline.ts:351` | Placeholder "in production run against golden set"; document or add config. |
| 14 | **Deprecated symbols** | See WHAT-ELSE §4 | Migrate off deprecated APIs (`switchAccent` → `switchToLocalizedAccent`, old routing, rehydrateConversationEmbeddings, etc.) or document in code. |

---

## P3 – Optional / Future

| # | Item | Location | Action |
|---|------|----------|--------|
| 15 | **Higgs per-session STT** | HIGGS-INTEGRATION-STATUS | Optional: per-session STT connection when multiple concurrent sessions use Higgs. |
| 16 | **iOS** | FerniOmniService.swift | Stub only; no UniFFI, no iOS build. Product decision. |
| 17 | **MCP request_voice_input** | MCP tooling | Queues question but does not block for voice response; improve if MCP voice is a product goal. |
| 18 | **Context builder execution metrics** | context-builders | Doc says builder-metrics API exists; confirm all 80+ builders are observable and fix any gaps. |

---

## Out of scope (do not prioritize)

- **Qwen3-Omni / rust-omni / OmniEngine** — See `docs/VOICE-STACK-DIRECTION.md`.
- **Kyutai** (DSM, STT/TTS, Moshi, bridge, deploy) — Same.

---

## References

- `docs/audits/WHAT-ELSE-IS-BROKEN-OR-UNWIRED.md` — Full audit (includes deprecated and done).
- `docs/VOICE-STACK-DIRECTION.md` — Sonata only; ignore Qwen/Kyutai.
- `docs/audits/VOICE-AGENT-PIPELINE-GAPS-AUDIT.md` — Pipeline gaps (Ferni TTS, Pre-STT, events).
- `docs/audits/SRC-ISSUES-AUDIT.md` — Broken, unwired, dead code, TODOs.
