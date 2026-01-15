/**
 * Predictive Memory - Anticipate What User Needs
 *
 * A superhuman friend doesn't just remember - they anticipate.
 * This service predicts what memories/entities will be relevant
 * before the user even asks.
 *
 * Capabilities:
 * - Temporal prediction: "It's Monday, you usually talk about work stress"
 * - Contextual prediction: "You mentioned a meeting, you'll want to discuss boss"
 * - Emotional prediction: "You sound stressed, might want to discuss coping"
 * - Calendar prediction: "Mom's birthday tomorrow, you'll want to plan"
 * - Pattern prediction: "Every time you discuss X, you also mention Y"
 *
 * @module memory/knowledge-graph/superhuman/predictive-memory
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { Entity, Correlation } from '../types.js';

const log = createLogger({ module: 'PredictiveMemory' });

// ============================================================================
// TYPES
// ============================================================================

export interface PredictiveContext {
  userId: string;
  currentTime: Date;
  dayOfWeek: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  currentTopic?: string;
  currentEmotion?: string;
  recentEntities?: string[]; // Entity IDs mentioned recently
  upcomingEvents?: Array<{ name: string; date: Date; entityIds: string[] }>;
}

export interface Prediction {
  id: string;
  type: PredictionType;
  entityId?: string;
  entityName?: string;
  topic?: string;
  confidence: number;
  reason: string;
  suggestedPhrase: string;
  priority: number; // 0-1, higher = more important
  expiresAt?: Date;
}

export type PredictionType =
  | 'temporal' // Based on time patterns
  | 'contextual' // Based on current conversation
  | 'emotional' // Based on detected emotion
  | 'calendar' // Based on upcoming events
  | 'pattern' // Based on co-occurrence patterns
  | 'momentum'; // Based on recent conversation trajectory

// ============================================================================
// PREDICTIVE MEMORY ENGINE
// ============================================================================

export class PredictiveMemory {
  private correlationCache: Map<string, Correlation[]> = new Map();
  private readonly cacheTTLMs = 5 * 60 * 1000; // 5 minute cache

  /**
   * Generate predictions for what memories will be relevant
   */
  async predict(context: PredictiveContext): Promise<Prediction[]> {
    const predictions: Prediction[] = [];

    try {
      // 1. Temporal predictions (time-based patterns)
      const temporalPredictions = await this.predictFromTime(context);
      predictions.push(...temporalPredictions);

      // 2. Contextual predictions (current topic)
      if (context.currentTopic) {
        const contextualPredictions = await this.predictFromTopic(context);
        predictions.push(...contextualPredictions);
      }

      // 3. Emotional predictions
      if (context.currentEmotion) {
        const emotionalPredictions = await this.predictFromEmotion(context);
        predictions.push(...emotionalPredictions);
      }

      // 4. Calendar predictions
      if (context.upcomingEvents && context.upcomingEvents.length > 0) {
        const calendarPredictions = this.predictFromCalendar(context);
        predictions.push(...calendarPredictions);
      }

      // 5. Pattern predictions (co-occurrence)
      if (context.recentEntities && context.recentEntities.length > 0) {
        const patternPredictions = await this.predictFromPatterns(context);
        predictions.push(...patternPredictions);
      }

      // Sort by priority and deduplicate
      return this.rankAndDeduplicate(predictions);
    } catch (error) {
      log.error({ error: String(error), userId: context.userId }, 'Prediction failed');
      return [];
    }
  }

  /**
   * Predict based on temporal patterns
   */
  private async predictFromTime(context: PredictiveContext): Promise<Prediction[]> {
    const predictions: Prediction[] = [];

    try {
      const { getActiveCorrelations } = await import('../storage/index.js');

      // Note: This function may not exist yet - handle gracefully
      let correlations: Correlation[] = [];
      try {
        const { getConsolidationEngine } = await import('../consolidation.js');
        // Get temporal correlations
        const engine = getConsolidationEngine();
        // This would need correlation retrieval - simplified for now
      } catch {
        // Correlation retrieval not available
      }

      // Check for day-of-week patterns
      const dayPatterns: Record<string, string[]> = {
        Monday: ['work', 'stress', 'planning', 'meetings'],
        Tuesday: ['productivity', 'meetings'],
        Wednesday: ['midweek', 'energy'],
        Thursday: ['preparation', 'planning'],
        Friday: ['reflection', 'weekend planning', 'relaxation'],
        Saturday: ['family', 'activities', 'social'],
        Sunday: ['reflection', 'planning', 'rest', 'family'],
      };

      const typicalTopics = dayPatterns[context.dayOfWeek] || [];

      // Check for time-of-day patterns
      const timePatterns: Record<string, string[]> = {
        morning: ['planning', 'energy', 'goals', 'exercise'],
        afternoon: ['work', 'productivity', 'meetings'],
        evening: ['reflection', 'family', 'relaxation'],
        night: ['anxiety', 'reflection', 'sleep', 'worries'],
      };

      const timeTopics = timePatterns[context.timeOfDay] || [];

      // Generate predictions for likely topics
      for (const topic of [...typicalTopics, ...timeTopics].slice(0, 3)) {
        predictions.push({
          id: `temporal-${context.dayOfWeek}-${topic}`,
          type: 'temporal',
          topic,
          confidence: 0.6,
          reason: `You often discuss ${topic} on ${context.dayOfWeek}s`,
          suggestedPhrase: `Since it's ${context.dayOfWeek}, is ${topic} on your mind?`,
          priority: 0.4,
        });
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Temporal prediction failed');
    }

    return predictions;
  }

  /**
   * Predict based on current topic
   */
  private async predictFromTopic(context: PredictiveContext): Promise<Prediction[]> {
    const predictions: Prediction[] = [];

    try {
      const { searchEntities } = await import('../../entity-store/storage.js');

      // Find entities related to current topic
      const related = await searchEntities(context.userId, context.currentTopic!, {
        limit: 5,
      });

      for (const entity of related) {
        predictions.push({
          id: `contextual-${entity.id}`,
          type: 'contextual',
          entityId: entity.id,
          entityName: entity.canonicalName,
          confidence: entity.salience || 0.5,
          reason: `${entity.canonicalName} is related to ${context.currentTopic}`,
          suggestedPhrase: `This reminds me of ${entity.canonicalName}. Relevant?`,
          priority: (entity.salience || 0.5) * 0.8,
        });
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Contextual prediction failed');
    }

    return predictions;
  }

  /**
   * Predict based on emotional state
   */
  private async predictFromEmotion(context: PredictiveContext): Promise<Prediction[]> {
    const predictions: Prediction[] = [];

    // Emotion-to-need mapping
    const emotionalNeeds: Record<string, { topics: string[]; phrase: string }> = {
      stressed: {
        topics: ['coping', 'support', 'relaxation'],
        phrase: "When you're stressed, it helps to...",
      },
      anxious: {
        topics: ['grounding', 'reassurance', 'planning'],
        phrase: "I notice some anxiety. Let's...",
      },
      sad: {
        topics: ['support', 'connection', 'comfort'],
        phrase: "I'm here for you. Would it help to...",
      },
      happy: {
        topics: ['celebration', 'gratitude', 'sharing'],
        phrase: 'I love your energy! Want to...',
      },
      angry: {
        topics: ['venting', 'understanding', 'resolution'],
        phrase: 'I hear you. What would help most?',
      },
      confused: {
        topics: ['clarity', 'options', 'perspective'],
        phrase: "Let's work through this together...",
      },
    };

    const emotionConfig = emotionalNeeds[context.currentEmotion!];
    if (emotionConfig) {
      for (const topic of emotionConfig.topics.slice(0, 2)) {
        predictions.push({
          id: `emotional-${context.currentEmotion}-${topic}`,
          type: 'emotional',
          topic,
          confidence: 0.7,
          reason: `When you feel ${context.currentEmotion}, ${topic} often helps`,
          suggestedPhrase: emotionConfig.phrase,
          priority: 0.6,
        });
      }
    }

    return predictions;
  }

  /**
   * Predict based on upcoming calendar events
   */
  private predictFromCalendar(context: PredictiveContext): Prediction[] {
    const predictions: Prediction[] = [];

    const now = context.currentTime.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneWeekMs = 7 * oneDayMs;

    for (const event of context.upcomingEvents || []) {
      const timeUntil = event.date.getTime() - now;

      // Very soon (within 24 hours)
      if (timeUntil > 0 && timeUntil <= oneDayMs) {
        predictions.push({
          id: `calendar-tomorrow-${event.name}`,
          type: 'calendar',
          entityId: event.entityIds[0],
          topic: event.name,
          confidence: 0.9,
          reason: `${event.name} is tomorrow!`,
          suggestedPhrase: `${event.name} is coming up tomorrow. How are you feeling about it?`,
          priority: 0.9,
          expiresAt: event.date,
        });
      }
      // Within a week
      else if (timeUntil > oneDayMs && timeUntil <= oneWeekMs) {
        const daysUntil = Math.ceil(timeUntil / oneDayMs);
        predictions.push({
          id: `calendar-week-${event.name}`,
          type: 'calendar',
          entityId: event.entityIds[0],
          topic: event.name,
          confidence: 0.7,
          reason: `${event.name} is in ${daysUntil} days`,
          suggestedPhrase: `${event.name} is coming up in ${daysUntil} days. Want to talk about it?`,
          priority: 0.6,
          expiresAt: event.date,
        });
      }
    }

    return predictions;
  }

  /**
   * Predict based on entity co-occurrence patterns
   */
  private async predictFromPatterns(context: PredictiveContext): Promise<Prediction[]> {
    const predictions: Prediction[] = [];

    try {
      const { getRelationshipsForEntity } = await import('../../entity-store/storage.js');

      // For each recently mentioned entity, find connected entities
      for (const entityId of context.recentEntities || []) {
        const relationships = await getRelationshipsForEntity(context.userId, entityId);

        for (const rel of relationships.slice(0, 2)) {
          const connectedId = rel.fromEntity === entityId ? rel.toEntity : rel.fromEntity;

          predictions.push({
            id: `pattern-${entityId}-${connectedId}`,
            type: 'pattern',
            entityId: connectedId,
            confidence: rel.strength || 0.5,
            reason: `This entity is often mentioned together with the previous topic`,
            suggestedPhrase: `This reminds me of something related...`,
            priority: (rel.strength || 0.5) * 0.5,
          });
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Pattern prediction failed');
    }

    return predictions;
  }

  /**
   * Rank predictions and remove duplicates
   */
  private rankAndDeduplicate(predictions: Prediction[]): Prediction[] {
    // Remove duplicates by ID
    const seen = new Set<string>();
    const unique = predictions.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // Sort by priority * confidence
    return unique
      .sort((a, b) => b.priority * b.confidence - a.priority * a.confidence)
      .slice(0, 10);
  }

  /**
   * Record prediction accuracy for learning
   */
  async recordPredictionOutcome(
    userId: string,
    predictionId: string,
    wasRelevant: boolean
  ): Promise<void> {
    // Store outcome for future learning
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      await db
        .collection('knowledge_graph')
        .doc(userId)
        .collection('prediction_outcomes')
        .add(
          cleanForFirestore({
            predictionId,
            wasRelevant,
            recordedAt: new Date(),
          })
        );
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to record prediction outcome');
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let predictiveMemory: PredictiveMemory | null = null;

export function getPredictiveMemory(): PredictiveMemory {
  if (!predictiveMemory) {
    predictiveMemory = new PredictiveMemory();
  }
  return predictiveMemory;
}

export default PredictiveMemory;
