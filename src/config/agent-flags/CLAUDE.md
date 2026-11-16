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
- `domain/dev-agent-error.ts`: `DevAgentError`, the only error the LiveKit adapter
  throws: method, HTTP status, Twirp `code`, error name, timed out. Never LiveKit's
  `msg`, an SDK message or a body. Log any DevAgent error with `loggableError`.
- `ports/flag-store.ts`: `FlagStore` and `FlagChange`, the snapshot and audit
  trail contract.
- `ports/dev-agent.ts`: `DevAgent`, the dev voice agent as the switchboard sees
  it (flag secret times, occupied rooms).
- `adapters/livekit-dev-agent.ts`: `liveKitDevAgent`. Cloud Agent API over
  fetch + jose (Twirp on `agents.livekit.cloud`, `agent: {admin: true}` grant,
  `X-LIVEKIT-CLI-VERSION` header) for `CA_siTDMHEba4Fg` only; rooms via
  `RoomServiceClient` on the dev project, given up after 10 s. Throws unless
  `LIVEKIT_URL`'s host is `dev-8sm1ba0z.livekit.cloud`.
- `adapters/flag-store.ts`: Firestore. Snapshot at `ops/agent_flag_snapshot`
  (replaced on every worker start); audit trail in `agent_flag_changes`.
  Throws unless the env names `ferni-dev` exactly, before opening Firestore.
  `recentChanges` clamps its limit to 1..100.
- Routes: `src/api/v1/admin/agent-flags.ts` (`GET /api/v1/admin/agent-flags`
  with `stale` and `pendingRestart`; still 200, stale with a `warning`, when the
  LiveKit adapter cannot be built or read; `GET …/rooms`, 502 when the rooms fail),
  routed from `src/api/v1/admin/index.ts`.
  Every path is a 404 unless `DEPLOY_ENV` is exactly `dev`, before auth and
  before an adapter is built; adapters are built per request from this
  server's env. 30 requests a minute. Tests inject `AgentFlagsDeps` fakes;
  nothing reaches LiveKit or Firestore.
- `boot-snapshot.ts`: `writeFlagSnapshotOnBoot`, called un-awaited from
  `src/agent.ts` after Sentry starts; logs a warning on any failure and never
  fails boot.
