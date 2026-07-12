# Design: Kill token-server + LiveKit exact pins

**Date:** 2026-07-12  
**Status:** Approved (Approach 1 — single cutover)  
**Decisions:** B (kill :3001) · C (upgrade LiveKit line) · A (drop `file:../agents-js`)

---

## 1. Goals & topology

### Goals

1. One process serves LiveKit tokens + OAuth + APIs: UI server on **3002** (prod: `john-bogle-ui`).
2. **Delete** standalone token server (port 3001 / `pnpm token-server`) so security fixes cannot land on a dead path.
3. **One** LiveKit token implementation (auth, JWT metadata, room/dispatch, demo).
4. Upgrade `@livekit/agents*` to a **coherent exact set** (**1.5.1** + matching plugins + `@livekit/rtc-node@0.13.31`), drop `file:../agents-js`, remove Docker `sed` rewrites.

### Target topology

```
Browser / Vite → :3002 UI server only
  /token, /demo-*           → shared handlers (token/handlers.ts + livekit.ts)
  /spotify/*, /auth/google/* → UI routes (absorb full OAuth from token server)
  /wearables/*              → new UI routes wrapping token/oauth/wearables.js
  /api/*                    → unchanged

Prod Firebase → john-bogle-ui (rewrites unchanged)
GCE voice agent → same exact LiveKit versions as UI
```

### Non-goals

- Reworking OAuth UX or Firebase Hosting rewrite map
- Keeping dual-server gateway for convenience
- Upgrading LiveKit beyond the 1.5.1 coherent set in this cutover

---

## 2. Token consolidation & killing 3001

### Single LiveKit token path

- Extract `handleAuthenticatedToken` + demo handlers into `src/servers/token/handlers.ts`.
- Behavior = **production UI today** (Firebase Bearer required, geo/accent, prewarm, Firestore demo) **plus** `livekit.ts` JWT participant metadata + `createRoomWithAgent`.
- `src/servers/api/routes/token.ts` becomes a thin wrapper.
- Standalone HTTP entry `src/servers/token/index.ts` is deleted (or reduced to library re-exports only — prefer delete as server).

### OAuth migration before delete

| Flow | UI today | Token server | Action |
|------|----------|--------------|--------|
| Spotify playback token / device | ✅ | ✅ | Keep UI |
| Spotify login/callback/status/unlink | incomplete | ✅ full | Move into UI `routes/spotify.ts` using `token/oauth/spotify.js` |
| Google Calendar OAuth | ✅ | ✅ | Keep UI |
| Wearables | ❌ | ✅ | Add UI `routes/wearables.ts` wrapping `token/oauth/wearables.js` |

### Delete surface

- Remove `pnpm token-server`, `gateway.ts` dual-start (`--token`), CLI/tests defaults to `:3001`.
- Keep libraries: `livekit.ts`, `oauth/*`, `validation.ts`, `demo-rate-limit.ts`, `handlers.ts`.
- Dev = **3 servers**: UI (3002), Vite (3004), voice agent. Update CLAUDE.md / `ferni dev cursor`.
- CI guard: fail if new references to `localhost:3001` or `token-server` script appear (allowlist docs/history if needed).

### Guardrail smoke

- `curl /token` without auth → 401
- `curl /token?room=x&username=y` without Bearer → 401
- With valid Firebase Bearer → 200 + LiveKit JWT
- No process listening on 3001 in `ferni dev` / Cursor start docs

---

## 3. LiveKit upgrade & pin strategy

### Version set (exact, no carets)

| Package | Version |
|---------|---------|
| `@livekit/agents` | `1.5.1` |
| `@livekit/agents-plugin-cartesia` | `1.5.1` |
| `@livekit/agents-plugin-google` | `1.5.1` |
| `@livekit/agents-plugin-openai` | `1.5.1` |
| `@livekit/agents-plugin-silero` | `1.5.1` |
| `@livekit/agents-plugin-deepgram` | `1.5.1` (if present) |
| `@livekit/rtc-node` | `0.13.31` |

### package.json

- Replace all `file:../agents-js/...` with exact `1.5.1`.
- Replace `^` ranges on LiveKit agents packages with exact versions.
- `pnpm.overrides` mirrors the same exact versions (no `^`).

### Docker / Cloud Build

- Remove `sed` rewriting of `file:` LiveKit paths from `Dockerfile.ui`, `Dockerfile.agent`, `Dockerfile.agent-gpu`, `cloudbuild*.yaml`.
- Keep `ARG LIVEKIT_AGENTS_VERSION` only if still useful for documentation; prefer reading package.json as source of truth.
- Typecheck steps: `pnpm install --frozen-lockfile` after lockfile regenerated (no sed).

### Compatibility work

- Fix TypeScript / runtime breaks from 1.0.x → 1.5.1 (e.g. `ToolContext` task tool shapes, import exports).
- Prove UI Cloud Run and GCE agent both boot with the same lockfile.

---

## 4. Success criteria

1. No `token-server` npm script; no documented requirement for port 3001.
2. Prod and local `/token` share one code path; auth required.
3. Spotify OAuth + wearables work via UI server (3002 / john-bogle-ui).
4. Local `pnpm install` and Docker builds use identical exact LiveKit versions; no `file:../agents-js`.
5. `pnpm ferni deploy ui` and `pnpm ferni deploy gce` succeed without LiveKit import crashes.
6. Smoke: `/token` 401 unauthenticated; `/health` 200; GCE `/health/ready` ready.

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| LiveKit 1.5.1 breaks voice agent tasks/types | Fix compile errors in cutover; run agent smoke after GCE deploy |
| Spotify OAuth redirect URIs still list :3001 | Update Google/Spotify console docs + allowlisted callback URLs to :3002 / app.ferni.ai |
| Wearables unused but broken after move | Port handlers 1:1; smoke status endpoints |
| Large PR | Single cutover by design; keep commits logical within the PR |

---

## Approval

- Approach 1 (single cutover): **approved**
- §1 Goals: **approved**
- §2 Token kill: **approved** (“Do it”)
- §3 LiveKit: included in this cutover per decisions C + A
