/**
 * Predictive Intelligence Integration
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Bridges THREE pattern detection systems to create truly superhuman predictions:
 *
 * 1. **coaching-patterns.ts** - Linguistic patterns ("You say 'should' a lot")
 * 2. **predictive-coaching.ts** - Temporal predictions ("Mondays stress you out")
 * 3. **superhuman-observations.ts** - Deep insights ("You deflect with humor")
 *
 * This integration:
 * - Wires all three systems into the conversation flow
 * - Records observations from each turn (via async events for scale)
 * - Generates proactive predictions
 * - Surfaces insights at the right moment
 *
 * SCALING:
 * - Set `useAsyncEvents: true` to emit events for background worker processing
 * - This reduces latency in the turn processor
 * - Events are processed by PredictionsWorker in batches
 *
 * @module agents/integrations/predictive-intelligence-integration
 */

import { createLogger } from '../../utils/safe-logger.js';

// 🧠 TRUE PREDICTIVE INTELLIGENCE: Flush ML state on session end
import { flushUserMLState } from '../../intelligence/predictive/index.js';

// 🧠 BETTER THAN HUMAN v4: Superhuman predictive capabilities
import {
  processTurnForSuperhumanLearning,
  processSessionStart as superhumanSessionStart,
  processSessionEnd as superhumanSessionEnd,
  flushSuperhumanState,
  markSuperhumanDirty,
} from '../../intelligence/predictive/index.js';

// 🧬 EMBEDDING INTELLIGENCE: Vector-powered predictions
import {
  embeddingPersistence,
  conversationTrajectory,
  semanticAvoidance,
  interventionMatching,
  getEmbeddingPredictiveContext,
} from '../../intelligence/predictive/embeddings/index.js';

// Import the three pattern systems
import {
  recordObservation,
  type PatternType,
} from '../../services/superhuman/predictive-coaching.js';
import {
  getSuperhumanObservations,
  type SuperhumanObservationsEngine,
} from '../../services/superhuman/observations.js';
import {
  detectPatternsInTranscript,
  type PatternType as CoachingPatternType,
} from '../../intelligence/coaching-patterns.js';

// Async events for scaled processing
import { AsyncEvents } from '../../services/async-events/index.js';

const log = createLogger({ module: 'predictive-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface TurnObservation {
  userId: string;
  sessionId: string;
  message: string;
  topic: string;
  emotion?: string;
  emotionIntensity?: number;
  voiceStrain?: number;
  dayOfWeek: number;
  hourOfDay: number;
  turnCount: number;
  sessionCount: number;
  relationshipStage?: string;
}

export interface PredictiveIntelligenceResult {
  /** Pattern observations recorded */
  patternsRecorded: number;
  /** Whether a superhuman observation was detected */
  superhumanObservationDetected: boolean;
  /** Content to potentially surface (from observations engine) */
  surfacingContent?: {
    phrase: string;
    timing: 'now' | 'after_response' | 'next_relevant_moment';
  };
}

export interface PredictiveIntelligenceConfig {
  /**
   * Use async events for scaled processing.
   * When true, observations are emitted as events for background worker processing.
   * When false, observations are recorded directly (suitable for single-instance).
   * @default false
   */
  useAsyncEvents: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const config: PredictiveIntelligenceConfig = {
  useAsyncEvents: process.env.PREDICTIONS_USE_ASYNC === 'true',
};

/**
 * Configure predictive intelligence behavior
 */
export function configurePredictiveIntelligence(
  newConfig: Partial<PredictiveIntelligenceConfig>
): void {
  Object.assign(config, newConfig);
  log.info({ config }, '🔮 Predictive intelligence configured');
}

// ============================================================================
// SESSION STATE
// ============================================================================

const sessionEngines = new Map<string, SuperhumanObservationsEngine>();

/**
 * Initialize predictive intelligence for a session
 */
export function initializePredictiveIntelligence(
  sessionId: string,
  userId: string,
  existingObservations?: unknown[],
  sessionData?: { daysSinceLastConversation?: number }
): void {
  // Get or create the superhuman observations engine
  const engine = getSuperhumanObservations(userId, existingObservations as never);
  sessionEngines.set(sessionId, engine);

  // 🧠 BETTER THAN HUMAN v4: Initialize superhuman predictive capabilities
  void superhumanSessionStart(userId, {
    daysSinceLastConversation: sessionData?.daysSinceLastConversation,
  }).catch((err) => {
    log.debug({ error: String(err), userId }, 'Superhuman session start failed (non-fatal)');
  });

  // 🧬 EMBEDDING INTELLIGENCE: Initialize embedding session
  void embeddingPersistence.initializeSession(userId, sessionId).catch((err) => {
    log.debug({ error: String(err), userId }, 'Embedding session start failed (non-fatal)');
  });

  log.debug({ sessionId, userId }, '🔮 Predictive intelligence initialized');
}

/**
 * Cleanup predictive intelligence for a session
 */
export function cleanupPredictiveIntelligence(
  sessionId: string,
  userId?: string,
  sessionSummary?: {
    topicsDiscussed?: string[];
    primaryEmotion?: string;
    satisfactionLevel?: number;
  }
): void {
  sessionEngines.delete(sessionId);

  // 🧠 Flush ML state to Firestore on session end (non-blocking)
  if (userId) {
    void flushUserMLState(userId).catch((err) => {
      log.debug({ error: String(err), userId }, 'ML state flush failed (non-fatal)');
    });

    // 🧠 BETTER THAN HUMAN v4: Process session end and flush superhuman state
    void superhumanSessionEnd(userId, {
      topicsDiscussed: sessionSummary?.topicsDiscussed || [],
      emotionalArc: sessionSummary?.primaryEmotion,
      satisfactionLevel: sessionSummary?.satisfactionLevel,
    }).catch((err) => {
      log.debug({ error: String(err), userId }, 'Superhuman session end failed (non-fatal)');
    });

    // Mark for persistence flush
    markSuperhumanDirty(userId);

    // 🧬 EMBEDDING INTELLIGENCE: Cleanup embedding session
    void embeddingPersistence.cleanupSession(userId, sessionId).catch((err) => {
      log.debug({ error: String(err), userId }, 'Embedding session cleanup failed (non-fatal)');
    });
  }

  log.debug({ sessionId }, '🔮 Predictive intelligence cleaned up');
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Process a turn for predictive intelligence
 *
 * This is the main entry point - call this after each user turn to:
 * 1. Record observations for predictive coaching
 * 2. Analyze message for superhuman observations
 * 3. Check if any insights should be surfaced
 *
 * This is fire-and-forget (doesn't block the turn processing).
 */
export async function processForPredictiveIntelligence(
  observation: TurnObservation
): Promise<PredictiveIntelligenceResult> {
  const {
    userId,
    sessionId,
    message,
    topic,
    emotion,
    emotionIntensity,
    dayOfWeek,
    hourOfDay,
    turnCount,
    sessionCount,
    relationshipStage,
  } = observation;

  let patternsRecorded = 0;
  let superhumanObservationDetected = false;
  let surfacingContent: PredictiveIntelligenceResult['surfacingContent'];

  try {
    // ========================================================================
    // 0. BETTER THAN HUMAN v4 - Superhuman predictive capabilities
    // ========================================================================
    // Fire-and-forget: Feed the 8 superhuman capability systems
    void processTurnForSuperhumanLearning(userId, {
      userMessage: message,
      emotion: emotion
        ? {
            primary: emotion,
            intensity: emotionIntensity,
            valence: emotionIntensity && emotionIntensity > 0.5 ? 'negative' : 'neutral',
          }
        : undefined,
      topic: topic
        ? {
            primary: topic,
            category: topic,
          }
        : undefined,
      conversationContext: {
        turnCount,
        sessionDuration: undefined,
        daysSinceLastConversation: undefined,
      },
    }).catch((err) => {
      log.debug({ error: String(err), userId }, 'Superhuman learning failed (non-fatal)');
    });

    // ========================================================================
    // 0.5. EMBEDDING INTELLIGENCE - Record turn for vector-powered learning
    // ========================================================================
    // Fire-and-forget: Update conversation trajectory and embedding-based learning
    void conversationTrajectory
      .recordTurn(sessionId, {
        text: message,
        speaker: 'user',
        emotionalValence: emotionIntensity
          ? emotion?.includes('positive')
            ? emotionIntensity
            : -emotionIntensity
          : 0,
        topicDepth: undefined, // Will be estimated internally
      })
      .catch((err) => {
        log.debug({ error: String(err), userId }, 'Embedding turn recording failed (non-fatal)');
      });

    // ========================================================================
    // 1. PREDICTIVE COACHING - Record temporal/emotional patterns
    // ========================================================================

    // Detect pattern type from coaching patterns analysis
    const coachingPatterns = detectPatternsInTranscript(message, topic, emotion);

    // SCALING: Use async events for background processing when configured
    if (config.useAsyncEvents) {
      // Emit single event for worker to process in batch
      AsyncEvents.emit(
        'prediction:observation',
        {
          patterns: coachingPatterns.map((p) => ({
            type: mapToPredictiveType(p.type),
            trigger: p.pattern,
            outcome: p.trigger,
          })),
          message,
          topic,
          emotion,
          emotionIntensity,
          dayOfWeek,
          hourOfDay,
        },
        { userId, sessionId }
      );

      patternsRecorded = coachingPatterns.length;

      // Also emit conversation turn for worker
      AsyncEvents.emit(
        'conversation:turn',
        { message, topic, emotion, dayOfWeek, hourOfDay },
        { userId, sessionId }
      );
    } else {
      // DIRECT MODE: Process observations synchronously (single-instance)
      const observationPromises: Array<Promise<void>> = [];

      // Map coaching patterns to predictive coaching observations
      for (const pattern of coachingPatterns) {
        const predictiveType = mapToPredictiveType(pattern.type);

        observationPromises.push(
          recordObservation(userId, {
            type: predictiveType,
            trigger: pattern.pattern,
            outcome: pattern.trigger,
            emotion,
            dayOfWeek,
            hour: hourOfDay,
          })
        );
        patternsRecorded++;
      }

      // Also record temporal patterns even without detected coaching patterns
      // This builds the baseline for day-of-week predictions
      const hasSignificantEmotion =
        emotion !== undefined && emotionIntensity !== undefined && emotionIntensity > 0.5;
      if (hasSignificantEmotion) {
        observationPromises.push(
          recordObservation(userId, {
            type: 'temporal',
            trigger: `${getDayName(dayOfWeek)} ${getTimeOfDay(hourOfDay)}`,
            outcome: `emotional state: ${emotion}`,
            emotion,
            dayOfWeek,
            hour: hourOfDay,
          })
        );
        patternsRecorded++;
      }

      // Record topic-based patterns
      if (topic && topic !== 'general') {
        observationPromises.push(
          recordObservation(userId, {
            type: 'behavioral',
            trigger: topic,
            outcome: emotion ? `triggers ${emotion}` : 'discussed',
            emotion,
            dayOfWeek,
            hour: hourOfDay,
          })
        );
        patternsRecorded++;
      }

      // Execute all observations in parallel
      await Promise.all(observationPromises);
    }

    // ========================================================================
    // 2. SUPERHUMAN OBSERVATIONS - "Only I would notice" patterns
    // ========================================================================

    const engine = sessionEngines.get(sessionId);
    if (engine) {
      // Analyze message for linguistic/behavioral patterns
      engine.analyzeMessage(message);

      // Check if we should surface an observation
      const surfacing = engine.checkForSurfacing({
        turnCount,
        sessionCount,
        relationshipStage: relationshipStage || 'acquaintance',
        currentTopic: topic,
      });

      if (surfacing.shouldSurface && surfacing.phrase) {
        superhumanObservationDetected = true;
        surfacingContent = {
          phrase: surfacing.phrase,
          timing: surfacing.timing || 'after_response',
        };

        log.info(
          { userId, pattern: surfacing.observation?.observation },
          '🔍 Superhuman observation ready to surface'
        );
      }
    }

    log.debug(
      { userId, patternsRecorded, superhumanObservationDetected },
      '🔮 Predictive intelligence processed turn'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Predictive intelligence processing failed');
  }

  return {
    patternsRecorded,
    superhumanObservationDetected,
    surfacingContent,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map coaching pattern types to predictive coaching types
 */
function mapToPredictiveType(coachingType: CoachingPatternType): PatternType {
  const mapping: Record<CoachingPatternType, PatternType> = {
    recurring_topic: 'behavioral',
    deflection_humor: 'emotional',
    deflection_busy: 'behavioral',
    word_repetition: 'behavioral',
    emotional_trigger: 'emotional',
    time_correlation: 'temporal',
    person_correlation: 'relational',
    avoidance: 'behavioral',
  };

  return mapping[coachingType] || 'behavioral';
}

/**
 * Get human-readable day name
 */
function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}

/**
 * Get time of day category
 */
function getTimeOfDay(hour: number): string {
  if (hour < 6) return 'early morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// CONTEXT BUILDER INTEGRATION
// ============================================================================

/**
 * Get predictive context for injection into LLM
 *
 * Call this during context building to get predictions and observations
 * that should guide the agent's response.
 */
export async function getPredictiveContextForTurn(
  userId: string,
  sessionId: string
): Promise<string> {
  const sections: string[] = [];

  try {
    // Get predictions from predictive coaching
    const { generatePredictions, getDayPatterns } =
      await import('../../services/superhuman/predictive-coaching.js');

    const predictions = await generatePredictions(userId);
    const dayPatterns = await getDayPatterns(userId);

    // Add active predictions
    if (predictions.length > 0) {
      sections.push('[PREDICTIVE COACHING - Anticipate their struggles]');
      for (const pred of predictions) {
        sections.push(`• ${pred.prediction}`);
        sections.push(`  → Suggested approach: "${pred.suggestedIntervention}"`);
      }
    }

    // Add day-of-week awareness
    const today = new Date().getDay();
    const todayPatterns = dayPatterns.find((d) => d.dayOfWeek === today);
    if (todayPatterns && todayPatterns.patterns.length > 0) {
      sections.push(`\n[${getDayName(today).toUpperCase()} AWARENESS]`);
      for (const p of todayPatterns.patterns) {
        sections.push(`• ${p.description} (seen ${p.frequency}x)`);
      }
    }

    // Get superhuman observations ready to surface
    const engine = sessionEngines.get(sessionId);
    if (engine) {
      const observations = engine.getObservations();
      const unsurfaced = observations.filter((o) => !o.surfaced && o.confidence > 0.6);

      if (unsurfaced.length > 0) {
        sections.push('\n[SUPERHUMAN OBSERVATIONS - Only you would notice]');
        sections.push('These patterns are ready to surface when the moment is right:');
        for (const obs of unsurfaced.slice(0, 3)) {
          sections.push(`• ${obs.observation} (confidence: ${Math.round(obs.confidence * 100)}%)`);
          sections.push(`  → "${obs.surfacingPhrase}"`);
        }
      }
    }

    // 🧠 BETTER THAN HUMAN v4: Get superhuman predictive context
    try {
      const { getSuperhumanPredictiveContext } =
        await import('../../intelligence/predictive/index.js');
      const superhumanContext = getSuperhumanPredictiveContext(userId, {});
      if (superhumanContext && superhumanContext.length > 0) {
        sections.push('');
        sections.push(superhumanContext);
      }
    } catch (err) {
      log.debug({ error: String(err), userId }, 'Failed to get superhuman predictive context');
    }

    // 🧬 EMBEDDING INTELLIGENCE: Get embedding-powered context
    try {
      const embeddingContext = await getEmbeddingPredictiveContext({
        userId,
        sessionId,
        currentTopic: undefined, // Would need to be passed in
      });
      if (embeddingContext && embeddingContext.length > 0) {
        sections.push('');
        sections.push(embeddingContext);
      }
    } catch (err) {
      log.debug({ error: String(err), userId }, 'Failed to get embedding predictive context');
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to build predictive context');
  }

  return sections.length > 0 ? sections.join('\n') : '';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const predictiveIntelligence = {
  initialize: initializePredictiveIntelligence,
  cleanup: cleanupPredictiveIntelligence,
  processTurn: processForPredictiveIntelligence,
  getContext: getPredictiveContextForTurn,
};

export default predictiveIntelligence;
