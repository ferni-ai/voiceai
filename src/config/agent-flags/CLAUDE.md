# config/agent-flags: the dev flag switchboard

Lets the admin page flip the **dev** voice agent's per-file flags
(`src/config/flags/<NAME>.ts`). Plan: `docs/plans/2026-11-16-dev-flag-switchboard.md`.

- **Dev only.** The snapshot is written only when `FIRESTORE_DATABASE` is exactly
  `ferni-dev` (`isKnownDevDatabase`) and `FLAG_SNAPSHOT` is on. Nothing here may
  run against prod's `(default)` database or the prod agent.
- **Flags only, never other secrets.** The dev agent holds ~300 env secrets (API
  keys, tokens). Only names in `agentFlags()` are ever read into the snapshot,
  validated in an apply, or sent to LiveKit. No denylist: anything not a per-file
  flag is simply outside the set.
- **One resolution rule.** `resolvedValue(name, raw)` in `domain/switchable.ts`
  is what the agent's reader actually acts on (reader vocabularies, strict
  `=== 'on'` readers, `flagModeOf`, `flagOn`, numeric raw-or-default). The
  snapshot and the page both use it; never resolve a flag any other way here.

Files:

- `domain/switchable.ts`: which flags exist, which may be switched and to what,
  `resolvedValue`.
- `domain/apply-request.ts`: `validateApply` for the apply route's body.
- `domain/snapshot.ts`: `buildFlagSnapshot` (raw + resolved per flag).
- `adapters/flag-store.ts`: Firestore. Snapshot at `ops/agent_flag_snapshot`
  (replaced on every worker start); audit trail in `agent_flag_changes`.
- `boot-snapshot.ts`: `writeFlagSnapshotOnBoot`, called un-awaited from
  `src/agent.ts` after Sentry starts; logs a warning on any failure and never
  fails boot.
