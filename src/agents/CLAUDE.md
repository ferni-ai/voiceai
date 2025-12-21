# Voice Agent Development

> **We believe in making AI human, and the decisions we make will reflect that.**

The agents module contains the voice agent implementation - the core of Ferni's real-time voice AI. See `../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## Architecture Level

Agents are at **Level 100** (Application layer) in the clean architecture:

```
Level 100: agents/, api/    ← THIS LAYER
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/
Level 30:  memory/
Level 10:  config/, utils/, types/
```

**Import rules:** Agents can import from any lower level.

---

## Directory Structure

```
agents/
├── voice-agent/           # Main voice agent implementation
│   ├── phases/            # Session lifecycle phases
│   ├── handlers/          # Event handlers
│   └── index.ts           # VoiceAgent class
├── gce/                   # GCE-specific deployment
├── core/                  # Shared agent core
├── processors/            # Turn processing pipeline
├── realtime/              # Real-time streaming
├── integrations/          # Service integrations
├── session/               # Session management
├── handlers/              # Shared handlers
├── shared/                # Shared utilities
├── personas/              # Persona agent wrappers
├── safety/                # Safety guardrails
├── trust/                 # Trust system integration
├── _legacy/               # Deprecated code (do not use)
└── index.ts               # Main exports
```

---

## Key Components

### Voice Agent Entry Point

**File:** `voice-agent-entry.ts` / `index.ts`

The main entry point that initializes the voice agent for a session.

```typescript
import { createVoiceAgent } from './agents/index.js';

const agent = await createVoiceAgent({
  sessionId,
  userId,
  personaId: 'ferni',
  services,
});
```

### Session Phases

Located in `voice-agent/phases/`:

| Phase | File | When |
|-------|------|------|
| `load-persona` | `load-persona.ts` | Load persona bundle |
| `setup-llm` | `setup-llm.ts` | Configure LLM |
| `setup-voice` | `setup-voice.ts` | Configure TTS |
| `build-tools` | `build-tools.ts` | Load persona tools |

### Event Handlers

Located in `voice-agent/`:

| Handler | File | Purpose |
|---------|------|---------|
| Session Init | `session-init-handler.ts` | Initialize session |
| Data Channel | `data-channel-handler.ts` | Handle data messages |
| Cleanup | `cleanup-handler.ts` | Session teardown |

### Turn Processing

**File:** `processors/turn-processor.ts`

Processes each conversation turn:

```
User Speech → Transcription → Context Building → LLM → SSML → TTS → Audio
```

---

## Deployment

### GCE Deployment (Production)

Voice agents run on GCE for WebRTC/UDP support:

```bash
# Deploy via Ferni CLI (ALWAYS use this)
ferni deploy gce

# NEVER use direct gcloud commands
```

See root `CLAUDE.md` for deployment details.

### Local Development

```bash
# Start the voice agent locally
pnpm dev

# With specific persona
pnpm dev -- --persona=ferni
```

---

## Session Lifecycle

1. **Connect** - LiveKit room connection
2. **Load Persona** - Load persona bundle and voice
3. **Setup Tools** - Build tool registry for persona
4. **Greet** - Initial greeting
5. **Conversation Loop** - Turn processing
6. **Cleanup** - Session teardown

### Session Cleanup

**CRITICAL:** Always clean up sessions to prevent memory leaks.

```typescript
import { cleanupSession } from './cleanup-handler.js';

// Called automatically on disconnect
await cleanupSession(sessionId, { reason: 'disconnect' });
```

---

## Context Injection

Context builders inject guidance into each turn:

```typescript
// Context is automatically built before each LLM call
const context = await buildContext({
  persona,
  analysis,
  userData,
  sessionState,
});
```

See `src/intelligence/context-builders/CLAUDE.md` for details.

---

## Tool Execution

Tools are executed during conversation:

```typescript
// Tools are registered per-persona
const tools = await buildToolsForPersona(personaId, {
  userId,
  sessionId,
  services,
});
```

See `src/tools/CLAUDE.md` for tool development.

---

## Error Handling

Voice agents should never crash. Use graceful degradation:

```typescript
try {
  await riskyOperation();
} catch (error) {
  log.error({ error: String(error), sessionId }, 'Operation failed');
  // Fall back to safe behavior
  await safeResponse(sessionId, 'Sorry, something went wrong.');
}
```

---

## Testing

```bash
# Run agent tests
pnpm vitest run src/agents/__tests__/

# E2E tests
pnpm vitest run src/agents/__tests__/e2e/
```

### Test Utilities

See `__tests__/README.md` for test helpers and mock factories.

---

## Rules

### Do
- Use session-scoped state (not module-level)
- Clean up resources on disconnect
- Log with context (sessionId, userId)
- Handle all errors gracefully
- Use the turn processor for responses

### Don't
- Store state in module-level variables
- Skip session cleanup
- Throw unhandled errors
- Bypass the turn processor
- Use `_legacy/` code (deprecated)

---

## Reference Docs

- Deployment: `docs/architecture/GCE-CLEAN-ARCHITECTURE.md`
- Voice Processing: `src/speech/CLAUDE.md`
- Tool Development: `src/tools/CLAUDE.md`
- Context Builders: `src/intelligence/context-builders/CLAUDE.md`

---

*Last updated: December 2024*
