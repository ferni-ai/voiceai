/**
 * Pattern Callback Detector
 *
 * Detects when the user is in a similar emotional or situational state
 * as a past conversation, enabling "Better Than Human" pattern recognition.
 *
 * Examples:
 * - "Last time you felt this overwhelmed, you found that..."
 * - "This reminds me of when you were dealing with..."
 * - "You've mentioned feeling this way before when..."
 *
 * @module intelligence/triggers/pattern-callback
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PatternCallbackDetector' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pattern callback trigger result
 */
export interface PatternCallbackTrigger {
  /** Unique ID */
  id: string;
  /** Priority (0-100) */
  priority: number;
  /** Confidence (0-1) */
  confidence: number;
  /** Natural suggestion for surfacing */
  suggestion: string;
  /** Attribution phrase */
  attribution: string;
  /** Original content from past */
  content: string;
  /** Source memory ID */
  sourceId?: string;
  /** When the pattern was observed */
  sourceDate?: Date;
  /** Type of pattern match */
  patternType: PatternType;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Types of pattern matches
 */
export type PatternType =
  | 'emotional'    // Same emotion/feeling
  | 'situational'  // Similar situation
  | 'behavioral'   // Similar behavior pattern
  | 'topic'        // Same topic discussed
  | 'relational';  // Same person/relationship involved

/**
 * Input for pattern detection
 */
export interface PatternDetectionInput {
  /** Current emotion */
  currentEmotion?: string;
  /** Current emotion intensity (0-1) */
  currentIntensity?: number;
  /** Current transcript */
  transcript?: string;
  /** Current topics */
  topics?: string[];
  /** Mentioned entities */
  mentionedEntities?: string[];
  /** Maximum results */
  maxResults?: number;
  /** Minimum similarity for matching */
  minSimilarity?: number;
}

// ============================================================================
// EMOTION SIMILARITY
// ============================================================================

/**
 * Emotion clusters for similarity matching
 */
const EMOTION_CLUSTERS: Record<string, string[]> = {
  distress: ['overwhelmed', 'stressed', 'anxious', 'worried', 'panicked', 'scared'],
  sadness: ['sad', 'down', 'depressed', 'lonely', 'grief', 'disappointed', 'hopeless'],
  anger: ['angry', 'frustrated', 'annoyed', 'irritated', 'resentful'],
  joy: ['happy', 'excited', 'joyful', 'grateful', 'hopeful', 'content'],
  confusion: ['confused', 'lost', 'uncertain', 'indecisive', 'stuck'],
  fear: ['afraid', 'nervous', 'apprehensive', 'dreading'],
};

/**
 * Get emotions in the same cluster
 */
function getSimilarEmotions(emotion: string): string[] {
  const normalized = emotion.toLowerCase();

  for (const [_, emotions] of Object.entries(EMOTION_CLUSTERS)) {
    if (emotions.includes(normalized)) {
      return emotions;
    }
  }

  // If not in a cluster, just return the emotion itself
  return [normalized];
}

/**
 * Calculate emotion similarity (0-1)
 */
function calculateEmotionSimilarity(emotion1: string, emotion2: string): number {
  if (emotion1.toLowerCase() === emotion2.toLowerCase()) {
    return 1.0;
  }

  const cluster1 = getSimilarEmotions(emotion1);
  const cluster2 = getSimilarEmotions(emotion2);

  // Check if in same cluster
  const inSameCluster = cluster1.some((e) => cluster2.includes(e));
  if (inSameCluster) {
    return 0.8;
  }

  return 0;
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Detect pattern callbacks from past conversations.
 *
 * Searches the user's conversation history for similar emotional states,
 * situations, or topics, and returns triggers for "Better Than Human" callbacks.
 */
export async function detectPatternCallbacks(
  userId: string,
  input: PatternDetectionInput
): Promise<PatternCallbackTrigger[]> {
  const triggers: PatternCallbackTrigger[] = [];
  const maxResults = input.maxResults ?? 3;
  const minSimilarity = input.minSimilarity ?? 0.6;

  try {
    // 1. Check emotional patterns
    if (input.currentEmotion) {
      const emotionalPatterns = await findEmotionalPatterns(
        userId,
        input.currentEmotion,
        input.currentIntensity,
        minSimilarity
      );
      triggers.push(...emotionalPatterns);
    }

    // 2. Check topic patterns
    if (input.topics && input.topics.length > 0) {
      const topicPatterns = await findTopicPatterns(userId, input.topics, minSimilarity);
      triggers.push(...topicPatterns);
    }

    // 3. Check entity/relationship patterns
    if (input.mentionedEntities && input.mentionedEntities.length > 0) {
      const relationalPatterns = await findRelationalPatterns(
        userId,
        input.mentionedEntities,
        minSimilarity
      );
      triggers.push(...relationalPatterns);
    }

    // Sort by confidence and limit
    triggers.sort((a, b) => b.confidence - a.confidence);
    const limited = triggers.slice(0, maxResults);

    log.debug(
      {
        userId,
        currentEmotion: input.currentEmotion,
        totalFound: triggers.length,
        returned: limited.length,
      },
      '🔄 Pattern callback detection complete'
    );

    return limited;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Pattern callback detection failed');
    return [];
  }
}

// ============================================================================
// EMOTIONAL PATTERN DETECTION
// ============================================================================

/**
 * Find past instances of similar emotional states
 */
async function findEmotionalPatterns(
  userId: string,
  currentEmotion: string,
  currentIntensity: number | undefined,
  minSimilarity: number
): Promise<PatternCallbackTrigger[]> {
  const triggers: PatternCallbackTrigger[] = [];

  try {
    const similarEmotions = getSimilarEmotions(currentEmotion);

    // Search for memories tagged with similar emotions
    const { retrieveMemories } = await import('../../memory/advanced-retrieval.js');

    // Query for emotional context
    const query = `feeling ${similarEmotions.join(' or ')}`;
    const memories = await retrieveMemories(userId, {
      query,
      currentEmotion,
      conversationTurn: 0,
    });

    // Find memories with similar emotional context
    for (const memory of memories.slice(0, 20)) {
      // Check if memory has emotional metadata
      const memoryEmotion = memory.item.source?.documentId?.includes('emotion')
        ? 'detected'
        : null;

      if (!memoryEmotion && memory.score < 0.5) continue;

      // Calculate pattern similarity
      const similarity = memory.score;
      if (similarity < minSimilarity) continue;

      // Skip very recent memories (within 7 days)
      const daysSince = daysBetweenDates(memory.item.timestamp, new Date());
      if (daysSince < 7) continue;

      // Generate suggestion
      const timeAgo = formatTimeAgo(daysSince);
      const suggestion = `${timeAgo}, when you were feeling this way, ${memory.item.content.slice(0, 80)}...`;

      triggers.push({
        id: `emotional_pattern_${memory.item.id}`,
        priority: 70 + Math.round(similarity * 20),
        confidence: similarity,
        suggestion,
        attribution: `Last time you felt this way`,
        content: memory.item.content,
        sourceId: memory.item.id,
        sourceDate: memory.item.timestamp,
        patternType: 'emotional',
        context: {
          matchedEmotion: currentEmotion,
          daysSince,
          similarity,
        },
      });
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Emotional pattern detection failed');
  }

  return triggers;
}

// ============================================================================
// TOPIC PATTERN DETECTION
// ============================================================================

/**
 * Find past instances of similar topics
 */
async function findTopicPatterns(
  userId: string,
  currentTopics: string[],
  minSimilarity: number
): Promise<PatternCallbackTrigger[]> {
  const triggers: PatternCallbackTrigger[] = [];

  try {
    const { retrieveMemories } = await import('../../memory/advanced-retrieval.js');

    for (const topic of currentTopics) {
      const memories = await retrieveMemories(userId, {
        query: topic,
        conversationTurn: 0,
      });

      for (const memory of memories.slice(0, 5)) {
        if (memory.score < minSimilarity) continue;

        // Skip very recent
        const daysSince = daysBetweenDates(memory.item.timestamp, new Date());
        if (daysSince < 14) continue;

        const timeAgo = formatTimeAgo(daysSince);
        const suggestion = `You talked about ${topic} ${timeAgo}. ${memory.item.content.slice(0, 60)}...`;

        triggers.push({
          id: `topic_pattern_${topic}_${memory.item.id}`,
          priority: 50 + Math.round(memory.score * 20),
          confidence: memory.score * 0.9,
          suggestion,
          attribution: `When you discussed ${topic} before`,
          content: memory.item.content,
          sourceId: memory.item.id,
          sourceDate: memory.item.timestamp,
          patternType: 'topic',
          context: {
            matchedTopic: topic,
            daysSince,
          },
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Topic pattern detection failed');
  }

  return triggers;
}

// ============================================================================
// RELATIONAL PATTERN DETECTION
// ============================================================================

/**
 * Find past instances involving the same people/relationships
 */
async function findRelationalPatterns(
  userId: string,
  mentionedEntities: string[],
  minSimilarity: number
): Promise<PatternCallbackTrigger[]> {
  const triggers: PatternCallbackTrigger[] = [];

  try {
    const { retrieveMemories } = await import('../../memory/advanced-retrieval.js');

    for (const entity of mentionedEntities) {
      const memories = await retrieveMemories(userId, {
        query: entity,
        conversationTurn: 0,
      });

      for (const memory of memories.slice(0, 3)) {
        if (memory.score < minSimilarity) continue;

        // Skip very recent
        const daysSince = daysBetweenDates(memory.item.timestamp, new Date());
        if (daysSince < 14) continue;

        const timeAgo = formatTimeAgo(daysSince);
        const suggestion = `${timeAgo}, regarding ${entity}: ${memory.item.content.slice(0, 70)}...`;

        triggers.push({
          id: `relational_pattern_${entity}_${memory.item.id}`,
          priority: 55 + Math.round(memory.score * 15),
          confidence: memory.score * 0.85,
          suggestion,
          attribution: `The last time ${entity} came up`,
          content: memory.item.content,
          sourceId: memory.item.id,
          sourceDate: memory.item.timestamp,
          patternType: 'relational',
          context: {
            matchedEntity: entity,
            daysSince,
          },
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Relational pattern detection failed');
  }

  return triggers;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Days between two dates
 */
function daysBetweenDates(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

/**
 * Format time ago in natural language
 */
function formatTimeAgo(days: number): string {
  if (days < 7) return 'a few days ago';
  if (days < 14) return 'about a week ago';
  if (days < 30) return 'a few weeks ago';
  if (days < 60) return 'about a month ago';
  if (days < 90) return 'a couple months ago';
  if (days < 180) return 'a few months ago';
  if (days < 365) return 'several months ago';
  if (days < 400) return 'about a year ago';
  return 'over a year ago';
}
