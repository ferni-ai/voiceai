/**
 * STM → Firestore Promotion Service
 *
 * Promotes important entities from L1 (STM Buffer) to L2 (Firestore)
 * at session end or when entities reach importance threshold.
 *
 * This ensures:
 * - Frequently mentioned entities persist beyond session
 * - Important emotional moments are captured
 * - Conversation patterns inform future context
 *
 * @module memory/dynamic/stm-promotion
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  getSTMBuffer,
  getFrequentEntities,
  getRecentTopics,
  getEmotionalTrajectory,
  cleanupSession,
  type TurnMemory,
  type EntityFrequency,
} from './stm-buffer.js';
// Note: Observability metrics tracked via structured logging, not direct service imports
// This avoids architecture layer violation (memory layer cannot import services layer)

const log = createLogger({ module: 'STMPromotion' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface PromotionConfig {
  /** Minimum mention count to promote an entity */
  minMentionCount: number;
  /** Minimum importance to promote (based on emotional intensity) */
  minImportanceScore: number;
  /** Maximum entities to promote per session */
  maxEntitiesPerSession: number;
  /** Whether to promote emotional trajectory */
  promoteEmotionalTrajectory: boolean;
  /** Whether to promote topic patterns */
  promoteTopicPatterns: boolean;
}

const DEFAULT_CONFIG: PromotionConfig = {
  // 🧠 MEMORY FIX: Lowered thresholds to capture more entities
  // Previously minMentionCount: 2 was too strict for short conversations
  minMentionCount: 1, // Changed from 2 - capture single mentions
  minImportanceScore: 0.3, // Changed from 0.5 - be more inclusive
  maxEntitiesPerSession: 15, // Changed from 10 - capture more per session
  promoteEmotionalTrajectory: true,
  promoteTopicPatterns: true,
};

let config = { ...DEFAULT_CONFIG };

/**
 * Configure promotion thresholds
 */
export function configurePromotion(newConfig: Partial<PromotionConfig>): void {
  config = { ...config, ...newConfig };
}

// ============================================================================
// PROMOTION TYPES
// ============================================================================

interface PromotedEntity {
  name: string;
  type: string;
  mentionCount: number;
  importance: number;
  lastContext: string;
  sessionId: string;
  promotedAt: string;
}

interface PromotedEmotionalArc {
  sessionId: string;
  trajectory: Array<{
    turnNumber: number;
    dominantEmotion: string;
    intensity: string;
  }>;
  overallShift: 'positive' | 'negative' | 'neutral' | 'volatile';
  promotedAt: string;
}

interface PromotedTopicPattern {
  sessionId: string;
  topics: string[];
  transitions: string[];
  dominantTopic: string;
  promotedAt: string;
}

interface PromotionResult {
  entitiesPromoted: number;
  emotionalArcPromoted: boolean;
  topicPatternPromoted: boolean;
  sessionCleaned: boolean;
}

// ============================================================================
// IMPORTANCE CALCULATION
// ============================================================================

function calculateEntityImportance(
  entity: EntityFrequency,
  turns: TurnMemory[]
): number {
  let importance = 0;

  // Base importance from mention count
  importance += Math.min(entity.mentionCount / 5, 0.4); // Max 0.4 from mentions

  // Check if mentioned with high emotions
  for (const turn of turns) {
    const mentionedInTurn = turn.entities.some(
      (e) => e.name.toLowerCase() === entity.name.toLowerCase()
    );
    if (mentionedInTurn) {
      const hasHighEmotion = turn.emotions.some((e) => e.intensity === 'high');
      if (hasHighEmotion) {
        importance += 0.2;
        break; // Only add once
      }
    }
  }

  // Check if mentioned in recent turns (recency bonus)
  const recentTurns = turns.slice(-3);
  const mentionedRecently = recentTurns.some((turn) =>
    turn.entities.some((e) => e.name.toLowerCase() === entity.name.toLowerCase())
  );
  if (mentionedRecently) {
    importance += 0.2;
  }

  return Math.min(importance, 1.0);
}

function calculateOverallEmotionalShift(
  trajectory: Array<Array<{ emotion: string; intensity: string }>>
): 'positive' | 'negative' | 'neutral' | 'volatile' {
  if (trajectory.length < 2) return 'neutral';

  const positiveEmotions = ['happy', 'excited', 'grateful', 'relieved', 'hopeful', 'positive'];
  const negativeEmotions = ['sad', 'angry', 'anxious', 'stressed', 'frustrated', 'negative', 'fear'];

  let positiveCount = 0;
  let negativeCount = 0;
  let shifts = 0;
  let lastValence: 'positive' | 'negative' | 'neutral' = 'neutral';

  for (const turnEmotions of trajectory) {
    const dominant = turnEmotions[0];
    if (!dominant) continue;

    let currentValence: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (positiveEmotions.includes(dominant.emotion)) {
      positiveCount++;
      currentValence = 'positive';
    } else if (negativeEmotions.includes(dominant.emotion)) {
      negativeCount++;
      currentValence = 'negative';
    }

    if (lastValence !== 'neutral' && currentValence !== 'neutral' && lastValence !== currentValence) {
      shifts++;
    }
    if (currentValence !== 'neutral') {
      lastValence = currentValence;
    }
  }

  // Check for volatility (many shifts)
  if (shifts >= 3) return 'volatile';

  // Check overall trend
  const total = positiveCount + negativeCount;
  if (total === 0) return 'neutral';
  if (positiveCount > negativeCount * 1.5) return 'positive';
  if (negativeCount > positiveCount * 1.5) return 'negative';
  return 'neutral';
}

// ============================================================================
// PROMOTION LOGIC
// ============================================================================

/**
 * Promote important data from STM to Firestore at session end
 *
 * @param sessionId - The session to promote
 * @param userId - User ID for storage
 * @param options - Optional overrides for promotion behavior
 */
export async function promoteSessionToFirestore(
  sessionId: string,
  userId: string,
  options?: Partial<PromotionConfig>
): Promise<PromotionResult> {
  // 🧠 MEMORY AUDIT: Log promotion attempt
  log.info(
    { sessionId, userId },
    '🧠 [MEMORY-AUDIT] promoteSessionToFirestore START'
  );
  
  const activeConfig = { ...config, ...options };
  const result: PromotionResult = {
    entitiesPromoted: 0,
    emotionalArcPromoted: false,
    topicPatternPromoted: false,
    sessionCleaned: false,
  };

  const db = getFirestoreDb();
  if (!db) {
    log.warn({ sessionId, userId, fallbackReason: 'Firestore unavailable' }, '🧠 [MEMORY-AUDIT] Firestore not available, skipping promotion');
    return result;
  }

  const buffer = getSTMBuffer(sessionId, userId);
  if (!buffer || buffer.turns.length === 0) {
    log.info({ sessionId, userId, bufferExists: !!buffer }, '🧠 [MEMORY-AUDIT] No STM data to promote (empty buffer)');
    return result;
  }
  
  // 🧠 MEMORY AUDIT: Log buffer state before promotion
  log.info(
    { 
      sessionId, 
      userId, 
      turnCount: buffer.turns.length,
      entityCount: buffer.entityFrequency.size,
      topicCount: buffer.topicHistory.length,
    },
    '🧠 [MEMORY-AUDIT] STM buffer state before promotion'
  );

  const timestamp = new Date().toISOString();
  const batch = db.batch();

  try {
    // 1. Promote frequent entities
    const frequentEntities = getFrequentEntities(sessionId);
    
    // 🧠 MEMORY AUDIT: Log all entities found in STM
    log.info(
      { 
        sessionId,
        userId,
        frequentEntitiesCount: frequentEntities.length,
        entities: frequentEntities.map(e => ({ name: e.name, count: e.mentionCount })),
        config: { minMentionCount: activeConfig.minMentionCount, minImportanceScore: activeConfig.minImportanceScore },
      },
      '🧠 [MEMORY-AUDIT] Checking entities for promotion'
    );
    
    const entitiesToPromote: PromotedEntity[] = [];

    for (const entity of frequentEntities) {
      if (entitiesToPromote.length >= activeConfig.maxEntitiesPerSession) break;

      const importance = calculateEntityImportance(entity, buffer.turns);
      
      // 🧠 MEMORY AUDIT: Log each entity evaluation
      log.debug(
        { entity: entity.name, mentionCount: entity.mentionCount, importance, minCount: activeConfig.minMentionCount, minImportance: activeConfig.minImportanceScore },
        '🧠 [MEMORY-AUDIT] Evaluating entity for promotion'
      );

      if (entity.mentionCount >= activeConfig.minMentionCount || importance >= activeConfig.minImportanceScore) {
        // Find last context for this entity
        let lastContext = '';
        for (let i = buffer.turns.length - 1; i >= 0; i--) {
          const turn = buffer.turns[i];
          const entityMention = turn.entities.find(
            (e) => e.name.toLowerCase() === entity.name.toLowerCase()
          );
          if (entityMention && entityMention.context) {
            lastContext = entityMention.context;
            break;
          }
        }

        entitiesToPromote.push({
          name: entity.name,
          type: entity.type || 'person',
          mentionCount: entity.mentionCount,
          importance,
          lastContext,
          sessionId,
          promotedAt: timestamp,
        });
      }
    }

    // Write entities to Firestore
    for (const entity of entitiesToPromote) {
      const ref = db
        .collection('bogle_users')
        .doc(userId)
        .collection('promoted_entities')
        .doc();
      batch.set(ref, entity);
    }
    result.entitiesPromoted = entitiesToPromote.length;

    // 2. Promote emotional trajectory
    if (activeConfig.promoteEmotionalTrajectory) {
      const trajectory = getEmotionalTrajectory(sessionId);
      if (trajectory.length >= 3) {
        const emotionalArc: PromotedEmotionalArc = {
          sessionId,
          trajectory: trajectory.map((emotions, i) => ({
            turnNumber: i + 1,
            dominantEmotion: emotions[0]?.emotion || 'neutral',
            intensity: emotions[0]?.intensity || 'low',
          })),
          overallShift: calculateOverallEmotionalShift(trajectory),
          promotedAt: timestamp,
        };

        const arcRef = db
          .collection('bogle_users')
          .doc(userId)
          .collection('emotional_arcs')
          .doc(sessionId);
        batch.set(arcRef, emotionalArc);
        result.emotionalArcPromoted = true;
      }
    }

    // 3. Promote topic patterns
    if (activeConfig.promoteTopicPatterns) {
      const topics = getRecentTopics(sessionId);
      if (topics.length >= 2) {
        // Calculate topic transitions
        const transitions: string[] = [];
        for (let i = 1; i < topics.length && i < 5; i++) {
          transitions.push(`${topics[i]} → ${topics[i - 1]}`);
        }

        const topicPattern: PromotedTopicPattern = {
          sessionId,
          topics: topics.slice(0, 10),
          transitions,
          dominantTopic: topics[0] || 'general',
          promotedAt: timestamp,
        };

        const topicRef = db
          .collection('bogle_users')
          .doc(userId)
          .collection('topic_patterns')
          .doc(sessionId);
        batch.set(topicRef, topicPattern);
        result.topicPatternPromoted = true;
      }
    }

    // Commit all writes
    await batch.commit();

    log.info(
      {
        sessionId,
        userId,
        entitiesPromoted: result.entitiesPromoted,
        emotionalArcPromoted: result.emotionalArcPromoted,
        topicPatternPromoted: result.topicPatternPromoted,
      },
      '📤 Promoted STM to Firestore'
    );

    // 4. Cleanup STM after successful promotion
    cleanupSession(sessionId);
    result.sessionCleaned = true;

    return result;
  } catch (error) {
    log.error({ error: String(error), sessionId, userId }, 'Failed to promote STM to Firestore');
    return result;
  }
}

/**
 * Hook to call at session end
 *
 * This should be called from session cleanup handlers
 */
export async function onSessionEnd(sessionId: string, userId: string): Promise<void> {
  log.info({ sessionId, userId }, '🧠 [MEMORY-AUDIT] onSessionEnd called');
  const result = await promoteSessionToFirestore(sessionId, userId);
  log.info(
    { 
      sessionId, 
      userId, 
      entitiesPromoted: result.entitiesPromoted,
      emotionalArcPromoted: result.emotionalArcPromoted,
      topicPatternPromoted: result.topicPatternPromoted,
      sessionCleaned: result.sessionCleaned,
    },
    '🧠 [MEMORY-AUDIT] onSessionEnd COMPLETE'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { PromotionConfig, PromotionResult, PromotedEntity, PromotedEmotionalArc, PromotedTopicPattern };
