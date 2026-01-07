/**
 * Growth Tracker - Track Evolution Over Time
 *
 * One of the most superhuman things we can do is show someone
 * how they've grown. Humans forget their past selves.
 * We remember and can show the journey.
 *
 * Tracks:
 * - How topics evolve (less anxiety about X over time)
 * - How relationships change
 * - How self-perception shifts
 * - Goal progress
 * - Behavioral changes
 * - Emotional growth
 *
 * @module memory/knowledge-graph/superhuman/growth-tracker
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { Entity, Mention, Thread, Insight } from '../types.js';

const log = createLogger({ module: 'GrowthTracker' });

// ============================================================================
// TYPES
// ============================================================================

export interface GrowthObservation {
  id: string;
  userId: string;
  /** What aspect of growth this tracks */
  type: GrowthType;
  /** Subject of the growth */
  subject: string;
  entityId?: string;
  /** Where they started */
  baseline: {
    state: string;
    date: Date;
    evidence: string;
  };
  /** Where they are now */
  current: {
    state: string;
    date: Date;
    evidence: string;
  };
  /** Direction and magnitude */
  trajectory: {
    direction: 'positive' | 'negative' | 'neutral' | 'mixed';
    magnitude: number; // 0-1, how significant
    velocity: number; // How fast the change
  };
  /** Data points in between */
  milestones: Array<{
    date: Date;
    state: string;
    significance: string;
  }>;
  /** Confidence in this observation */
  confidence: number;
  /** Generated insight text */
  insightText: string;
}

export interface EvolutionTimeline {
  userId: string;
  subject: string;
  entityId?: string;
  events: Array<{
    date: Date;
    type: 'mention' | 'milestone' | 'shift' | 'breakthrough';
    description: string;
    sentiment: number;
    significance: number;
  }>;
  /** Overall arc narrative */
  narrative: string;
}

export type GrowthType =
  | 'emotional_regulation' // Better handling emotions
  | 'relationship_health' // Relationship improvement
  | 'self_awareness' // Understanding self better
  | 'goal_progress' // Moving toward goals
  | 'behavior_change' // Changed habits/behaviors
  | 'mindset_shift' // Changed perspective
  | 'skill_development' // New capabilities
  | 'boundary_setting' // Better boundaries
  | 'communication' // Better communication
  | 'resilience'; // Handling setbacks better

// ============================================================================
// GROWTH TRACKER
// ============================================================================

export class GrowthTracker {
  /**
   * Detect growth across all domains for a user
   */
  async detectGrowth(userId: string): Promise<GrowthObservation[]> {
    const observations: GrowthObservation[] = [];

    try {
      // 1. Track emotional growth per entity
      const emotionalGrowth = await this.trackEmotionalGrowth(userId);
      observations.push(...emotionalGrowth);

      // 2. Track relationship health changes
      const relationshipGrowth = await this.trackRelationshipGrowth(userId);
      observations.push(...relationshipGrowth);

      // 3. Track topic sentiment evolution
      const topicGrowth = await this.trackTopicGrowth(userId);
      observations.push(...topicGrowth);

      // 4. Track self-perception changes
      const selfGrowth = await this.trackSelfPerceptionGrowth(userId);
      observations.push(...selfGrowth);

      return observations.sort((a, b) => b.trajectory.magnitude - a.trajectory.magnitude);
    } catch (error) {
      log.error({ error: String(error), userId }, 'Growth detection failed');
      return [];
    }
  }

  /**
   * Get growth timeline for a specific subject
   */
  async getEvolutionTimeline(
    userId: string,
    subject: string,
    entityId?: string
  ): Promise<EvolutionTimeline | null> {
    try {
      const { getAllEntities, getMentionsForEntity, searchEntities } = await import(
        '../../entity-store/storage.js'
      );

      // Find relevant mentions
      let mentions: Mention[] = [];

      if (entityId) {
        mentions = await getMentionsForEntity(userId, entityId, 100);
      } else {
        // Search for subject across all entities
        const entities = await searchEntities(userId, subject, { limit: 5 });
        for (const entity of entities) {
          const entityMentions = await getMentionsForEntity(userId, entity.id, 30);
          mentions.push(...entityMentions);
        }
      }

      if (mentions.length < 5) {
        return null; // Not enough data
      }

      // Sort by date
      mentions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Build timeline events
      const events: EvolutionTimeline['events'] = [];

      for (const mention of mentions) {
        const sentiment = this.calculateMentionSentiment(mention);
        const significance = this.calculateSignificance(mention);

        events.push({
          date: new Date(mention.timestamp),
          type: significance > 0.7 ? 'milestone' : 'mention',
          description: mention.transcript?.slice(0, 150) || 'Mentioned',
          sentiment,
          significance,
        });
      }

      // Detect shifts (significant sentiment changes)
      const shifts = this.detectShifts(events);
      for (const shift of shifts) {
        events.push({
          ...shift,
          type: 'shift',
        });
      }

      // Generate narrative
      const narrative = this.generateNarrative(subject, events);

      return {
        userId,
        subject,
        entityId,
        events: events.sort((a, b) => a.date.getTime() - b.date.getTime()),
        narrative,
      };
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get evolution timeline');
      return null;
    }
  }

  /**
   * Generate a growth summary for reflection
   */
  async generateGrowthSummary(userId: string): Promise<string> {
    const observations = await this.detectGrowth(userId);

    if (observations.length === 0) {
      return "We're still early in our journey together. As we have more conversations, I'll be able to show you patterns of growth.";
    }

    const parts: string[] = [];

    // Highlight positive growth
    const positive = observations.filter((o) => o.trajectory.direction === 'positive');
    if (positive.length > 0) {
      parts.push("Here's some growth I've noticed:");
      for (const obs of positive.slice(0, 3)) {
        parts.push(`• ${obs.insightText}`);
      }
    }

    // Acknowledge struggles
    const negative = observations.filter((o) => o.trajectory.direction === 'negative');
    if (negative.length > 0 && positive.length > 0) {
      parts.push("\nSome areas where things have been harder:");
      for (const obs of negative.slice(0, 2)) {
        parts.push(`• ${obs.insightText}`);
      }
    }

    // Overall trajectory
    const avgMagnitude =
      observations.reduce((sum, o) => sum + o.trajectory.magnitude, 0) / observations.length;
    const positiveRatio = positive.length / observations.length;

    if (positiveRatio > 0.7) {
      parts.push("\nOverall, you're on a strong growth trajectory. Keep it up!");
    } else if (positiveRatio > 0.4) {
      parts.push("\nLife is a mix of growth and challenges. You're handling it.");
    } else {
      parts.push("\nThings have been tough. But showing up and talking about it? That's growth too.");
    }

    return parts.join('\n');
  }

  // ============================================================================
  // PRIVATE TRACKING METHODS
  // ============================================================================

  private async trackEmotionalGrowth(userId: string): Promise<GrowthObservation[]> {
    const observations: GrowthObservation[] = [];

    try {
      const { getEmotionalMemoryMap } = await import('./emotional-memory-map.js');
      const emotionalMap = getEmotionalMemoryMap();
      const associations = await emotionalMap.getEmotionalMap(userId);

      for (const association of associations) {
        if (association.dataPoints < 5) continue;

        // Check for emotional trajectory
        if (Math.abs(association.recentTrend) > 0.2) {
          observations.push({
            id: `emotional-growth-${association.entityId}`,
            userId,
            type: 'emotional_regulation',
            subject: `feelings about ${association.entityName}`,
            entityId: association.entityId,
            baseline: {
              state: this.describeEmotionalState(association.overallValence - association.recentTrend),
              date: association.firstRecorded,
              evidence: 'Early conversations',
            },
            current: {
              state: this.describeEmotionalState(association.overallValence),
              date: association.lastRecorded,
              evidence: 'Recent conversations',
            },
            trajectory: {
              direction: association.recentTrend > 0 ? 'positive' : 'negative',
              magnitude: Math.abs(association.recentTrend),
              velocity: association.dataPoints > 20 ? 0.5 : 0.3, // More data = more confident velocity
            },
            milestones: [],
            confidence: Math.min(0.9, association.dataPoints / 20),
            insightText: this.generateEmotionalGrowthInsight(association),
          });
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Emotional growth tracking failed');
    }

    return observations;
  }

  private async trackRelationshipGrowth(userId: string): Promise<GrowthObservation[]> {
    const observations: GrowthObservation[] = [];

    try {
      const { getAllEntities, getMentionsForEntity } = await import(
        '../../entity-store/storage.js'
      );

      const entities = await getAllEntities(userId, {
        types: ['person'],
        limit: 30,
      });

      for (const entity of entities) {
        if ((entity.mentionCount || 0) < 5) continue;

        const mentions = await getMentionsForEntity(userId, entity.id, 50);

        if (mentions.length < 5) continue;

        // Calculate sentiment trend
        const sorted = mentions.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
        const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

        const firstAvg = this.averageSentiment(firstHalf);
        const secondAvg = this.averageSentiment(secondHalf);
        const trend = secondAvg - firstAvg;

        if (Math.abs(trend) > 0.15) {
          observations.push({
            id: `relationship-growth-${entity.id}`,
            userId,
            type: 'relationship_health',
            subject: `relationship with ${entity.canonicalName}`,
            entityId: entity.id,
            baseline: {
              state: this.describeRelationshipState(firstAvg),
              date: new Date(sorted[0].timestamp),
              evidence: sorted[0].transcript?.slice(0, 100) || 'Early mention',
            },
            current: {
              state: this.describeRelationshipState(secondAvg),
              date: new Date(sorted[sorted.length - 1].timestamp),
              evidence: sorted[sorted.length - 1].transcript?.slice(0, 100) || 'Recent mention',
            },
            trajectory: {
              direction: trend > 0 ? 'positive' : 'negative',
              magnitude: Math.abs(trend),
              velocity: 0.4,
            },
            milestones: [],
            confidence: Math.min(0.85, mentions.length / 20),
            insightText: this.generateRelationshipGrowthInsight(entity.canonicalName, trend),
          });
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Relationship growth tracking failed');
    }

    return observations;
  }

  private async trackTopicGrowth(userId: string): Promise<GrowthObservation[]> {
    const observations: GrowthObservation[] = [];

    try {
      const { getActiveThreads } = await import('../storage/index.js');

      const threads = await getActiveThreads(userId, {
        includeOpen: true,
        includeRecurring: true,
        limit: 50,
      });

      for (const thread of threads) {
        if (thread.sessions.length < 3) continue;

        // Track emotional arc across sessions
        const sessionEmotions = thread.sessions.map((s) => ({
          date: s.date,
          arc: s.emotionalArc,
        }));

        // Simple trajectory detection
        const firstEmotion = sessionEmotions[0].arc;
        const lastEmotion = sessionEmotions[sessionEmotions.length - 1].arc;

        if (firstEmotion !== lastEmotion) {
          const direction = this.compareEmotionalArcs(firstEmotion, lastEmotion);

          observations.push({
            id: `topic-growth-${thread.id}`,
            userId,
            type: 'mindset_shift',
            subject: `perspective on ${thread.topic}`,
            baseline: {
              state: firstEmotion,
              date: new Date(thread.sessions[0].date),
              evidence: thread.sessions[0].summary.slice(0, 100),
            },
            current: {
              state: lastEmotion,
              date: new Date(thread.sessions[thread.sessions.length - 1].date),
              evidence: thread.sessions[thread.sessions.length - 1].summary.slice(0, 100),
            },
            trajectory: {
              direction,
              magnitude: 0.5,
              velocity: 0.3,
            },
            milestones: [],
            confidence: Math.min(0.8, thread.sessions.length / 10),
            insightText: this.generateTopicGrowthInsight(thread.topic, firstEmotion, lastEmotion),
          });
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Topic growth tracking failed');
    }

    return observations;
  }

  private async trackSelfPerceptionGrowth(userId: string): Promise<GrowthObservation[]> {
    // This would analyze how users talk about themselves
    // Looking for shifts in self-talk patterns
    // E.g., "I'm such a failure" → "I'm learning"
    return [];
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private calculateMentionSentiment(mention: Mention): number {
    const valenceMap: Record<string, number> = {
      happy: 0.8, joy: 0.9, excited: 0.7, grateful: 0.8,
      sad: -0.7, angry: -0.6, anxious: -0.5, stressed: -0.4,
      neutral: 0,
    };
    return valenceMap[mention.emotion || 'neutral'] || 0;
  }

  private calculateSignificance(mention: Mention): number {
    return mention.emotionalIntensity || 0.5;
  }

  private detectShifts(events: EvolutionTimeline['events']): Array<{
    date: Date;
    description: string;
    sentiment: number;
    significance: number;
  }> {
    const shifts: Array<{
      date: Date;
      description: string;
      sentiment: number;
      significance: number;
    }> = [];

    const windowSize = 5;
    for (let i = windowSize; i < events.length; i++) {
      const before = events.slice(i - windowSize, i);
      const after = events.slice(i, Math.min(i + windowSize, events.length));

      const beforeAvg = before.reduce((sum, e) => sum + e.sentiment, 0) / before.length;
      const afterAvg = after.reduce((sum, e) => sum + e.sentiment, 0) / after.length;

      if (Math.abs(afterAvg - beforeAvg) > 0.3) {
        shifts.push({
          date: events[i].date,
          description: afterAvg > beforeAvg
            ? 'Shift toward more positive feelings'
            : 'Shift toward more difficult feelings',
          sentiment: afterAvg,
          significance: Math.abs(afterAvg - beforeAvg),
        });
      }
    }

    return shifts;
  }

  private generateNarrative(subject: string, events: EvolutionTimeline['events']): string {
    if (events.length === 0) return `No history with ${subject} yet.`;

    const shifts = events.filter((e) => e.type === 'shift');
    const avgSentiment = events.reduce((sum, e) => sum + e.sentiment, 0) / events.length;

    const parts: string[] = [];

    parts.push(`Your journey with ${subject} has ${events.length} recorded moments.`);

    if (shifts.length > 0) {
      parts.push(`There have been ${shifts.length} significant shift${shifts.length > 1 ? 's' : ''}.`);
    }

    if (avgSentiment > 0.3) {
      parts.push('Overall, this has been a positive presence.');
    } else if (avgSentiment < -0.3) {
      parts.push("This has been challenging, but you've kept engaging with it.");
    } else {
      parts.push('Your feelings about this have been mixed.');
    }

    return parts.join(' ');
  }

  private averageSentiment(mentions: Mention[]): number {
    if (mentions.length === 0) return 0;
    return (
      mentions.reduce((sum, m) => sum + this.calculateMentionSentiment(m), 0) / mentions.length
    );
  }

  private describeEmotionalState(valence: number): string {
    if (valence > 0.5) return 'very positive';
    if (valence > 0.2) return 'mostly positive';
    if (valence > -0.2) return 'neutral';
    if (valence > -0.5) return 'somewhat difficult';
    return 'very challenging';
  }

  private describeRelationshipState(sentiment: number): string {
    if (sentiment > 0.5) return 'warm and connected';
    if (sentiment > 0.2) return 'positive';
    if (sentiment > -0.2) return 'neutral';
    if (sentiment > -0.5) return 'strained';
    return 'very difficult';
  }

  private compareEmotionalArcs(first: string, last: string): GrowthObservation['trajectory']['direction'] {
    const positiveArcs = ['hopeful', 'resolved', 'relieved', 'empowered', 'peaceful'];
    const negativeArcs = ['worried', 'anxious', 'frustrated', 'stuck', 'overwhelmed'];

    const firstPositive = positiveArcs.some((a) => first.toLowerCase().includes(a));
    const lastPositive = positiveArcs.some((a) => last.toLowerCase().includes(a));
    const firstNegative = negativeArcs.some((a) => first.toLowerCase().includes(a));
    const lastNegative = negativeArcs.some((a) => last.toLowerCase().includes(a));

    if (!firstPositive && lastPositive) return 'positive';
    if (firstPositive && !lastPositive) return 'negative';
    if (firstNegative && !lastNegative) return 'positive';
    if (!firstNegative && lastNegative) return 'negative';

    return 'mixed';
  }

  private generateEmotionalGrowthInsight(association: {
    entityName: string;
    recentTrend: number;
  }): string {
    if (association.recentTrend > 0.3) {
      return `Your feelings about ${association.entityName} have become noticeably more positive. That's real growth.`;
    }
    if (association.recentTrend > 0) {
      return `Things with ${association.entityName} seem to be trending in a good direction.`;
    }
    if (association.recentTrend < -0.3) {
      return `I've noticed more difficult emotions around ${association.entityName} lately. Want to talk about it?`;
    }
    return `Your feelings about ${association.entityName} have shifted recently.`;
  }

  private generateRelationshipGrowthInsight(name: string, trend: number): string {
    if (trend > 0.2) {
      return `Your relationship with ${name} seems to be improving. I see more positive mentions lately.`;
    }
    if (trend < -0.2) {
      return `Things with ${name} seem more challenging lately compared to before.`;
    }
    return `Your dynamic with ${name} has been evolving.`;
  }

  private generateTopicGrowthInsight(
    topic: string,
    firstArc: string,
    lastArc: string
  ): string {
    return `When you first talked about ${topic}, you felt ${firstArc}. Now you're ${lastArc}. That's evolution.`;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let growthTracker: GrowthTracker | null = null;

export function getGrowthTracker(): GrowthTracker {
  if (!growthTracker) {
    growthTracker = new GrowthTracker();
  }
  return growthTracker;
}

export default GrowthTracker;
