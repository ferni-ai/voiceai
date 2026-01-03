# Conversation Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The conversation module is the largest subsystem (~26,500 lines) - responsible for making AI conversations feel genuinely human through humanization, emotional tracking, and natural dialogue patterns.

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
├── index.ts                          # Main exports + unified API docs
├── humanizing-config.ts              # All humanization config
│
├── humanization/                     # 🎭 Core humanization (12K+ lines)
│   ├── voice-agent-integration.ts    # Main integration point
│   ├── breathing-sync.ts             # Breath synchronization
│   ├── disfluency-injection.ts       # Natural speech patterns
│   ├── phonetic-mirroring.ts         # Mirror user's speech
│   ├── self-correction.ts            # "I mean..." patterns
│   ├── vocal-fatigue.ts              # Energy modeling
│   ├── emotional-leading.ts          # Guide emotional tone
│   ├── comfort-progression.ts        # Trust building over time
│   └── voice-pattern-learning.ts     # Learn user preferences
│
├── deep-humanization/                # 🧠 Advanced behaviors
│   ├── mood-tracker.ts               # Track emotional state
│   ├── behavior-loader.ts            # Load behavior configs
│   └── generators/                   # Dynamic content generation
│
├── active-listening/                 # 👂 Listening behaviors
│   └── (backchannels, mirroring, silence)
│
├── conversational-memory/            # 💭 Conversation threading
│   └── (callbacks, commitments, context)
│
├── effects/                          # ✨ Audio/visual effects
│
├── eval/                             # 📊 Quality evaluation
│
└── __tests__/                        # Unit tests
```

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **Unified Integration** | `unified-integration.ts` | Session-based API (recommended) |
| **Voice Agent Integration** | `humanization/voice-agent-integration.ts` | Connect to voice agent |
| **Humanizer** | `humanizer.ts` | Main humanization orchestrator |
| **Mood Tracker** | `deep-humanization/mood-tracker.ts` | Emotional state tracking |
| **Config** | `humanizing-config.ts` | All tunable parameters |

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
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
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

## Related Docs

- `docs/architecture/HUMANIZATION-ARCHITECTURE.md` - Full architecture
- `docs/features/VOICE-HUMANIZATION.md` - Feature spec
- `src/agents/CLAUDE.md` - Voice agent integration
- `design-system/docs/brand/BETTER-THAN-HUMAN.md` - EQ philosophy

---

*Last updated: January 2026*
