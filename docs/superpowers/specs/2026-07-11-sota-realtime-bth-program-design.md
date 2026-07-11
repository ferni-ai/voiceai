# SOTA Realtime Better-Than-Human Program Design

**Date:** 2026-07-11  
**Status:** Approved (user)  
**Method:** Formal multi-wave program — master roadmap + per-wave specs; ship Wave 0 → 1 next  
**Predecessor:** Wave 1 platform audit (`2026-07-11-wave1-platform-audit-design.md`) — reliability/quality/tractable BTH P0s closed

---

## Goal

Make Ferni **state-of-the-art realtime conversational AI** that feels better than human support: instant presence, human turn-taking, memory that speaks, and proactive relationship — with proof gates, not vibes.

## Non-Goals (program level)

- Security deep-dive (separate program)
- Mass file-size refactors as a wave goal (park; do only when blocking a wave)
- Building new BTH subsystems when existing ones are unwired
- Shipping Waves 2–4 feature work before Wave 1 latency SLOs close (prep/harness stubs OK)

---

## Current baseline (2026-07-11)

| Area | State |
|------|--------|
| Reliability / call quality | Wired: start → first_response → endCall; multi-agent exit cleanup fixed and proven in prod |
| Cartesia | WebSocket streaming TTS + chunk prefetch live (hot-patched / on `main`) |
| First audio (prod proof) | ~7–12s observed — **far above** warm SLO |
| BTH surface area | Large codebase; audits show **integration gaps** (extract/store ≠ speak) |
| GCE image bake | Hot-patch proven; full image bake still needed so fixes survive recreate |

---

## Program structure

| Artifact | Purpose |
|----------|---------|
| This master design | Waves 0–5, SLOs, gates, definition of done |
| Per-wave design + implementation plan | Only the **active** wave gets a full plan |
| Living backlog | `docs/audits/SOTA-REALTIME-BTH-BACKLOG-2026-07.md` (create with Wave 0) |
| Release gate | No wave closes without **prod evidence** |

### Hard rules

1. **Later waves may prep** (metrics, harness stubs, docs) in parallel.
2. **Later waves must not ship features** that fight Wave 1’s first-audio path until Wave 1 closes.
3. **Integrate before invent** — prefer wiring existing BTH/memory/EQ over new systems.
4. **Evidence over claims** — curl/LiveKit proof or eval failure required to close a wave.

---

## Program-level SLOs

| Metric | Warm session | Cold / first join | Closes in |
|--------|--------------|-------------------|-----------|
| Time to first audio | p50 ≤ **1.5s**, p95 ≤ **3s** | p50 ≤ **3s**, p95 ≤ **6s** | Wave 1 |
| Call quality loop | `activeCalls → 0`, disconnect counted | same | Wave 0 |
| Barge-in recover | Agent speech stops ≤ **500ms** | — | Wave 2 |
| Memory speak rate | ≥ **1** relevant recall / 10 turns when data exists | — | Wave 3 |
| Outreach delivery | Pending triggers drain ≤ **5 min** | — | Wave 4 |
| Eval harness | Latency (+ growing suites) can **fail release** | — | Wave 5 |

---

## Waves

### Wave 0 — Prove & protect

**Intent:** Make current prod truth durable and measurable.

**In scope**

1. Bake multi-agent cleanup + Cartesia path into GCE image (`ferni deploy gce` — no hot-patch dependency).
2. Document / script LiveKit verify: join → first audio → disconnect → call-quality asserts.
3. SLO/alert stub: first-audio + leaked `activeCalls`.
4. “Don’t break presence” checklist (below).

**Done when**

- Fresh container (no hot-patch) passes the same prod proof as the hot-patched session.
- Verify script documented and runnable.
- Living backlog file exists.

**Out of scope:** Latency feature work (Wave 1).

---

### Wave 1 — Latency / first audio

**Intent:** Close the gap from ~7–12s first audio to program SLOs.

**In scope**

1. **Instrument** stage timings: join → prewarm → greeting LLM → TTS TTFB → first audio (expose via observability).
2. **Cold-path cuts:** prewarm budget, defer non-essential tool load until after first audio where safe, greeting path optimization.
3. **Overlap:** instant/cached greeting audio where persona allows; keep Cartesia WS + prefetch.
4. **First-turn tool shrink** — minimal essential set for greeting turn.
5. **Prod re-measure** against warm/cold SLOs.

**Out of scope**

- New memory features, barge-in redesign, outreach product work.
- Wave 5 full suite (latency gate **stubs** OK).

**Done when**

- Warm and cold SLOs met in prod measurement (or documented blockers with owners).
- Stage timing breakdown available for the next regression.

**Primary code areas (expected)**

- `src/agents/multi-agent/persona-agent-factory.ts` (prewarm)
- `src/agents/shared/generate-reply-gateway.ts`
- `src/agents/shared/conversational-audio-cache.ts` / greeting paths
- `src/speech/tts-gateway/*`
- `src/services/analytics/call-quality-monitor.ts` + observability
- Tool orchestration first-turn path

---

### Wave 2 — Turn-taking / presence

**Intent:** Realtime that feels human mid-turn, not only after the turn.

**In scope (sketch — full design when Wave 1 closes)**

- Reliable barge-in + graceful recovery (≤500ms stop)
- Micro-acknowledgments during long user speech
- Intentional / protective silence wired to speech behavior
- Interruption recovery phrasing

**Done when:** Barge-in SLO + qualitative “still with you” checklist pass in prod/evals.

---

### Wave 3 — Memory that speaks

**Intent:** Extract → store → inject → **say** → verify.

**In scope (sketch)**

- Persist human signals (dreams/fears/values) if still dropping
- Surface social graph, trajectories, inside jokes, “I notice…” in live turns
- Close integration gaps from `docs/audits/BETTER-THAN-HUMAN-GAPS.md`

**Done when:** Memory speak-rate SLO met on sessions with known stored data.

---

### Wave 4 — Proactive relationship

**Intent:** Relationship continues outside the live call.

**In scope (sketch)**

- Outreach / trigger drain (`ferni deploy async` verify)
- Thinking-of-you timing intelligence
- Commitments / milestones delivered

**Done when:** Outreach drain SLO met; at least one proactive path proven end-to-end.

---

### Wave 5 — Eval harness

**Intent:** “SOTA” is fail-able.

**In scope**

- Latency gates (start in Wave 1)
- Barge-in suite (Wave 2)
- Memory recall evals (Wave 3)
- Blind humanness / presence checks (ongoing)
- Release/CI hooks that can block ship

**Done when:** A release can fail solely on harness regression.

---

## Don’t break presence checklist

Before merging voice-agent changes in any wave:

- [ ] No infinite disconnect wait / early return that skips `endCall`
- [ ] Call quality: start + first_response + end on happy and error paths
- [ ] Cartesia streaming path unchanged unless intentionally measured
- [ ] `/health` and `/health/ready` still green after deploy
- [ ] Prod or staging LiveKit smoke: join → hear agent → disconnect → `activeCalls === 0`

---

## Execution order

```
Wave 0 (bake + proof) → Wave 1 (latency SLOs)
         ↘ Wave 5 latency stubs in parallel
Wave 1 closed → Wave 2 design+plan → implement
Wave 2 closed → Wave 3 …
Wave 3 closed → Wave 4 …
Wave 5 grows every wave; full “release fail” gate by end of Wave 3+
```

---

## Deliverables by phase

| When | Deliverable |
|------|-------------|
| After this approval | This design file (committed with Wave 0 start) |
| Wave 0 start | Implementation plan: `docs/superpowers/plans/2026-07-11-sota-wave0-1-latency.md` (0+1 combined or split) |
| Wave 0 close | Fresh-image prod proof + backlog file |
| Wave 1 close | SLO evidence + stage timing in observability |
| Each later wave | New per-wave design section or file + plan before code |

---

## Risks

| Risk | Mitigation |
|------|------------|
| GCE docker pull / deploy stalls | Prefer promote already-built tags; IAP SSH; don’t block Wave 1 instrumentation on perfect bake |
| Latency work fights multi-agent init | Measure multi-agent path specifically; budget prewarm; defer tools after first audio |
| “Do all waves” thrash | Hard rule: no Wave 2–4 feature ship before Wave 1 close |
| False SLO wins (lab only) | Prod LiveKit proof required |

---

## Open questions (resolved)

| Question | Resolution |
|----------|------------|
| Execution style | **A** — formal multi-wave program |
| First ship | Wave **0 → 1** |
| SLO numbers | As in Program-level SLOs (approved 2026-07-11) |

---

## Spec self-review

- [x] No unresolved placeholders (`TBD`/`TODO` that block Wave 0/1)
- [x] Waves 2–5 are sketches only (full design deferred) — intentional
- [x] SLOs consistent across sections
- [x] Scope boundaries explicit for Wave 0 and 1
- [x] Concrete file hints for Wave 1 without over-prescribing implementation
