# Ferni Dynamic Intelligence Plan

> **"We are all broken in different ways—that's what makes us both human and beautiful."**
>
> Ferni shouldn't recite wisdom. Ferni should *see* you—notice what you don't notice about yourself, remember what you forgot you told him, and ask the question that changes everything.

**Version:** 1.0  
**Date:** January 2026  
**Status:** 🟢 Ready for Implementation  
**Priority:** P0 (Core Platform)  
**Estimated Effort:** 4-6 weeks  
**Owner:** Architecture Team

---

## Executive Summary

This plan transforms Ferni from a **template-driven** persona to a **dynamically intelligent** coach who:

1. **Generates insights on-the-fly** instead of selecting from templates
2. **Learns what works** for each individual user
3. **Remembers patterns across sessions** (not just within)
4. **Proactively surfaces observations** before users articulate them
5. **Adapts conversation intensity** based on real-time signals
6. **Orchestrates capabilities** coherently across turns

### Core Philosophy Alignment

| Principle | How This Plan Delivers |
|-----------|------------------------|
| **Human Connection Over Technical Perfection** | Generated insights feel spontaneous, not scripted |
| **Relationship Over Transaction** | Cross-session learning builds genuine knowledge of each user |
| **Growth Through Gentleness** | Adaptive intensity respects user's current capacity |
| **Authentic Personality** | Insights emerge from Ferni's voice, not generic templates |
| **Presence Over Performance** | Knows when to observe vs. when to surface |

### What "Dynamic Intelligence" Means

```
BEFORE (Static)                          AFTER (Dynamic)
─────────────────                        ────────────────
Template: "I noticed you mention         Generated: "This is the fourth time you've
{topic} often..."                        brought up your sister when we talk about
                                         work. I'm not sure if you notice that."

Fixed 20% trigger probability            Adaptive: 8% for guarded users,
                                                   35% for receptive users

Session-scoped emotional tracking        Cross-session: "Last time we talked about
                                         your mom, your energy dropped. Should I
                                         tread carefully there?"

90+ builders run independently           Orchestrated: "I have something I noticed,
                                         but first—how are you, really?"
```

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Cross-Session Pattern Memory](#phase-1-cross-session-pattern-memory)
3. [Phase 2: Response Quality Learning](#phase-2-response-quality-learning)
4. [Phase 3: Generated Insight Engine](#phase-3-generated-insight-engine)
5. [Phase 4: Adaptive Intensity System](#phase-4-adaptive-intensity-system)
6. [Phase 5: Builder Orchestration](#phase-5-builder-orchestration)
7. [Phase 6: Production Validation](#phase-6-production-validation)
8. [E2E Wiring](#e2e-wiring)
9. [Audit Checklist](#audit-checklist)
10. [Success Metrics](#success-metrics)
11. [Risk Assessment](#risk-assessment)

---

## Architecture Overview

### Layer Placement

All enhancements integrate with existing architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AGENTS (Level 100)                                │
│  turn-processor.ts, turn-handler.ts                                      │
│  ▲ Consumes orchestrated intelligence, makes final decisions             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                   NEW: ORCHESTRATION LAYER (Level 85)                    │
│  builder-orchestrator.ts — coordinates what surfaces when                │
│  intensity-controller.ts — adapts feature intensity                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                      INTELLIGENCE (Level 70)                             │
│  NEW: generated-insight-engine.ts — LLM-powered insight generation       │
│  Existing: Pattern Connector, Proactive Engine, Cross-Domain Correlator  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                      CONVERSATION (Level 70)                             │
│  Existing: Rhythm Intelligence, Response Mode, Emotional Arc             │
│  Enhanced: Adaptive triggers, orchestration hooks                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                       SERVICES (Level 60)                                │
│  NEW: response-quality-learning.ts — tracks what works                   │
│  NEW: user-profile-intelligence.ts — cross-session patterns              │
│  Existing: Superhuman Services, Silence Interpreter                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                        MEMORY (Level 30)                                 │
│  NEW: pattern-memory collection — cross-session patterns                 │
│  NEW: response-outcomes collection — quality feedback loop               │
│  Existing: Firestore, Spanner Graph, Dynamic Memory                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Dependency Inversion**: All modules expose interfaces, implementations are injected
3. **Result Types**: Functions return `Result<T, E>` for expected failures
4. **Session + Persistent Scoping**: Session state + cross-session memory
5. **Feedback Loops**: Every insight generates learnable outcomes
6. **Graceful Degradation**: Falls back to existing behavior if new systems fail

### File Organization Pattern

```
src/intelligence/dynamic/
├── types.ts                      # Shared type definitions
├── constants.ts                  # Thresholds, templates, config
├── index.ts                      # Barrel exports + factories
│
├── pattern-memory/               # Phase 1: Cross-session patterns
│   ├── types.ts
│   ├── persistence.ts
│   ├── engine.ts
│   ├── integration.ts
│   └── __tests__/
│
├── quality-learning/             # Phase 2: Response quality tracking
│   ├── types.ts
│   ├── persistence.ts
│   ├── engine.ts
│   ├── integration.ts
│   └── __tests__/
│
├── insight-generation/           # Phase 3: LLM-powered insights
│   ├── types.ts
│   ├── prompts.ts
│   ├── engine.ts
│   ├── integration.ts
│   └── __tests__/
│
├── adaptive-intensity/           # Phase 4: Dynamic feature intensity
│   ├── types.ts
│   ├── engine.ts
│   ├── integration.ts
│   └── __tests__/
│
└── orchestration/                # Phase 5: Builder coordination
    ├── types.ts
    ├── orchestrator.ts
    ├── conflict-resolver.ts
    └── __tests__/
```

---

## Phase 1: Cross-Session Pattern Memory

**Goal**: Remember emotional patterns, topic effects, and communication preferences across sessions.

**Timeline**: Week 1-2

### The Problem

Current state: Emotional momentum, topic effects, and patterns reset every session.

```typescript
// Today: Session-scoped (lost on disconnect)
emotionalMomentumTracker.trajectory // Resets each session

// Goal: Persistent cross-session intelligence
userPatternProfile.topicEffects['mom'] // 'worsens' — learned over 5 sessions
userPatternProfile.communicationPreferences.questionTolerance // 3 — before pushback
```

### Architecture

**Layer**: `src/intelligence/dynamic/pattern-memory/`

#### Types

```typescript
// types.ts
export interface UserPatternProfile {
  userId: string;
  
  // Emotional patterns across sessions
  emotionalSequences: EmotionalSequence[];
  
  // What topics improve vs worsen mood
  topicEffects: Map<string, TopicEffect>;
  
  // Communication preferences learned over time
  communicationPreferences: CommunicationPreferences;
  
  // What interventions have worked
  successfulInterventions: InterventionOutcome[];
  
  // Metadata
  sessionsAnalyzed: number;
  lastUpdated: Date;
  confidence: number; // 0-1, increases with more data
}

export interface EmotionalSequence {
  trigger: string;           // "work_deadline_mention"
  typicalPath: string[];     // ["stress", "family_deflection", "spiral"]
  occurrences: number;
  successfulInterventions: string[];
  lastObserved: Date;
}

export interface TopicEffect {
  topic: string;
  effect: 'improves' | 'worsens' | 'neutral' | 'volatile';
  confidence: number;
  observations: number;
  avgEmotionalShift: number; // -1 to +1
  lastObserved: Date;
}

export interface CommunicationPreferences {
  preferredResponseLength: 'brief' | 'medium' | 'detailed';
  questionTolerance: number;        // Questions before pushback (1-10)
  humorReceptivity: number;         // 0-1
  directnessPreference: number;     // 0=gentle, 1=direct
  silenceComfort: number;           // How long they tolerate pauses (seconds)
  probeReceptivity: number;         // How they respond to "I notice..." (0-1)
}

export interface InterventionOutcome {
  intervention: string;      // "grounding_exercise", "reframe", "validation"
  context: string;           // "spiral_detected", "high_stress"
  outcome: 'effective' | 'neutral' | 'ineffective';
  userReaction: string;      // Brief description
  timestamp: Date;
}

// Interface for dependency injection
export interface IPatternMemory {
  getProfile(userId: string): Promise<UserPatternProfile | null>;
  
  recordSessionPatterns(
    userId: string,
    sessionSummary: SessionPatternSummary
  ): Promise<void>;
  
  getTopicEffect(userId: string, topic: string): Promise<TopicEffect | null>;
  
  getSuccessfulInterventions(
    userId: string,
    context: string
  ): Promise<string[]>;
  
  getCommunicationPreferences(userId: string): Promise<CommunicationPreferences>;
}
```

#### Engine

```typescript
// engine.ts
import { createLogger } from '../../../utils/safe-logger.js';
import type { 
  IPatternMemory, 
  UserPatternProfile, 
  SessionPatternSummary,
  TopicEffect 
} from './types.js';
import { PatternMemoryPersistence } from './persistence.js';

const log = createLogger({ module: 'PatternMemoryEngine' });

export class PatternMemoryEngine implements IPatternMemory {
  private readonly persistence: PatternMemoryPersistence;
  private readonly MIN_SESSIONS_FOR_CONFIDENCE = 3;
  private readonly DECAY_RATE = 0.95; // Per week
  
  constructor(persistence: PatternMemoryPersistence) {
    this.persistence = persistence;
  }
  
  async getProfile(userId: string): Promise<UserPatternProfile | null> {
    const profile = await this.persistence.loadProfile(userId);
    if (!profile) return null;
    
    // Apply time-based decay to confidence
    return this.applyConfidenceDecay(profile);
  }
  
  async recordSessionPatterns(
    userId: string,
    sessionSummary: SessionPatternSummary
  ): Promise<void> {
    log.info({ userId, turnCount: sessionSummary.turnCount }, 
      'Recording session patterns');
    
    const existing = await this.persistence.loadProfile(userId);
    const profile = existing ?? this.createEmptyProfile(userId);
    
    // Update emotional sequences
    this.updateEmotionalSequences(profile, sessionSummary);
    
    // Update topic effects
    this.updateTopicEffects(profile, sessionSummary);
    
    // Update communication preferences
    this.updateCommunicationPreferences(profile, sessionSummary);
    
    // Update intervention outcomes
    this.updateInterventions(profile, sessionSummary);
    
    // Recalculate confidence
    profile.sessionsAnalyzed++;
    profile.confidence = this.calculateConfidence(profile);
    profile.lastUpdated = new Date();
    
    await this.persistence.saveProfile(profile);
    
    log.info({ 
      userId, 
      confidence: profile.confidence,
      topicEffectsCount: profile.topicEffects.size 
    }, 'Pattern profile updated');
  }
  
  async getTopicEffect(
    userId: string, 
    topic: string
  ): Promise<TopicEffect | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    
    // Exact match
    const direct = profile.topicEffects.get(topic);
    if (direct && direct.confidence > 0.5) return direct;
    
    // Fuzzy match (family → mom, dad, sister, brother)
    const related = this.findRelatedTopicEffect(profile, topic);
    if (related && related.confidence > 0.5) return related;
    
    return null;
  }
  
  async getSuccessfulInterventions(
    userId: string,
    context: string
  ): Promise<string[]> {
    const profile = await this.getProfile(userId);
    if (!profile) return [];
    
    return profile.successfulInterventions
      .filter(i => i.context === context && i.outcome === 'effective')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5)
      .map(i => i.intervention);
  }
  
  async getCommunicationPreferences(
    userId: string
  ): Promise<CommunicationPreferences> {
    const profile = await this.getProfile(userId);
    
    // Return defaults if no profile or low confidence
    if (!profile || profile.confidence < 0.3) {
      return this.getDefaultPreferences();
    }
    
    return profile.communicationPreferences;
  }
  
  // --- Private helpers ---
  
  private updateTopicEffects(
    profile: UserPatternProfile,
    session: SessionPatternSummary
  ): void {
    for (const [topic, shifts] of Object.entries(session.topicEmotionalShifts)) {
      const existing = profile.topicEffects.get(topic);
      const avgShift = shifts.reduce((a, b) => a + b, 0) / shifts.length;
      
      if (existing) {
        // Weighted running average
        const totalObs = existing.observations + shifts.length;
        existing.avgEmotionalShift = 
          (existing.avgEmotionalShift * existing.observations + avgShift * shifts.length) 
          / totalObs;
        existing.observations = totalObs;
        existing.effect = this.categorizeEffect(existing.avgEmotionalShift);
        existing.confidence = Math.min(0.95, existing.observations / 10);
        existing.lastObserved = new Date();
      } else {
        profile.topicEffects.set(topic, {
          topic,
          effect: this.categorizeEffect(avgShift),
          confidence: shifts.length / 10,
          observations: shifts.length,
          avgEmotionalShift: avgShift,
          lastObserved: new Date()
        });
      }
    }
  }
  
  private categorizeEffect(avgShift: number): TopicEffect['effect'] {
    if (avgShift > 0.2) return 'improves';
    if (avgShift < -0.2) return 'worsens';
    if (Math.abs(avgShift) < 0.1) return 'neutral';
    return 'volatile';
  }
  
  private getDefaultPreferences(): CommunicationPreferences {
    return {
      preferredResponseLength: 'medium',
      questionTolerance: 5,
      humorReceptivity: 0.5,
      directnessPreference: 0.5,
      silenceComfort: 3,
      probeReceptivity: 0.5
    };
  }
  
  // ... additional private methods
}
```

#### Integration

```typescript
// integration.ts
import type { SessionServices } from '../../../agents/shared/interfaces/session-services.js';
import type { PatternMemoryEngine } from './engine.js';
import type { SessionPatternSummary } from './types.js';

/**
 * Hook called at session end to record patterns
 */
export async function recordSessionPatternsOnEnd(
  patternMemory: PatternMemoryEngine,
  sessionServices: SessionServices,
  sessionId: string
): Promise<void> {
  const userId = sessionServices.userId;
  
  // Build session summary from tracked data
  const summary: SessionPatternSummary = {
    sessionId,
    turnCount: sessionServices.turnCount,
    duration: Date.now() - sessionServices.sessionStartTime,
    
    // From emotional arc tracker
    emotionalTrajectory: sessionServices.emotionalArc?.trajectory ?? 'stable',
    turningPoints: sessionServices.emotionalArc?.turningPoints ?? [],
    
    // From topic tracker (built during session)
    topicEmotionalShifts: sessionServices.topicTracker?.getShifts() ?? {},
    
    // From response tracker
    responseOutcomes: sessionServices.responseTracker?.getOutcomes() ?? [],
    
    // From intervention tracker
    interventionsUsed: sessionServices.interventionTracker?.getUsed() ?? []
  };
  
  await patternMemory.recordSessionPatterns(userId, summary);
}

/**
 * Context builder that injects pattern memory into turn processing
 */
export function createPatternMemoryContextBuilder(
  patternMemory: PatternMemoryEngine
) {
  return async (input: ContextBuilderInput): Promise<ContextInjection | null> => {
    const { userId, userText, sessionState } = input;
    
    // Get user's pattern profile
    const profile = await patternMemory.getProfile(userId);
    if (!profile || profile.confidence < 0.3) {
      return null; // Not enough data yet
    }
    
    // Check if current topic has known effects
    const detectedTopics = extractTopics(userText);
    const sensitiveTopics: string[] = [];
    
    for (const topic of detectedTopics) {
      const effect = await patternMemory.getTopicEffect(userId, topic);
      if (effect?.effect === 'worsens') {
        sensitiveTopics.push(topic);
      }
    }
    
    if (sensitiveTopics.length === 0) return null;
    
    // Inject behavioral guidance
    return {
      id: 'pattern-memory-awareness',
      priority: 75,
      injection: {
        type: 'behavioral',
        guidance: `[CROSS-SESSION AWARENESS]
Topics "${sensitiveTopics.join(', ')}" have historically lowered this user's mood.
Approach with extra gentleness. Watch for emotional shifts.
If they seem to be declining, consider: ${
          (await patternMemory.getSuccessfulInterventions(userId, 'declining'))
            .slice(0, 2).join(', ') || 'validation, gentle redirection'
        }`
      }
    };
  };
}
```

### Persistence Schema (Firestore)

```
users/{userId}/intelligence/patternProfile
{
  userId: string,
  emotionalSequences: EmotionalSequence[],
  topicEffects: { [topic: string]: TopicEffect },
  communicationPreferences: CommunicationPreferences,
  successfulInterventions: InterventionOutcome[],
  sessionsAnalyzed: number,
  lastUpdated: Timestamp,
  confidence: number
}
```

### Tasks

| Task | Description | Est. |
|------|-------------|------|
| 1.1 | Create types.ts with all interfaces | 2h |
| 1.2 | Implement persistence.ts (Firestore) | 3h |
| 1.3 | Build PatternMemoryEngine | 6h |
| 1.4 | Create integration hooks for session end | 3h |
| 1.5 | Build context builder for turn injection | 4h |
| 1.6 | Add topic tracker to session services | 3h |
| 1.7 | Write unit tests (engine) | 4h |
| 1.8 | Write integration tests | 3h |
| 1.9 | Wire into turn-processor.ts | 2h |

### Deliverables

- [ ] `src/intelligence/dynamic/pattern-memory/` module
- [ ] Context builder registered in loader.ts
- [ ] Session end hook in end-session.ts
- [ ] Unit tests with >80% coverage
- [ ] Integration test with Firestore emulator

---

## Phase 2: Response Quality Learning

**Goal**: Track which response types resonate with each user and adapt accordingly.

**Timeline**: Week 2-3

### The Problem

Current state: No feedback loop. We don't know if our responses worked.

```typescript
// Today: Fire and forget
generateResponse(context); // Did this help? 🤷

// Goal: Learn from outcomes
responseQuality.recordOutcome({
  responseType: 'insight_with_question',
  userEngaged: true,         // They responded at length
  askedFollowUp: true,       // They wanted more
  emotionalShift: +0.3       // Mood improved
});
// → "For this user, insight_with_question works 2x better than direct_question"
```

### Architecture

**Layer**: `src/intelligence/dynamic/quality-learning/`

#### Types

```typescript
// types.ts
export interface ResponseOutcome {
  responseId: string;
  sessionId: string;
  timestamp: Date;
  
  // What we said
  responseType: ResponseType;
  responseFeatures: ResponseFeatures;
  
  // Context when we said it
  context: {
    emotionalState: string;
    topicCategory: string;
    turnNumber: number;
    relationshipStage: string;
  };
  
  // How user reacted
  outcome: {
    userContinuedTopic: boolean;
    userAskedFollowUp: boolean;
    userInterrupted: boolean;
    userResponseLength: 'brief' | 'medium' | 'long';
    emotionalShift: number;     // -1 to +1
    engagementScore: number;    // 0-1 composite
  };
}

export type ResponseType = 
  | 'validation'
  | 'insight'
  | 'question'
  | 'insight_with_question'
  | 'reflection'
  | 'story'
  | 'silence'
  | 'humor'
  | 'reframe'
  | 'celebration';

export interface ResponseFeatures {
  length: 'brief' | 'medium' | 'long';
  containedQuestion: boolean;
  containedInsight: boolean;
  containedValidation: boolean;
  containedHumor: boolean;
  usedMemory: boolean;         // Referenced past conversation
  usedPattern: boolean;        // Surfaced pattern observation
  pauseDuration: number;       // Seconds before responding
}

export interface UserResponsePreferences {
  userId: string;
  
  // What response types work best (by effectiveness score)
  responseTypeScores: Map<ResponseType, EffectivenessScore>;
  
  // What features correlate with engagement
  featureCorrelations: Map<keyof ResponseFeatures, number>;
  
  // Context-specific preferences
  contextualPreferences: Map<string, ResponseType[]>;
  
  // Metadata
  outcomesAnalyzed: number;
  lastUpdated: Date;
}

export interface EffectivenessScore {
  responseType: ResponseType;
  avgEngagement: number;       // 0-1
  avgEmotionalShift: number;   // -1 to +1
  sampleSize: number;
  confidence: number;          // 0-1
}

export interface IQualityLearning {
  recordOutcome(outcome: ResponseOutcome): Promise<void>;
  
  getPreferences(userId: string): Promise<UserResponsePreferences | null>;
  
  suggestResponseType(
    userId: string,
    context: ResponseContext
  ): Promise<ResponseTypeSuggestion>;
  
  shouldUseFeature(
    userId: string,
    feature: keyof ResponseFeatures
  ): Promise<boolean>;
}

export interface ResponseTypeSuggestion {
  recommended: ResponseType;
  confidence: number;
  alternates: ResponseType[];
  reasoning: string;
}
```

#### Engine

```typescript
// engine.ts
export class QualityLearningEngine implements IQualityLearning {
  private readonly MIN_SAMPLES_FOR_CONFIDENCE = 5;
  
  async recordOutcome(outcome: ResponseOutcome): Promise<void> {
    // 1. Persist the outcome
    await this.persistence.saveOutcome(outcome);
    
    // 2. Update user preferences (incrementally)
    await this.updatePreferences(outcome);
  }
  
  async suggestResponseType(
    userId: string,
    context: ResponseContext
  ): Promise<ResponseTypeSuggestion> {
    const prefs = await this.getPreferences(userId);
    
    // Not enough data yet — return default
    if (!prefs || prefs.outcomesAnalyzed < this.MIN_SAMPLES_FOR_CONFIDENCE) {
      return this.getContextualDefault(context);
    }
    
    // Get scores filtered by context
    const contextKey = this.buildContextKey(context);
    const contextual = prefs.contextualPreferences.get(contextKey);
    
    if (contextual && contextual.length > 0) {
      return {
        recommended: contextual[0],
        confidence: 0.8,
        alternates: contextual.slice(1, 3),
        reasoning: `Based on ${prefs.outcomesAnalyzed} past responses in similar context`
      };
    }
    
    // Fall back to overall best
    const sorted = [...prefs.responseTypeScores.entries()]
      .filter(([_, score]) => score.sampleSize >= 3)
      .sort((a, b) => b[1].avgEngagement - a[1].avgEngagement);
    
    if (sorted.length === 0) {
      return this.getContextualDefault(context);
    }
    
    return {
      recommended: sorted[0][0],
      confidence: sorted[0][1].confidence,
      alternates: sorted.slice(1, 3).map(([type]) => type),
      reasoning: `User responds best to ${sorted[0][0]} (${Math.round(sorted[0][1].avgEngagement * 100)}% engagement)`
    };
  }
  
  async shouldUseFeature(
    userId: string,
    feature: keyof ResponseFeatures
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId);
    if (!prefs) return true; // Default to using features
    
    const correlation = prefs.featureCorrelations.get(feature);
    if (correlation === undefined) return true;
    
    // If feature negatively correlates with engagement, skip it
    return correlation >= -0.1;
  }
  
  private async updatePreferences(outcome: ResponseOutcome): Promise<void> {
    const userId = outcome.context.userId;
    const existing = await this.getPreferences(userId) ?? this.createEmptyPrefs(userId);
    
    // Update response type score
    const typeScore = existing.responseTypeScores.get(outcome.responseType) 
      ?? this.createEmptyScore(outcome.responseType);
    
    typeScore.avgEngagement = this.runningAverage(
      typeScore.avgEngagement,
      outcome.outcome.engagementScore,
      typeScore.sampleSize
    );
    typeScore.avgEmotionalShift = this.runningAverage(
      typeScore.avgEmotionalShift,
      outcome.outcome.emotionalShift,
      typeScore.sampleSize
    );
    typeScore.sampleSize++;
    typeScore.confidence = Math.min(0.95, typeScore.sampleSize / 20);
    
    existing.responseTypeScores.set(outcome.responseType, typeScore);
    
    // Update feature correlations
    this.updateFeatureCorrelations(existing, outcome);
    
    // Update contextual preferences
    this.updateContextualPreferences(existing, outcome);
    
    existing.outcomesAnalyzed++;
    existing.lastUpdated = new Date();
    
    await this.persistence.savePreferences(existing);
  }
  
  // ... additional methods
}
```

#### Integration

```typescript
// integration.ts

/**
 * Classify the response we just generated
 */
export function classifyResponse(
  text: string,
  context: TurnContext
): { type: ResponseType; features: ResponseFeatures } {
  // Analyze response text for features
  const features: ResponseFeatures = {
    length: classifyLength(text),
    containedQuestion: /\?/.test(text),
    containedInsight: /I.*(notice|see|observe|wonder)/i.test(text),
    containedValidation: /(that.*(makes sense|sounds|hard)|I hear you)/i.test(text),
    containedHumor: context.detectedHumor ?? false,
    usedMemory: context.referencedMemory ?? false,
    usedPattern: context.surfacedPattern ?? false,
    pauseDuration: context.pauseBeforeResponse ?? 0
  };
  
  // Determine primary type
  const type = determineResponseType(features, text);
  
  return { type, features };
}

/**
 * Middleware that tracks response outcomes
 */
export function createQualityTrackingMiddleware(
  qualityLearning: QualityLearningEngine
) {
  let lastResponse: { id: string; type: ResponseType; features: ResponseFeatures } | null = null;
  
  return {
    onResponseGenerated(
      responseId: string,
      text: string,
      context: TurnContext
    ): void {
      const { type, features } = classifyResponse(text, context);
      lastResponse = { id: responseId, type, features };
    },
    
    onUserResponse(
      userText: string,
      emotionalState: EmotionalState,
      context: TurnContext
    ): void {
      if (!lastResponse) return;
      
      // Calculate outcome metrics
      const outcome: ResponseOutcome = {
        responseId: lastResponse.id,
        sessionId: context.sessionId,
        timestamp: new Date(),
        responseType: lastResponse.type,
        responseFeatures: lastResponse.features,
        context: {
          emotionalState: context.prevEmotionalState,
          topicCategory: context.topicCategory,
          turnNumber: context.turnNumber,
          relationshipStage: context.relationshipStage
        },
        outcome: {
          userContinuedTopic: detectTopicContinuation(userText, context),
          userAskedFollowUp: /\?/.test(userText) && userText.length > 20,
          userInterrupted: context.wasInterrupted ?? false,
          userResponseLength: classifyLength(userText),
          emotionalShift: emotionalState.valence - context.prevEmotionalState.valence,
          engagementScore: calculateEngagementScore(userText, context)
        }
      };
      
      // Fire and forget (don't block turn processing)
      qualityLearning.recordOutcome(outcome).catch(err => {
        log.warn({ error: err }, 'Failed to record response outcome');
      });
      
      lastResponse = null;
    }
  };
}
```

### Tasks

| Task | Description | Est. |
|------|-------------|------|
| 2.1 | Create types.ts with interfaces | 2h |
| 2.2 | Implement persistence.ts | 3h |
| 2.3 | Build QualityLearningEngine | 6h |
| 2.4 | Create response classifier | 3h |
| 2.5 | Build tracking middleware | 4h |
| 2.6 | Wire into turn-processor | 3h |
| 2.7 | Unit tests | 4h |
| 2.8 | Integration tests | 3h |

### Deliverables

- [ ] `src/intelligence/dynamic/quality-learning/` module
- [ ] Tracking middleware wired into turn-processor
- [ ] Dashboard endpoint for viewing user preferences
- [ ] Unit tests with >80% coverage

---

## Phase 3: Generated Insight Engine

**Goal**: Generate context-specific insights using LLM instead of selecting from templates.

**Timeline**: Week 3-4

### The Problem

Current state: Static templates with placeholders.

```json
// Today: Template bank
"templates": [
  "I've noticed you mention {topic} often...",
  "There's a pattern I'm seeing...",
  "Something I've been thinking about..."
]

// Goal: Generated, contextual, personal
"I've been thinking about this since last week—you mentioned your mom 
three times during our work conversation. I don't think that's random."
```

### Architecture

**Layer**: `src/intelligence/dynamic/insight-generation/`

#### Types

```typescript
// types.ts
export interface InsightGenerationInput {
  userId: string;
  
  // What we've observed
  observation: {
    type: 'pattern' | 'connection' | 'growth' | 'contradiction' | 'anticipation';
    data: PatternData | ConnectionData | GrowthData | ContradictionData | AnticipationData;
    confidence: number;
  };
  
  // Current context
  context: {
    currentEmotion: string;
    currentTopic: string;
    relationshipStage: string;
    userReceptivity: number; // From quality learning
  };
  
  // User preferences (from quality learning)
  preferences: {
    preferredLength: 'brief' | 'medium' | 'detailed';
    directnessPreference: number;
    probeReceptivity: number;
  };
}

export interface GeneratedInsight {
  id: string;
  text: string;
  
  // For voice delivery
  ssml: string;
  suggestedTone: string;
  suggestedPacing: 'slow' | 'normal';
  
  // Metadata
  observationType: string;
  confidence: number;
  shouldFollowWithQuestion: boolean;
  followUpQuestion?: string;
}

export interface PatternData {
  pattern: string;           // "mentions_mom_during_work_stress"
  occurrences: number;
  timespan: string;          // "last 3 sessions"
  contexts: string[];        // When it occurred
}

export interface ConnectionData {
  topicA: string;
  topicB: string;
  connectionType: 'temporal' | 'emotional' | 'causal';
  evidence: string[];
}

export interface GrowthData {
  area: string;
  then: string;              // "3 months ago you said..."
  now: string;               // "Today you..."
  significance: string;
}

export interface ContradictionData {
  stated: string;            // What they say
  demonstrated: string;      // What they do
  gentleObservation: string;
}

export interface AnticipationData {
  signal: string;            // What we detected
  anticipatedNeed: string;   // What we think they need
  confidence: number;
}

export interface IInsightGenerator {
  generateInsight(input: InsightGenerationInput): Promise<GeneratedInsight>;
  
  shouldSurfaceInsight(
    userId: string,
    observation: InsightGenerationInput['observation'],
    context: InsightGenerationInput['context']
  ): Promise<{ should: boolean; reasoning: string }>;
}
```

#### Prompts

```typescript
// prompts.ts
export const INSIGHT_GENERATION_SYSTEM_PROMPT = `
You are Ferni's insight generation module. Your job is to turn observations 
into natural, personal insights that Ferni can share with users.

## Ferni's Voice
- Warm, curious, genuine
- Wyoming patience, Japanese thoughtfulness
- Never lectures—wonders aloud
- Kintsugi philosophy: "We are all broken in different ways—that's what makes us both human and beautiful"

## Insight Principles
1. PERSONAL: Reference specific things they've said, specific times, specific contexts
2. WONDERING, NOT TELLING: "I wonder if..." not "You clearly..."
3. EARNED: Only surface insights with high confidence
4. INVITATIONAL: Leave room for them to disagree or add context
5. TIMED: Ask if this is a good time to share something you noticed

## Response Format
Generate a JSON object:
{
  "text": "The insight text (no SSML, just words)",
  "tone": "gentle|curious|warm|thoughtful",
  "pacing": "slow|normal",
  "shouldFollowWithQuestion": true/false,
  "followUpQuestion": "Optional follow-up if shouldFollowWithQuestion is true"
}
`;

export function buildInsightGenerationPrompt(input: InsightGenerationInput): string {
  const { observation, context, preferences } = input;
  
  return `
## Observation to Transform
Type: ${observation.type}
Data: ${JSON.stringify(observation.data, null, 2)}
Confidence: ${observation.confidence}

## Current Context
- User emotion: ${context.currentEmotion}
- Current topic: ${context.currentTopic}
- Relationship stage: ${context.relationshipStage}
- User receptivity to insights: ${context.userReceptivity}/1

## User Preferences
- Preferred length: ${preferences.preferredLength}
- Directness (0=gentle, 1=direct): ${preferences.directnessPreference}
- Probe receptivity: ${preferences.probeReceptivity}/1

## Task
Transform this observation into a natural Ferni insight. 
${preferences.probeReceptivity < 0.4 
  ? 'This user is sensitive to probing—be extra gentle and invitational.' 
  : ''}
${context.userReceptivity < 0.5 
  ? 'User seems less receptive right now—consider saving this for later or being very brief.' 
  : ''}

Remember: This should sound like Ferni noticing something, not a database query result.
`;
}
```

#### Engine

```typescript
// engine.ts
import { Gemini } from '../../../agents/model-provider/gemini.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { 
  INSIGHT_GENERATION_SYSTEM_PROMPT, 
  buildInsightGenerationPrompt 
} from './prompts.js';
import type { 
  IInsightGenerator, 
  InsightGenerationInput, 
  GeneratedInsight 
} from './types.js';

const log = createLogger({ module: 'InsightGenerationEngine' });

export class InsightGenerationEngine implements IInsightGenerator {
  private readonly gemini: Gemini;
  private readonly qualityLearning: IQualityLearning;
  private readonly patternMemory: IPatternMemory;
  
  // Cache recently generated insights to avoid repetition
  private recentInsights = new Map<string, Set<string>>();
  
  async generateInsight(input: InsightGenerationInput): Promise<GeneratedInsight> {
    const prompt = buildInsightGenerationPrompt(input);
    
    log.debug({ 
      observationType: input.observation.type,
      confidence: input.observation.confidence 
    }, 'Generating insight');
    
    const response = await this.gemini.generateText({
      systemPrompt: INSIGHT_GENERATION_SYSTEM_PROMPT,
      userPrompt: prompt,
      temperature: 0.7, // Some creativity
      maxTokens: 300
    });
    
    const parsed = this.parseResponse(response);
    
    // Generate SSML version
    const ssml = this.generateSSML(parsed, input.preferences);
    
    const insight: GeneratedInsight = {
      id: `insight_${Date.now()}`,
      text: parsed.text,
      ssml,
      suggestedTone: parsed.tone,
      suggestedPacing: parsed.pacing,
      observationType: input.observation.type,
      confidence: input.observation.confidence,
      shouldFollowWithQuestion: parsed.shouldFollowWithQuestion,
      followUpQuestion: parsed.followUpQuestion
    };
    
    // Track to avoid repetition
    this.trackGeneratedInsight(input.userId, insight);
    
    log.info({ 
      insightId: insight.id,
      type: input.observation.type 
    }, 'Generated insight');
    
    return insight;
  }
  
  async shouldSurfaceInsight(
    userId: string,
    observation: InsightGenerationInput['observation'],
    context: InsightGenerationInput['context']
  ): Promise<{ should: boolean; reasoning: string }> {
    // 1. Check confidence threshold
    if (observation.confidence < 0.7) {
      return { 
        should: false, 
        reasoning: `Confidence ${observation.confidence} below threshold 0.7` 
      };
    }
    
    // 2. Check user receptivity
    if (context.userReceptivity < 0.3) {
      return { 
        should: false, 
        reasoning: 'User receptivity too low right now' 
      };
    }
    
    // 3. Check if we recently surfaced similar insight
    const recent = this.recentInsights.get(userId);
    if (recent?.has(observation.type)) {
      return { 
        should: false, 
        reasoning: 'Recently surfaced similar insight type' 
      };
    }
    
    // 4. Check user's probe receptivity (from quality learning)
    const prefs = await this.qualityLearning.getPreferences(userId);
    if (prefs && prefs.featureCorrelations.get('usedPattern') < -0.2) {
      return { 
        should: false, 
        reasoning: 'User historically responds poorly to pattern surfacing' 
      };
    }
    
    // 5. Check emotional state (don't surface during distress)
    if (context.currentEmotion === 'distressed' || context.currentEmotion === 'sad') {
      return { 
        should: false, 
        reasoning: 'User in vulnerable emotional state—prioritize presence' 
      };
    }
    
    return { 
      should: true, 
      reasoning: `Confidence ${observation.confidence}, receptivity ${context.userReceptivity}` 
    };
  }
  
  private generateSSML(
    parsed: { text: string; tone: string; pacing: string },
    preferences: InsightGenerationInput['preferences']
  ): string {
    const speed = parsed.pacing === 'slow' ? '0.9' : '0.95';
    const emotion = this.toneToSSMLEmotion(parsed.tone);
    
    return `<speed ratio="${speed}"/><emotion value="${emotion}"/><break time="300ms"/>${parsed.text}`;
  }
  
  private toneToSSMLEmotion(tone: string): string {
    const mapping: Record<string, string> = {
      'gentle': 'affectionate',
      'curious': 'curious',
      'warm': 'affectionate',
      'thoughtful': 'contemplative'
    };
    return mapping[tone] ?? 'curious';
  }
  
  // ... additional methods
}
```

### Tasks

| Task | Description | Est. |
|------|-------------|------|
| 3.1 | Create types.ts with interfaces | 2h |
| 3.2 | Design and test prompts | 4h |
| 3.3 | Build InsightGenerationEngine | 6h |
| 3.4 | Create shouldSurfaceInsight logic | 3h |
| 3.5 | Build integration with pattern memory | 3h |
| 3.6 | SSML generation for voice | 2h |
| 3.7 | Unit tests with mock LLM | 4h |
| 3.8 | Integration tests | 3h |
| 3.9 | Wire into turn-processor | 2h |

### Deliverables

- [ ] `src/intelligence/dynamic/insight-generation/` module
- [ ] Prompt templates with Ferni voice
- [ ] Integration with pattern memory
- [ ] Unit tests with >80% coverage

---

## Phase 4: Adaptive Intensity System

**Goal**: Dynamically adjust feature intensity based on user signals and learned preferences.

**Timeline**: Week 4

### The Problem

Current state: Fixed probabilities and thresholds for all users.

```typescript
// Today: One size fits all
const DISFLUENCY_RATE = 0.15;           // 15% for everyone
const INSIGHT_TRIGGER_PROBABILITY = 0.2; // 20% for everyone

// Goal: Personalized intensity
getIntensity('disfluency', userId);  // 0.05 for guarded user, 0.25 for casual
getIntensity('insight_surfacing', userId); // Based on probe receptivity
```

### Architecture

**Layer**: `src/intelligence/dynamic/adaptive-intensity/`

#### Types

```typescript
// types.ts
export type FeatureKey = 
  | 'disfluency'
  | 'humor'
  | 'insight_surfacing'
  | 'pattern_observation'
  | 'memory_callback'
  | 'question_asking'
  | 'silence_tolerance'
  | 'warmth_expression'
  | 'challenge_gentle';

export interface IntensityProfile {
  userId: string;
  
  // Per-feature intensities (0-1)
  featureIntensities: Map<FeatureKey, FeatureIntensity>;
  
  // Current session adjustments
  sessionAdjustments: Map<FeatureKey, number>; // Multipliers
  
  // Metadata
  baselineEstablished: boolean;
  lastUpdated: Date;
}

export interface FeatureIntensity {
  feature: FeatureKey;
  baseline: number;          // Learned baseline (0-1)
  confidence: number;        // How confident we are
  recentTrend: 'increasing' | 'decreasing' | 'stable';
}

export interface IntensityContext {
  emotionalState: string;
  turnNumber: number;
  sessionDuration: number;
  recentUserEngagement: number;  // 0-1
  topicWeight: 'light' | 'medium' | 'heavy';
}

export interface IAdaptiveIntensity {
  getIntensity(
    feature: FeatureKey,
    userId: string,
    context: IntensityContext
  ): Promise<number>;
  
  recordFeatureOutcome(
    userId: string,
    feature: FeatureKey,
    used: boolean,
    outcome: 'positive' | 'neutral' | 'negative'
  ): Promise<void>;
  
  getSessionAdjustments(userId: string): Map<FeatureKey, number>;
  
  adjustForSession(
    userId: string,
    feature: FeatureKey,
    multiplier: number
  ): void;
}
```

#### Engine

```typescript
// engine.ts
export class AdaptiveIntensityEngine implements IAdaptiveIntensity {
  // Default intensities (used when no user data)
  private readonly DEFAULTS: Record<FeatureKey, number> = {
    'disfluency': 0.15,
    'humor': 0.3,
    'insight_surfacing': 0.2,
    'pattern_observation': 0.15,
    'memory_callback': 0.25,
    'question_asking': 0.4,
    'silence_tolerance': 0.5,
    'warmth_expression': 0.7,
    'challenge_gentle': 0.1
  };
  
  // Context-based adjustments
  private readonly CONTEXT_ADJUSTMENTS: Record<string, Partial<Record<FeatureKey, number>>> = {
    'distressed': {
      'disfluency': 0.5,        // Reduce
      'humor': 0.3,             // Reduce significantly
      'insight_surfacing': 0.4, // Reduce
      'warmth_expression': 1.3, // Increase
      'silence_tolerance': 1.5  // More comfortable with silence
    },
    'excited': {
      'disfluency': 1.2,
      'humor': 1.3,
      'insight_surfacing': 0.7, // Let them enjoy the moment
      'question_asking': 0.8
    },
    'guarded': {
      'insight_surfacing': 0.3,
      'pattern_observation': 0.3,
      'challenge_gentle': 0.2,
      'warmth_expression': 1.2
    }
  };
  
  async getIntensity(
    feature: FeatureKey,
    userId: string,
    context: IntensityContext
  ): Promise<number> {
    // 1. Get user's baseline (or default)
    const profile = await this.getProfile(userId);
    const baseline = profile?.featureIntensities.get(feature)?.baseline 
      ?? this.DEFAULTS[feature];
    
    // 2. Apply context adjustments
    let intensity = baseline;
    const contextAdj = this.CONTEXT_ADJUSTMENTS[context.emotionalState];
    if (contextAdj?.[feature]) {
      intensity *= contextAdj[feature]!;
    }
    
    // 3. Apply session adjustments
    const sessionAdj = profile?.sessionAdjustments.get(feature);
    if (sessionAdj) {
      intensity *= sessionAdj;
    }
    
    // 4. Apply topic weight adjustments
    if (context.topicWeight === 'heavy') {
      // Reduce playful features, increase supportive ones
      if (['disfluency', 'humor'].includes(feature)) {
        intensity *= 0.6;
      }
      if (['warmth_expression', 'silence_tolerance'].includes(feature)) {
        intensity *= 1.3;
      }
    }
    
    // 5. Apply engagement-based adjustment
    if (context.recentUserEngagement < 0.3) {
      // User seems disengaged — reduce probing, increase connection
      if (['insight_surfacing', 'question_asking', 'challenge_gentle'].includes(feature)) {
        intensity *= 0.5;
      }
    }
    
    // Clamp to valid range
    return Math.max(0, Math.min(1, intensity));
  }
  
  async recordFeatureOutcome(
    userId: string,
    feature: FeatureKey,
    used: boolean,
    outcome: 'positive' | 'neutral' | 'negative'
  ): Promise<void> {
    if (!used) return; // Only learn from actual usage
    
    const profile = await this.getProfile(userId) ?? this.createEmptyProfile(userId);
    const current = profile.featureIntensities.get(feature) 
      ?? { feature, baseline: this.DEFAULTS[feature], confidence: 0, recentTrend: 'stable' as const };
    
    // Adjust baseline based on outcome
    const adjustment = outcome === 'positive' ? 0.05 
      : outcome === 'negative' ? -0.05 
      : 0;
    
    current.baseline = Math.max(0.05, Math.min(0.95, current.baseline + adjustment));
    current.confidence = Math.min(0.95, current.confidence + 0.05);
    
    // Track trend
    if (adjustment > 0) {
      current.recentTrend = current.recentTrend === 'increasing' ? 'increasing' : 'stable';
    } else if (adjustment < 0) {
      current.recentTrend = current.recentTrend === 'decreasing' ? 'decreasing' : 'stable';
    }
    
    profile.featureIntensities.set(feature, current);
    profile.lastUpdated = new Date();
    
    await this.persistence.saveProfile(profile);
  }
  
  // ... additional methods
}
```

### Tasks

| Task | Description | Est. |
|------|-------------|------|
| 4.1 | Create types.ts | 2h |
| 4.2 | Build AdaptiveIntensityEngine | 5h |
| 4.3 | Define context adjustments | 2h |
| 4.4 | Integrate with existing features | 4h |
| 4.5 | Unit tests | 3h |
| 4.6 | Integration tests | 2h |

### Deliverables

- [ ] `src/intelligence/dynamic/adaptive-intensity/` module
- [ ] All humanization features using adaptive intensity
- [ ] Real-time session adjustment capability

---

## Phase 5: Builder Orchestration

**Goal**: Coordinate 90+ context builders to prevent awkward multi-injection turns and ensure coherent responses.

**Timeline**: Week 5

### The Problem

Current state: Builders run independently, sometimes creating contradictory or overwhelming injections.

```typescript
// Today: Chaotic multi-injection
turn_1: [
  "Surface growth observation",
  "Celebrate recent win",
  "Check in on commitment",
  "Probe deeper on topic"
]
// Result: Ferni tries to do 4 things at once

// Goal: Orchestrated, coherent
turn_1: "Celebrate recent win" // Priority: user just shared good news
turn_2: "Surface growth observation" // Now that they're receptive
turn_3: "Probe deeper" // Build on momentum
```

### Architecture

**Layer**: `src/intelligence/dynamic/orchestration/`

#### Types

```typescript
// types.ts
export interface OrchestratorInput {
  userId: string;
  sessionId: string;
  turnNumber: number;
  
  // All injections requested by builders
  requestedInjections: BuilderInjection[];
  
  // Current context
  context: {
    emotionalState: string;
    topicCategory: string;
    conversationPhase: 'opening' | 'building' | 'peak' | 'resolution' | 'closing';
    userReceptivity: number;
    lastTurnType: string;
  };
  
  // What we've done recently
  recentHistory: {
    lastInsightTurn?: number;
    lastCelebrationTurn?: number;
    lastProbeTurn?: number;
    lastMemoryCallbackTurn?: number;
  };
}

export interface BuilderInjection {
  builderId: string;
  priority: number;
  category: InjectionCategory;
  injection: ContextInjection;
  exclusiveWith?: string[];  // Builder IDs this conflicts with
  requiresReceptivity?: number;
  cooldownTurns?: number;
}

export type InjectionCategory = 
  | 'insight'           // Pattern surfacing, observations
  | 'celebration'       // Wins, achievements
  | 'probe'             // Deep questions
  | 'validation'        // Emotional support
  | 'memory'            // Callbacks to past
  | 'guidance'          // Behavioral guidance
  | 'constraint';       // Things to avoid

export interface OrchestratorOutput {
  selectedInjections: BuilderInjection[];
  deferredInjections: DeferredInjection[];
  reasoning: string;
}

export interface DeferredInjection {
  injection: BuilderInjection;
  deferUntil: 'next_turn' | 'receptive_moment' | 'topic_change' | 'session_end';
  reason: string;
}

export interface IBuilderOrchestrator {
  orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput>;
  
  recordInjectionOutcome(
    injectionId: string,
    outcome: 'effective' | 'neutral' | 'backfired'
  ): void;
}
```

#### Orchestrator

```typescript
// orchestrator.ts
export class BuilderOrchestrator implements IBuilderOrchestrator {
  // Rules for what can coexist
  private readonly MUTUAL_EXCLUSIONS: Record<InjectionCategory, InjectionCategory[]> = {
    'insight': ['probe', 'celebration'],     // Don't probe while surfacing insight
    'celebration': ['insight', 'probe'],     // Let them enjoy the win
    'probe': ['insight', 'celebration'],     // Don't overwhelm
    'validation': [],                        // Can coexist with most things
    'memory': ['insight'],                   // One "I noticed" thing per turn
    'guidance': [],                          // Always ok
    'constraint': []                         // Always ok
  };
  
  // Minimum turns between same category
  private readonly CATEGORY_COOLDOWNS: Record<InjectionCategory, number> = {
    'insight': 3,
    'celebration': 4,
    'probe': 2,
    'validation': 0,
    'memory': 4,
    'guidance': 0,
    'constraint': 0
  };
  
  async orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const { requestedInjections, context, recentHistory } = input;
    
    // 1. Filter by receptivity
    const receptivityFiltered = requestedInjections.filter(inj => 
      !inj.requiresReceptivity || context.userReceptivity >= inj.requiresReceptivity
    );
    
    // 2. Filter by cooldowns
    const cooldownFiltered = receptivityFiltered.filter(inj => 
      this.checkCooldown(inj, recentHistory)
    );
    
    // 3. Sort by priority
    const sorted = [...cooldownFiltered].sort((a, b) => b.priority - a.priority);
    
    // 4. Select non-conflicting set
    const selected: BuilderInjection[] = [];
    const selectedCategories = new Set<InjectionCategory>();
    const deferred: DeferredInjection[] = [];
    
    for (const inj of sorted) {
      // Check mutual exclusions
      const conflictsWithSelected = this.MUTUAL_EXCLUSIONS[inj.category]
        ?.some(cat => selectedCategories.has(cat));
      
      if (conflictsWithSelected) {
        deferred.push({
          injection: inj,
          deferUntil: 'next_turn',
          reason: `Conflicts with ${[...selectedCategories].join(', ')}`
        });
        continue;
      }
      
      // Check explicit exclusions
      const explicitConflict = inj.exclusiveWith
        ?.some(id => selected.some(s => s.builderId === id));
      
      if (explicitConflict) {
        deferred.push({
          injection: inj,
          deferUntil: 'next_turn',
          reason: `Explicitly conflicts with ${inj.exclusiveWith?.join(', ')}`
        });
        continue;
      }
      
      selected.push(inj);
      selectedCategories.add(inj.category);
      
      // Limit total injections per turn
      if (selected.length >= 3) {
        // Defer remaining high-priority ones
        const remaining = sorted.slice(sorted.indexOf(inj) + 1);
        for (const rem of remaining.filter(r => r.priority > 50)) {
          deferred.push({
            injection: rem,
            deferUntil: 'next_turn',
            reason: 'Turn injection limit reached'
          });
        }
        break;
      }
    }
    
    // 5. Apply conversation phase logic
    const phaseAdjusted = this.adjustForPhase(selected, context.conversationPhase);
    
    return {
      selectedInjections: phaseAdjusted,
      deferredInjections: deferred,
      reasoning: this.buildReasoning(selected, deferred, context)
    };
  }
  
  private adjustForPhase(
    selected: BuilderInjection[],
    phase: OrchestratorInput['context']['conversationPhase']
  ): BuilderInjection[] {
    // Opening: Prioritize warmth, avoid probing
    if (phase === 'opening') {
      return selected.filter(s => s.category !== 'probe' && s.category !== 'insight');
    }
    
    // Closing: Surface any deferred insights, avoid new threads
    if (phase === 'closing') {
      return selected.filter(s => s.category !== 'probe');
    }
    
    return selected;
  }
  
  // ... additional methods
}
```

### Tasks

| Task | Description | Est. |
|------|-------------|------|
| 5.1 | Create types.ts | 2h |
| 5.2 | Build BuilderOrchestrator | 6h |
| 5.3 | Define mutual exclusions and cooldowns | 2h |
| 5.4 | Implement deferred injection queue | 3h |
| 5.5 | Wire into context builder loader | 3h |
| 5.6 | Unit tests | 4h |
| 5.7 | Integration tests | 3h |

### Deliverables

- [ ] `src/intelligence/dynamic/orchestration/` module
- [ ] Deferred injection queue with persistence
- [ ] Orchestrator wired into turn-processor

---

## Phase 6: Production Validation

**Goal**: Validate all phases in production with metrics, A/B testing, and user feedback.

**Timeline**: Week 5-6

### Validation Strategy

#### 6.1 Metrics Collection

```typescript
// src/services/observability/dynamic-intelligence-metrics.ts
export interface DynamicIntelligenceMetrics {
  // Phase 1: Pattern Memory
  patternMemory: {
    profilesCreated: number;
    profilesWithHighConfidence: number; // confidence > 0.7
    avgTopicEffectsPerUser: number;
    topicEffectAccuracy: number; // Predicted vs actual mood shift
  };
  
  // Phase 2: Quality Learning
  qualityLearning: {
    outcomesRecorded: number;
    usersWithPreferences: number;
    avgSuggestionConfidence: number;
    suggestionAccuracy: number; // Did user engage as predicted?
  };
  
  // Phase 3: Insight Generation
  insightGeneration: {
    insightsGenerated: number;
    insightsSurfaced: number;
    insightsSuppressed: number;
    avgInsightReception: number; // User engagement score
  };
  
  // Phase 4: Adaptive Intensity
  adaptiveIntensity: {
    intensityAdjustments: number;
    avgIntensityChange: number;
    featureOutcomeCorrelation: number; // Does intensity match outcomes?
  };
  
  // Phase 5: Orchestration
  orchestration: {
    injectionsRequested: number;
    injectionsSelected: number;
    injectionsDeferred: number;
    conflictsResolved: number;
  };
}
```

#### 6.2 A/B Test Configuration

```typescript
// Feature flags for gradual rollout
export const DYNAMIC_INTELLIGENCE_FLAGS = {
  'dynamic_pattern_memory': {
    enabled: true,
    rolloutPercent: 100, // Start at 100% after internal testing
  },
  'dynamic_quality_learning': {
    enabled: true,
    rolloutPercent: 50, // 50% A/B test
  },
  'dynamic_insight_generation': {
    enabled: true,
    rolloutPercent: 25, // 25% initial rollout
  },
  'dynamic_adaptive_intensity': {
    enabled: true,
    rolloutPercent: 50,
  },
  'dynamic_orchestration': {
    enabled: true,
    rolloutPercent: 100, // Always on (improves quality)
  }
};
```

#### 6.3 User Feedback Signals

Track these implicit feedback signals:

| Signal | Interpretation | Collection Point |
|--------|----------------|------------------|
| User asks follow-up question | Engaged, wants more | After AI response |
| User changes topic after insight | May have landed or overwhelmed | After insight surfacing |
| User says "that's so true" / "wow" | Insight resonated | Transcript analysis |
| User gets quieter | Could be processing or overwhelmed | Voice analysis |
| User laughs | Connection made | Voice analysis |
| Session length increases | Overall engagement | Session end |
| Return rate increases | Building relationship | Cross-session |

#### 6.4 Validation Criteria

| Phase | Success Metric | Target | Measurement |
|-------|---------------|--------|-------------|
| 1. Pattern Memory | Topic effect prediction accuracy | >70% | Predicted vs actual mood shift |
| 2. Quality Learning | Response type suggestion accuracy | >65% | Predicted vs actual engagement |
| 3. Insight Generation | User engagement after insight | >0.6 | Engagement score 0-1 |
| 4. Adaptive Intensity | Feature outcome correlation | >0.5 | Correlation coefficient |
| 5. Orchestration | Turn coherence score | >0.8 | Human rating 0-1 |
| Overall | Session satisfaction | +10% | Post-session survey |
| Overall | Return rate | +15% | Users returning within 7 days |

### Tasks

| Task | Description | Est. |
|------|-------------|------|
| 6.1 | Implement metrics collection | 4h |
| 6.2 | Set up A/B testing infrastructure | 3h |
| 6.3 | Create observability dashboard | 4h |
| 6.4 | Define and implement feedback signals | 4h |
| 6.5 | Internal dogfooding (1 week) | - |
| 6.6 | Gradual rollout (2 weeks) | - |
| 6.7 | Analyze results and iterate | 8h |

### Deliverables

- [ ] Observability dashboard with all metrics
- [ ] A/B testing for each phase
- [ ] Feedback signal collection
- [ ] Validation report with recommendations

---

## E2E Wiring

### Turn Processing Integration

```typescript
// src/agents/processors/turn-processor.ts

export class TurnProcessor {
  private patternMemory: IPatternMemory;
  private qualityLearning: IQualityLearning;
  private insightGenerator: IInsightGenerator;
  private adaptiveIntensity: IAdaptiveIntensity;
  private orchestrator: IBuilderOrchestrator;
  private qualityMiddleware: QualityTrackingMiddleware;
  
  async processTurn(input: TurnInput): Promise<TurnOutput> {
    const { userId, userText, sessionServices } = input;
    
    // 1. Get user's pattern profile for context
    const patternProfile = await this.patternMemory.getProfile(userId);
    
    // 2. Get response preferences from quality learning
    const responsePrefs = await this.qualityLearning.getPreferences(userId);
    
    // 3. Get adaptive intensities for this turn
    const intensities = await this.getIntensities(userId, input.context);
    
    // 4. Run context builders
    const rawInjections = await this.contextBuilders.build({
      ...input,
      patternProfile,
      responsePrefs,
      intensities
    });
    
    // 5. Orchestrate injections
    const orchestrated = await this.orchestrator.orchestrate({
      userId,
      sessionId: sessionServices.sessionId,
      turnNumber: sessionServices.turnCount,
      requestedInjections: rawInjections,
      context: this.buildOrchestratorContext(input),
      recentHistory: sessionServices.injectionHistory
    });
    
    // 6. Check for insight surfacing opportunity
    const insight = await this.maybeGenerateInsight(
      userId,
      patternProfile,
      responsePrefs,
      input.context
    );
    
    if (insight) {
      orchestrated.selectedInjections.push({
        builderId: 'generated-insight',
        priority: 80,
        category: 'insight',
        injection: {
          id: insight.id,
          type: 'content',
          content: insight.text,
          ssml: insight.ssml
        }
      });
    }
    
    // 7. Generate response with orchestrated context
    const response = await this.generateResponse(
      input,
      orchestrated.selectedInjections
    );
    
    // 8. Track response for quality learning
    this.qualityMiddleware.onResponseGenerated(
      response.id,
      response.text,
      input.context
    );
    
    return response;
  }
  
  // Called when user responds (next turn)
  onUserResponse(userText: string, emotionalState: EmotionalState, context: TurnContext): void {
    this.qualityMiddleware.onUserResponse(userText, emotionalState, context);
  }
}
```

### Session End Hook

```typescript
// src/agents/shared/end-session.ts

export async function endSession(sessionServices: SessionServices): Promise<void> {
  const { userId, sessionId } = sessionServices;
  
  // Existing cleanup...
  
  // NEW: Record session patterns for cross-session learning
  await recordSessionPatternsOnEnd(
    patternMemory,
    sessionServices,
    sessionId
  );
  
  // NEW: Flush any pending quality learning outcomes
  await qualityLearning.flushPendingOutcomes(sessionId);
  
  // NEW: Log orchestration metrics
  await orchestrator.logSessionMetrics(sessionId);
}
```

### Context Builder Registration

```typescript
// src/intelligence/context-builders/core/loader.ts

// Add new dynamic intelligence builders
import { createPatternMemoryContextBuilder } from '../dynamic/pattern-memory/integration.js';
import { createQualityAwareBuilder } from '../dynamic/quality-learning/integration.js';
import { createAdaptiveBuilder } from '../dynamic/adaptive-intensity/integration.js';

export function registerAllBuilders(registry: BuilderRegistry): void {
  // Existing builders...
  
  // Dynamic intelligence builders
  registry.register('pattern-memory-awareness', createPatternMemoryContextBuilder(patternMemory), {
    priority: 75,
    category: 'guidance'
  });
  
  registry.register('quality-aware-response', createQualityAwareBuilder(qualityLearning), {
    priority: 70,
    category: 'guidance'
  });
  
  // Wrap all builders with adaptive intensity
  registry.wrapAll(createAdaptiveBuilder(adaptiveIntensity));
}
```

---

## Audit Checklist

### Code Quality Audit

- [ ] **Type Safety**: All modules use explicit types, no `any`
- [ ] **Result Types**: Expected failures use `Result<T, E>`, not thrown errors
- [ ] **Logging**: All modules use `createLogger()`, no `console.log`
- [ ] **File Size**: All files under 500 lines
- [ ] **Single Responsibility**: Each module does one thing well
- [ ] **Dependency Injection**: All dependencies injected, not imported directly
- [ ] **Tests**: >80% coverage on all engines

### Architecture Audit

- [ ] **Layer Compliance**: No upward imports (run `pnpm quality:arch`)
- [ ] **Interface Segregation**: Clients depend on interfaces, not implementations
- [ ] **Clean Boundaries**: Each phase is independently deployable
- [ ] **Graceful Degradation**: System works if any phase fails

### Performance Audit

- [ ] **Latency**: Pattern memory lookup < 50ms
- [ ] **Latency**: Quality learning lookup < 30ms
- [ ] **Latency**: Insight generation < 500ms (async, non-blocking)
- [ ] **Latency**: Orchestration < 20ms
- [ ] **Memory**: Session state < 1MB per user
- [ ] **Persistence**: Firestore writes batched, not per-turn

### Brand Alignment Audit

- [ ] **Voice Consistency**: Generated insights sound like Ferni
- [ ] **Core Principles**: All features align with CORE-PRINCIPLES.md
- [ ] **Better Than Human**: Capabilities exceed human consistency
- [ ] **Kintsugi Philosophy**: Insights embrace imperfection

### Security Audit

- [ ] **Data Privacy**: User patterns stored securely, not logged
- [ ] **PII Handling**: No PII in insight generation prompts
- [ ] **Rate Limiting**: LLM calls rate-limited per user

---

## Success Metrics

### Primary Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Session Satisfaction** | Baseline | +10% | Post-session survey |
| **Return Rate (7-day)** | Baseline | +15% | Users returning within 7 days |
| **Insight Resonance** | N/A | >0.6 | Engagement after insight surfacing |
| **Response Appropriateness** | Baseline | +20% | Human evaluation |

### Secondary Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern prediction accuracy | >70% | Predicted vs actual mood shift |
| Response suggestion accuracy | >65% | Predicted vs actual engagement |
| Orchestration coherence | >0.8 | Human rating |
| Feature intensity correlation | >0.5 | Correlation coefficient |

### Anti-Metrics (Things to Monitor)

| Metric | Threshold | Action |
|--------|-----------|--------|
| User says "stop" or "enough" | >5% of insights | Reduce surfacing frequency |
| Topic change after insight | >60% | Review insight timing |
| Session length decrease | >10% drop | Review overall experience |
| Negative feedback mentions | >3% of feedback | Deep dive analysis |

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM insight quality inconsistent | Medium | High | Prompt engineering, output validation, fallback to templates |
| Pattern learning slow to converge | Medium | Medium | Reasonable defaults, confidence thresholds |
| Orchestration too restrictive | Medium | Medium | Tunable parameters, A/B testing |
| Performance degradation | Low | High | Caching, async processing, monitoring |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Insights feel "creepy" | Medium | High | Confidence thresholds, gentle framing, user control |
| Over-personalization feels surveillance-y | Medium | High | Transparency, opt-out, "I noticed" not "I know" |
| Loss of serendipity | Low | Medium | Random exploration, don't over-optimize |

### Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Firestore costs increase | Medium | Medium | Aggregation, TTL on old data, monitoring |
| LLM costs increase | Medium | Medium | Caching, rate limiting, model selection |
| Debugging complexity | Medium | Medium | Comprehensive logging, observability dashboard |

---

## Timeline Summary

| Week | Phase | Key Deliverables |
|------|-------|------------------|
| 1-2 | Phase 1: Cross-Session Pattern Memory | Pattern memory module, session end hooks |
| 2-3 | Phase 2: Response Quality Learning | Quality tracking, response preferences |
| 3-4 | Phase 3: Generated Insight Engine | LLM-powered insights, surfacing logic |
| 4 | Phase 4: Adaptive Intensity | Dynamic feature intensity |
| 5 | Phase 5: Builder Orchestration | Coordinated injections |
| 5-6 | Phase 6: Production Validation | Metrics, A/B tests, iteration |

---

## Appendix: Quick Reference

### New Files Created

```
src/intelligence/dynamic/
├── types.ts
├── constants.ts
├── index.ts
├── pattern-memory/
│   ├── types.ts, persistence.ts, engine.ts, integration.ts
├── quality-learning/
│   ├── types.ts, persistence.ts, engine.ts, integration.ts
├── insight-generation/
│   ├── types.ts, prompts.ts, engine.ts, integration.ts
├── adaptive-intensity/
│   ├── types.ts, engine.ts, integration.ts
└── orchestration/
    ├── types.ts, orchestrator.ts, conflict-resolver.ts
```

### Files Modified

- `src/agents/processors/turn-processor.ts` — Wire all modules
- `src/agents/shared/end-session.ts` — Session end hooks
- `src/intelligence/context-builders/core/loader.ts` — Register builders
- `src/services/observability/` — Add metrics collection

### Feature Flags

```
dynamic_pattern_memory: boolean
dynamic_quality_learning: boolean
dynamic_insight_generation: boolean
dynamic_adaptive_intensity: boolean
dynamic_orchestration: boolean
```

### CLI Commands

```bash
# Validate all modules
pnpm vitest run src/intelligence/dynamic/

# Check metrics
ferni ops dynamic-intelligence:metrics

# View user's pattern profile (debugging)
ferni users show <userId> --patterns

# Trigger insight generation test
ferni smoke dynamic-insights
```

---

*Document version: 1.0*  
*Last updated: January 2026*  
*Next review: After Phase 6 completion*
