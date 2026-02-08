# E2E Phase Runbooks

> **When E2E fails.** Per-phase debugging steps for the [E2E Better Than Human Master Plan](../plans/E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md).

---

## Phase 0: Servers Won’t Start or Health Fails

**Symptoms:** `pnpm token-server` / `pnpm ui-server` / `cd apps/web && pnpm dev` fail, or health curls return errors.

**Steps:**

1. **Ports in use:** Ensure 3001, 3002, 3004 are free.
   ```bash
   lsof -i :3001 -i :3002 -i :3004
   ```
2. **Env:** Copy `.env.example` to `.env` and set at least `LIVEKIT_*`, `GOOGLE_API_KEY`, `CARTESIA_API_KEY`. See [environment-variables.md](../guides/environment-variables.md).
3. **Install:** `pnpm install` from repo root.
4. **Reference:** [E2E-DEV-STACK.md](../testing/E2E-DEV-STACK.md) – four servers and health checks.
5. **CLI:** Run `ferni dev cursor` for printed commands; `ferni dev stop` to stop all.

---

## Phase 1: useQwen3Omni Wrong or Menu Wrong

**Symptoms:** Token doesn’t return `useQwen3Omni: true` when expected, or Director Console doesn’t appear in the menu when connected with Qwen.

**Steps:**

1. **Token:** With `USE_QWEN3_OMNI=true`, call `/token` (or your token endpoint). Response must include `useQwen3Omni: true`. Check `src/servers/api/routes/token.ts` – both main token and demo-token paths set `useQwen3Omni: process.env.USE_QWEN3_OMNI === 'true'`.
2. **Connection:** Frontend stores it in `connection.service.ts`: `this.useQwen3Omni = tokenResponse.useQwen3Omni === true`. After disconnect, `this.useQwen3Omni = false`. Run `apps/web` unit tests: `cd apps/web && pnpm vitest run tests/unit/services/connection.service.test.ts` – includes Phase 1 useQwen3Omni tests.
3. **Menu:** Director Console is rendered only when `connectionService.getRoomState().useQwen3Omni === true`. Menu re-renders in `show()` so opening after connect should show the item. Check `apps/web/src/ui/settings-menu.ui.ts` – item `director-console`, conditional `${connectionService.getRoomState().useQwen3Omni ? ... : ''}`.

---

## Phase 2: Director WebSocket Auth or State Wrong

**Symptoms:** `/ws/director` rejects valid user, or client doesn’t receive state/events.

**Steps:**

1. **Auth:** Only `userId` in `authorizedDirectorIds` (e.g. `DIRECTOR_AUTHORIZED_IDS`) can connect. Check `src/api/director-routes.ts` – `handleDirectorWebSocket` validates query params `sessionId`, `userId` and config `authorizedDirectorIds`.
2. **Engine:** A `DirectorEngine` must be registered for the session’s `sessionId`. Director Mode setup registers the engine when the room is created.
3. **Test:** Run the integration test (with integration config so the file is included):  
   `pnpm vitest run src/tests/integration/director-websocket-protocol.test.ts --config vitest.config.integration.ts`  
   If the repo excludes `src/tests/integration/**` from default vitest, run with a config that includes it, or run the test file directly with tsx/vitest and the right includes.
4. **Console UI:** Director Console opens from Settings when `useQwen3Omni` is true. Check `apps/web/src/ui/director-console.ui.ts` for HMR cleanup (no duplicate panels).

---

## Phase 3: Stress Test Fails or Thinker Fails

**Symptoms:** `node scripts/qwen3-omni/stress-test.mjs` errors, or Qwen Thinker run fails.

**Steps:**

1. **Doc:** [STRESS-TEST-QWEN-OMNI.md](../guides/STRESS-TEST-QWEN-OMNI.md) – options, interpretation, EvalScope. **We use Qwen (Thinker), not Ollama.**
2. **Thinker URL:** Script uses `QWEN3_OMNI_URL` or default `http://localhost:8000`. Ensure your Qwen Thinker (e.g. vLLM) is running and exposes `/v1/chat/completions`. Use `--url` and `--model` to match your Thinker.
3. **Options:** `--requests`, `--concurrency`, `--max-tokens` – reduce if timeouts or rate limits.
4. **Text-only:** `QWEN3_OMNI_TEXT_ONLY=true` is documented in `.env.example` and guides; use for load testing without audio.

---

## Phase 4: Mac Core ML or Embed Fails

**Symptoms:** Rust OnnxRouter or Node ONNX doesn’t use Core ML on macOS; embed script errors.

**Steps:**

1. **Doc:** [ONNX-APPLE-GPU-BUILD.md](../guides/ONNX-APPLE-GPU-BUILD.md) – summary, env vars, embed script.
2. **Rust:** `cd apps/rust-perf && pnpm build`. On macOS, `ort` with `coreml` feature tries Core ML first, then CPU. If the model uses external data, Core ML may fail to load – use embed script to produce a single-file model.
3. **Embed:** `python scripts/embed-onnx-weights.py models/ferni-router-v7-stage1` (and stage2). Output: `model_embedded.onnx` in that directory. Use that path on macOS for Core ML when supported.
4. **Opt-out:** `ONNX_USE_COREML=false` (Node), or build without `coreml` feature (Rust) to force CPU.

---

## Phase 5: BTH or Memory Tests Fail

**Symptoms:** Better-than-human or memory E2E/integration tests fail.

**Steps:**

1. **Firestore:** Many memory/BTH tests need Firestore. Use emulator: `firebase emulators:start --only firestore`, then `export FIRESTORE_EMULATOR_HOST=localhost:8080` and re-run tests.
2. **Test list:** [E2E-TEST-LIST.md](../testing/E2E-TEST-LIST.md) – BTH and memory test files and run commands.
3. **BTH deps:** Superhuman/insight services may need real or mocked backends. Check `src/services/superhuman/`, `src/tests/superhuman/superhuman-services-e2e.test.ts`, and integration test setup.
4. **Skipped suites:** `src/tests/e2e/better-than-human-capabilities-e2e.test.ts` has some `describe.skip` (e.g. deprecated API); ensure the suites you care about are not skipped or update them to current API.

---

## Phase 6: Voice or Tool/Handoff Fails

**Symptoms:** Client can’t connect to LiveKit, or tool execution / handoff doesn’t work in voice.

**Steps:**

1. **Disconnects:** [DISCONNECT-DEBUGGING.md](./DISCONNECT-DEBUGGING.md) – health, crash analytics, call quality, zombies.
2. **Credentials:** Use **dev** LiveKit project for local agent (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`). Don’t point local agent at production project.
3. **Tool routing:** Run `pnpm vitest run src/tests/e2e/tool-routing-e2e.test.ts` (and `src/tools/__tests__/e2e-tool-selection.test.ts` if included). Check `src/tools/orchestrator/`, `src/config/tool-config.ts`.
4. **Handoff:** Run `pnpm vitest run src/tests/e2e/handoff-e2e.test.ts` and `src/tools/__tests__/handoff-fast-path.e2e.test.ts`. Check `src/handoff/`.
5. **Voice E2E:** `pnpm test:voice` (or `ferni` voice test) – requires token server and voice agent running.

---

## Regression Guard

- **CI:** Ensure at least one workflow runs a critical E2E subset (e.g. Director WebSocket, tool routing, memory continuity, BTH integration). See [E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md](../plans/E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md) Phase 7.
- **Smoke:** `pnpm test:smoke` or `ferni smoke` – document in plan or README what it covers (token, health, optional voice/session check).
