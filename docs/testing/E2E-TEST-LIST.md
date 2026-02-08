# E2E and Integration Test List

> **Phase 0** of the [E2E Better Than Human Master Plan](../plans/E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md).  
> Canonical list of E2E/synthetic/integration tests that touch Director, BTH, memory, tools, voice, and humanization.

---

## Director & Qwen3-Omni

| File                                                        | Description                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/tests/integration/director-websocket-protocol.test.ts` | Director WebSocket: auth, session lookup, state push, inbound (query, command, accept_suggestion) |

---

## Better Than Human (BTH)

| File                                                                                       | Description                                                                                                             |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/tests/e2e/better-than-human-capabilities-e2e.test.ts`                                 | BTH capabilities E2E (memory, learning engine, commitment keeper, outreach, etc.); some suites skipped (deprecated API) |
| `src/tests/intelligence/better-than-human-integration.test.ts`                             | BTH integration                                                                                                         |
| `src/tests/integration/better-than-human-data-infrastructure.test.ts`                      | BTH data infrastructure                                                                                                 |
| `src/tests/integration/better-than-human-memory-e2e.test.ts`                               | BTH memory E2E                                                                                                          |
| `src/services/better-than-human-validation/__tests__/better-than-human-validation.test.ts` | BTH validation service                                                                                                  |

---

## Memory

| File                                                       | Description                  |
| ---------------------------------------------------------- | ---------------------------- |
| `src/tests/synthetic/memory-intelligence-e2e.test.ts`      | Memory intelligence E2E      |
| `src/tests/synthetic/memory-superhuman-e2e.test.ts`        | Memory superhuman E2E        |
| `src/tests/synthetic/memory-continuity-e2e.test.ts`        | Memory continuity E2E        |
| `src/tests/synthetic/dynamic-memory-e2e.test.ts`           | Dynamic memory E2E           |
| `src/tests/e2e/memory-flow-e2e.test.ts`                    | Memory flow E2E              |
| `src/tests/e2e/memory-production-validation.test.ts`       | Memory production validation |
| `src/memory/dynamic/__tests__/memory-pipeline-e2e.test.ts` | Dynamic memory pipeline E2E  |

---

## Tool Routing & Handoff

| File                                                          | Description           |
| ------------------------------------------------------------- | --------------------- |
| `src/tests/e2e/tool-routing-e2e.test.ts`                      | Tool routing E2E      |
| `src/tools/__tests__/e2e-tool-chains.test.ts`                 | E2E tool chains       |
| `src/tools/orchestrator/__tests__/e2e-tool-selection.test.ts` | E2E tool selection    |
| `src/tests/e2e/handoff-e2e.test.ts`                           | Handoff E2E           |
| `src/tools/__tests__/handoff-fast-path.e2e.test.ts`           | Handoff fast path E2E |

---

## Humanization & Speech

| File                                                      | Description                   |
| --------------------------------------------------------- | ----------------------------- |
| `src/tests/humanization-e2e.test.ts`                      | Humanization E2E              |
| `src/tests/speech-humanization-synthetic.test.ts`         | Speech humanization synthetic |
| `src/speech/tts-gateway/__tests__/e2e-validation.test.ts` | TTS gateway E2E validation    |

---

## Superhuman Services

| File                                                   | Description             |
| ------------------------------------------------------ | ----------------------- |
| `src/tests/superhuman/superhuman-services-e2e.test.ts` | Superhuman services E2E |

---

## Voice / Agent

| File                                           | Description                        |
| ---------------------------------------------- | ---------------------------------- |
| `apps/cli/src/commands/test/test-voice-e2e.ts` | Voice E2E (CLI: `pnpm test:voice`) |
| `.github/workflows/agent-e2e.yml`              | Agent E2E workflow (CI)            |

---

## Other E2E / Integration

| File                                                       | Description                                           |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `src/tests/e2e/developer-platform-e2e.test.ts`             | Developer platform E2E                                |
| `src/tests/e2e/persona-handoff-e2e.test.ts`                | Persona handoff E2E                                   |
| `src/tests/e2e/semantic-intelligence-e2e.test.ts`          | Semantic intelligence E2E                             |
| `src/tests/e2e/agent-guidance-gaps-e2e.test.ts`            | Agent guidance gaps E2E                               |
| `src/tests/integration/critical-services-e2e.test.ts`      | Critical services E2E                                 |
| `src/tests/behavior-system-e2e.test.ts`                    | Behavior system E2E                                   |
| `src/tests/livekit-integration-e2e.test.ts`                | LiveKit integration E2E                               |
| `src/agents/multi-agent/__tests__/multi-agent-e2e.test.ts` | Multi-agent E2E                                       |
| `src/api/__tests__/e2e/api-e2e.test.ts`                    | API E2E                                               |
| `e2e/action-confirmation.spec.ts`                          | Playwright: action confirmation                       |
| `apps/web/tests/e2e/*.test.ts`                             | Web E2E (menu, voice nav, knowledge quiz, your-story) |

---

## Running Subsets

```bash
# Director WebSocket
pnpm vitest run src/tests/integration/director-websocket-protocol.test.ts

# BTH capabilities (some describe blocks may be skipped)
pnpm vitest run src/tests/e2e/better-than-human-capabilities-e2e.test.ts

# Memory E2E (use emulator for Firestore tests)
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/tests/synthetic/dynamic-memory-e2e.test.ts
pnpm vitest run src/tests/e2e/memory-flow-e2e.test.ts

# Tool routing + handoff
pnpm vitest run src/tests/e2e/tool-routing-e2e.test.ts src/tests/e2e/handoff-e2e.test.ts src/tools/__tests__/handoff-fast-path.e2e.test.ts

# Superhuman services
pnpm vitest run src/tests/superhuman/superhuman-services-e2e.test.ts

# Voice (requires token server + agent)
pnpm test:voice
```

---

## CI Workflows

| Workflow             | Purpose                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `e2e-critical.yml`   | **Critical E2E subset** – Director WebSocket, tool routing, handoff, superhuman (on path changes) |
| `e2e-tests.yml`      | Playwright E2E (frontend)                                                                         |
| `agent-e2e.yml`      | Agent E2E                                                                                         |
| `bth-benchmarks.yml` | BTH benchmarks                                                                                    |
| `ci.yml`             | Lint, test, build (unit/integration)                                                              |

Stress test uses **Qwen Thinker** only (no Ollama): `node scripts/qwen3-omni/stress-test.mjs --url <Thinker URL>`. See [STRESS-TEST-QWEN-OMNI.md](../guides/STRESS-TEST-QWEN-OMNI.md).
