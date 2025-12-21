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

// Import the three pattern systems
import {
  recordObservation,
  type PatternType,
} from '../../services/superhuman/predictive-coaching.js';
import {
  getSuperhumanObservations,
  type SuperhumanObservationsEngine,
} from '../../conversation/superhuman/superhuman-observations.js';
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
  existingObservations?: unknown[]
): void {
  // Get or create the superhuman observations engine
  const engine = getSuperhumanObservations(userId, existingObservations as never);
  sessionEngines.set(sessionId, engine);

  log.debug({ sessionId, userId }, '🔮 Predictive intelligence initialized');
}

/**
 * Cleanup predictive intelligence for a session
 */
export function cleanupPredictiveIntelligence(sessionId: string): void {
  sessionEngines.delete(sessionId);
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
