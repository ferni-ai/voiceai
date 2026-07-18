# Remember & Reach Out — Integration Sprint Design

**Date:** 2026-07-18  
**Status:** Approved (user)  
**Theme:** Ferni remembers and reaches out — for real (durable integration, not demo)  
**Predecessor:** SOTA Realtime BTH program (`2026-07-11-sota-realtime-bth-program-design.md`) — Waves 0–5 closed for latency / turn-taking / memory-speak path / async packaging / release gate  
**Method:** One focused sprint; integrate before invent; evidence over vibes

---

## Goal

Close the remaining **persist → retrieve → delivery-intent** gaps so relationship memory and proactive outreach are truthful in the system:

1. Human signals written at session end are the same shape read on the next session.
2. Social / data-capture context that we claim to save actually reaches the live model path (or is honestly marked residual).
3. Async outreach leaves `pending` via a real delivery adapter path (dry-run OK — no live SMS/push required this sprint).
4. Docs and release gates stop claiming DONE/parked incorrectly.

## Non-goals

- Demo polish, staged wow calls, or “feel it on your phone this week”
- Live Twilio / FCM / SendGrid credential unblocking (out of band)
- New relationship engines, new trust subsystems, or greenfield outreach rewrite
- Calendar OAuth product work, group coaching UI, CEO dashboard, mass file-size debt
- Re-litigating SOTA Waves 0–2 latency / barge-in (already closed)

---

## Why this sprint (overlap inventory)

| Capability | Reality (2026-07-18) | Sprint action |
|------------|----------------------|---------------|
| Memory that speaks | **Exists** — Wave 3; `transcript-handler` → `buildMemoryRetrievalContext` → reply | Keep; improve input quality via S2/S3 |
| Async daily-outreach enqueue/drain | **Exists** — Wave 4; health + drain SLO | Keep; finish delivery TODO in processor |
| Human signals | **Partial** — writers exist; write/read shapes diverge (`human_signals/*` vs `human_memory/profile`) | **S2** unify |
| Social graph / data capture | **Partial / doc-drift** — parked as BTH-G1/G2 while other docs say DONE | **S1** truth + **S3** close or residual |
| Thinking-of-you / SMS/push adapters | **Partial** — delivery modules exist; async `TODO: Schedule delivery via Cloud Tasks` | **S4** wire adapter (dry-run OK) |
| Quiet hours | **Exists** but duplicated defaults | Prefer one shared helper when touching S4; no prefs UI rewrite |
| Conversational tool fallbacks | Adjacent (habits/calendar/reminders) | **Out of scope** this sprint |

Parked IDs from `docs/audits/SOTA-REALTIME-BTH-BACKLOG-2026-07.md`: **BTH-B1**, **BTH-G1**, **BTH-G2**, **P1-C3** (async drain verify — largely superseded by Wave 4; re-check in S1).

---

## Approach (approved)

**Hybrid:** memory spine first (signals + context), then outreach delivery plumbing with dry-run / recorded-intent proof. No live channel required.

Alternative rejected: delivery-only (leaves broken recall path).  
Alternative rejected: demo-first live push (user explicitly declined).

---

## Stories & acceptance criteria

### S1 — Audit truth vs parked IDs

**Builds on:** SOTA backlog parked table; `BETTER-THAN-HUMAN-GAPS.md`; `BTH-BLOCKERS-AUDIT-JAN-2026.md`; `FOCUS-SOTA-BETTER-THAN-HUMAN.md`

**Work:**

- Trace each of BTH-G1, BTH-G2, BTH-B1 to current code with file:line evidence.
- Update living backlog + reconcile contradictory DONE language in GAPS/FOCUS (strike or annotate, don’t leave both true).

**AC:**

1. Each of G1/G2/B1 is labeled exactly one of: `closed` | `partial` | `open`.
2. Every label has ≥1 file:line citation in the living backlog or this sprint’s evidence section.
3. No doc in the audit set claims DONE for an ID still labeled open/partial without a “superseded / residual” note.

### S2 — Unify human-signal persist ↔ retrieve

**Builds on:**

- `src/memory/storage/human-signal-persistence.ts`
- `src/memory/dynamic/stm-promotion.ts`
- `src/agents/voice-agent/cleanup-handler.ts`
- `src/intelligence/context-builders/memory/dynamic-memory-context.ts` (or current `getHumanSignals` reader)
- `src/memory/signals/human-signal-extractor/`

**Work:**

- Pick a single canonical Firestore shape (prefer the path already used by next-session context).
- Make session-end STM promotion and cleanup-handler writes converge on that shape.
- Add/extend unit or integration test: write N signals → retrieve ≥N for same userId.

**AC:**

1. One documented canonical collection/doc path for human signals used by both write and read.
2. Automated test proves round-trip (emulator or existing firestore test harness).
3. BTH-B1 moved to `closed`, or to `partial` with an explicit residual list (no silent “parked forever”).

### S3 — Social graph + data-capture in live context

**Builds on:**

- `src/intelligence/context-builders/relationship/social-relationships.ts`
- `src/services/social-graph/`
- `src/agents/processors/live-superhuman-injections.ts`
- Notes about orphaned `social-graph-context` in builder imports

**Work:**

- Prove or fix: mentioned person/relationship content appears in the injected context for a turn.
- Prove or fix: data-capture results reach the model path (same injection pipeline or turn processor).
- Do **not** add a second parallel social-graph builder unless the orphaned one is the only fix; prefer wiring existing loader/manifest path.

**AC:**

1. Automated test or scripted turn proves injected context contains a known mention / capture string.
2. BTH-G1 and BTH-G2 each closed or residual-listed with evidence (updates S1 labels).
3. No new top-level “social intelligence” package.

### S4 — Async decision → delivery adapter (dry-run OK)

**Builds on:**

- `apps/async/src/outreach/processor.ts` (explicit Cloud Tasks TODO)
- `apps/async/src/outreach/daily-outreach-runner.ts`
- Existing delivery: `src/services/outreach/delivery/sms-delivery.ts`, `push-notifications.ts` (call via shared interface from async, or thin adapter in `apps/async`)
- Quiet-hours helpers already in async / scheduling

**Work:**

- Replace “mark processing and stop” with: decide → invoke delivery interface → terminal status (`delivered` | `skipped` | `failed`).
- `DRY_RUN=true` records intent (log + Firestore fields) without calling Twilio/FCM.
- Prefer one path; do not grow the in-memory trust TOY queue for this batch path.

**AC:**

1. `POST /process-batch` on a seeded pending trigger ends in a terminal status (not stuck `pending` forever under dry-run success).
2. Dry-run leaves an auditable “would send” record (fields or subcollection — document the shape).
3. Living backlog notes: delivery plumbing closed; live channel credentials out of scope.
4. Existing drain SLO still passes (`assert-outreach-drain-slo.mjs`).

### S5 — Release gate hardens non-demo proof

**Builds on:**

- `scripts/ops/sota-release-gate.mjs`
- `scripts/ops/sota-local-e2e.mjs`
- Memory / outreach asserts

**Work:**

- Add gate steps (or extend local e2e) for: human-signal round-trip (S2) and delivery-intent path (S4).
- Keep optional skip semantics for cold environments only where already designed (`REQUIRE_SAMPLES`); do not weaken first-audio / drain asserts.

**AC:**

1. Local e2e or gate fails if S2 round-trip or S4 dry-run intent path regresses.
2. Document how to run the proof in `docs/audits/SOTA-REALTIME-BTH-BACKLOG-2026-07.md` (or a short sibling note).
3. Sprint closes only with command output evidence checked into the backlog “evidence” section (not screenshots-only).

---

## Definition of done (sprint)

Someone reading Firestore + async logs can prove:

```
persist human signals → retrieve same signals → (optional) schedule delivery intent
```

without a staged demo call or live SMS.

All five stories AC met or explicitly waived in writing with reason.

---

## Sequencing

```
S1 (audit) ──► S2 (signals) ──► S3 (context)
                    │
                    └──► S4 (delivery) ──► S5 (gate)
```

- S1 can start immediately and finish as S2/S3 evidence lands.
- S2 before S3 preferred (better recall fuel).
- S4 can parallelize with S3 after S1 confirms no conflicting outreach rewrite.
- S5 last.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Doc claims DONE but code path dead | S1 evidence-first; tests in S2/S3 |
| Async importing monorepo delivery pulls heavy deps | Thin adapter in `apps/async` calling shared package or HTTP; keep Dockerfile slim |
| Unifying Firestore shape breaks old readers | Dual-read briefly if needed; prefer migrate write first + one reader |
| Dry-run marks delivered incorrectly | Use distinct status or `dryRun: true` field; drain SLO must ignore false “pending” piles |

---

## Evidence template (fill at close)

| Story | Command / test | Result | Date |
|-------|----------------|--------|------|
| S1 | — | | |
| S2 | | | |
| S3 | | | |
| S4 | `curl -X POST …/process-batch` + doc read | | |
| S5 | `node scripts/ops/sota-local-e2e.mjs` (or gate) | | |

---

## Related docs

- `docs/superpowers/specs/2026-07-11-sota-realtime-bth-program-design.md`
- `docs/audits/SOTA-REALTIME-BTH-BACKLOG-2026-07.md`
- `docs/audits/BETTER-THAN-HUMAN-GAPS.md`
- `docs/audits/BTH-BLOCKERS-AUDIT-JAN-2026.md`
- `docs/audits/OUTREACH-SYSTEM-AUDIT.md`
- `docs/roadmaps/BETTER-THAN-HUMAN-ROADMAP.md` (underutilized trust — adjacent; not sprint scope)
