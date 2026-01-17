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
| `index.ts` | Exports |

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
# 1. Stop cloud agent (if running)
gcloud compute ssh voiceai-agent-gce --zone=us-central1-a --command="docker stop \$(docker ps -q)"

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

# Via Ferni CLI
ferni deploy gce  # Deploys with current .env settings
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
| Session connects but no multi-agent | Cloud agent stealing jobs | Stop cloud agent: `gcloud compute ssh voiceai-agent-gce ...` |
| "Participant wait timed out" | Slow network or participant delayed | Timeout extended to 10s for multi-agent mode |
| Handoff fails silently | Banter module not found | Check logs for require() errors |
| No banter during handoff | Banter phrases missing | Check `services/team-engagement/banter.ts` |

---

*Last updated: December 22, 2024*

