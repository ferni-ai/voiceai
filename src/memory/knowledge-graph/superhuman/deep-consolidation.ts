/**
 * Deep Consolidation - Find Patterns Humans Would Miss
 *
 * Batch process the entire knowledge graph to find:
 * - Hidden connections between entities
 * - Long-term patterns spanning months
 * - Correlations between seemingly unrelated topics
 * - Behavioral cycles (weekly, monthly, seasonal)
 * - Causation chains (X always leads to Y)
 *
 * This is superhuman because no human friend could:
 * - Remember every detail across months
 * - Cross-reference all conversations
 * - Detect subtle patterns
 * - Connect dots across distant topics
 *
 * @module memory/knowledge-graph/superhuman/deep-consolidation
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { Entity, Mention, Insight, Thread } from '../types.js';
import type { EntityRelationship } from '../../entity-store/types.js';

const log = createLogger({ module: 'DeepConsolidation' });

// ============================================================================
// TYPES
// ============================================================================

export interface DeepPattern {
  id: string;
  userId: string;
  /** Type of pattern discovered */
  type: PatternType;
  /** Natural language description */
  description: string;
  /** How confident we are (0-1) */
  confidence: number;
  /** Statistical evidence */
  evidence: {
    occurrences: number;
    timespan: number; // days
    dataPoints: number;
  };
  /** Entities involved */
  involvedEntities: string[];
  /** Topics involved */
  involvedTopics: string[];
  /** When pattern was detected */
  detectedAt: Date;
  /** Is this actionable? */
  actionable: boolean;
  /** Suggested action if actionable */
  suggestedAction?: string;
}

export interface ConsolidationInsight {
  id: string;
  userId: string;
  /** Category of insight */
  category: InsightCategory;
  /** Human-readable insight */
  insight: string;
  /** Supporting evidence */
  supportingPatterns: string[];
  /** Related entities */
  entities: string[];
  /** How valuable is this (0-1) */
  value: number;
  /** Should we proactively surface this? */
  shouldSurface: boolean;
  /** When to surface (if applicable) */
  surfaceContext?: string;
  /** Generated at */
  generatedAt: Date;
}

export type PatternType =
  | 'temporal_cycle' // Things that repeat (weekly stress, monthly anxiety)
  | 'causal_chain' // A leads to B leads to C
  | 'hidden_connection' // Two entities are more connected than user realizes
  | 'emotional_trigger' // X consistently triggers emotion Y
  | 'behavioral_pattern' // Repeated behavior sequences
  | 'avoidance_pattern' // Things user avoids talking about
  | 'growth_plateau' // Stopped growing in an area
  | 'relationship_dynamic' // Recurring pattern with a person
  | 'topic_cluster' // Topics that always come up together
  | 'seasonal_effect'; // Things that change with seasons

export type InsightCategory =
  | 'self_awareness' // Something about themselves
  | 'relationship_insight' // About their relationships
  | 'behavioral_insight' // About their patterns
  | 'emotional_insight' // About their emotions
  | 'growth_insight' // About their development
  | 'connection_insight' // Hidden connections
  | 'predictive_insight'; // Something that might happen

export interface ConsolidationConfig {
  /** Minimum data points needed for pattern detection */
  minDataPoints: number;
  /** Minimum confidence threshold */
  minConfidence: number;
  /** How far back to look (days) */
  lookbackDays: number;
  /** Maximum patterns to return */
  maxPatterns: number;
  /** Include low-confidence patterns? */
  includeExperimental: boolean;
}

const DEFAULT_CONFIG: ConsolidationConfig = {
  minDataPoints: 5,
  minConfidence: 0.6,
  lookbackDays: 180, // 6 months
  maxPatterns: 50,
  includeExperimental: false,
};

// ============================================================================
// DEEP CONSOLIDATION ENGINE
// ============================================================================

export class DeepConsolidation {
  private config: ConsolidationConfig;

  constructor(config: Partial<ConsolidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run full consolidation analysis on user's knowledge graph
   */
  async consolidate(userId: string): Promise<{
    patterns: DeepPattern[];
    insights: ConsolidationInsight[];
    stats: {
      entitiesAnalyzed: number;
      mentionsProcessed: number;
      patternsFound: number;
      insightsGenerated: number;
      processingTimeMs: number;
    };
  }> {
    const startTime = Date.now();
    const patterns: DeepPattern[] = [];
    const insights: ConsolidationInsight[] = [];

    try {
      log.info({ userId }, 'Starting deep consolidation');

      // Load all user data
      const { entities, mentions, threads, relationships } = await this.loadUserData(userId);

      log.debug({
        entities: entities.length,
        mentions: mentions.length,
        threads: threads.length,
        relationships: relationships.length,
      }, 'Data loaded for consolidation');

      // 1. Detect temporal cycles
      const temporalPatterns = this.detectTemporalCycles(userId, mentions);
      patterns.push(...temporalPatterns);

      // 2. Detect causal chains
      const causalPatterns = this.detectCausalChains(userId, mentions, entities);
      patterns.push(...causalPatterns);

      // 3. Find hidden connections
      const connectionPatterns = this.findHiddenConnections(userId, entities, mentions, relationships);
      patterns.push(...connectionPatterns);

      // 4. Detect emotional triggers
      const triggerPatterns = this.detectEmotionalTriggers(userId, mentions);
      patterns.push(...triggerPatterns);

      // 5. Find topic clusters
      const clusterPatterns = this.findTopicClusters(userId, threads, mentions);
      patterns.push(...clusterPatterns);

      // 6. Detect avoidance patterns
      const avoidancePatterns = this.detectAvoidancePatterns(userId, entities, mentions);
      patterns.push(...avoidancePatterns);

      // 7. Detect relationship dynamics
      const dynamicPatterns = this.detectRelationshipDynamics(userId, entities, mentions);
      patterns.push(...dynamicPatterns);

      // Filter by confidence
      const filteredPatterns = patterns.filter(
        (p) => p.confidence >= this.config.minConfidence || this.config.includeExperimental
      );

      // Generate insights from patterns
      for (const pattern of filteredPatterns.slice(0, this.config.maxPatterns)) {
        const insight = this.generateInsightFromPattern(userId, pattern);
        if (insight) {
          insights.push(insight);
        }
      }

      // Add meta-insights (insights about insights)
      const metaInsights = this.generateMetaInsights(userId, filteredPatterns);
      insights.push(...metaInsights);

      const processingTimeMs = Date.now() - startTime;

      log.info({
        userId,
        patternsFound: filteredPatterns.length,
        insightsGenerated: insights.length,
        processingTimeMs,
      }, 'Deep consolidation complete');

      return {
        patterns: filteredPatterns.slice(0, this.config.maxPatterns),
        insights,
        stats: {
          entitiesAnalyzed: entities.length,
          mentionsProcessed: mentions.length,
          patternsFound: filteredPatterns.length,
          insightsGenerated: insights.length,
          processingTimeMs,
        },
      };
    } catch (error) {
      log.error({ error: String(error), userId }, 'Deep consolidation failed');
      return {
        patterns: [],
        insights: [],
        stats: {
          entitiesAnalyzed: 0,
          mentionsProcessed: 0,
          patternsFound: 0,
          insightsGenerated: 0,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Get quick patterns without full consolidation
   */
  async getQuickPatterns(userId: string, limit: number = 5): Promise<DeepPattern[]> {
    try {
      const { entities, mentions } = await this.loadUserData(userId);

      // Just detect the most obvious patterns quickly
      const patterns: DeepPattern[] = [];

      // Quick temporal patterns
      const temporal = this.detectTemporalCycles(userId, mentions.slice(-500));
      patterns.push(...temporal.slice(0, 2));

      // Quick emotional triggers
      const triggers = this.detectEmotionalTriggers(userId, mentions.slice(-500));
      patterns.push(...triggers.slice(0, 2));

      // Quick hidden connections
      const connections = this.findHiddenConnections(userId, entities.slice(0, 20), mentions.slice(-500), []);
      patterns.push(...connections.slice(0, 1));

      return patterns
        .filter((p) => p.confidence >= 0.5)
        .slice(0, limit);
    } catch (error) {
      log.debug({ error: String(error) }, 'Quick pattern detection failed');
      return [];
    }
  }

  // ============================================================================
  // PATTERN DETECTION METHODS
  // ============================================================================

  private detectTemporalCycles(userId: string, mentions: Mention[]): DeepPattern[] {
    const patterns: DeepPattern[] = [];

    // Group mentions by day of week
    const byDayOfWeek: Map<number, Mention[]> = new Map();
    for (const mention of mentions) {
      const day = new Date(mention.timestamp).getDay();
      if (!byDayOfWeek.has(day)) byDayOfWeek.set(day, []);
      byDayOfWeek.get(day)!.push(mention);
    }

    // Check for emotional patterns by day
    for (const [day, dayMentions] of byDayOfWeek) {
      if (dayMentions.length < this.config.minDataPoints) continue;

      const avgEmotionIntensity = this.averageEmotionIntensity(dayMentions);
      const negativeRatio = dayMentions.filter((m) => this.isNegativeEmotion(m.emotion)).length / dayMentions.length;

      if (negativeRatio > 0.6 && avgEmotionIntensity > 0.5) {
        const dayName = this.getDayName(day);
        patterns.push({
          id: `temporal-${userId}-day-${day}`,
          userId,
          type: 'temporal_cycle',
          description: `${dayName}s tend to be emotionally challenging. I notice more difficult conversations on ${dayName}s.`,
          confidence: Math.min(0.9, negativeRatio * (dayMentions.length / 20)),
          evidence: {
            occurrences: dayMentions.length,
            timespan: this.getTimespanDays(dayMentions),
            dataPoints: dayMentions.length,
          },
          involvedEntities: [],
          involvedTopics: this.extractTopics(dayMentions),
          detectedAt: new Date(),
          actionable: true,
          suggestedAction: `Consider what makes ${dayName}s harder. Is there something about the schedule, work patterns, or routines?`,
        });
      }
    }

    // Group by hour of day
    const byHour: Map<number, Mention[]> = new Map();
    for (const mention of mentions) {
      const hour = new Date(mention.timestamp).getHours();
      const hourBucket = Math.floor(hour / 3); // 8 buckets of 3 hours
      if (!byHour.has(hourBucket)) byHour.set(hourBucket, []);
      byHour.get(hourBucket)!.push(mention);
    }

    // Late night pattern (10pm - 2am)
    const lateNight = byHour.get(7) || [];
    const earlyMorning = byHour.get(0) || [];
    const allLateNight = [...lateNight, ...earlyMorning];

    if (allLateNight.length >= this.config.minDataPoints) {
      const negativeRatio = allLateNight.filter((m) => this.isNegativeEmotion(m.emotion)).length / allLateNight.length;

      if (negativeRatio > 0.5) {
        patterns.push({
          id: `temporal-${userId}-late-night`,
          userId,
          type: 'temporal_cycle',
          description: 'Late nights often bring heavier thoughts. The quiet hours seem to surface difficult feelings.',
          confidence: Math.min(0.85, negativeRatio * 1.2),
          evidence: {
            occurrences: allLateNight.length,
            timespan: this.getTimespanDays(allLateNight),
            dataPoints: allLateNight.length,
          },
          involvedEntities: [],
          involvedTopics: this.extractTopics(allLateNight),
          detectedAt: new Date(),
          actionable: true,
          suggestedAction: "Late night thoughts are valid. Consider writing them down or talking through them before they spiral.",
        });
      }
    }

    return patterns;
  }

  private detectCausalChains(userId: string, mentions: Mention[], entities: Entity[]): DeepPattern[] {
    const patterns: DeepPattern[] = [];

    // Look for entity A mention → entity B mention within 48 hours
    const sortedMentions = [...mentions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Build co-occurrence matrix
    const coOccurrence: Map<string, Map<string, number>> = new Map();

    for (let i = 0; i < sortedMentions.length; i++) {
      const mention = sortedMentions[i];
      if (!mention.entityId) continue;

      // Look at mentions in the next 48 hours
      for (let j = i + 1; j < sortedMentions.length; j++) {
        const nextMention = sortedMentions[j];
        const hoursDiff =
          (new Date(nextMention.timestamp).getTime() - new Date(mention.timestamp).getTime()) /
          (1000 * 60 * 60);

        if (hoursDiff > 48) break;
        if (!nextMention.entityId || nextMention.entityId === mention.entityId) continue;

        const key = mention.entityId;
        const followedBy = nextMention.entityId;

        if (!coOccurrence.has(key)) coOccurrence.set(key, new Map());
        const current = coOccurrence.get(key)!.get(followedBy) || 0;
        coOccurrence.get(key)!.set(followedBy, current + 1);
      }
    }

    // Find significant causal chains
    for (const [entityA, followers] of coOccurrence) {
      for (const [entityB, count] of followers) {
        if (count < this.config.minDataPoints) continue;

        const entityAData = entities.find((e) => e.id === entityA);
        const entityBData = entities.find((e) => e.id === entityB);

        if (!entityAData || !entityBData) continue;

        const confidence = Math.min(0.85, count / 15);

        patterns.push({
          id: `causal-${userId}-${entityA}-${entityB}`,
          userId,
          type: 'causal_chain',
          description: `Talking about ${entityAData.canonicalName} often leads to talking about ${entityBData.canonicalName}. There's a connection there.`,
          confidence,
          evidence: {
            occurrences: count,
            timespan: this.getTimespanDays(sortedMentions),
            dataPoints: count,
          },
          involvedEntities: [entityA, entityB],
          involvedTopics: [],
          detectedAt: new Date(),
          actionable: false,
        });
      }
    }

    return patterns;
  }

  private findHiddenConnections(
    userId: string,
    entities: Entity[],
    mentions: Mention[],
    relationships: EntityRelationship[]
  ): DeepPattern[] {
    const patterns: DeepPattern[] = [];

    // Build entity co-mention matrix
    const sessionMentions: Map<string, Set<string>> = new Map();

    for (const mention of mentions) {
      if (!mention.entityId) continue;

      // Use day as session proxy
      const sessionKey = new Date(mention.timestamp).toISOString().split('T')[0];

      if (!sessionMentions.has(sessionKey)) sessionMentions.set(sessionKey, new Set());
      sessionMentions.get(sessionKey)!.add(mention.entityId);
    }

    // Find entities that appear together but aren't explicitly related
    const coAppearance: Map<string, Map<string, number>> = new Map();

    for (const entityIds of sessionMentions.values()) {
      const entityList = Array.from(entityIds);

      for (let i = 0; i < entityList.length; i++) {
        for (let j = i + 1; j < entityList.length; j++) {
          const key = [entityList[i], entityList[j]].sort().join('|');
          const current = coAppearance.get(key) || new Map();
          current.set(key, (current.get(key) || 0) + 1);
          coAppearance.set(key, current);
        }
      }
    }

    // Check for hidden connections (appear together but no explicit relationship)
    const explicitRelationships = new Set(
      relationships.map((r) => [r.fromEntity, r.toEntity].sort().join('|'))
    );

    for (const [pair, countMap] of coAppearance) {
      const count = countMap.get(pair) || 0;
      if (count < 3) continue;
      if (explicitRelationships.has(pair)) continue;

      const [entityA, entityB] = pair.split('|');
      const entityAData = entities.find((e) => e.id === entityA);
      const entityBData = entities.find((e) => e.id === entityB);

      if (!entityAData || !entityBData) continue;

      patterns.push({
        id: `hidden-${userId}-${pair}`,
        userId,
        type: 'hidden_connection',
        description: `${entityAData.canonicalName} and ${entityBData.canonicalName} come up together a lot. There might be a connection you haven't explicitly named.`,
        confidence: Math.min(0.75, count / 10),
        evidence: {
          occurrences: count,
          timespan: this.config.lookbackDays,
          dataPoints: count,
        },
        involvedEntities: [entityA, entityB],
        involvedTopics: [],
        detectedAt: new Date(),
        actionable: true,
        suggestedAction: `What connects ${entityAData.canonicalName} and ${entityBData.canonicalName} in your mind?`,
      });
    }

    return patterns;
  }

  private detectEmotionalTriggers(userId: string, mentions: Mention[]): DeepPattern[] {
    const patterns: DeepPattern[] = [];

    // Group by entity and track emotional valence
    const entityEmotions: Map<string, { positive: number; negative: number; total: number }> = new Map();

    for (const mention of mentions) {
      if (!mention.entityId) continue;

      if (!entityEmotions.has(mention.entityId)) {
        entityEmotions.set(mention.entityId, { positive: 0, negative: 0, total: 0 });
      }

      const stats = entityEmotions.get(mention.entityId)!;
      stats.total++;

      if (this.isNegativeEmotion(mention.emotion)) {
        stats.negative++;
      } else if (this.isPositiveEmotion(mention.emotion)) {
        stats.positive++;
      }
    }

    // Find consistent emotional triggers
    for (const [entityId, stats] of entityEmotions) {
      if (stats.total < this.config.minDataPoints) continue;

      const negativeRatio = stats.negative / stats.total;
      const positiveRatio = stats.positive / stats.total;

      if (negativeRatio > 0.7) {
        patterns.push({
          id: `trigger-neg-${userId}-${entityId}`,
          userId,
          type: 'emotional_trigger',
          description: 'This topic or person consistently surfaces difficult emotions.',
          confidence: Math.min(0.9, negativeRatio * (stats.total / 15)),
          evidence: {
            occurrences: stats.negative,
            timespan: this.config.lookbackDays,
            dataPoints: stats.total,
          },
          involvedEntities: [entityId],
          involvedTopics: [],
          detectedAt: new Date(),
          actionable: true,
          suggestedAction: "Let's explore what makes this so emotionally charged. There might be something worth processing.",
        });
      } else if (positiveRatio > 0.7) {
        patterns.push({
          id: `trigger-pos-${userId}-${entityId}`,
          userId,
          type: 'emotional_trigger',
          description: 'This topic or person consistently brings positive feelings.',
          confidence: Math.min(0.85, positiveRatio * (stats.total / 15)),
          evidence: {
            occurrences: stats.positive,
            timespan: this.config.lookbackDays,
            dataPoints: stats.total,
          },
          involvedEntities: [entityId],
          involvedTopics: [],
          detectedAt: new Date(),
          actionable: false,
        });
      }
    }

    return patterns;
  }

  private findTopicClusters(userId: string, threads: Thread[], mentions: Mention[]): DeepPattern[] {
    const patterns: DeepPattern[] = [];

    // Group threads that often appear in the same session
    const sessionThreads: Map<string, Set<string>> = new Map();

    for (const thread of threads) {
      for (const session of thread.sessions) {
        if (!session.date) continue;
        const sessionKey = new Date(session.date).toISOString().split('T')[0];
        if (!sessionThreads.has(sessionKey)) sessionThreads.set(sessionKey, new Set());
        sessionThreads.get(sessionKey)!.add(thread.topic);
      }
    }

    // Count topic co-occurrences
    const topicPairs: Map<string, number> = new Map();

    for (const topics of sessionThreads.values()) {
      const topicList = Array.from(topics);

      for (let i = 0; i < topicList.length; i++) {
        for (let j = i + 1; j < topicList.length; j++) {
          const key = [topicList[i], topicList[j]].sort().join('|');
          topicPairs.set(key, (topicPairs.get(key) || 0) + 1);
        }
      }
    }

    // Find significant clusters
    for (const [pair, count] of topicPairs) {
      if (count < 3) continue;

      const [topicA, topicB] = pair.split('|');

      patterns.push({
        id: `cluster-${userId}-${pair.replace('|', '-')}`,
        userId,
        type: 'topic_cluster',
        description: `"${topicA}" and "${topicB}" tend to come up together. They might be more connected than they seem.`,
        confidence: Math.min(0.8, count / 8),
        evidence: {
          occurrences: count,
          timespan: this.config.lookbackDays,
          dataPoints: count,
        },
        involvedEntities: [],
        involvedTopics: [topicA, topicB],
        detectedAt: new Date(),
        actionable: false,
      });
    }

    return patterns;
  }

  private detectAvoidancePatterns(userId: string, entities: Entity[], mentions: Mention[]): DeepPattern[] {
    const patterns: DeepPattern[] = [];

    // Find entities mentioned once or twice long ago, never again
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const entity of entities) {
      if (!entity.lastMentionedAt || !entity.firstMentionedAt) continue;

      const lastMention = new Date(entity.lastMentionedAt).getTime();
      const firstMention = new Date(entity.firstMentionedAt).getTime();
      const daysSinceMention = (now - lastMention) / (24 * 60 * 60 * 1000);
      const totalSpan = (lastMention - firstMention) / (24 * 60 * 60 * 1000);

      // Mentioned 1-3 times, not mentioned in 60+ days, but initially talked about
      if (
        (entity.mentionCount || 0) <= 3 &&
        (entity.mentionCount || 0) >= 1 &&
        daysSinceMention > 60 &&
        totalSpan < 7 // All mentions were within a week
      ) {
        // Check if the mentions were emotionally charged
        const entityMentions = mentions.filter((m) => m.entityId === entity.id);
        const avgIntensity = this.averageEmotionIntensity(entityMentions);

        if (avgIntensity > 0.5) {
          patterns.push({
            id: `avoidance-${userId}-${entity.id}`,
            userId,
            type: 'avoidance_pattern',
            description: `You mentioned ${entity.canonicalName} once or twice with strong emotion, then never again. Some things are easier not to revisit.`,
            confidence: Math.min(0.7, avgIntensity),
            evidence: {
              occurrences: entity.mentionCount || 1,
              timespan: Math.round(daysSinceMention),
              dataPoints: entity.mentionCount || 1,
            },
            involvedEntities: [entity.id],
            involvedTopics: [],
            detectedAt: new Date(),
            actionable: true,
            suggestedAction: `If you ever want to talk about ${entity.canonicalName} again, I'm here. No pressure.`,
          });
        }
      }
    }

    return patterns;
  }

  private detectRelationshipDynamics(userId: string, entities: Entity[], mentions: Mention[]): DeepPattern[] {
    const patterns: DeepPattern[] = [];

    // Focus on person entities
    const people = entities.filter((e) => e.type === 'person');

    for (const person of people) {
      if ((person.mentionCount || 0) < this.config.minDataPoints) continue;

      const personMentions = mentions.filter((m) => m.entityId === person.id);

      if (personMentions.length < this.config.minDataPoints) continue;

      // Analyze emotional pattern in mentions
      const emotionTrend = this.analyzeEmotionTrend(personMentions);

      if (emotionTrend.volatility > 0.5) {
        patterns.push({
          id: `dynamic-${userId}-${person.id}-volatile`,
          userId,
          type: 'relationship_dynamic',
          description: `Your conversations about ${person.canonicalName} show high emotional variance. The relationship seems complex or uncertain.`,
          confidence: Math.min(0.8, emotionTrend.volatility),
          evidence: {
            occurrences: personMentions.length,
            timespan: this.getTimespanDays(personMentions),
            dataPoints: personMentions.length,
          },
          involvedEntities: [person.id],
          involvedTopics: [],
          detectedAt: new Date(),
          actionable: true,
          suggestedAction: `What's the core of the complexity with ${person.canonicalName}?`,
        });
      }

      if (emotionTrend.trend < -0.3 && personMentions.length >= 10) {
        patterns.push({
          id: `dynamic-${userId}-${person.id}-declining`,
          userId,
          type: 'relationship_dynamic',
          description: `Mentions of ${person.canonicalName} have become more negative over time. Something may have shifted.`,
          confidence: Math.min(0.75, Math.abs(emotionTrend.trend)),
          evidence: {
            occurrences: personMentions.length,
            timespan: this.getTimespanDays(personMentions),
            dataPoints: personMentions.length,
          },
          involvedEntities: [person.id],
          involvedTopics: [],
          detectedAt: new Date(),
          actionable: true,
          suggestedAction: `Is there something going on with ${person.canonicalName} that you want to process?`,
        });
      }
    }

    return patterns;
  }

  // ============================================================================
  // INSIGHT GENERATION
  // ============================================================================

  private generateInsightFromPattern(userId: string, pattern: DeepPattern): ConsolidationInsight | null {
    const categoryMap: Record<PatternType, InsightCategory> = {
      temporal_cycle: 'behavioral_insight',
      causal_chain: 'connection_insight',
      hidden_connection: 'connection_insight',
      emotional_trigger: 'emotional_insight',
      behavioral_pattern: 'behavioral_insight',
      avoidance_pattern: 'self_awareness',
      growth_plateau: 'growth_insight',
      relationship_dynamic: 'relationship_insight',
      topic_cluster: 'connection_insight',
      seasonal_effect: 'behavioral_insight',
    };

    return {
      id: `insight-from-${pattern.id}`,
      userId,
      category: categoryMap[pattern.type],
      insight: pattern.description,
      supportingPatterns: [pattern.id],
      entities: pattern.involvedEntities,
      value: pattern.confidence,
      shouldSurface: pattern.actionable,
      surfaceContext: pattern.actionable
        ? 'When discussing related topics or during reflection moments'
        : undefined,
      generatedAt: new Date(),
    };
  }

  private generateMetaInsights(userId: string, patterns: DeepPattern[]): ConsolidationInsight[] {
    const insights: ConsolidationInsight[] = [];

    // Count pattern types
    const typeCounts: Partial<Record<PatternType, number>> = {};
    for (const pattern of patterns) {
      typeCounts[pattern.type] = (typeCounts[pattern.type] || 0) + 1;
    }

    // Insight about emotional triggers if many
    if ((typeCounts.emotional_trigger || 0) > 3) {
      insights.push({
        id: `meta-${userId}-many-triggers`,
        userId,
        category: 'self_awareness',
        insight: `I've noticed several emotional triggers in your life. Understanding these can help you navigate them more consciously.`,
        supportingPatterns: patterns.filter((p) => p.type === 'emotional_trigger').map((p) => p.id),
        entities: [],
        value: 0.8,
        shouldSurface: true,
        surfaceContext: 'During reflective conversations',
        generatedAt: new Date(),
      });
    }

    // Insight about many hidden connections
    if ((typeCounts.hidden_connection || 0) > 2) {
      insights.push({
        id: `meta-${userId}-many-connections`,
        userId,
        category: 'connection_insight',
        insight: `Your life has more interconnections than you might realize. People and topics are linked in ways that aren't always obvious.`,
        supportingPatterns: patterns.filter((p) => p.type === 'hidden_connection').map((p) => p.id),
        entities: [],
        value: 0.7,
        shouldSurface: false,
        generatedAt: new Date(),
      });
    }

    // Insight about avoidance patterns
    if ((typeCounts.avoidance_pattern || 0) > 0) {
      insights.push({
        id: `meta-${userId}-avoidance`,
        userId,
        category: 'self_awareness',
        insight: `There are some topics you've mentioned once and never returned to. Sometimes that's healthy; sometimes it means there's unfinished business.`,
        supportingPatterns: patterns.filter((p) => p.type === 'avoidance_pattern').map((p) => p.id),
        entities: [],
        value: 0.75,
        shouldSurface: true,
        surfaceContext: "When user mentions feeling like they're avoiding something",
        generatedAt: new Date(),
      });
    }

    return insights;
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  private async loadUserData(userId: string): Promise<{
    entities: Entity[];
    mentions: Mention[];
    threads: Thread[];
    relationships: EntityRelationship[];
  }> {
    const { getAllEntities, getMentionsForEntity } = await import('../../entity-store/storage.js');
    const { getActiveThreads } = await import('../storage/index.js');

    const entities = await getAllEntities(userId, { limit: 500 });

    // Get mentions for all entities
    const allMentions: Mention[] = [];
    for (const entity of entities) {
      const mentions = await getMentionsForEntity(userId, entity.id, 100);
      allMentions.push(...mentions);
    }

    // Get threads
    const threads = await getActiveThreads(userId, {
      includeOpen: true,
      includeRecurring: true,
      limit: 100,
    });

    // Get relationships
    const { getEntityRelationships } = await import('../../entity-store/storage.js');
    const allRelationships: EntityRelationship[] = [];
    for (const entity of entities.slice(0, 50)) {
      const rels = await getEntityRelationships(userId, entity.id);
      allRelationships.push(...rels);
    }

    // Filter by lookback period
    const cutoff = Date.now() - this.config.lookbackDays * 24 * 60 * 60 * 1000;
    const filteredMentions = allMentions.filter(
      (m) => new Date(m.timestamp).getTime() > cutoff
    );

    return {
      entities,
      mentions: filteredMentions,
      threads,
      relationships: allRelationships,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private isNegativeEmotion(emotion?: string): boolean {
    const negative = ['sad', 'angry', 'anxious', 'stressed', 'frustrated', 'hurt', 'worried', 'overwhelmed'];
    return negative.includes(emotion?.toLowerCase() || '');
  }

  private isPositiveEmotion(emotion?: string): boolean {
    const positive = ['happy', 'excited', 'grateful', 'hopeful', 'calm', 'content', 'proud', 'relieved'];
    return positive.includes(emotion?.toLowerCase() || '');
  }

  private averageEmotionIntensity(mentions: Mention[]): number {
    if (mentions.length === 0) return 0;
    return (
      mentions.reduce((sum, m) => sum + (m.emotionalIntensity || 0.5), 0) / mentions.length
    );
  }

  private getTimespanDays(mentions: Mention[]): number {
    if (mentions.length < 2) return 0;

    const dates = mentions.map((m) => new Date(m.timestamp).getTime());
    const min = Math.min(...dates);
    const max = Math.max(...dates);

    return Math.round((max - min) / (24 * 60 * 60 * 1000));
  }

  private extractTopics(mentions: Mention[]): string[] {
    const topics: Set<string> = new Set();

    for (const mention of mentions) {
      if (mention.context?.topic) {
        topics.add(mention.context.topic);
      }
    }

    return Array.from(topics).slice(0, 5);
  }

  private getDayName(day: number): string {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return names[day];
  }

  private analyzeEmotionTrend(mentions: Mention[]): { trend: number; volatility: number } {
    if (mentions.length < 3) return { trend: 0, volatility: 0 };

    const sorted = [...mentions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const values = sorted.map((m) => {
      if (this.isPositiveEmotion(m.emotion)) return 1;
      if (this.isNegativeEmotion(m.emotion)) return -1;
      return 0;
    });

    // Calculate trend (simple linear regression slope)
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = (values as number[]).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }

    const trend = denominator !== 0 ? numerator / denominator : 0;

    // Calculate volatility (standard deviation)
    const variance = (values as number[]).reduce((sum, v) => sum + (v - yMean) ** 2, 0) / n;
    const volatility = Math.sqrt(variance);

    return { trend, volatility };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let deepConsolidation: DeepConsolidation | null = null;

export function getDeepConsolidation(): DeepConsolidation {
  if (!deepConsolidation) {
    deepConsolidation = new DeepConsolidation();
  }
  return deepConsolidation;
}

export default DeepConsolidation;
