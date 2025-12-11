/**
 * Session Intelligence Orchestrator
 *
 * > "Real-time emotional intelligence within a conversation session."
 *
 * This orchestrator provides **within-session** intelligence capabilities:
 *
 * 1. **Concern Detection** - Know they're struggling before they say it
 * 2. **Proactive Memory** - Remember things a human friend would forget
 * 3. **Predictive Anticipation** - Know what they need before they ask
 *
 * The orchestrator provides a unified intelligence layer that:
 * - Aggregates insights from all three systems
 * - Prioritizes which insights to act on
 * - Generates response modifications
 * - Emits signals to the frontend for avatar EQ
 *
 * **Note:** This is the **session-scoped** intelligence system.
 * For **cross-session** relationship-building features (emotional bonds,
 * inside jokes, temporal patterns), see the `superhuman/` module
 * (BetterThanHumanOrchestrator).
 *
 * @module @ferni/session-intelligence
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';
import {
  getConcernDetectionEngine,
  type BreathingSignals,
  type ConcernDetectionEngine,
  type ConcernState,
  type ProsodySignals,
  type TemporalContext,
} from './concern-detection.js';
import {
  getPredictiveAnticipationEngine,
  type PredictionResult,
  type PredictiveAnticipationEngine,
  type ProsodyInput,
} from './predictive-anticipation.js';
import {
  getProactiveMemoryEngine,
  type ProactiveMemoryEngine,
  type ProactiveMemorySuggestion,
} from './proactive-memory.js';

const logger = createLogger({ module: 'SessionIntelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface SessionIntelligenceContext {
  /** Session ID */
  sessionId: string;

  /** User ID (for cross-session learning) */
  userId?: string;

  /** Current turn count */
  turnCount: number;

  /** User's message */
  userMessage: string;

  /** Detected topic */
  topic?: string;

  /** Detected emotion */
  emotion?: string;

  /** Emotional valence (-1 to 1) */
  valence?: number;

  /** Emotional arousal (0 to 1) */
  arousal?: number;

  /** Prosody signals from voice analysis */
  prosody?: ProsodyInput;

  /** Breathing signals if available */
  breathing?: BreathingSignals;

  /** Was this a vulnerable share? */
  wasVulnerable?: boolean;

  /** Is this the session start? */
  isSessionStart?: boolean;

  /** Previous topics discussed */
  previousTopics?: string[];

  /** Engagement level from scoring */
  engagementLevel?: number;

  /** Response latency */
  responseLatencyMs?: number;
}

export interface SessionIntelligenceInsight {
  /** Overall intelligence confidence (0-1) */
  confidence: number;

  /** Concern state */
  concern: ConcernState;

  /** Proactive memory suggestions */
  memorySuggestions: ProactiveMemorySuggestion[];

  /** Predictions about user state and needs */
  predictions: PredictionResult;

  /** Response modifications */
  responseModifications: ResponseModification[];

  /** Suggested opening (if session start) */
  suggestedOpening?: string;

  /** Overall guidance for the response */
  responseGuidance: ResponseGuidance;
}

export interface ResponseModification {
  /** Type of modification */
  type:
    | 'voice_acknowledgment'
    | 'concern_validation'
    | 'memory_surface'
    | 'need_adaptation'
    | 'pacing_adjustment';

  /** The modification content */
  content: string;

  /** Where to place it */
  placement: 'prefix' | 'suffix' | 'replace_opening';

  /** Priority (higher = more important) */
  priority: number;

  /** Reason for this modification */
  reason: string;
}

export interface ResponseGuidance {
  /** Recommended approach */
  approach:
    | 'normal'
    | 'gentle'
    | 'validate_first'
    | 'hold_space'
    | 'energize'
    | 'slow_down'
    | 'safety_check';

  /** Recommended pacing */
  pacing: 'normal' | 'slower' | 'faster' | 'deliberate';

  /** Recommended energy level */
  energy: 'normal' | 'lower' | 'higher' | 'match_user';

  /** Primary need to address */
  primaryNeed: string;

  /** Specific guidance */
  guidance: string;

  /** Things to avoid */
  avoid: string[];
}

// ============================================================================
// SESSION INTELLIGENCE ORCHESTRATOR
// ============================================================================

export class SessionIntelligenceOrchestrator {
  private sessionId: string;
  private userId?: string;

  private concernEngine: ConcernDetectionEngine;
  private memoryEngine: ProactiveMemoryEngine;
  private anticipationEngine: PredictiveAnticipationEngine;

  constructor(sessionId: string, userId?: string) {
    this.sessionId = sessionId;
    this.userId = userId;

    // Initialize all three engines
    this.concernEngine = getConcernDetectionEngine(sessionId);
    this.memoryEngine = getProactiveMemoryEngine(sessionId);
    this.anticipationEngine = getPredictiveAnticipationEngine(sessionId, userId);

    logger.debug({ sessionId, userId }, '🧠 SessionIntelligence initialized');
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Analyze a user message and get superhuman insights
   * This is the main entry point - call on each turn
   */
  analyze(context: SessionIntelligenceContext): SessionIntelligenceInsight {
    const now = new Date();

    // 1. Run concern detection
    // Convert ProsodyInput to ProsodySignals if provided
    let prosodySignals: ProsodySignals | undefined;
    if (context.prosody) {
      prosodySignals = {
        strain: context.prosody.strain,
        pitchInstability: context.prosody.pitchVariance, // Map variance to instability
        speechRateDeviation: context.prosody.speechRate - 1.0, // Deviation from baseline
        pauseIrregularity: 0, // Not available from ProsodyInput
        tremor: context.prosody.strain > 0.7, // Infer from high strain
        energy: context.prosody.energy,
      };
    }

    const concern = this.concernEngine.analyze(context.userMessage, {
      turnCount: context.turnCount,
      userEmotion: context.emotion,
      engagementLevel: context.engagementLevel,
      responseLatencyMs: context.responseLatencyMs,
      prosody: prosodySignals,
      breathing: context.breathing,
      temporal: {
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
        isLateNight: now.getHours() >= 23 || now.getHours() <= 4,
      } as TemporalContext,
      previousTopics: context.previousTopics,
      currentTopic: context.topic,
    });

    // 2. Capture memory from this message
    this.memoryEngine.captureFromMessage(context.userMessage, {
      topic: context.topic,
      emotion: context.emotion,
      wasVulnerable: context.wasVulnerable,
      turnCount: context.turnCount,
    });

    // 3. Get proactive memory suggestions
    const memorySuggestions = this.memoryEngine.getSuggestions({
      turnCount: context.turnCount,
      currentTopic: context.topic,
      isSessionStart: context.isSessionStart,
      currentHour: now.getHours(),
      currentDayOfWeek: now.getDay(),
    });

    // 4. Run predictive anticipation
    const predictions = this.anticipationEngine.predict(context.userMessage, {
      turnCount: context.turnCount,
      topic: context.topic,
      emotion: context.emotion,
      valence: context.valence,
      arousal: context.arousal,
      prosody: context.prosody,
    });

    // 5. Generate response modifications based on all insights
    const responseModifications = this.generateModifications(
      concern,
      memorySuggestions,
      predictions
    );

    // 6. Generate overall guidance
    const responseGuidance = this.generateGuidance(concern, predictions);

    // 7. Generate opening if session start
    let suggestedOpening: string | undefined;
    if (context.isSessionStart && context.turnCount <= 2) {
      suggestedOpening = this.generateOpening(memorySuggestions, predictions);
    }

    // 8. Emit signals to frontend
    this.emitSignals(concern, predictions);

    // 9. Calculate overall confidence
    const confidence = this.calculateConfidence(concern, predictions);

    const insight: SessionIntelligenceInsight = {
      confidence,
      concern,
      memorySuggestions,
      predictions,
      responseModifications,
      suggestedOpening,
      responseGuidance,
    };

    logger.debug(
      {
        turn: context.turnCount,
        concernLevel: concern.level,
        predictedNeed: predictions.need.primaryNeed,
        modificationCount: responseModifications.length,
        confidence: confidence.toFixed(2),
      },
      '🧠 Session intelligence analysis complete'
    );

    return insight;
  }

  /**
   * Apply response modifications to a draft response
   */
  applyModifications(response: string, insight: SessionIntelligenceInsight): string {
    let result = response;

    // Sort by priority (highest first)
    const sorted = [...insight.responseModifications].sort((a, b) => b.priority - a.priority);

    // Apply max 2 modifications to avoid over-processing
    const toApply = sorted.slice(0, 2);

    for (const mod of toApply) {
      switch (mod.placement) {
        case 'prefix':
          result = `${mod.content} ${result}`;
          break;
        case 'suffix':
          result = `${result} ${mod.content}`;
          break;
        case 'replace_opening': {
          // Replace the first sentence
          const firstSentenceEnd = result.search(/[.!?]\s/) + 1;
          if (firstSentenceEnd > 0) {
            result = `${mod.content} ${result.slice(firstSentenceEnd).trim()}`;
          } else {
            result = `${mod.content} ${result}`;
          }
          break;
        }
      }
    }

    return result;
  }

  /**
   * Get current state for debugging
   */
  getState(): {
    concern: ConcernState;
    predictions: PredictionResult;
    memoryCount: number;
  } {
    return {
      concern: this.concernEngine.getCurrentState(),
      predictions: this.anticipationEngine.predict('', { turnCount: 0 }),
      memoryCount: this.memoryEngine.getAllMemories().length,
    };
  }

  /**
   * Record outcome for learning
   */
  recordOutcome(type: 'concern' | 'memory' | 'prediction', wasHelpful: boolean): void {
    if (type === 'concern' && wasHelpful) {
      this.concernEngine.recordPositiveOutcome();
    }
    if (type === 'prediction') {
      this.anticipationEngine.recordPredictionOutcome('need', wasHelpful);
    }
    logger.debug({ type, wasHelpful }, 'Outcome recorded for learning');
  }

  /**
   * Import cross-session data
   */
  importCrossSessionData(data: {
    memories?: ReturnType<ProactiveMemoryEngine['exportMemories']>;
    patterns?: ReturnType<ProactiveMemoryEngine['exportPatterns']>;
    learning?: ReturnType<PredictiveAnticipationEngine['exportLearning']>;
  }): void {
    if (data.memories) {
      this.memoryEngine.importMemories(data.memories);
    }
    if (data.patterns) {
      this.memoryEngine.importPatterns(data.patterns);
    }
    if (data.learning) {
      this.anticipationEngine.importLearning(data.learning);
    }
    logger.debug('Cross-session data imported');
  }

  /**
   * Export cross-session data for persistence
   */
  exportCrossSessionData(): {
    memories: ReturnType<ProactiveMemoryEngine['exportMemories']>;
    patterns: ReturnType<ProactiveMemoryEngine['exportPatterns']>;
    learning: ReturnType<PredictiveAnticipationEngine['exportLearning']>;
  } {
    return {
      memories: this.memoryEngine.exportMemories(),
      patterns: this.memoryEngine.exportPatterns(),
      learning: this.anticipationEngine.exportLearning(),
    };
  }

  /**
   * Reset for new session (preserves cross-session learning)
   */
  reset(): void {
    this.concernEngine.reset();
    this.memoryEngine.reset();
    this.anticipationEngine.reset();
    logger.debug('SessionIntelligence reset');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private generateModifications(
    concern: ConcernState,
    memorySuggestions: ProactiveMemorySuggestion[],
    predictions: PredictionResult
  ): ResponseModification[] {
    const mods: ResponseModification[] = [];

    // 1. Voice state acknowledgment (if detected with confidence)
    if (predictions.voiceState.acknowledgment && predictions.voiceState.confidence > 0.65) {
      mods.push({
        type: 'voice_acknowledgment',
        content: predictions.voiceState.acknowledgment,
        placement: 'prefix',
        priority: 0.8,
        reason: `Detected ${predictions.voiceState.state} from voice`,
      });
    }

    // 2. Concern validation (if elevated)
    if (concern.level === 'elevated' || concern.level === 'moderate') {
      const validations: Record<string, string[]> = {
        anxiety: ['That sounds really stressful.', 'I can hear this is weighing on you.'],
        sadness: ["That's a lot to carry.", "I'm sorry you're going through this."],
        overwhelm: ['That sounds overwhelming.', "No wonder you're feeling stretched thin."],
        loneliness: ['That sounds isolating.', "It's hard feeling alone in this."],
        exhaustion: ['You sound exhausted.', 'It sounds like you need some rest.'],
        hopelessness: [
          'I hear how hard this is.',
          'When everything feels impossible, just being here is enough.',
        ],
      };

      const phrases = validations[concern.primaryConcern || 'anxiety'] || validations.anxiety;
      mods.push({
        type: 'concern_validation',
        content: phrases[Math.floor(Math.random() * phrases.length)],
        placement: 'prefix',
        priority: concern.level === 'elevated' ? 0.95 : 0.7,
        reason: `${concern.level} ${concern.primaryConcern} detected`,
      });
    }

    // 3. Proactive memory surfacing (if high-priority and not in crisis)
    if (
      memorySuggestions.length > 0 &&
      concern.level !== 'elevated' &&
      concern.level !== 'crisis'
    ) {
      const topSuggestion = memorySuggestions[0];
      if (topSuggestion.priority > 0.6) {
        mods.push({
          type: 'memory_surface',
          content: topSuggestion.phrase,
          placement: topSuggestion.triggerType === 'opening' ? 'replace_opening' : 'suffix',
          priority: topSuggestion.priority,
          reason: topSuggestion.reason,
        });
      }
    }

    // 4. Need adaptation (if high confidence and not redundant with concern)
    if (
      predictions.need.confidence > 0.7 &&
      predictions.need.primaryNeed !== 'unknown' &&
      concern.level === 'none'
    ) {
      const needPrefixes: Record<string, string> = {
        venting: 'I hear you.',
        validation: 'That makes total sense.',
        connection: "I'm here with you.",
        energy: "That's exciting!",
      };

      const prefix = needPrefixes[predictions.need.primaryNeed];
      if (prefix) {
        mods.push({
          type: 'need_adaptation',
          content: prefix,
          placement: 'prefix',
          priority: 0.5,
          reason: `Predicted need: ${predictions.need.primaryNeed}`,
        });
      }
    }

    return mods;
  }

  private generateGuidance(concern: ConcernState, predictions: PredictionResult): ResponseGuidance {
    // Default guidance
    let approach: ResponseGuidance['approach'] = 'normal';
    let pacing: ResponseGuidance['pacing'] = 'normal';
    let energy: ResponseGuidance['energy'] = 'normal';
    const avoid: string[] = [];

    // Concern-based adjustments
    if (concern.level === 'crisis') {
      approach = 'safety_check';
      pacing = 'deliberate';
      energy = 'lower';
      avoid.push('asking questions', 'offering solutions', 'minimizing');
    } else if (concern.level === 'elevated') {
      approach = concern.recommendedApproach === 'hold_space' ? 'hold_space' : 'validate_first';
      pacing = 'slower';
      energy = 'lower';
      avoid.push('rushing', 'unsolicited advice', 'silver linings');
    } else if (concern.level === 'moderate') {
      approach = 'gentle';
      pacing = 'slower';
      avoid.push('excessive enthusiasm', 'changing topic abruptly');
    }

    // Prediction-based adjustments (only if concern is low)
    if (concern.level === 'none' || concern.level === 'mild') {
      if (predictions.emotional.trajectory === 'escalating') {
        pacing = 'slower';
        avoid.push('adding pressure', 'too many questions');
      }

      if (predictions.need.primaryNeed === 'venting') {
        approach = 'gentle';
        avoid.push('offering solutions', 'too many questions');
      } else if (predictions.need.primaryNeed === 'energy') {
        approach = 'energize';
        energy = 'higher';
      } else if (predictions.need.primaryNeed === 'silence') {
        approach = 'hold_space';
        pacing = 'deliberate';
      }

      if (predictions.voiceState.state === 'tired') {
        energy = 'lower';
        pacing = 'slower';
      } else if (predictions.voiceState.state === 'excited') {
        energy = 'match_user';
      }
    }

    // Generate guidance string
    const guidanceParts = [concern.responseGuidance];
    if (predictions.need.confidence > 0.6) {
      guidanceParts.push(predictions.need.responseGuidance);
    }
    if (predictions.emotional.adjustmentSuggestion) {
      guidanceParts.push(predictions.emotional.adjustmentSuggestion.reason);
    }

    return {
      approach,
      pacing,
      energy,
      primaryNeed: predictions.need.primaryNeed,
      guidance: guidanceParts.join(' '),
      avoid,
    };
  }

  private generateOpening(
    memorySuggestions: ProactiveMemorySuggestion[],
    predictions: PredictionResult
  ): string | undefined {
    // Priority 1: Proactive memory (if high priority)
    if (memorySuggestions.length > 0 && memorySuggestions[0].priority > 0.7) {
      return memorySuggestions[0].phrase;
    }

    // Priority 2: Voice state acknowledgment
    if (predictions.voiceState.acknowledgment && predictions.voiceState.confidence > 0.65) {
      return predictions.voiceState.acknowledgment;
    }

    // Priority 3: Topic sequence prompt
    if (predictions.topicSequence?.shouldPrompt && predictions.topicSequence.promptPhrase) {
      return predictions.topicSequence.promptPhrase;
    }

    return undefined;
  }

  private emitSignals(concern: ConcernState, predictions: PredictionResult): void {
    // Emit concern signal
    if (concern.level !== 'none') {
      void humanizationSignalEmitter.concernDetected(
        concern.level,
        concern.primaryConcern || 'unknown',
        concern.recommendedApproach,
        concern.score
      );
    }

    // Emit voice state signal
    if (predictions.voiceState.confidence > 0.6 && predictions.voiceState.state !== 'normal') {
      void humanizationSignalEmitter.voiceStateDetected(
        predictions.voiceState.state,
        predictions.voiceState.confidence
      );
    }

    // Emit need prediction signal
    if (predictions.need.confidence > 0.6 && predictions.need.primaryNeed !== 'unknown') {
      void humanizationSignalEmitter.needPredicted(
        predictions.need.primaryNeed,
        predictions.need.confidence
      );
    }

    // Emit emotional trajectory signal
    if (predictions.emotional.trajectory !== 'stable') {
      void humanizationSignalEmitter.emotionalTrajectory(
        predictions.emotional.trajectory,
        predictions.emotional.confidence
      );
    }
  }

  private calculateConfidence(concern: ConcernState, predictions: PredictionResult): number {
    // Weight different sources
    const weights = {
      concern: 0.3,
      voiceState: 0.2,
      need: 0.3,
      emotional: 0.2,
    };

    return (
      concern.score * weights.concern +
      predictions.voiceState.confidence * weights.voiceState +
      predictions.need.confidence * weights.need +
      predictions.emotional.confidence * weights.emotional
    );
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const instances = new Map<string, SessionIntelligenceOrchestrator>();

export function getSessionIntelligence(
  sessionId: string,
  userId?: string
): SessionIntelligenceOrchestrator {
  const key = `${sessionId}:${userId || 'anonymous'}`;
  if (!instances.has(key)) {
    instances.set(key, new SessionIntelligenceOrchestrator(sessionId, userId));
  }
  return instances.get(key)!;
}

export function resetSessionIntelligence(sessionId: string, userId?: string): void {
  const key = `${sessionId}:${userId || 'anonymous'}`;
  const instance = instances.get(key);
  if (instance) {
    instance.reset();
  }
}

export function clearSessionIntelligence(sessionId: string, userId?: string): void {
  const key = `${sessionId}:${userId || 'anonymous'}`;
  instances.delete(key);
}

export default SessionIntelligenceOrchestrator;
