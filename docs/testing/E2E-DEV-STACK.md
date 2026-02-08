# E2E Dev Stack – Four Servers and Health Checks

> **Phase 0** of the [E2E Better Than Human Master Plan](../plans/E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md).  
> Any engineer (or CI) can run the full E2E stack with one set of commands and env.

---

## Four Required Servers

| Server            | Port    | Command                            | Purpose                                       |
| ----------------- | ------- | ---------------------------------- | --------------------------------------------- |
| **Token Server**  | 3001    | `pnpm token-server`                | LiveKit tokens, Spotify OAuth, subscriptions  |
| **UI Server**     | 3002    | `pnpm ui-server`                   | APIs, engagement routes, agent registry       |
| **Vite Frontend** | 3004    | `cd apps/web && pnpm dev`          | Frontend with HMR                             |
| **Voice Agent**   | LiveKit | `LOG_FULL_RESPONSES=true pnpm dev` | Voice agent (connects to dev LiveKit project) |

Start each in a **separate terminal** so logs can be watched individually.

---

## Quick Start (Cursor / Local)

```bash
# Terminal 1: Token Server (port 3001)
pnpm token-server

# Terminal 2: UI Server (port 3002)
pnpm ui-server

# Terminal 3: Vite Frontend (port 3004)
cd apps/web && pnpm dev

# Terminal 4: Voice Agent (LiveKit worker)
LOG_FULL_RESPONSES=true pnpm dev
```

Or use the CLI for a printed reference:

```bash
ferni dev cursor
```

---

## Health Checks

After all four are running:

```bash
# Token server
curl -s http://localhost:3001/health

# UI server
curl -s http://localhost:3002/health

# Vite (HTML response)
curl -s http://localhost:3004/ | head -c 100

# One-liner (all three HTTP services)
curl -s http://localhost:3001/health && echo "" && curl -s http://localhost:3002/health && echo "" && curl -s http://localhost:3004/ | head -c 100
```

The voice agent does not expose a local HTTP port by default; it connects to LiveKit. For agent health when deployed, see `http://34.134.186.63:8080/health` (GCE) or your dev agent URL.

---

## Environment

1. Copy `.env.example` to `.env`.
2. Set at least:
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (use **dev** LiveKit project for local agent)
   - `GOOGLE_API_KEY`, `CARTESIA_API_KEY` (for voice/TTS)
3. For Director Mode / Qwen3-Omni: `USE_QWEN3_OMNI=true`, optional `USE_QWEN3_OMNI_DIRECTOR=true`, `DIRECTOR_AUTHORIZED_IDS=<your-user-id>`.

See [environment-variables.md](../guides/environment-variables.md) and [DIRECTOR-MODE-LOCAL-DEV.md](../guides/DIRECTOR-MODE-LOCAL-DEV.md).

---

## Firestore Emulator (Optional)

For memory and BTH E2E tests that use Firestore:

1. Start the emulator:
   ```bash
   firebase emulators:start --only firestore
   ```
2. Set:
   ```bash
   export FIRESTORE_EMULATOR_HOST=localhost:8080
   ```
3. Run tests, e.g.:
   ```bash
   FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/tests/e2e/memory-flow-e2e.test.ts
   ```

Port `8080` is the default Firestore emulator port; confirm in `firebase.json` if different.

---

## Stop All Servers

```bash
ferni dev stop
```

Or stop each process (Ctrl+C) in its terminal.

---

## Acceptance (Phase 0)

- [ ] A new clone can run `pnpm install`, set `.env` from `.env.example`, run the four dev commands, and see token, UI, and Vite healthy.
- [ ] Optional: Firestore emulator running and `FIRESTORE_EMULATOR_HOST` set for memory/BTH tests.

See [E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md](../plans/E2E-BETTER-THAN-HUMAN-MASTER-PLAN.md) for the full Phase 0 checklist.
