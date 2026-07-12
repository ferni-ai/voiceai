# SOTA Realtime BTH Backlog — July 2026

Living backlog for `docs/superpowers/specs/2026-07-11-sota-realtime-bth-program-design.md`.

## Status

| Wave | Status |
|------|--------|
| 0 Prove & protect | **Closed 2026-07-11** — image `gcr.io/johnb-2025/voiceai-agent:1783804027740`; `verify-prod-voice-session.mjs` → `proven: true` |
| 1 Latency / first audio | **Closed 2026-07-12** — cold ~3.0s / warm **1424ms**; `assert-first-audio-slo.mjs` → `ok: true` (avg 2219 ≤ 3000) |
| 2 Turn-taking | Partial — multi-agent humanization+backchannel init wired; audio-frame emit deferred |
| 3 Memory that speaks | Partial — memory-retrieval builder wired into manifest |
| 4 Proactive relationship | Partial — `ferni-async` live + healthy; Pub/Sub/Scheduler wiring next; daily-outreach module still needs packaging |
| 5 Eval harness | Partial — first-audio SLO gate green; broader eval suite still open |

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
- Remaining: package `daily-outreach-job` into async image; confirm Pub/Sub drain ≤5 min (P1-C3)

## Parked from prior audits

| ID | Wave | Item | Source |
|----|------|------|--------|
| P1-B1 | later | 1408 files over 500 lines | WAVE1-P0-BACKLOG |
| P1-C3 | 4 | `ferni deploy async` drain verify | WAVE1-P0-BACKLOG |
| P2-C1 | later | Pronunciation gaps; CEO calendar mock | WAVE1-P0-BACKLOG |
| BTH-G1 | 3 | Social graph not in context | BETTER-THAN-HUMAN-GAPS |
| BTH-G2 | 3 | Data capture results not injected | BETTER-THAN-HUMAN-GAPS |
| BTH-B1 | 3 | Human signals never persisted | BTH-BLOCKERS-AUDIT |

## Wave 1 candidates (after instrumentation)

| ID | Item | Evidence needed |
|----|------|-----------------|
| W1-A | Skip duplicate createAgentSession | Stage timings |
| W1-B | Wire delegating TTS cache on GCE | Cache hit logs |
| W1-C | First-turn tool shrink | factory mark deltas |
| W1-D | Unified job→first_audio span | /api/observability |
