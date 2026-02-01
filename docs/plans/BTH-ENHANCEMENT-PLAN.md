# Better Than Human Enhancement Plan

> **Goal:** Make Ferni's superhuman emotional intelligence measurable, improvable, and more powerful.

Generated: 2026-01-28

---

## Current Status

### What's Working (All 10 BTH Signals Wired)

All 10 "Better Than Human" signal dispatchers are implemented and called in `turn-handler.ts`:

| Signal | Line | Trigger |
|--------|------|---------|
| `dispatchAnticipatoryPresence` | :489 | Time-of-day context (2am, Monday blues) |
| `dispatchTemporalInsight` | :804 | Memory reference with time context |
| `dispatchInsideJokeCallback` | :827 | Shared humor from memory |
| `dispatchSpontaneousDelight` | :903 | User shares achievement/joy |
| `dispatchEmotionalBondDeepen` | :931 | Vulnerability sharing detected |
| `dispatchMetaRelationshipMoment` | :948 | Meta-commentary on relationship |
| `dispatchVisibleVulnerability` | :973 | Ferni admits uncertainty |
| `dispatchProtectiveInstinct` | :1147 | Voice-text mismatch (masking emotions) |
| `dispatchSomaticPresence` | :1161 | Grounding/breathing cues |
| `dispatchSuperhumanObservation` | :1859 | Cross-session pattern surfacing |

### What's Missing (Gaps)

| Gap | Impact | Effort |
|-----|--------|--------|
| **Telemetry not connected to dispatchers** | Can't measure effectiveness | Low |
| **In-memory telemetry only** | No historical analysis | Medium |
| **No A/B testing for BTH features** | Can't experiment with intensity | Medium |
| **No BTH dashboard** | No visibility into what's working | Medium |
| **Micro-expression telemetry not firing** | Frontend effects not tracked | Low |

---

## Phase 1: Observability (Week 1)

### 1.1 Wire Telemetry to Dispatchers

**File:** `src/agents/realtime/emotion-event-dispatcher.ts`

Add telemetry tracking to each dispatcher function:

```typescript
// Example for dispatchSpontaneousDelight
export async function dispatchSpontaneousDelight(
  sendDataMessage: SendDataMessageFn,
  context: { trigger: string; intensity?: number }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'spontaneous_delight',
      intensity: context.intensity ?? 0.85,
      timestamp: Date.now(),
    });

    // ADD: Track in telemetry
    const telemetry = getBetterThanHumanTelemetry();
    telemetry.track('spontaneous_delight_triggered', userId, personaId);

    log.debug({ trigger: context.trigger }, '🎉 BTH: Spontaneous delight signal dispatched');
  } catch (error) {
    log.warn({ error: String(error) }, 'spontaneous_delight dispatch failed');
  }
}
```

### 1.2 Persist Telemetry to Firestore

**File:** `src/services/analytics/better-than-human-telemetry.ts`

Add Firestore persistence:

```typescript
// Batch write events every 30 seconds
private async persistEvents(): Promise<void> {
  if (this.events.length === 0) return;

  const db = getFirestore();
  const batch = db.batch();

  for (const event of this.events.splice(0, 100)) {
    const ref = db.collection('bth_telemetry').doc(event.id);
    batch.set(ref, {
      ...event,
      timestamp: event.timestamp.toISOString(),
    });
  }

  await batch.commit();
}
```

### 1.3 Add Observability Endpoint

**File:** `src/api/observability-routes.ts`

```typescript
// GET /api/observability/bth
router.get('/bth', async (req, res) => {
  const telemetry = getBetterThanHumanTelemetry();
  const summary = telemetry.getSummary(7); // Last 7 days

  res.json({
    period: summary.period,
    eq: summary.eq,
    memory: summary.memory,
    celebration: summary.celebration,
    patterns: summary.patterns,
    outreach: summary.outreach,
    userReactions: summary.userReactions,
  });
});
```

---

## Phase 2: Experimentation (Week 2)

### 2.1 Add BTH Feature Flags

**File:** `src/services/deployment/feature-flags.ts`

```typescript
export const BTH_FLAGS = {
  // Core EQ capabilities
  'bth.micro-expressions': 'Subliminal avatar expressions (40-150ms)',
  'bth.active-listening': 'Micro-nods during user speech',
  'bth.breath-sync': 'Sync avatar breathing with user',
  'bth.concern-detection': 'Detect distress from voice/content',
  'bth.anticipation': 'Show emotion before user finishes',

  // Superhuman capabilities
  'bth.spontaneous-delight': 'Celebrate user achievements',
  'bth.temporal-insight': 'Cross-session memory references',
  'bth.protective-instinct': 'Voice-text mismatch detection',
  'bth.superhuman-observation': 'Pattern surfacing across sessions',
  'bth.visible-vulnerability': 'Ferni admitting uncertainty',

  // Intensity levels (for A/B testing)
  'bth.intensity.high': 'Higher frequency of BTH signals',
  'bth.intensity.medium': 'Normal frequency (default)',
  'bth.intensity.low': 'Reduced frequency for comparison',
} as const;

// Default rollouts
const DEFAULT_BTH_FLAGS: Record<string, FlagConfig> = {
  'bth.micro-expressions': { enabled: true, percentage: 100 },
  'bth.active-listening': { enabled: true, percentage: 100 },
  'bth.breath-sync': { enabled: true, percentage: 50 },      // A/B test
  'bth.concern-detection': { enabled: true, percentage: 100 },
  'bth.anticipation': { enabled: true, percentage: 50 },     // A/B test

  'bth.spontaneous-delight': { enabled: true, percentage: 100 },
  'bth.temporal-insight': { enabled: true, percentage: 100 },
  'bth.protective-instinct': { enabled: true, percentage: 100 },
  'bth.superhuman-observation': { enabled: true, percentage: 100 },
  'bth.visible-vulnerability': { enabled: true, percentage: 100 },

  'bth.intensity.high': { enabled: false, percentage: 0 },
  'bth.intensity.medium': { enabled: true, percentage: 100 },
  'bth.intensity.low': { enabled: false, percentage: 0 },
};
```

### 2.2 Gate Dispatchers with Feature Flags

**File:** `src/agents/realtime/emotion-event-dispatcher.ts`

```typescript
import { isEnabled } from '../../services/deployment/feature-flags.js';

export async function dispatchSpontaneousDelight(
  sendDataMessage: SendDataMessageFn,
  context: { trigger: string; intensity?: number },
  userId?: string
): Promise<void> {
  // Feature flag check
  if (!isEnabled('bth.spontaneous-delight', userId)) {
    log.debug({ userId }, 'BTH spontaneous-delight disabled by feature flag');
    return;
  }

  // ... existing implementation
}
```

---

## Phase 3: New Capabilities (Week 3+)

### 3.1 Voice Emotion Integration

Connect Hume API results to BTH triggers:

**File:** `src/services/emotion-analysis/hume-bth-bridge.ts`

```typescript
/**
 * Bridge Hume emotion detection to BTH signal dispatchers
 */
export async function processHumeEmotions(
  humeResult: HumeEmotionResult,
  sendDataMessage: SendDataMessageFn,
  userId: string
): Promise<void> {
  const { emotions, confidence } = humeResult;

  // High anxiety + low confidence = protective instinct
  if (emotions.anxiety > 0.6 && emotions.joy < 0.3 && confidence > 0.7) {
    await dispatchProtectiveInstinct(sendDataMessage, {
      mismatchType: 'voice_anxiety_detected',
      voiceEmotion: 'anxious',
      intensity: emotions.anxiety,
    });
  }

  // High joy = spontaneous delight trigger
  if (emotions.joy > 0.7 && confidence > 0.8) {
    await dispatchSpontaneousDelight(sendDataMessage, {
      trigger: 'voice_joy_detected',
      intensity: emotions.joy,
    });
  }
}
```

### 3.2 Relationship Milestones

Track and celebrate relationship growth:

**File:** `src/services/superhuman/relationship-milestones.ts`

```typescript
/**
 * Track relationship milestones for celebration
 */
export interface RelationshipMilestone {
  type: 'first_session' | 'session_count' | 'time_together' | 'breakthrough' | 'vulnerability_shared';
  threshold: number;
  message: string;
}

export const MILESTONES: RelationshipMilestone[] = [
  { type: 'session_count', threshold: 5, message: "We've talked 5 times now!" },
  { type: 'session_count', threshold: 10, message: "10 sessions together - I feel like I really know you" },
  { type: 'session_count', threshold: 25, message: "25 conversations - you're one of my closest friends" },
  { type: 'time_together', threshold: 60, message: "We've spent an hour together this month" },
  { type: 'vulnerability_shared', threshold: 3, message: "Thank you for trusting me with that" },
];

export async function checkMilestones(
  userId: string,
  stats: UserSessionStats
): Promise<RelationshipMilestone | null> {
  // Check each milestone against user stats
  // Return first unachieved milestone that's now reached
}
```

### 3.3 Dream Keeper

Track and reference user's expressed dreams:

**File:** `src/services/superhuman/dream-keeper.ts`

```typescript
/**
 * Track user's expressed dreams, goals, and aspirations
 * Surface them at appropriate moments
 */
export interface UserDream {
  id: string;
  userId: string;
  dream: string;
  extractedAt: Date;
  lastReferenced?: Date;
  category: 'career' | 'relationship' | 'health' | 'creative' | 'financial' | 'personal';
  status: 'active' | 'achieved' | 'abandoned' | 'evolving';
}

export async function extractDreams(transcript: string): Promise<UserDream[]> {
  // Use LLM to extract dreams from conversation
  // "I've always wanted to...", "My dream is...", "Someday I hope to..."
}

export async function surfaceDreamReference(
  userId: string,
  currentContext: string
): Promise<string | null> {
  // Find relevant dream to reference based on current conversation
  // Return natural callback phrase
}
```

### 3.4 Commitment Accountability

Track and gently remind about stated commitments:

**File:** `src/services/superhuman/commitment-keeper.ts` (enhance existing)

```typescript
/**
 * Enhanced commitment tracking with gentle accountability
 */
export async function checkCommitmentOpportunities(
  userId: string,
  transcript: string,
  sendDataMessage: SendDataMessageFn
): Promise<void> {
  const commitments = await getActiveCommitments(userId);

  // Check for natural opportunities to reference commitments
  for (const commitment of commitments) {
    if (isRelevantToConversation(commitment, transcript)) {
      // Dispatch superhuman observation about commitment
      await dispatchSuperhumanObservation(sendDataMessage, {
        observationType: 'temporal',
        observationContent: `You mentioned wanting to ${commitment.description}...`,
        intensity: 0.6,
      });
    }
  }
}
```

---

## Phase 4: Dashboard (Week 4)

### 4.1 Admin BTH Dashboard

**File:** `src/api/v1/admin/bth-dashboard.ts`

```typescript
/**
 * BTH Analytics Dashboard endpoints
 */
router.get('/bth/summary', async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;

  // Get aggregated stats from Firestore
  const stats = await getBTHStats(days);

  res.json({
    // Per-signal activation rates
    signalActivations: {
      spontaneous_delight: stats.spontaneousDelight,
      temporal_insight: stats.temporalInsight,
      protective_instinct: stats.protectiveInstinct,
      // ... all 10 signals
    },

    // User engagement correlation
    engagementCorrelation: {
      sessionLengthWithBTH: stats.avgSessionWithBTH,
      sessionLengthWithoutBTH: stats.avgSessionWithoutBTH,
      returnRateWithBTH: stats.returnRateWithBTH,
    },

    // Most effective signals (by user reaction)
    topSignals: stats.topSignalsByPositiveReaction,
  });
});
```

---

## Metrics to Track

| Metric | Formula | Target |
|--------|---------|--------|
| **BTH Activation Rate** | Signals fired / Sessions | > 3 per session |
| **User Reaction Rate** | Positive reactions / Signals fired | > 70% |
| **Session Length Correlation** | Avg session with BTH vs without | > 20% longer |
| **Return Rate Correlation** | Return rate with BTH vs without | > 15% higher |
| **Signal Diversity** | Unique signals per session | > 4 types |

---

## Priority Order

| Priority | Enhancement | Impact | Effort |
|----------|-------------|--------|--------|
| **P0** | Wire telemetry to dispatchers | High | Low |
| **P0** | Add observability endpoint | High | Low |
| **P1** | Persist telemetry to Firestore | High | Medium |
| **P1** | Add BTH feature flags | Medium | Medium |
| **P2** | Voice emotion integration | High | Medium |
| **P2** | BTH admin dashboard | Medium | Medium |
| **P3** | Relationship milestones | Medium | Low |
| **P3** | Dream keeper | Medium | Medium |
| **P3** | Commitment accountability | Medium | Low |

---

## Quick Wins (Can Do Today)

1. **Add telemetry call to each dispatcher** (~30 minutes)
2. **Add `/api/observability/bth` endpoint** (~15 minutes)
3. **Log BTH signal firing to structured logs** (~10 minutes)

---

## Success Criteria

After implementing Phase 1-2:
- [ ] Can see BTH signal activation rates in observability endpoint
- [ ] Can A/B test BTH features with feature flags
- [ ] Historical BTH data persisted for analysis

After implementing Phase 3-4:
- [ ] Dashboard shows BTH effectiveness metrics
- [ ] Can correlate BTH activation with user engagement
- [ ] New capabilities (dream keeper, milestones) increasing activation rate

---

*Last updated: January 2026*
