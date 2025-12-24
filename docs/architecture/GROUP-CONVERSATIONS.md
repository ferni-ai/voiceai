# Group Conversations Architecture

> "What if Ferni could be in your real conversations?"

This document describes the architecture for multi-participant conversations in Ferni.

## Overview

Group Conversations enable three distinct modes:

| Mode | Participants | Use Case |
|------|--------------|----------|
| **Team Roundtable** | User + multiple Ferni agents | "Brainstorm my career with Ferni, Peter, and Maya" |
| **Conference Call** | User + agent + external people (phone) | "Call my partner - we need to discuss our budget" |
| **Hybrid** | User + agents + external people | "Let's discuss this with Sarah and the whole team" |

## Core Philosophy

This feature embodies our core principles:

1. **Making AI Human** - Natural turn-taking, not robotic interruptions
2. **Serving Relationships** - Facilitate human-to-human connection, don't replace it
3. **Better Than Human** - Perfect recall, emotional awareness, instant expertise

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GroupConversationManager                             │
│                    (Central orchestrator for all group modes)                │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│                     │                     │                                  │
│  ParticipantRegistry│   TurnTakingEngine  │  AttributedTranscriptService    │
│  ┌─────────────────┐│  ┌────────────────┐ │  ┌─────────────────────────────┐│
│  │ Human (user)    ││  │ Silence detect ││  │ Speaker attribution         ││
│  │ Agents (team)   ││  │ Agent scoring  ││  │ Action item extraction      ││
│  │ External (phone)││  │ Balance rules  ││  │ Key moment detection        ││
│  │                 ││  │ Queue mgmt     ││  │ Summary generation          ││
│  └─────────────────┘│  └────────────────┘ │  └─────────────────────────────┘│
├─────────────────────┴─────────────────────┴─────────────────────────────────┤
│                             Conversation Modes                               │
│  ┌───────────────────────────┐    ┌─────────────────────────────────────────┐│
│  │     TeamRoundtable        │    │     ConferenceCallManager               ││
│  │  - Multiple active agents │    │  - Twilio SIP bridge                    ││
│  │  - Domain-based selection │    │  - External participant tracking        ││
│  │  - Moderator coordination │    │  - Call status management               ││
│  │  - Agent-to-agent banter  │    │  - Facilitator mode for agent           ││
│  └───────────────────────────┘    └─────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────────┤
│                             Voice Integration                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  GroupVoiceIntegration                                                  │ │
│  │  - Data channel message handling                                        │ │
│  │  - LiveKit room integration                                             │ │
│  │  - Agent lifecycle management                                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### ParticipantRegistry (`participant-registry.ts`)

Manages all participants in the conversation:

```typescript
const registry = createParticipantRegistry(sessionId);

// Add participants
registry.add(createUserParticipant('user123', 'Seth'));
registry.add(createAgentParticipant('ferni', 'Ferni', 'moderator'));
registry.add(createExternalParticipant('+15551234567', 'call_123', 'Sarah', 'partner'));

// Query participants
const agents = registry.getByType('agent');
const moderator = registry.getModerator();
const externals = registry.getExternalParticipants();
```

### TurnTakingEngine (`turn-taking.ts`)

Intelligent turn management to ensure natural conversation flow:

```typescript
const engine = createTurnTakingEngine(conversation, {
  silenceThresholdMs: 800,
  maxAgentTurnsInRow: 2,
  strategy: 'natural',
});

// Track speaking
engine.onSpeakingStart(participantId);
engine.onSpeakingEnd(participantId);

// Check if agent should respond
if (engine.shouldAgentSpeak(agentId)) {
  // Agent's turn!
}
```

**Turn-Taking Rules:**

1. **Never interrupt humans** - Humans and external people always have priority
2. **Silence threshold** - Wait 800ms+ before agent speaks
3. **Agent balance** - No more than 2 consecutive agent turns without human
4. **Intelligent selection** - Score agents by relevance, quietness, role

### TeamRoundtable (`team-roundtable.ts`)

Multiple Ferni personas active simultaneously:

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
  createAgent: async (personaId, context) => {
    // Return agent with say(), generateResponse(), cleanup()
  },
});

// Moderator opens: "Great, I've got Peter and Maya here..."
// User asks question
// Relevant agents respond based on domain expertise
```

**Agent Selection Logic:**
- Parse addressed agents ("Hey Peter, what do you think?")
- Score relevance based on domain keywords
- Select top 1-2 agents for general questions
- Moderator as fallback when no clear match

### ConferenceCallManager (`conference-call-manager.ts`)

External participants via phone:

```typescript
const conferenceCall = createConferenceCallManager({
  room,
  sessionId,
  userId,
  webhookBaseUrl: 'https://api.ferni.ai',
  agentBehavior: {
    role: 'facilitator',
    speakingMode: 'on_request',
    tracking: { takeNotes: true, trackActionItems: true },
    interjectWhen: { emotionalEscalation: true, directlyAddressed: true },
  },
});

// Add external participant
const result = await conferenceCall.addParticipant({
  phoneNumber: '+15551234567',
  name: 'Sarah',
  relationship: 'partner',
  introduction: "Hi Sarah! You've been added to a conversation about budgets.",
  announceToRoom: true,
});

// Handle call status updates (via Twilio webhook)
conferenceCall.handleCallStatusUpdate(callSid, 'in-progress');
```

**Agent Behavior Modes:**

| Mode | Description |
|------|-------------|
| `facilitator` | Take notes, ask clarifying questions |
| `silent` | Only speak when directly addressed |
| `on_request` | Offer insights when asked |
| `minimal` | Only essential interjections |
| `proactive` | Actively contribute |

### TranscriptService (`transcript-service.ts`)

Attributed transcripts with real-time analysis:

```typescript
const service = createTranscriptService({
  sessionId,
  userId,
  onActionItems: (items) => notifyUser(items),
  onKeyMoment: (moment) => highlightMoment(moment),
});

// Add utterances with attribution
service.addUtterance(speakerId, 'Sarah', 'external', "Let's set a budget of $5000", 1200);

// Get analysis
const actionItems = service.getActionItems();
const keyMoments = service.getKeyMoments();
const summary = await service.generateSummary(participants);
```

## API Endpoints

### Team Roundtable

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/group/roundtable/start` | POST | Start a roundtable session |
| `/api/group/roundtable/end` | POST | End a roundtable session |

### Conference Calls

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/group/call/add` | POST | Add external participant |
| `/api/group/call/remove` | POST | Remove participant |
| `/api/group/call/answer` | GET | TwiML webhook for answered calls |
| `/api/group/call/status` | POST | Twilio status callback |

### Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/group/sessions` | GET | List past sessions |
| `/api/group/sessions/:id` | GET | Get session details |
| `/api/group/sessions/:id/transcript` | GET | Get full transcript |

## Data Channel Protocol

Frontend communicates via LiveKit data channel:

### Start Team Roundtable
```json
{
  "type": "group_roundtable_start",
  "personas": ["ferni", "peter-john", "maya-habits"],
  "topic": "Career planning"
}
```

### Add External Participant
```json
{
  "type": "group_call_add",
  "phoneNumber": "+15551234567",
  "name": "Sarah",
  "relationship": "partner"
}
```

### End Group Conversation
```json
{
  "type": "group_end",
  "reason": "user_request"
}
```

## Firestore Schema

```
bogle_users/{userId}/
  group_sessions/{sessionId}/
    - sessionId: string
    - mode: 'team_roundtable' | 'conference_call' | 'hybrid'
    - status: 'active' | 'ended'
    - topic?: string
    - participants: ParticipantDocument[]
    - startedAt: string (ISO timestamp)
    - endedAt?: string
    - summary?: GroupConversationSummary
    - metrics?: { totalUtterances, utterancesByType, externalCallTimeMs }
    
    transcript/
      full/
        - utterances: UtteranceDocument[]
        - wordCount: number
        - speakerCount: number
    
    action_items/
      {itemId}/
        - text: string
        - assignedTo?: string
        - mentionedBy: string
        - status: 'pending' | 'completed' | 'cancelled'
```

## Frontend Components

### Team Selector Modal
```typescript
showTeamSelector({
  unlockedPersonas: ['ferni', 'peter-john', 'maya-habits'],
  onSelect: (personas, topic) => startRoundtable(personas, topic),
  onCancel: () => {},
});
```

### Add Participant Modal
```typescript
showAddParticipant({
  onAdd: (phone, name, relationship) => addToConference(phone, name, relationship),
  onCancel: () => {},
});
```

### Participant Grid
Shows all participants with speaking indicators.

## Implementation Files

| Component | File |
|-----------|------|
| Types | `src/agents/group-conversation/types.ts` |
| Participant Registry | `src/agents/group-conversation/participant-registry.ts` |
| Turn-Taking Engine | `src/agents/group-conversation/turn-taking.ts` |
| Group Manager | `src/agents/group-conversation/group-conversation-manager.ts` |
| Team Roundtable | `src/agents/group-conversation/team-roundtable.ts` |
| Conference Calls | `src/agents/group-conversation/conference-call-manager.ts` |
| Transcript Service | `src/agents/group-conversation/transcript-service.ts` |
| Voice Integration | `src/agents/group-conversation/voice-integration.ts` |
| API Routes | `src/api/group-conversation-routes.ts` |
| Firestore Service | `src/services/group-conversation-firestore.ts` |
| Frontend UI | `apps/web/src/ui/group-conversation.ui.ts` |
| Tests | `src/agents/group-conversation/__tests__/*.test.ts` |

## Related Documentation

- Multi-agent Orchestrator: `src/agents/multi-agent/CLAUDE.md`
- SIP Bridge: `src/services/outreach/sip-bridge.ts`
- Trust Systems: `src/services/trust-systems/`
- Module README: `src/agents/group-conversation/CLAUDE.md`

---

*Last updated: December 2024*
