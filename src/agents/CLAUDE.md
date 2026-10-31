# Voice Agent Development

> **We believe in making AI human, and the decisions we make will reflect that.**

The agents module contains the voice agent implementation - the core of Ferni's real-time voice AI. See `../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## ✅ Audit Status (December 2024)

| Area | Status | Notes |
|------|--------|-------|
| **Architecture** | ✅ Clean | All imports respect layer levels |
| **Deprecations** | ✅ Cleaned | Removed 6 unused re-export files |
| **Outbound Agent** | ✅ Removed | Deleted - see `docs/architecture/BIDIRECTIONAL-AGENT-ENGAGEMENT.md` |
| **Multi-Agent** | ✅ Complete | E2E tests passing, handoff flow validated |
| **Group Conversation** | ✅ Enhanced | LLM-based summary generation added |
| **Console.log** | ✅ Clean | Only legitimate uses (early-logger, docs) |
| **Circular Deps** | ✅ None | Verified, no circular imports |

### Files Removed (December 2024 Cleanup)
- `agents/realtime/behavior-types.ts` (re-export → use `types/behavior-types.js`)
- `agents/shared/performance/edge-cache.ts` (re-export)
- `agents/shared/performance/turn-profiler.ts` (re-export)
- `agents/shared/performance/tool-response-cache.ts` (re-export)
- `agents/shared/performance/speculative-tts.ts` (re-export)
- `agents/shared/tool-execution-reliability.ts` (re-export)

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
│   └── *-handler.ts       # Event handlers (music, transcript, etc.)
├── multi-agent/           # ✨ Multi-persona sessions (handoffs)
│   ├── orchestrator.ts    # Coordinates persona agents
│   ├── persona-agent-factory.ts
│   └── agent-setup.ts     # LLM/TTS setup per persona
├── group-conversation/    # 🎙️ Multi-participant conversations
│   ├── group-conversation-manager.ts
│   ├── turn-taking.ts     # Turn management
│   └── transcript-service.ts
├── model-provider/        # LLM providers (OpenAI Realtime, Gemini Live)
├── processors/            # Turn processing pipeline (26 files)
├── realtime/              # Real-time streaming events
├── integrations/          # Service integrations
├── session/               # Session state management
├── shared/                # Shared utilities (52+ files, 5 subdirectories)
├── personas/              # Persona agent wrappers
├── safety/                # Crisis guard, safety checks
├── core/                  # Result types, pipeline base
├── gce/                   # GCE-specific (warmup, LiveKit connection)
├── handlers/              # Shared handlers (silence handler)
├── feedback/              # Feedback trigger engine
└── __tests__/             # Test suites
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

### Reply honesty guard

Every reply the model writes passes through `personas/action-claim-guard.ts`
(from `ferni-agent.ts` llmNode) before speech. A sentence that claims a call,
text, booking, reminder or save no tool carried out is dropped, and one honest
line (`honest-line.ts`) or an offer goes in its place. Fail toward honesty,
never toward silence: a dropped claim always leaves words behind.

- What counts as a claim: `action-claims.ts` (done or under way),
  `action-promises.ts` ("I'll text him"), `call-narration.ts` (how a call went),
  `announced-check.ts` ("I checked", "let me look").
- `GROUNDED_CLAIMS` (off by default) ties claims to real state: a call or
  message claim stands only on its tool's run or on evidence in the
  conversation (a call result, or the caller asking about an earlier session),
  "I checked" only on a look-up tool run, "let me look" only on a look-up call
  in the reply, and a "yes, I did" about a call only on its result in the
  conversation (#3003, #3005, #3006). Never deny a real action: a denial that
  offers a duplicate call is worse than the claim. Off, behaviour is exactly
  main's; new claim shapes go behind the flag until verified.
- Evidence is per person and never read from the chat (`claim-evidence.ts`):
  the call records in the store (`on_behalf_calls`, read with
  `getRecentCallResults`, the source callStatus and the openers use), and the
  call or text tools that ran on this call (their arguments name the person).
  Only status `completed` is a call that got through. A claim naming no one is
  about whom the caller just asked about, else about the one person with a
  record; anything else fails closed. Quotes must be in the record's report.
- Extend these modules for a new claim shape; don't add a second guard.

---

## Deployment

### LiveKit Cloud (Production)

The voice agent runs on LiveKit Cloud (`lk agent deploy`). The GCE VM
`voiceai-agent-gce` is terminated. Do not deploy a voice worker to Cloud Run
or GCE — see the current-stack table in root `CLAUDE.md`.

```bash
lk agent deploy
```

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

### Reply guards

Every model reply passes through `personas/ferni-agent.ts` `llmNode`, then
`withActionClaimCheck` (`personas/action-claim-guard.ts`), which runs, in order:
the house facts guard (`house-facts.ts`, `HOUSE_FACTS`, off by default; first, on the
model's own words), the action-claim check and the caller voice guard
(`caller-voice-guard.ts`). Guards read
the stream through `personas/reply-chunks.ts` (`contentOf`, `hasToolCall`); don't
add another copy.

**House facts (#3001).** Ferni's own website, the number texts come from and the
email From address come only from `src/config/house-facts.ts` (LANDING_URL/APP_URL,
TWILIO_PHONE_NUMBER, EMAIL_FROM). With `HOUSE_FACTS=on` the honesty prompt
(`ai-honesty.ts` `withHonesty`) states them, and the guard checks provenance from trusted
sources only, failing closed: every web address, email or phone number Ferni speaks must
be a house fact or appear in the caller's turns or profile, the injected context, or the
output of a first-party tool on `FIRST_PARTY_TOOLS` (stored data and fixed crisis lines; never a tool
whose output echoes the model's arguments). Every helpline in the app's helpline tables (the crisis
tool's, `services/safety/crisis-response`, `life-coaching-shared`) is a house fact: a crisis
resource is never blocked.
Web search, fetched pages, inbound email and texts, invites and any unlisted tool are
untrusted and never ground an address; compared whole, a website by its last label (the
complete IANA root-zone list in `personas/iana-tlds.ts`, punycode, or non-ASCII; refresh
the list when IANA adds endings), after normalising spoken forms
(`personas/spoken-addresses.ts`). A
sentence with an address found only in untrusted output becomes `CANT_VOUCH`; one found
nowhere becomes "I don't have that in front of me." There is no "whose address is it"
parsing. An unset fact is named as unknown, never guessed.

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

---

## Multi-Agent Mode

Enables seamless handoffs between Ferni team members:

```typescript
import { initializeMultiAgentSession } from './multi-agent/multi-agent-entry.js';

const { orchestrator, cleanup } = await initializeMultiAgentSession({
  ctx, room, userParticipant,
  initialPersonaId: 'ferni',
  services, userData, sessionId,
});

// Handle handoff
await orchestrator.handoff({
  targetPersonaId: 'peter-john',
  reason: 'User wants research help',
});
```

See `multi-agent/CLAUDE.md` for details.

---

## Group Conversations

Manages multi-participant sessions (Team Roundtable, Conference Calls):

```typescript
import { createGroupConversation } from './group-conversation/group-conversation-manager.js';

const { conversation, cleanup } = await createGroupConversation({
  room, userParticipant, sessionId, userId,
  mode: 'team_roundtable',
  topic: 'Career planning session',
});

// Add team member
conversation.addTeamMember('peter-john', 'Peter', 'expert');

// Get summary (uses LLM for key points extraction)
const summary = await conversation.getSummary();
```

See `group-conversation/CLAUDE.md` for details.

---

## Reference Docs

- Deployment: `docs/architecture/GCE-CLEAN-ARCHITECTURE.md`
- Multi-Agent: `multi-agent/CLAUDE.md`
- Group Conversation: `group-conversation/CLAUDE.md`
- Voice Processing: `src/speech/CLAUDE.md`
- Pre-STT Audio Enhancement: `docs/architecture/PRE-STT-AUDIO-ENHANCEMENT.md`
- Tool Development: `src/tools/CLAUDE.md`
- Context Builders: `src/intelligence/context-builders/CLAUDE.md`

---

*Last updated: January 2026*
