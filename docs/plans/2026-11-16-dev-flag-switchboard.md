# Dev flag switchboard: flip agent flags on dev from the admin portal

Status: approved by Seth 2026-11-16. Ships in three PRs under #3930: the
agent's boot snapshot, the admin API routes, then the admin page and Dev
Panel link.

## Why

Seth wants to turn agent flags on and off on **dev** without running
`lk agent update-secrets`. Today that is the only way: the 172 flags in
`src/config/flags/` are env secrets on the dev LiveKit agent
(`CA_siTDMHEba4Fg`, project `ferni-dev`), read by `flagOn()` /
`flagModeOf()` (`src/config/env-flag.ts`). Each update restarts the agent.

The admin portal already has a "Feature Flags" page
(`apps/web/src/admin/sections/FlagsSection.ts` → `/api/v1/admin/flags`),
but it manages 8 `landing-ai-*` flags stored in Firestore
`feature_flags` that only the marketing landing page reads. Nothing on
it touches the agent.

## Which flags (Claude's call, Seth can widen)

The page covers the **172 per-file flags in `src/config/flags/`** (the
current `pnpm flags:new` system), not the whole `FLAG_MANIFEST` (~610
names, including ~438 older entries, many read by the UI server or jobs
rather than the agent, e.g. `CALL_HOURS_GUARD`, `MEMORY_VIEW`).

Of those 172, only flags whose manifest default is `on`, `off` or `shadow`
can be changed (the 5 numeric `config` flags are shown read-only;
`CALL_MEMORY_TRACE` is `config`-kind but defaults to `off`, so it is
switchable). A flag whose reader parses the env value itself offers only
the words that reader acts on (`CRISIS_MEANS_IN_HAND`: off, shadow, live),
so the page never sends a value the agent reads as something else. The
older entries that must never be flipped from a page
(`ALLOW_PRODUCTION_DATA`, `ALLOW_CLIENT_DEV_MODE`, `FIRESTORE_DB_PIN`,
`GOOGLE_GENAI_USE_VERTEXAI`) are all outside the 172, so this rule keeps
them out without a denylist. The allow-list is computed from the flag
files at build time, so a new flag file appears on the page automatically.

Known limit: a per-file flag that only the UI server reads would still
appear, showing the agent's value. If that turns up, mark such flags in
the flag file rather than guess here.

## Goals

- A page in the admin portal (the dev UI server) that lists every agent
  flag with its **actual** value on the dev agent, lets Seth change several,
  and applies them with one button.
- The page shows when the change is live (the restarted agent reports the
  new values), not just that the request was sent.
- Same safety rules as the CLI path: never while someone is in a dev room,
  only flags (never other secrets), dev only.
- A link from the Dev Panel's "Dashboards & Tools" section.

## Non-goals

- Prod. Prod flags stay on the CLI with the prod claim (`deploy-agent`
  skill). The server for this page cannot reach prod by construction.
- Per-call or no-restart flips (option B in the brainstorm; a later
  project if restarts turn out to be the pain).
- Web-app flags (`apps/web/src/config/*-flag.ts`, `ferni:flag:*`).
- The 8 `landing-ai-*` flags, `/api/flags` and `public/feature-flags.html`.
  They keep working; they just stop being the admin "Flags" page.
- Editing `config`-kind flags (numbers such as `1200`) in v1: shown
  read-only.

## Anti-goals (a failure even if it "works")

- Any other agent secret (API keys, tokens: 314 secrets on dev, most are
  not flags) is read, sent, overwritten or removed.
- A flip drops someone's live dev call.
- The page shows a value that isn't what the agent is running.
- The prod UI server can change anything.

## Constraint found in recon: LiveKit won't tell us the values

`lk agent secrets --json` on dev returns 314 entries with
`name, kind, createdAt, updatedAt` and **no `value`** (checked
2026-11-16, counts only). The `ListAgentSecrets` API therefore can't
show current flag values. The page needs another source of truth.

## Approaches considered

- **A. The page does what the CLI does (chosen by Seth).** Server calls
  LiveKit's `UpdateAgentSecrets` (merge, not overwrite) for the dev agent;
  the agent restarts. No change to how flags are read; dev gets flags the
  same way prod does.
- B. Live overrides from a Firestore doc read at call start, no restart.
  Faster loop but a second flag source, process-global, must be made
  impossible on prod. Rejected for now.
- C. Both. Most work; revisit after A if restarts hurt.

## Design

### 1. Agent reports what it sees (source of truth)

On worker start, when `FIRESTORE_DATABASE === 'ferni-dev'` and flag
`FLAG_SNAPSHOT` is on, the agent writes one Firestore doc in `ferni-dev`:
`ops/agent_flag_snapshot` = `{ startedAt, buildSha, flags: { NAME: { raw,
resolved } } }` for every per-file flag (see "Which flags") only (`raw` is the env
string or null; `resolved` is `flagModeOf`/`flagOn` result, or the raw
config value for `config` kind). Nothing outside the manifest is ever
read into it.

- New flag `FLAG_SNAPSHOT` (off by default, owner `platform`), turned on
  for dev once.
- The write must never block or fail the worker start (log a warning).

### 2. Server: `/api/v1/admin/agent-flags` on the dev UI server

- Refuses (404) unless `DEPLOY_ENV === 'dev'`. Agent id and LiveKit URL
  for `ferni-dev` are fixed in code, not taken from the request.
- `requireAdmin` for every route, rate limited like the existing flags API.
- `GET /` → manifest entries (name, kind, default, owner, the comment from
  the flag file as description if cheap to get at build time, else name
  only), plus the latest snapshot, plus the last applied change.
- `GET /rooms` → the dev rooms with participants (names only), so the page
  can explain a refusal.
- `POST /apply` body `{ set: {NAME: value}, reset: [NAME] }`:
  1. Every name must be a per-file flag whose default is `on`, `off` or
     `shadow`; every value must be `on`, `off` or (only for flags read with
     `flagModeOf`) `shadow`. Otherwise 400, nothing sent.
  2. List dev rooms; any room with a participant → 409 with the room list,
     nothing sent.
  3. One `UpdateAgentSecrets` call: `overwrite: false`, `secrets` = the
     `set` entries, `remove` = the `reset` entries (reset = back to the
     manifest default).
  4. Append an audit doc to `ferni-dev` `agent_flag_changes`
     (who, when, set, reset, LiveKit response) and log it.
- Uses the dev LiveKit key the dev UI server already has
  (`livekit-dev-api-key`). **Unverified:** whether that key may call the
  Cloud Agent API. The first PR checks this before anything else; if not,
  a key with that permission goes into Secret Manager as a new secret.

### 3. Page: a new admin section "Agent flags (dev)"

- A new section, not a replacement: the existing "Flags" section (the
  `landing-ai-*` flags, with its enable-all / disable-all) stays as it is,
  so prod's admin portal doesn't regress. The new section appears in the
  nav only when the server says it is the dev server (the `GET /` route
  returns 404 elsewhere; the nav hides the entry on 404). Claude's call.
- Table of flags grouped by owner (voice, intelligence, outreach, memory,
  tools, platform), with search, kind badge
  (experiment / kill switch / config) and default.
- Each row shows the running value from the snapshot and marks rows that
  differ from default. Toggling a row stages a change; nothing is sent.
- A bar shows "N changes staged" with Apply and Discard. Apply is disabled
  with the reason when a dev room is occupied.
- After Apply: "Restarting dev agent…", then poll the snapshot until
  `startedAt` is after the apply time and the staged values match →
  "Live on dev". If that hasn't happened in a few minutes, say so plainly
  and keep the change marked unconfirmed.
- Snapshot older than the last LiveKit secret update (someone used the
  CLI) or missing → banner: values may be stale.
- "Recent changes" list from `agent_flag_changes`.

### 4. Dev Panel

Add an "Agent flags (dev)" link next to the existing "Feature Flags" link in "Dashboards & Tools"
(`dev-panel.ui.ts` ~line 2285), opening the new admin section. No other
Dev Panel change.

## Delivery (each ≤ ~400 reviewable lines, from `origin/main`)

1. Spike, not merged: confirm the dev key can call `UpdateAgentSecrets` /
   `ListAgentSecrets` from Node.
2. PR 1: `FLAG_SNAPSHOT` flag + agent snapshot write + tests. Deploy to dev,
   turn the flag on with the CLI one last time, confirm the doc appears.
3. PR 2: server routes + validation + room check + audit + tests (LiveKit
   client mocked at the adapter boundary; a test that a non-manifest name
   and a `config` flag are refused).
4. PR 3: admin page + Dev Panel link. Verified in the browser against the
   dev UI server by flipping one harmless experiment flag on and back off.

## Left to the builder

- Module layout (follow `docs/DEFINITION-OF-CLEAN.md`: LiveKit and
  Firestore calls in an adapter, rules in domain).
- Whether descriptions come from the flag files' comments or names only.
- Poll interval and the confirmation timeout.
- Styling within the existing admin portal tokens.
- How to know which flags accept `shadow` (`FlagSpec` has no field for it:
  add one, or derive from `flagModeOf` callers).
- The old worker drains for up to `WORKER_DRAIN_TIMEOUT_MS` (30 min) after
  a restart; the `startedAt` check already ignores it, but say so in the UI.
