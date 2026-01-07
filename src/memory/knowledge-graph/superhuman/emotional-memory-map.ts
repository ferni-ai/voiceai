/**
 * Emotional Memory Map - Track Emotional Associations Over Time
 *
 * Humans forget the emotional context of memories. We don't.
 * This service tracks:
 * - How the user feels about each entity
 * - How those feelings change over time
 * - Emotional triggers and patterns
 * - Emotional trajectories (improving, declining, stable)
 *
 * Example insight: "You feel anxious whenever your boss comes up.
 * This has been getting worse over the last month."
 *
 * @module memory/knowledge-graph/superhuman/emotional-memory-map
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { Entity, Mention } from '../types.js';

const log = createLogger({ module: 'EmotionalMemoryMap' });

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionalAssociation {
  entityId: string;
  entityName: string;
  /** Overall emotional valence (-1 to 1) */
  overallValence: number;
  /** Primary emotions associated */
  primaryEmotions: Array<{ emotion: string; frequency: number; intensity: number }>;
  /** How feelings have changed */
  trajectory: 'improving' | 'declining' | 'stable' | 'volatile';
  /** Recent trend (last 30 days vs before) */
  recentTrend: number; // -1 to 1
  /** Number of emotional mentions */
  dataPoints: number;
  /** When relationship started */
  firstRecorded: Date;
  /** Most recent data */
  lastRecorded: Date;
}

export interface EmotionalTrajectory {
  entityId: string;
  timeline: Array<{
    date: Date;
    emotion: string;
    valence: number;
    intensity: number;
    context?: string;
  }>;
  /** Inflection points (major changes) */
  inflectionPoints: Array<{
    date: Date;
    fromState: string;
    toState: string;
    possibleTrigger?: string;
  }>;
  /** Predicted future trajectory */
  projectedValence?: number;
}

export interface EmotionalTrigger {
  entityId: string;
  triggerType: 'topic' | 'time' | 'context' | 'entity';
  trigger: string;
  resultingEmotion: string;
  confidence: number;
  occurrences: number;
}

// ============================================================================
// EMOTIONAL MEMORY MAP ENGINE
// ============================================================================

export class EmotionalMemoryMap {
  /**
   * Get emotional associations for all entities
   */
  async getEmotionalMap(userId: string): Promise<EmotionalAssociation[]> {
    try {
      const { getAllEntities, getMentionsForEntity } = await import(
        '../../entity-store/storage.js'
      );

      const entities = await getAllEntities(userId, { limit: 100 });
      const associations: EmotionalAssociation[] = [];

      for (const entity of entities) {
        const mentions = await getMentionsForEntity(userId, entity.id, 50);

        if (mentions.length === 0) continue;

        const association = this.calculateAssociation(entity, mentions);
        if (association) {
          associations.push(association);
        }
      }

      // Sort by data points (most data = most reliable)
      return associations.sort((a, b) => b.dataPoints - a.dataPoints);
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get emotional map');
      return [];
    }
  }

  /**
   * Get emotional association for a specific entity
   */
  async getEntityEmotionalProfile(
    userId: string,
    entityId: string
  ): Promise<EmotionalAssociation | null> {
    try {
      const { getEntity, getMentionsForEntity } = await import(
        '../../entity-store/storage.js'
      );

      const entity = await getEntity(userId, entityId);
      if (!entity) return null;

      const mentions = await getMentionsForEntity(userId, entityId, 100);
      return this.calculateAssociation(entity, mentions);
    } catch (error) {
      log.error({ error: String(error), userId, entityId }, 'Failed to get entity emotional profile');
      return null;
    }
  }

  /**
   * Get emotional trajectory over time
   */
  async getEmotionalTrajectory(
    userId: string,
    entityId: string
  ): Promise<EmotionalTrajectory | null> {
    try {
      const { getMentionsForEntity } = await import('../../entity-store/storage.js');

      const mentions = await getMentionsForEntity(userId, entityId, 100);

      if (mentions.length < 3) {
        return null; // Need minimum data for trajectory
      }

      // Sort by date
      const sorted = mentions
        .filter((m) => m.emotion || m.emotionalIntensity)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Build timeline
      const timeline = sorted.map((m) => ({
        date: new Date(m.timestamp),
        emotion: m.emotion || 'neutral',
        valence: this.emotionToValence(m.emotion || 'neutral'),
        intensity: m.emotionalIntensity || 0.5,
        context: m.transcript?.slice(0, 100),
      }));

      // Find inflection points (significant changes)
      const inflectionPoints = this.findInflectionPoints(timeline);

      // Project future trajectory
      const projectedValence = this.projectTrajectory(timeline);

      return {
        entityId,
        timeline,
        inflectionPoints,
        projectedValence,
      };
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get emotional trajectory');
      return null;
    }
  }

  /**
   * Detect emotional triggers for an entity
   */
  async detectEmotionalTriggers(
    userId: string,
    entityId: string
  ): Promise<EmotionalTrigger[]> {
    const triggers: EmotionalTrigger[] = [];

    try {
      const { getMentionsForEntity } = await import('../../entity-store/storage.js');

      const mentions = await getMentionsForEntity(userId, entityId, 100);

      // Analyze topics that correlate with emotions
      const topicEmotions: Record<string, string[]> = {};

      for (const mention of mentions) {
        if (!mention.emotion) continue;

        for (const topic of mention.topics || []) {
          if (!topicEmotions[topic]) {
            topicEmotions[topic] = [];
          }
          topicEmotions[topic].push(mention.emotion);
        }
      }

      // Find significant correlations
      for (const [topic, emotions] of Object.entries(topicEmotions)) {
        if (emotions.length < 3) continue;

        // Find dominant emotion
        const emotionCounts: Record<string, number> = {};
        for (const emotion of emotions) {
          emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        }

        const dominant = Object.entries(emotionCounts)
          .sort((a, b) => b[1] - a[1])[0];

        if (dominant && dominant[1] / emotions.length >= 0.6) {
          triggers.push({
            entityId,
            triggerType: 'topic',
            trigger: topic,
            resultingEmotion: dominant[0],
            confidence: dominant[1] / emotions.length,
            occurrences: emotions.length,
          });
        }
      }

      // Analyze time patterns
      const timeEmotions: Record<string, string[]> = {
        morning: [],
        afternoon: [],
        evening: [],
        night: [],
      };

      for (const mention of mentions) {
        if (!mention.emotion) continue;

        const hour = new Date(mention.timestamp).getHours();
        let timeOfDay: string;
        if (hour >= 5 && hour < 12) timeOfDay = 'morning';
        else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
        else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
        else timeOfDay = 'night';

        timeEmotions[timeOfDay].push(mention.emotion);
      }

      for (const [time, emotions] of Object.entries(timeEmotions)) {
        if (emotions.length < 3) continue;

        const emotionCounts: Record<string, number> = {};
        for (const emotion of emotions) {
          emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        }

        const dominant = Object.entries(emotionCounts)
          .sort((a, b) => b[1] - a[1])[0];

        if (dominant && dominant[1] / emotions.length >= 0.6) {
          triggers.push({
            entityId,
            triggerType: 'time',
            trigger: time,
            resultingEmotion: dominant[0],
            confidence: dominant[1] / emotions.length,
            occurrences: emotions.length,
          });
        }
      }

      return triggers.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to detect emotional triggers');
      return [];
    }
  }

  /**
   * Generate emotional insight summary
   */
  async generateEmotionalInsight(
    userId: string,
    entityId: string
  ): Promise<string | null> {
    const association = await this.getEntityEmotionalProfile(userId, entityId);
    if (!association) return null;

    const triggers = await this.detectEmotionalTriggers(userId, entityId);

    const parts: string[] = [];

    // Overall feeling
    if (association.overallValence > 0.3) {
      parts.push(`You generally feel positive about ${association.entityName}.`);
    } else if (association.overallValence < -0.3) {
      parts.push(`Conversations about ${association.entityName} often bring difficult emotions.`);
    } else {
      parts.push(`Your feelings about ${association.entityName} are mixed.`);
    }

    // Trajectory
    if (association.trajectory === 'improving') {
      parts.push(`Things seem to be getting better - your recent mentions are more positive.`);
    } else if (association.trajectory === 'declining') {
      parts.push(`I've noticed your feelings becoming more negative recently.`);
    } else if (association.trajectory === 'volatile') {
      parts.push(`Your feelings seem to fluctuate a lot.`);
    }

    // Top emotions
    if (association.primaryEmotions.length > 0) {
      const top = association.primaryEmotions.slice(0, 2).map((e) => e.emotion);
      parts.push(`The emotions that come up most: ${top.join(', ')}.`);
    }

    // Triggers
    if (triggers.length > 0) {
      const topTrigger = triggers[0];
      parts.push(
        `I notice you often feel ${topTrigger.resultingEmotion} when ` +
        `${topTrigger.triggerType === 'time' ? `discussing this in the ${topTrigger.trigger}` : 
           `the topic of ${topTrigger.trigger} comes up`}.`
      );
    }

    return parts.join(' ');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private calculateAssociation(
    entity: Entity,
    mentions: Mention[]
  ): EmotionalAssociation | null {
    const emotionalMentions = mentions.filter((m) => m.emotion || m.emotionalIntensity);

    if (emotionalMentions.length === 0) return null;

    // Calculate overall valence
    const valences = emotionalMentions.map((m) => 
      this.emotionToValence(m.emotion || 'neutral') * (m.emotionalIntensity || 0.5)
    );
    const overallValence = valences.reduce((a, b) => a + b, 0) / valences.length;

    // Count emotions
    const emotionCounts: Record<string, { count: number; totalIntensity: number }> = {};
    for (const mention of emotionalMentions) {
      const emotion = mention.emotion || 'neutral';
      if (!emotionCounts[emotion]) {
        emotionCounts[emotion] = { count: 0, totalIntensity: 0 };
      }
      emotionCounts[emotion].count++;
      emotionCounts[emotion].totalIntensity += mention.emotionalIntensity || 0.5;
    }

    const primaryEmotions = Object.entries(emotionCounts)
      .map(([emotion, data]) => ({
        emotion,
        frequency: data.count / emotionalMentions.length,
        intensity: data.totalIntensity / data.count,
      }))
      .sort((a, b) => b.frequency - a.frequency);

    // Calculate trajectory
    const sortedByDate = emotionalMentions.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentMentions = sortedByDate.filter(
      (m) => new Date(m.timestamp).getTime() > thirtyDaysAgo
    );
    const olderMentions = sortedByDate.filter(
      (m) => new Date(m.timestamp).getTime() <= thirtyDaysAgo
    );

    let recentTrend = 0;
    let trajectory: EmotionalAssociation['trajectory'] = 'stable';

    if (recentMentions.length >= 2 && olderMentions.length >= 2) {
      const recentAvg = recentMentions
        .map((m) => this.emotionToValence(m.emotion || 'neutral'))
        .reduce((a, b) => a + b, 0) / recentMentions.length;

      const olderAvg = olderMentions
        .map((m) => this.emotionToValence(m.emotion || 'neutral'))
        .reduce((a, b) => a + b, 0) / olderMentions.length;

      recentTrend = recentAvg - olderAvg;

      if (recentTrend > 0.2) trajectory = 'improving';
      else if (recentTrend < -0.2) trajectory = 'declining';
      else {
        // Check volatility
        const variance = this.calculateVariance(valences);
        if (variance > 0.3) trajectory = 'volatile';
      }
    }

    return {
      entityId: entity.id,
      entityName: entity.canonicalName,
      overallValence,
      primaryEmotions,
      trajectory,
      recentTrend,
      dataPoints: emotionalMentions.length,
      firstRecorded: new Date(sortedByDate[0].timestamp),
      lastRecorded: new Date(sortedByDate[sortedByDate.length - 1].timestamp),
    };
  }

  private emotionToValence(emotion: string): number {
    const valenceMap: Record<string, number> = {
      // Positive
      happy: 0.8,
      joy: 0.9,
      excited: 0.7,
      grateful: 0.8,
      hopeful: 0.6,
      proud: 0.7,
      content: 0.5,
      peaceful: 0.6,
      loving: 0.9,
      amused: 0.5,

      // Negative
      sad: -0.7,
      angry: -0.6,
      anxious: -0.5,
      stressed: -0.4,
      frustrated: -0.5,
      worried: -0.4,
      scared: -0.6,
      hurt: -0.7,
      disappointed: -0.5,
      lonely: -0.6,
      jealous: -0.4,
      guilty: -0.5,
      ashamed: -0.6,

      // Neutral
      neutral: 0,
      curious: 0.2,
      confused: -0.1,
      surprised: 0.1,
    };

    return valenceMap[emotion.toLowerCase()] ?? 0;
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  private findInflectionPoints(
    timeline: EmotionalTrajectory['timeline']
  ): EmotionalTrajectory['inflectionPoints'] {
    const inflectionPoints: EmotionalTrajectory['inflectionPoints'] = [];

    if (timeline.length < 3) return inflectionPoints;

    // Window size for trend detection
    const windowSize = Math.min(5, Math.floor(timeline.length / 3));

    for (let i = windowSize; i < timeline.length - windowSize; i++) {
      const beforeWindow = timeline.slice(i - windowSize, i);
      const afterWindow = timeline.slice(i, i + windowSize);

      const beforeAvg = beforeWindow.reduce((a, b) => a + b.valence, 0) / beforeWindow.length;
      const afterAvg = afterWindow.reduce((a, b) => a + b.valence, 0) / afterWindow.length;

      const change = afterAvg - beforeAvg;

      if (Math.abs(change) > 0.3) {
        inflectionPoints.push({
          date: timeline[i].date,
          fromState: this.valenceToState(beforeAvg),
          toState: this.valenceToState(afterAvg),
          possibleTrigger: timeline[i].context,
        });
      }
    }

    return inflectionPoints;
  }

  private valenceToState(valence: number): string {
    if (valence > 0.5) return 'very positive';
    if (valence > 0.2) return 'positive';
    if (valence > -0.2) return 'neutral';
    if (valence > -0.5) return 'negative';
    return 'very negative';
  }

  private projectTrajectory(timeline: EmotionalTrajectory['timeline']): number {
    if (timeline.length < 5) return timeline[timeline.length - 1]?.valence ?? 0;

    // Simple linear regression on recent data
    const recent = timeline.slice(-10);
    const n = recent.length;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i].valence;
      sumXY += i * recent[i].valence;
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Project 5 points into the future
    const projected = slope * (n + 5) + intercept;

    // Clamp to valid range
    return Math.max(-1, Math.min(1, projected));
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let emotionalMemoryMap: EmotionalMemoryMap | null = null;

export function getEmotionalMemoryMap(): EmotionalMemoryMap {
  if (!emotionalMemoryMap) {
    emotionalMemoryMap = new EmotionalMemoryMap();
  }
  return emotionalMemoryMap;
}

export default EmotionalMemoryMap;
