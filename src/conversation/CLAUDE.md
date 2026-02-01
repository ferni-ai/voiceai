# Conversation Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The conversation module is the largest subsystem (~85,700 lines across 251 files) — responsible for making AI conversations feel genuinely human through humanization, emotional tracking, natural dialogue patterns, and superhuman relationship features.

---

## Architecture Level

```
Level 70: conversation/        ← THIS LAYER (Domain)
         ↓ imports from
Level 60: services/
Level 30: memory/
Level 10: config/, utils/, types/
```

**Import rules:** Conversation can import from services, memory, config, utils. It CANNOT import from agents/ or api/.

---

## Directory Structure

```
conversation/
├── index.ts                          # Main exports + unified API
├── humanizing-config.ts              # All humanization config (20K+)
├── unified-integration.ts            # Session-based unified API
├── constants.ts                      # Module constants
├── interfaces/                       # Clean DI interfaces (1 file)
│
├── humanization/                     # 🎭 Core humanization (32 files)
│   ├── voice-agent-integration/      # Voice agent integration (refactored)
│   ├── disfluency-injection.ts       # Natural speech patterns
│   ├── breathing-sync.ts             # Breath synchronization
│   ├── phonetic-mirroring.ts         # Mirror user's speech
│   ├── self-correction.ts            # "I mean..." patterns
│   ├── vocal-fatigue.ts              # Energy modeling
│   ├── emotional-leading.ts          # Guide emotional tone
│   ├── comfort-progression.ts        # Trust building over time
│   └── voice-pattern-learning.ts     # Learn user preferences
│
├── deep-humanization/                # 🧠 Advanced behaviors (15 files)
│   ├── mood-tracker.ts               # Track emotional state
│   ├── behavior-loader.ts            # Load behavior configs
│   └── generators/                   # Dynamic content generation
│
├── superhuman/                       # ⭐ "Better than Human" features (40 files)
│   ├── orchestrator/                 # Refactored orchestrator (5 files)
│   ├── quote-memory.ts               # Remember user quotes
│   ├── inside-jokes.ts               # Shared humor
│   ├── emotional-forecasting.ts      # Anticipate difficult days
│   └── (see superhuman/CLAUDE.md)    # Full documentation
│
├── effects/                          # ✨ Audio/visual effects (18 files)
│
├── humanizer/                        # Main humanization orchestrator (6 files)
│
├── orchestrator/                     # Conversation orchestration (10 files)
│
├── active-listening/                 # 👂 Listening behaviors (6 files)
│
├── conversational-memory/            # 💭 Conversation threading (8 files)
│
├── emotional-arc/                    # Emotional arc tracking (8 files)
│   └── momentum/                     # Emotional momentum subsystem
│
├── question-patterns/                # Question pattern engine (5 files)
│
├── speech-naturalizer/               # Speech naturalization (5 files)
│
├── concern-detection/                # Concern/distress detection (5 files)
│
├── temporal-context/                 # Temporal context engine (4 files)
│
├── response-mode/                    # Response mode engine (5 files)
│
├── rhythm-intelligence/              # Conversation rhythm (6 files)
│
├── rapport/                          # Rapport building (5 files)
│
├── predictive-anticipation/          # Predictive anticipation (3 files)
│
├── proactive-memory/                 # Proactive memory surfacing (5 files)
│
├── utils/                            # Shared utilities (3 files)
│
├── eval/                             # Quality evaluation (2 files)
│
└── __tests__/                        # Unit tests (11 files)
```

### Root-Level Files (~42 files)

The module also has many standalone root-level `.ts` files for specific conversation features:

| Category | Key Files |
|----------|-----------|
| **Cognitive** | `cognitive-questions.ts`, `self-awareness-loop.ts` |
| **Emotional** | `emotional-aftercare.ts`, `emotional-journey-orchestrator.ts`, `hope-injection.ts` |
| **Speech Flow** | `turn-taking.ts`, `turn-prediction.ts`, `interruption-handler.ts`, `silence-presence.ts` |
| **Content** | `content-delivery-pacing.ts`, `narrative-arc.ts`, `story-timing.ts`, `mid-response-tangents.ts` |
| **Humanization** | `vocal-humanization.ts`, `advanced-humanization.ts`, `humanization-tuning.ts`, `micro-affirmations.ts` |
| **Engagement** | `engagement-scoring.ts`, `curiosity-engine.ts`, `momentum-tracker.ts`, `proactive-starters.ts` |
| **Analysis** | `subtext-detection.ts`, `response-dynamics.ts`, `energy-regulation.ts`, `awareness-metrics.ts` |
| **Repair** | `conversational-repair.ts`, `paradoxical-intervention.ts`, `thinking-phrase-coordinator.ts` |
| **Other** | `conversation-rhythm.ts`, `adaptive-endpointing.ts`, `session-intelligence.ts`, `relationship-events.ts` |

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **Unified Integration** | `unified-integration.ts` | Session-based API (recommended) |
| **Voice Agent Integration** | `humanization/voice-agent-integration/` | Connect to voice agent (10 files) |
| **Humanizer** | `humanizer/` | Main humanization orchestrator (6 files) |
| **Mood Tracker** | `deep-humanization/mood-tracker.ts` | Emotional state tracking |
| **Config** | `humanizing-config.ts` | All tunable parameters |
| **Superhuman Orchestrator** | `superhuman/orchestrator/` | "Better than Human" features (5 files) |

---

## Refactored Modules

Large monolithic files have been split into focused, testable modules:

| Original File | New Module | Files |
|--------------|------------|-------|
| `humanizer.ts` | `humanizer/` | 6 files |
| `concern-detection.ts` | `concern-detection/` | 5 files |
| `question-patterns.ts` | `question-patterns/` | 5 files |
| `temporal-context.ts` | `temporal-context/` | 4 files |
| `emotional-arc.ts` | `emotional-arc/` | 8 files |
| `speech-naturalizer.ts` | `speech-naturalizer/` | 5 files |
| `humanization/voice-agent-integration.ts` | `humanization/voice-agent-integration/` | 10 files |
| `superhuman/orchestrator.ts` | `superhuman/orchestrator/` | 5 files |

Original imports continue to work — some via re-export root files (e.g., `concern-detection.ts`), others via directory `index.ts` resolution (e.g., `humanizer/index.ts`).

### Module Structure Pattern

Each refactored module follows:
```
module-name/
├── types.ts       # Type definitions
├── constants.ts   # Static data / config
├── engine.ts      # Main class implementation
└── index.ts       # Re-exports + singleton/registry
```

### DI Interfaces (`interfaces/index.ts`)

- `IConcernDetector`
- `IEmotionalArcTracker`
- `IQuestionPatternEngine`
- `ITemporalContextEngine`
- `ISpeechNaturalizer`
- `ISessionIntelligence`

---

## Integration Pattern

```typescript
// ✅ CORRECT - Use unified session API
import {
  initConversationSession,
  humanizeAgentResponse,
  cleanupConversationSession,
} from './agents/integrations/conversation-session-integration.js';

// At session start
await initConversationSession({
  sessionId,
  userId,
  personaId,
  voiceId,
});

// For each response
const humanized = await humanizeAgentResponse(sessionId, rawResponse, {
  emotionalContext,
  turnCount,
});

// At session end
await cleanupConversationSession(sessionId);
```

```typescript
// ❌ WRONG - Don't instantiate components directly
import { Humanizer } from './humanizer.js';
const h = new Humanizer(); // No session context!
```

---

## Humanization Techniques

The module implements 20+ humanization techniques:

| Category | Techniques |
|----------|------------|
| **Speech Naturalization** | Disfluency injection, self-correction, hedging, filler words |
| **Voice Patterns** | Breathing sync, vocal fatigue, prosody matching |
| **Emotional** | Mood tracking, emotional leading, comfort progression |
| **Listening** | Backchannels, mirroring, silence handling |
| **Memory** | Callbacks, threading, commitments |

---

## Configuration

All tuning happens in `humanizing-config.ts`:

```typescript
export const HUMANIZATION_CONFIG = {
  disfluency: {
    frequency: 0.15,        // 15% of sentences get disfluencies
    types: ['um', 'uh', 'like', 'you know'],
  },
  breathSync: {
    enabled: true,
    adaptationRate: 0.1,    // How fast to sync
  },
  vocalFatigue: {
    enabled: true,
    threshold: 300,         // seconds before fatigue shows
  },
};
```

---

## Testing

```bash
# Run all conversation tests
pnpm vitest run src/conversation/__tests__/

# Run humanization tests
pnpm vitest run src/conversation/humanization/__tests__/

# Run deep-humanization tests
pnpm vitest run src/conversation/deep-humanization/__tests__/

# Run superhuman tests
pnpm vitest run src/conversation/superhuman/__tests__/
```

---

## Rules

| Do | Don't |
|---|---|
| Use unified session API | Instantiate components directly |
| Configure via `humanizing-config.ts` | Hardcode values in components |
| Clean up sessions on end | Leave sessions orphaned |
| Use session-scoped state | Use global state |
| Test with emotional context | Test in isolation |

---

## Performance Notes

- Humanization adds ~5-15ms per response
- Mood tracking is async (non-blocking)
- Voice pattern learning persists to Firestore
- Session cleanup is automatic via TTL

---

## Subdirectory Documentation

- `superhuman/CLAUDE.md` — "Better than Human" conversational features (40 files)

## Related Docs

- `docs/architecture/HUMANIZATION-ARCHITECTURE.md` - Full architecture
- `docs/features/VOICE-HUMANIZATION.md` - Feature spec
- `src/agents/CLAUDE.md` - Voice agent integration
- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - EQ philosophy

---

*Last updated: January 2026*
