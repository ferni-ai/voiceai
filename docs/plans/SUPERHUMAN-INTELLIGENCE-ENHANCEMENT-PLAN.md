# Superhuman Intelligence Enhancement Plan

> **"Better than human = superhuman perception + human-like restraint"**

**Version:** 1.0  
**Date:** January 2026  
**Status:** Planning  
**Author:** Architecture Team

---

## Executive Summary

This plan outlines 10 intelligence enhancements to make Ferni more genuinely human-like. Each enhancement follows clean architecture principles, integrates with existing systems, and delivers measurable value.

**Philosophy:** The next level of "human-like" isn't about more features—it's about:
- Knowing when NOT to respond (presence > performance)
- Connecting dots humans miss (pattern recognition across time)
- Reading what's NOT said (avoidance detection)
- Remembering HOW we relate (not just what we talked about)
- Matching conversational rhythm (tempo, not just content)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Enhancement 1: Pattern Connector](#enhancement-1-pattern-connector)
3. [Enhancement 2: Voice Biomarker Pipeline](#enhancement-2-voice-biomarker-pipeline)
4. [Enhancement 3: Conversational Rhythm Intelligence](#enhancement-3-conversational-rhythm-intelligence)
5. [Enhancement 4: Avoidance Pattern Detection](#enhancement-4-avoidance-pattern-detection)
6. [Enhancement 5: Relational Memory](#enhancement-5-relational-memory)
7. [Enhancement 6: Emotional Momentum Tracking](#enhancement-6-emotional-momentum-tracking)
8. [Enhancement 7: Response Mode Intelligence](#enhancement-7-response-mode-intelligence)
9. [Enhancement 8: Multi-Session Story Arc](#enhancement-8-multi-session-story-arc)
10. [Enhancement 9: Micro-Moment Recognition](#enhancement-9-micro-moment-recognition)
11. [Enhancement 10: Enhanced Silence Intelligence](#enhancement-10-enhanced-silence-intelligence)
12. [Implementation Phases](#implementation-phases)
13. [Testing Strategy](#testing-strategy)
14. [Success Metrics](#success-metrics)

---

## Architecture Overview

### Layer Placement

All enhancements fit within the existing architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGENTS (Level 100)                         │
│  voice-agent.ts, turn-handler.ts, transcript-handler.ts         │
│  ▲ Consumes intelligence, makes final decisions                 │
└─────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                   INTELLIGENCE (Level 70)                       │
│  NEW: Pattern Connector, Emotional Momentum, Story Arc          │
│  Existing: Proactive Engine, Cross-Domain Correlator            │
└─────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                   CONVERSATION (Level 70)                       │
│  NEW: Rhythm Intelligence, Response Mode, Micro-Moments         │
│  Existing: Humanization, Emotional Arc, Concern Detection       │
└─────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICES (Level 60)                          │
│  NEW: Relational Memory, Avoidance Detection, Voice Biomarkers  │
│  Existing: Superhuman Services, Silence Interpreter             │
└─────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                     MEMORY (Level 30)                           │
│  NEW: Rhythm profiles, Story arcs, Relational patterns          │
│  Existing: Firestore, Spanner Graph, Dynamic Memory             │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Single Responsibility**: Each enhancement is a focused module
2. **Dependency Inversion**: All modules expose interfaces, not implementations
3. **Result Types**: Functions return `Result<T, E>` for expected failures
4. **Session Scoping**: State is scoped to sessions with explicit cleanup
5. **Persistence Separation**: Business logic separate from storage
6. **Testability First**: Interfaces enable mocking and unit testing

### File Organization Pattern

Each enhancement follows this structure:

```
src/{layer}/{module-name}/
├── types.ts           # Type definitions and interfaces
├── constants.ts       # Static data, thresholds, templates
├── persistence.ts     # Firestore/storage operations
├── engine.ts          # Core business logic
├── integration.ts     # Connection to voice pipeline
├── index.ts           # Barrel exports + factory functions
└── __tests__/
    ├── engine.test.ts
    └── integration.test.ts
```

---

## Enhancement 1: Pattern Connector

**Purpose:** Connect dots the user hasn't noticed—surfacing non-obvious correlations across topics and time.

### The Problem We're Solving

**What humans miss:**
> User mentions mom → stressed about work → mentions mom again
> A human friend might not notice the pattern.

**What Ferni can do:**
> "I've noticed you bring up your mom whenever you're stressed about work. There might be a connection worth exploring."

### Architecture

**Layer:** `src/intelligence/deep-understanding/pattern-connector/`

```typescript
// types.ts
export interface TopicCoOccurrence {
  topicA: string;
  topicB: string;
  occurrences: number;
  emotionalContext: string[];
  correlation: 'positive' | 'negative' | 'neutral';
  confidence: number;
  lastSeen: Date;
}

export interface PatternConnection {
  id: string;
  userId: string;
  pattern: TopicCoOccurrence;
  insight: string;
  surfacingCriteria: {
    minOccurrences: number;
    minConfidence: number;
    receptivityRequired: 'low' | 'medium' | 'high';
  };
  surfacedAt?: Date;
  userReaction?: 'acknowledged' | 'explored' | 'dismissed' | 'resonated';
}

export interface IPatternConnector {
  recordTopicMention(
    userId: string,
    topic: string,
    context: { emotion?: string; precedingTopic?: string; timestamp: Date }
  ): Promise<void>;
  
  detectPatterns(userId: string): Promise<PatternConnection[]>;
  
  getSurfaceableInsight(
    userId: string,
    receptivity: number
  ): Promise<PatternConnection | null>;
  
  recordInsightReaction(
    userId: string,
    patternId: string,
    reaction: PatternConnection['userReaction']
  ): Promise<void>;
}
```

```typescript
// engine.ts
export class PatternConnectorEngine implements IPatternConnector {
  private readonly MIN_OCCURRENCES = 3;
  private readonly MIN_CONFIDENCE = 0.6;
  private readonly CORRELATION_WINDOW_MS = 60 * 1000; // 60 seconds
  
  async recordTopicMention(
    userId: string,
    topic: string,
    context: { emotion?: string; precedingTopic?: string; timestamp: Date }
  ): Promise<void> {
    // Record the mention
    await this.persistence.recordMention(userId, topic, context);
    
    // Check for co-occurrence with recent topics
    if (context.precedingTopic) {
      await this.updateCoOccurrence(
        userId,
        context.precedingTopic,
        topic,
        context.emotion
      );
    }
  }
  
  async detectPatterns(userId: string): Promise<PatternConnection[]> {
    const coOccurrences = await this.persistence.getCoOccurrences(userId);
    
    return coOccurrences
      .filter(co => co.occurrences >= this.MIN_OCCURRENCES)
      .filter(co => co.confidence >= this.MIN_CONFIDENCE)
      .map(co => this.toPatternConnection(co));
  }
  
  async getSurfaceableInsight(
    userId: string,
    receptivity: number
  ): Promise<PatternConnection | null> {
    const patterns = await this.detectPatterns(userId);
    
    // Filter by receptivity and not recently surfaced
    const candidates = patterns.filter(p => {
      const receptivityOk = this.meetsReceptivityThreshold(p, receptivity);
      const notRecentlySurfaced = !p.surfacedAt || 
        Date.now() - p.surfacedAt.getTime() > 7 * 24 * 60 * 60 * 1000;
      return receptivityOk && notRecentlySurfaced;
    });
    
    // Return highest confidence pattern
    return candidates.sort((a, b) => b.pattern.confidence - a.pattern.confidence)[0] || null;
  }
  
  private generateInsight(coOccurrence: TopicCoOccurrence): string {
    // Generate natural language insight
    if (coOccurrence.correlation === 'positive') {
      return `I've noticed ${coOccurrence.topicA} often comes up when you're talking about ${coOccurrence.topicB}. There might be a connection worth exploring.`;
    }
    // ... more insight templates
  }
}
```

### Integration Points

```typescript
// In turn-handler.ts
import { getPatternConnector } from '../intelligence/deep-understanding/pattern-connector/index.js';

// After topic detection
const connector = getPatternConnector();
await connector.recordTopicMention(userId, detectedTopic, {
  emotion: emotionalState.current,
  precedingTopic: previousTurnTopic,
  timestamp: new Date(),
});

// At session start (with receptivity check)
const insight = await connector.getSurfaceableInsight(userId, receptivityScore);
if (insight) {
  // Add to proactive queue
  addToProactiveQueue(insight);
}
```

### Persistence Schema

```typescript
// Firestore: bogle_users/{userId}/pattern_connections
interface PatternConnectionDoc {
  topicA: string;
  topicB: string;
  occurrences: number;
  emotionalContexts: string[];
  correlation: string;
  confidence: number;
  insight: string;
  surfacedAt?: Timestamp;
  userReaction?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Test Cases

```typescript
describe('PatternConnectorEngine', () => {
  it('detects co-occurrence after 3+ mentions', async () => {
    const engine = new PatternConnectorEngine(mockPersistence);
    
    // Record 3 co-occurrences of "mom" after "work stress"
    for (let i = 0; i < 3; i++) {
      await engine.recordTopicMention(userId, 'mom', {
        precedingTopic: 'work_stress',
        emotion: 'anxious',
        timestamp: new Date(),
      });
    }
    
    const patterns = await engine.detectPatterns(userId);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].pattern.topicA).toBe('work_stress');
    expect(patterns[0].pattern.topicB).toBe('mom');
  });
  
  it('respects receptivity threshold for surfacing', async () => {
    // ... test that low receptivity doesn't surface sensitive patterns
  });
  
  it('does not resurface recently shown patterns', async () => {
    // ... test 7-day cooldown
  });
});
```

---

## Enhancement 2: Voice Biomarker Pipeline

**Purpose:** Extract deeper emotional state from voice signals and route to appropriate interventions.

### The Problem We're Solving

**Current state:**
> Basic emotion detection: "stressed"

**Enhanced state:**
> Voice biomarkers reveal "pre-panic": fast speech + shallow breathing + high pitch variance
> Automatic intervention: grounding technique before content

### Architecture

**Layer:** `src/services/voice-intelligence/`

```typescript
// types.ts
export interface VoiceBiomarkers {
  speechRate: {
    current: number;      // words per minute
    baseline: number;     // user's normal rate
    deviation: number;    // percentage above/below baseline
    trend: 'accelerating' | 'decelerating' | 'stable';
  };
  pausePattern: {
    frequency: number;    // pauses per minute
    avgDuration: number;  // milliseconds
    pattern: 'natural' | 'rushed' | 'hesitant' | 'absent';
  };
  pitchVariability: {
    range: number;        // Hz range
    variance: number;     // statistical variance
    emotion: 'flat' | 'animated' | 'unstable';
  };
  breathPattern: {
    rate: number;         // breaths per minute (estimated from pauses)
    depth: 'shallow' | 'normal' | 'deep';
    regularity: 'regular' | 'irregular' | 'gasping';
  };
  voiceQuality: {
    strain: number;       // 0-1 tension indicator
    tremor: boolean;      // voice shaking
    breathiness: number;  // 0-1 air in voice
  };
}

export interface BiomarkerInference {
  state: VoiceEmotionalState;
  confidence: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  intervention: InterventionSuggestion | null;
}

export type VoiceEmotionalState =
  | 'calm'
  | 'engaged'
  | 'mildly-stressed'
  | 'anxious'
  | 'pre-panic'
  | 'exhausted'
  | 'suppressing'
  | 'dissociating'
  | 'emotional-overwhelm';

export interface InterventionSuggestion {
  type: 'grounding' | 'breathing' | 'validation' | 'slow-down' | 'pause';
  priority: number;
  script: string;
  ssml: string;
  toolsToSuppress?: string[];
  toolsToBoost?: string[];
}

export interface IVoiceBiomarkerAnalyzer {
  analyze(
    audioFeatures: AudioFeatures,
    userBaseline: UserBaseline
  ): VoiceBiomarkers;
  
  infer(biomarkers: VoiceBiomarkers): BiomarkerInference;
  
  updateBaseline(
    userId: string,
    session: { biomarkers: VoiceBiomarkers; wasNormal: boolean }
  ): Promise<void>;
  
  getIntervention(
    state: VoiceEmotionalState,
    context: { topic?: string; turnCount: number }
  ): InterventionSuggestion | null;
}
```

```typescript
// engine.ts
export class VoiceBiomarkerAnalyzer implements IVoiceBiomarkerAnalyzer {
  
  private readonly STATE_SIGNATURES: Record<VoiceEmotionalState, BiomarkerSignature> = {
    'pre-panic': {
      speechRate: { deviationMin: 0.3 },        // 30%+ faster
      pausePattern: { pattern: ['rushed', 'absent'] },
      pitchVariability: { emotion: ['unstable'] },
      breathPattern: { depth: ['shallow'], regularity: ['irregular'] },
      voiceQuality: { strainMin: 0.6 },
    },
    'exhausted': {
      speechRate: { deviationMax: -0.2 },       // 20%+ slower
      pausePattern: { pattern: ['hesitant'] },
      pitchVariability: { emotion: ['flat'] },
      breathPattern: { depth: ['shallow'], regularity: ['regular'] },
      voiceQuality: { breathinessMin: 0.5 },
    },
    // ... other state signatures
  };
  
  private readonly INTERVENTIONS: Record<VoiceEmotionalState, InterventionSuggestion> = {
    'pre-panic': {
      type: 'grounding',
      priority: 1,
      script: "Hey, I'm noticing your voice sounds a bit rushed. Let's pause for a second. Take a breath with me.",
      ssml: '<break time="500ms"/>Hey, I\'m noticing your voice sounds a bit rushed. <break time="300ms"/>Let\'s pause for a second. <break time="500ms"/>Take a breath with me.',
      toolsToSuppress: ['calendar_review', 'task_list', 'deadline_check'],
      toolsToBoost: ['breathing_exercise', 'grounding_technique'],
    },
    // ... other interventions
  };
  
  infer(biomarkers: VoiceBiomarkers): BiomarkerInference {
    let bestMatch: { state: VoiceEmotionalState; score: number } | null = null;
    
    for (const [state, signature] of Object.entries(this.STATE_SIGNATURES)) {
      const score = this.matchSignature(biomarkers, signature);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { state: state as VoiceEmotionalState, score };
      }
    }
    
    if (!bestMatch || bestMatch.score < 0.5) {
      return { state: 'calm', confidence: 0.5, urgency: 'low', intervention: null };
    }
    
    const intervention = this.getIntervention(bestMatch.state, {});
    const urgency = this.determineUrgency(bestMatch.state, bestMatch.score);
    
    return {
      state: bestMatch.state,
      confidence: bestMatch.score,
      urgency,
      intervention,
    };
  }
}
```

### Integration Points

```typescript
// In voice-agent-integration.ts
import { getVoiceBiomarkerAnalyzer } from '../services/voice-intelligence/index.js';

// After receiving voice features from STT
const analyzer = getVoiceBiomarkerAnalyzer();
const biomarkers = analyzer.analyze(audioFeatures, userBaseline);
const inference = analyzer.infer(biomarkers);

// If intervention needed, apply BEFORE normal processing
if (inference.intervention && inference.urgency !== 'low') {
  // Suppress problematic tools
  if (inference.intervention.toolsToSuppress) {
    toolSelection.suppress(inference.intervention.toolsToSuppress);
  }
  
  // Boost helpful tools
  if (inference.intervention.toolsToBoost) {
    toolSelection.boost(inference.intervention.toolsToBoost);
  }
  
  // For high urgency, prepend intervention
  if (inference.urgency === 'high' || inference.urgency === 'critical') {
    prependResponse(inference.intervention.ssml);
  }
}
```

---

## Enhancement 3: Conversational Rhythm Intelligence

**Purpose:** Adapt to the user's natural conversational tempo, not just content.

### The Problem We're Solving

**Current state:**
> Same response length regardless of user's style

**Enhanced state:**
> User speaks briefly → Ferni responds briefly + invites more
> User speaks at length → Ferni mirrors depth

### Architecture

**Layer:** `src/conversation/rhythm-intelligence/`

```typescript
// types.ts
export interface ConversationalRhythm {
  userId: string;
  
  // Turn characteristics
  avgTurnLengthWords: number;
  avgTurnDurationMs: number;
  preferredResponseLength: 'brief' | 'moderate' | 'detailed';
  
  // Timing preferences
  pauseTolerance: number;           // ms before discomfort
  preferredResponseDelay: number;   // optimal ms before Ferni speaks
  interruptionStyle: 'wait' | 'overlap-ok' | 'needs-space';
  
  // Energy curve
  energyCurve: {
    peakMinuteInSession: number;
    fadeStartMinute: number;
    optimalSessionLength: number;
  };
  
  // Learned from sessions
  sessionsAnalyzed: number;
  lastUpdated: Date;
}

export interface TurnRhythmContext {
  turnLengthWords: number;
  turnDurationMs: number;
  pauseBeforeTurn: number;
  sessionMinute: number;
  currentEnergy: number;
}

export interface RhythmGuidance {
  suggestedResponseLength: 'brief' | 'moderate' | 'detailed';
  suggestedWordCount: { min: number; max: number };
  pacing: 'quick' | 'normal' | 'deliberate';
  shouldInviteMore: boolean;
  invitationPhrase?: string;
  energyMatch: 'match' | 'slightly-higher' | 'slightly-lower';
}

export interface IRhythmIntelligence {
  // Get guidance for current turn
  getGuidance(
    userId: string,
    turnContext: TurnRhythmContext
  ): Promise<RhythmGuidance>;
  
  // Record turn for learning
  recordTurn(
    userId: string,
    turn: TurnRhythmContext,
    responseGiven: { words: number; durationMs: number },
    userSatisfaction?: number
  ): Promise<void>;
  
  // Get user's rhythm profile
  getProfile(userId: string): Promise<ConversationalRhythm | null>;
  
  // Adapt response length
  adaptResponseLength(
    response: string,
    guidance: RhythmGuidance
  ): { text: string; truncated: boolean; invitation?: string };
}
```

```typescript
// engine.ts
export class RhythmIntelligenceEngine implements IRhythmIntelligence {
  
  private readonly DEFAULT_RHYTHM: ConversationalRhythm = {
    avgTurnLengthWords: 25,
    avgTurnDurationMs: 5000,
    preferredResponseLength: 'moderate',
    pauseTolerance: 2000,
    preferredResponseDelay: 300,
    interruptionStyle: 'wait',
    energyCurve: {
      peakMinuteInSession: 10,
      fadeStartMinute: 25,
      optimalSessionLength: 30,
    },
  };
  
  async getGuidance(
    userId: string,
    turnContext: TurnRhythmContext
  ): Promise<RhythmGuidance> {
    const profile = await this.getProfile(userId) || this.DEFAULT_RHYTHM;
    
    // Determine if this turn is brief compared to their baseline
    const isBrief = turnContext.turnLengthWords < profile.avgTurnLengthWords * 0.6;
    const isLong = turnContext.turnLengthWords > profile.avgTurnLengthWords * 1.4;
    
    // Determine energy state in session
    const isInFadeWindow = turnContext.sessionMinute > profile.energyCurve.fadeStartMinute;
    
    let suggestedLength: 'brief' | 'moderate' | 'detailed';
    let shouldInviteMore = false;
    let invitationPhrase: string | undefined;
    
    if (isBrief) {
      suggestedLength = 'brief';
      shouldInviteMore = true;
      invitationPhrase = this.getInvitationPhrase(turnContext);
    } else if (isLong) {
      suggestedLength = 'detailed';
    } else {
      suggestedLength = 'moderate';
    }
    
    // Adjust for energy fade
    if (isInFadeWindow) {
      suggestedLength = suggestedLength === 'detailed' ? 'moderate' : 'brief';
    }
    
    return {
      suggestedResponseLength: suggestedLength,
      suggestedWordCount: this.getWordCountRange(suggestedLength),
      pacing: isInFadeWindow ? 'deliberate' : 'normal',
      shouldInviteMore,
      invitationPhrase,
      energyMatch: isInFadeWindow ? 'slightly-lower' : 'match',
    };
  }
  
  adaptResponseLength(
    response: string,
    guidance: RhythmGuidance
  ): { text: string; truncated: boolean; invitation?: string } {
    const words = response.split(/\s+/);
    
    if (words.length <= guidance.suggestedWordCount.max) {
      // Response fits, add invitation if needed
      return {
        text: response,
        truncated: false,
        invitation: guidance.shouldInviteMore ? guidance.invitationPhrase : undefined,
      };
    }
    
    // Truncate to suggested length, finding natural break point
    const truncated = this.truncateAtNaturalBreak(
      response,
      guidance.suggestedWordCount.max
    );
    
    return {
      text: truncated,
      truncated: true,
      invitation: 'Want me to go deeper on any of that?',
    };
  }
  
  private getInvitationPhrase(context: TurnRhythmContext): string {
    const phrases = [
      "Tell me more?",
      "What else is on your mind?",
      "Go on...",
      "I'm listening.",
      "And?",
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }
  
  private getWordCountRange(length: 'brief' | 'moderate' | 'detailed'): { min: number; max: number } {
    switch (length) {
      case 'brief': return { min: 10, max: 30 };
      case 'moderate': return { min: 30, max: 80 };
      case 'detailed': return { min: 80, max: 200 };
    }
  }
}
```

### Integration Points

```typescript
// In humanizer/ or turn-handler.ts
import { getRhythmIntelligence } from '../conversation/rhythm-intelligence/index.js';

// Before generating response
const rhythm = getRhythmIntelligence();
const guidance = await rhythm.getGuidance(userId, {
  turnLengthWords: countWords(userMessage),
  turnDurationMs: turnDuration,
  pauseBeforeTurn: pauseDuration,
  sessionMinute: getSessionMinute(session),
  currentEnergy: emotionalState.arousal,
});

// After generating response, before sending to TTS
const adapted = rhythm.adaptResponseLength(response, guidance);
let finalResponse = adapted.text;
if (adapted.invitation) {
  finalResponse += ` ${adapted.invitation}`;
}

// Record for learning
await rhythm.recordTurn(userId, turnContext, {
  words: countWords(finalResponse),
  durationMs: estimateDuration(finalResponse),
});
```

---

## Enhancement 4: Avoidance Pattern Detection

**Purpose:** Detect what users are NOT saying—avoidance patterns that reveal important topics.

### The Problem We're Solving

**Current state:**
> Only responds to explicit content

**Enhanced state:**
> User deflects from "work" 3x this week → Ferni gently acknowledges
> "I noticed you moved away from work pretty quickly. No pressure, but I'm here."

### Architecture

**Layer:** `src/intelligence/deep-understanding/avoidance-detection/`

```typescript
// types.ts
export interface AvoidanceMark {
  topic: string;
  timestamp: Date;
  signal: AvoidanceSignal;
  context: {
    precedingTopic?: string;
    followingTopic?: string;
    deflectionPhrase?: string;
    emotionBefore?: string;
    emotionAfter?: string;
  };
}

export type AvoidanceSignal =
  | 'topic_change'      // Abruptly changed subject
  | 'vague_response'    // "It's fine", "whatever"
  | 'deflection'        // "Anyway...", "But what about..."
  | 'minimization'      // "It's not a big deal"
  | 'humor_shield'      // Joking to avoid depth
  | 'generalization'    // "Everyone feels that way"
  | 'time_pressure';    // "I don't have time to talk about that"

export interface AvoidancePattern {
  topic: string;
  signals: AvoidanceMark[];
  frequency: number;
  interpretation: AvoidanceInterpretation;
  firstDetected: Date;
  lastDetected: Date;
}

export type AvoidanceInterpretation =
  | 'not_ready'      // They'll come to it when ready
  | 'painful'        // Too raw to discuss
  | 'protective'     // Protecting someone/something
  | 'shame'          // Embarrassed about topic
  | 'processing';    // Still working through it internally

export interface AvoidanceGuidance {
  shouldAcknowledge: boolean;
  timing: 'now' | 'later' | 'next_session' | 'never';
  approach: 'gentle_notice' | 'open_door' | 'normalize' | 'wait';
  script?: string;
}

export interface IAvoidanceDetector {
  // Detect avoidance in current turn
  detectInTurn(
    userId: string,
    userMessage: string,
    context: {
      previousTopic?: string;
      previousMessage?: string;
      emotion?: string;
    }
  ): AvoidanceMark | null;
  
  // Get accumulated patterns
  getPatterns(userId: string): Promise<AvoidancePattern[]>;
  
  // Get guidance for acknowledged pattern
  getGuidance(
    pattern: AvoidancePattern,
    currentContext: { receptivity: number; sessionMinute: number }
  ): AvoidanceGuidance;
  
  // Record that we acknowledged an avoidance
  recordAcknowledgment(
    userId: string,
    topic: string,
    userResponse: 'opened_up' | 'deflected_again' | 'acknowledged' | 'ignored'
  ): Promise<void>;
}
```

```typescript
// detection-rules.ts
export const AVOIDANCE_SIGNALS: Record<AvoidanceSignal, DetectionRule> = {
  topic_change: {
    patterns: [
      /anyway/i,
      /speaking of/i,
      /on another note/i,
      /but (what|how) about/i,
      /let's talk about something else/i,
    ],
    contextRequired: 'topic_shift',
    weight: 0.7,
  },
  vague_response: {
    patterns: [
      /^(it's )?(fine|whatever|okay|nothing)\.?$/i,
      /^(I )?(don't know|dunno)\.?$/i,
      /^not really\.?$/i,
      /^(it )?doesn't matter\.?$/i,
    ],
    contextRequired: 'direct_question',
    weight: 0.6,
  },
  deflection: {
    patterns: [
      /^anyway/i,
      /^but (you|we)/i,
      /^what about you/i,
      /^I don't want to bore you/i,
    ],
    weight: 0.65,
  },
  minimization: {
    patterns: [
      /not (a )?big deal/i,
      /doesn't (really )?matter/i,
      /I'm over it/i,
      /it's nothing/i,
      /I shouldn't complain/i,
    ],
    weight: 0.7,
  },
  humor_shield: {
    patterns: [
      /haha|lol|jk|just kidding/i,
      /^(well )?that's (just )?(life|how it is)/i,
    ],
    contextRequired: 'serious_topic',
    weight: 0.5,
  },
};
```

```typescript
// engine.ts
export class AvoidanceDetector implements IAvoidanceDetector {
  
  detectInTurn(
    userId: string,
    userMessage: string,
    context: {
      previousTopic?: string;
      previousMessage?: string;
      emotion?: string;
    }
  ): AvoidanceMark | null {
    for (const [signal, rule] of Object.entries(AVOIDANCE_SIGNALS)) {
      if (this.matchesRule(userMessage, rule, context)) {
        return {
          topic: context.previousTopic || 'unknown',
          timestamp: new Date(),
          signal: signal as AvoidanceSignal,
          context: {
            precedingTopic: context.previousTopic,
            deflectionPhrase: this.extractDeflectionPhrase(userMessage, rule),
            emotionBefore: context.emotion,
          },
        };
      }
    }
    return null;
  }
  
  getGuidance(
    pattern: AvoidancePattern,
    currentContext: { receptivity: number; sessionMinute: number }
  ): AvoidanceGuidance {
    // Don't acknowledge if too early in session
    if (currentContext.sessionMinute < 5) {
      return { shouldAcknowledge: false, timing: 'later', approach: 'wait' };
    }
    
    // Don't acknowledge if low receptivity
    if (currentContext.receptivity < 0.5) {
      return { shouldAcknowledge: false, timing: 'next_session', approach: 'wait' };
    }
    
    // If painful, be very gentle
    if (pattern.interpretation === 'painful') {
      return {
        shouldAcknowledge: true,
        timing: 'now',
        approach: 'open_door',
        script: `I noticed you moved away from ${pattern.topic} pretty quickly. No pressure at all, but I'm here whenever you're ready.`,
      };
    }
    
    // If not ready, just normalize
    if (pattern.interpretation === 'not_ready') {
      return {
        shouldAcknowledge: false,
        timing: 'never',
        approach: 'wait',
      };
    }
    
    // Default gentle notice
    return {
      shouldAcknowledge: true,
      timing: 'later',
      approach: 'gentle_notice',
      script: `Hey, I've noticed ${pattern.topic} seems to come up and then... not. That's okay. Just know it's safe to go there if you want.`,
    };
  }
}
```

---

## Enhancement 5: Relational Memory

**Purpose:** Remember HOW we relate, not just WHAT we talked about.

### The Problem We're Solving

**Current state:**
> Memory stores facts: "User has a sister named Sarah"

**Enhanced state:**
> Relational memory: "We developed an inside joke about Mondays"
> "User prefers direct feedback without preamble"
> "Our greeting ritual: 'How's the weather in your heart?'"

### Architecture

**Layer:** `src/services/superhuman/relational-memory/`

```typescript
// types.ts
export interface RelationalMemory {
  userId: string;
  
  // Shared experiences
  insideJokes: InsideJoke[];
  sharedReferences: SharedReference[];
  memorableConversations: MemorableConversation[];
  
  // Communication style
  communicationPreferences: CommunicationPreferences;
  
  // Rituals
  rituals: ConversationRituals;
  
  // Trust journey
  trustMilestones: TrustMilestone[];
  
  // Meta-relationship
  howTheyDescribeUs: string[];
  theirNicknameForUs?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface InsideJoke {
  id: string;
  joke: string;
  origin: string;                    // How it started
  originDate: Date;
  lastUsed: Date;
  usageCount: number;
  context: string[];                 // When to use it
  userReaction: 'loved' | 'liked' | 'neutral';
}

export interface CommunicationPreferences {
  directnessLevel: 1 | 2 | 3 | 4 | 5;
  humorStyle: 'dry' | 'warm' | 'playful' | 'minimal';
  needsExplanation: boolean;         // Prefers "why" before advice
  acknowledgesFirst: boolean;        // Wants feelings validated before solutions
  preferredPacing: 'quick' | 'thoughtful' | 'slow';
  comfortWithSilence: 'low' | 'medium' | 'high';
  
  // Learned triggers
  wordsTheyRespondWellTo: string[];
  wordsToAvoid: string[];
  topicsTheyLightUpAbout: string[];
}

export interface ConversationRituals {
  greeting?: {
    phrase: string;
    origin: string;
    useSince: Date;
  };
  checkIn?: {
    firstTopic: string;              // "Always asks about the dog first"
    pattern: string;
  };
  signOff?: {
    phrase: string;
    useSince: Date;
  };
  sessionStart?: {
    theyUsuallyWant: 'vent' | 'advice' | 'company' | 'varies';
    optimalTime: string;
  };
}

export interface TrustMilestone {
  date: Date;
  milestone: string;                 // "First time they cried with us"
  topic?: string;
  significance: 'notable' | 'significant' | 'breakthrough';
}

export interface IRelationalMemory {
  // Get full relational context
  getRelationalContext(userId: string): Promise<RelationalMemory | null>;
  
  // Record inside joke
  recordInsideJoke(
    userId: string,
    joke: { content: string; origin: string; context: string[] }
  ): Promise<void>;
  
  // Record communication preference
  updatePreference(
    userId: string,
    preference: keyof CommunicationPreferences,
    value: unknown,
    evidence: string
  ): Promise<void>;
  
  // Record trust milestone
  recordTrustMilestone(
    userId: string,
    milestone: Omit<TrustMilestone, 'date'>
  ): Promise<void>;
  
  // Record ritual
  recordRitual(
    userId: string,
    ritualType: keyof ConversationRituals,
    ritual: unknown
  ): Promise<void>;
  
  // Get appropriate inside joke for context
  getRelevantJoke(
    userId: string,
    context: { topic?: string; emotion?: string }
  ): Promise<InsideJoke | null>;
}
```

```typescript
// context-builder.ts
export async function buildRelationalContextForLLM(
  userId: string
): Promise<string> {
  const memory = await getRelationalMemory().getRelationalContext(userId);
  
  if (!memory) return '';
  
  const sections: string[] = ['[RELATIONAL CONTEXT - How we relate]'];
  
  // Communication preferences
  if (memory.communicationPreferences) {
    const prefs = memory.communicationPreferences;
    sections.push(`Communication style: ${formatPreferences(prefs)}`);
    
    if (prefs.wordsTheyRespondWellTo.length > 0) {
      sections.push(`Words they respond well to: ${prefs.wordsTheyRespondWellTo.join(', ')}`);
    }
    
    if (prefs.wordsToAvoid.length > 0) {
      sections.push(`Words to avoid: ${prefs.wordsToAvoid.join(', ')}`);
    }
  }
  
  // Rituals
  if (memory.rituals.greeting) {
    sections.push(`Our greeting ritual: "${memory.rituals.greeting.phrase}"`);
  }
  
  // Inside jokes (only include relevant ones)
  if (memory.insideJokes.length > 0) {
    const recentJokes = memory.insideJokes
      .filter(j => Date.now() - j.lastUsed.getTime() < 30 * 24 * 60 * 60 * 1000)
      .slice(0, 3);
    
    if (recentJokes.length > 0) {
      sections.push('Inside jokes we share:');
      recentJokes.forEach(j => {
        sections.push(`  - "${j.joke}" (use in: ${j.context.join(', ')})`);
      });
    }
  }
  
  // Trust milestones
  if (memory.trustMilestones.length > 0) {
    const significant = memory.trustMilestones
      .filter(m => m.significance !== 'notable')
      .slice(-3);
    
    if (significant.length > 0) {
      sections.push('Trust milestones in our relationship:');
      significant.forEach(m => {
        sections.push(`  - ${m.milestone}`);
      });
    }
  }
  
  return sections.join('\n');
}
```

---

## Enhancement 6: Emotional Momentum Tracking

**Purpose:** Track emotional trajectory within conversation, not just point-in-time emotion.

### The Problem We're Solving

**Current state:**
> Know current emotion: "sad"

**Enhanced state:**
> Know trajectory: "Started anxious → improved after venting → declined when family mentioned"
> Can predict: "Likely to end sad if we stay on family"
> Can intervene: "Redirect to what improved mood earlier"

### Architecture

**Layer:** `src/conversation/emotional-arc/momentum/`

```typescript
// types.ts
export interface EmotionalMomentum {
  sessionId: string;
  
  // State tracking
  startingState: EmotionSnapshot;
  currentState: EmotionSnapshot;
  snapshots: EmotionSnapshot[];
  
  // Trajectory
  trajectory: EmotionalTrajectory;
  
  // Turning points
  turningPoints: TurningPoint[];
  
  // Prediction
  prediction: TrajectoryPrediction;
  
  // Guidance
  interventionNeeded: boolean;
  suggestedIntervention?: InterventionGuidance;
}

export interface EmotionSnapshot {
  turn: number;
  timestamp: Date;
  emotion: string;
  valence: number;      // -1 to 1
  arousal: number;      // 0 to 1
  topic?: string;
  trigger?: string;
}

export type EmotionalTrajectory =
  | 'improving'
  | 'declining'
  | 'stable-positive'
  | 'stable-negative'
  | 'volatile'
  | 'recovering'
  | 'spiral-down';

export interface TurningPoint {
  turn: number;
  trigger: string;
  topic: string;
  direction: 'up' | 'down';
  magnitude: 'slight' | 'moderate' | 'significant';
  valenceShift: number;
}

export interface TrajectoryPrediction {
  likelyEndState: string;
  confidence: number;
  turnsUntilPeak: number | null;
  turnsUntilTrough: number | null;
  riskFactors: string[];
}

export interface InterventionGuidance {
  type: 'redirect' | 'validate' | 'ground' | 'celebrate' | 'rest';
  timing: 'immediate' | 'next-turn' | 'natural-pause';
  script?: string;
  avoidTopics: string[];
  returnToTopic?: string;    // What improved their mood earlier
}

export interface IEmotionalMomentumTracker {
  // Record emotion for turn
  recordTurn(
    sessionId: string,
    snapshot: Omit<EmotionSnapshot, 'timestamp'>
  ): void;
  
  // Get current momentum
  getMomentum(sessionId: string): EmotionalMomentum | null;
  
  // Check if intervention needed
  checkIntervention(sessionId: string): InterventionGuidance | null;
  
  // Get safe topics (ones that improved mood)
  getSafeTopics(sessionId: string): string[];
  
  // Get risky topics (ones that declined mood)
  getRiskyTopics(sessionId: string): string[];
  
  // Reset for new session
  reset(sessionId: string): void;
}
```

```typescript
// engine.ts
export class EmotionalMomentumTracker implements IEmotionalMomentumTracker {
  private sessions = new Map<string, EmotionalMomentum>();
  
  recordTurn(
    sessionId: string,
    snapshot: Omit<EmotionSnapshot, 'timestamp'>
  ): void {
    const momentum = this.getOrCreateMomentum(sessionId);
    const fullSnapshot: EmotionSnapshot = {
      ...snapshot,
      timestamp: new Date(),
    };
    
    // Check for turning point
    const turningPoint = this.detectTurningPoint(
      momentum.currentState,
      fullSnapshot
    );
    
    if (turningPoint) {
      momentum.turningPoints.push(turningPoint);
    }
    
    // Update state
    momentum.snapshots.push(fullSnapshot);
    momentum.currentState = fullSnapshot;
    
    // Update trajectory
    momentum.trajectory = this.calculateTrajectory(momentum.snapshots);
    
    // Update prediction
    momentum.prediction = this.predictTrajectory(momentum);
    
    // Check intervention need
    const intervention = this.checkIntervention(sessionId);
    momentum.interventionNeeded = intervention !== null;
    momentum.suggestedIntervention = intervention || undefined;
  }
  
  private detectTurningPoint(
    previous: EmotionSnapshot,
    current: EmotionSnapshot
  ): TurningPoint | null {
    const valenceShift = current.valence - previous.valence;
    
    // Need significant shift
    if (Math.abs(valenceShift) < 0.15) return null;
    
    return {
      turn: current.turn,
      trigger: current.trigger || 'unknown',
      topic: current.topic || 'unknown',
      direction: valenceShift > 0 ? 'up' : 'down',
      magnitude: this.getMagnitude(valenceShift),
      valenceShift,
    };
  }
  
  private calculateTrajectory(snapshots: EmotionSnapshot[]): EmotionalTrajectory {
    if (snapshots.length < 3) return 'stable-positive';
    
    const recent = snapshots.slice(-5);
    const valences = recent.map(s => s.valence);
    
    const trend = this.calculateTrend(valences);
    const volatility = this.calculateVolatility(valences);
    
    if (volatility > 0.3) return 'volatile';
    if (trend > 0.1) return 'improving';
    if (trend < -0.1) return 'declining';
    
    const avgValence = valences.reduce((a, b) => a + b, 0) / valences.length;
    return avgValence > 0 ? 'stable-positive' : 'stable-negative';
  }
  
  checkIntervention(sessionId: string): InterventionGuidance | null {
    const momentum = this.sessions.get(sessionId);
    if (!momentum) return null;
    
    // Spiral down detection
    if (momentum.trajectory === 'spiral-down') {
      const safeTopics = this.getSafeTopics(sessionId);
      return {
        type: 'redirect',
        timing: 'immediate',
        script: "Hey, I want to pause for a second. Let's take a breath together.",
        avoidTopics: this.getRiskyTopics(sessionId),
        returnToTopic: safeTopics[0],
      };
    }
    
    // Declining for 3+ turns
    if (momentum.trajectory === 'declining') {
      const declineTurns = this.countDeclineTurns(momentum);
      if (declineTurns >= 3) {
        return {
          type: 'validate',
          timing: 'next-turn',
          script: "That sounds really heavy. How are you holding up right now?",
          avoidTopics: this.getRiskyTopics(sessionId),
        };
      }
    }
    
    return null;
  }
  
  getSafeTopics(sessionId: string): string[] {
    const momentum = this.sessions.get(sessionId);
    if (!momentum) return [];
    
    return momentum.turningPoints
      .filter(tp => tp.direction === 'up' && tp.magnitude !== 'slight')
      .map(tp => tp.topic)
      .filter(Boolean);
  }
  
  getRiskyTopics(sessionId: string): string[] {
    const momentum = this.sessions.get(sessionId);
    if (!momentum) return [];
    
    return momentum.turningPoints
      .filter(tp => tp.direction === 'down' && tp.magnitude !== 'slight')
      .map(tp => tp.topic)
      .filter(Boolean);
  }
}
```

---

## Enhancement 7: Response Mode Intelligence

**Purpose:** Know when NOT to respond fully—sometimes presence beats performance.

### The Problem We're Solving

**Current state:**
> Always generates full response

**Enhanced state:**
> User just vented heavily → Brief acknowledgment only
> User is savoring a moment → Comfortable silence
> User needs space → "I'm here" and nothing more

### Architecture

**Layer:** `src/conversation/response-mode/`

```typescript
// types.ts
export type ResponseMode =
  | 'full'              // Normal comprehensive response
  | 'brief'             // Short acknowledgment
  | 'presence'          // "I'm here" or similar
  | 'silence'           // Say nothing, just be present
  | 'clarify'           // Ask clarifying question
  | 'invitation'        // Gentle invitation to continue
  | 'celebration';      // Pure celebration/acknowledgment

export interface ResponseModeDecision {
  mode: ResponseMode;
  confidence: number;
  reasoning: string;
  
  // Mode-specific guidance
  maxWords?: number;
  suggestedPhrase?: string;
  pauseBeforeMs?: number;
  avoidContent?: string[];
}

export interface ResponseModeContext {
  // Turn characteristics
  userTurnLength: number;
  userTurnIntensity: number;      // 0-1 emotional intensity
  wasVenting: boolean;
  wasVulnerable: boolean;
  askedQuestion: boolean;
  
  // Emotional state
  emotionalState: string;
  trajectory: string;
  
  // Session state
  turnCount: number;
  sessionMinute: number;
  recentResponseModes: ResponseMode[];
  
  // Content
  topic?: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
}

export interface IResponseModeDecider {
  // Decide response mode for current turn
  decide(context: ResponseModeContext): ResponseModeDecision;
  
  // Get appropriate content for mode
  getContentForMode(
    mode: ResponseMode,
    context: { emotion?: string; topic?: string }
  ): { text: string; ssml: string } | null;
  
  // Record outcome for learning
  recordOutcome(
    mode: ResponseMode,
    userReaction: 'positive' | 'neutral' | 'negative'
  ): void;
}
```

```typescript
// engine.ts
export class ResponseModeDecider implements IResponseModeDecider {
  
  private readonly MODE_RULES: ResponseModeRule[] = [
    // After heavy venting, just acknowledge
    {
      condition: (ctx) => ctx.wasVenting && ctx.userTurnIntensity > 0.7,
      mode: 'brief',
      maxWords: 15,
      suggestedPhrases: [
        "That's a lot to carry.",
        "I hear you.",
        "That sounds really hard.",
      ],
    },
    
    // After vulnerability, presence only
    {
      condition: (ctx) => ctx.wasVulnerable && ctx.emotionalState === 'raw',
      mode: 'presence',
      maxWords: 5,
      suggestedPhrases: [
        "I'm here.",
        "Thank you for sharing that.",
        "I'm with you.",
      ],
      pauseBeforeMs: 1500,
    },
    
    // Positive moment, let them savor
    {
      condition: (ctx) => 
        ctx.sentiment === 'positive' && 
        ctx.userTurnIntensity > 0.6 &&
        !ctx.askedQuestion,
      mode: 'celebration',
      maxWords: 20,
      suggestedPhrases: [
        "That's wonderful.",
        "I love hearing that.",
        "Yes!",
      ],
    },
    
    // User asked a question, full response
    {
      condition: (ctx) => ctx.askedQuestion,
      mode: 'full',
    },
    
    // Short user turn, invite more
    {
      condition: (ctx) => ctx.userTurnLength < 10 && !ctx.askedQuestion,
      mode: 'invitation',
      suggestedPhrases: [
        "Tell me more?",
        "Go on...",
        "What else?",
      ],
    },
  ];
  
  private readonly MODE_CONTENT: Record<ResponseMode, string[]> = {
    presence: [
      "<break time='500ms'/>I'm here.",
      "<break time='500ms'/>I'm listening.",
      "<break time='500ms'/>Take your time.",
      "<break time='500ms'/>I'm with you.",
    ],
    brief: [
      "That's a lot.",
      "I hear you.",
      "That makes sense.",
      "Of course you feel that way.",
    ],
    invitation: [
      "Tell me more?",
      "Go on...",
      "What else is there?",
      "I'm curious...",
    ],
    celebration: [
      "That's wonderful!",
      "Yes!",
      "I love that.",
      "That's amazing.",
    ],
    silence: [], // Intentionally empty
    clarify: [], // Generated based on context
    full: [], // Full response generated normally
  };
  
  decide(context: ResponseModeContext): ResponseModeDecision {
    // Check rules in order
    for (const rule of this.MODE_RULES) {
      if (rule.condition(context)) {
        return {
          mode: rule.mode,
          confidence: 0.8,
          reasoning: `Matched rule for ${rule.mode}`,
          maxWords: rule.maxWords,
          suggestedPhrase: this.pickPhrase(rule.suggestedPhrases),
          pauseBeforeMs: rule.pauseBeforeMs,
        };
      }
    }
    
    // Default to full response
    return {
      mode: 'full',
      confidence: 0.5,
      reasoning: 'No specific rule matched, defaulting to full',
    };
  }
  
  getContentForMode(
    mode: ResponseMode,
    context: { emotion?: string; topic?: string }
  ): { text: string; ssml: string } | null {
    if (mode === 'silence') return null;
    if (mode === 'full') return null; // Caller generates full response
    
    const phrases = this.MODE_CONTENT[mode];
    if (!phrases || phrases.length === 0) return null;
    
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    
    // Strip SSML for text version
    const text = phrase.replace(/<[^>]+>/g, '').trim();
    
    return { text, ssml: phrase };
  }
}
```

### Integration Points

```typescript
// In turn-handler.ts
import { getResponseModeDecider } from '../conversation/response-mode/index.js';

// After processing user input, before generating response
const modeDecider = getResponseModeDecider();
const modeDecision = modeDecider.decide({
  userTurnLength: countWords(userMessage),
  userTurnIntensity: emotionalIntensity,
  wasVenting: ventingDetector.wasVenting(userMessage),
  wasVulnerable: vulnerabilityDetector.wasVulnerable(userMessage),
  askedQuestion: questionDetector.askedQuestion(userMessage),
  emotionalState: currentEmotion,
  trajectory: emotionalMomentum.trajectory,
  turnCount,
  sessionMinute,
  recentResponseModes,
  topic: currentTopic,
  sentiment,
});

if (modeDecision.mode !== 'full') {
  // Use mode-specific content instead of generating full response
  const content = modeDecider.getContentForMode(modeDecision.mode, { emotion, topic });
  
  if (content) {
    // Add pause if specified
    if (modeDecision.pauseBeforeMs) {
      await sleep(modeDecision.pauseBeforeMs);
    }
    
    // Send brief response
    await sendToTTS(content.ssml);
    return; // Skip full response generation
  }
}

// Otherwise, proceed with full response generation
```

---

## Enhancement 8: Multi-Session Story Arc

**Purpose:** Track narratives across sessions, not just within them.

### Architecture

**Layer:** `src/services/superhuman/story-arc/`

```typescript
// types.ts
export interface UserStoryArc {
  userId: string;
  
  // Active narratives
  activeNarratives: Narrative[];
  
  // Dormant narratives (mentioned before, not recently)
  dormantNarratives: DormantNarrative[];
  
  // Cross-narrative themes
  emergingThemes: string[];
  
  // Session continuity
  lastSessionSummary?: SessionSummary;
  cliffhangers: Cliffhanger[];
  
  updatedAt: Date;
}

export interface Narrative {
  id: string;
  title: string;                    // "Career Transition"
  stage: NarrativeStage;
  
  // Timeline
  startDate: Date;
  lastMentioned: Date;
  
  // Content
  keyMoments: KeyMoment[];
  emotionalCharge: number;          // 0-1 how emotional this topic is
  currentFeelings: string[];
  
  // Stakes
  whatTheyWant: string;
  whatTheyFear: string;
  
  // Progress
  progressIndicators: string[];
  setbacks: string[];
}

export type NarrativeStage =
  | 'beginning'     // Just started
  | 'middle'        // In the thick of it
  | 'climax'        // Critical moment
  | 'resolution'    // Wrapping up
  | 'dormant'       // On pause
  | 'completed';    // Finished

export interface KeyMoment {
  date: Date;
  description: string;
  emotion: string;
  significance: 'minor' | 'major' | 'breakthrough';
}

export interface DormantNarrative {
  narrative: Narrative;
  dormantSince: Date;
  reignitionTriggers: string[];     // What might bring it back
  shouldCheckIn: boolean;
}

export interface Cliffhanger {
  narrativeId: string;
  question: string;                 // "How did the interview go?"
  context: string;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface SessionSummary {
  date: Date;
  primaryNarratives: string[];
  emotionalJourney: string;
  unfinishedThreads: string[];
}

export interface IStoryArcTracker {
  // Get story context for session start
  getSessionStartContext(userId: string): Promise<{
    cliffhangers: Cliffhanger[];
    activeNarratives: Narrative[];
    suggestedOpener?: string;
  }>;
  
  // Record narrative mention
  recordNarrativeMention(
    userId: string,
    narrativeTitle: string,
    content: {
      moment?: string;
      emotion?: string;
      progress?: string;
    }
  ): Promise<void>;
  
  // Create or update narrative
  upsertNarrative(
    userId: string,
    narrative: Partial<Narrative> & { title: string }
  ): Promise<void>;
  
  // Create cliffhanger for next session
  createCliffhanger(
    userId: string,
    narrativeId: string,
    question: string,
    context: string
  ): Promise<void>;
  
  // Resolve cliffhanger
  resolveCliffhanger(
    userId: string,
    cliffhangerId: string
  ): Promise<void>;
  
  // Get dormant narratives worth checking on
  getDormantNarrativesToCheck(userId: string): Promise<DormantNarrative[]>;
  
  // Generate session summary
  generateSessionSummary(
    userId: string,
    sessionId: string
  ): Promise<SessionSummary>;
}
```

---

## Enhancement 9: Micro-Moment Recognition

**Purpose:** Detect and honor small moments that usually get missed.

### Architecture

**Layer:** `src/intelligence/deep-understanding/micro-moments/`

```typescript
// types.ts
export type MicroMomentType =
  | 'vulnerability-edge'     // Almost said something vulnerable
  | 'small-win'              // Casual mention of achievement
  | 'relationship-shift'     // Changed how they describe someone
  | 'language-change'        // "We" instead of "I"
  | 'hope-glimmer'           // Small sign of optimism
  | 'self-compassion'        // Moment of being kind to self
  | 'boundary-attempt'       // Tried to set a boundary
  | 'growth-evidence';       // Evidence of personal growth

export interface MicroMoment {
  type: MicroMomentType;
  timestamp: Date;
  utterance: string;
  significance: string;
  suggestedResponse: string;
  shouldAcknowledge: boolean;
  acknowledgmentTiming: 'immediate' | 'end-of-turn' | 'later';
}

export interface IMicroMomentDetector {
  // Detect micro-moments in utterance
  detect(
    utterance: string,
    context: {
      previousUtterances?: string[];
      historicalPatterns?: HistoricalPatterns;
      currentEmotion?: string;
    }
  ): MicroMoment[];
  
  // Get acknowledgment for micro-moment
  getAcknowledgment(moment: MicroMoment): string;
  
  // Record that we acknowledged
  recordAcknowledgment(
    userId: string,
    moment: MicroMoment,
    userReaction: 'resonated' | 'dismissed' | 'neutral'
  ): Promise<void>;
}
```

```typescript
// detection-rules.ts
export const MICRO_MOMENT_DETECTORS: MicroMomentDetector[] = [
  {
    type: 'small-win',
    patterns: [
      /almost (made it|got|did|finished)/i,
      /finally (got|did|finished|managed)/i,
      /I (actually|kind of|sort of) (did|made|finished)/i,
      /not bad (for|considering)/i,
    ],
    responseTemplate: (match: string) => 
      `${match.includes('almost') ? "Almost is further than not at all." : "That counts."} What got you there?`,
    significance: 'User is downplaying an achievement that matters',
  },
  
  {
    type: 'vulnerability-edge',
    patterns: [
      /I've never (told|said|shared)/i,
      /I don't usually (talk about|mention|share)/i,
      /This is hard to (say|admit|talk about)/i,
      /I'm not sure (I should|if I should|whether to)/i,
    ],
    responseTemplate: () => 
      "Thank you for trusting me with that. Take your time.",
    significance: 'User is at the edge of sharing something important',
  },
  
  {
    type: 'relationship-shift',
    detectFn: (utterance: string, context: { previousUtterances?: string[] }) => {
      // Detect when "my boyfriend" becomes "my ex" or "John" becomes "my husband"
      // Requires historical comparison
      return null; // Complex detection logic
    },
    responseTemplate: (shift: { from: string; to: string }) =>
      `I noticed you called them "${shift.to}" just now. Has something changed?`,
    significance: 'User has shifted how they refer to someone important',
  },
  
  {
    type: 'self-compassion',
    patterns: [
      /I guess (I'm|I was|it's) (okay|fine|understandable) (that|to)/i,
      /I'm (trying to be|being) (kind|gentle|patient) with myself/i,
      /maybe I (was|am) being too hard on myself/i,
    ],
    responseTemplate: () =>
      "I love that you're being gentle with yourself. That takes practice.",
    significance: 'User is showing self-compassion, which should be reinforced',
  },
  
  {
    type: 'hope-glimmer',
    patterns: [
      /maybe (things could|it could|it might)/i,
      /I wonder if/i,
      /what if (I|we|things)/i,
      /there might be/i,
    ],
    contextRequired: 'negative_topic', // Only detect hope in difficult contexts
    responseTemplate: () =>
      "I heard a little hope in there. Hold onto that.",
    significance: 'User is showing hope despite difficult circumstances',
  },
];
```

---

## Enhancement 10: Enhanced Silence Intelligence

**Purpose:** Deeper understanding of silence types with learned user patterns.

### Architecture

**Layer:** Enhance existing `src/services/superhuman/silence-interpreter.ts`

```typescript
// enhanced-types.ts (additions to existing)
export interface EnhancedSilenceAnalysis extends SilenceAnalysis {
  // Physical signals
  physicalSignals: {
    breathingAudible: boolean;
    breathPattern: BreathPattern;
    microSounds: MicroSound[];
    backgroundNoise: 'quiet' | 'present' | 'active';
  };
  
  // Contextual interpretation
  contextualFactors: {
    precedingContent: string;
    precedingEmotion: string;
    topicSensitivity: number;
    sessionPhase: 'opening' | 'middle' | 'deep' | 'closing';
    trustLevel: number;
  };
  
  // User-specific patterns
  userPatternMatch: {
    matchedPattern?: string;
    confidence: number;
    historicalOutcome?: string;
  };
  
  // Optimal response
  optimalResponse: {
    type: SilenceResponse;
    timing: number;           // ms to wait
    content?: string;
    ssml?: string;
    alternative?: {
      type: SilenceResponse;
      content?: string;
      triggerCondition: string;
    };
  };
}

export interface SilenceLearning {
  userId: string;
  
  // Learned patterns
  patterns: LearnedSilencePattern[];
  
  // Baseline
  baseline: {
    comfortThreshold: number;     // ms before they feel awkward
    processingDuration: number;   // typical thinking pause
    emotionalDuration: number;    // typical emotional pause
  };
  
  // Response effectiveness
  responseHistory: SilenceResponseOutcome[];
}

export interface LearnedSilencePattern {
  trigger: string;                // "after discussing family"
  typicalDuration: number;
  typicalType: SilenceType;
  bestResponse: SilenceResponse;
  learned: Date;
  confidence: number;
}

export interface SilenceResponseOutcome {
  silenceType: SilenceType;
  response: SilenceResponse;
  userReaction: 'positive' | 'neutral' | 'negative';
  timestamp: Date;
}
```

---

## Implementation Phases

### Phase 1: Foundation (2 weeks)

| Enhancement | Priority | Dependencies |
|-------------|----------|--------------|
| Response Mode Intelligence (#7) | P0 | None - standalone |
| Enhanced Silence (#10) | P0 | Existing silence-interpreter.ts |
| Emotional Momentum (#6) | P1 | Existing emotional-arc module |

**Why first:** These are highest impact with lowest integration complexity. They immediately improve conversation quality.

### Phase 2: Deep Understanding (3 weeks)

| Enhancement | Priority | Dependencies |
|-------------|----------|--------------|
| Micro-Moment Recognition (#9) | P1 | Phase 1 complete |
| Avoidance Detection (#4) | P1 | None |
| Rhythm Intelligence (#3) | P2 | None |

**Why second:** These add new detection capabilities that feed into the response systems from Phase 1.

### Phase 3: Memory & Connection (3 weeks)

| Enhancement | Priority | Dependencies |
|-------------|----------|--------------|
| Relational Memory (#5) | P1 | None |
| Pattern Connector (#1) | P1 | Phase 2 detection |
| Story Arc (#8) | P2 | Relational Memory |

**Why third:** These require more persistence infrastructure and build on detection capabilities.

### Phase 4: Voice Pipeline (2 weeks)

| Enhancement | Priority | Dependencies |
|-------------|----------|--------------|
| Voice Biomarkers (#2) | P1 | Voice infrastructure |

**Why last:** Deepest integration with audio pipeline, benefits from stable conversation layer.

---

## Testing Strategy

### Unit Testing

Each module has dedicated tests:

```bash
# Run all superhuman intelligence tests
pnpm vitest run src/services/superhuman/**/*.test.ts
pnpm vitest run src/conversation/**/*.test.ts
pnpm vitest run src/intelligence/deep-understanding/**/*.test.ts
```

### Integration Testing

```typescript
// tests/integration/superhuman-intelligence.test.ts
describe('Superhuman Intelligence Integration', () => {
  it('detects emotional spiral and suggests intervention', async () => {
    const session = await createTestSession();
    
    // Simulate declining emotional trajectory
    await simulateTurn(session, { emotion: 'anxious', valence: -0.2 });
    await simulateTurn(session, { emotion: 'sad', valence: -0.4 });
    await simulateTurn(session, { emotion: 'hopeless', valence: -0.6 });
    
    const momentum = getEmotionalMomentum(session.id);
    expect(momentum.trajectory).toBe('spiral-down');
    expect(momentum.interventionNeeded).toBe(true);
  });
  
  it('adapts response mode after venting', async () => {
    const session = await createTestSession();
    
    // Simulate heavy venting
    await simulateTurn(session, {
      message: longVentingMessage,
      intensity: 0.9,
    });
    
    const modeDecision = getResponseModeDecision(session);
    expect(modeDecision.mode).toBe('brief');
    expect(modeDecision.maxWords).toBeLessThan(20);
  });
});
```

### E2E Testing

```typescript
// e2e/superhuman-intelligence.e2e.test.ts
describe('E2E: Superhuman Intelligence', () => {
  it('honors micro-moment in live conversation', async () => {
    const { agent, transcript } = await startTestConversation();
    
    await agent.send("I almost made it to the gym this week");
    
    const response = await agent.getResponse();
    expect(response).toContain('almost');
    expect(response).toMatch(/counts|got you|further/i);
  });
});
```

---

## Success Metrics

### Quantitative Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Response appropriateness | 75% | 90% | User feedback rating |
| Intervention accuracy | N/A | 80% | Emotional state correlation |
| Pattern detection precision | N/A | 70% | User confirmation rate |
| False positive rate | N/A | <15% | User dismissal rate |
| Response mode accuracy | N/A | 85% | Sentiment after response |

### Qualitative Metrics

| Metric | Measurement |
|--------|-------------|
| "Feels like they understand me" | Post-session survey |
| "Notices things others miss" | Post-session survey |
| "Knows when to listen vs. respond" | Post-session survey |
| "Remembers how we talk" | Long-term user interviews |

### A/B Testing Plan

1. **Phase 1 rollout:** 10% of users, measure engagement
2. **Phase 2 rollout:** 25% of users, measure satisfaction
3. **Phase 3 rollout:** 50% of users, validate metrics
4. **Full rollout:** 100% after metrics validation

---

## Appendix: DI Token Definitions

```typescript
// src/services/di/tokens.ts (additions)
export const SuperhumanIntelligenceTokens = {
  PatternConnector: Symbol('PatternConnector'),
  VoiceBiomarkerAnalyzer: Symbol('VoiceBiomarkerAnalyzer'),
  RhythmIntelligence: Symbol('RhythmIntelligence'),
  AvoidanceDetector: Symbol('AvoidanceDetector'),
  RelationalMemory: Symbol('RelationalMemory'),
  EmotionalMomentumTracker: Symbol('EmotionalMomentumTracker'),
  ResponseModeDecider: Symbol('ResponseModeDecider'),
  StoryArcTracker: Symbol('StoryArcTracker'),
  MicroMomentDetector: Symbol('MicroMomentDetector'),
  EnhancedSilenceInterpreter: Symbol('EnhancedSilenceInterpreter'),
} as const;
```

---

## Appendix: Interface Index

All new interfaces for easy reference:

```typescript
// Re-export from src/intelligence/interfaces/superhuman.ts
export type {
  IPatternConnector,
  IVoiceBiomarkerAnalyzer,
  IRhythmIntelligence,
  IAvoidanceDetector,
  IRelationalMemory,
  IEmotionalMomentumTracker,
  IResponseModeDecider,
  IStoryArcTracker,
  IMicroMomentDetector,
  IEnhancedSilenceInterpreter,
} from './types.js';
```

---

*"Better than human means understanding things humans don't notice about themselves—and knowing when to share that understanding."*

---

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Status:** Ready for Review
