# Multi-Agent System

> Natural persona handoffs with real voices

## Overview

The multi-agent system enables multiple persona agents in a single LiveKit room. Each persona has its own:
- **Gemini Session** - Fresh system prompt, no prompt leakage
- **Cartesia TTS** - Real persona voice
- **Handlers** - Full capabilities

## Why Multi-Agent?

The single-agent approach (switching personas mid-session) has fundamental limitations:
- Gemini's `systemInstruction` is locked at session start
- `generateReply(instructions)` adds text as `role: "model"` (causes prompt leakage)
- Context builders can't fully override the LLM's "personality"

**Multi-agent solves this:**
- Each persona has a clean Gemini session
- Handoffs spawn a new agent, not switch contexts
- Both agents can speak during transition (natural banter!)

## Architecture

```
Room
├── DataChannelHandler (room-level)
├── AgentOrchestrator
│   ├── FerniAgent
│   │   ├── Gemini Session (Ferni prompt)
│   │   ├── Cartesia TTS (Ferni voice)
│   │   └── Handlers
│   └── PeterAgent (spawned on handoff)
│       ├── Gemini Session (Peter prompt)
│       ├── Cartesia TTS (Peter voice)
│       └── Handlers
```

## Usage

### Basic Usage

```typescript
import {
  initializeMultiAgentSession,
  handleHandoffFromDataChannel,
} from './multi-agent';

// Initialize in your voice agent entry
const { orchestrator, cleanup } = await initializeMultiAgentSession({
  ctx,
  room,
  userParticipant,
  initialPersonaId: 'ferni',
  services,
  userData,
  sessionId,
});

// Handle handoff requests from UI
room.on('data_received', async (data) => {
  if (data.type === 'handoff_request') {
    await handleHandoffFromDataChannel(
      orchestrator,
      data.target,
      data.reason,
      services
    );
  }
});

// Cleanup on disconnect
await cleanup();
```

### Handoff Flow

```typescript
// User clicks "Peter" in UI

await orchestrator.handoff({
  targetPersonaId: 'peter-john',
  reason: 'User wants research help',
});

// Flow:
// 1. Ferni says goodbye (Ferni's real voice)
// 2. Peter agent spawns with new Gemini session
// 3. Peter greets (Peter's real voice)
// 4. Ferni agent cleanup
```

## Files

| File | Purpose |
|------|---------|
| `orchestrator.ts` | Manages multiple agents, handles handoffs |
| `persona-agent-factory.ts` | Creates agents with full capabilities |
| `agent-setup.ts` | Reusable agent setup (Gemini, TTS, handlers) |
| `multi-agent-entry.ts` | Entry point for multi-agent sessions |
| `greeting-direction.ts` | The hello: what the director is told, and the lines it turns away |
| `first-call-stranger.ts` | A first meeting's hello: no tease, no shared past |
| `unknown-caller-honest.ts` | A caller Ferni can't place: met, never promised memory (`UNKNOWN_CALLER_HONEST`) |
| `unfinished-turn.ts` | Don't answer half a sentence; stop commands commit at once, pause requests wait (`PAUSE_REQUEST_COMMITS_TURN`) |
| `index.ts` | Exports |

## Callers Ferni Can't Place

A caller with no account (`isMemberIdentity` false: an `anon:` id, minted fresh for
every unrecognised call) and no past calls. Nothing is stored for them, and the next
call has a new id, so Ferni starts from nothing every time (#3002).

With `UNKNOWN_CALLER_HONEST=on` (default off):

- **The hello** is a first meeting's (`UNPLACED_GREETING_DIRECTION`): warm, no tease,
  no shared past, and no claim that it is their first call, since it may be their
  fifth. Lines like "speak of the devil" or "I was just thinking about you" are
  turned away for the scripted stranger's hello (#3007).
- **The model's instructions** say nothing from the call is kept and never to promise
  to remember them or follow up. No pitch to sign in: the note is built before anyone
  says their age, and Ferni is 18+, so a caller who sounds under 18 must never be
  steered toward an account (`MINOR_CARE_NOTE` answers for them). A `RETURNING_CALLER`
  lookup keeps a first name and one line for 30 days, and the note says so instead.
- **Call-start awareness** says "you don't know who this is yet", not "first
  conversation" (`firstTalkNote`).

Members (accounts, `phone:`, `device:`, test accounts) and calls Ferni places are
unchanged.

## Stop Commands Commit, Pause Requests Wait

`unfinished-turn.ts` holds a turn that ink-2 left unpunctuated, so Ferni doesn't answer half a sentence.
Two kinds of whole-turn command are special (#2657):

- **Stop commands** ("stop", "can you stop", "stop it/that/talking/the music", "that's enough",
  "be quiet", "pause the music", "turn it off", "shh") commit at once, no flag: something is playing over the caller (prod AJ_JbTguxw4hwRw, the stop came 4.4 s late).
- **Pause requests** ("hold on", "hang on", "wait", and "no wait", "please wait", "can you wait",
  "will you hold on"; and a bare "enough", "quiet", "pause", "pause it") are held like any unpunctuated turn. A caller who says "hold on" usually
  keeps talking ("...let me think about what I want to say"), and the first final arrives alone, so
  committing it made Ferni answer "hold on" in all 14 split-final pairs the #3047 verifier tried
  (Seth, 2026-10-29). Seth's second call, same day: a bare "enough", "quiet" or "pause" waits too,
  because callers go on ("enough about me, how are you", "quiet down, the kids are sleeping",
  "pause for a second while I think"); their clear forms ("that's enough", "be quiet", "pause the
  music") stay stop commands. `PAUSE_REQUEST_COMMITS_TURN=on` (default off) restores #3047's immediate commit.

Keep a new "stop" phrase in `STOP_COMMANDS` only if the caller genuinely wants Ferni silent now; a
phrase the caller tends to follow with more words belongs in `PAUSE_REQUESTS`.

## Integration Status

### ✅ Complete
- AgentOrchestrator - manages multiple agents in room
- PersonaAgentFactory - creates persona agents with correct voice/prompt
- Handoff protocol with banter (goodbye + greeting phrases)
- Context passing to new agent (conversation summary, recent messages)
- Multi-agent entry point (`multi-agent-entry.ts`)
- Feature flag in `voice-agent-entry.ts` (`MULTI_AGENT_MODE=true`)
- Unit tests (`__tests__/orchestrator.test.ts`)
- Frontend integration (handoff_acknowledged, handoff_complete, handoff_failed)
- **Full handler support** - transcript, session state, tool tracking, music handlers per-agent
- **Conversation manager integration** - each agent tracks conversation state

### 🚧 Future Enhancements
- Full turn processor pipeline (context builders run every turn - currently uses basic Gemini)
- A/B testing framework for comparing single-agent vs multi-agent
- Cost optimization - potentially share LLM context between agents

## Testing

```bash
# Run unit tests
pnpm vitest run src/agents/multi-agent/

# Manual E2E testing
# 1. Know what else can take the job: the deployed dev agent on LiveKit Cloud
lk agent status --project ferni-dev --config "$(git rev-parse --show-toplevel)/livekit.toml"

# 2. Start local servers
pnpm token-server &
pnpm ui-server &
cd apps/web && pnpm dev &

# 3. Start voice agent with multi-agent mode
MULTI_AGENT_MODE=true BYPASS_TEAM_UNLOCKS=all pnpm dev

# 4. Open http://localhost:3004/?dev
# 5. Click Connect
# 6. Click persona icons to trigger handoffs
# 7. Verify in logs:
#    - "🎭 Starting multi-agent session"
#    - "🎭 Handoff starting: ferni → peter-john"
#    - "🎭 Handoff complete: ferni → peter-john"
#    - Goodbye in old persona's voice
#    - Greeting in new persona's voice
#    - No prompt leakage (new agent has clean system prompt)
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MULTI_AGENT_MODE` | `false` | Enable multi-agent system |

### Future: Feature Flag

```typescript
// In voice-agent-entry.ts
if (process.env.MULTI_AGENT_MODE === 'true') {
  // Use multi-agent path
  const { orchestrator } = await initializeMultiAgentSession({ ... });
} else {
  // Use existing single-agent path
  const session = new voice.AgentSession({ ... });
}
```

## Full Handler Support (Enabled by Default)

Each persona agent now includes full handler support:

| Handler | Description |
|---------|-------------|
| **Transcript Handler** | Turn processing, emotion detection, memorable moments |
| **Session State Handler** | Silence detection, engagement tracking |
| **Tool Tracking Handler** | Monitors tool usage, sends behavior signals |
| **Music Handler** | Playback control, DJ booth integration |

Enable/disable with `enableFullHandlers` flag:
```typescript
const { orchestrator } = await initializeMultiAgentSession({
  // ...
  enableFullHandlers: true, // default
});
```

## Known Limitations

1. **Startup Time**: Each new agent takes ~2-3 seconds to initialize (Gemini session + TTS + handlers)
2. **Cost**: Two agents briefly overlap during handoff (both running momentarily)
3. **Tools**: Uses existing JSON function calling workaround (all tools available)

## Production Deployment

```bash
# Deploy with multi-agent mode enabled
# Add MULTI_AGENT_MODE=true to .env or deployment config

# LiveKit Cloud: set the flag with lk agent update-secrets, then deploy.
# Gated chain (rooms=0 first): .claude/skills/deploy-agent/SKILL.md
```

## Migration Path

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Complete | Multi-agent module exists |
| 2 | ✅ Complete | Feature flag in voice-agent-entry |
| 3 | 🚧 In Progress | E2E testing and validation |
| 4 | ⏳ Planned | A/B test multi-agent vs single-agent |
| 5 | ⏳ Planned | Full migration to multi-agent |

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Session connects but no multi-agent | A deployed agent took the job | Check `lk agent status` for the project you're testing against |
| "Participant wait timed out" | Slow network or participant delayed | Timeout extended to 10s for multi-agent mode |
| Handoff fails silently | Banter module not found | Check logs for require() errors |
| No banter during handoff | Banter phrases missing | Check `services/team-engagement/banter.ts` |

---

*Last updated: December 22, 2024*

