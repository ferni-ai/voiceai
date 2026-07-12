# Token-Server Consolidation + LiveKit 1.5.1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Kill port 3001, one token code path on UI server, upgrade LiveKit to exact 1.5.1 set, remove `file:../agents-js` and Docker sed.

**Architecture:** UI server owns `/token`, demo, Spotify OAuth, Google OAuth, wearables. Libraries stay under `src/servers/token/`. Agents + UI Docker share the same lockfile pins.

**Tech Stack:** Node HTTP routes, `livekit-server-sdk`, `@livekit/agents@1.5.1`, pnpm, Cloud Build Dockerfiles.

**Spec:** `docs/superpowers/specs/2026-07-12-token-server-consolidation-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/servers/token/handlers.ts` | **New** — authenticated `/token` + demo handlers |
| `src/servers/token/livekit.ts` | JWT + room create + dispatch (SSoT) |
| `src/servers/api/routes/token.ts` | Thin wrapper → handlers |
| `src/servers/api/routes/spotify.ts` | Add login/callback/status/unlink from token server |
| `src/servers/api/routes/wearables.ts` | **New** — wearables OAuth routes |
| `src/servers/api/index.ts` | Wire wearables; drop token-server assumptions |
| `src/servers/token/index.ts` | **Delete** as HTTP server |
| `src/servers/gateway.ts` | UI-only or delete dual mode |
| `package.json` | Exact LiveKit pins; remove `token-server` script |
| `docker/Dockerfile.{ui,agent,agent-gpu}` | Remove LiveKit sed |
| `cloudbuild*.yaml` | Remove LiveKit sed / simplify typecheck |
| Docs / CLI | Point to 3002 only |

---

### Task 1: Shared token handlers

**Files:**
- Create: `src/servers/token/handlers.ts`
- Modify: `src/servers/api/routes/token.ts`
- Test: smoke via unit test or integration for 401 without Bearer

**Steps:**
1. Move authenticated `/token` + demo logic from `api/routes/token.ts` into `handlers.ts`.
2. Call `createToken` / `createRoomWithAgent` / `getLiveKitUrl` from `livekit.ts` (extend createToken if geo metadata needed on JWT).
3. Keep Firebase Bearer required; reject spoofed `firebase_uid`.
4. Thin `api/routes/token.ts` to call handlers.
5. Commit: `refactor: extract shared LiveKit token handlers`

---

### Task 2: Migrate Spotify OAuth + wearables to UI

**Files:**
- Modify: `src/servers/api/routes/spotify.ts`
- Create: `src/servers/api/routes/wearables.ts`
- Modify: `src/servers/api/index.ts`, `routes/index.ts`
- Reuse: `src/servers/token/oauth/spotify.ts`, `wearables.ts`

**Steps:**
1. Port login/callback/status/unlink from `token/index.ts` into UI Spotify routes.
2. Port wearables routes 1:1 into new UI module; register in `api/index.ts`.
3. Confirm Vite already proxies `/spotify` → 3002; add `/wearables` proxy if missing.
4. Commit: `feat: serve Spotify OAuth and wearables from UI server`

---

### Task 3: Delete token-server process

**Files:**
- Delete or gut: `src/servers/token/index.ts`
- Modify: `package.json`, `src/servers/gateway.ts`, CLI voice/preview, tests, CLAUDE.md, `apps/web` docs
- Grep purge: `localhost:3001`, `token-server`

**Steps:**
1. Remove `token-server` script; update `ferni dev cursor` / CLAUDE to 3 servers.
2. Change defaults `TOKEN_SERVER_URL` → `http://localhost:3002`.
3. Remove gateway `--token` path or make gateway UI-only.
4. Add CI grep check (or quality script) forbidding new `localhost:3001` / `pnpm token-server`.
5. Commit: `chore: remove standalone token-server (port 3001)`

---

### Task 4: LiveKit 1.5.1 exact pins

**Files:**
- Modify: `package.json` (deps + overrides)
- Regenerate: `pnpm-lock.yaml`
- Modify: Dockerfiles + cloudbuild YAMLs (remove sed)
- Fix: TS breaks in `src/tasks/*` etc.

**Steps:**
1. Set exact versions: agents + plugins `1.5.1`, `rtc-node` `0.13.31`.
2. Remove `file:../agents-js/*`.
3. `pnpm install` → lockfile.
4. Strip sed from Docker/cloudbuild; use frozen lockfile.
5. Fix compile/runtime import errors until `pnpm typecheck` / agent boot path is clean enough to deploy.
6. Commit: `chore: pin LiveKit agents to 1.5.1 and drop file: overrides`

---

### Task 5: Verify + deploy

**Steps:**
1. Local: UI on 3002; `/token` → 401 without auth; Spotify/wearables routes respond.
2. `pnpm ferni deploy ui --skip-git-check` (if dirty) or after commit.
3. `pnpm ferni deploy gce` if agent image changed.
4. Prod smoke: `/token` 401, `/health` 200, GCE ready.
5. Commit any leftover doc fixes.

---

## Done when

- [ ] No token-server script / no :3001 in active docs/CLI
- [ ] One token handler path
- [ ] Exact LiveKit 1.5.1 everywhere; no file: agents-js
- [ ] UI + GCE healthy in prod
