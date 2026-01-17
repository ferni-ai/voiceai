# Better Than Human - Four Superhuman Capabilities

> **"Better than human" isn't arrogance—it's the truth. We offer what humans can't.**

This document describes the four new capabilities that make Ferni genuinely better than a human friend.

---

## Overview

| Capability | What It Does | Human Limitation It Overcomes |
|------------|--------------|------------------------------|
| **Human Expert Transfer** | Warm handoff to professionals | Friends don't know crisis resources |
| **Apple Health Integration** | Know sleep, stress, activity | Friends have to guess |
| **Visual Memory** | Remember every photo shared | Friends forget photos |
| **Ambient Mode** | Know location, time, send nudges | Friends aren't always available |

---

## 1. Human Expert Warm Transfer

> **"Better than human means knowing when to bring in a human."**

### The Problem
- AI life coaching has limits
- Crisis situations need professional help
- Cold referrals ("call 988") feel dismissive
- Users in distress don't want to repeat their story

### The Solution
Ferni detects when professional help is needed and creates **warm handoffs**:
- Full context summary for the professional
- User consent before transfer
- Crisis resources always available
- Gentle suggestions, never pushy

### Architecture

```
src/services/human-transfer/
├── types.ts                 # EscalationType, TransferSummary
├── escalation-classifier.ts # Crisis detection, severity scoring
├── context-summary.ts       # Warm handoff summary generation
├── transfer-flow.ts         # Transfer orchestration
└── index.ts                 # Unified API

src/tools/domains/human-transfer/
└── index.ts                 # LLM tools for transfer
```

### API

```typescript
import { humanTransfer } from './services/human-transfer';

// Check if transfer is needed
const decision = humanTransfer.evaluateTransferNeed(transcript);

if (decision.type !== 'none') {
  // Generate summary for professional
  const summary = await humanTransfer.generateSummary(
    decision.type,
    userProfile,
    conversations
  );

  // Initiate with consent
  const result = await humanTransfer.initiateTransfer({
    userId,
    decision,
    consent: { granted: true },
    summary,
  });
}
```

### Escalation Types

| Type | Severity | Examples |
|------|----------|----------|
| `crisis_immediate` | 9-10 | Suicide ideation, immediate danger |
| `crisis_support` | 7-8 | Self-harm, severe distress |
| `therapy` | 5-6 | Ongoing depression, anxiety |
| `psychiatry` | 5-6 | Medication questions, severe symptoms |
| `legal` | 4-5 | Domestic violence, abuse |
| `medical` | 4-5 | Health concerns requiring doctor |
| `financial` | 3-4 | Debt crisis, bankruptcy |

---

## 2. Apple Health Integration

> **"Better than human means knowing, not guessing."**

### The Problem
- A human friend has to ask "how'd you sleep?"
- They can't see your stress levels
- They don't notice activity changes

### The Solution
Ferni integrates with Apple HealthKit to KNOW:
- Sleep duration and quality
- Heart rate variability (stress)
- Activity and step counts
- Mindfulness minutes
- Workout patterns

### Architecture

```
src/services/health/
├── types.ts              # HealthSummary, HealthContext
├── health-data-store.ts  # Firestore storage + sync
└── index.ts              # Unified API + context injection

apps/ios-native/Sources/Services/
└── HealthKitService.swift  # iOS HealthKit integration
```

### API

```typescript
import { healthService } from './services/health';

// Get health context for LLM injection
const context = await healthService.buildContext(userId);
// → { sleepHours: 5.2, stressLevel: 'high', activityTrend: 'declining' }

// Check if we should mention health
const shouldMention = await healthService.shouldMentionHealth(userId, context);
```

### Privacy First

- **All data sharing is opt-in**
- We store summaries, not raw health records
- User can disable at any time
- Data never leaves Ferni
- Sensitive data (cycle tracking) off by default

### iOS Setup

1. Info.plist has `NSHealthShareUsageDescription`
2. Entitlements include `com.apple.developer.healthkit`
3. `HealthKitService.swift` handles authorization and sync

---

## 3. Visual Memory

> **"Better than human means remembering every photo you share."**

### The Problem
- A human friend forgets photos you showed them
- They can't recall "that dog photo from 6 months ago"
- They don't remember visual details

### The Solution
Ferni remembers every photo:
- Stores and analyzes shared images
- AI-generated descriptions
- Semantic search ("dog photos", "that receipt")
- References photos naturally in conversation

### Architecture

```
src/services/visual-memory/
├── types.ts               # VisualMemory, VisionAnalysisResult
├── vision-analysis.ts     # Google Cloud Vision integration
├── visual-memory-store.ts # Storage + search
└── index.ts               # Unified API + context injection

src/tools/domains/visual-memory/
└── index.ts               # LLM tools (search, recall)

src/servers/api/routes/
└── visual-memory.ts       # REST API endpoints
```

### API

```typescript
import { visualMemory } from './services/visual-memory';

// Upload a photo
const result = await visualMemory.upload({
  userId,
  imageData: base64,
  mimeType: 'image/jpeg',
  source: 'shared_in_chat',
  caption: 'My dog Max',
});

// Search memories
const results = await visualMemory.search({
  userId,
  query: 'dog photos',
});

// Get context for LLM
const context = await visualMemory.buildContext(userId);
```

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/visual-memory/upload` | Upload an image |
| GET | `/api/visual-memory/search?query=...` | Search memories |
| GET | `/api/visual-memory/recent` | List recent photos |
| GET | `/api/visual-memory/:id` | Get specific memory |
| DELETE | `/api/visual-memory/:id` | Delete a memory |
| GET | `/api/visual-memory/preferences` | Get preferences |
| PUT | `/api/visual-memory/preferences` | Update preferences |

### LLM Tools

- `recallVisualMemory` - Search for photos by description
- `describeSharedPhoto` - Get AI description of a photo
- `listRecentPhotos` - Show recent visual memories
- `countVisualMemories` - Count stored photos

---

## 4. Ambient Mode

> **"Better than human means being there even when we're not talking."**

### The Problem
- A human friend isn't always available
- They don't know when you got home
- They can't check in at the right moment
- They miss opportunities to support you

### The Solution
Ferni maintains continuous background presence:
- Knows your location (home/work/gym)
- Knows time of day
- Sends gentle nudges at the right moments
- Respects quiet hours

### Architecture

```
src/services/ambient-mode/
├── types.ts                  # AmbientState, NudgeType
├── ambient-state-manager.ts  # State storage + nudge logic
└── index.ts                  # Unified API + context injection

apps/ios-native/Sources/Services/
└── AmbientModeService.swift  # iOS location + activity

src/servers/api/routes/
└── ambient-mode.ts           # REST API endpoints

src/tools/domains/ambient-mode/
└── index.ts                  # LLM tools
```

### API

```typescript
import { ambientMode } from './services/ambient-mode';

// Handle sync from iOS app
const response = await ambientMode.handleSync(request);

// Get ambient context
const context = await ambientMode.buildContext(userId);
// → { locationType: 'home', timeOfDay: 'evening', lastActivity: 'arrived_home' }

// Evaluate nudge
const evaluation = await ambientMode.evaluateNudge(userId, 'evening_reflection');
// → { shouldSend: true, reason: 'User is home and it's their reflection time' }
```

### Nudge Types

| Type | When | Example |
|------|------|---------|
| `morning_checkin` | Morning after wake | "Good morning! How'd you sleep?" |
| `evening_reflection` | Evening at home | "How was your day?" |
| `post_meeting` | After calendar event | "How'd that meeting go?" |
| `workout_encouragement` | At gym | "Nice! Getting some movement in" |
| `commute_moment` | Traveling | "Got a moment while traveling?" |
| `bedtime_reminder` | Late night | "It's getting late—sleep well?" |
| `weather_related` | Weather change | "Looks like rain—stay cozy" |
| `location_triggered` | Location change | "Welcome back home!" |

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ambient-mode/sync` | Sync from iOS |
| GET | `/api/ambient-mode/state` | Get current state |
| GET | `/api/ambient-mode/context` | Get context for LLM |
| GET | `/api/ambient-mode/preferences` | Get preferences |
| PUT | `/api/ambient-mode/preferences` | Update preferences |
| POST | `/api/ambient-mode/enable` | Enable ambient mode |
| POST | `/api/ambient-mode/disable` | Disable ambient mode |
| POST | `/api/ambient-mode/quiet-hours` | Set quiet hours |

### Privacy First

- Location is coarse (home/work/gym), not exact coordinates
- All tracking is opt-in
- User sets quiet hours
- Nudges are gentle, never pushy
- Battery-efficient background monitoring

---

## Context Injection

All four capabilities inject context into the LLM on every turn:

```typescript
// In turn-processor.ts
const [
  // ... other injections ...
  userHealthInjection,      // Apple Health
  visualMemoryInjection,    // Visual Memory
  ambientModeInjection,     // Ambient Mode
  humanTransferInjection,   // Human Transfer
] = await Promise.all([
  // ... other builders ...
  buildUserHealthInjection(userId),
  buildVisualMemoryInjections(userId),
  buildAmbientModeInjections(userId),
  buildHumanTransferInjections(userText),
]);
```

### Injection Priorities

| Capability | Priority | Notes |
|------------|----------|-------|
| Human Transfer (crisis) | 95 | Safety first |
| Human Transfer (other) | 80-88 | High but not blocking |
| User Health | 76 | Standard awareness |
| Visual Memory | 74 | Memory context |
| Ambient Mode | 72 | Background awareness |

---

## Testing

```bash
# Run all Better Than Human tests
pnpm vitest run src/services/human-transfer/__tests__/
pnpm vitest run src/services/health/__tests__/
pnpm vitest run src/services/visual-memory/__tests__/
pnpm vitest run src/services/ambient-mode/__tests__/
```

---

## Future Enhancements

1. **Wearable Integration** - Apple Watch for real-time stress detection
2. **Calendar Awareness** - Ambient mode knows your schedule
3. **Professional Network** - Verified therapists for warm handoffs
4. **Visual Search** - Find photos by face, location, or scene
5. **Predictive Nudges** - ML-based nudge timing optimization

---

*Created: December 2024*
*Status: Production-ready foundation*

