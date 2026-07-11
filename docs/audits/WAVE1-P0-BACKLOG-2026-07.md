# Wave 1 P0 Backlog — July 2026

Living backlog from the Wave 1 platform audit (A → B → C).  
**Method:** Fix-as-we-go P0s; park P1+ here.

**Design:** `docs/superpowers/specs/2026-07-11-wave1-platform-audit-design.md`

---

## Status Snapshot (2026-07-11)

| Area | Status | Notes |
|------|--------|-------|
| **A — Reliability** | Closed (P0s + call quality wiring) | Logger + observability + session events |
| **B — Quality** | Closed (P0s) | `as any` ≤30; circular outreach↔telephony broken |
| **C — BTH** | Closed (tractable P0/P1) | Producer outreach, TTS prefetch + Cartesia WS, greeting, degraded logs |

### Live evidence (session start)

| Check | Result |
|-------|--------|
| GCE `/health` + `/health/ready` | 200 ready |
| `app.ferni.ai/health` | 200 |
| Crash analytics | Historical pino stack overflow (mitigated in safe-logger) |
| `pnpm quality:check` | Pass (30/30 as any) |

---

## Fixed this session (P0)

| ID | Area | Fix |
|----|------|-----|
| P0-A1 | A | Circular/deep object sanitization in `safe-logger` |
| P0-A2 | A | Caught async flush/processQueue (event-pipeline, embedding-worker) |
| P0-A3 | A | GCE `GET /api/observability` → `{ callQuality }` |
| P0-B1 | B | Typed CEO routes (`as any` 34→30) |
| P0-B2 | B | Telephony types extracted — circular dep broken |
| P0-B3 | B/C | Legacy missing-execute stubs warn + `_meta.degraded` |
| P0-C1 | C | CEO briefing uses profile name |
| P0-C2 | C | Outreach producer mode: persist on publish, gate agent processing, enable triggerCreation |
| P0-C3 | C | TTS next-chunk prefetch on Cartesia overlap path |
| P0-C4 | C | Wisdom services log on `db_unavailable` + `degraded-result` helper |
| P1-A1 | A | Wire startCall / connection_success / first_response / endCall into sessions |
| P1-C1 | C | Cartesia WebSocket `synthesizeStreaming` + per-chunk gateway path |
| P1-C2 | C | High-impact superhuman `return []` → `recordDegradation` |

---

## Parked P1+ 

| ID | Priority | Item |
|----|----------|------|
| P1-B1 | P1 | 1408 files over 500 lines |
| P1-C3 | P1 | Deploy/verify `ferni deploy async` drains pending triggers |
| P2-C1 | P2 | Pronunciation gaps; CEO calendar still mock |
| D1 | Later | Remove deprecated `x-user-id` |

---

*Updated: 2026-07-11 (session 2)*
