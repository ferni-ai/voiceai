# Conversation Humanization System

> "Better than human."

This document describes Ferni's conversation humanization architecture - the system that transforms LLM responses into naturally human-feeling conversations.

## Overview

The conversation module (`src/conversation/`) provides 50+ humanization capabilities organized into a unified pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                   createConversationSession()                    │
│                  (Single Entry Point)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            ConversationOrchestrator                       │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Phase 1: ANALYSIS                                        │   │
│  │  └─ Message analysis, signal detection, energy/engagement │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Phase 2: INTELLIGENCE                                    │   │
│  │  └─ Session intelligence, Better-than-Human, mood tracking│   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Phase 3: HUMANIZATION                                    │   │
│  │  └─ Speech naturalization, disfluencies, vocal humanization│  │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Phase 4: OUTPUT                                          │   │
│  │  └─ Apply modifications, generate SSML, compile features  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Voice Agent Integration

```typescript
import {
  initConversationSession,
  humanizeAgentResponse,
  cleanupConversationSession,
} from '../agents/integrations/conversation-session-integration.js';

// 1. Initialize at session start
const session = initConversationSession({
  sessionId: 'session-123',
  userId: 'user-456',
  personaId: 'ferni',
  sessionCount: 5,
  relationshipStage: 'friend',
});

// 2. Humanize each response
const humanized = await humanizeAgentResponse(sessionId, llmResponse, {
  userMessage: lastUserMessage,
  userEmotion: 'anxious',
  topic: 'career',
  wasPersonalSharing: true,
  isSeriousContext: false,
});

// Use humanized.text for plain text, humanized.ssml for TTS
console.log(humanized.appliedFeatures); // ['speech_naturalization', 'vocal_humanization', ...]

// 3. Cleanup at session end
cleanupConversationSession(sessionId);
```

### Direct Unified API

```typescript
import {
  createConversationSession,
  quickHumanize,
} from '../conversation/index.js';

// Full session management
const session = createConversationSession({
  sessionId: 'test-session',
  userId: 'user-123',
  personaId: 'ferni',
});

const result = await session.processTurn({
  userMessage: "I've been struggling with work lately",
  rawResponse: "I hear you. That sounds really challenging.",
  userEmotion: 'stressed',
  topic: 'work',
  wasPersonalSharing: true,
});

// Or quick one-shot humanization
const quick = await quickHumanize("I understand how you feel.", {
  personaId: 'ferni',
  userMessage: "I'm feeling down",
  userEmotion: 'sad',
});
```

## Architecture Layers

### 1. Unified Integration (`unified-integration.ts`)

Single entry point that coordinates all humanization systems:

- **Session Management**: Create, get, end sessions
- **Turn Processing**: Process user messages and humanize responses
- **Event Recording**: Track vulnerability, laughter, breakthroughs

### 2. Conversation Orchestrator (`orchestrator/`)

Four-phase processing pipeline:

| Phase | Purpose | Key Systems |
|-------|---------|-------------|
| **Analysis** | Understand the user | Energy detection, engagement scoring, topic classification |
| **Intelligence** | Gather insights | Session intelligence, Better-than-Human, deep humanization |
| **Humanization** | Transform response | Speech naturalization, disfluencies, vocal humanization |
| **Output** | Final assembly | Apply modifications, generate SSML |

### 3. Deep Humanization (`deep-humanization.ts`)

Mood-aware personality features:

- **Mood Drift**: Energy and engagement tracking over turns
- **Spontaneous Thoughts**: Unprompted observations and musings
- **Physical Presence**: Time-of-day awareness, settling in
- **Mind-Changing**: Acknowledging when user presents compelling input
- **Excitement Interruptions**: Responding to breakthrough moments
- **Breath Sounds**: Natural somatic expressions

### 4. Better-Than-Human (`superhuman/`)

12 superhuman capabilities that make Ferni genuinely better than human support:

| Capability | Description |
|------------|-------------|
| **Emotional Memory** | Track emotional patterns across sessions |
| **Anticipatory Presence** | Know what they need before they say it |
| **Linguistic Mirroring** | Mirror vocabulary and speech patterns |
| **Visible Vulnerability** | Show authentic emotional responses |
| **Spontaneous Delight** | Create unexpected moments of joy |
| **Protective Instincts** | Gently push back on self-criticism |
| **Evolving Inside Jokes** | Build and reference shared humor |
| **Team Coherence** | Maintain consistency across personas |
| **Temporal Emotional** | Understand time-based emotional patterns |
| **Meta-Relationship** | Be aware of the relationship itself |
| **Somatic Presence** | Express through body language in speech |
| **Superhuman Observations** | Notice patterns humans would miss |

### 5. Advanced Humanization (`advanced-humanization.ts`)

10 deep connection capabilities:

| Capability | Purpose |
|------------|---------|
| **Subtext Detection** | Read between the lines |
| **Emotional Aftercare** | Guide back to equilibrium |
| **Conversational Repair** | Recover from miscommunication |
| **Hope Injection** | Subtle forward-looking language |
| **Curiosity Engine** | Genuine interest in their story |
| **Energy Regulation** | Lead vs match energy |
| **Micro-Affirmations** | Tiny validations throughout |
| **Temporal Context** | Life rhythm awareness |
| **Relationship Events** | Track milestones |
| **Paradoxical Intervention** | Know when advice backfires |

### 6. Session Intelligence (`session-intelligence.ts`)

Real-time within-session intelligence:

- **Concern Detection**: Detect distress before explicit mention
- **Proactive Memory**: Surface memories proactively
- **Predictive Anticipation**: Predict emotional needs

## File Structure

```
src/conversation/
├── index.ts                    # Main exports
├── unified-integration.ts      # Single entry point (NEW)
├── humanizer.ts                # Legacy orchestrator
├── deep-humanization.ts        # Mood & personality
├── advanced-humanization.ts    # 10 deep capabilities
├── session-intelligence.ts     # Within-session intelligence
│
├── orchestrator/               # Unified pipeline
│   ├── conversation-orchestrator.ts  # Main orchestrator
│   ├── config-adapter.ts       # Feature toggles
│   ├── metrics.ts              # Performance metrics
│   ├── performance.ts          # Circuit breakers, caching
│   ├── debug.ts                # Profiling & A/B testing
│   └── types.ts                # Type definitions
│
├── superhuman/                 # Better-than-human capabilities
│   ├── orchestrator.ts         # Superhuman orchestrator
│   ├── emotional-memory.ts     # Emotional bonds
│   ├── anticipatory-presence.ts# Anticipation
│   ├── linguistic-mirroring.ts # Speech mirroring
│   └── ... (28 modules)
│
├── humanization/               # Voice-specific humanization
│   ├── voice-agent-integration.ts  # Session lifecycle
│   ├── voice-print.ts          # Voice learning
│   ├── breathing-sync.ts       # Breath synchronization
│   ├── cross-session-voice.ts  # Cross-session memory
│   └── ... (19 modules)
│
├── utils/                      # Shared utilities
│   ├── detection.ts            # Signal detection
│   └── rng.ts                  # Seeded randomness
│
└── __tests__/                  # Test suites
    ├── unified-integration.test.ts  # E2E tests
    ├── humanizer.test.ts
    └── ...
```

## Configuration

### Feature Flags

Control individual features via the config adapter:

```typescript
import { getConfigAdapter } from '../conversation/orchestrator/index.js';

const config = getConfigAdapter();

// Check if a feature is enabled
if (config.getState().speechNaturalization) {
  // Apply speech naturalization
}

// Set persona for persona-specific config
config.setPersona('ferni');
```

### Humanizing Config

Fine-tune humanization parameters:

```typescript
import {
  getHumanizingConfig,
  applyPreset,
  updateHumanizingConfig,
} from '../conversation/index.js';

// Apply a preset
applyPreset('emotional_support');

// Or configure individually
updateHumanizingConfig({
  disfluencyRate: 0.15,
  backchannelRate: 0.3,
  callbackRate: 0.2,
});
```

## Performance

### Circuit Breakers

Prevent cascade failures:

```typescript
import { getCircuitBreaker, getCircuitBreakerStatus } from '../conversation/orchestrator/index.js';

// Check status
const status = getCircuitBreakerStatus('better_than_human');
console.log(status); // { state: 'closed', failures: 0 }
```

### Metrics

Track performance:

```typescript
import { getAggregatedMetrics, logMetricsSummary } from '../conversation/orchestrator/index.js';

const metrics = getAggregatedMetrics();
logMetricsSummary(); // Prints to console
```

### Profiling

Profile orchestration:

```typescript
import { profileOrchestration, createProfiler } from '../conversation/orchestrator/index.js';

const profiler = createProfiler('my-session');
await profiler.profile(async () => {
  // Your code
});
console.log(profiler.getStats());
```

## Testing

Run the test suite:

```bash
# All conversation tests
npm run test -- src/conversation/__tests__/

# Unified integration tests
npm run test -- src/conversation/__tests__/unified-integration.test.ts

# Watch mode
npm run test -- src/conversation/__tests__/ --watch
```

## Migration Guide

### From Legacy Humanizer

**Before (multiple scattered calls):**

```typescript
// In voice-agent.ts
const humanizer = getConversationHumanizer(personaId);
humanizer.setSessionContext(sessionId, userId);
const result = await humanizer.humanizeResponseAsync(text, context);

// In turn-processor.ts
const advancedResult = await processAdvancedHumanization(ctx, analysis, emotion);

// In injection-builders.ts
const session = initAdvancedHumanizationSession(sessionId, userId, config);
```

**After (single unified API):**

```typescript
// At session start
import { initConversationSession } from './integrations/conversation-session-integration.js';
const session = initConversationSession({ sessionId, userId, personaId });

// For each turn
import { humanizeAgentResponse } from './integrations/conversation-session-integration.js';
const result = await humanizeAgentResponse(sessionId, rawResponse, {
  userMessage,
  userEmotion,
  topic,
  wasPersonalSharing,
  isSeriousContext,
});

// At session end
cleanupConversationSession(sessionId);
```

### Gradual Migration

Use the fallback function during migration:

```typescript
import { humanizeWithFallback } from './integrations/conversation-session-integration.js';

// Tries unified session first, falls back to legacy
const result = await humanizeWithFallback(sessionId, rawResponse, {
  ...context,
  personaId,
});
```

## Debugging

### Debug Snapshots

```typescript
import { getDebugSnapshot, logDebugSummary } from '../conversation/orchestrator/index.js';

const snapshot = getDebugSnapshot('session-123');
logDebugSummary('session-123');
```

### A/B Testing

```typescript
import { createABTest, getABTestVariant, getABTestStats } from '../conversation/orchestrator/index.js';

createABTest('new_feature', {
  variants: ['control', 'treatment'],
  weights: [0.5, 0.5],
});

const variant = getABTestVariant('new_feature', 'user-123');
const stats = getABTestStats('new_feature');
```

## Best Practices

### 1. Always Use Sessions

Create a session at the start and clean up at the end:

```typescript
// ✅ Good
const session = initConversationSession({ ... });
try {
  // Process turns
} finally {
  cleanupConversationSession(sessionId);
}

// ❌ Bad - no session management
const result = await quickHumanize(response, context);
```

### 2. Record Events

Track important moments for relationship building:

```typescript
// Vulnerability
if (emotionIntensity > 0.7) {
  recordVulnerabilityEvent(sessionId);
}

// Laughter
if (detectLaughter(userMessage)) {
  recordLaughterEvent(sessionId);
}

// Breakthrough
if (detectBreakthrough(userMessage)) {
  recordBreakthroughEvent(sessionId);
}
```

### 3. Monitor Performance

Watch for slow orchestrations:

```typescript
const result = await session.processTurn(input);

if (result.timing.total > 200) {
  log.warn({ timing: result.timing }, 'Slow humanization');
}
```

### 4. Handle Failures Gracefully

Humanization failures shouldn't break the conversation:

```typescript
try {
  const humanized = await humanizeAgentResponse(sessionId, response, context);
  return humanized?.text ?? response; // Fallback to raw response
} catch (error) {
  log.warn({ error }, 'Humanization failed, using raw response');
  return response;
}
```

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Code quality standards
- [CORE-PRINCIPLES.md](../CORE-PRINCIPLES.md) - Ferni's philosophy
- [TRUST-SYSTEMS.md](./TRUST-SYSTEMS.md) - Trust building systems
- [BETTER-THAN-HUMAN.md](../brand/BETTER-THAN-HUMAN.md) - Better-than-human philosophy

