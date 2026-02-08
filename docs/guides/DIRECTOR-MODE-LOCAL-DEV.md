# Director Mode – Local Dev & Testing

How to run and debug Director Mode (Qwen3-Omni ensemble + Director Console) locally.

---

## Director Mode vs AutoDirector (you don’t have to do anything)

**Director Mode** = the ensemble session (Qwen3-Omni cast + scene).  
**AutoDirector** = the AI that *intelligently* suggests or executes cast/scene changes (persona switches, mood, pace) based on what the user said.

- **Default is “better than human”:** When Director Mode is on, **AutoDirector runs in `autopilot`** by default. After each turn it analyzes the user’s input (transcript or “[audio input]”) and, when confident, **automatically** applies suggestions (e.g. “bring Maya on — user mentioned habits”). You don’t need to open the Director Console or tap anything; the system directs itself.
- **Director Console** = optional override and visibility. Use it to see pending suggestions, manually change cast/mood, or switch to `suggest` (show suggestions only) or `off` if you want no auto-direction.
- To disable auto-direction for a session, pass `autoDirectorMode: 'off'` or `'suggest'` in the Director Mode config (e.g. from room metadata or env-driven config).

---

## Two ways to run locally

### 1. **With mock backend (no Thinker/TTS servers)** – recommended for UI and flow

Use this to:

- Connect and see the Director Console
- Speak and get a canned reply (no real LLM/audio)
- Try cast, scene, WebSocket, and UI flow

**Steps:**

1. **.env** (copy from `.env.example` and set):

   ```bash
   USE_QWEN3_OMNI_DIRECTOR=true
   QWEN3_OMNI_MOCK=true
   DIRECTOR_AUTHORIZED_IDS=<your-user-id>
   ```

   Use the same ID you use when connecting (e.g. Firebase UID or LiveKit identity). If `DIRECTOR_AUTHORIZED_IDS` is empty, the Director Console WebSocket will reject connections.

2. **Start the four servers** (separate terminals):

   ```bash
   # Terminal 1: Token server
   pnpm token-server

   # Terminal 2: UI server
   pnpm ui-server

   # Terminal 3: Frontend
   cd apps/web && pnpm dev

   # Terminal 4: Voice agent (Director Mode + mock)
   USE_QWEN3_OMNI_DIRECTOR=true QWEN3_OMNI_MOCK=true pnpm dev
   ```

   Or use the script:

   ```bash
   QWEN3_OMNI_MOCK=true pnpm qwen3:dev:director
   ```

3. **Connect from the app**

   - Open `http://localhost:3004` (and sign in if required).
   - Start a voice session (Connect).
   - Open the Director Console: **Director** button or **Cmd+Shift+D** / **Cmd+Shift+E**.
   - Speak; you should get the mock reply and see state/transcript in the console.

You do **not** need Qwen3-Omni Thinker or TTS servers for this.

---

### 2. **With real Qwen3-Omni Thinker + TTS**

Use this when you have the inference and TTS servers running (e.g. Docker/GPU or cloud).

**Steps:**

1. **.env**

   ```bash
   USE_QWEN3_OMNI_DIRECTOR=true
   QWEN3_OMNI_URL=http://localhost:8000   # Thinker
   QWEN3_TTS_URL=http://localhost:8001    # TTS
   DIRECTOR_AUTHORIZED_IDS=<your-user-id>
   ```

   Do **not** set `QWEN3_OMNI_MOCK=true`.

2. **Run Thinker and TTS** (your own setup; see Qwen3-Omni / Qwen3-TTS docs for URLs and health).

3. **Start the four servers** as above, but without `QWEN3_OMNI_MOCK`:

   ```bash
   pnpm qwen3:dev:director   # or: USE_QWEN3_OMNI_DIRECTOR=true pnpm dev
   ```

4. Connect and use the Director Console as in option 1.

---

## Env reference

| Variable | Purpose |
|----------|---------|
| `USE_QWEN3_OMNI_DIRECTOR` | Enable Director Mode for the voice agent (Qwen3-Omni RealtimeModel + DirectorEngine). |
| `QWEN3_OMNI_MOCK` | Use mock client (no Thinker/TTS). Set with `USE_QWEN3_OMNI_DIRECTOR=true` for local UI testing. |
| `DIRECTOR_AUTHORIZED_IDS` | Comma-separated user IDs allowed to open `/ws/director`. Use your LiveKit/Firebase identity for local testing. |
| `QWEN3_OMNI_URL` | Thinker server URL (only when not using mock). |
| `QWEN3_TTS_URL` | TTS server URL (only when not using mock). |

---

## What you can do in mock mode

- **Director Console:** Cast, scene mood/intensity, whisper, auto-director toggle, live transcript.
- **WebSocket:** State and events over `/ws/director` (if your ID is in `DIRECTOR_AUTHORIZED_IDS`).
- **Voice flow:** Push audio → commit → mock reply (canned text, no real LLM/TTS).

---

## Troubleshooting

- **Director Console doesn’t open / “Unauthorized”**  
  Add your connecting user ID to `DIRECTOR_AUTHORIZED_IDS` in `.env` and restart the UI server.

- **“No active Director session”**  
  Director Mode is only active when the voice agent created a Director session (env or room metadata). Ensure the voice agent was started with `USE_QWEN3_OMNI_DIRECTOR=true` and you connected **after** that.

- **Real backends: connection errors**  
  Confirm Thinker and TTS are reachable at `QWEN3_OMNI_URL` and `QWEN3_TTS_URL` (e.g. `curl` health or docs). Without mock, the first time you speak the agent will call the Thinker; if the server is down you’ll see a fetch/network error.

---

## Related

- `src/integrations/qwen3-omni/CLAUDE.md` – Qwen3-Omni integration
- `src/agents/voice-agent/director-mode-setup.ts` – Director Mode session creation
- `apps/web/src/ui/director-console.ui.ts` – Director Console UI
