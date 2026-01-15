/**
 * Growth Visibility Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: helping users see their own growth
 * when they can't see it themselves. Humans minimize their progress.
 * Ferni REMEMBERS and REFLECTS.
 *
 * Types of growth we track:
 * 1. **Capability Growth**: "You couldn't do X before, now you can"
 * 2. **Topic Comfort**: "This topic used to shut you down, now you discuss it freely"
 * 3. **Pattern Breaks**: "You used to avoid Y, now you tackle it head-on"
 * 4. **Consistency Improvement**: "You went from sporadic to regular"
 * 5. **Depth Increase**: "Your conversations have gotten deeper"
 * 6. **Emotional Regulation**: "You handle Z differently now"
 * 7. **Self-Awareness**: "You notice things about yourself you didn't before"
 *
 * Philosophy:
 * - Track LONGITUDINAL data (over time)
 * - Surface at the RIGHT moment (not randomly)
 * - Be SPECIFIC (not generic praise)
 * - Show the CONTRAST (before vs. after)
 *
 * @module GrowthVisibilityEngine
 */

import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GrowthVisibility' });

// ============================================================================
// TYPES
// ============================================================================

export type GrowthType =
  | 'capability_growth'
  | 'topic_comfort'
  | 'pattern_break'
  | 'consistency_improvement'
  | 'depth_increase'
  | 'emotional_regulation'
  | 'self_awareness';

export interface GrowthInsight {
  id: string;
  type: GrowthType;
  userId: string;

  /** What grew */
  area: string;

  /** What it was like before */
  before: string;

  /** What it's like now */
  after: string;

  /** Evidence for this growth */
  evidence: GrowthEvidence[];

  /** Time period of growth */
  timespan: {
    start: Date;
    end: Date;
    durationDays: number;
  };

  /** How confident are we in this insight (0-1) */
  confidence: number;

  /** Has this been surfaced to the user? */
  surfaced: boolean;

  /** When surfaced */
  surfacedAt?: Date;

  /** User's reaction */
  userReaction?: 'resonated' | 'neutral' | 'dismissed';

  /** Generated reflection */
  reflection?: string;
}

export interface GrowthEvidence {
  type: 'conversation' | 'behavior' | 'explicit_statement' | 'pattern';
  timestamp: Date;
  description: string;
  source?: string; // session ID, etc.
}

export interface GrowthSnapshot {
  userId: string;
  capturedAt: Date;

  /** Topics discussed and comfort level */
  topicComfort: Map<string, TopicComfortLevel>;

  /** Behavioral patterns observed */
  patterns: BehavioralPattern[];

  /** Emotional handling patterns */
  emotionalPatterns: EmotionalPattern[];

  /** Conversation depth metrics */
  conversationDepth: ConversationDepthMetrics;

  /** Self-awareness indicators */
  selfAwareness: SelfAwarenessIndicators;
}

export interface TopicComfortLevel {
  topic: string;
  comfortLevel: 'avoidant' | 'uncomfortable' | 'neutral' | 'comfortable' | 'open';
  lastDiscussed: Date;
  discussionCount: number;
  emotionalIntensityAvg: number;
}

export interface BehavioralPattern {
  pattern: string;
  frequency: 'rarely' | 'sometimes' | 'often' | 'consistently';
  firstObserved: Date;
  lastObserved: Date;
  occurrences: number;
}

export interface EmotionalPattern {
  trigger: string;
  typicalResponse: string;
  intensityTrend: 'increasing' | 'stable' | 'decreasing';
  observations: number;
}

export interface ConversationDepthMetrics {
  avgTurnLength: number;
  vulnerabilityFrequency: number; // How often they open up
  insightFrequency: number; // How often they have realizations
  questionFrequency: number; // How often they ask deep questions
}

export interface SelfAwarenessIndicators {
  selfReflectionCount: number;
  patternRecognition: number; // Times they noticed their own patterns
  emotionalLabeling: number; // Times they named their emotions
  growthAcknowledgment: number; // Times they acknowledged growth
}

export interface GrowthReflection {
  insight: GrowthInsight;
  reflection: string;
  ssml: string;
  suggestedMoment: 'session_start' | 'after_related_topic' | 'milestone' | 'anytime';
}

// ============================================================================
// GROWTH DETECTION PATTERNS
// ============================================================================

/** Self-awareness indicators in speech */
const SELF_AWARENESS_PATTERNS = [
  /i (notice|noticed|realize|see) (that )?(i|my)/i,
  /i'?m (aware|conscious) (that |of )/i,
  /that'?s (a pattern|my pattern|how i)/i,
  /i (always|usually|tend to)/i,
  /i can (see|tell) (that )?(i|when i)/i,
];

/** Vulnerability indicators */
const VULNERABILITY_PATTERNS = [
  /i'?ve never told/i,
  /this is (hard|difficult) (to say|for me)/i,
  /i'?m (scared|afraid|terrified)/i,
  /honestly|truthfully/i,
  /the truth is/i,
];

/** Insight indicators */
const INSIGHT_PATTERNS = [
  /i (just )?realized/i,
  /it (hit|clicked|dawned)/i,
  /i (finally )?(understand|get it)/i,
  /that makes sense/i,
  /i never (thought|saw)/i,
];

/** Growth acknowledgment */
const GROWTH_ACKNOWLEDGMENT_PATTERNS = [
  /i'?ve (grown|changed|improved)/i,
  /i'?m (better|different|not the same)/i,
  /compared to (before|when i started)/i,
  /i used to .+ but now/i,
  /i couldn'?t .+ before/i,
];

// ============================================================================
// GROWTH VISIBILITY ENGINE
// ============================================================================

export class GrowthVisibilityEngine {
  private userId: string;
  private snapshots: GrowthSnapshot[] = [];
  private insights: GrowthInsight[] = [];
  private currentSnapshot: GrowthSnapshot;

  constructor(userId: string) {
    this.userId = userId;
    this.currentSnapshot = this.createEmptySnapshot();
  }

  // ==========================================================================
  // SNAPSHOT MANAGEMENT
  // ==========================================================================

  /**
   * Create an empty snapshot
   */
  private createEmptySnapshot(): GrowthSnapshot {
    return {
      userId: this.userId,
      capturedAt: new Date(),
      topicComfort: new Map(),
      patterns: [],
      emotionalPatterns: [],
      conversationDepth: {
        avgTurnLength: 0,
        vulnerabilityFrequency: 0,
        insightFrequency: 0,
        questionFrequency: 0,
      },
      selfAwareness: {
        selfReflectionCount: 0,
        patternRecognition: 0,
        emotionalLabeling: 0,
        growthAcknowledgment: 0,
      },
    };
  }

  /**
   * Take a snapshot of current state for later comparison
   */
  captureSnapshot(): void {
    // Deep copy current snapshot
    const snapshot: GrowthSnapshot = {
      ...this.currentSnapshot,
      capturedAt: new Date(),
      topicComfort: new Map(this.currentSnapshot.topicComfort),
      patterns: [...this.currentSnapshot.patterns],
      emotionalPatterns: [...this.currentSnapshot.emotionalPatterns],
      conversationDepth: { ...this.currentSnapshot.conversationDepth },
      selfAwareness: { ...this.currentSnapshot.selfAwareness },
    };

    this.snapshots.push(snapshot);

    // Keep last 12 snapshots (e.g., monthly for a year)
    if (this.snapshots.length > 12) {
      this.snapshots.shift();
    }

    log.debug({ snapshotCount: this.snapshots.length }, '📸 Growth snapshot captured');
  }

  // ==========================================================================
  // DATA COLLECTION
  // ==========================================================================

  /**
   * Record a conversation turn for growth tracking
   */
  recordTurn(turn: {
    userMessage: string;
    topic?: string;
    emotion?: { primary: string; intensity: number };
    wasVulnerable?: boolean;
    hadInsight?: boolean;
  }): void {
    const { userMessage, topic, emotion, wasVulnerable, hadInsight } = turn;

    // Update topic comfort
    if (topic) {
      const existing = this.currentSnapshot.topicComfort.get(topic);
      if (existing) {
        existing.lastDiscussed = new Date();
        existing.discussionCount++;
        if (emotion) {
          existing.emotionalIntensityAvg =
            (existing.emotionalIntensityAvg * (existing.discussionCount - 1) + emotion.intensity) /
            existing.discussionCount;
        }
      } else {
        this.currentSnapshot.topicComfort.set(topic, {
          topic,
          comfortLevel: this.inferComfortLevel(emotion?.intensity || 0.5),
          lastDiscussed: new Date(),
          discussionCount: 1,
          emotionalIntensityAvg: emotion?.intensity || 0.5,
        });
      }
    }

    // Update conversation depth metrics
    this.currentSnapshot.conversationDepth.avgTurnLength =
      (this.currentSnapshot.conversationDepth.avgTurnLength + userMessage.length) / 2;

    if (wasVulnerable) {
      this.currentSnapshot.conversationDepth.vulnerabilityFrequency++;
    }

    if (hadInsight || INSIGHT_PATTERNS.some((p) => p.test(userMessage))) {
      this.currentSnapshot.conversationDepth.insightFrequency++;
    }

    // Update self-awareness indicators
    if (SELF_AWARENESS_PATTERNS.some((p) => p.test(userMessage))) {
      this.currentSnapshot.selfAwareness.selfReflectionCount++;
    }

    if (GROWTH_ACKNOWLEDGMENT_PATTERNS.some((p) => p.test(userMessage))) {
      this.currentSnapshot.selfAwareness.growthAcknowledgment++;
    }

    // Check for pattern recognition
    if (/i (always|usually|tend to|notice i)/i.test(userMessage)) {
      this.currentSnapshot.selfAwareness.patternRecognition++;
    }

    // Check for emotional labeling
    if (/i (feel|felt|'m feeling) (like |that |)?[a-z]+/i.test(userMessage)) {
      this.currentSnapshot.selfAwareness.emotionalLabeling++;
    }
  }

  /**
   * Infer comfort level from emotional intensity
   */
  private inferComfortLevel(intensity: number): TopicComfortLevel['comfortLevel'] {
    if (intensity > 0.8) return 'uncomfortable';
    if (intensity > 0.6) return 'neutral';
    if (intensity > 0.3) return 'comfortable';
    return 'open';
  }

  // ==========================================================================
  // GROWTH DETECTION
  // ==========================================================================

  /**
   * Detect growth by comparing snapshots
   */
  detectGrowth(): GrowthInsight[] {
    if (this.snapshots.length < 2) {
      return [];
    }

    const detectedInsights: GrowthInsight[] = [];
    const oldSnapshot = this.snapshots[0];
    const newSnapshot = this.currentSnapshot;
    const daysBetween = Math.floor(
      (newSnapshot.capturedAt.getTime() - oldSnapshot.capturedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // 1. Topic Comfort Growth
    for (const [topic, newComfort] of newSnapshot.topicComfort) {
      const oldComfort = oldSnapshot.topicComfort.get(topic);
      if (oldComfort && this.hasComfortImproved(oldComfort, newComfort)) {
        detectedInsights.push(
          this.createGrowthInsight('topic_comfort', {
            area: topic,
            before: `${oldComfort.comfortLevel} (discussed ${oldComfort.discussionCount} times)`,
            after: `${newComfort.comfortLevel} (discussed ${newComfort.discussionCount} times)`,
            evidence: [
              {
                type: 'behavior',
                timestamp: new Date(),
                description: `Topic "${topic}" comfort improved from ${oldComfort.comfortLevel} to ${newComfort.comfortLevel}`,
              },
            ],
            timespan: {
              start: oldSnapshot.capturedAt,
              end: newSnapshot.capturedAt,
              durationDays: daysBetween,
            },
            confidence: 0.7,
          })
        );
      }
    }

    // 2. Depth Increase
    if (this.hasDepthIncreased(oldSnapshot.conversationDepth, newSnapshot.conversationDepth)) {
      detectedInsights.push(
        this.createGrowthInsight('depth_increase', {
          area: 'Conversation depth',
          before: `Vulnerability: ${oldSnapshot.conversationDepth.vulnerabilityFrequency}, Insights: ${oldSnapshot.conversationDepth.insightFrequency}`,
          after: `Vulnerability: ${newSnapshot.conversationDepth.vulnerabilityFrequency}, Insights: ${newSnapshot.conversationDepth.insightFrequency}`,
          evidence: [
            {
              type: 'pattern',
              timestamp: new Date(),
              description: 'Conversations have become deeper and more vulnerable',
            },
          ],
          timespan: {
            start: oldSnapshot.capturedAt,
            end: newSnapshot.capturedAt,
            durationDays: daysBetween,
          },
          confidence: 0.65,
        })
      );
    }

    // 3. Self-Awareness Growth
    if (this.hasSelfAwarenessGrown(oldSnapshot.selfAwareness, newSnapshot.selfAwareness)) {
      detectedInsights.push(
        this.createGrowthInsight('self_awareness', {
          area: 'Self-awareness',
          before: `Self-reflection: ${oldSnapshot.selfAwareness.selfReflectionCount}, Pattern recognition: ${oldSnapshot.selfAwareness.patternRecognition}`,
          after: `Self-reflection: ${newSnapshot.selfAwareness.selfReflectionCount}, Pattern recognition: ${newSnapshot.selfAwareness.patternRecognition}`,
          evidence: [
            {
              type: 'pattern',
              timestamp: new Date(),
              description: 'Shows more self-reflection and pattern recognition',
            },
          ],
          timespan: {
            start: oldSnapshot.capturedAt,
            end: newSnapshot.capturedAt,
            durationDays: daysBetween,
          },
          confidence: 0.6,
        })
      );
    }

    // Store new insights
    this.insights.push(...detectedInsights);

    // Keep only unsurfaced or recent insights
    this.insights = this.insights.filter(
      (i) =>
        !i.surfaced ||
        (i.surfacedAt && Date.now() - i.surfacedAt.getTime() < 30 * 24 * 60 * 60 * 1000)
    );

    log.debug({ detected: detectedInsights.length }, '🌱 Growth insights detected');

    return detectedInsights;
  }

  /**
   * Check if topic comfort improved
   */
  private hasComfortImproved(old: TopicComfortLevel, current: TopicComfortLevel): boolean {
    const levels = ['avoidant', 'uncomfortable', 'neutral', 'comfortable', 'open'];
    const oldIndex = levels.indexOf(old.comfortLevel);
    const newIndex = levels.indexOf(current.comfortLevel);
    return newIndex > oldIndex;
  }

  /**
   * Check if conversation depth increased
   */
  private hasDepthIncreased(
    old: ConversationDepthMetrics,
    current: ConversationDepthMetrics
  ): boolean {
    const oldScore = old.vulnerabilityFrequency + old.insightFrequency;
    const newScore = current.vulnerabilityFrequency + current.insightFrequency;
    return newScore > oldScore * 1.2; // 20% improvement threshold
  }

  /**
   * Check if self-awareness grew
   */
  private hasSelfAwarenessGrown(
    old: SelfAwarenessIndicators,
    current: SelfAwarenessIndicators
  ): boolean {
    const oldScore = old.selfReflectionCount + old.patternRecognition + old.growthAcknowledgment;
    const newScore =
      current.selfReflectionCount + current.patternRecognition + current.growthAcknowledgment;
    return newScore > oldScore * 1.3; // 30% improvement threshold
  }

  /**
   * Create a growth insight
   */
  private createGrowthInsight(
    type: GrowthType,
    data: {
      area: string;
      before: string;
      after: string;
      evidence: GrowthEvidence[];
      timespan: { start: Date; end: Date; durationDays: number };
      confidence: number;
    }
  ): GrowthInsight {
    return {
      id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      userId: this.userId,
      area: data.area,
      before: data.before,
      after: data.after,
      evidence: data.evidence,
      timespan: data.timespan,
      confidence: data.confidence,
      surfaced: false,
    };
  }

  // ==========================================================================
  // REFLECTION GENERATION
  // ==========================================================================

  /**
   * Generate a growth reflection for surfacing
   */
  generateReflection(insight: GrowthInsight): GrowthReflection {
    const templates = this.getReflectionTemplates(insight.type);
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Personalize
    const reflection = template
      .replace('{area}', insight.area)
      .replace('{before}', insight.before)
      .replace('{after}', insight.after)
      .replace('{days}', insight.timespan.durationDays.toString())
      .replace('{timespan}', this.formatTimespan(insight.timespan.durationDays));

    const ssml = `<break time="300ms"/><prosody rate="95%" pitch="+5%">${reflection}</prosody>`;

    return {
      insight,
      reflection,
      ssml,
      suggestedMoment: this.getSuggestedMoment(insight),
    };
  }

  /**
   * Get reflection templates by type
   */
  private getReflectionTemplates(type: GrowthType): string[] {
    const templates: Record<GrowthType, string[]> = {
      capability_growth: [
        "You know what I've noticed? You couldn't {before} when we started. Now look at you.",
        "Remember when {before}? Now you just... do it. That's growth.",
        "I've been watching you go from {before} to {after}. That's not nothing.",
      ],
      topic_comfort: [
        "Can I tell you something? {area} used to make you tense up. Now you talk about it like it's just... a thing. That's huge.",
        "We couldn't even touch {area} at first. Now you bring it up yourself. You've grown.",
        'The way you handle {area} now vs. {timespan} ago? Night and day.',
      ],
      pattern_break: [
        "You used to {before}. You don't do that anymore. Have you noticed?",
        "I've been tracking something. That pattern of {before}? It's shifted. You're doing {after} now.",
        'Something changed. You broke a pattern that was holding you back.',
      ],
      consistency_improvement: [
        'Your consistency has transformed. From {before} to {after}. That takes real commitment.',
        'You show up differently now. More regular. More reliable to yourself.',
        "The consistency you've built over {timespan}? That's the foundation of lasting change.",
      ],
      depth_increase: [
        "Our conversations have gotten deeper. You open up more. You're not afraid to go there anymore.",
        "You share things now you never would have shared {timespan} ago. That trust didn't come easy.",
        "The depth you bring to our conversations now... it's different. Better. More you.",
      ],
      emotional_regulation: [
        'You handle {area} so differently now. More measured. More in control.',
        "Remember how {before}? Now you {after}. That's emotional growth right there.",
        "The way you regulated yourself just now? You couldn't have done that {timespan} ago.",
      ],
      self_awareness: [
        'You just noticed something about yourself. You do that a lot more now.',
        'Your self-awareness has grown so much. You see patterns in yourself that used to be invisible.',
        "The fact that you caught that? That's the self-awareness you've built.",
      ],
    };

    return templates[type];
  }

  /**
   * Format timespan for natural language
   */
  private formatTimespan(days: number): string {
    if (days < 7) return 'this week';
    if (days < 14) return 'the past couple weeks';
    if (days < 30) return 'the past month';
    if (days < 60) return 'the past couple months';
    if (days < 90) return 'the past few months';
    if (days < 180) return 'the past half year';
    if (days < 365) return 'the past year';
    return 'since we started';
  }

  /**
   * Get suggested moment to surface insight
   */
  private getSuggestedMoment(insight: GrowthInsight): GrowthReflection['suggestedMoment'] {
    if (insight.type === 'topic_comfort') return 'after_related_topic';
    if (insight.timespan.durationDays >= 30) return 'milestone';
    if (insight.confidence > 0.8) return 'session_start';
    return 'anytime';
  }

  // ==========================================================================
  // SURFACING
  // ==========================================================================

  /**
   * Get insight to surface if appropriate
   */
  getInsightToSurface(context?: {
    currentTopic?: string;
    sessionStart?: boolean;
    milestone?: boolean;
  }): GrowthReflection | null {
    // Get unsurfaced insights
    const unsurfaced = this.insights.filter((i) => !i.surfaced && i.confidence > 0.5);

    if (unsurfaced.length === 0) {
      return null;
    }

    // Filter by context
    let candidates = unsurfaced;

    if (context?.currentTopic) {
      const topicRelated = candidates.filter((i) =>
        i.area.toLowerCase().includes(context.currentTopic!.toLowerCase())
      );
      if (topicRelated.length > 0) {
        candidates = topicRelated;
      }
    }

    if (context?.sessionStart) {
      const sessionStartCandidates = candidates.filter(
        (i) => i.type === 'depth_increase' || i.type === 'self_awareness'
      );
      if (sessionStartCandidates.length > 0) {
        candidates = sessionStartCandidates;
      }
    }

    if (context?.milestone) {
      // Sort by confidence for milestones
      candidates.sort((a, b) => b.confidence - a.confidence);
    }

    // Select best candidate
    const selected = candidates[0];
    if (!selected) return null;

    // Mark as surfaced
    selected.surfaced = true;
    selected.surfacedAt = new Date();

    return this.generateReflection(selected);
  }

  /**
   * Record user reaction to surfaced insight
   */
  recordReaction(insightId: string, reaction: 'resonated' | 'neutral' | 'dismissed'): void {
    const insight = this.insights.find((i) => i.id === insightId);
    if (insight) {
      insight.userReaction = reaction;
      log.debug({ insightId, reaction }, 'Growth insight reaction recorded');
    }
  }

  // ==========================================================================
  // EXTERNAL INTEGRATION
  // ==========================================================================

  /**
   * Import growth data from user profile
   */
  importFromProfile(profile: UserProfile): void {
    // Import key moments as evidence
    if (profile.keyMoments) {
      for (const moment of profile.keyMoments) {
        if (moment.type === 'breakthrough') {
          this.currentSnapshot.conversationDepth.insightFrequency++;
        }
        if (moment.type === 'shared_vulnerability') {
          this.currentSnapshot.conversationDepth.vulnerabilityFrequency++;
        }
      }
    }

    // Import from custom data if stored
    if (profile.customData?.growthSnapshots) {
      this.snapshots = profile.customData.growthSnapshots as GrowthSnapshot[];
    }

    if (profile.customData?.growthInsights) {
      this.insights = profile.customData.growthInsights as GrowthInsight[];
    }

    log.debug(
      { snapshots: this.snapshots.length, insights: this.insights.length },
      'Imported growth data'
    );
  }

  /**
   * Export growth data for profile persistence
   */
  exportForProfile(): {
    snapshots: GrowthSnapshot[];
    insights: GrowthInsight[];
  } {
    return {
      snapshots: this.snapshots,
      insights: this.insights,
    };
  }

  /**
   * Get all detected insights
   */
  getAllInsights(): GrowthInsight[] {
    return [...this.insights];
  }

  /**
   * Get stats
   */
  getStats(): {
    totalInsights: number;
    surfaced: number;
    resonated: number;
    byType: Record<GrowthType, number>;
  } {
    const byType = {} as Record<GrowthType, number>;
    let surfaced = 0;
    let resonated = 0;

    for (const insight of this.insights) {
      byType[insight.type] = (byType[insight.type] || 0) + 1;
      if (insight.surfaced) surfaced++;
      if (insight.userReaction === 'resonated') resonated++;
    }

    return {
      totalInsights: this.insights.length,
      surfaced,
      resonated,
      byType,
    };
  }

  /**
   * Reset for new session (keep historical data)
   */
  reset(): void {
    // Don't reset snapshots or insights - they're longitudinal
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const engines = new Map<string, GrowthVisibilityEngine>();

export function getGrowthVisibilityEngine(userId: string): GrowthVisibilityEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new GrowthVisibilityEngine(userId));
  }
  return engines.get(userId)!;
}

export function resetGrowthVisibilityEngine(userId: string): void {
  engines.get(userId)?.reset();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default GrowthVisibilityEngine;
