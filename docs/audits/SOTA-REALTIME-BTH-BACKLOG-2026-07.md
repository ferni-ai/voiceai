# SOTA Realtime BTH Backlog — July 2026

Living backlog for `docs/superpowers/specs/2026-07-11-sota-realtime-bth-program-design.md`.

## Status

| Wave | Status |
|------|--------|
| 0 Prove & protect | **Closed 2026-07-11** — image `gcr.io/johnb-2025/voiceai-agent:1783804027740`; `verify-prod-voice-session.mjs` → `proven: true` |
| 1 Latency / first audio | In progress — overlap shipped; re-measure pending — code landed + measured; SLO not met yet (see W1-GAP) |
| 2 Turn-taking | Partial — multi-agent humanization+backchannel init wired; audio-frame emit deferred |
| 3 Memory that speaks | Partial — memory-retrieval builder wired into manifest |
| 4 Proactive relationship | In progress — ferni deploy async pending verify |
| 5 Eval harness | In progress — `assert-first-audio-slo.mjs` latency gate stub landed (Wave 1 SLO still failing at ~7.4s) |

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

## Wave 1 measurement (post-deploy, cold-ish)

Evidence from Task 8 deploy on 2026-07-11: Cloud Build `6993d366-230b-4f87-a77d-2d5d003e5cbb`, image `gcr.io/johnb-2025/voiceai-agent:1783807694651`, promoted healthy to GCE production `:8080`. `verify-prod-voice-session.mjs` returned `proven: true`; observability returned `activeCalls=0`, `connectionSuccesses=1`, `disconnectCount=1`, `errorCount=0`.

| Metric | Value | Target |
|--------|-------|--------|
| `avgFirstResponseTimeMs` | **7411** | ≤3000 bar / ≤1500 warm |
| `lastSessionStages.prewarm_done` | **6938** | — |
| `lastSessionStages.greeting_say` | 6944 | — |
| `lastSessionStages.tts_first_frame` | 7411 | — |
| `lastSessionStages.first_audio` | 7411 | — |

### W1-GAP (do not close Wave 1)

Critical path was **Gemini/session prewarm (~6.9s)** before greeting. Greeting-to-first-frame is ~467ms, so more tool cuts won't help.

## Wave 1 measurement — overlap (Option 1)

Deployed with `OVERLAP_GREETING_WITH_PREWARM` (default on). GCE logs confirm:

- `⚡ Overlap: factory returns before prewarm`
- Factory wall ~206ms; prewarm completes ~240ms later in background
- Stage order: `greeting_say` **before** `prewarm_done` (overlap working)

| Metric | Before overlap | After overlap (cold verify) |
|--------|----------------|------------------------------|
| `greeting_say` vs `prewarm_done` | greeting after prewarm | greeting **before** prewarm |
| Factory blocks on prewarm? | yes (~6–7s) | **no** |
| `avgFirstResponseTimeMs` | ~7.1–7.4s | ~9.9s cold (clock includes post-`startCall` entry work) |

**Remaining gap:** ~9s from `startCall` → factory is still **session entry / init after `startCall`**, not prewarm. Next cut: move greeting clock / shrink post-init work before multi-agent spawn (or stage `factory_start` for a cleaner SLO span).

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
