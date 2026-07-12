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

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { emitInfraEvent } from '../../utils/infra-events.js';
import { createLogger } from '../../utils/safe-logger.js';
import { extractHumanSignals } from '../human-signal-extractor.js';
import { persistHumanSignals } from '../human-signal-persistence.js';
import {
  cleanupSession,
  getEmotionalTrajectory,
  getFrequentEntities,
  getRecentTopics,
  getSTMBuffer,
  getVoiceEmotionTrajectory,
  type EntityFrequency,
  type TurnMemory,
  type VoiceEmotionSnapshot,
} from './stm-buffer.js';

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
 * Track sessions currently being promoted to prevent race conditions.
 * Key: sessionId, Value: Promise that resolves when promotion completes
 */
const promotionInProgress = new Map<string, Promise<PromotionResult>>();

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
    /** Voice-derived emotion when available */
    voiceEmotion?: VoiceEmotionSnapshot;
  }>;
  overallShift: 'positive' | 'negative' | 'neutral' | 'volatile';
  /** Voice-based emotional shift across the session */
  voiceTrajectory?: 'positive' | 'negative' | 'neutral' | 'volatile';
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

function calculateEntityImportance(entity: EntityFrequency, turns: TurnMemory[]): number {
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
  const negativeEmotions = [
    'sad',
    'angry',
    'anxious',
    'stressed',
    'frustrated',
    'negative',
    'fear',
  ];

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

    if (
      lastValence !== 'neutral' &&
      currentValence !== 'neutral' &&
      lastValence !== currentValence
    ) {
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

/**
 * Compute voice-based emotional shift from valence/arousal trajectory.
 */
function calculateVoiceTrajectoryShift(
  voiceTrajectory: Array<VoiceEmotionSnapshot & { turnNumber: number }>
): 'positive' | 'negative' | 'neutral' | 'volatile' {
  if (voiceTrajectory.length < 2) return 'neutral';

  let positiveCount = 0;
  let negativeCount = 0;
  let shifts = 0;
  let lastValence: 'positive' | 'negative' | 'neutral' = 'neutral';

  for (const snap of voiceTrajectory) {
    let currentValence: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (snap.valence > 0.2) {
      positiveCount++;
      currentValence = 'positive';
    } else if (snap.valence < -0.2) {
      negativeCount++;
      currentValence = 'negative';
    }

    if (
      lastValence !== 'neutral' &&
      currentValence !== 'neutral' &&
      lastValence !== currentValence
    ) {
      shifts++;
    }
    if (currentValence !== 'neutral') {
      lastValence = currentValence;
    }
  }

  if (shifts >= 3) return 'volatile';
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
  // Check if promotion is already in progress for this session
  const existing = promotionInProgress.get(sessionId);
  if (existing) {
    log.debug(
      { sessionId, userId },
      '🧠 [MEMORY-AUDIT] Promotion already in progress, awaiting existing'
    );
    return existing;
  }

  // Start promotion and track it
  const promotionPromise = doPromoteSessionToFirestore(sessionId, userId, options);
  promotionInProgress.set(sessionId, promotionPromise);

  try {
    return await promotionPromise;
  } finally {
    // Clean up tracking after completion
    promotionInProgress.delete(sessionId);
  }
}

/**
 * Internal promotion logic - separated to allow proper lock tracking
 */
async function doPromoteSessionToFirestore(
  sessionId: string,
  userId: string,
  options?: Partial<PromotionConfig>
): Promise<PromotionResult> {
  // 🧠 MEMORY AUDIT: Log promotion attempt
  log.info({ sessionId, userId }, '🧠 [MEMORY-AUDIT] promoteSessionToFirestore START');

  const activeConfig = { ...config, ...options };
  const result: PromotionResult = {
    entitiesPromoted: 0,
    emotionalArcPromoted: false,
    topicPatternPromoted: false,
    sessionCleaned: false,
  };

  const db = getFirestoreDb();
  if (!db) {
    log.warn(
      { sessionId, userId, fallbackReason: 'Firestore unavailable' },
      '🧠 [MEMORY-AUDIT] Firestore not available, skipping promotion'
    );
    // Emit event for observability (services layer can subscribe)
    emitInfraEvent('firestore:fallback', {
      service: 'stm-promotion',
      reason: 'Firestore unavailable',
    });
    return result;
  }

  const buffer = getSTMBuffer(sessionId, userId);
  if (!buffer || buffer.turns.length === 0) {
    log.info(
      { sessionId, userId, bufferExists: !!buffer },
      '🧠 [MEMORY-AUDIT] No STM data to promote (empty buffer)'
    );
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
        entities: frequentEntities.map((e) => ({ name: e.name, count: e.mentionCount })),
        config: {
          minMentionCount: activeConfig.minMentionCount,
          minImportanceScore: activeConfig.minImportanceScore,
        },
      },
      '🧠 [MEMORY-AUDIT] Checking entities for promotion'
    );

    const entitiesToPromote: PromotedEntity[] = [];

    for (const entity of frequentEntities) {
      if (entitiesToPromote.length >= activeConfig.maxEntitiesPerSession) break;

      const importance = calculateEntityImportance(entity, buffer.turns);

      // 🧠 MEMORY AUDIT: Log each entity evaluation
      log.debug(
        {
          entity: entity.name,
          mentionCount: entity.mentionCount,
          importance,
          minCount: activeConfig.minMentionCount,
          minImportance: activeConfig.minImportanceScore,
        },
        '🧠 [MEMORY-AUDIT] Evaluating entity for promotion'
      );

      if (
        entity.mentionCount >= activeConfig.minMentionCount ||
        importance >= activeConfig.minImportanceScore
      ) {
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
      const ref = db.collection('bogle_users').doc(userId).collection('promoted_entities').doc();
      batch.set(ref, entity);
    }
    result.entitiesPromoted = entitiesToPromote.length;

    // 2. Promote emotional trajectory (text + voice)
    if (activeConfig.promoteEmotionalTrajectory) {
      const trajectory = getEmotionalTrajectory(sessionId);
      const voiceTrajectory = getVoiceEmotionTrajectory(sessionId);
      if (trajectory.length >= 3) {
        const voiceByTurn = new Map(voiceTrajectory.map((v) => [v.turnNumber, v]));
        const emotionalArc: PromotedEmotionalArc = {
          sessionId,
          trajectory: trajectory.map((emotions, i) => {
            const turnNum = i + 1;
            const voice = voiceByTurn.get(turnNum);
            return {
              turnNumber: turnNum,
              dominantEmotion: emotions[0]?.emotion || 'neutral',
              intensity: emotions[0]?.intensity || 'low',
              ...(voice && {
                voiceEmotion: {
                  primary: voice.primary,
                  confidence: voice.confidence,
                  stressLevel: voice.stressLevel,
                  valence: voice.valence,
                  arousal: voice.arousal,
                },
              }),
            };
          }),
          overallShift: calculateOverallEmotionalShift(trajectory),
          voiceTrajectory:
            voiceTrajectory.length >= 2
              ? calculateVoiceTrajectoryShift(voiceTrajectory)
              : undefined,
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

    // Emit success event for observability
    emitInfraEvent('memory:promotion', {
      userId,
      entitiesPromoted: result.entitiesPromoted,
      sessionId,
    });
    emitInfraEvent('firestore:success', { service: 'stm-promotion' });

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
 * Extract and persist human signals while STM buffer still has turns.
 * MUST run before cleanupSession — otherwise getSTMBuffer returns empty.
 */
async function extractAndPersistHumanSignals(sessionId: string, userId: string): Promise<void> {
  try {
    const buffer = getSTMBuffer(sessionId, userId);
    if (!buffer || buffer.turns.length === 0) {
      return;
    }

    const turns = buffer.turns.map((turn) => ({
      role: 'user' as const,
      content: turn.transcript || '',
      timestamp: new Date(turn.timestamp),
    }));

    const personaId = buffer.turns[0]?.personaId || 'ferni';
    const signals = extractHumanSignals(turns, {
      userId,
      personaId,
    });

    const signalCount =
      signals.importantDates.length +
      signals.values.length +
      signals.dreams.length +
      signals.fears.length +
      signals.growthMarkers.length +
      signals.challenges.length +
      signals.comfortPatterns.length +
      signals.stressTriggers.length +
      signals.avoidances.length +
      signals.insideJokes.length;

    if (signalCount > 0) {
      const persistResult = await persistHumanSignals(userId, signals, { sessionId });

      log.info(
        {
          sessionId,
          userId,
          signalCount,
          persisted: persistResult.persisted,
          success: persistResult.success,
        },
        '💾 [BTH] Human signals extracted and persisted'
      );
    } else {
      log.debug({ sessionId, userId }, '🧠 [BTH] No human signals detected in session');
    }
  } catch (humanSignalErr) {
    log.error(
      { sessionId, userId, error: String(humanSignalErr) },
      '❌ [BTH] Failed to extract/persist human signals'
    );
  }
}

/**
 * Bridge frequent STM entities into shared cross-persona memory.
 * MUST run before cleanupSession — needs getSTMBuffer / getFrequentEntities.
 */
async function bridgeCrossPersonaEntities(sessionId: string, userId: string): Promise<void> {
  try {
    const { storeMemory, PERSONA_MEMORY_INTERESTS } =
      await import('../cross-persona/shared-memory-api.js');
    const buffer = getSTMBuffer(sessionId, userId);
    const personaId = (buffer?.turns[0]?.personaId || 'ferni') as
      | 'ferni'
      | 'peter'
      | 'maya'
      | 'jordan'
      | 'alex'
      | 'nayan';

    const frequentEntities = getFrequentEntities(sessionId, 10);
    let sharedCount = 0;
    for (const entity of frequentEntities) {
      if (entity.mentionCount < 2) continue;
      const category = entity.type === 'person' ? ('entity' as const) : ('fact' as const);
      const relevantPersonas = Object.entries(PERSONA_MEMORY_INTERESTS)
        .filter(([, interests]) => interests.includes(category))
        .map(([id]) => id) as (typeof personaId)[];

      await storeMemory({
        userId,
        content: `${entity.name} (${entity.type}): mentioned ${entity.mentionCount}x. ${entity.contexts.slice(0, 2).join('; ')}`,
        category,
        capturedBy: personaId,
        emotionalWeight: Math.min(entity.mentionCount / 10, 1),
        confidence: 0.8,
        relevantToPersonas: relevantPersonas,
      });
      sharedCount++;
    }

    if (sharedCount > 0) {
      log.info(
        { sessionId, userId, sharedCount, personaId },
        '🤝 [CROSS-PERSONA] Bridged promoted entities to shared memory'
      );
    }
  } catch (crossPersonaErr) {
    log.warn(
      { sessionId, userId, error: String(crossPersonaErr) },
      'Cross-persona memory bridge failed (non-critical)'
    );
  }
}

/**
 * Hook to call at session end
 *
 * This should be called from session cleanup handlers.
 * Order is critical: buffer-dependent work BEFORE promoteSessionToFirestore
 * (which calls cleanupSession and wipes STM).
 */
export async function onSessionEnd(sessionId: string, userId: string): Promise<void> {
  log.info({ sessionId, userId }, '🧠 [MEMORY-AUDIT] onSessionEnd called');

  // 1–2. Buffer-dependent work FIRST (cleanup happens inside promote)
  await extractAndPersistHumanSignals(sessionId, userId);
  await bridgeCrossPersonaEntities(sessionId, userId);

  // 3. Promote entities/arcs/topics, then cleanup STM
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
    '🧠 [MEMORY] onSessionEnd COMPLETE'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  PromotedEmotionalArc,
  PromotedEntity,
  PromotedTopicPattern,
  PromotionConfig,
  PromotionResult,
};
