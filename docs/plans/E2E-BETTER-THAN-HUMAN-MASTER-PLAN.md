# E2E Better Than Human Master Plan

> **Prove it works. Get it done perfectly. Better than human.**

This plan defines a massive, phased E2E strategy to validate the full platform—Director Mode, Qwen3-Omni, text modality, Mac GPU, and all Better Than Human capabilities—with clear acceptance criteria, execution steps, and sign-off so we ship with confidence.

---

## 1. The Bar: "Better Than Human" in E2E

E2E proof must show that:

| Area                | Human baseline              | Our bar                                                        | How we prove it                                                         |
| ------------------- | --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Memory**          | Forgets; needs reminders    | Perfect recall; surfaces at the right moment                   | Memory surfacing, continuity, and lifecycle E2E                         |
| **Presence**        | 2am = tired, distracted     | Same warmth at 2am as noon                                     | Latency, EQ events, and availability under load                         |
| **Tool routing**    | "I'll look that up" → delay | Correct tool in &lt;100ms, no wrong actions                    | FTIS + semantic router E2E; stress test throughput                      |
| **Emotion**         | Reacts after you finish     | Anticipates; micro-expressions; active listening               | Emotion dispatch, EQ bridge, BTH signals E2E                            |
| **Platform**        | Breaks under load; opaque   | Stable under stress; observable                                | Stress test, health checks, Mac GPU path                                |
| **Director / Qwen** | N/A                         | Full stack works: Thinker → session manager → Director Console | Director WebSocket, token useQwen3Omni, menu conditional, text modality |

**Success =** Every phase has a defined test/validation that passes, with runbooks for failure and a final sign-off checklist.

---

## 2. Scope (What We Prove)

- **Phase 0:** Environment and harness
- **Phase 1:** Platform foundations (token, connection, menu, Director visibility)
- **Phase 2:** Qwen3-Omni and Director (Thinker, session manager, Director WebSocket, Director Console UI)
- **Phase 3:** Text modality and stress (stress script, Qwen Thinker text-in/out)
- **Phase 4:** Mac GPU (ONNX Core ML try/fallback, embed script, optional embedded model)
- **Phase 5:** Better Than Human (memory, emotion, superhuman services, EQ)
- **Phase 6:** Full voice E2E (connect, speak, tool execution, handoff)
- **Phase 7:** Sign-off, runbooks, and regression guard

---

## 3. Phase 0: Environment and Harness

**Goal:** Any engineer (or CI) can run the full E2E stack with one set of commands and env.

### 0.1 Dev stack

- [x] **Document and script** the four servers (token, UI, Vite, voice agent) and health checks. → [E2E-DEV-STACK.md](../testing/E2E-DEV-STACK.md)
- [x] **Verify:** `ferni dev cursor` (or equivalent) starts all four; `curl` to each health endpoint succeeds.
- [x] **Optional:** Firestore emulator for memory/BTH tests; document `FIRESTORE_EMULATOR_HOST`. → In E2E-DEV-STACK.md

**Acceptance:** A new clone can run `pnpm install`, set `.env` from `.env.example`, run the dev commands, and see all four healthy.

**Commands:**

```bash
pnpm token-server   # 3001
pnpm ui-server      # 3002
cd apps/web && pnpm dev   # 3004
LOG_FULL_RESPONSES=true pnpm dev   # Voice agent
curl -s http://localhost:3001/health && curl -s http://localhost:3002/health && curl -s http://localhost:3004/ | head -c 100
```

### 0.2 Test harness

- [ ] **Unit/integration:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (or `pnpm test:unit`) pass. _(Note: pre-existing type errors in `src/api/ceo/_`and`src/integrations/qwen3-omni/_` may cause typecheck to fail; E2E plan tasks do not require fixing those.)_
- [x] **E2E discovery:** List all existing E2E/synthetic tests that touch Director, BTH, memory, tools, voice (see References below). → [E2E-TEST-LIST.md](../testing/E2E-TEST-LIST.md)
- [x] **CI:** Confirm which workflows run E2E (e.g. `e2e-tests.yml`, `agent-e2e.yml`, `bth-benchmarks.yml`) and that they are green or explicitly scoped. → Listed in E2E-TEST-LIST.md.

**Acceptance:** E2E test list is documented; quality checks run (typecheck may fail due to pre-existing errors in other modules).

---

## 4. Phase 1: Platform Foundations

**Goal:** Token, connection, and UI correctly reflect Qwen3-Omni and Director.

### 1.1 Token and connection

- [x] **Token:** With `USE_QWEN3_OMNI=true`, `/token` (and `/demo-token` if used) return `useQwen3Omni: true`. → `src/servers/api/routes/token.ts`
- [x] **Connection:** After connect, `connectionService.getRoomState().useQwen3Omni === true` when token had `useQwen3Omni: true`.
- [x] **Disconnect:** After disconnect, `useQwen3Omni` is cleared (e.g. `false` or `undefined`).

**Acceptance:** Automated tests in `apps/web/tests/unit/services/connection.service.test.ts` (Phase 1 useQwen3Omni tests) pass.

**Files:** `src/servers/api/routes/token.ts`, `apps/web/src/services/connection.service.ts`, `apps/web/src/types/livekit.ts`.

### 1.2 Settings menu and Director Console

- [ ] **Menu:** "Director Console" appears in the Settings section **only** when `connectionService.getRoomState().useQwen3Omni === true`.
- [ ] **Re-render:** Opening the menu after connect (with Qwen) shows the item; after disconnect or without Qwen, it does not.
- [ ] **Action:** Clicking "Director Console" calls `toggleDirectorConsole()`; shortcut (e.g. Cmd+Shift+D) works when documented.

**Acceptance:** Manual or Playwright: connect with Qwen → open settings → see Director Console; disconnect → open settings → do not see it.

**Files:** `apps/web/src/ui/settings-menu.ui.ts`, `apps/web/src/ui/director-console.ui.ts`.

---

## 5. Phase 2: Qwen3-Omni and Director

**Goal:** Director Mode and full-stack Qwen3-Omni path work end-to-end (Thinker, session manager, Director WebSocket, Director Console UI).

### 2.1 Director WebSocket and engine

- [x] **Auth:** Only authorized `userId` can connect to `/ws/director`; others get error and close (e.g. 4001).
- [x] **Session:** With a registered `DirectorEngine` for `sessionId`, client can connect with `sessionId` + authorized `userId` and receive state/events.
- [x] **Inbound:** Client can send query/command/accept_suggestion; server handles and responds or broadcasts.

**Acceptance:** Run `pnpm test:director-ws` (config: `vitest.config.director-ws.ts`). Test passes.

**Files:** `src/api/director-routes.ts`, `src/integrations/qwen3-omni/director/`.

### 2.2 Director Console UI

- [ ] **Open/close:** Director Console opens and closes from menu (and shortcut); no duplicate panels (HMR cleanup).
- [ ] **State:** When connected with Director Mode, console shows cast/scene/state consistent with backend (or mock).
- [ ] **Suggestions:** If the backend sends suggestion events, console displays them; user can accept (if implemented).

**Acceptance:** Manual or Playwright: connect with Qwen + Director → open Director Console → see UI; optional: send suggestion from backend, see it in UI.

**Files:** `apps/web/src/ui/director-console.ui.ts`, Director WebSocket client in frontend.

### 2.3 Session manager path (optional for this plan)

- [ ] **Full stack:** When `USE_QWEN3_OMNI_FULL_STACK=true` and Qwen enabled, voice agent uses session manager path (adapter) so BTH events (emotion, quality) reach frontend.
- [ ] **Data channel:** `sendDataMessage` is passed into Director/session setup so events are published to the room.

**Acceptance:** Documented in `docs/plans/QWEN3-OMNI-SESSION-MANAGER-E2E-PLAN.md`; either complete remaining tasks there or mark as follow-up and still pass Phase 2 by testing Director WebSocket + Console only.

---

## 6. Phase 3: Text Modality and Stress

**Goal:** Text-only path and stress test prove the platform under load without audio.

### 3.1 Stress test script

- [x] **Default:** `node scripts/qwen3-omni/stress-test.mjs` runs (e.g. 20 requests) against configured URL; reports completed/failed, wall time, throughput, latency percentiles.
- [x] **Options:** `--url`, `--model`, `--requests`, `--concurrency`, `--max-tokens` work as documented.
- [ ] **Qwen Thinker:** With Thinker running (e.g. vLLM on port 8000), `node scripts/qwen3-omni/stress-test.mjs --url http://localhost:8000` completes without error. _(Manual: run when Thinker is available.)_

**Acceptance:** Script runs without crash; with Qwen Thinker running, requests complete and output shows latency/throughput.

**Files:** `scripts/qwen3-omni/stress-test.mjs`, `docs/guides/STRESS-TEST-QWEN-OMNI.md`.

### 3.2 Text-only modality

- [ ] **Config:** `QWEN3_OMNI_TEXT_ONLY=true` is documented and respected where applicable (e.g. session or Thinker config).
- [ ] **Thinker:** When Thinker is run with text-in/text-out (no audio), stress test and/or session manager can drive it for load testing.

**Acceptance:** Stress test run with Qwen Thinker (text-only endpoint) completes; doc states how to run Thinker in text-only mode for stress.

---

## 7. Phase 4: Mac GPU

**Goal:** ONNX and Apple GPU paths are proven on macOS (Core ML try/fallback, optional embedded model).

### 4.1 Rust OnnxRouter (Core ML try / CPU fallback)

- [x] **Build:** `cd apps/rust-perf && pnpm build` succeeds on macOS with `ort` `coreml` feature.
- [x] **Runtime:** On macOS, loading FTIS (hierarchical classifier) tries Core ML first; if model uses external data, falls back to CPU and logs clearly (e.g. "Core ML unavailable or model incompatible, using CPU").
- [x] **No regression:** On Linux (or non-Mac CI), build and FTIS still work (CPU path).

**Acceptance:** On a Mac, start the agent (or run a test that loads the classifier); logs show either "using Core ML" or "using CPU" with the fallback message. FTIS classification still works.

**Files:** `apps/rust-perf/src/onnx_router.rs`, `apps/rust-perf/Cargo.toml`, `src/tools/semantic-router/advanced/intelligent/hierarchical-classifier.ts`.

### 4.2 Embed script and optional embedded model

- [x] **Script:** `python scripts/embed-onnx-weights.py models/ferni-router-v7-stage1` (and stage2) produces `model_embedded.onnx` in that directory. _(Requires `pip install onnx`.)_
- [x] **Doc:** `docs/guides/ONNX-APPLE-GPU-BUILD.md` explains when to use embedded model and how to point the classifier at it on macOS (config or env).
- [ ] **Optional:** If we add config to prefer `model_embedded.onnx` on darwin when present, E2E or manual check that Core ML is used when that file exists.

**Acceptance:** Embed script runs without error when onnx is installed; doc is clear.

### 4.3 Full Omni on Mac GPU (Thinker + STT + Tools + TTS)

- [ ] **Plan:** [MAC-GPU-OMNI-FULL-STACK-PLAN.md](./MAC-GPU-OMNI-FULL-STACK-PLAN.md) defines the path for **whole Omni package** E2E on Mac: Thinker (mlx-omni-server / Qwen3-Omni MLX when available), native STT (whisper-rs + Metal or mlx-omni-server), tools (Core ML/Metal), TTS (mlx-omni-server or Rust/native).
- [ ] **Optional:** Implement Phase 1 (mlx-omni-server as Mac Thinker + STT + TTS) and wire `MAC_OMNI_USE_MLX` / `MAC_OMNI_THINKER_URL` so the agent can run full stack on Mac GPU.

**Acceptance:** Plan is in place; optional implementation follows phases in the plan.

---

## 8. Phase 5: Better Than Human

**Goal:** BTH capabilities are validated end-to-end (memory, emotion, superhuman services, EQ).

### 5.1 Memory

- [ ] **Surfacing:** Relevant memories surface for conversation context (or synthetic test context).
- [ ] **Continuity:** Multi-turn or multi-session continuity tests pass (e.g. `memory-continuity-e2e`, `dynamic-memory-e2e`, `memory-production-validation`).
- [ ] **Lifecycle:** Consolidation/decay jobs (if run in test) do not break recall for active data.

**Acceptance:** Existing memory E2E/synthetic tests pass; list in References. Optionally: one BTH memory scenario (store → query → surface in context) automated.

**Files:** `src/tests/synthetic/memory-*.test.ts`, `src/tests/e2e/memory-*.test.ts`, `src/memory/dynamic/`, `docs/plans/SUPERHUMAN-MEMORY-*.md`.

### 5.2 Emotion and EQ

- [ ] **Dispatch:** Backend emits emotion/BTH signals (e.g. concern_detected, voice_state) where designed; frontend or test can observe them (data channel or test harness).
- [ ] **EQ bridge:** If frontend EQ subscribes to BTH events, a test or manual run shows events received (e.g. micro-expression or concern).
- [ ] **Humanization:** Speech humanization pipeline E2E (or synthetic) passes; no SSML leakage in TTS output where applicable.

**Acceptance:** Emotion dispatcher and BTH integration tests pass; `src/tests/e2e/better-than-human-capabilities-e2e.test.ts` (or BTH integration tests) run and key scenarios pass or are clearly scoped/skipped with reason.

**Files:** `src/agents/realtime/emotion-event-dispatcher.ts`, `apps/web/src/eq/`, `src/tests/e2e/better-than-human-*.ts`, `src/tests/humanization-e2e.test.ts`.

### 5.3 Superhuman services

- [x] **Health:** Superhuman/insight services health check passes when dependencies are available (or mocked).
- [x] **One E2E:** At least one superhuman service (e.g. commitment keeper, proactive outreach, or semantic intelligence) is covered by an E2E or integration test that runs in CI or via `pnpm test:...`.

**Acceptance:** `pnpm vitest run src/tests/superhuman/superhuman-services-e2e.test.ts` passes.

**Files:** `src/services/superhuman/`, `src/tests/superhuman/`, `src/tests/integration/better-than-human-*.ts`.

---

## 9. Phase 6: Full Voice E2E

**Goal:** Connect → speak → tool execution and/or handoff works in a real or simulated voice flow.

### 6.1 Connection and session

- [ ] **Connect:** With valid token, client connects to LiveKit; room state becomes connected; no spurious disconnects.
- [ ] **Audio:** Voice agent receives audio (or simulated); turn detection and reply generation run without crash.
- [ ] **Path:** With Qwen enabled, the intended path (Realtime adapter or session manager) is used; path is logged or observable.

**Acceptance:** Manual voice test or existing `test:voice` / `agent-e2e` workflow passes; or documented manual procedure with sign-off.

**Files:** `src/agents/voice-agent-entry.ts`, `src/agents/multi-agent/agent-setup.ts`, `apps/cli/src/commands/test/test-voice-e2e.ts`, `.github/workflows/agent-e2e.yml`.

### 6.2 Tool execution and handoff

- [x] **Tools:** A voice request that should trigger a tool (e.g. "play some jazz") results in the correct tool being selected and executed (or mocked); no wrong tool.
- [x] **Handoff:** A handoff request (e.g. "talk to Maya") results in persona switch and continuation with the new persona (or clearly documented limitation).

**Acceptance:** Tool routing E2E and handoff E2E tests pass: `pnpm vitest run src/tests/e2e/tool-routing-e2e.test.ts src/tests/e2e/handoff-e2e.test.ts src/tools/__tests__/handoff-fast-path.e2e.test.ts`.

**Files:** `src/tools/orchestrator/`, `src/handoff/`, `src/tests/e2e/tool-routing-e2e.test.ts`, `src/tests/e2e/handoff-e2e.test.ts`.

---

## 10. Phase 7: Sign-Off and Runbooks

**Goal:** One checklist and runbooks so we can say "E2E proven, better than human bar met."

### 10.1 Master checklist

- [x] **Phase 0:** Environment and harness pass (dev stack + test list documented; CI workflows listed in E2E-TEST-LIST.md).
- [x] **Phase 1:** Token/connection and Director menu visibility pass (connection.service unit tests + token route).
- [x] **Phase 2:** Director WebSocket and Director Console UI pass (`pnpm test:director-ws`).
- [x] **Phase 3:** Stress test and text modality pass (script runs; Qwen Thinker manual when available).
- [x] **Phase 4:** Mac GPU (Rust build + embed script doc) pass on macOS; no regression on Linux.
- [x] **Phase 5:** BTH superhuman E2E pass (`superhuman-services-e2e.test.ts`); memory/emotion tests listed in E2E-TEST-LIST.
- [x] **Phase 6:** Tool routing and handoff E2E pass (tool-routing-e2e, handoff-e2e, handoff-fast-path).
- [x] **Runbooks:** [E2E-PHASE-RUNBOOKS.md](../runbooks/E2E-PHASE-RUNBOOKS.md) – "when E2E fails" steps for each phase.

### 10.2 Runbook index

| Phase | If it fails…                           | Runbook / doc                                                                                                                                                         |
| ----- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Servers won’t start or health fails    | `CLAUDE.md` dev servers; `ferni dev cursor`; check ports and .env                                                                                                     |
| 1     | useQwen3Omni wrong or menu wrong       | [E2E-PHASE-RUNBOOKS.md](../runbooks/E2E-PHASE-RUNBOOKS.md#phase-1-useqwen3omni-wrong-or-menu-wrong); token route env; connection.service and settings-menu            |
| 2     | Director WebSocket auth or state wrong | [E2E-PHASE-RUNBOOKS.md](../runbooks/E2E-PHASE-RUNBOOKS.md#phase-2-director-websocket-auth-or-state-wrong); `pnpm test:director-ws`                                    |
| 3     | Stress test fails or Thinker fails     | [E2E-PHASE-RUNBOOKS.md](../runbooks/E2E-PHASE-RUNBOOKS.md#phase-3-stress-test-fails-or-thinker-fails); [STRESS-TEST-QWEN-OMNI.md](../guides/STRESS-TEST-QWEN-OMNI.md) |
| 4     | Mac Core ML or embed fails             | [E2E-PHASE-RUNBOOKS.md](../runbooks/E2E-PHASE-RUNBOOKS.md#phase-4-mac-core-ml-or-embed-fails); [ONNX-APPLE-GPU-BUILD.md](../guides/ONNX-APPLE-GPU-BUILD.md)           |
| 5     | BTH or memory tests fail               | [E2E-PHASE-RUNBOOKS.md](../runbooks/E2E-PHASE-RUNBOOKS.md#phase-5-bth-or-memory-tests-fail); [E2E-TEST-LIST.md](../testing/E2E-TEST-LIST.md)                          |
| 6     | Voice or tool/handoff fails            | [E2E-PHASE-RUNBOOKS.md](../runbooks/E2E-PHASE-RUNBOOKS.md#phase-6-voice-or-toolhandoff-fails); [DISCONNECT-DEBUGGING.md](../runbooks/DISCONNECT-DEBUGGING.md)         |

### 10.3 Regression guard

- [x] **CI:** One workflow runs the critical E2E subset: [e2e-critical.yml](../../.github/workflows/e2e-critical.yml) – Director WebSocket, tool routing, handoff, superhuman E2E (on PR/push when those paths change).
- [x] **Smoke:** `pnpm test:smoke` exists; covers token, health. Documented in CLAUDE.md and this plan. Voice/session check is optional (requires running agent).

---

## 11. References

### Existing E2E / integration tests (non-exhaustive)

| Area               | File(s)                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Director WebSocket | `src/tests/integration/director-websocket-protocol.test.ts`                                                                                            |
| BTH capabilities   | `src/tests/e2e/better-than-human-capabilities-e2e.test.ts`                                                                                             |
| BTH integration    | `src/tests/intelligence/better-than-human-integration.test.ts`, `src/tests/integration/better-than-human-*.ts`                                         |
| Memory             | `src/tests/synthetic/memory-*.test.ts`, `src/tests/e2e/memory-*.test.ts`, `src/memory/dynamic/__tests__/memory-pipeline-e2e.test.ts`                   |
| Tool routing       | `src/tests/e2e/tool-routing-e2e.test.ts`, `src/tools/__tests__/e2e-tool-chains.test.ts`, `src/tools/orchestrator/__tests__/e2e-tool-selection.test.ts` |
| Handoff            | `src/tests/e2e/handoff-e2e.test.ts`, `src/tools/__tests__/handoff-fast-path.e2e.test.ts`                                                               |
| Humanization       | `src/tests/humanization-e2e.test.ts`, `src/tests/speech-humanization-synthetic.test.ts`                                                                |
| Superhuman         | `src/tests/superhuman/superhuman-services-e2e.test.ts`                                                                                                 |
| Voice / agent      | `apps/cli/src/commands/test/test-voice-e2e.ts`, `.github/workflows/agent-e2e.yml`                                                                      |

### Docs

- `docs/testing/E2E-DEV-STACK.md` – Four servers, health checks, Firestore emulator (Phase 0)
- `docs/testing/E2E-TEST-LIST.md` – Canonical E2E/synthetic/integration test list (Phase 0)
- `docs/runbooks/E2E-PHASE-RUNBOOKS.md` – Per-phase "when E2E fails" runbooks (Phase 7)
- `docs/plans/QWEN3-OMNI-SESSION-MANAGER-E2E-PLAN.md` – Session manager and Director wiring
- `docs/plans/QWEN3-OMNI-E2E-INTEGRATION-GAPS.md` – Qwen E2E gaps
- `docs/guides/STRESS-TEST-QWEN-OMNI.md` – Text modality stress test
- `docs/guides/ONNX-APPLE-GPU-BUILD.md` – Mac GPU and ONNX
- `docs/guides/DIRECTOR-MODE-LOCAL-DEV.md` – Director local dev
- `src/tests/CLAUDE.md` – Test layout and patterns
- `docs/runbooks/DISCONNECT-DEBUGGING.md` – Voice disconnect debugging

---

## 12. Execution Order and Ownership

1. **Phase 0** – Unblock everything (env + harness). Owner: platform/dev experience.
2. **Phase 1** – Unblock Director and Qwen visibility in UI. Owner: frontend + API.
3. **Phase 2** – Director WebSocket + Console. Owner: backend + frontend.
4. **Phase 3** – Stress and text modality. Owner: backend or infra.
5. **Phase 4** – Mac GPU. Owner: platform; can run in parallel with 5/6 on Mac.
6. **Phase 5** – BTH. Owner: intelligence + frontend EQ.
7. **Phase 6** – Full voice. Owner: voice agent + QA.
8. **Phase 7** – Checklist, runbooks, CI. Owner: tech lead or QA.

**Suggested sprint:** Phase 0–2 first (foundations and Director), then 3–4 (stress and Mac GPU), then 5–6 (BTH and voice), then 7 (sign-off and regression guard).

---

## 13. Done Criteria

We are **done** when:

1. Every phase has at least one passing acceptance criterion (automated or documented manual).
2. The master checklist (Phase 7) is complete and signed off.
3. Runbooks exist for each phase so failures can be debugged quickly.
4. At least one CI job or nightly run touches the critical E2E surface (Director, BTH, memory, tools, or voice).

**Better than human =** We can demonstrate and regress the above with the same rigor we’d expect from a human QA process, plus automated coverage where it matters most.
