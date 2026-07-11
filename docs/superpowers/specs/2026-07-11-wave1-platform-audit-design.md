# Wave 1 Platform Audit Design

**Date:** 2026-07-11  
**Status:** Approved  
**Method:** Live health sweep → targeted deep dives → fix P0s as found → park P1+

## Goal

Make Ferni reliable and present across three areas (A → B → C), fixing only P0s immediately. Park P1+ in a living backlog for review. Security deep-dive (D) is out of scope.

## P0 Definition

**Breakage + silent degradation:**

- Crashes, disconnects, failed calls, broken auth, silence/dead air, wrong/missing voice
- Empty memory/insights when data should exist, stub tools returning “not implemented,” disabled outreach, known latency gaps that clearly hurt presence

Not P0: cosmetic debt, incomplete metrics, skipped tests without user impact, nice-to-have refactors.

## Work Order

1. **A — Production reliability** — health, voice readiness, disconnect/crash signals, runtime blockers
2. **B — Code quality / debt** — quality gates, architecture violations, stubs/TODOs that cause silent failure
3. **C — Better-than-Human** — latency, EQ/humanization, outreach, memory/insights empty returns, presence

## Per-Area Loop

1. Gather evidence (live checks + targeted code/docs refresh)
2. Triage P0 vs P1+
3. Fix P0s with verification
4. Record parked items in backlog
5. Close area, move to next letter

## Evidence Sources

### A — Reliability

- `GET /health`, `/health/ready` on GCE voice agent
- `GET https://app.ferni.ai/health`, `/api/agents`
- Observability: call quality, crash analytics when available
- Local: token (3001), UI (3002), Vite (3004), voice worker
- Feb 2026 gaps audit — refresh only where evidence is stale

### B — Quality / Debt

- `pnpm typecheck`, `pnpm lint`, `pnpm quality:check`, `pnpm quality:arch`
- `ferni audit quality|architecture|legacy` (or `npm run audit`)
- Stub/`Not implemented` tool paths, critical TODOs that cause empty UX

### C — BTH

- TTS streaming / latency path
- Outreach disabled state
- Superhuman/trust services returning empty arrays
- EQ / emotion event pipeline wiring
- Pronunciation gaps only if they clearly degrade coaching voice

## Deliverables

| Artifact | Purpose |
| -------- | ------- |
| Code fixes for P0s | Immediate reliability/presence |
| `docs/audits/WAVE1-P0-BACKLOG-2026-07.md` | Living ranked P1+ backlog |
| Short per-area status | Close-out when each letter finishes |

## Out of Scope

- Security deep-dive (Wave D later)
- Rewriting all ~97 historical audit docs
- Non-P0 refactors
- Production deploys unless explicitly requested
- Commits unless explicitly requested

## Success Criteria

- Wave A: No known P0 reliability issues open; prod/local health green or documented blockers
- Wave B: Quality gates green or only P1+ remaining; no silent-failure stubs in critical voice paths
- Wave C: Highest-impact BTH P0s fixed or explicitly deferred with rationale in backlog
