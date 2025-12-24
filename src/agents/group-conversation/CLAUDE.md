# Group Conversation Module

> "What if Ferni could be in your real conversations?"

Multi-participant conversations where humans and AI collaborate naturally.

## Overview

This module enables group conversations with multiple participants:

| Mode | Description | Example |
|------|-------------|---------|
| **Team Roundtable** | User + multiple Ferni personas | "Brainstorm my career with Ferni, Peter, and Maya" |
| **Conference Call** | User + agent + external people via phone | "Call my partner - we need to discuss our budget" |
| **Hybrid** | Agents AND external people together | "Let's discuss this with Sarah and the team" |

## Philosophy

> **We believe in making AI human** - and group conversations are where this matters most.

When multiple participants are present, Ferni should:
1. **Listen more than speak** - Facilitate, don't dominate
2. **Remember everything** - Perfect recall for the group
3. **Surface patterns** - Notice what humans miss
4. **Protect emotions** - Intervene when needed
5. **Track commitments** - Note action items automatically

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                    GroupConversationManager                             │
│                    (Central Orchestrator)                               │
├─────────────────┬─────────────────────┬────────────────────────────────┤
│                 │                     │                                │
│  ParticipantRegistry   TurnTakingEngine    AttributedTranscriptService │
│  ┌─────────────┐    ┌───────────────────┐   ┌────────────────────┐    │
│  │ Human       │    │ Silence Detection │   │ Speaker Attribution│    │
│  │ Agents      │    │ Turn Selection    │   │ Action Items       │    │
│  │ External    │    │ Balance Rules     │   │ Key Moments        │    │
│  │ (Phone)     │    │ Priority Scoring  │   │ Export/Summary     │    │
│  └─────────────┘    └───────────────────┘   └────────────────────┘    │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                           Conversation Modes                            │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐   │
│  │   TeamRoundtable    │    │     ConferenceCallManager           │   │
│  │   - Multiple agents │    │     - Twilio SIP bridge             │   │
│  │   - Agent selection │    │     - External participants         │   │
│  │   - Collaboration   │    │     - Call status tracking          │   │
│  └─────────────────────┘    └─────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### types.ts
All TypeScript interfaces and types. Import from here:
```typescript
import type { 
  GroupParticipant, 
  TurnTakingConfig,
  RoundtableConfig,
  AttributedUtterance,
} from './types.js';
```

### participant-registry.ts
Manages who's in the conversation:
```typescript
const registry = createParticipantRegistry(sessionId);
registry.add(createUserParticipant('user123', 'Seth'));
registry.add(createAgentParticipant('ferni', 'Ferni', 'moderator'));
registry.add(createExternalParticipant('+15551234567', 'call_123', 'Sarah', 'partner'));
```

### turn-taking.ts
Manages who speaks when:
```typescript
const turnEngine = createTurnTakingEngine(conversation);

// When someone starts speaking
turnEngine.onSpeakingStart(participantId);

// When they stop
turnEngine.onSpeakingEnd(participantId);

// Check if agent should speak
if (turnEngine.shouldAgentSpeak(agentId)) {
  // Agent can speak now
}
```

### team-roundtable.ts
Manages multiple active agents:
```typescript
const { roundtable, cleanup } = await createTeamRoundtable({
  ctx,
  room,
  userParticipant,
  sessionId,
  userId,
  roundtable: {
    personas: ['ferni', 'peter-john', 'maya-habits'],
    topic: 'Career planning',
    collaborationMode: 'discussion',
    moderator: 'ferni',
  },
  createAgent: async (personaId, context) => { ... },
});
```

### conference-call-manager.ts
Manages external participants via phone:
```typescript
const conferenceCall = createConferenceCallManager({
  room,
  sessionId,
  userId,
  webhookBaseUrl: 'https://api.ferni.ai',
});

await conferenceCall.addParticipant({
  phoneNumber: '+15551234567',
  name: 'Sarah',
  relationship: 'partner',
  announceToRoom: true,
});
```

### transcript-service.ts
Attributed transcripts with analysis:
```typescript
const service = createTranscriptService({
  sessionId,
  userId,
  onActionItems: (items) => console.log('New action items:', items),
  onKeyMoment: (moment) => console.log('Key moment:', moment),
});

service.addUtterance(speakerId, 'Sarah', 'external', "Let's do it!", 1500);

const summary = await service.generateSummary(participants);
```

### voice-integration.ts
Integrates with LiveKit voice agent:
```typescript
const integration = createGroupVoiceIntegration({
  ctx,
  room,
  userParticipant,
  sessionId,
  userId,
  createRoundtableAgent: agentFactory,
});

// Handle data channel messages
const cleanup = setupGroupDataChannelHandler(room, integration);
```

## Implementation Status

| Component | Status | File |
|-----------|--------|------|
| Types | ✅ Done | `types.ts` |
| Participant Registry | ✅ Done | `participant-registry.ts` |
| Turn-Taking Engine | ✅ Done | `turn-taking.ts` |
| Group Conversation Manager | ✅ Done | `group-conversation-manager.ts` |
| Team Roundtable | ✅ Done | `team-roundtable.ts` |
| Conference Call Manager | ✅ Done | `conference-call-manager.ts` |
| Transcript Service | ✅ Done | `transcript-service.ts` |
| Voice Integration | ✅ Done | `voice-integration.ts` |
| API Routes | ✅ Done | `src/api/group-conversation-routes.ts` |
| Firestore Persistence | ✅ Done | `src/services/group-conversation-firestore.ts` |
| Frontend UI | ✅ Done | `apps/web/src/ui/group-conversation.ui.ts` |
| Unit Tests | ✅ Done | `__tests__/*.test.ts` |

## Turn-Taking Rules

The engine uses these rules to ensure natural conversation:

1. **Humans First**: Never interrupt a human or external person
2. **Silence Threshold**: Wait 800ms+ of silence before agent speaks
3. **Agent Balance**: No more than 2 agent turns without a human
4. **Intelligent Selection**: Score agents by:
   - Time since last spoke (quieter agents get priority)
   - Turn count balance (fewer turns = higher priority)
   - Moderator bonus (when conversation needs direction)
   - Queue position (if they requested to speak)

## Agent Behavior in Conference Calls

When external people are on the call, agents behave differently:

| Mode | Behavior |
|------|----------|
| `facilitator` | Takes notes, asks clarifying questions |
| `silent` | Only speaks when directly addressed |
| `on_request` | Offers insights when asked |
| `minimal` | Only essential interjections |
| `proactive` | Actively contributes to discussion |

Interjection triggers:
- `emotionalEscalation` - Detect distress, intervene
- `directlyAddressed` - "Ferni, what do you think?"
- `awkwardSilence` - Long pauses without resolution
- `factualError` - Correct misinformation gently

## API Endpoints

### Team Roundtable
- `POST /api/group/roundtable/start` - Start roundtable
- `POST /api/group/roundtable/end` - End roundtable

### Conference Call
- `POST /api/group/call/add` - Add participant
- `POST /api/group/call/remove` - Remove participant
- `GET /api/group/call/answer` - TwiML webhook

### Sessions
- `GET /api/group/sessions` - List sessions
- `GET /api/group/sessions/:id` - Get session
- `GET /api/group/sessions/:id/transcript` - Get transcript

## Data Channel Messages

Frontend sends these messages to start/control group conversations:

```typescript
// Start team roundtable
{ type: 'group_roundtable_start', personas: ['ferni', 'peter-john'], topic: 'Career' }

// Add external participant
{ type: 'group_call_add', phoneNumber: '+15551234567', name: 'Sarah' }

// End group conversation
{ type: 'group_end', reason: 'user_request' }
```

## Firestore Schema

```
bogle_users/{userId}/
  group_sessions/{sessionId}/
    - sessionId, mode, status, topic
    - participants[]
    - startedAt, endedAt
    - summary?
    transcript/
      full/
        - utterances[]
    action_items/
      {itemId}/
        - text, assignedTo, status
```

## Testing

```bash
# Run group conversation tests
pnpm vitest run src/agents/group-conversation/__tests__/

# Watch mode
pnpm vitest src/agents/group-conversation/
```

## UI Components

### Team Selector Modal
Shows available team members, allows multi-select, topic input.
```typescript
showTeamSelector({
  unlockedPersonas: ['ferni', 'peter-john', 'maya-habits'],
  onSelect: (personas, topic) => { ... },
  onCancel: () => { ... },
});
```

### Add Participant Modal
Phone number input with formatting, name, relationship.
```typescript
showAddParticipant({
  onAdd: (phoneNumber, name, relationship) => { ... },
  onCancel: () => { ... },
});
```

### Participant Grid
Shows all participants with speaking indicators.

## Related Docs

- Multi-agent orchestrator: `src/agents/multi-agent/CLAUDE.md`
- SIP bridge: `src/services/outreach/sip-bridge.ts`
- Trust systems: `src/services/trust-systems/`
- Design system: `apps/web/CLAUDE.md`

---

*Last updated: December 2024*

