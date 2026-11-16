# config/agent-flags: the dev flag switchboard

Lets the admin page flip the **dev** voice agent's per-file flags
(`src/config/flags/<NAME>.ts`). Plan: `docs/plans/2026-11-16-dev-flag-switchboard.md`.

- **Dev only.** The snapshot is written only when `FIRESTORE_DATABASE` is exactly
  `ferni-dev` (`isKnownDevDatabase`) and `FLAG_SNAPSHOT` is on. Nothing here may
  run against prod's `(default)` database or the prod agent.
- **Flags only, never other secrets.** The dev agent holds ~300 env secrets (API
  keys, tokens). Only names in `agentFlags()` may ever be read into the snapshot
  or sent to LiveKit. No denylist: anything not a per-file flag is simply outside
  the set.
- **One resolution rule.** `resolvedValue(name, raw)` in `domain/switchable.ts`
  is what the agent's reader actually acts on (reader vocabularies, strict
  `=== 'on'` readers, `flagModeOf`, `flagOn`, numeric raw-or-default). The
  snapshot and the page both use it; never resolve a flag any other way here.

Files:

- `domain/switchable.ts`: which flags exist, which may be switched and to what,
  `resolvedValue`.
- `domain/snapshot.ts`: `buildFlagSnapshot` (raw + resolved per flag),
  `isSnapshotStale` (no snapshot, or a flag secret changed after the worker started)
  and `flagsPendingRestart` (the switchable flags whose secret changed since then).
- `domain/apply-request.ts`: `validateApply`, what an apply request may ask
  for (switchable flags only, each to one of its modes, or reset). Its errors name the
  flag, never the submitted value. The one rule set: the adapter re-runs it too.
  Refuses `FLAG_SNAPSHOT` (`SNAPSHOT_FLAG`): the page reads that snapshot, so only lk
  changes it.
- `domain/dev-agent-error.ts`: `DevAgentError`, what the LiveKit adapter throws for
  every LiveKit failure: method, HTTP status, Twirp `code`, error name, timed out. Never LiveKit's
  `msg`, an SDK message or a body. Log any DevAgent error with `loggableError`.
- `ports/flag-store.ts`: `FlagStore` and `FlagChange`, the snapshot and audit
  trail contract.
- `ports/dev-agent.ts`: `DevAgent`, the dev voice agent as the switchboard sees
  it (flag secret times, update, occupied rooms).
- `adapters/livekit-dev-agent.ts`: `liveKitDevAgent`. Cloud Agent API over
  fetch + jose (Twirp on `agents.livekit.cloud`, `agent: {admin: true}` grant,
  `X-LIVEKIT-CLI-VERSION` header) for `CA_siTDMHEba4Fg` only; rooms via
  `RoomServiceClient` on the dev project, given up after 10 s. Throws unless `LIVEKIT_URL`'s host is
  `dev-8sm1ba0z.livekit.cloud`; re-runs `validateApply` before sending;
  always `overwrite: false` (true wipes every secret).
- `adapters/flag-store.ts`: Firestore. Snapshot at `ops/agent_flag_snapshot`
  (replaced on every worker start); audit trail in `agent_flag_changes`.
  Throws unless the env names `ferni-dev` exactly, before opening Firestore.
  `recentChanges` clamps its limit to 1..100.
- `use-cases/apply-flags.ts`: `applyAgentFlags`, one apply request in a fixed
  order: validate (400) → `occupiedRooms` (409 while anyone is on a call, since
  an update restarts the agent; best effort, not a lock: someone joining before
  the update is still dropped) → `updateFlags` → `appendChange`. A LiveKit
  failure is 502 and is **never retried**: a Twirp error response is "refused;
  nothing changed" with its `code`; a timeout, network error or 2xx without
  `success: true` is "may have applied and restarted the agent". Both are
  recorded `failed`. LiveKit's text reaches neither the reply, the history nor the log.
  A failed history write after a good update is 200 with `auditWarning`.
- Routes: `src/api/v1/admin/agent-flags.ts` (`GET /api/v1/admin/agent-flags`
  with `stale` and `pendingRestart`; still 200, stale with a `warning`, when the
  LiveKit adapter cannot be built or read; `GET …/rooms`, `POST …/apply`; 502 when
  the rooms fail), routed from `src/api/v1/admin/index.ts`.
  Every path is a 404 unless `DEPLOY_ENV` is exactly `dev`, before auth and
  before an adapter is built; adapters are built per request from this
  server's env. Actor = requireAdmin's email, else uid. 30 requests a minute,
  16 KB bodies. Tests inject `AgentFlagsDeps` fakes; nothing reaches LiveKit
  or Firestore.
- `boot-snapshot.ts`: `writeFlagSnapshotOnBoot`, called un-awaited from
  `src/agent.ts` after Sentry starts; logs a warning on any failure and never
  fails boot.
