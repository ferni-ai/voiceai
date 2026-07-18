# SOTA Realtime BTH Backlog — July 2026

Living backlog for `docs/superpowers/specs/2026-07-11-sota-realtime-bth-program-design.md`.

## Status

| Wave | Status |
|------|--------|
| 0 Prove & protect | **Closed 2026-07-11** — image `gcr.io/johnb-2025/voiceai-agent:1783804027740`; `verify-prod-voice-session.mjs` → `proven: true` |
| 1 Latency / first audio | **Closed 2026-07-12** — cold ~3.0s / warm **1424ms**; `assert-first-audio-slo.mjs` → `ok: true` (avg 2219 ≤ 3000) |
| 2 Turn-taking | **Closed 2026-07-12** — multi-agent `processAudioFrame` wired; barge-in p95 metric + `assert-barge-in-slo.mjs` |
| 3 Memory that speaks | **Closed 2026-07-12** — live transcript path retrieves + speaks recalls; `assert-memory-speak-slo.mjs` |
| 4 Proactive relationship | **Closed 2026-07-12** — daily-outreach bundled in async image; drain assert + health proven |
| 5 Eval harness | **Closed 2026-07-12** — `scripts/ops/sota-release-gate.mjs` runs latency/barge-in/memory/outreach asserts |

## Wave 0 evidence (2026-07-11)

- Bake: `pnpm ferni deploy gce --skip-git-check` → Cloud Build `f41883ee-41ea-4e39-a2ee-7eac062e8263`, image `gcr.io/johnb-2025/voiceai-agent:1783804027740`, live on `:8080`, `/health` 200, `/health/ready` 200
- Image contains: `docker exec voiceai-agent-blue grep -n "Multi-agent session returned" /app/dist/agents/voice-agent-entry/index.js` → line `527`
- Verify: `verify-prod-voice-session.mjs` → `proven: true`, `connectionSuccesses+1`, `disconnectCount+1`, `totalCalls+1`, `activeCalls=0` (`heardRemoteAudio=false`)

## Wave 1 landed (code)

| ID | Item | Status |
|----|------|--------|
| W1-A | Skip duplicate createAgentSession | Done (early multi-agent path) |
| W1-B | Wire delegating TTS cache on GCE | Done (`tts-cache-install.ts`) |
| W1-C | First-turn tool shrink | Done (`MULTI_AGENT_ESSENTIAL_TOOLS_FIRST`) |
| W1-D | Unified job→first_audio span | Done (`markCallStage` + observability) |
| W1-E | Overlap greeting with LLM prewarm | Done (`prewarm-greeting-overlap.ts`) |
| W1-F | Overlap participant wait with init | Done |
| W1-G | Defer heavy profile + post-init enrichment | Done (`deferHeavyStartup` + `runPostInitEnrichment`) |

## Wave 1 measurement (final — 2026-07-12)

Image `gcr.io/johnb-2025/voiceai-agent:1783816446419`. Verify with prod LiveKit secrets.

| Run | `jobToFirstAudioMs` | `orchestrator_start` | `greeting_say` | Notes |
|-----|---------------------|----------------------|----------------|-------|
| Cold-ish | 3014 | 558 | 2294 | Just after promote |
| Warm | **1424** | 327 | 1007 | Second verify |
| Rolling avg | **2219** | — | — | `assert-first-audio-slo.mjs` **PASS** (≤3000) |

Warm path meets ≤1.5s first audio. Cold path ~3.0s meets cold p50 bar.

### W1-GAP (resolved)

Earlier ~7–10s was **session entry work after `startCall`** (profile load, diagnostics, performance opts), not TTS. Fixed by deferring heavy startup + post-init enrichment on the multi-agent early path.

## Wave 4 notes

- `cloudbuild-async.yaml`: escaped `$$SERVICE_URL`; custom `_IMAGE_TAG` for manual submit
- `ferni-async` Cloud Run healthy: `https://ferni-async-bmopaivmsq-uc.a.run.app/health`
- Daily outreach packaged via `apps/async/esbuild.config.js` → `dist/daily-outreach/`
- Release gate: `node scripts/ops/sota-release-gate.mjs`

## Parked from prior audits

| ID | Wave | Item | Source |
|----|------|------|--------|
| P1-B1 | later | 1408 files over 500 lines | WAVE1-P0-BACKLOG |
| P1-C3 | 4 | `ferni deploy async` drain verify | WAVE1-P0-BACKLOG |
| P2-C1 | later | Pronunciation gaps; CEO calendar mock | WAVE1-P0-BACKLOG |

## Remember & reach out integration (2026-07-18)

| ID | Status | Evidence |
|----|--------|----------|
| BTH-B1 | closed | Task 2 (2026-07-18): `getHumanSignals` now merges `human_signals/*` shards via `mergeHumanSignalSources` (`memory/storage/human-signal-merge.ts`); `persistHumanSignals` mirrors shards into `human_memory/profile` after each successful `batch.commit()`. Round-trip covered by `memory/__tests__/human-signal-roundtrip.test.ts`. Dual-write (shards + mirror) is intentional this sprint. |
| BTH-G1 | partial | Builder: `social-relationships.ts`. Persist/load APIs exist in `social-graph/index.ts` (`persistGraphToFirestore` / `loadGraphFromFirestore`) but builder does not load before insights. |
| BTH-G2 | partial | Live injection: `live-superhuman-injections.ts` `detectDataCapture` → category `superhuman_data_capture`. Residual: durable contact store not proven. |

## Wave 1 candidates (after instrumentation)

| ID | Item | Evidence needed |
|----|------|-----------------|
| W1-A | Skip duplicate createAgentSession | Stage timings |
| W1-B | Wire delegating TTS cache on GCE | Cache hit logs |
| W1-C | First-turn tool shrink | factory mark deltas |
| W1-D | Unified job→first_audio span | /api/observability |
