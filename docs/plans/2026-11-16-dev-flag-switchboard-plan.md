# Dev Flag Switchboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Agent flags (dev)" admin section that shows the dev agent's real flag values and applies changes through LiveKit's secrets API, with the restart confirmed.

**Architecture:** The dev agent writes the values it booted with to one Firestore doc in `ferni-dev`. New admin routes on the dev UI server check the request, refuse while a dev room is occupied, and send one merge-only `UpdateAgentSecrets`. The admin page stages changes, applies them, and polls the snapshot until the restarted agent reports them.

**Tech Stack:** TypeScript, Node `http` routes (`src/api/v1/admin/`), `livekit-server-sdk` 2.19 (`TwirpRpc`, `RoomServiceClient`), `@livekit/protocol` 1.53 (`livekit_cloud_agent_pb`), firebase-admin, Vitest, vanilla TS admin portal (`apps/web/src/admin/`).

**Spec:** `docs/plans/2026-11-16-dev-flag-switchboard.md` (approved 2026-11-16).

## Global Constraints

- Dev only: agent id `CA_siTDMHEba4Fg`, LiveKit host `dev-8sm1ba0z.livekit.cloud`, both fixed in code. Routes return 404 unless `DEPLOY_ENV === 'dev'`.
- Scope: the 172 per-file flags in `src/config/flags/` (read through `src/config/flags/index.generated.ts`). Switchable only if the manifest default is `on`, `off` or `shadow`. `shadow` is accepted only for shadow-capable flags (Task 2).
- Never read, send, overwrite or remove a secret outside that set. Every `UpdateAgentSecrets` has `overwrite: false`.
- Never send an update while any `ferni-dev` room has a participant.
- Branch from `origin/main`, one PR per phase, ≤ ~400 reviewable lines, conventional lower-case commit subjects, `Closes #N`.
- Files over 500 lines may not grow (`AdminPortal.ts` 1402, `dev-panel.ui.ts` 7684, `admin-events.ts` 1360).
- `createLogger`, no `console.*`, no `any`, no swallowed errors. Tests in `__tests__/` next to the code (web: `apps/web/tests/`).
- Never print a secret value, including in the spike.

## Review Focus

1. **A flag set via the CLI after the last boot.** The page must warn that values may be stale when any switchable flag's LiveKit `updatedAt` is later than the snapshot's `startedAt`. Test in Task 5 (`GET /` returns `stale: true`).
2. **Apply while a dev room is occupied.** 409 listing the rooms, and the LiveKit update is not called. Test in Task 5.
3. **Apply body naming a real secret or a config flag** (`CARTESIA_MODEL`, a numeric flag, `ALLOW_PRODUCTION_DATA`). 400, nothing sent. Test in Task 2.
4. **The restart never comes** (agent crash-loops on the new value). The page stops polling after the timeout and says "Applied, not confirmed", keeping the change marked. Test in Task 6 (`confirmState` returns `'timeout'`).
5. **The audit write fails after LiveKit accepted the update.** Still 200 (the change happened) with `auditWarning`, and the failure is logged. Test in Task 5.

---

### Task 1: Spike, not merged: call the Cloud Agent API from Node

**Files:** scratch only (`<scratchpad>/spike-agent-secrets.ts`), nothing committed.

**Produces:** the exact Twirp service name, host and token grant for `ListAgentSecrets` / `UpdateAgentSecrets`, written into Task 4's Interfaces before Task 4 starts.

- [ ] **Step 1:** Read how `lk agent secrets` builds its request in the livekit-cli source (GitHub `livekit/livekit-cli`, the `agent` command and its cloud-agents client). Note service name, host (project URL or a separate cloud API host) and the JWT grant.
- [ ] **Step 2:** With `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` read from Secret Manager (`livekit-dev-api-key`, `livekit-dev-api-secret`, project `johnb-2025`) into env vars, call `ListAgentSecrets` for `CA_siTDMHEba4Fg` via `TwirpRpc` + `AccessToken`.
  Expected: prints only the count of names (~314) and that no `value` is returned. Do not call Update.
- [ ] **Step 3:** If the dev key is refused, stop and report to Seth (a key with Cloud Agent permission goes into Secret Manager first). Otherwise record the findings in Task 4.

---

## PR 1: the agent reports its flags

Branch `feat/dev-flag-snapshot` from `origin/main`. Commit the spec and this plan to `docs/plans/` in this PR. Open an issue for the whole project first ("dev flag switchboard"), and use its number for `--issue` and `Closes`.

### Task 2: Which flags are switchable, and request validation

**Files:**
- Create: `src/config/agent-flags/domain/switchable.ts`
- Test: `src/config/agent-flags/__tests__/switchable.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FlagValue = 'on' | 'off' | 'shadow';
  export interface SwitchableFlag { name: string; kind: 'experiment' | 'kill-switch' | 'config'; owner: string; default: string; switchable: boolean; modes: readonly FlagValue[] }
  export const SHADOW_CAPABLE: ReadonlySet<string>; // CRISIS_EVENT_RECORD, CRISIS_SCRIPT_IMMINENT_READ, SMS_CRISIS_SCREEN, SOUND_CONDUCTOR, CRISIS_MEANS_IN_HAND
  export function agentFlags(): SwitchableFlag[];            // all 172, sorted by name
  export type ApplyRequest = { set: Record<string, FlagValue>; reset: string[] };
  export function validateApply(body: unknown): { ok: true; request: ApplyRequest } | { ok: false; errors: string[] };
  ```

- [ ] **Step 1: Write the failing tests**
  - `agentFlags()` length equals `Object.keys(FLAG_FILES).length` and contains no name outside the barrel.
  - The 6 numeric config flags have `switchable: false`; a default-`off` experiment has `modes` `['off','on']`; `CRISIS_MEANS_IN_HAND` has `['off','shadow','on']`.
  - `validateApply({ set: { CARTESIA_MODEL: 'on' }, reset: [] })` → `ok: false` (a real secret, not a flag file).
  - `validateApply` refuses `ALLOW_PRODUCTION_DATA`, a config flag, `shadow` on a non-shadow flag, a name in both `set` and `reset`, an empty request, and a non-object body.
  - `validateApply({ set: { SOUND_CONDUCTOR: 'shadow' }, reset: ['ABUSE_DISCLOSURE_PATTERNS'] })` → `ok: true`.
  - Drift guard: scan `src/**/*.ts` (not tests) for `flagModeOf('NAME'` and assert every per-file NAME found is in `SHADOW_CAPABLE`.
- [ ] **Step 2:** `pnpm vitest run src/config/agent-flags/__tests__/switchable.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement from `import * as FLAG_FILES from '../../flags/index.generated.js'`. `switchable` = default ∈ {on, off, shadow}.
- [ ] **Step 4:** Run again → PASS. Break it (drop the default check) and confirm the config-flag test fails, then restore.
- [ ] **Step 5:** Commit `feat(flags): list the agent flags a page may switch`.

### Task 3: Snapshot on boot

**Files:**
- Create: `src/config/flags/FLAG_SNAPSHOT.ts` via `pnpm flags:new FLAG_SNAPSHOT --default off --owner platform --kind experiment --issue '#N'`
- Create: `src/config/agent-flags/domain/snapshot.ts`, `src/config/agent-flags/adapters/flag-store.ts`, `src/config/agent-flags/boot-snapshot.ts`
- Modify: `src/agent.ts` (after the `build-sha` line)
- Create: `src/config/agent-flags/CLAUDE.md` (what this folder is, the dev-only rule, where the snapshot lives)
- Test: `src/config/agent-flags/__tests__/snapshot.test.ts`, `boot-snapshot.test.ts`

**Interfaces:**
- Consumes: `agentFlags()` (Task 2), `flagOn`, `flagModeOf`, `Env` (`src/config/env-flag.ts`).
- Produces:
  ```ts
  export interface FlagSnapshot { startedAt: string; buildSha: string | null; flags: Record<string, { raw: string | null; resolved: string }> }
  export function buildFlagSnapshot(env: Env, now: Date, buildSha: string | null): FlagSnapshot;
  // flag-store.ts (Firestore ferni-dev): doc ops/agent_flag_snapshot, collection agent_flag_changes
  export interface FlagChange { at: string; actor: string; set: Record<string, string>; reset: string[]; result: 'applied' | 'refused' | 'failed'; detail?: string }
  export interface FlagStore { writeSnapshot(s: FlagSnapshot): Promise<void>; readSnapshot(): Promise<FlagSnapshot | null>; appendChange(c: FlagChange): Promise<void>; recentChanges(limit: number): Promise<FlagChange[]> }
  export function firestoreFlagStore(): FlagStore;
  export function writeFlagSnapshotOnBoot(env?: Env, store?: FlagStore): Promise<void>;
  ```

- [ ] **Step 1: Failing tests**
  - `buildFlagSnapshot` keys equal `agentFlags()` names exactly; with `{ ABUSE_DISCLOSURE_PATTERNS: 'ON', LIVEKIT_API_SECRET: 'x' }` the snapshot has `raw: 'ON', resolved: 'on'` for the flag and no `LIVEKIT_API_SECRET` key anywhere; an unset kill switch resolves `on`; a config flag resolves to its raw value or default.
  - `writeFlagSnapshotOnBoot` with a fake store: writes once when `FLAG_SNAPSHOT=on` and `FIRESTORE_DATABASE=ferni-dev`; no write when either is off or the database is `(default)`; resolves (does not throw) when the store rejects, and logs a warning.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `resolved` = `flagModeOf` for shadow-capable flags, `flagOn ? 'on' : 'off'` for other switchable flags, raw-or-default for config. In `src/agent.ts` add one line: `void (await import('./config/agent-flags/boot-snapshot.js')).writeFlagSnapshotOnBoot();` (never awaited past the import, so boot is not delayed).
- [ ] **Step 4:** Run → PASS; `pnpm typecheck`; `pnpm quality:arch`; ratchet.
- [ ] **Step 5:** Commit `feat(flags): dev agent writes the flag values it booted with`. Open the PR, merge through the queue.
- [ ] **Step 6 (lead, after merge):** deploy to dev from `main` (skill `deploy-agent`, rooms empty), then `FLAG_SNAPSHOT=on` with `lk agent update-secrets`. Confirm `ops/agent_flag_snapshot` in `ferni-dev` has 172 flags and a fresh `startedAt`.

---

## PR 2: the server routes

Branch `feat/dev-flag-routes` from `origin/main` after PR 1 merges.

### Task 4: LiveKit dev agent adapter

**Files:**
- Create: `src/config/agent-flags/adapters/livekit-dev-agent.ts`
- Test: `src/config/agent-flags/__tests__/livekit-dev-agent.test.ts`

**Interfaces:**
- Consumes: Task 1 findings (service name, host, grant). `ApplyRequest` (Task 2).
- Produces:
  ```ts
  export const DEV_AGENT_ID = 'CA_siTDMHEba4Fg';
  export const DEV_LIVEKIT_HOST = 'dev-8sm1ba0z.livekit.cloud';
  export interface DevAgent { flagSecretTimes(): Promise<Record<string, string>>; updateFlags(req: ApplyRequest): Promise<void>; occupiedRooms(): Promise<Array<{ name: string; participants: number }>> }
  export function liveKitDevAgent(env?: Env, rpc?: Rpc, rooms?: Pick<RoomServiceClient, 'listRooms'>): DevAgent;
  ```

- [ ] **Step 1: Failing tests** (fake `rpc` and `rooms`)
  - `liveKitDevAgent({ LIVEKIT_URL: 'wss://prod-x.livekit.cloud', ... })` throws.
  - `updateFlags({ set: { A: 'on' }, reset: ['B'] })` sends exactly one request with `agentId: DEV_AGENT_ID`, `overwrite: false`, `secrets: [{ name: 'A', value: bytes('on') }]`, `remove: ['B']`.
  - `flagSecretTimes()` returns `updatedAt` only for names in `agentFlags()`, dropping every other secret name from the response.
  - `occupiedRooms()` returns only rooms with `numParticipants > 0`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(flags): livekit adapter for the dev agent's flag secrets`.

### Task 5: Apply use case and admin routes

**Files:**
- Create: `src/config/agent-flags/use-cases/apply-flags.ts`, `src/api/v1/admin/agent-flags.ts`
- Modify: `src/api/v1/admin/index.ts` (route `${BASE_PATH}/agent-flags`, next to `/flags`)
- Test: `src/config/agent-flags/__tests__/apply-flags.test.ts`, `src/api/__tests__/admin-agent-flags.test.ts`

**Interfaces:**
- Consumes: `validateApply`, `agentFlags` (Task 2); `FlagStore`, `FlagSnapshot` (Task 3); `DevAgent` (Task 4).
- Produces:
  ```ts
  export type ApplyResult =
    | { status: 200; appliedAt: string; auditWarning?: string }
    | { status: 400; errors: string[] }
    | { status: 409; rooms: Array<{ name: string; participants: number }> }
    | { status: 502; error: string };
  export function applyAgentFlags(body: unknown, actor: string, deps: { agent: DevAgent; store: FlagStore; now?: () => Date }): Promise<ApplyResult>;
  export function handleAdminAgentFlagsRoutes(req: IncomingMessage, res: ServerResponse, pathname: string, parsedUrl: URL): Promise<boolean>;
  ```
  Routes: `GET /api/v1/admin/agent-flags` → `{ flags: SwitchableFlag[], snapshot: FlagSnapshot | null, stale: boolean, changes: FlagChange[] }` (`stale` = any `flagSecretTimes()` value later than `snapshot.startedAt`, or no snapshot). `GET …/rooms` → `{ rooms }`. `POST …/apply` → `ApplyResult` body with its status.

- [ ] **Step 1: Failing tests** for `applyAgentFlags` (fakes)
  - Order: validate → `occupiedRooms` → `updateFlags` → `appendChange`. Invalid body: 400, `occupiedRooms` and `updateFlags` not called.
  - Occupied room: 409 with the rooms, `updateFlags` not called, a `refused` change appended.
  - LiveKit throws: 502, `failed` change appended.
  - `appendChange` rejects after a successful update: 200 with `auditWarning`.
- [ ] **Step 2: Failing tests** for the route
  - With `DEPLOY_ENV` unset or `production`, every path returns 404 and no adapter is built.
  - `GET` returns `stale: true` when a flag's `updatedAt` is after `snapshot.startedAt`.
  - `POST /apply` uses the admin's uid/email from `requireAdmin` as `actor`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement (rate limit 30/min, key prefix `admin-agent-flags`). **Step 5:** Run → PASS; `pnpm typecheck`; break the room check and confirm the 409 test fails.
- [ ] **Step 6:** Commit `feat(flags): admin routes to apply dev agent flags`. PR, queue. After deploy to the dev UI server, `curl` the `GET` with an admin token and check 172 flags; `curl` the prod UI server and check 404.

---

## PR 3: the page and the Dev Panel link

Branch `feat/dev-flag-page` from `origin/main` after PR 2 merges.

### Task 6: Admin section "Agent flags (dev)"

**Files:**
- Move: `ADMIN_SECTIONS` (`apps/web/src/admin/AdminPortal.ts:75-264`) to `apps/web/src/admin/section-registry.ts`, unchanged, in its own commit (makes room under the ratchet).
- Modify: `section-registry.ts` (add `{ id: 'agent-flags', name: 'Agent flags (dev)', icon: ICON_FLAGS, … }` after `flags`); `AdminPortal.ts` (open `?section=<id>` on load).
- Create: `apps/web/src/admin/sections/AgentFlagsSection.ts` (render + events), `apps/web/src/admin/sections/agent-flags-state.ts` (pure)
- Test: `apps/web/tests/admin/agent-flags-state.test.ts`

**Interfaces:**
- Consumes: the Task 5 routes and their JSON shapes. The web app cannot import from `src/`, so declare `FlagValue`, `SwitchableFlag`, `FlagSnapshot` and `FlagChange` as local response types in `agent-flags-state.ts`, matching Tasks 2–3 field for field.
- Produces (`agent-flags-state.ts`):
  ```ts
  export interface Staged { set: Record<string, FlagValue>; reset: string[] }
  export function stage(s: Staged, name: string, value: FlagValue | 'default', running: string, def: string): Staged; // staging the running value removes the entry
  export function confirmState(snapshot: FlagSnapshot | null, applied: Staged, appliedAt: string, now: Date, timeoutMs: number): 'waiting' | 'live' | 'timeout';
  ```

- [ ] **Step 1: Failing tests:** staging a value equal to the running one leaves `Staged` empty; `'default'` puts the name in `reset`; `confirmState` is `waiting` while `startedAt <= appliedAt`, `live` once a newer snapshot matches every staged value (reset names match the default), `timeout` after `timeoutMs` (use 4 minutes) with no match.
- [ ] **Step 2:** Run (`pnpm vitest run apps/web/tests/admin/agent-flags-state.test.ts`) → FAIL. **Step 3:** Implement state, then the section:
  - Grouped by owner, search box, kind badge, default, running value; rows differing from default are marked.
  - A sticky bar: "N changes staged", Apply, Discard. Apply is disabled with "Dev room in use: <names>" from `GET …/rooms`.
  - After Apply: "Restarting dev agent…", poll `GET` every 5 s with `confirmState`; then "Live on dev" or "Applied, not confirmed yet". Note that the old worker may finish calls for a while.
  - `stale: true` → banner "Values may be out of date: a flag was changed outside this page since the agent started."
  - On a 404 (not the dev server) render "Agent flags can only be changed on the dev admin server." (Deviation from the spec, which said hide the nav entry: a notice needs no async nav logic. Flag this to Seth in the PR.)
  - Recent changes list from `changes`.
  - Tokens only (`var(--color-*)`), `createLogger` from `apps/web/src/utils/logger.ts`.
- [ ] **Step 4:** Run → PASS; `pnpm typecheck`; ratchet shows `AdminPortal.ts` shrank.
- [ ] **Step 5:** Commit `feat(admin): agent flags section for the dev agent`.

### Task 7: Dev Panel link and end-to-end check

**Files:**
- Create: `apps/web/src/ui/dev-panel/dashboard-links.ts` (the "Dashboards & Tools" links as data)
- Modify: `apps/web/src/ui/dev-panel.ui.ts:~2250-2290` (render the links from that array; add `{ href: '/admin.html?section=agent-flags', icon: 'flag', label: 'Agent flags (dev)' }` next to Feature Flags). The file must end shorter than it started.
- Test: extend `apps/web/tests/ui/dev-panel.ui.test.ts`: the rendered panel contains a link to `/admin.html?section=agent-flags` and still contains every link it had before.

- [ ] **Step 1:** Failing test. **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; ratchet.
- [ ] **Step 5:** Commit `feat(dev-panel): link to the dev agent flags page`. PR, queue, deploy the dev UI server.
- [ ] **Step 6 (lead, browser, dev):** with no dev rooms open, flip one harmless default-off experiment on, Apply, wait for "Live on dev", confirm the snapshot doc agrees, flip it back to default, confirm again. Open a dev room and confirm Apply is disabled. Load the prod admin portal and confirm the notice. Paste the evidence in the PR.
