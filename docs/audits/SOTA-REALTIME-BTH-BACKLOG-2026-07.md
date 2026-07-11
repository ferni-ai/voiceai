# SOTA Realtime BTH Backlog — July 2026

Living backlog for `docs/superpowers/specs/2026-07-11-sota-realtime-bth-program-design.md`.

## Status

| Wave | Status |
|------|--------|
| 0 Prove & protect | In progress |
| 1 Latency / first audio | Pending |
| 2 Turn-taking | Parked |
| 3 Memory that speaks | Parked |
| 4 Proactive relationship | Parked |
| 5 Eval harness | Parked (latency stubs with Wave 1) |

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
