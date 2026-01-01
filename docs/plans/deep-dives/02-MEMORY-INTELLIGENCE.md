# Deep Dive: Memory Intelligence Layer

> **Phase 2 Core Component**

---

## Problem Statement

Current memory surfacing is **always-on and dumb**:

```
Current Approach:
1. User says something
2. Search memories by similarity
3. Inject top N results into context
4. LLM decides what to use

Problems:
- Surfaces memories when user doesn't want them
- No awareness of emotional state
- Same phrasing regardless of context
- No learning from user reactions
```

**Real humans don't do this.** They:

- Know when to bring something up vs. stay silent
- Read the room (emotional state)
- Phrase memories naturally for the context
- Learn what the other person wants to hear

---

## Solution: Memory Intelligence Layer

The Memory Intelligence Layer sits between the Unified Memory Store and the LLM, making **intelligent decisions** about:

1. **IF** to surface a memory (timing)
2. **WHAT** memories are most relevant (selection)
3. **HOW** to phrase it (generation)
4. **LEARNING** from reactions (adaptation)

```
┌─────────────────────────────────────────────────────────────┐
│                Memory Intelligence Layer                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Timing     │    │  Selection   │    │  Phrasing    │  │
│  │   Engine     │───>│   Engine     │───>│  Generator   │  │
│  │              │    │              │    │              │  │
│  │ • Should     │    │ • Relevance  │    │ • Natural    │  │
│  │   surface?   │    │ • Emotional  │    │   phrasing   │  │
│  │ • Wait?      │    │   match      │    │ • Persona    │  │
│  │ • Skip?      │    │ • Narrative  │    │   voice      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│          │                  │                  │            │
│          └──────────────────┼──────────────────┘            │
│                             │                               │
│                             ▼                               │
│                    ┌──────────────┐                         │
│                    │   Learning   │                         │
│                    │   Engine     │                         │
│                    │              │                         │
│                    │ • Track      │                         │
│                    │   reactions  │                         │
│                    │ • Update     │                         │
│                    │   preferences│                         │
│                    └──────────────┘                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │  Unified Memory  │
                   │     Store        │
                   └──────────────────┘
```

---

## Component 1: Timing Engine

The Timing Engine decides **IF** and **WHEN** to surface memories.

### Core Interface

```typescript
// src/memory/intelligence/timing-engine.ts

export interface TimingDecision {
  shouldSurface: boolean;
  confidence: number; // 0-1
  reason: TimingReason;
  delay?: number; // Wait N turns before surfacing
  alternative?: 'later' | 'never' | 'abbreviated';
}

export type TimingReason =
  | 'high_relevance' // Direct match to conversation
  | 'emotional_opportunity' // User is in receptive state
  | 'proactive_care' // User needs this (pattern detection)
  | 'celebratory' // Achievement/milestone
  | 'skip_emotional' // User is too vulnerable now
  | 'skip_overload' // Too much context already
  | 'skip_irrelevant' // Not related enough
  | 'skip_recent' // Already surfaced recently
  | 'defer_later'; // Good but not now

export interface TimingContext {
  // Current conversation state
  conversationTurn: number;
  currentTopic: string;
  userMessage: string;

  // Emotional state
  userEmotionalState: EmotionalState;
  emotionalIntensity: number; // 0-1
  emotionalTrajectory: 'improving' | 'stable' | 'declining';

  // Session context
  sessionDuration: number; // seconds
  recentlySurfacedCount: number;
  lastSurfacedTurn: number;

  // Memory being considered
  memory: StoredMemory;
  similarityScore: number;
}

export interface EmotionalState {
  primary: 'neutral' | 'positive' | 'negative' | 'vulnerable' | 'overwhelmed';
  secondary?: string; // More specific (e.g., "anxious", "excited")
  confidence: number;
}
```

### Implementation

```typescript
// src/memory/intelligence/timing-engine.ts

import type { TimingDecision, TimingContext, TimingReason } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TimingEngine' });

export class TimingEngine {
  private config: TimingConfig;
  private userPreferences: Map<string, UserTimingPreferences> = new Map();

  constructor(config?: Partial<TimingConfig>) {
    this.config = { ...DEFAULT_TIMING_CONFIG, ...config };
  }

  /**
   * Decide whether to surface a memory given the current context
   */
  evaluate(ctx: TimingContext): TimingDecision {
    // Run through decision rules
    const rules = this.getRules();

    for (const rule of rules) {
      const result = rule.evaluate(ctx);
      if (result.terminal) {
        log.debug(
          {
            rule: rule.name,
            decision: result.decision.shouldSurface,
            reason: result.decision.reason,
          },
          'Timing decision made'
        );

        return result.decision;
      }
    }

    // Default: surface if high similarity
    return {
      shouldSurface: ctx.similarityScore > 0.7,
      confidence: ctx.similarityScore,
      reason: ctx.similarityScore > 0.7 ? 'high_relevance' : 'skip_irrelevant',
    };
  }

  /**
   * Batch evaluate multiple memories
   */
  evaluateBatch(
    memories: Array<{ memory: StoredMemory; score: number }>,
    ctx: Omit<TimingContext, 'memory' | 'similarityScore'>
  ): TimingDecision[] {
    return memories.map(({ memory, score }) =>
      this.evaluate({ ...ctx, memory, similarityScore: score })
    );
  }

  private getRules(): TimingRule[] {
    return [
      // Rule 1: Skip if user is overwhelmed
      new OverwhelmSkipRule(),

      // Rule 2: Skip if recently surfaced
      new RecentSurfaceSkipRule(this.config),

      // Rule 3: Allow celebratory moments
      new CelebratoryAllowRule(),

      // Rule 4: Defer if emotionally vulnerable (unless supportive)
      new VulnerableDeferRule(),

      // Rule 5: Allow proactive care (pattern detection)
      new ProactiveCareRule(),

      // Rule 6: High relevance pass-through
      new HighRelevanceRule(this.config),

      // Rule 7: Consider emotional match
      new EmotionalMatchRule(),
    ];
  }
}

// ===============================================
// TIMING RULES
// ===============================================

interface TimingRule {
  name: string;
  evaluate(ctx: TimingContext): { terminal: boolean; decision: TimingDecision };
}

/**
 * Rule 1: Skip if user is overwhelmed
 * - Too much information is harmful
 * - Protect user from cognitive overload
 */
class OverwhelmSkipRule implements TimingRule {
  name = 'overwhelm-skip';

  evaluate(ctx: TimingContext): { terminal: boolean; decision: TimingDecision } {
    if (ctx.userEmotionalState.primary === 'overwhelmed') {
      return {
        terminal: true,
        decision: {
          shouldSurface: false,
          confidence: 0.9,
          reason: 'skip_overload',
          alternative: 'later',
        },
      };
    }

    // Also skip if we've surfaced too many already
    if (ctx.recentlySurfacedCount >= 3 && ctx.conversationTurn - ctx.lastSurfacedTurn < 2) {
      return {
        terminal: true,
        decision: {
          shouldSurface: false,
          confidence: 0.8,
          reason: 'skip_overload',
        },
      };
    }

    return {
      terminal: false,
      decision: { shouldSurface: false, confidence: 0, reason: 'skip_irrelevant' },
    };
  }
}

/**
 * Rule 2: Skip if memory was recently surfaced
 */
class RecentSurfaceSkipRule implements TimingRule {
  name = 'recent-surface-skip';

  constructor(private config: TimingConfig) {}

  evaluate(ctx: TimingContext): { terminal: boolean; decision: TimingDecision } {
    const daysSinceAccess = this.daysSince(ctx.memory.lastAccessedAt);

    if (daysSinceAccess < this.config.minDaysBetweenSurfaces) {
      return {
        terminal: true,
        decision: {
          shouldSurface: false,
          confidence: 0.8,
          reason: 'skip_recent',
        },
      };
    }

    return {
      terminal: false,
      decision: { shouldSurface: false, confidence: 0, reason: 'skip_irrelevant' },
    };
  }

  private daysSince(date: Date): number {
    return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  }
}

/**
 * Rule 3: Allow celebratory moments
 */
class CelebratoryAllowRule implements TimingRule {
  name = 'celebratory-allow';

  evaluate(ctx: TimingContext): { terminal: boolean; decision: TimingDecision } {
    const isCelebratory =
      (ctx.memory.type === 'event' &&
        ctx.memory.metadata.topic?.toLowerCase().includes('achievement')) ||
      ctx.memory.emotionalWeight > 0.8;

    const userPositive = ctx.userEmotionalState.primary === 'positive';

    if (isCelebratory && userPositive && ctx.similarityScore > 0.5) {
      return {
        terminal: true,
        decision: {
          shouldSurface: true,
          confidence: 0.9,
          reason: 'celebratory',
        },
      };
    }

    return {
      terminal: false,
      decision: { shouldSurface: false, confidence: 0, reason: 'skip_irrelevant' },
    };
  }
}

/**
 * Rule 4: Defer if user is emotionally vulnerable
 * - Unless the memory is supportive/comforting
 */
class VulnerableDeferRule implements TimingRule {
  name = 'vulnerable-defer';

  evaluate(ctx: TimingContext): { terminal: boolean; decision: TimingDecision } {
    if (ctx.userEmotionalState.primary !== 'vulnerable') {
      return {
        terminal: false,
        decision: { shouldSurface: false, confidence: 0, reason: 'skip_irrelevant' },
      };
    }

    // Allow supportive memories through
    const isSupportive =
      ctx.memory.type === 'emotion' ||
      ctx.memory.type === 'relationship' ||
      ctx.memory.metadata.topic?.toLowerCase().includes('support');

    if (isSupportive) {
      return {
        terminal: false,
        decision: { shouldSurface: false, confidence: 0, reason: 'skip_irrelevant' },
      };
    }

    // Defer non-supportive memories
    return {
      terminal: true,
      decision: {
        shouldSurface: false,
        confidence: 0.7,
        reason: 'skip_emotional',
        alternative: 'later',
        delay: 3, // Wait 3 turns
      },
    };
  }
}

/**
 * Rule 5: Proactive care - surface when user needs it
 */
class ProactiveCareRule implements TimingRule {
  name = 'proactive-care';

  evaluate(ctx: TimingContext): { terminal: boolean; decision: TimingDecision } {
    // Detect patterns that suggest user needs this memory
    const indicators = this.detectNeedIndicators(ctx);

    if (indicators.score > 0.7) {
      return {
        terminal: true,
        decision: {
          shouldSurface: true,
          confidence: indicators.score,
          reason: 'proactive_care',
        },
      };
    }

    return {
      terminal: false,
      decision: { shouldSurface: false, confidence: 0, reason: 'skip_irrelevant' },
    };
  }

  private detectNeedIndicators(ctx: TimingContext): { score: number; indicators: string[] } {
    const indicators: string[] = [];
    let score = 0;

    // User explicitly asking about past
    if (/remember|recall|last time|before/i.test(ctx.userMessage)) {
      indicators.push('explicit_recall_request');
      score += 0.3;
    }

    // Commitment being discussed
    if (ctx.memory.type === 'commitment') {
      if (/progress|how am i|doing/i.test(ctx.userMessage)) {
        indicators.push('commitment_check');
        score += 0.4;
      }
    }

    // Pattern repetition detected
    if (ctx.memory.type === 'pattern') {
      // Memory about a pattern, and similar topic in current message
      if (ctx.similarityScore > 0.6) {
        indicators.push('pattern_detected');
        score += 0.3;
      }
    }

    // Relationship context
    if (ctx.memory.type === 'relationship' && ctx.memory.metadata.persons) {
      const personsInMessage = ctx.memory.metadata.persons.some((p) =>
        ctx.userMessage.toLowerCase().includes(p.toLowerCase())
      );
      if (personsInMessage) {
        indicators.push('person_mentioned');
        score += 0.4;
      }
    }

    return { score: Math.min(1.0, score), indicators };
  }
}

/**
 * Rule 6: High relevance always surfaces
 */
class HighRelevanceRule implements TimingRule {
  name = 'high-relevance';

  constructor(private config: TimingConfig) {}

  evaluate(ctx: TimingContext): { terminal: boolean; decision: TimingDecision } {
    if (ctx.similarityScore > this.config.highRelevanceThreshold) {
      return {
        terminal: true,
        decision: {
          shouldSurface: true,
          confidence: ctx.similarityScore,
          reason: 'high_relevance',
        },
      };
    }

    return {
      terminal: false,
      decision: { shouldSurface: false, confidence: 0, reason: 'skip_irrelevant' },
    };
  }
}

/**
 * Rule 7: Emotional match - surface if emotions align
 */
class EmotionalMatchRule implements TimingRule {
  name = 'emotional-match';

  evaluate(ctx: TimingContext): { terminal: boolean; decision: TimingDecision } {
    // If memory has high emotional weight and context matches
    if (ctx.memory.emotionalWeight > 0.6 && ctx.similarityScore > 0.5) {
      // Check if emotional trajectory is positive
      if (ctx.emotionalTrajectory === 'improving') {
        return {
          terminal: true,
          decision: {
            shouldSurface: true,
            confidence: 0.75,
            reason: 'emotional_opportunity',
          },
        };
      }
    }

    return {
      terminal: false,
      decision: { shouldSurface: false, confidence: 0, reason: 'skip_irrelevant' },
    };
  }
}

// ===============================================
// CONFIG
// ===============================================

interface TimingConfig {
  highRelevanceThreshold: number;
  minDaysBetweenSurfaces: number;
  maxSurfacesPerSession: number;
  emotionalCooldownTurns: number;
}

const DEFAULT_TIMING_CONFIG: TimingConfig = {
  highRelevanceThreshold: 0.85,
  minDaysBetweenSurfaces: 0.5, // 12 hours
  maxSurfacesPerSession: 5,
  emotionalCooldownTurns: 3,
};
```

---

## Component 2: Selection Engine

The Selection Engine picks **WHICH** memories to surface from candidates.

```typescript
// src/memory/intelligence/selection-engine.ts

export interface SelectionCriteria {
  userId: string;
  query: string;
  queryEmbedding: number[];

  // Context for selection
  currentTopic?: string;
  persons?: string[];
  emotionalState?: EmotionalState;

  // Limits
  maxResults: number;

  // Weighting preferences
  weights?: SelectionWeights;
}

export interface SelectionWeights {
  semantic: number; // Base similarity weight
  emotional: number; // Emotional weight boost
  recency: number; // Recent access boost
  access: number; // High access count boost
  narrative: number; // Life narrative relevance
  person: number; // Person mention boost
}

const DEFAULT_WEIGHTS: SelectionWeights = {
  semantic: 0.4,
  emotional: 0.2,
  recency: 0.1,
  access: 0.1,
  narrative: 0.1,
  person: 0.1,
};

export interface SelectionResult {
  memory: StoredMemory;
  finalScore: number;
  scoreBreakdown: Record<string, number>;
  explanations: string[];
}

export class SelectionEngine {
  constructor(
    private store: UnifiedMemoryStore,
    private weights: SelectionWeights = DEFAULT_WEIGHTS
  ) {}

  async select(criteria: SelectionCriteria): Promise<SelectionResult[]> {
    // 1. Get candidate memories from store
    const { memories } = await this.store.recall({
      userId: criteria.userId,
      embedding: criteria.queryEmbedding,
      limit: criteria.maxResults * 3, // Over-fetch for scoring
      boostRecent: true,
    });

    // 2. Score each memory
    const scored = memories.map((memory) => this.scoreMemory(memory, criteria));

    // 3. Sort by final score
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // 4. Deduplicate similar memories
    const deduplicated = this.deduplicate(scored);

    // 5. Return top N
    return deduplicated.slice(0, criteria.maxResults);
  }

  private scoreMemory(memory: ScoredMemory, criteria: SelectionCriteria): SelectionResult {
    const weights = criteria.weights ?? this.weights;
    const breakdown: Record<string, number> = {};
    const explanations: string[] = [];

    // Semantic score (from vector search)
    breakdown.semantic = memory.score * weights.semantic;

    // Emotional score
    breakdown.emotional = memory.emotionalWeight * weights.emotional;
    if (memory.emotionalWeight > 0.7) {
      explanations.push('High emotional significance');
    }

    // Recency score
    const daysSinceAccess = this.daysSince(memory.lastAccessedAt);
    breakdown.recency = Math.max(0, (30 - daysSinceAccess) / 30) * weights.recency;

    // Access frequency score
    breakdown.access = Math.min(1, Math.log10(memory.accessCount + 1) / 2) * weights.access;

    // Narrative relevance (if we have topic context)
    if (criteria.currentTopic && memory.metadata.topic) {
      const topicMatch = this.calculateTopicOverlap(criteria.currentTopic, memory.metadata.topic);
      breakdown.narrative = topicMatch * weights.narrative;
      if (topicMatch > 0.5) {
        explanations.push(`Related to ${memory.metadata.topic}`);
      }
    } else {
      breakdown.narrative = 0;
    }

    // Person mention boost
    if (criteria.persons && memory.metadata.persons) {
      const personOverlap =
        criteria.persons.filter((p) => memory.metadata.persons?.includes(p)).length /
        criteria.persons.length;
      breakdown.person = personOverlap * weights.person;
      if (personOverlap > 0) {
        explanations.push(`Mentions ${memory.metadata.persons?.join(', ')}`);
      }
    } else {
      breakdown.person = 0;
    }

    // Calculate final score
    const finalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

    return {
      memory,
      finalScore,
      scoreBreakdown: breakdown,
      explanations,
    };
  }

  private deduplicate(results: SelectionResult[]): SelectionResult[] {
    const seen = new Set<string>();
    const deduplicated: SelectionResult[] = [];

    for (const result of results) {
      // Simple content hash
      const hash = this.contentHash(result.memory.content);

      if (!seen.has(hash)) {
        seen.add(hash);
        deduplicated.push(result);
      }
    }

    return deduplicated;
  }

  private contentHash(content: string): string {
    // Simplified - use first 50 chars normalized
    return content.toLowerCase().replace(/\s+/g, ' ').slice(0, 50);
  }

  private calculateTopicOverlap(topic1: string, topic2: string): number {
    const words1 = new Set(topic1.toLowerCase().split(/\s+/));
    const words2 = new Set(topic2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private daysSince(date: Date): number {
    return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  }
}
```

---

## Component 3: Phrasing Generator

The Phrasing Generator creates **natural language** from memories.

```typescript
// src/memory/intelligence/phrasing-generator.ts

export interface PhrasingContext {
  memory: StoredMemory;
  conversationContext: string; // Recent conversation
  personaId: string;
  emotionalState: EmotionalState;

  // How to phrase
  style: PhrasingStyle;
}

export type PhrasingStyle =
  | 'casual' // "Oh, that reminds me..."
  | 'supportive' // "I remember you mentioned..."
  | 'celebratory' // "Hey! Remember when..."
  | 'reflective' // "You know, looking back..."
  | 'curious' // "I was thinking about..."
  | 'gentle'; // "I recall you sharing..."

export interface PhrasedMemory {
  text: string; // The natural language phrase
  leadIn: string; // Opening hook
  body: string; // Core memory content
  followUp?: string; // Optional follow-up question

  meta: {
    style: PhrasingStyle;
    wordCount: number;
    personaVoice: boolean;
  };
}

export class PhrasingGenerator {
  private personaVoices: Map<string, PersonaVoice> = new Map();

  constructor() {
    this.loadPersonaVoices();
  }

  async generate(ctx: PhrasingContext): Promise<PhrasedMemory> {
    // Get persona voice characteristics
    const voice = this.personaVoices.get(ctx.personaId) ?? DEFAULT_VOICE;

    // Select appropriate lead-in
    const leadIn = this.selectLeadIn(ctx.style, voice);

    // Format the memory body
    const body = this.formatBody(ctx.memory, voice);

    // Generate follow-up if appropriate
    const followUp = this.generateFollowUp(ctx);

    // Assemble
    const text = followUp ? `${leadIn} ${body} ${followUp}` : `${leadIn} ${body}`;

    return {
      text,
      leadIn,
      body,
      followUp,
      meta: {
        style: ctx.style,
        wordCount: text.split(/\s+/).length,
        personaVoice: true,
      },
    };
  }

  private selectLeadIn(style: PhrasingStyle, voice: PersonaVoice): string {
    const options = LEAD_INS[style] ?? LEAD_INS.casual;

    // Weight by persona voice
    const weighted = options.map((opt) => ({
      text: opt.text,
      weight: opt.warmth * voice.warmthPreference + opt.directness * voice.directnessPreference,
    }));

    // Pick weighted random
    return this.weightedRandom(weighted);
  }

  private formatBody(memory: StoredMemory, voice: PersonaVoice): string {
    let body = memory.content;

    // Trim if too long
    if (body.length > 150) {
      body = body.slice(0, 147) + '...';
    }

    // Add temporal context if relevant
    const age = this.getTimeAgoPhrase(memory.createdAt);
    if (age && memory.type !== 'fact') {
      body = `${age}, ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
    }

    return body;
  }

  private generateFollowUp(ctx: PhrasingContext): string | undefined {
    // Only generate follow-up for certain styles
    if (!['curious', 'reflective', 'supportive'].includes(ctx.style)) {
      return undefined;
    }

    // Generate contextual follow-up
    const followUps = FOLLOW_UPS[ctx.memory.type] ?? [];
    if (followUps.length === 0) return undefined;

    return followUps[Math.floor(Math.random() * followUps.length)];
  }

  private getTimeAgoPhrase(date: Date): string | null {
    const days = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);

    if (days < 1) return null;
    if (days < 7) return 'a few days ago';
    if (days < 14) return 'last week';
    if (days < 30) return 'a couple weeks ago';
    if (days < 60) return 'last month';
    if (days < 180) return 'a few months ago';
    if (days < 365) return 'earlier this year';
    return 'a while back';
  }

  private weightedRandom(items: Array<{ text: string; weight: number }>): string {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of items) {
      random -= item.weight;
      if (random <= 0) return item.text;
    }

    return items[0].text;
  }

  private loadPersonaVoices(): void {
    // Load from persona bundles
    this.personaVoices.set('ferni', {
      warmthPreference: 0.9,
      directnessPreference: 0.6,
      formality: 0.3,
    });

    this.personaVoices.set('maya', {
      warmthPreference: 0.8,
      directnessPreference: 0.5,
      formality: 0.4,
    });

    this.personaVoices.set('peter', {
      warmthPreference: 0.6,
      directnessPreference: 0.8,
      formality: 0.5,
    });

    // Add others...
  }
}

// ===============================================
// PHRASE TEMPLATES
// ===============================================

interface LeadInOption {
  text: string;
  warmth: number;
  directness: number;
}

const LEAD_INS: Record<PhrasingStyle, LeadInOption[]> = {
  casual: [
    { text: 'Oh, that reminds me—', warmth: 0.7, directness: 0.5 },
    { text: 'You know what? I just thought of', warmth: 0.8, directness: 0.4 },
    { text: 'This made me think of something—', warmth: 0.6, directness: 0.6 },
  ],
  supportive: [
    { text: 'I remember you shared with me that', warmth: 0.9, directness: 0.4 },
    { text: 'You mentioned before that', warmth: 0.7, directness: 0.6 },
    { text: 'I recall when you told me', warmth: 0.8, directness: 0.5 },
  ],
  celebratory: [
    { text: 'Hey! Remember when', warmth: 0.9, directness: 0.7 },
    { text: 'This is exciting—it reminds me of when', warmth: 0.85, directness: 0.6 },
    { text: 'You know what this brings to mind?', warmth: 0.8, directness: 0.5 },
  ],
  reflective: [
    { text: 'Looking back, you mentioned', warmth: 0.7, directness: 0.6 },
    { text: "You know, I've been thinking about when you said", warmth: 0.75, directness: 0.5 },
    { text: 'Something you shared comes to mind—', warmth: 0.8, directness: 0.4 },
  ],
  curious: [
    { text: 'I was thinking about something you mentioned—', warmth: 0.7, directness: 0.5 },
    { text: 'This connects to something you shared before:', warmth: 0.65, directness: 0.6 },
    { text: "You know what I've been curious about?", warmth: 0.75, directness: 0.4 },
  ],
  gentle: [
    { text: 'I gently recall you sharing that', warmth: 0.9, directness: 0.3 },
    { text: 'You once told me, and it stayed with me:', warmth: 0.85, directness: 0.4 },
    { text: 'I remember, softly, when you mentioned', warmth: 0.95, directness: 0.2 },
  ],
};

const FOLLOW_UPS: Record<string, string[]> = {
  commitment: ["How's that going?", 'Any updates on that?', 'Is that still on your mind?'],
  event: ['How do you feel about that now?', 'Has anything changed since then?'],
  pattern: ['Does this feel like a pattern to you?', 'Have you noticed this before?'],
  relationship: ['How are things with them now?', 'Have you talked to them recently?'],
};

interface PersonaVoice {
  warmthPreference: number; // 0-1
  directnessPreference: number; // 0-1
  formality: number; // 0-1
}

const DEFAULT_VOICE: PersonaVoice = {
  warmthPreference: 0.7,
  directnessPreference: 0.5,
  formality: 0.4,
};
```

---

## Component 4: Learning Engine

The Learning Engine tracks user reactions and adapts over time.

```typescript
// src/memory/intelligence/learning-engine.ts

export interface UserReaction {
  userId: string;
  memoryId: string;
  surfaceTimestamp: Date;

  // What happened after surfacing
  reaction: ReactionType;

  // Context
  timingDecision: TimingDecision;
  phrasingStyle: PhrasingStyle;
  conversationContext: string;
}

export type ReactionType =
  | 'engaged' // User continued on topic, asked follow-up
  | 'acknowledged' // User briefly acknowledged
  | 'ignored' // User changed topic
  | 'negative' // User expressed displeasure
  | 'grateful'; // User explicitly thanked

export interface UserTimingPreferences {
  // Learned thresholds
  preferredSimilarityThreshold: number;
  emotionalOpenness: number; // How open to emotional memories
  proactiveWelcome: number; // How much they like proactive surfacing

  // Style preferences
  preferredStyles: PhrasingStyle[];
  avoidStyles: PhrasingStyle[];

  // Timing preferences
  preferredSessionPhase: 'early' | 'middle' | 'late' | 'any';
  maxMemoriesPerSession: number;

  // Topics
  sensitiveTopics: string[]; // Topics to be careful with

  // Stats
  totalSurfaces: number;
  engagementRate: number;
  lastUpdated: Date;
}

export class LearningEngine {
  private store: UnifiedMemoryStore;
  private preferences: Map<string, UserTimingPreferences> = new Map();

  constructor(store: UnifiedMemoryStore) {
    this.store = store;
  }

  /**
   * Record a user's reaction to a surfaced memory
   */
  async recordReaction(reaction: UserReaction): Promise<void> {
    // Get or create user preferences
    let prefs = this.preferences.get(reaction.userId);
    if (!prefs) {
      prefs = await this.loadPreferences(reaction.userId);
    }

    // Update based on reaction
    prefs = this.updatePreferences(prefs, reaction);

    // Save
    this.preferences.set(reaction.userId, prefs);
    await this.savePreferences(reaction.userId, prefs);

    // Also update the memory's emotional weight based on reaction
    await this.updateMemoryWeight(reaction);
  }

  /**
   * Get learned preferences for a user
   */
  async getPreferences(userId: string): Promise<UserTimingPreferences> {
    let prefs = this.preferences.get(userId);
    if (!prefs) {
      prefs = await this.loadPreferences(userId);
      this.preferences.set(userId, prefs);
    }
    return prefs;
  }

  /**
   * Detect reaction from conversation flow
   */
  detectReaction(
    surfacedMemory: StoredMemory,
    subsequentMessages: string[],
    phrasingUsed: PhrasedMemory
  ): ReactionType {
    if (subsequentMessages.length === 0) {
      return 'ignored';
    }

    const firstResponse = subsequentMessages[0].toLowerCase();

    // Check for gratitude
    if (/thank|appreciate|that's (so )?helpful|i needed that/i.test(firstResponse)) {
      return 'grateful';
    }

    // Check for negative reaction
    if (/don't|stop|not now|i'd rather|please don't/i.test(firstResponse)) {
      return 'negative';
    }

    // Check for engagement (follow-up questions, continuation)
    const memoryKeywords = surfacedMemory.content.toLowerCase().split(/\s+/);
    const responseContainsKeywords = memoryKeywords.some(
      (kw) => kw.length > 4 && firstResponse.includes(kw)
    );

    if (responseContainsKeywords || firstResponse.length > 50) {
      return 'engaged';
    }

    // Check for acknowledgment vs ignored
    if (/yeah|yes|right|mm|ok|sure|uh huh/i.test(firstResponse) && firstResponse.length < 20) {
      return 'acknowledged';
    }

    // Default to ignored if topic changed immediately
    return 'ignored';
  }

  private updatePreferences(
    prefs: UserTimingPreferences,
    reaction: UserReaction
  ): UserTimingPreferences {
    const learningRate = 0.1; // How much each reaction affects preferences

    prefs.totalSurfaces++;

    // Update engagement rate (exponential moving average)
    const isPositive = ['engaged', 'grateful', 'acknowledged'].includes(reaction.reaction);
    prefs.engagementRate =
      prefs.engagementRate * (1 - learningRate) + (isPositive ? 1 : 0) * learningRate;

    // Update similarity threshold
    if (reaction.reaction === 'ignored' || reaction.reaction === 'negative') {
      // User didn't want this - raise threshold
      prefs.preferredSimilarityThreshold = Math.min(
        0.95,
        prefs.preferredSimilarityThreshold + 0.02
      );
    } else if (reaction.reaction === 'grateful' || reaction.reaction === 'engaged') {
      // User appreciated this - lower threshold
      prefs.preferredSimilarityThreshold = Math.max(0.5, prefs.preferredSimilarityThreshold - 0.01);
    }

    // Update emotional openness
    const memoryWasEmotional = reaction.timingDecision.reason === 'emotional_opportunity';
    if (memoryWasEmotional) {
      if (isPositive) {
        prefs.emotionalOpenness = Math.min(1, prefs.emotionalOpenness + 0.05);
      } else {
        prefs.emotionalOpenness = Math.max(0.2, prefs.emotionalOpenness - 0.1);
      }
    }

    // Update proactive welcome
    const wasProactive = reaction.timingDecision.reason === 'proactive_care';
    if (wasProactive) {
      if (isPositive) {
        prefs.proactiveWelcome = Math.min(1, prefs.proactiveWelcome + 0.05);
      } else {
        prefs.proactiveWelcome = Math.max(0.1, prefs.proactiveWelcome - 0.1);
      }
    }

    // Update style preferences
    const styleUsed = reaction.phrasingStyle;
    if (reaction.reaction === 'engaged' || reaction.reaction === 'grateful') {
      if (!prefs.preferredStyles.includes(styleUsed)) {
        prefs.preferredStyles.push(styleUsed);
      }
      prefs.avoidStyles = prefs.avoidStyles.filter((s) => s !== styleUsed);
    } else if (reaction.reaction === 'negative') {
      if (!prefs.avoidStyles.includes(styleUsed)) {
        prefs.avoidStyles.push(styleUsed);
      }
      prefs.preferredStyles = prefs.preferredStyles.filter((s) => s !== styleUsed);
    }

    prefs.lastUpdated = new Date();

    return prefs;
  }

  private async updateMemoryWeight(reaction: UserReaction): Promise<void> {
    // Reinforce memories that got good reactions
    if (reaction.reaction === 'engaged' || reaction.reaction === 'grateful') {
      await this.store.reinforce(reaction.memoryId);
    }
  }

  private async loadPreferences(userId: string): Promise<UserTimingPreferences> {
    // Try to load from store
    // If not found, return defaults

    return {
      preferredSimilarityThreshold: 0.75,
      emotionalOpenness: 0.7,
      proactiveWelcome: 0.6,
      preferredStyles: ['casual', 'supportive'],
      avoidStyles: [],
      preferredSessionPhase: 'any',
      maxMemoriesPerSession: 5,
      sensitiveTopics: [],
      totalSurfaces: 0,
      engagementRate: 0.5,
      lastUpdated: new Date(),
    };
  }

  private async savePreferences(userId: string, prefs: UserTimingPreferences): Promise<void> {
    // Save to unified store as a special document
    // Implementation depends on store API
  }
}
```

---

## Orchestrator: Putting It All Together

```typescript
// src/memory/intelligence/orchestrator.ts

import type { StoredMemory, RecallResult } from '../unified-store/types.js';
import { TimingEngine, TimingContext } from './timing-engine.js';
import { SelectionEngine, SelectionResult } from './selection-engine.js';
import { PhrasingGenerator, PhrasedMemory, PhrasingStyle } from './phrasing-generator.js';
import { LearningEngine, UserTimingPreferences } from './learning-engine.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryIntelligence' });

export interface IntelligentMemoryRequest {
  userId: string;
  query: string;

  // Conversation context
  conversationTurn: number;
  recentMessages: string[];
  currentTopic?: string;
  persons?: string[];

  // Emotional context
  emotionalState: EmotionalState;
  emotionalIntensity: number;
  emotionalTrajectory: 'improving' | 'stable' | 'declining';

  // Persona
  personaId: string;

  // Options
  maxResults?: number;
  forceStyle?: PhrasingStyle;
}

export interface IntelligentMemoryResponse {
  surfaced: SurfacedMemory[];
  deferred: DeferredMemory[];
  skipped: number;

  meta: {
    candidatesConsidered: number;
    processingTimeMs: number;
    userPreferencesApplied: boolean;
  };
}

export interface SurfacedMemory {
  memory: StoredMemory;
  phrased: PhrasedMemory;
  timing: {
    reason: string;
    confidence: number;
  };
  selection: {
    finalScore: number;
    explanations: string[];
  };
}

export interface DeferredMemory {
  memory: StoredMemory;
  deferReason: string;
  suggestedDelay: number;
}

export class MemoryIntelligenceOrchestrator {
  private store: UnifiedMemoryStore;
  private timing: TimingEngine;
  private selection: SelectionEngine;
  private phrasing: PhrasingGenerator;
  private learning: LearningEngine;

  constructor(store: UnifiedMemoryStore) {
    this.store = store;
    this.timing = new TimingEngine();
    this.selection = new SelectionEngine(store);
    this.phrasing = new PhrasingGenerator();
    this.learning = new LearningEngine(store);
  }

  /**
   * Main entry point: get intelligently selected and phrased memories
   */
  async getRelevantMemories(request: IntelligentMemoryRequest): Promise<IntelligentMemoryResponse> {
    const startTime = performance.now();

    // 1. Get user preferences
    const userPrefs = await this.learning.getPreferences(request.userId);

    // 2. Select candidate memories
    const queryEmbedding = await this.generateEmbedding(request.query);
    const candidates = await this.selection.select({
      userId: request.userId,
      query: request.query,
      queryEmbedding,
      currentTopic: request.currentTopic,
      persons: request.persons,
      emotionalState: request.emotionalState,
      maxResults: (request.maxResults ?? 5) * 2, // Over-fetch for timing filter
    });

    // 3. Run timing decisions on each
    const surfaced: SurfacedMemory[] = [];
    const deferred: DeferredMemory[] = [];
    let skipped = 0;

    for (const candidate of candidates) {
      const timingCtx: TimingContext = {
        conversationTurn: request.conversationTurn,
        currentTopic: request.currentTopic ?? '',
        userMessage: request.query,
        userEmotionalState: request.emotionalState,
        emotionalIntensity: request.emotionalIntensity,
        emotionalTrajectory: request.emotionalTrajectory,
        sessionDuration: 0, // Could add to request
        recentlySurfacedCount: surfaced.length,
        lastSurfacedTurn: request.conversationTurn - 1,
        memory: candidate.memory,
        similarityScore: candidate.finalScore,
      };

      // Apply user preferences to timing
      timingCtx.similarityScore = Math.max(
        timingCtx.similarityScore,
        userPrefs.preferredSimilarityThreshold * 0.9 // Slightly easier threshold for returning users
      );

      const decision = this.timing.evaluate(timingCtx);

      if (!decision.shouldSurface) {
        if (decision.delay) {
          deferred.push({
            memory: candidate.memory,
            deferReason: decision.reason,
            suggestedDelay: decision.delay,
          });
        } else {
          skipped++;
        }
        continue;
      }

      // 4. Generate natural phrasing
      const style = request.forceStyle ?? this.selectStyle(request, candidate, userPrefs);
      const phrased = await this.phrasing.generate({
        memory: candidate.memory,
        conversationContext: request.recentMessages.join('\n'),
        personaId: request.personaId,
        emotionalState: request.emotionalState,
        style,
      });

      surfaced.push({
        memory: candidate.memory,
        phrased,
        timing: {
          reason: decision.reason,
          confidence: decision.confidence,
        },
        selection: {
          finalScore: candidate.finalScore,
          explanations: candidate.explanations,
        },
      });

      // Limit results
      if (surfaced.length >= (request.maxResults ?? 5)) {
        break;
      }
    }

    const processingTimeMs = performance.now() - startTime;

    log.debug(
      {
        userId: request.userId,
        surfaced: surfaced.length,
        deferred: deferred.length,
        skipped,
        processingTimeMs,
      },
      'Memory intelligence completed'
    );

    return {
      surfaced,
      deferred,
      skipped,
      meta: {
        candidatesConsidered: candidates.length,
        processingTimeMs,
        userPreferencesApplied: true,
      },
    };
  }

  /**
   * Record a reaction to surfaced memory (for learning)
   */
  async recordReaction(
    userId: string,
    memoryId: string,
    reaction: ReactionType,
    context: {
      timingDecision: TimingDecision;
      phrasingStyle: PhrasingStyle;
      conversationContext: string;
    }
  ): Promise<void> {
    await this.learning.recordReaction({
      userId,
      memoryId,
      surfaceTimestamp: new Date(),
      reaction,
      ...context,
    });
  }

  private selectStyle(
    request: IntelligentMemoryRequest,
    candidate: SelectionResult,
    prefs: UserTimingPreferences
  ): PhrasingStyle {
    // Use user's preferred styles
    if (prefs.preferredStyles.length > 0) {
      // Filter out avoided styles
      const available = prefs.preferredStyles.filter((s) => !prefs.avoidStyles.includes(s));
      if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
      }
    }

    // Select based on context
    if (request.emotionalState.primary === 'positive') {
      return 'celebratory';
    }
    if (request.emotionalState.primary === 'vulnerable') {
      return 'gentle';
    }
    if (candidate.memory.type === 'pattern') {
      return 'reflective';
    }
    if (candidate.memory.type === 'commitment') {
      return 'curious';
    }

    return 'supportive';
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Use embedding service
    const { generateEmbedding } = await import('../embeddings.js');
    return generateEmbedding(text);
  }
}

// Export singleton factory
let instance: MemoryIntelligenceOrchestrator | null = null;

export function getMemoryIntelligence(store?: UnifiedMemoryStore): MemoryIntelligenceOrchestrator {
  if (!instance && store) {
    instance = new MemoryIntelligenceOrchestrator(store);
  }
  if (!instance) {
    throw new Error('MemoryIntelligenceOrchestrator not initialized');
  }
  return instance;
}
```

---

## Integration with Context Builders

```typescript
// src/intelligence/context-builders/intelligent-memory.ts

import {
  getMemoryIntelligence,
  IntelligentMemoryResponse,
} from '../../memory/intelligence/orchestrator.js';
import type { ContextBuilder, ConversationContext } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'IntelligentMemoryBuilder' });

/**
 * Context builder that uses the Memory Intelligence Layer
 * Replaces: advanced-memory.ts, proactive-memory.ts, human-memory.ts
 */
export const intelligentMemoryBuilder: ContextBuilder = {
  name: 'intelligent-memory',
  priority: 70, // High priority

  async build(ctx: ConversationContext): Promise<string> {
    const intelligence = getMemoryIntelligence();

    const response = await intelligence.getRelevantMemories({
      userId: ctx.userId,
      query: ctx.currentMessage,
      conversationTurn: ctx.turnCount,
      recentMessages: ctx.recentMessages,
      currentTopic: ctx.detectedTopic,
      persons: ctx.mentionedPersons,
      emotionalState: ctx.emotionalState,
      emotionalIntensity: ctx.emotionalIntensity,
      emotionalTrajectory: ctx.emotionalTrajectory,
      personaId: ctx.persona.id,
      maxResults: 3,
    });

    if (response.surfaced.length === 0) {
      return '';
    }

    // Format for context injection
    const lines = ['## Relevant Memories (Surface Naturally)', ''];

    for (const mem of response.surfaced) {
      lines.push(`**${mem.phrased.leadIn}**`);
      lines.push(mem.phrased.text);
      lines.push(
        `_Reason: ${mem.timing.reason} (confidence: ${mem.timing.confidence.toFixed(2)})_`
      );
      lines.push('');
    }

    // Add guidance
    lines.push('### Guidelines');
    lines.push('- Weave these memories naturally into conversation');
    lines.push('- Use the suggested phrasing as inspiration');
    lines.push('- Skip if user changes topic dramatically');

    return lines.join('\n');
  },
};
```

---

## Testing Strategy

### Unit Tests for Each Component

```typescript
// src/memory/intelligence/__tests__/timing-engine.test.ts

import { describe, it, expect } from 'vitest';
import { TimingEngine } from '../timing-engine.js';

describe('TimingEngine', () => {
  const engine = new TimingEngine();

  describe('overwhelm detection', () => {
    it('should skip when user is overwhelmed', () => {
      const decision = engine.evaluate({
        userEmotionalState: { primary: 'overwhelmed', confidence: 0.9 },
        // ... other context
      });

      expect(decision.shouldSurface).toBe(false);
      expect(decision.reason).toBe('skip_overload');
    });
  });

  describe('celebratory moments', () => {
    it('should allow celebratory memories for positive users', () => {
      const decision = engine.evaluate({
        userEmotionalState: { primary: 'positive', confidence: 0.8 },
        memory: { type: 'event', emotionalWeight: 0.85 },
        similarityScore: 0.6,
        // ... other context
      });

      expect(decision.shouldSurface).toBe(true);
      expect(decision.reason).toBe('celebratory');
    });
  });
});
```

### Integration Tests

```typescript
// src/memory/intelligence/__tests__/integration.test.ts

describe('Memory Intelligence Integration', () => {
  it('should surface appropriate memories with natural phrasing', async () => {
    const store = createTestStore();
    const intelligence = new MemoryIntelligenceOrchestrator(store);

    // Add test memories
    await store.store({
      userId: 'test-user',
      content: 'User wants to learn guitar',
      type: 'commitment',
    });

    // Request memories
    const response = await intelligence.getRelevantMemories({
      userId: 'test-user',
      query: 'I was thinking about picking up a new hobby',
      // ... context
    });

    expect(response.surfaced.length).toBeGreaterThan(0);
    expect(response.surfaced[0].phrased.text).toContain('guitar');
  });
});
```

---

## Success Metrics

| Metric                   | Baseline | Target                      |
| ------------------------ | -------- | --------------------------- |
| Memory engagement rate   | ~30%     | >60%                        |
| Negative reactions       | ~15%     | <5%                         |
| User-initiated recall    | ~5%      | >20%                        |
| Average memories/session | 8        | 3-5 (quality over quantity) |
| User satisfaction score  | N/A      | >4.5/5                      |

---

_Next: [03-ASSOCIATIVE-CORTEX.md](./03-ASSOCIATIVE-CORTEX.md)_
