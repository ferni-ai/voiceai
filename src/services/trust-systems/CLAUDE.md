# Trust Systems

> **Building and maintaining trust through consistent, caring behavior.**

## Architecture Level

Trust Systems is at **Level 60** (Services layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/trust-systems/    ← THIS LAYER
Level 30:  memory/
Level 10:  config/, utils/, types/
```

---

## Overview

Trust systems manage the relationship foundation between Ferni and users:
- Commitment tracking (promises made and kept)
- Boundary memory (topics/actions to avoid)
- Growth reflection (noticing user progress)
- Vulnerability handling (honoring sensitive shares)
- Conversation quality (texture, starters, mirroring)
- Voice-aware intelligence (prosody learning, emotion integration)
- Outreach and proactive engagement

---

## Directory Structure

```
trust-systems/
├── index.ts                     # Main exports
├── persistence.ts               # Core persistence layer
├── unified-persistence.ts       # Unified trust data persistence
├── unified-recorder.ts          # Unified trust signal recording
├── validation.ts                # Trust data validation
├── monitoring.ts                # Trust system monitoring
├── analytics.ts                 # Trust analytics
├── rollout.ts                   # Feature rollout management
│
├── # Commitment & Trust Signals
├── commitment-tracking.ts       # Track user commitments/promises
├── trust-signal-emitter.ts      # Emit trust-building signals
├── thinking-of-you.ts           # Proactive check-in generation
│
├── # Boundary & Memory
├── boundary-memory.ts           # Remember topics/actions to avoid
├── curiosity-memory.ts          # Track user curiosities
├── memory-consolidation.ts      # Consolidate trust memories
├── tonal-memory.ts              # Remember preferred communication tone
│
├── # Growth & Celebration
├── growth-reflection.ts         # Notice and reflect user growth
├── celebration-momentum.ts      # Build celebration patterns
├── small-wins.ts                # Track micro-achievements
├── persona-growth.ts            # Persona relationship growth
│
├── # Vulnerability & Emotional
├── first-time-vulnerability.ts  # Detect first-time vulnerable shares
├── reading-between-lines.ts     # Detect unsaid signals
├── sentiment-timeline.ts        # Track sentiment over time
├── voice-emotion-integration.ts # Voice-based emotion integration
├── voice-aware-detection.ts     # Voice-aware signal detection
│
├── # Conversation Quality
├── conversation-starters.ts     # Context-aware conversation starters
├── conversation-texture.ts      # Add conversational texture/variety
├── linguistic-mirroring.ts      # Mirror user's communication style
├── response-tuning.ts           # Tune response style to user
├── journaling-prompts.ts        # Generate journaling prompts
│
├── # Voice & Learning
├── voice-prosody-learning.ts    # Learn from voice prosody patterns
├── learning-style.ts            # Detect user learning preferences
├── persona-specific-learning.ts # Per-persona learning patterns
│
├── # Relationship Intelligence
├── relationship-health.ts       # Relationship health scoring
├── relationship-insights.ts     # Relationship pattern insights
├── inside-jokes.ts              # Inside joke tracking
├── our-songs.ts                 # Shared song memory
│
├── # Context & Awareness
├── ambient-context.ts           # Ambient trust context injection
├── seasonal-awareness.ts        # Seasonal pattern awareness
├── life-events.ts               # Life event tracking
├── between-session-thinking.ts  # Between-session processing
├── handoff-context.ts           # Trust context for persona handoffs
│
├── # Outreach & Delivery
├── notification-delivery.ts     # Trust-aware notification delivery
├── outreach-integration.ts      # Proactive outreach integration
├── outreach-timing-ml.ts        # ML-based outreach timing
├── media-suggestions.ts         # Media recommendation engine
│
├── # Infrastructure
├── cross-device-sync.ts         # Cross-device trust state sync
│
└── __tests__/                   # Trust system tests
```

**Total: 47 modules**

---

## "Better Than Human" Capabilities

1. **Never forget a commitment** - Perfect recall of promises
2. **Notice growth** - See patterns humans miss
3. **Honor vulnerability** - Recognize first-time shares
4. **Protect boundaries** - Never repeat mistakes
5. **Unsaid signals** - Detect what's not being said
6. **Voice awareness** - Learn from tone, prosody, emotion
7. **Proactive outreach** - ML-timed check-ins

---

## Usage

```typescript
import { buildTrustContext } from './trust-systems/index.js';

const context = buildTrustContext(userId, userText, {
  currentTopic,
  detectedEmotion,
});

// Returns: celebration opportunities, growth reflections,
// unsaid signals, topics to avoid, etc.
```

---

## Testing

```bash
pnpm vitest run src/services/trust-systems/__tests__/
```

---

## Rules

### Do
- Use `unified-persistence.ts` for trust data storage
- Emit trust signals via `trust-signal-emitter.ts`
- Keep detection functions lightweight (<10ms)
- Honor boundary memory in every interaction

### Don't
- Import from agents/ or api/ (architecture violation)
- Store session state in module variables
- Skip vulnerability detection for returning users
- Ignore tone/prosody signals

---

*Last updated: January 2026*
