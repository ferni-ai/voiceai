# 🧠 Personality + Behavior System Deep Integration

> **Making the "Better Than Human" systems talk to each other**

## The Insight

We have **two powerful systems** that are currently operating in parallel:

| System | What It Does | Output |
|--------|--------------|--------|
| **Personality System** | Composes expressions, detects noticings, learns resonance | `PersonalityTurnResult` injected into response |
| **Behavior System** | Detects signals, dispatches events, provides behavior tools | `[SYSTEM_EVENT]` + behavior functions |

**The problem:** They detect many of the same signals but don't share data!

**The solution:** **Unified Signal Detection** with **Dual Output**

---

## Current Architecture (Separate)

```
              ┌─────────────────────────────────────────────────────────────┐
              │                     TURN HANDLER                            │
              └──────────────────────────┬──────────────────────────────────┘
                                         │
           ┌─────────────────────────────┼─────────────────────────────────┐
           │                             │                                 │
           ▼                             ▼                                 ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│   PERSONALITY        │    │   BEHAVIOR EVENT     │    │   EMOTION EVENT      │
│   SYSTEM             │    │   DISPATCHER         │    │   DISPATCHER         │
│                      │    │                      │    │                      │
│ • Detects pauses     │    │ • Detects pauses     │    │ • Detects distress   │
│ • Detects energy     │    │ • Detects silence    │    │ • Detects trajectory │
│ • Detects mismatch   │    │ • Detects tremor     │    │ • Detects mismatch   │
│                      │    │                      │    │                      │
│ OUTPUT:              │    │ OUTPUT:              │    │ OUTPUT:              │
│ noticing +           │    │ [SYSTEM_EVENT] to    │    │ humanization_signal  │
│ expression           │    │ LLM context          │    │ to frontend          │
└──────────────────────┘    └──────────────────────┘    └──────────────────────┘
        │                             │                           │
        │         NO DATA SHARING!    │                           │
        └─────────────────────────────┴───────────────────────────┘
```

**Problems:**
1. Same signals detected multiple times (wasted computation)
2. No coordination between systems
3. Behavior events don't influence personality composition
4. Resonance learning doesn't know about behavior mode

---

## Proposed Architecture (Integrated)

```
              ┌─────────────────────────────────────────────────────────────┐
              │                     TURN HANDLER                            │
              └──────────────────────────┬──────────────────────────────────┘
                                         │
                                         ▼
              ┌─────────────────────────────────────────────────────────────┐
              │                UNIFIED SIGNAL DETECTOR                      │
              │                                                             │
              │  Detects ONCE:                                              │
              │  • Voice signals (tremor, energy, pace)                     │
              │  • Emotional signals (shift, trajectory, distress)          │
              │  • Behavioral signals (pause, silence, mismatch)            │
              │  • Temporal signals (late night, time context)              │
              │                                                             │
              │  Output: UnifiedSignalResult                                │
              └─────────────────────────┬───────────────────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────────┐
        │                               │                                   │
        ▼                               ▼                                   ▼
┌───────────────────┐      ┌───────────────────────┐      ┌───────────────────┐
│   PERSONALITY     │      │   BEHAVIOR            │      │   FRONTEND        │
│   SYSTEM          │◄────►│   SYSTEM              │◄────►│   EQ SYSTEM       │
│                   │      │                       │      │                   │
│ Uses signals for: │      │ Uses signals for:     │      │ Uses signals for: │
│ • Context assembly│      │ • [SYSTEM_EVENT]      │      │ • Avatar state    │
│ • Real-time       │      │ • Behavior function   │      │ • Waveform        │
│   noticing        │      │   suggestions         │      │ • Expressions     │
│ • Expression      │      │ • Mode tracking       │      │                   │
│   composition     │      │                       │      │                   │
│                   │      │                       │      │                   │
│ SHARES:           │      │ SHARES:               │      │ RECEIVES:         │
│ • Current mode    │      │ • Behavior state      │      │ • Mode shifts     │
│ • Should inject?  │      │ • Processing context  │      │ • Resonance FB    │
└───────────────────┘      └───────────────────────┘      └───────────────────┘
        │                               │                           │
        │                               │                           │
        └───────────────────────────────┼───────────────────────────┘
                                        │
                                        ▼
              ┌─────────────────────────────────────────────────────────────┐
              │                   RESONANCE LEARNING                        │
              │                                                             │
              │  Learns from:                                               │
              │  • Expression resonance (existing)                          │
              │  • Noticing resonance (existing)                            │
              │  • Behavior mode resonance (NEW!)                           │
              │  • Frontend avatar resonance (NEW!)                         │
              └─────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### 1. Unified Signal Detection

Create a single module that detects signals ONCE and formats for all consumers:

```typescript
// src/intelligence/unified-signal-detector.ts

export interface UnifiedSignals {
  // Voice signals
  voice: {
    tremorDetected: boolean;
    tremorIntensity: number;
    energyLevel: 'high' | 'medium' | 'low' | 'subdued';
    energyChange: 'rising' | 'falling' | 'stable';
    pace: 'fast' | 'normal' | 'slow' | 'hesitant';
    pauseBeforeMs: number;
  };
  
  // Emotional signals
  emotional: {
    primary: string;
    intensity: number;
    distressLevel: number;
    trajectory: 'rising' | 'falling' | 'stable' | 'volatile';
    mismatchDetected: boolean;
    mismatchType?: string;
  };
  
  // Behavioral signals
  behavioral: {
    significantPause: boolean;
    extendedSilence: boolean;
    topicDeflection: boolean;
    protectiveLanguage: boolean;
    breakthroughMoment: boolean;
  };
  
  // Temporal signals
  temporal: {
    timeOfDay: string;
    isLateNight: boolean;
    hourOfDay: number;
  };
  
  // Computed recommendations
  suggestedMode?: BehaviorMode;
  shouldNotice: boolean;
  noticingPriority: 'immediate' | 'gentle' | 'skip';
}
```

### 2. Personality System Uses Behavior State

When the behavior system shifts mode, personality system should know:

```typescript
// In personality-context-assembler.ts

export async function assemblePersonalityContext(
  input: ContextAssemblerInput,
  behaviorState?: BehaviorState  // NEW!
): Promise<PersonalityContext> {
  // ... existing assembly ...
  
  // NEW: Factor in current behavior mode
  if (behaviorState) {
    // If in 'holding_space' mode, conversation momentum should be 'intimate'
    if (behaviorState.currentMode === 'holding_space') {
      context.conversationMomentum = 'intimate';
      context.isHeavyTopic = true;
    }
    
    // If in 'presence' mode, voice energy is subdued
    if (behaviorState.currentMode === 'presence') {
      context.voiceEnergyLevel = 'subdued';
    }
    
    // If processing, skip personality flourishes
    if (behaviorState.isProcessing) {
      context.skipPersonality = true;
    }
  }
  
  return context;
}
```

### 3. Behavior Events Use Personality Noticings

The behavior system should emit events when personality detects something:

```typescript
// In personality-integration.ts - after detecting noticing

if (noticing && noticing.shouldAcknowledge) {
  // EXISTING: Record for throttling
  recordNoticing(input.sessionId, input.turnCount, noticing.type);
  
  // NEW: Also dispatch as behavior event for LLM awareness
  const behaviorEvent = mapNoticingToBehaviorEvent(noticing);
  if (behaviorEvent) {
    dispatchBehaviorEvent(behaviorEvent, injectLLMMessage);
  }
}

function mapNoticingToBehaviorEvent(noticing: NoticingResult): BehaviorEvent | null {
  const eventMap: Record<NoticingType, BehaviorEventType | null> = {
    'significant_pause': 'extended_silence',
    'energy_drop': 'energy_drop',
    'mismatch': 'emotional_shift',
    'breakthrough_moment': 'breakthrough_moment',
    // ... etc
  };
  
  const eventType = eventMap[noticing.type];
  if (!eventType) return null;
  
  return {
    event: eventType,
    data: {
      noticingType: noticing.type,
      observation: noticing.observation,
      confidence: noticing.confidence,
    },
    timestamp: Date.now(),
    suggestedResponse: {
      mode: noticing.subtlety === 'whisper' ? 'presence' : undefined,
    },
  };
}
```

### 4. Processing Intelligence Uses Personality Building Blocks

Share the expression building blocks:

```typescript
// In processing-intelligence.ts

import { CONNECTORS, SENSORY_FRAGMENTS } from '../personas/bundles/ferni/better-than-human-personality.js';

// Use personality's CONNECTORS.reflection for processing phrases
const PROCESSING_PHRASES: Record<ProcessingType, Record<ProcessingWeight, string[]>> = {
  thinking: {
    light: CONNECTORS.reflection.filter(s => !s.includes('<break')),
    medium: [
      ...CONNECTORS.thought_starting.map(s => s.replace(',', '...')),
      "I'm sitting with that.",
    ],
    heavy: [
      ...SENSORY_FRAGMENTS.voice_noticing.filter(s => s.includes('pause')),
      "That's a lot to hold.",
    ],
  },
  // ... etc
};
```

### 5. Resonance Learning Includes Behavior

Track how user responds to behavior modes:

```typescript
// In personality-resonance-store.ts

export interface UserResonanceProfile {
  // EXISTING
  resonantThemes: ThemeCategory[];
  avoidThemes: ThemeCategory[];
  
  // NEW: Behavior mode resonance
  behaviorModeResonance: {
    preferredModes: BehaviorMode[];  // Modes user responds warmly to
    avoidModes: BehaviorMode[];       // Modes that fell flat
    holdSpaceEffectiveness: number;   // 0-1, does silence help?
    processingTolerance: number;      // 0-1, how patient are they?
  };
}

// Record when user responds positively to a behavior mode
export async function recordBehaviorResonance(
  userId: string,
  mode: BehaviorMode,
  engagement: 'positive' | 'negative' | 'neutral'
): Promise<void> {
  // ... implementation
}
```

### 6. Frontend Feedback Loop

When avatar expresses something and user responds, send feedback:

```typescript
// In apps/web/src/services/behavior-signal.service.ts

// After user responds following a behavior mode shift
export function recordBehaviorFeedback(
  mode: BehaviorMode,
  userResponseType: 'continued' | 'deeper' | 'changed_topic' | 'short_response'
): void {
  const engagement = mapResponseToEngagement(userResponseType);
  
  // Send back to backend for resonance learning
  sendDataMessage('behavior_feedback', {
    mode,
    engagement,
    timestamp: Date.now(),
  });
}
```

---

## Implementation Plan

### Phase 1: Unified Signal Detector (Week 1)

1. Create `src/intelligence/unified-signal-detector.ts`
2. Refactor `realtime-noticing.ts` to use it
3. Refactor `behavior-event-dispatcher.ts` to use it
4. Refactor `emotion-event-dispatcher.ts` to use it

### Phase 2: Cross-System Data Sharing (Week 2)

1. Add `behaviorState` to personality context assembly
2. Add behavior event dispatch from personality noticings
3. Share building blocks between processing-intelligence and better-than-human-personality

### Phase 3: Resonance Integration (Week 3)

1. Add behavior mode tracking to resonance profile
2. Add frontend feedback mechanism
3. Implement `recordBehaviorResonance`

### Phase 4: Tuning (Week 4)

1. A/B test integrated vs. separate systems
2. Tune thresholds for unified detector
3. Calibrate resonance learning weights

---

## Benefits

| Before | After |
|--------|-------|
| 3 systems detect voice tremor separately | 1 detection, 3 consumers |
| Behavior mode doesn't influence personality | Mode shifts update personality context |
| Resonance learning ignores behavior | User preference for modes is learned |
| Processing phrases scattered | Shared building blocks |
| No feedback from avatar expressions | Frontend feeds back user response |

---

## Quick Wins (Implement Today)

### 1. Share Building Blocks

In `processing-intelligence.ts`, import from personality system:

```typescript
import { CONNECTORS } from '../personas/bundles/ferni/better-than-human-personality.js';
```

### 2. Behavior State → Personality Context

Pass behavior state when assembling context (requires small change to turn-handler).

### 3. Noticing → Behavior Event

When personality notices something, also dispatch behavior event.

---

## The Vision

After integration, the systems work as **one unified intelligence**:

```
User: "I'm fine, really." (voice trembling)
                          │
                          ▼
         ┌────────────────────────────────────┐
         │    UNIFIED SIGNAL DETECTION        │
         │                                    │
         │    Detects ONCE:                   │
         │    ✓ Voice tremor (0.7)            │
         │    ✓ Mismatch ("fine" + trembling) │
         │    ✓ Protective language           │
         └────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   PERSONALITY       BEHAVIOR          FRONTEND
                         
   Noticing:         [SYSTEM_EVENT]    Avatar:
   "You said you're  {"event":         enters
   okay, but your    "mismatch"...}    concern
   voice tells a                       mode
   different story." Suggests:
                     shiftMode(
   Expression:       "presence")
   Skip flourishes,
   focus on user.    Processing:
                     Use emotional
                     phrases.
```

All three systems share the same understanding, respond coherently, and learn together.

