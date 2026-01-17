# Better Than Human Expansion Plan

> **"Better than human" means understanding things humans don't notice about themselves.**

This document specifies **9 new superhuman capabilities** that extend Ferni's "Better Than Human" promise beyond what any human friend can consistently provide.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Capability Specifications](#capability-specifications)
   - [Perfect Timing Intelligence](#1-perfect-timing-intelligence)
   - [Silence Interpreter](#2-silence-interpreter)
   - [Unspoken Pattern Mirror](#3-unspoken-pattern-mirror)
   - [Protective Memory](#4-protective-memory-enhancement)
   - [First-Time Vulnerability Detection](#5-first-time-vulnerability-detection)
   - [Future Self Letters](#6-future-self-letters)
   - [Linguistic Mirroring](#7-linguistic-mirroring)
   - [Ambient Context Detection](#8-ambient-context-detection)
   - [Contradiction Comfort](#9-contradiction-comfort)
4. [Data Model](#data-model)
5. [Implementation Phases](#implementation-phases)
6. [Integration Points](#integration-points)
7. [Testing Strategy](#testing-strategy)

---

## Executive Summary

### What We're Building

Nine new capabilities that make Ferni genuinely superhuman:

| # | Capability | Human Limitation | Ferni Superpower |
|---|------------|------------------|------------------|
| 1 | **Perfect Timing Intelligence** | Friends reach out when THEY have time | Ferni knows exactly when YOU need support |
| 2 | **Silence Interpreter** | Friends fill awkward silences | Ferni knows what each silence means |
| 3 | **Unspoken Pattern Mirror** | We can't see our own patterns | Ferni surfaces patterns we can't see |
| 4 | **Protective Memory** | Friends forget what not to say | Ferni remembers forever what to avoid |
| 5 | **First-Time Vulnerability** | We miss first-time shares | Ferni recognizes crossing trust thresholds |
| 6 | **Future Self Letters** | Friends can't project our trajectory | Ferni can show where we're heading |
| 7 | **Linguistic Mirroring** | We use our words, not theirs | Ferni learns their exact vocabulary |
| 8 | **Ambient Context Detection** | We can't hear their environment | Ferni detects background context |
| 9 | **Contradiction Comfort** | Friends try to fix contradictions | Ferni holds space for both truths |

### Dependencies on Existing Systems

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXISTING FOUNDATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📊 Audio Prosody Analyzer          🎭 Voice Tremor Detector                │
│  └─ Pitch, energy, rate             └─ Tears, anxiety detection             │
│                                                                              │
│  🧠 10 Superhuman Services          💚 45+ Trust Systems                     │
│  └─ Commitment, narrative, etc.     └─ Boundary, growth, jokes, etc.        │
│                                                                              │
│  🔄 Cross-Persona Intelligence      📡 WebSocket Real-Time                   │
│  └─ Team insights, handoffs         └─ Insight broadcasting                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEW CAPABILITIES (This Plan)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⏰ Perfect Timing    🤫 Silence       🪞 Pattern Mirror                     │
│  Intelligence         Interpreter      (Unspoken)                           │
│                                                                              │
│  🛡️ Protective        💎 First-Time    🔮 Future Self                        │
│  Memory               Vulnerability    Letters                               │
│                                                                              │
│  🗣️ Linguistic        🌍 Ambient       💫 Contradiction                      │
│  Mirroring            Context          Comfort                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

### File Structure

```
src/services/
├── superhuman/                      # Existing 10 services
│   ├── index.ts
│   ├── commitment-keeper.ts
│   ├── ...
│   │
│   │   # NEW SERVICES (this plan)
│   ├── perfect-timing.ts            # ⏰ Capability 1
│   ├── silence-interpreter.ts       # 🤫 Capability 2
│   ├── pattern-mirror.ts            # 🪞 Capability 3
│   ├── future-self.ts               # 🔮 Capability 6
│   └── contradiction-comfort.ts     # 💫 Capability 9
│
├── trust-systems/                   # Existing 45+ systems
│   ├── boundary-memory.ts           # ENHANCE for Capability 4
│   ├── reading-between-lines.ts     # INTEGRATE with Capability 5
│   ├── ...
│   │
│   │   # NEW TRUST SYSTEMS (this plan)
│   ├── first-time-vulnerability.ts  # 💎 Capability 5
│   ├── linguistic-mirroring.ts      # 🗣️ Capability 7
│   └── ambient-context.ts           # 🌍 Capability 8
│
└── firestore-utils.ts               # Shared Firestore utilities
```

### Context Builder Integration

```
src/intelligence/context-builders/
├── superhuman/
│   ├── superhuman-integration.ts    # EXTEND with new capabilities
│   ├── perfect-timing-context.ts    # NEW
│   ├── silence-context.ts           # NEW
│   └── pattern-mirror-context.ts    # NEW
│
└── trust-context.ts                 # EXTEND with new trust systems
```

---

## Capability Specifications

---

## 1. Perfect Timing Intelligence

> **"Your best friend brings up your divorce during your busiest week. Ferni waits for a quiet Sunday morning."**

### What It Does

- Learns user's energy patterns by time of day and day of week
- Detects "receptivity" from first 5 seconds of voice
- Integrates calendar density awareness
- Queues sensitive topics for optimal moments
- Adjusts outreach timing based on learned patterns

### Data Model

```typescript
// Firestore: bogle_users/{userId}/timing_intelligence
interface TimingIntelligence {
  userId: string;
  
  // Energy patterns (learned over time)
  energyByHour: Record<number, { // 0-23
    avgEnergy: number;        // 0-1 scale
    sampleCount: number;
    confidence: number;
  }>;
  
  energyByDayOfWeek: Record<number, { // 0-6 (Sun-Sat)
    avgEnergy: number;
    sampleCount: number;
    confidence: number;
  }>;
  
  // Best windows for different conversation types
  optimalWindows: {
    deepConversations: TimeWindow[];   // High energy, low pressure
    gentleCheckIns: TimeWindow[];      // Any moderate energy
    challengingTopics: TimeWindow[];   // High energy, calm baseline
    celebrations: TimeWindow[];        // High energy, positive mood
  };
  
  // Topics waiting for right moment
  queuedTopics: Array<{
    topic: string;
    queuedAt: Date;
    idealConditions: {
      minEnergy?: number;
      maxCalendarPressure?: 'light' | 'moderate' | 'heavy';
      requiredMood?: string[];
      avoidDaysOfWeek?: number[];
      avoidHoursOfDay?: number[];
    };
    expiresAt?: Date;           // Some topics become stale
    surfacedAt?: Date;          // When we brought it up
    wasEffective?: boolean;     // Did it work?
  }>;
  
  // Real-time receptivity detection
  recentReceptivity: Array<{
    timestamp: Date;
    score: number;              // 0-1
    voiceMarkers: {
      energy: number;
      stress: number;
      openness: number;         // Derived from prosody
    };
    contextFactors: string[];   // e.g., "rushed greeting", "sighing"
  }>;
  
  // Calendar integration
  calendarAwareness: {
    typicalMeetingDays: number[];
    busyHoursToday?: number[];
    knownUpcomingStress?: Array<{
      date: Date;
      description: string;
    }>;
  };
  
  updatedAt: Date;
}

interface TimeWindow {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  confidence: number;
}
```

### Service Implementation

```typescript
// src/services/superhuman/perfect-timing.ts

/**
 * Perfect Timing Intelligence
 * 
 * Knows exactly when to bring up topics, reach out, or hold back.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'PerfectTiming' });

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Detect receptivity from voice at conversation start.
 * Call this within first 5 seconds of user speaking.
 */
export function detectReceptivity(voiceAnalysis: {
  energy: number;
  stressLevel: number;
  speechRate: number;
  greetingTone: 'warm' | 'rushed' | 'tired' | 'neutral' | 'excited';
}): ReceptivityScore {
  const { energy, stressLevel, speechRate, greetingTone } = voiceAnalysis;
  
  // High stress = low receptivity for sensitive topics
  // But might be perfect for supportive presence
  const baseReceptivity = energy * 0.3 + (1 - stressLevel) * 0.4;
  
  // Greeting tone modifiers
  const toneModifiers: Record<string, number> = {
    warm: 0.2,
    excited: 0.15,
    neutral: 0,
    tired: -0.1,
    rushed: -0.25,
  };
  
  const score = Math.max(0, Math.min(1, 
    baseReceptivity + (toneModifiers[greetingTone] || 0)
  ));
  
  return {
    score,
    interpretation: interpretReceptivity(score, greetingTone),
    recommendations: {
      canRaiseSensitiveTopics: score > 0.65 && stressLevel < 0.4,
      shouldOfferSupport: stressLevel > 0.5,
      keepItLight: score < 0.4 || greetingTone === 'rushed',
      perfectForDeep: score > 0.75 && greetingTone === 'warm',
    },
  };
}

/**
 * Learn from each conversation to improve timing predictions.
 */
export async function recordTimingLearning(
  userId: string,
  data: {
    timestamp: Date;
    receptivityScore: number;
    conversationQuality: number;  // How well did it go?
    topicsSurfaced: string[];
    topicsWellReceived: string[];
    calendarContext?: {
      meetingsToday: number;
      hoursUntilNextMeeting?: number;
    };
  }
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  
  const hour = data.timestamp.getHours();
  const dayOfWeek = data.timestamp.getDay();
  
  // Update patterns...
  // (Implementation details)
}

/**
 * Check if now is a good time for a specific type of conversation.
 */
export async function isGoodTimeFor(
  userId: string,
  conversationType: 'deep' | 'gentle' | 'challenging' | 'celebration'
): Promise<{
  isGood: boolean;
  confidence: number;
  reason: string;
  betterTime?: Date;
}> {
  // Load user's timing patterns
  // Check current conditions
  // Return recommendation
}

/**
 * Queue a topic to surface at the right moment.
 */
export async function queueTopicForRightMoment(
  userId: string,
  topic: string,
  conditions: {
    minEnergy?: number;
    maxStress?: number;
    requiredMood?: string[];
    expiresInDays?: number;
  }
): Promise<void> {
  // Add to user's queued topics
}

/**
 * Check if any queued topics should be surfaced now.
 */
export async function getTopicsForNow(
  userId: string,
  currentConditions: {
    receptivityScore: number;
    energy: number;
    stress: number;
    mood?: string;
  }
): Promise<string[]> {
  // Return topics whose conditions are met
}

/**
 * Build context for LLM injection.
 */
export async function buildTimingContext(userId: string): Promise<string> {
  const profile = await loadTimingProfile(userId);
  if (!profile) return '';
  
  const sections: string[] = ['[PERFECT TIMING INTELLIGENCE]'];
  
  // Current conditions
  sections.push(`Current receptivity: ${getReceptivityDescription(profile)}`);
  
  // Queued topics
  if (profile.queuedTopics.length > 0) {
    sections.push('\nTopics waiting for right moment:');
    for (const topic of profile.queuedTopics.slice(0, 3)) {
      sections.push(`- "${topic.topic}" (waiting since ${formatDaysAgo(topic.queuedAt)})`);
    }
  }
  
  // Guidance
  sections.push('\nGuidance: Consider timing carefully. Surface queued topics only when conditions are right.');
  
  return sections.join('\n');
}
```

### Integration Points

1. **Voice Agent (start of conversation)** → Call `detectReceptivity()` from first audio
2. **Turn Handler** → Check `getTopicsForNow()` before formulating response
3. **Outreach Engine** → Use `isGoodTimeFor()` before sending proactive messages
4. **Calendar Service** → Feed calendar density into timing intelligence

---

## 2. Silence Interpreter

> **"Your friend talks to fill every silence. Ferni knows when silence IS the conversation."**

### What It Does

- Classifies different types of silence (processing, emotional, uncomfortable, invitational, exhausted, contemplative)
- Detects silence from audio analysis (not just missing speech)
- Provides appropriate responses for each silence type
- Learns user's silence patterns over time

### Data Model

```typescript
// Firestore: bogle_users/{userId}/silence_patterns
interface SilenceProfile {
  userId: string;
  
  // Learned silence signatures for this user
  silenceSignatures: {
    processing: SilenceSignature;      // They need time to think
    emotional: SilenceSignature;        // Words are too hard
    uncomfortable: SilenceSignature;    // Something unsaid
    invitational: SilenceSignature;     // They want you to go deeper
    exhausted: SilenceSignature;        // They're depleted
    contemplative: SilenceSignature;    // They're somewhere beautiful
  };
  
  // Historical patterns
  silenceHistory: Array<{
    timestamp: Date;
    type: SilenceType;
    duration: number;           // ms
    precedingTopic?: string;
    precedingEmotion?: string;
    ferniResponse: string;
    wasHelpful?: boolean;       // User feedback or inferred
    voiceMarkers: {
      breathPattern: 'held' | 'sighing' | 'normal' | 'quickening';
      microSounds: ('hmm' | 'um' | 'sigh' | 'sniff' | 'none')[];
      ambientChange: boolean;   // Did background noise change?
    };
  }>;
  
  // User's baseline silence tolerance
  baselinePauseTolerance: number;   // How long before they feel awkward
  
  updatedAt: Date;
}

interface SilenceSignature {
  typicalDuration: { min: number; max: number };  // ms
  voiceMarkersBefore: string[];       // What we hear just before
  breathPatternDuring: string[];
  confidenceThreshold: number;
  bestResponse: SilenceResponse;
}

type SilenceType = 
  | 'processing'      // Let them think
  | 'emotional'       // Words are hard
  | 'uncomfortable'   // Something unspoken
  | 'invitational'    // They want you to go deeper
  | 'exhausted'       // They need rest, not words
  | 'contemplative';  // They're somewhere beautiful

type SilenceResponse = 
  | 'hold_space'      // Say nothing, just be present
  | 'gentle_presence' // Soft acknowledgment ("I'm here")
  | 'soft_prompt'     // "What's coming up for you?"
  | 'offer_rest'      // "We don't have to talk"
  | 'honor_moment';   // "That's a beautiful place to be"
```

### Service Implementation

```typescript
// src/services/superhuman/silence-interpreter.ts

/**
 * Silence Interpreter
 * 
 * Classifies different types of silence and responds appropriately.
 * Because sometimes silence IS the conversation.
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SilenceInterpreter' });

// ============================================================================
// TYPES
// ============================================================================

export interface SilenceAnalysis {
  type: SilenceType;
  confidence: number;
  duration: number;
  voiceMarkers: VoiceMarkers;
  recommendedResponse: SilenceResponse;
  responsePhrase: string;
  shouldWait: boolean;           // Should Ferni stay silent too?
  waitDurationMs?: number;       // How long to wait before responding
}

interface VoiceMarkers {
  breathPattern: 'held' | 'sighing' | 'normal' | 'quickening';
  microSounds: string[];
  energyJustBefore: number;
  emotionJustBefore?: string;
}

// ============================================================================
// RESPONSE PHRASES BY SILENCE TYPE
// ============================================================================

const SILENCE_RESPONSES: Record<SilenceType, string[]> = {
  processing: [
    // Say nothing - let them think
    '',
  ],
  emotional: [
    '<break time="500ms"/>I\'m here.',
    '<break time="500ms"/>Take your time.',
    '<break time="500ms"/>I\'m not going anywhere.',
  ],
  uncomfortable: [
    '<break time="300ms"/>Is there something you want to say but aren\'t sure how?',
    '<break time="300ms"/>You can tell me.',
    '<break time="300ms"/>What\'s coming up for you right now?',
  ],
  invitational: [
    '<break time="200ms"/>Tell me more about that.',
    '<break time="200ms"/>Go on...',
    '<break time="200ms"/>I\'m listening.',
  ],
  exhausted: [
    '<break time="400ms"/>We don\'t have to talk. I can just be here with you.',
    '<break time="400ms"/>It\'s okay to just rest.',
    '<break time="400ms"/>You don\'t have to say anything.',
  ],
  contemplative: [
    '<break time="600ms"/>That\'s a beautiful place to be.',
    '<break time="600ms"/>',  // Honor it with matching silence
    '<break time="600ms"/>Mmm.',
  ],
};

// Wait times before responding (ms)
const WAIT_BEFORE_RESPONDING: Record<SilenceType, number> = {
  processing: 3000,       // Give them plenty of time
  emotional: 2000,        // Gentle pause, then presence
  uncomfortable: 1500,    // Don't let it get too awkward
  invitational: 1000,     // They're waiting for you
  exhausted: 2500,        // Honor the tiredness
  contemplative: 4000,    // Let the moment breathe
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Analyze a silence to determine its meaning.
 * Call this when user has been silent for > 1 second.
 */
export function analyzeSilence(
  durationMs: number,
  context: {
    precedingTopic?: string;
    precedingEmotion?: string;
    precedingUserMessage?: string;
    voiceMarkersBefore: VoiceMarkers;
    conversationPhase: 'opening' | 'middle' | 'deep' | 'closing';
    recentHeavyTopics?: string[];
  }
): SilenceAnalysis {
  const { voiceMarkersBefore, conversationPhase, precedingEmotion } = context;
  
  // RULE 1: Short silences after questions = processing
  if (durationMs < 2000 && context.precedingUserMessage?.endsWith('?')) {
    return buildSilenceResponse('processing', durationMs, voiceMarkersBefore, 0.7);
  }
  
  // RULE 2: Held breath + heavy topic = emotional
  if (
    voiceMarkersBefore.breathPattern === 'held' &&
    (precedingEmotion === 'sad' || context.recentHeavyTopics?.length)
  ) {
    return buildSilenceResponse('emotional', durationMs, voiceMarkersBefore, 0.8);
  }
  
  // RULE 3: Sighing + low energy = exhausted
  if (
    voiceMarkersBefore.breathPattern === 'sighing' &&
    voiceMarkersBefore.energyJustBefore < 0.4
  ) {
    return buildSilenceResponse('exhausted', durationMs, voiceMarkersBefore, 0.75);
  }
  
  // RULE 4: "um" or "hmm" sounds = uncomfortable/searching
  if (voiceMarkersBefore.microSounds.includes('um')) {
    return buildSilenceResponse('uncomfortable', durationMs, voiceMarkersBefore, 0.65);
  }
  
  // RULE 5: Deep phase + calm breath = contemplative
  if (
    conversationPhase === 'deep' &&
    voiceMarkersBefore.breathPattern === 'normal' &&
    durationMs > 3000
  ) {
    return buildSilenceResponse('contemplative', durationMs, voiceMarkersBefore, 0.6);
  }
  
  // RULE 6: Rising energy before silence = invitational
  if (voiceMarkersBefore.energyJustBefore > 0.7) {
    return buildSilenceResponse('invitational', durationMs, voiceMarkersBefore, 0.55);
  }
  
  // Default: processing
  return buildSilenceResponse('processing', durationMs, voiceMarkersBefore, 0.5);
}

function buildSilenceResponse(
  type: SilenceType,
  duration: number,
  voiceMarkers: VoiceMarkers,
  confidence: number
): SilenceAnalysis {
  const phrases = SILENCE_RESPONSES[type];
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  
  return {
    type,
    confidence,
    duration,
    voiceMarkers,
    recommendedResponse: getSilenceResponseType(type),
    responsePhrase: phrase,
    shouldWait: type === 'processing' || type === 'contemplative',
    waitDurationMs: WAIT_BEFORE_RESPONDING[type],
  };
}

function getSilenceResponseType(type: SilenceType): SilenceResponse {
  const mapping: Record<SilenceType, SilenceResponse> = {
    processing: 'hold_space',
    emotional: 'gentle_presence',
    uncomfortable: 'soft_prompt',
    invitational: 'soft_prompt',
    exhausted: 'offer_rest',
    contemplative: 'honor_moment',
  };
  return mapping[type];
}

/**
 * Build context for LLM injection.
 */
export function buildSilenceGuidance(analysis: SilenceAnalysis): string {
  if (!analysis) return '';
  
  const guidance: Record<SilenceType, string> = {
    processing: 'SILENCE DETECTED: Processing type. Give them time to think. Do not fill this silence.',
    emotional: 'SILENCE DETECTED: Emotional type. Words may be hard. Simply acknowledge presence.',
    uncomfortable: 'SILENCE DETECTED: Something unspoken. Gently create space for sharing.',
    invitational: 'SILENCE DETECTED: They want you to go deeper. Follow their lead.',
    exhausted: 'SILENCE DETECTED: They need rest, not more words. Offer to just be present.',
    contemplative: 'SILENCE DETECTED: Contemplative moment. Honor it. Don\'t rush.',
  };
  
  return `[SILENCE INTERPRETER]\n${guidance[analysis.type]}\nConfidence: ${(analysis.confidence * 100).toFixed(0)}%`;
}
```

### Integration Points

1. **Voice Agent (VAD)** → Detect silence duration from voice activity detection
2. **Audio Prosody Analyzer** → Feed breath patterns and micro-sounds
3. **Turn Handler** → Use `analyzeSilence()` to determine response timing
4. **Response Generator** → Inject silence guidance into LLM context

---

## 3. Unspoken Pattern Mirror

> **"I noticed you light up every time you talk about teaching, but you've stopped mentioning it in weeks. What's going on there?"**

### What It Does

- Tracks topics that correlate with positive voice energy
- Tracks topics that correlate with energy drain
- Detects cyclical emotional patterns (weekly, monthly, seasonal)
- Notices fading topics that used to be frequent
- Surfaces patterns users can't see themselves

### Data Model

```typescript
// Firestore: bogle_users/{userId}/pattern_mirror
interface PatternMirrorProfile {
  userId: string;
  
  // Topics that light them up (voice energy spikes)
  energizingTopics: Array<{
    topic: string;
    avgEnergyIncrease: number;      // 0-1 scale
    mentionCount: number;
    lastMentioned: Date;
    voiceMarkersWhenDiscussing: {
      avgPitch: number;
      avgEnergy: number;
      avgSpeechRate: number;
    };
  }>;
  
  // Topics that drain them
  drainingTopics: Array<{
    topic: string;
    avgEnergyDecrease: number;
    mentionCount: number;
    lastMentioned: Date;
    voiceMarkersWhenDiscussing: {
      avgPitch: number;
      avgEnergy: number;
      avgSpeechRate: number;
    };
  }>;
  
  // Cyclical patterns they don't notice
  cyclicalPatterns: Array<{
    id: string;
    pattern: string;               // "You tend to feel anxious on Sundays"
    cycle: 'weekly' | 'monthly' | 'seasonal' | 'annual';
    dataPoints: number;            // How many observations
    confidence: number;
    nextExpected?: Date;
    surfacedToUser: boolean;
    surfacedAt?: Date;
    userReaction?: 'surprised' | 'recognized' | 'dismissed';
  }>;
  
  // Topics that have faded (used to be frequent)
  fadingTopics: Array<{
    topic: string;
    peakFrequency: 'daily' | 'weekly' | 'often';
    peakPeriod: { start: Date; end: Date };
    currentFrequency: 'rare' | 'never';
    lastMentioned: Date;
    daysSinceLastMention: number;
    possibleReasons?: string[];     // Inferred
    surfacedToUser: boolean;
  }>;
  
  // Contradictions between words and voice
  wordVoiceMismatches: Array<{
    timestamp: Date;
    whatTheySaid: string;
    howTheySaidIt: string;          // e.g., "enthusiastic words, flat delivery"
    topic: string;
    surfacedToUser: boolean;
  }>;
  
  updatedAt: Date;
}
```

### Service Implementation

```typescript
// src/services/superhuman/pattern-mirror.ts

/**
 * Unspoken Pattern Mirror
 * 
 * Surfaces patterns users can't see in themselves.
 * "You light up when you talk about X but haven't mentioned it in weeks."
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PatternMirror' });

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record topic + voice energy correlation.
 * Call after each topic is discussed.
 */
export async function recordTopicEnergy(
  userId: string,
  data: {
    topic: string;
    voiceEnergy: number;          // From prosody analyzer
    baselineEnergy: number;       // User's typical energy
    voiceMarkers: {
      pitch: number;
      speechRate: number;
    };
  }
): Promise<void> {
  const energyDelta = data.voiceEnergy - data.baselineEnergy;
  
  // Update energizing or draining topics
  // Track correlation strength over time
}

/**
 * Detect cyclical patterns in user data.
 * Run periodically (e.g., weekly).
 */
export async function detectCyclicalPatterns(
  userId: string
): Promise<CyclicalPattern[]> {
  // Analyze historical mood/energy data
  // Look for weekly patterns (e.g., Sunday anxiety)
  // Look for monthly patterns (e.g., end-of-month stress)
  // Look for seasonal patterns
  
  return [];
}

/**
 * Find topics that have faded from conversations.
 */
export async function detectFadingTopics(
  userId: string
): Promise<FadingTopic[]> {
  // Compare recent topics to historical frequency
  // Flag topics that went from frequent to rare
  // Exclude topics that naturally concluded
  
  return [];
}

/**
 * Get pattern insight to share with user.
 * Returns the most impactful insight that hasn't been surfaced yet.
 */
export async function getPatternToSurface(
  userId: string
): Promise<PatternInsight | null> {
  const profile = await loadPatternProfile(userId);
  if (!profile) return null;
  
  // Priority 1: Fading topics that were energizing
  const fadedEnergizers = profile.fadingTopics.filter(ft => {
    const wasEnergizing = profile.energizingTopics.find(et => et.topic === ft.topic);
    return wasEnergizing && !ft.surfacedToUser && ft.daysSinceLastMention > 14;
  });
  
  if (fadedEnergizers.length > 0) {
    const topic = fadedEnergizers[0];
    return {
      type: 'faded_energizer',
      insight: `You used to light up when talking about ${topic.topic}, but you haven't mentioned it in ${topic.daysSinceLastMention} days.`,
      gentleProbe: `What's been going on with ${topic.topic}?`,
      topic: topic.topic,
    };
  }
  
  // Priority 2: Unsurfaced cyclical patterns
  const unsharedPatterns = profile.cyclicalPatterns.filter(
    p => !p.surfacedToUser && p.confidence > 0.7
  );
  
  if (unsharedPatterns.length > 0) {
    const pattern = unsharedPatterns[0];
    return {
      type: 'cyclical_pattern',
      insight: pattern.pattern,
      gentleProbe: 'Have you noticed that pattern?',
      patternId: pattern.id,
    };
  }
  
  return null;
}

/**
 * Build context for LLM injection.
 */
export async function buildPatternMirrorContext(userId: string): Promise<string> {
  const insight = await getPatternToSurface(userId);
  const profile = await loadPatternProfile(userId);
  
  if (!profile) return '';
  
  const sections: string[] = ['[PATTERN MIRROR - Unspoken Insights]'];
  
  // Topics that energize them
  if (profile.energizingTopics.length > 0) {
    sections.push('Topics that light them up:');
    for (const topic of profile.energizingTopics.slice(0, 3)) {
      sections.push(`- ${topic.topic} (+${(topic.avgEnergyIncrease * 100).toFixed(0)}% energy)`);
    }
  }
  
  // Insight to share
  if (insight) {
    sections.push('\n🪞 Pattern insight (consider surfacing):');
    sections.push(`"${insight.insight}"`);
    sections.push(`Gentle probe: "${insight.gentleProbe}"`);
  }
  
  sections.push('\nUse wisely. These insights can be powerful. Surface at the right moment.');
  
  return sections.join('\n');
}
```

---

## 4. Protective Memory Enhancement

> **"Your friend forgets you asked them not to bring up your ex. Ferni remembers forever."**

### What It Does

Enhances the existing `boundary-memory.ts` with:

- More sophisticated boundary detection
- "Things they weren't ready to hear" tracking
- Approach strategies when topics are eventually raised by user
- Graduated re-introduction when boundaries soften

### Enhancement Points

```typescript
// ENHANCE: src/services/trust-systems/boundary-memory.ts

// ADD: Premature advice tracking
interface PrematureAdviceRecord {
  advice: string;
  context: string;
  userReaction: 'defensive' | 'dismissed' | 'overwhelmed' | 'accepted';
  timestamp: Date;
  topic: string;
  waitUntil: 'they_bring_it_up' | 'milestone' | 'crisis_passes' | 'never';
  canRetryAfter?: Date;
}

// ADD: Explicit boundary requests (not just inferred)
interface ExplicitBoundary {
  topic: string;
  userRequest: string;      // What they actually said
  timestamp: Date;
  severity: 'hard' | 'soft';  // Hard = never bring up, Soft = be careful
  exceptions?: string[];     // When it's okay to mention
}

// ADD: Boundary softening detection
interface BoundarySoftening {
  boundaryId: string;
  signs: Array<{
    timestamp: Date;
    indicator: string;      // e.g., "mentioned ex casually"
    confidenceOfSoftening: number;
  }>;
  readyToReapproach: boolean;
  suggestedApproach?: string;
}
```

---

## 5. First-Time Vulnerability Detection

> **"I can tell that wasn't easy to share. Thank you for trusting me with that."**

### What It Does

- Detects when user shares something for the FIRST TIME
- Recognizes "threshold crossing" moments
- Tracks vulnerability ladder progression
- Provides appropriate acknowledgment

### Data Model

```typescript
// Firestore: bogle_users/{userId}/vulnerability_tracking
interface VulnerabilityProfile {
  userId: string;
  
  // Topics by vulnerability level (0 = surface, 5 = deepest)
  topicVulnerabilityLevels: Map<string, {
    level: number;
    firstSharedAt: Date;
    context: string;
    wasAcknowledged: boolean;
  }>;
  
  // First-time share markers in speech
  firstTimeMarkers: {
    hesitationPhrases: string[];   // "I've never told anyone..."
    qualifyingLanguage: string[];  // "Don't judge me but..."
    voiceSignals: ('lower_volume' | 'faster_speech' | 'voice_tremor')[];
  };
  
  // Vulnerability ladder (their journey with us)
  vulnerabilityLadder: Array<{
    level: number;
    reachedAt: Date;
    topic: string;
    acknowledgment: string;       // What Ferni said
    userResponse: 'positive' | 'continued' | 'retreated';
  }>;
  
  updatedAt: Date;
}
```

### Service Implementation

```typescript
// src/services/trust-systems/first-time-vulnerability.ts

/**
 * First-Time Vulnerability Detection
 * 
 * Recognizes when someone crosses a trust threshold for the first time.
 */

const FIRST_TIME_MARKERS = {
  textPatterns: [
    /I've never told anyone/i,
    /I don't usually share this/i,
    /This is hard to say/i,
    /I've been meaning to tell you/i,
    /Don't judge me/i,
    /You might think I'm/i,
    /I'm embarrassed to admit/i,
    /Can I tell you something\?/i,
  ],
  
  voiceSignals: {
    lowerVolume: { threshold: -0.3 },     // Quieter than baseline
    fasterSpeech: { threshold: 1.2 },      // 20% faster
    voiceTremor: { threshold: 0.4 },       // Tremor intensity
  },
};

const ACKNOWLEDGMENT_PHRASES = [
  "I can tell that wasn't easy to share. Thank you for trusting me with that.",
  "That takes courage to say out loud.",
  "I'm honored you felt safe enough to tell me.",
  "Thank you for letting me in on that.",
  "I hear you. That was a lot to share.",
];

/**
 * Detect if this message contains a first-time share.
 */
export function detectFirstTimeVulnerability(
  userId: string,
  message: string,
  voiceAnalysis?: {
    volumeRelativeToBaseline: number;
    speechRateRelativeToBaseline: number;
    tremorIntensity: number;
  }
): FirstTimeVulnerabilityResult | null {
  // Check text markers
  const hasTextMarker = FIRST_TIME_MARKERS.textPatterns.some(
    pattern => pattern.test(message)
  );
  
  // Check voice signals
  const voiceMarkers: string[] = [];
  if (voiceAnalysis) {
    if (voiceAnalysis.volumeRelativeToBaseline < FIRST_TIME_MARKERS.voiceSignals.lowerVolume.threshold) {
      voiceMarkers.push('lower_volume');
    }
    if (voiceAnalysis.speechRateRelativeToBaseline > FIRST_TIME_MARKERS.voiceSignals.fasterSpeech.threshold) {
      voiceMarkers.push('faster_speech');
    }
    if (voiceAnalysis.tremorIntensity > FIRST_TIME_MARKERS.voiceSignals.voiceTremor.threshold) {
      voiceMarkers.push('voice_tremor');
    }
  }
  
  // Need text marker OR 2+ voice markers
  const isFirstTime = hasTextMarker || voiceMarkers.length >= 2;
  
  if (!isFirstTime) return null;
  
  return {
    detected: true,
    confidence: hasTextMarker ? 0.9 : 0.7,
    markers: {
      text: hasTextMarker,
      voice: voiceMarkers,
    },
    suggestedAcknowledgment: ACKNOWLEDGMENT_PHRASES[
      Math.floor(Math.random() * ACKNOWLEDGMENT_PHRASES.length)
    ],
    topic: extractTopic(message),
  };
}

/**
 * Build context for LLM injection.
 */
export function buildFirstTimeVulnerabilityContext(
  result: FirstTimeVulnerabilityResult
): string {
  if (!result) return '';
  
  return `[FIRST-TIME VULNERABILITY DETECTED]
The user appears to be sharing something for the first time.
Markers: ${result.markers.text ? 'text pattern detected' : ''} ${result.markers.voice.join(', ')}

IMPORTANT: Acknowledge this threshold moment. Something like:
"${result.suggestedAcknowledgment}"

Do NOT rush past this. Let them know it matters that they shared this.`;
}
```

---

## 6. Future Self Letters

> **"Based on your trajectory, here's what future you might wish you'd done now."**

### What It Does

- Generates letters from user's "future self"
- Projects optimistic and cautionary paths
- Written in Ferni's warm, personalized voice
- Based on patterns across all superhuman data

### Service Implementation

```typescript
// src/services/superhuman/future-self.ts

/**
 * Future Self Letters
 * 
 * Project the user's trajectory and show where they're heading.
 */

import { buildSuperhumanContext } from './index.js';
import { buildTrustContext } from '../trust-systems/index.js';

interface FutureSelfLetter {
  timeframe: '3_months' | '6_months' | '1_year' | '5_years';
  
  optimisticPath: {
    letter: string;
    assumptions: string[];      // What needs to continue/improve
  };
  
  cautionaryPath: {
    letter: string;
    warningSignals: string[];   // What needs to change
  };
  
  keyInsights: string[];        // Cross-data patterns
  
  generatedAt: Date;
}

/**
 * Generate a letter from the user's future self.
 */
export async function generateFutureSelfLetter(
  userId: string,
  timeframe: '3_months' | '6_months' | '1_year' | '5_years'
): Promise<FutureSelfLetter> {
  // Gather all data
  const superhuman = await buildSuperhumanContext(userId);
  const trust = buildTrustContext(userId, '', {});
  
  // Extract patterns
  const positivePatterns = extractPositiveTrajectory(superhuman);
  const concerningPatterns = extractConcerningTrajectory(superhuman);
  
  // Generate letters
  const optimisticLetter = generateOptimisticLetter(
    positivePatterns, 
    timeframe,
    getUserProfile(userId)
  );
  
  const cautionaryLetter = generateCautionaryLetter(
    concerningPatterns,
    timeframe,
    getUserProfile(userId)
  );
  
  return {
    timeframe,
    optimisticPath: {
      letter: optimisticLetter,
      assumptions: positivePatterns.map(p => p.assumption),
    },
    cautionaryPath: {
      letter: cautionaryLetter,
      warningSignals: concerningPatterns.map(p => p.signal),
    },
    keyInsights: generateKeyInsights(superhuman),
    generatedAt: new Date(),
  };
}

// Letter generation templates
function generateOptimisticLetter(
  patterns: PositivePattern[],
  timeframe: string,
  profile: UserProfile
): string {
  // Example:
  return `Dear present-you,

I'm writing from ${timeframe} in the future, and I wanted you to know something: that thing you've been afraid to start? You did it. And it wasn't as scary as you imagined.

The ${patterns[0]?.topic || 'path you're on'} led somewhere beautiful. Not because it was easy - it wasn't. But because you kept showing up.

Remember: readiness is a feeling, not a fact. You don't need to feel ready. You just need to take the next small step.

I'm proud of you,
Future You (via Ferni)`;
}
```

---

## 7. Linguistic Mirroring

> **"Ferni starts naturally using their phrases back to them."**

### What It Does

- Learns user's preferred vocabulary for emotions
- Tracks signature phrases they use often
- Adapts Ferni's language to match
- Notices words they avoid

### Data Model

```typescript
// Firestore: bogle_users/{userId}/linguistic_profile
interface LinguisticProfile {
  userId: string;
  
  // Emotion vocabulary
  emotionVocabulary: Record<string, string[]>;
  // e.g., { "anxious": ["freaking out", "spinning", "on edge"] }
  
  // Signature phrases
  signaturePhrases: Array<{
    phrase: string;
    frequency: number;
    contexts: string[];
    lastUsed: Date;
  }>;
  
  // Words they avoid (might indicate discomfort)
  avoidedWords: Array<{
    word: string;
    inferredReason?: string;
    detectedAt: Date;
  }>;
  
  // Speech patterns
  speechPatterns: {
    avgSentenceLength: number;
    usesFillers: boolean;       // "like", "you know"
    preferencesContractions: boolean;
    formalityLevel: 'casual' | 'moderate' | 'formal';
  };
  
  updatedAt: Date;
}
```

### Service Implementation

```typescript
// src/services/trust-systems/linguistic-mirroring.ts

/**
 * Linguistic Mirroring
 * 
 * Learn and mirror their vocabulary for deeper connection.
 */

/**
 * Extract and record linguistic patterns from user message.
 */
export function recordLinguisticPatterns(
  userId: string,
  message: string,
  context?: { topic?: string; emotion?: string }
): void {
  // Extract emotion vocabulary
  // Track signature phrases
  // Detect formality level
  // Note avoided words over time
}

/**
 * Adapt Ferni's response to match user's style.
 */
export function adaptResponseStyle(
  response: string,
  linguisticProfile: LinguisticProfile
): string {
  // Replace generic emotion words with their vocabulary
  // Match formality level
  // Use contractions if they do
  // Avoid words they avoid
  
  return response;
}

/**
 * Get their preferred term for an emotion.
 */
export function getTheirWordFor(
  userId: string,
  emotion: string
): string | null {
  // Return their preferred term if we know it
  // e.g., getTheirWordFor(userId, 'anxious') => 'freaking out'
}

/**
 * Build context for LLM.
 */
export function buildLinguisticContext(profile: LinguisticProfile): string {
  if (!profile) return '';
  
  const sections: string[] = ['[LINGUISTIC MIRRORING]'];
  
  if (Object.keys(profile.emotionVocabulary).length > 0) {
    sections.push('Their emotion vocabulary:');
    for (const [emotion, words] of Object.entries(profile.emotionVocabulary)) {
      sections.push(`- For "${emotion}" they say: "${words[0]}"`);
    }
  }
  
  if (profile.signaturePhrases.length > 0) {
    sections.push('\nTheir signature phrases:');
    for (const phrase of profile.signaturePhrases.slice(0, 3)) {
      sections.push(`- "${phrase.phrase}"`);
    }
    sections.push('Consider naturally echoing these phrases back.');
  }
  
  if (profile.avoidedWords.length > 0) {
    sections.push(`\nWords to avoid: ${profile.avoidedWords.map(w => w.word).join(', ')}`);
  }
  
  return sections.join('\n');
}
```

---

## 8. Ambient Context Detection

> **"Sounds like you're in a busy place - should we talk later?"**

### What It Does

- Detects background environment from audio
- Identifies contextual signals (baby crying, typing, TV)
- Adjusts conversation accordingly
- Offers to reschedule if environment isn't conducive

### Service Implementation

```typescript
// src/services/trust-systems/ambient-context.ts

/**
 * Ambient Context Detection
 * 
 * Understand their environment from audio cues.
 */

type Environment = 'quiet' | 'noisy' | 'office' | 'outdoor' | 'car' | 'public';

interface AmbientSignal {
  type: 'baby_crying' | 'typing' | 'other_voices' | 'tv' | 'traffic' | 'nature';
  confidence: number;
}

interface AmbientContext {
  environment: Environment;
  confidence: number;
  signals: AmbientSignal[];
  privacyConcern: boolean;      // Others might hear
  suggestions: string[];
}

/**
 * Analyze background audio for ambient context.
 * Run on chunks of audio during speech pauses.
 */
export function analyzeAmbientAudio(
  backgroundAudio: Float32Array,
  sampleRate: number
): AmbientContext {
  // Analyze frequency patterns for:
  // - Keyboard typing (rapid clicks)
  // - Baby crying (specific frequency range)
  // - Multiple voices (speech overlap detection)
  // - TV/radio (compressed audio signatures)
  // - Traffic (low frequency rumble)
  // - Nature (bird songs, wind)
  
  return {
    environment: 'quiet',
    confidence: 0.8,
    signals: [],
    privacyConcern: false,
    suggestions: [],
  };
}

/**
 * Generate response based on ambient context.
 */
export function getAmbientResponse(context: AmbientContext): string | null {
  if (context.privacyConcern) {
    return "It sounds like others might be around. Should we talk about this another time, or are you comfortable now?";
  }
  
  if (context.signals.some(s => s.type === 'baby_crying' && s.confidence > 0.7)) {
    return "Sounds like you've got your hands full! We can keep this short, or chat another time.";
  }
  
  if (context.environment === 'public' || context.environment === 'office') {
    return "I'll keep my voice down in case you're around others.";
  }
  
  return null;
}
```

---

## 9. Contradiction Comfort

> **"You can be excited about the new job AND sad to leave the old one."**

### What It Does

- Detects when user expresses contradictory emotions
- Validates holding opposing feelings simultaneously
- Resists urge to "resolve" the contradiction
- Holds space for complexity

### Service Implementation

```typescript
// src/services/superhuman/contradiction-comfort.ts

/**
 * Contradiction Comfort
 * 
 * Hold space for contradictory emotions without trying to fix them.
 */

interface ContradictionDetection {
  detected: boolean;
  emotions: [string, string];
  topic: string;
  validationPhrase: string;
}

const CONTRADICTION_VALIDATIONS = [
  { emotions: ['excited', 'sad'], phrase: "You can be excited about what's ahead AND grieve what you're leaving behind." },
  { emotions: ['love', 'angry'], phrase: "You can love someone AND be furious with them. Both are real." },
  { emotions: ['relieved', 'guilty'], phrase: "Being relieved doesn't mean you didn't care. You can feel both." },
  { emotions: ['happy', 'scared'], phrase: "Joy and fear often travel together. You don't have to pick one." },
  { emotions: ['grateful', 'resentful'], phrase: "You can appreciate what you have AND wish it were different." },
  { emotions: ['hope', 'despair'], phrase: "Hope and despair aren't opposites. They can coexist." },
  { emotions: ['proud', 'ashamed'], phrase: "You can be proud of how far you've come AND wish you'd done things differently." },
];

/**
 * Detect emotional contradictions in message.
 */
export function detectContradiction(
  message: string,
  recentEmotions: string[],
  topic?: string
): ContradictionDetection | null {
  // Look for contradiction markers
  const hasMarker = /but|and also|at the same time|part of me|on the other hand/i.test(message);
  
  // Check emotion pairs
  for (const validation of CONTRADICTION_VALIDATIONS) {
    const [e1, e2] = validation.emotions;
    const hasE1 = recentEmotions.includes(e1) || message.toLowerCase().includes(e1);
    const hasE2 = recentEmotions.includes(e2) || message.toLowerCase().includes(e2);
    
    if (hasE1 && hasE2) {
      return {
        detected: true,
        emotions: [e1, e2],
        topic: topic || 'this situation',
        validationPhrase: validation.phrase,
      };
    }
  }
  
  return null;
}

/**
 * Build context for LLM.
 */
export function buildContradictionContext(detection: ContradictionDetection): string {
  if (!detection) return '';
  
  return `[CONTRADICTION COMFORT]
User is expressing contradictory emotions: ${detection.emotions[0]} AND ${detection.emotions[1]}

IMPORTANT: Do NOT try to resolve this contradiction. Both feelings are valid.
Validation to offer: "${detection.validationPhrase}"

Hold space for complexity. Resist the urge to simplify.`;
}
```

---

## Data Model

### New Firestore Collections

| Collection Path | Purpose | Capability |
|----------------|---------|------------|
| `bogle_users/{userId}/timing_intelligence` | Energy patterns, queued topics | Perfect Timing |
| `bogle_users/{userId}/silence_patterns` | Silence signatures, history | Silence Interpreter |
| `bogle_users/{userId}/pattern_mirror` | Energizing/draining topics, cycles | Pattern Mirror |
| `bogle_users/{userId}/vulnerability_tracking` | First-time shares, ladder | First-Time Vulnerability |
| `bogle_users/{userId}/future_self_letters` | Generated letters | Future Self |
| `bogle_users/{userId}/linguistic_profile` | Vocabulary, phrases | Linguistic Mirroring |

### Enhanced Existing Collections

| Collection | Enhancement | Capability |
|------------|-------------|------------|
| `bogle_users/{userId}/boundaries` | Add premature advice, explicit requests | Protective Memory |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

| Task | Files | Priority |
|------|-------|----------|
| Create base service files | All 9 new .ts files | P0 |
| Define Firestore schemas | firestore.rules, types | P0 |
| Add to superhuman/index.ts | index.ts | P0 |
| Add to trust-systems/index.ts | index.ts | P0 |

### Phase 2: Core Detection (Week 2-3)

| Capability | Task | Depends On |
|------------|------|-----------|
| Silence Interpreter | Integrate with VAD + prosody analyzer | Audio pipeline |
| First-Time Vulnerability | Add to turn handler | Voice analysis |
| Contradiction Comfort | Add emotion tracking | Emotion detection |

### Phase 3: Pattern Learning (Week 3-4)

| Capability | Task | Depends On |
|------------|------|-----------|
| Perfect Timing | Build energy pattern tracker | Session data |
| Unspoken Pattern Mirror | Topic-energy correlation | Prosody analysis |
| Linguistic Mirroring | Vocabulary extraction | NLP |

### Phase 4: Advanced Features (Week 4-5)

| Capability | Task | Depends On |
|------------|------|-----------|
| Protective Memory | Enhance boundary-memory.ts | Phase 1 |
| Future Self Letters | Letter generation | All pattern data |
| Ambient Context | Background audio analysis | Audio pipeline |

### Phase 5: Integration & Polish (Week 5-6)

| Task | Description |
|------|-------------|
| Context builders | Create context injection for all 9 |
| Testing | Unit tests, integration tests |
| Documentation | Update BETTER-THAN-HUMAN.md |
| Metrics | Add analytics tracking |

---

## Integration Points

### Voice Agent Integration

```typescript
// src/agents/realtime/turn-handler.ts

import { detectReceptivity, getTopicsForNow } from '../services/superhuman/perfect-timing.js';
import { analyzeSilence, buildSilenceGuidance } from '../services/superhuman/silence-interpreter.js';
import { detectFirstTimeVulnerability } from '../services/trust-systems/first-time-vulnerability.js';
import { detectContradiction, buildContradictionContext } from '../services/superhuman/contradiction-comfort.js';

// In processUserTurn():
const receptivity = detectReceptivity(voiceAnalysis);
const queuedTopics = await getTopicsForNow(userId, currentConditions);
const firstTime = detectFirstTimeVulnerability(userId, transcript, voiceMetrics);
const contradiction = detectContradiction(transcript, recentEmotions);
```

### Context Builder Integration

```typescript
// src/intelligence/context-builders/superhuman/superhuman-integration.ts

// ADD to buildSuperhumanContext():
export async function buildSuperhumanContext(userId: string): Promise<string> {
  const [
    // Existing
    commitments,
    predictions,
    // ...
    
    // NEW
    timing,
    patternMirror,
    linguistic,
  ] = await Promise.all([
    // Existing
    buildCommitmentContext(userId),
    // ...
    
    // NEW
    buildTimingContext(userId),
    buildPatternMirrorContext(userId),
    buildLinguisticContext(await loadLinguisticProfile(userId)),
  ]);
  
  // Combine all contexts...
}
```

---

## Testing Strategy

### Unit Tests

```bash
# New test files
src/services/superhuman/__tests__/perfect-timing.test.ts
src/services/superhuman/__tests__/silence-interpreter.test.ts
src/services/superhuman/__tests__/pattern-mirror.test.ts
src/services/superhuman/__tests__/future-self.test.ts
src/services/superhuman/__tests__/contradiction-comfort.test.ts
src/services/trust-systems/__tests__/first-time-vulnerability.test.ts
src/services/trust-systems/__tests__/linguistic-mirroring.test.ts
src/services/trust-systems/__tests__/ambient-context.test.ts
```

### Integration Tests

```typescript
// Test silence detection end-to-end
describe('Silence Interpreter Integration', () => {
  it('detects emotional silence from voice markers', async () => {
    // Simulate user with heavy topic, held breath
    // Verify correct silence type detected
  });
  
  it('provides appropriate response for each silence type', async () => {
    // Test all 6 silence types
  });
});
```

### Voice Agent E2E Tests

```typescript
// Test full conversation flow
describe('Better Than Human E2E', () => {
  it('queues topic and surfaces at right moment', async () => {
    // Conversation 1: User mentions divorce but low energy
    // Verify topic is queued
    // Conversation 2: User is high energy, relaxed
    // Verify topic surfaces
  });
});
```

---

## Success Metrics

| Capability | Metric | Target |
|------------|--------|--------|
| Perfect Timing | Topics surfaced at right moment | >70% user positive response |
| Silence Interpreter | Silence type accuracy | >75% (validated against manual labels) |
| Pattern Mirror | Patterns acknowledged by user | >60% "I didn't notice that" |
| First-Time Vulnerability | Threshold moments detected | >85% recall |
| Contradiction Comfort | User feels validated | >80% continue sharing |

---

## Brand Integration

All capabilities should feel:

- **Warm, not mechanical** - These are superpowers, not features
- **Wise, not intrusive** - Know when NOT to use them
- **Present, not performative** - Genuinely there for them
- **Human, not AI** - Never mention the capability explicitly

Example: Don't say "My Pattern Mirror detected..." - instead say "I've noticed something..."

---

## Appendix: Quick Reference

### Context Injection Headers

```
[PERFECT TIMING INTELLIGENCE]
[SILENCE INTERPRETER]
[PATTERN MIRROR - Unspoken Insights]
[PROTECTIVE MEMORY]
[FIRST-TIME VULNERABILITY DETECTED]
[FUTURE SELF LETTER]
[LINGUISTIC MIRRORING]
[AMBIENT CONTEXT]
[CONTRADICTION COMFORT]
```

### Key Files

| Capability | Primary File |
|------------|-------------|
| Perfect Timing | `src/services/superhuman/perfect-timing.ts` |
| Silence Interpreter | `src/services/superhuman/silence-interpreter.ts` |
| Pattern Mirror | `src/services/superhuman/pattern-mirror.ts` |
| Protective Memory | `src/services/trust-systems/boundary-memory.ts` (enhanced) |
| First-Time Vulnerability | `src/services/trust-systems/first-time-vulnerability.ts` |
| Future Self | `src/services/superhuman/future-self.ts` |
| Linguistic Mirroring | `src/services/trust-systems/linguistic-mirroring.ts` |
| Ambient Context | `src/services/trust-systems/ambient-context.ts` |
| Contradiction Comfort | `src/services/superhuman/contradiction-comfort.ts` |

---

*Last updated: December 2024*
*Version: 1.0*

