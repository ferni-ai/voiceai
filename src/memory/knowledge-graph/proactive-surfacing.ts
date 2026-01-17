/**
 * Proactive Memory Surfacing - "I was thinking about..."
 *
 * This is the heart of Ferni's superhuman recall. Unlike humans who
 * passively wait for relevant memories to surface, Ferni actively
 * monitors for opportunities to bring up relevant information.
 *
 * Surfacing triggers:
 * 1. Time-based: Birthdays, anniversaries, commitments due
 * 2. Context-based: Current topic relates to stored knowledge
 * 3. Pattern-based: Similar situation to past experience
 * 4. Emotional-support: User might benefit from a callback
 * 5. Dormant-connection: Important person not mentioned recently
 * 6. Goal-progress: Update on user's goals/dreams
 * 7. Commitment-follow-up: Check on things user committed to
 *
 * Key insight: Proactive != intrusive. The system:
 * - Generates recommendations but doesn't force them
 * - Respects conversational flow
 * - Tracks what was surfaced to avoid repetition
 * - Learns from feedback (was this helpful?)
 *
 * @module memory/knowledge-graph/proactive-surfacing
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getEntityResolver } from '../entity-store/entity-resolver.js';
import { getUnifiedQueryEngine } from './services/natural-language-query.js';
import { getCorrelationEngine } from '../entity-store/correlation-engine.js';
import type {
  Entity,
  SurfacingRecommendation,
  SurfacingReason,
  Correlation,
} from './types.js';
import { getFirestoreDb, cleanForFirestore } from '../../utils/firestore-utils.js';
import { generateId } from '../../utils/id-generator.js';

const log = createLogger({ module: 'ProactiveSurfacing' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = 'knowledge_graph';
const SURFACING_HISTORY_SUBCOLLECTION = 'surfacing_history';

/**
 * How long to wait before surfacing the same entity again (hours)
 */
const ENTITY_COOLDOWN_HOURS = 24;

/**
 * Maximum surfacing recommendations per turn
 */
const MAX_RECOMMENDATIONS_PER_TURN = 2;

/**
 * Minimum score to include a recommendation
 */
const MIN_SURFACING_SCORE = 0.3;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Record of when something was surfaced
 */
interface SurfacingRecord {
  id: string;
  userId: string;
  entityId: string;
  reason: SurfacingReason;
  sessionId: string;
  turnNumber: number;
  surfacedAt: Date;
  phraseUsed: string;
  feedback?: 'helpful' | 'neutral' | 'unhelpful';
  feedbackAt?: Date;
}

/**
 * Context for generating surfacing recommendations
 */
export interface SurfacingContext {
  userId: string;
  sessionId: string;
  turnNumber: number;
  currentTopic?: string;
  currentEmotion?: string;
  emotionalIntensity?: number;
  recentTranscript?: string;
  timeOfDay?: string;
  dayOfWeek?: string;
  isFirstTurn?: boolean;
  isReturningUser?: boolean;
  daysSinceLastSession?: number;
}

// ============================================================================
// PROACTIVE SURFACING ENGINE
// ============================================================================

export class ProactiveSurfacingEngine {
  private resolver = getEntityResolver();
  private queryEngine = getUnifiedQueryEngine();
  private correlationEngine = getCorrelationEngine();

  /**
   * Get surfacing recommendations for the current turn.
   * Call this at the START of processing a turn to get relevant memories to inject.
   */
  async getRecommendations(context: SurfacingContext): Promise<SurfacingRecommendation[]> {
    const startTime = Date.now();
    const recommendations: SurfacingRecommendation[] = [];
    const surfacedRecently = await this.getRecentlySurfaced(context.userId, ENTITY_COOLDOWN_HOURS);

    // Parallel fetch all recommendation types
    const [
      timeBased,
      contextBased,
      patternBased,
      emotionalSupport,
      dormantConnections,
      commitmentFollowUps,
    ] = await Promise.all([
      this.getTimeBasedRecommendations(context, surfacedRecently),
      this.getContextBasedRecommendations(context, surfacedRecently),
      this.getPatternBasedRecommendations(context, surfacedRecently),
      this.getEmotionalSupportRecommendations(context, surfacedRecently),
      this.getDormantConnectionRecommendations(context, surfacedRecently),
      this.getCommitmentFollowUpRecommendations(context, surfacedRecently),
    ]);

    recommendations.push(
      ...timeBased,
      ...contextBased,
      ...patternBased,
      ...emotionalSupport,
      ...dormantConnections,
      ...commitmentFollowUps
    );

    // Filter by minimum score and cooldown
    const filtered = recommendations.filter(
      (r) => r.score >= MIN_SURFACING_SCORE && !surfacedRecently.has(r.entity.id)
    );

    // Sort by score and take top N
    const sorted = filtered.sort((a, b) => b.score - a.score).slice(0, MAX_RECOMMENDATIONS_PER_TURN);

    log.debug(
      {
        userId: context.userId,
        totalCandidates: recommendations.length,
        filteredCount: filtered.length,
        returnedCount: sorted.length,
        durationMs: Date.now() - startTime,
      },
      'Generated surfacing recommendations'
    );

    return sorted;
  }

  /**
   * Record that something was surfaced to the user.
   * Call this AFTER Ferni mentions the entity so we can track cooldown.
   */
  async recordSurfacing(
    context: SurfacingContext,
    entityId: string,
    reason: SurfacingReason,
    phraseUsed: string
  ): Promise<void> {
    const db = await getFirestoreDb();
    if (!db) return;

    const record: SurfacingRecord = {
      id: generateId('surf'),
      userId: context.userId,
      entityId,
      reason,
      sessionId: context.sessionId,
      turnNumber: context.turnNumber,
      surfacedAt: new Date(),
      phraseUsed,
    };

    await db
      .collection(COLLECTION)
      .doc(context.userId)
      .collection(SURFACING_HISTORY_SUBCOLLECTION)
      .doc(record.id)
      .set(cleanForFirestore(record));

    log.debug({ userId: context.userId, entityId, reason }, 'Recorded surfacing');
  }

  /**
   * Record feedback on a surfacing (was it helpful?).
   * This trains the system to surface better memories over time.
   */
  async recordFeedback(
    userId: string,
    surfacingId: string,
    feedback: 'helpful' | 'neutral' | 'unhelpful'
  ): Promise<void> {
    const db = await getFirestoreDb();
    if (!db) return;

    await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SURFACING_HISTORY_SUBCOLLECTION)
      .doc(surfacingId)
      .update({
        feedback,
        feedbackAt: new Date(),
      });

    log.debug({ userId, surfacingId, feedback }, 'Recorded surfacing feedback');
  }

  /**
   * Generate the opening "callback" phrase for returning users.
   * This creates the "Better Than Human" moment of perfect recall.
   */
  async generateSessionOpeningCallback(context: SurfacingContext): Promise<string | null> {
    if (!context.isReturningUser || context.daysSinceLastSession === undefined) {
      return null;
    }

    // Get most important entity from recent history
    const results = await this.queryEngine.search({
      userId: context.userId,
      types: ['person', 'topic', 'commitment'],
      minImportance: 0.5,
      limit: 5,
      includeRecentMentions: 3,
    });

    if (results.length === 0) return null;

    const topEntity = results[0].entity;
    const daysSince = context.daysSinceLastSession;

    // Generate natural callback phrase
    if (daysSince === 0) {
      return `Good to have you back. Still thinking about ${topEntity.canonicalName}?`;
    } else if (daysSince === 1) {
      return `Welcome back! How did things go with ${topEntity.canonicalName}?`;
    } else if (daysSince <= 7) {
      return `It's been a few days. Last time we talked about ${topEntity.canonicalName} - any updates?`;
    } else {
      return `Hey, it's been a while! I've been thinking about what you said about ${topEntity.canonicalName}.`;
    }
  }

  // ============================================================================
  // RECOMMENDATION GENERATORS
  // ============================================================================

  private async getTimeBasedRecommendations(
    context: SurfacingContext,
    surfacedRecently: Set<string>
  ): Promise<SurfacingRecommendation[]> {
    const recommendations: SurfacingRecommendation[] = [];

    // Get people with birthday facts
    const people = await this.resolver.getPeople(context.userId, 100);

    for (const person of people) {
      if (surfacedRecently.has(person.id)) continue;

      const facts = await this.resolver.getFacts(context.userId, person.id);
      const birthdayFact = facts.find((f) => f.structured?.predicate === 'birthday');

      if (birthdayFact?.structured?.value) {
        const birthday = new Date(birthdayFact.structured.value as string);
        const today = new Date();
        const thisYearBirthday = new Date(
          today.getFullYear(),
          birthday.getMonth(),
          birthday.getDate()
        );
        const daysUntil = Math.floor(
          (thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntil >= 0 && daysUntil <= 7) {
          const urgency = daysUntil <= 1 ? 1.0 : 0.8 - daysUntil * 0.1;
          recommendations.push({
            entity: person,
            reason: 'time_based',
            urgency,
            suggestedPhrase:
              daysUntil === 0
                ? `Oh, isn't today ${person.canonicalName}'s birthday?`
                : daysUntil === 1
                  ? `${person.canonicalName}'s birthday is tomorrow - have you got plans?`
                  : `${person.canonicalName}'s birthday is coming up in ${daysUntil} days.`,
            score: urgency * person.importance,
          });
        }
      }
    }

    return recommendations;
  }

  private async getContextBasedRecommendations(
    context: SurfacingContext,
    surfacedRecently: Set<string>
  ): Promise<SurfacingRecommendation[]> {
    if (!context.recentTranscript && !context.currentTopic) {
      return [];
    }

    const recommendations: SurfacingRecommendation[] = [];
    const searchQuery = context.currentTopic || context.recentTranscript?.slice(0, 100);

    if (!searchQuery) return [];

    // Search for relevant entities
    const results = await this.queryEngine.search({
      userId: context.userId,
      query: searchQuery,
      limit: 5,
      includeFacts: true,
    });

    for (const result of results) {
      if (surfacedRecently.has(result.entity.id)) continue;

      // Only suggest if we have interesting facts to share
      if (result.facts && result.facts.length > 0) {
        recommendations.push({
          entity: result.entity,
          reason: 'context_relevant',
          urgency: 0.6,
          suggestedPhrase: `This reminds me of what you mentioned about ${result.entity.canonicalName}...`,
          contextTrigger: searchQuery,
          score: result.relevance * 0.7,
        });
      }
    }

    return recommendations;
  }

  private async getPatternBasedRecommendations(
    context: SurfacingContext,
    surfacedRecently: Set<string>
  ): Promise<SurfacingRecommendation[]> {
    const recommendations: SurfacingRecommendation[] = [];

    // Get correlations that match current context
    const correlations = await this.correlationEngine.getCorrelations(context.userId, {
      minStrength: 0.5,
      limit: 10,
    });

    for (const correlation of correlations) {
      // Check if correlation matches current context
      const matches = this.correlationMatchesContext(correlation, context);
      if (!matches) continue;

      // Get the primary entity for this correlation
      const primaryEntityId = correlation.entityIds[0];
      if (surfacedRecently.has(primaryEntityId)) continue;

      const entity = await this.resolver.getEntity(context.userId, primaryEntityId);
      if (!entity) continue;

      recommendations.push({
        entity,
        reason: 'pattern_match',
        urgency: correlation.strength,
        suggestedPhrase: this.generatePatternPhrase(correlation, entity),
        contextTrigger: correlation.description,
        score: correlation.strength * correlation.confidence,
      });
    }

    return recommendations;
  }

  private async getEmotionalSupportRecommendations(
    context: SurfacingContext,
    surfacedRecently: Set<string>
  ): Promise<SurfacingRecommendation[]> {
    const recommendations: SurfacingRecommendation[] = [];

    // Only suggest emotional support if user seems to be struggling
    if (!context.currentEmotion || context.emotionalIntensity === undefined) {
      return [];
    }

    const negativeEmotions = ['sad', 'anxious', 'stressed', 'frustrated', 'angry', 'worried'];
    if (!negativeEmotions.includes(context.currentEmotion) || context.emotionalIntensity < 0.5) {
      return [];
    }

    // Find entities associated with positive emotions
    const results = await this.queryEngine.search({
      userId: context.userId,
      types: ['person', 'memory'],
      minImportance: 0.5,
      limit: 10,
      includeRecentMentions: 5,
    });

    for (const result of results) {
      if (surfacedRecently.has(result.entity.id)) continue;

      // Check if this entity is associated with positive emotions
      if (result.recentMentions) {
        const positiveCount = result.recentMentions.filter(
          (m) => m.sentiment > 0.3
        ).length;
        const ratio = positiveCount / result.recentMentions.length;

        if (ratio > 0.6) {
          recommendations.push({
            entity: result.entity,
            reason: 'emotional_support',
            urgency: context.emotionalIntensity,
            suggestedPhrase:
              result.entity.type === 'person'
                ? `Have you thought about reaching out to ${result.entity.canonicalName}? They seem to lift you up.`
                : `Remember ${result.entity.canonicalName}? That seemed to bring you joy.`,
            score: ratio * context.emotionalIntensity * result.entity.importance,
          });
        }
      }
    }

    return recommendations;
  }

  private async getDormantConnectionRecommendations(
    context: SurfacingContext,
    surfacedRecently: Set<string>
  ): Promise<SurfacingRecommendation[]> {
    const recommendations: SurfacingRecommendation[] = [];

    // Get high-importance people not mentioned recently
    const people = await this.resolver.getPeople(context.userId, 50);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    for (const person of people) {
      if (surfacedRecently.has(person.id)) continue;
      if (person.importance < 0.5) continue;
      if (person.lastMentioned >= twoWeeksAgo) continue;

      const daysSince = Math.floor(
        (Date.now() - person.lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Adjust urgency based on importance and time elapsed
      const urgency = Math.min(1, (daysSince / 30) * person.importance);

      if (urgency >= 0.3) {
        recommendations.push({
          entity: person,
          reason: 'connection_dormant',
          urgency,
          suggestedPhrase:
            daysSince < 30
              ? `How are things with ${person.canonicalName}? It's been a little while.`
              : `I haven't heard you mention ${person.canonicalName} in a while. Everything okay there?`,
          score: urgency * person.importance,
        });
      }
    }

    return recommendations.slice(0, 3);
  }

  private async getCommitmentFollowUpRecommendations(
    context: SurfacingContext,
    surfacedRecently: Set<string>
  ): Promise<SurfacingRecommendation[]> {
    // This integrates with the commitment keeper superhuman service
    // For now, query entities of type 'commitment'
    const recommendations: SurfacingRecommendation[] = [];

    const commitments = await this.resolver.getEntitiesByType(context.userId, 'commitment', 20);

    for (const commitment of commitments) {
      if (surfacedRecently.has(commitment.id)) continue;
      if (commitment.properties.completed) continue;

      // Check if commitment is due soon
      if (commitment.properties.dueDate) {
        const dueDate = new Date(commitment.properties.dueDate);
        const daysUntil = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        if (daysUntil <= 3 && daysUntil >= 0) {
          const urgency = daysUntil === 0 ? 1.0 : 0.8;
          recommendations.push({
            entity: commitment,
            reason: 'commitment_due',
            urgency,
            suggestedPhrase:
              daysUntil === 0
                ? `Just a gentle reminder - you wanted to ${commitment.canonicalName} today.`
                : `You mentioned wanting to ${commitment.canonicalName} by ${dueDate.toLocaleDateString()}. How's that going?`,
            score: urgency,
          });
        }
      } else {
        // No due date - check if it's been a while since mentioned
        const daysSince = Math.floor(
          (Date.now() - commitment.lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSince >= 7) {
          recommendations.push({
            entity: commitment,
            reason: 'commitment_due',
            urgency: Math.min(1, daysSince / 30),
            suggestedPhrase: `You mentioned wanting to ${commitment.canonicalName}. Still on your mind?`,
            score: commitment.importance * Math.min(1, daysSince / 20),
          });
        }
      }
    }

    return recommendations.slice(0, 2);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getRecentlySurfaced(userId: string, hours: number): Promise<Set<string>> {
    const db = await getFirestoreDb();
    if (!db) return new Set();

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const snapshot = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(SURFACING_HISTORY_SUBCOLLECTION)
      .where('surfacedAt', '>=', cutoff)
      .get();

    const entityIds = new Set<string>();
    for (const doc of snapshot.docs) {
      entityIds.add(doc.data().entityId);
    }

    return entityIds;
  }

  private correlationMatchesContext(correlation: Correlation, context: SurfacingContext): boolean {
    // Check temporal match
    if (correlation.type === 'temporal' && correlation.pattern?.temporal) {
      if (
        correlation.pattern.temporal === context.timeOfDay ||
        correlation.pattern.temporal === context.dayOfWeek ||
        (correlation.pattern.temporal === 'weekends' && ['Saturday', 'Sunday'].includes(context.dayOfWeek || '')) ||
        (correlation.pattern.temporal === 'weekdays' && !['Saturday', 'Sunday'].includes(context.dayOfWeek || ''))
      ) {
        return true;
      }
    }

    // Check emotional match
    if (correlation.type === 'emotional' && correlation.pattern?.contextual) {
      if (correlation.pattern.contextual === context.currentEmotion) {
        return true;
      }
    }

    // Check cyclical match (day of week)
    if (correlation.type === 'cyclical' && correlation.pattern?.temporal) {
      if (correlation.pattern.temporal.includes(context.dayOfWeek || '')) {
        return true;
      }
    }

    return false;
  }

  private generatePatternPhrase(correlation: Correlation, entity: Entity): string {
    switch (correlation.type) {
      case 'temporal':
        return `You know, ${entity.canonicalName} seems to come up around this time. Is that on your mind?`;

      case 'emotional':
        return `I've noticed ${entity.canonicalName} tends to come up when you're feeling this way. Want to talk about that?`;

      case 'cyclical':
        return `${entity.canonicalName} seems to be on your mind around this time of week. What's that about?`;

      case 'social':
        return `This reminds me of what you've shared about ${entity.canonicalName}...`;

      default:
        return `${entity.canonicalName} came to mind. Is that relevant right now?`;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let proactiveSurfacing: ProactiveSurfacingEngine | null = null;

export function getProactiveSurfacingEngine(): ProactiveSurfacingEngine {
  if (!proactiveSurfacing) {
    proactiveSurfacing = new ProactiveSurfacingEngine();
  }
  return proactiveSurfacing;
}

export default ProactiveSurfacingEngine;
