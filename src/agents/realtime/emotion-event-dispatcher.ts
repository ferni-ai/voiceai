/**
 * Emotion Event Dispatcher
 *
 * Dispatches humanization signals to the frontend based on emotional state analysis.
 * This is the CRITICAL bridge that enables "Better Than Human" emotional intelligence by:
 *
 * 1. Dispatching concern detection events when distress is detected
 * 2. Dispatching voice-text mismatch signals (protective_instinct)
 * 3. Dispatching emotional trajectory signals (spontaneous_delight, etc.)
 *
 * The frontend EQ system (better-than-human.ui.ts) listens for these events
 * and triggers appropriate avatar responses (micro-expressions, concern mode, etc.)
 *
 * @module EmotionEventDispatcher
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EmotionEventDispatcher' });

// ============================================================================
// TYPES
// ============================================================================

// Import the canonical EmotionalState from processors to avoid duplicate exports
import type { EmotionalState } from '../processors/types.js';

/**
 * Mismatch result from voice-text analysis
 */
export interface MismatchResult {
  hasMismatch: boolean;
  type: string;
  confidence: number;
  voiceEmotion?: string;
  textEmotion?: string;
  guidance?: string;
}

/**
 * Extended emotional state that includes mismatch data
 */
export type EmotionalStateWithMismatch = EmotionalState & {
  mismatch?: MismatchResult;
};

/**
 * Options for dispatching emotion events
 */
export interface EmotionDispatchOptions {
  emotionalState: EmotionalStateWithMismatch;
  userId: string;
  personaId: string;
  sessionId?: string;
}

/**
 * Humanization signal types that match frontend expectations
 * @see apps/web/src/services/humanization-bridge.service.ts
 */
export type HumanizationSignalType =
  | 'concern_detected'
  | 'voice_state_detected'
  | 'emotional_trajectory'
  | 'vulnerability'
  | 'breakthrough'
  | 'high_engagement'
  | 'disengagement'
  // ============================================================================
  // BETTER THAN HUMAN SIGNALS (10 superhuman capabilities)
  // These trigger frontend micro-expressions and avatar behaviors
  // ============================================================================
  | 'emotional_bond_deepen' // Relationship strengthening detected
  | 'protective_instinct' // Sensing user vulnerability, voice-text mismatch
  | 'spontaneous_delight' // User shares joy/achievement
  | 'inside_joke_callback' // Referencing shared humor from memory
  | 'superhuman_observation' // Pattern surfacing ("I've noticed over weeks...")
  | 'visible_vulnerability' // Ferni expressing uncertainty/doubt (humanizing)
  | 'temporal_insight' // Cross-session comparison ("Last month you...")
  | 'meta_relationship_moment' // Commentary on the relationship itself
  | 'somatic_presence' // Breathing/settling/grounding cues
  | 'anticipatory_presence'; // Time-of-day awareness (2am check-in, Monday blues)

/**
 * Humanization signal payload
 */
export interface HumanizationSignal {
  type: 'humanization_signal';
  signalType: HumanizationSignalType;
  intensity?: number;
  concernLevel?: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';
  concernType?: string;
  voiceState?: string;
  emotionalTrajectory?: string;
  mismatchType?: string;
  timestamp: number;
  // BTH-specific payload fields
  observationType?: 'pattern' | 'correlation' | 'temporal' | 'insight';
  observationContent?: string;
  memoryReference?: string;
  relationshipContext?: string;
  timeContext?: 'late_night' | 'early_morning' | 'weekend' | 'monday' | 'evening';
  vulnerabilityType?: 'uncertainty' | 'admission' | 'reflection' | 'growth';
  somaticType?: 'breathing' | 'settling' | 'grounding' | 'pause';
}

/**
 * Function to send data message (passed from voice-agent context)
 */
export type SendDataMessageFn = (type: string, payload: Record<string, unknown>) => Promise<void>;

// ============================================================================
// CONCERN LEVEL DETECTION
// ============================================================================

/**
 * Map distress level to concern level
 */
function getConcernLevel(
  distressLevel: number
): 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis' {
  if (distressLevel >= 0.9) return 'crisis';
  if (distressLevel >= 0.7) return 'elevated';
  if (distressLevel >= 0.5) return 'moderate';
  if (distressLevel >= 0.3) return 'mild';
  return 'none';
}

/**
 * Get concern type from emotional state
 */
function getConcernType(emotionalState: EmotionalStateWithMismatch): string | undefined {
  const { primary, distressLevel } = emotionalState;

  if (distressLevel < 0.3) return undefined;

  // Map emotions to concern types
  const concernMap: Record<string, string> = {
    sad: 'sadness',
    anxious: 'anxiety',
    stressed: 'stress',
    overwhelmed: 'overwhelm',
    frustrated: 'frustration',
    angry: 'anger',
    fearful: 'fear',
    lonely: 'loneliness',
  };

  return concernMap[primary] || 'distress';
}

// ============================================================================
// MAIN DISPATCHER
// ============================================================================

/**
 * Dispatch emotion events to the frontend based on emotional state analysis.
 *
 * This function analyzes the emotional state from turn processing and sends
 * appropriate humanization signals to the frontend EQ system.
 *
 * @param options - Emotional state and context
 * @param sendDataMessage - Function to send data message to frontend
 */
export async function dispatchEmotionEvents(
  options: EmotionDispatchOptions,
  sendDataMessage: SendDataMessageFn
): Promise<void> {
  const { emotionalState, userId, personaId } = options;
  const { distressLevel, trajectory, mismatch, primary, intensity } = emotionalState;

  try {
    // ========================================================================
    // 1. CONCERN DETECTION - "Better Than Human" distress awareness
    // ========================================================================
    const concernLevel = getConcernLevel(distressLevel);

    if (concernLevel !== 'none') {
      const concernType = getConcernType(emotionalState);

      await sendDataMessage('humanization_signal', {
        signalType: 'concern_detected',
        concernLevel,
        concernType,
        intensity: distressLevel,
        timestamp: Date.now(),
      });

      log.debug(
        { userId, concernLevel, concernType },
        '🚀 Dispatched concern detection to frontend'
      );
    }

    // ========================================================================
    // 2. VOICE-TEXT MISMATCH - "Protective Instinct" detection
    // ========================================================================
    if (mismatch?.hasMismatch && mismatch.confidence > 0.5) {
      // Frontend expects this as part of concern detection
      // The mismatch triggers protective_instinct mode
      await sendDataMessage('humanization_signal', {
        signalType: 'voice_state_detected',
        voiceState: mismatch.type, // e.g., 'masking_negative', 'suppressing_emotion'
        intensity: mismatch.confidence,
        mismatchType: mismatch.type,
        // Include concern data if also distressed
        concernLevel: concernLevel !== 'none' ? concernLevel : undefined,
        timestamp: Date.now(),
      });

      log.debug(
        { userId, mismatchType: mismatch.type, confidence: mismatch.confidence },
        '🚀 Dispatched voice-text mismatch to frontend'
      );
    }

    // ========================================================================
    // 3. EMOTIONAL TRAJECTORY - Track emotional arc changes
    // ========================================================================
    // Map backend trajectory to frontend expectations:
    // - improving → de_escalating (things are calming down)
    // - declining → escalating (emotional intensity rising)
    // - volatile → volatile (high variability)
    if (trajectory === 'improving' && intensity > 0.6) {
      // User's mood is lifting - support the calming
      await sendDataMessage('humanization_signal', {
        signalType: 'emotional_trajectory',
        emotionalTrajectory: 'de_escalating',
        intensity,
        timestamp: Date.now(),
      });

      log.debug({ userId, trajectory }, '🚀 Dispatched positive trajectory signal');
    } else if (trajectory === 'declining' && intensity > 0.5) {
      // User's mood is declining - increase empathy mode
      await sendDataMessage('humanization_signal', {
        signalType: 'emotional_trajectory',
        emotionalTrajectory: 'escalating',
        intensity,
        concernLevel: concernLevel !== 'none' ? concernLevel : 'mild',
        timestamp: Date.now(),
      });

      log.debug({ userId, trajectory }, '🚀 Dispatched declining trajectory signal');
    } else if (trajectory === 'volatile') {
      // Emotional volatility - extra sensitivity needed
      await sendDataMessage('humanization_signal', {
        signalType: 'emotional_trajectory',
        emotionalTrajectory: 'volatile',
        intensity,
        timestamp: Date.now(),
      });

      log.debug({ userId, trajectory }, '🚀 Dispatched volatile trajectory signal');
    }

    // ========================================================================
    // 4. HIGH ENGAGEMENT DETECTION - User is really into conversation
    // ========================================================================
    if (primary === 'excited' && intensity > 0.7) {
      await sendDataMessage('humanization_signal', {
        signalType: 'high_engagement',
        intensity,
        timestamp: Date.now(),
      });

      log.debug({ userId, intensity }, '🚀 Dispatched high engagement signal');
    }
  } catch (error) {
    // Non-critical - log and continue
    log.warn({ error: String(error), userId, personaId }, 'Emotion event dispatch failed');
  }
}

// ============================================================================
// HOLISTIC NLU EVENT DISPATCH
// Maps holistic context (relationship, emotion, crisis) to avatar expressions
// ============================================================================

import type { HolisticContextSummary } from '../../tools/semantic-router/types.js';

/**
 * Options for dispatching holistic NLU events
 */
export interface HolisticDispatchOptions {
  holisticContext: HolisticContextSummary;
  userId: string;
  personaId: string;
  sessionId?: string;
}

/**
 * Map holistic emotion types to frontend signal types
 */
function mapEmotionToSignal(
  emotionType: string | undefined,
  sentiment: string
): { signalType: HumanizationSignalType; intensity: number } | null {
  // Crisis is highest priority
  if (sentiment === 'crisis') {
    return { signalType: 'concern_detected', intensity: 1.0 };
  }

  // Map negative emotions to concern detection
  const concernEmotions: Record<string, number> = {
    stressed: 0.6,
    anxious: 0.7,
    overwhelmed: 0.8,
    sad: 0.6,
    grieving: 0.7,
    scared: 0.7,
    ashamed: 0.5,
    exhausted: 0.6,
  };

  if (emotionType && concernEmotions[emotionType]) {
    return {
      signalType: 'concern_detected',
      intensity: concernEmotions[emotionType],
    };
  }

  // Map positive emotions to high engagement
  const positiveEmotions = ['happy', 'excited', 'loving', 'anticipating', 'curious'];
  if (emotionType && positiveEmotions.includes(emotionType)) {
    return { signalType: 'high_engagement', intensity: 0.7 };
  }

  return null;
}

/**
 * Map holistic relationship to signal type
 */
function mapRelationshipToSignal(
  relationshipType: string | undefined,
  relationshipSentiment: string | undefined
): { signalType: HumanizationSignalType; intensity: number } | null {
  // Personal relationships trigger emotional bond signals
  if (relationshipSentiment === 'personal') {
    const familyRelations = ['family_immediate', 'family_extended', 'romantic'];
    if (relationshipType && familyRelations.includes(relationshipType)) {
      return { signalType: 'emotional_trajectory', intensity: 0.7 };
    }
    if (relationshipType === 'friends') {
      return { signalType: 'emotional_trajectory', intensity: 0.5 };
    }
  }

  return null;
}

/**
 * Dispatch holistic NLU events to the frontend for avatar expressions.
 *
 * This function bridges the semantic router's holistic context analysis
 * with the frontend EQ system, enabling:
 * - Micro-expressions based on detected relationships (warmth for family)
 * - Concern mode for detected stress/anxiety/crisis
 * - Engagement signals for positive emotions
 *
 * Called BEFORE the LLM runs, enabling anticipatory avatar responses.
 *
 * @param options - Holistic context and session info
 * @param sendDataMessage - Function to send data message to frontend
 */
export async function dispatchHolisticEvents(
  options: HolisticDispatchOptions,
  sendDataMessage: SendDataMessageFn
): Promise<void> {
  const { holisticContext, userId, personaId } = options;
  const {
    emotionType,
    sentiment,
    isCrisis,
    urgency,
    relationshipType,
    relationshipSentiment,
    isCompoundIntent,
  } = holisticContext;

  try {
    // ========================================================================
    // 1. CRISIS DETECTION - Highest priority, immediate response
    // ========================================================================
    if (isCrisis || sentiment === 'crisis' || urgency === 'critical') {
      await sendDataMessage('humanization_signal', {
        signalType: 'concern_detected',
        concernLevel: 'crisis',
        concernType: emotionType || 'crisis',
        intensity: 1.0,
        timestamp: Date.now(),
        source: 'holistic_nlu',
      });

      log.info(
        { userId, emotionType, urgency },
        '🚨 HOLISTIC: Crisis signal dispatched to frontend'
      );
      return; // Crisis takes precedence, don't send other signals
    }

    // ========================================================================
    // 2. EMOTIONAL STATE - Map to concern or engagement signals
    // ========================================================================
    const emotionSignal = mapEmotionToSignal(emotionType, sentiment);
    if (emotionSignal) {
      const concernLevel =
        emotionSignal.intensity >= 0.7
          ? 'elevated'
          : emotionSignal.intensity >= 0.5
            ? 'moderate'
            : 'mild';

      await sendDataMessage('humanization_signal', {
        signalType: emotionSignal.signalType,
        concernLevel: emotionSignal.signalType === 'concern_detected' ? concernLevel : undefined,
        concernType: emotionType,
        intensity: emotionSignal.intensity,
        timestamp: Date.now(),
        source: 'holistic_nlu',
      });

      log.debug(
        { userId, emotionType, signalType: emotionSignal.signalType },
        '🧠 HOLISTIC: Emotion signal dispatched'
      );
    }

    // ========================================================================
    // 3. RELATIONSHIP DETECTION - Warm avatar for personal relationships
    // ========================================================================
    const relationshipSignal = mapRelationshipToSignal(relationshipType, relationshipSentiment);
    if (relationshipSignal) {
      await sendDataMessage('humanization_signal', {
        signalType: relationshipSignal.signalType,
        emotionalTrajectory: 'deepening', // Relationship warmth
        intensity: relationshipSignal.intensity,
        timestamp: Date.now(),
        source: 'holistic_nlu',
        relationshipType,
      });

      log.debug(
        { userId, relationshipType, relationshipSentiment },
        '💞 HOLISTIC: Relationship warmth signal dispatched'
      );
    }

    // ========================================================================
    // 4. COMPOUND INTENT - Active listening for complex queries
    // ========================================================================
    if (isCompoundIntent) {
      await sendDataMessage('humanization_signal', {
        signalType: 'high_engagement',
        intensity: 0.6,
        timestamp: Date.now(),
        source: 'holistic_nlu',
        reason: 'compound_intent',
      });

      log.debug({ userId }, '🎯 HOLISTIC: Compound intent - active listening triggered');
    }
  } catch (error) {
    // Non-critical - log and continue
    log.warn({ error: String(error), userId, personaId }, 'Holistic event dispatch failed');
  }
}

// ============================================================================
// EXPRESSION UPDATE DISPATCH (Luxo 100+ Expression System)
// ============================================================================

/**
 * Luxo expression IDs available for dispatch.
 * These map directly to design-system/tokens/expressions.json
 *
 * @see design-system/tokens/expressions.json for full list
 * @see apps/web/src/ui/luxo-expressions.ui.ts for frontend handler
 */
export type LuxoExpressionId =
  // Core
  | 'neutral'
  | 'listening'
  | 'speaking'
  // Happy family
  | 'happy'
  | 'joyful'
  | 'delighted'
  | 'amused'
  | 'pleased'
  | 'content'
  | 'excited'
  | 'grateful'
  | 'proud'
  // Warmth family
  | 'warm'
  | 'caring'
  | 'loving'
  | 'tender'
  | 'supportive'
  | 'compassionate'
  | 'empathetic'
  | 'nurturing'
  // Thinking family
  | 'thinking'
  | 'pondering'
  | 'contemplating'
  | 'focused'
  | 'processing'
  | 'reflecting'
  | 'analyzing'
  // Presence family
  | 'present'
  | 'grounded'
  | 'calm'
  | 'serene'
  | 'peaceful'
  // Coaching family
  | 'encouraging'
  | 'cheering'
  | 'guiding'
  | 'wise'
  | 'knowing'
  // Concern family
  | 'concerned'
  | 'worried'
  | 'sympathetic'
  | 'understanding'
  | 'comforting'
  // Playful family
  | 'playful'
  | 'mischievous'
  // Listening family
  | 'interested'
  // Other common expressions
  | 'curious'
  | 'surprised'
  | 'attentive'
  | 'determined'
  | 'confident';

/**
 * Expression update payload for frontend
 */
export interface ExpressionUpdatePayload {
  type: 'expression_update';
  expression: LuxoExpressionId;
  intensity?: number;
  duration?: number;
  hold?: number;
  timestamp: number;
}

/**
 * Map emotional states to appropriate Luxo expressions.
 *
 * This is the core mapping that converts backend emotional analysis
 * to specific avatar expressions from the 100+ expression system.
 */
const EMOTION_TO_EXPRESSION: Record<string, LuxoExpressionId[]> = {
  // Positive emotions
  happy: ['happy', 'joyful', 'pleased'],
  excited: ['excited', 'delighted', 'joyful'],
  grateful: ['grateful', 'warm', 'tender'],
  loving: ['loving', 'tender', 'warm'],
  hopeful: ['encouraging', 'warm', 'supportive'],
  proud: ['proud', 'confident', 'pleased'],
  curious: ['curious', 'attentive', 'interested'],
  amused: ['amused', 'playful', 'delighted'],

  // Contemplative states
  thoughtful: ['contemplating', 'reflecting', 'pondering'],
  processing: ['processing', 'thinking', 'focused'],
  calm: ['calm', 'serene', 'peaceful'],

  // Concern/distress states (respond with empathy)
  sad: ['concerned', 'sympathetic', 'comforting'],
  anxious: ['supportive', 'calm', 'grounded'],
  stressed: ['understanding', 'supportive', 'calm'],
  frustrated: ['understanding', 'calm', 'supportive'],
  overwhelmed: ['comforting', 'supportive', 'calm'],
  fearful: ['comforting', 'supportive', 'warm'],
  lonely: ['warm', 'compassionate', 'nurturing'],

  // Neutral states
  neutral: ['neutral', 'present', 'listening'],
};

/**
 * Map concern levels to appropriate expressions
 */
const CONCERN_LEVEL_TO_EXPRESSION: Record<string, LuxoExpressionId> = {
  crisis: 'comforting',
  elevated: 'concerned',
  moderate: 'sympathetic',
  mild: 'attentive',
  none: 'present',
};

/**
 * Get appropriate expression for emotional state.
 *
 * @param emotion - Primary emotion detected
 * @param intensity - Emotion intensity (0-1)
 * @returns Expression ID to use
 */
function getExpressionForEmotion(emotion: string, intensity: number): LuxoExpressionId {
  const candidates = EMOTION_TO_EXPRESSION[emotion] || ['neutral'];

  // Select expression based on intensity
  // Higher intensity = more expressive variant
  const index = Math.min(Math.floor(intensity * candidates.length), candidates.length - 1);

  return candidates[index];
}

/**
 * Options for dispatching expression updates
 */
export interface ExpressionDispatchOptions {
  expression?: LuxoExpressionId;
  emotion?: string;
  intensity?: number;
  duration?: number;
  hold?: number;
  concernLevel?: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';
}

/**
 * Dispatch an expression update to the frontend.
 *
 * This is the MAIN function for setting avatar expressions from the backend.
 * It sends an `expression_update` message to the frontend which sets the
 * Luxo expression directly.
 *
 * USAGE:
 * ```typescript
 * // Direct expression
 * await dispatchExpressionUpdate(
 *   { expression: 'joyful', duration: 400 },
 *   sendDataMessage
 * );
 *
 * // From detected emotion
 * await dispatchExpressionUpdate(
 *   { emotion: 'happy', intensity: 0.8 },
 *   sendDataMessage
 * );
 *
 * // From concern level
 * await dispatchExpressionUpdate(
 *   { concernLevel: 'elevated' },
 *   sendDataMessage
 * );
 * ```
 *
 * @param options - Expression options
 * @param sendDataMessage - Function to send data message to frontend
 */
export async function dispatchExpressionUpdate(
  options: ExpressionDispatchOptions,
  sendDataMessage: SendDataMessageFn
): Promise<void> {
  const { expression, emotion, intensity = 0.7, duration = 300, hold = 0, concernLevel } = options;

  // Determine expression to use
  let expressionToUse: LuxoExpressionId;

  if (expression) {
    // Direct expression specified
    expressionToUse = expression;
  } else if (concernLevel && concernLevel !== 'none') {
    // Map concern level to expression
    expressionToUse = CONCERN_LEVEL_TO_EXPRESSION[concernLevel];
  } else if (emotion) {
    // Map emotion to expression
    expressionToUse = getExpressionForEmotion(emotion, intensity);
  } else {
    // Default to neutral
    expressionToUse = 'neutral';
  }

  try {
    await sendDataMessage('expression_update', {
      expression: expressionToUse,
      intensity,
      duration,
      hold,
      timestamp: Date.now(),
    });

    log.debug(
      { expression: expressionToUse, intensity, duration },
      '🎭 Expression update dispatched to frontend'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Expression update dispatch failed');
  }
}

/**
 * Dispatch expression based on emotional state (convenience function).
 *
 * Combines humanization signal + expression update for complete
 * avatar emotional response.
 *
 * @param options - Emotion dispatch options
 * @param sendDataMessage - Function to send data message to frontend
 */
export async function dispatchEmotionWithExpression(
  options: EmotionDispatchOptions,
  sendDataMessage: SendDataMessageFn
): Promise<void> {
  // First dispatch humanization signals
  await dispatchEmotionEvents(options, sendDataMessage);

  // Then dispatch corresponding expression update
  const { emotionalState } = options;
  const { primary, intensity, distressLevel } = emotionalState;

  // If distressed, use concern-based expression
  if (distressLevel > 0.3) {
    const concernLevel = getConcernLevel(distressLevel);
    await dispatchExpressionUpdate(
      { concernLevel, intensity: distressLevel, duration: 400 },
      sendDataMessage
    );
  } else {
    // Use emotion-based expression
    await dispatchExpressionUpdate({ emotion: primary, intensity, duration: 300 }, sendDataMessage);
  }
}

// ============================================================================
// BETTER THAN HUMAN SIGNAL DISPATCHERS
// These are the 10 superhuman capabilities that make Ferni truly "Better Than Human"
// ============================================================================

/**
 * Micro-expression type for quick avatar responses
 */
export type MicroExpressionType =
  // Connection
  | 'recognition'
  | 'memory_spark'
  | 'insider'
  | 'interest_flash'
  | 'curious_lean'
  | 'curiosity'
  // Concern & Care
  | 'concern_flash'
  | 'protective'
  | 'noticing'
  // Positive
  | 'delight_flash'
  | 'pride_flash'
  | 'warmth_pulse'
  // Understanding
  | 'understanding'
  | 'validation'
  | 'aha_flash'
  // Life Coaching
  | 'hope_holding'
  | 'steady_presence'
  | 'courage_support'
  | 'rest_permission'
  | 'transition_witness'
  | 'comeback_recognition';

/**
 * Dispatch a micro-expression to the frontend avatar.
 * Micro-expressions are subliminal (40-150ms) emotional flashes.
 *
 * @param expressionType - The type of micro-expression to trigger
 * @param sendDataMessage - Function to send data message to frontend
 * @param intensity - Expression intensity (0-1), defaults to 0.7
 */
export async function dispatchMicroExpression(
  expressionType: MicroExpressionType,
  sendDataMessage: SendDataMessageFn,
  intensity = 0.7
): Promise<void> {
  try {
    await sendDataMessage('micro_expression', {
      expressionType,
      intensity,
      timestamp: Date.now(),
    });

    log.debug({ expressionType, intensity }, '✨ Micro-expression dispatched to frontend');
  } catch (error) {
    log.warn({ error: String(error), expressionType }, 'Micro-expression dispatch failed');
  }
}

/**
 * 1. EMOTIONAL BOND DEEPEN - Relationship strengthening detected
 *
 * Trigger when: User expresses gratitude, shares vulnerable moment, or conversation
 * reaches new level of intimacy.
 */
export async function dispatchEmotionalBondDeepen(
  sendDataMessage: SendDataMessageFn,
  context: { trigger: string; intensity?: number; relationshipContext?: string }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'emotional_bond_deepen',
      intensity: context.intensity ?? 0.7,
      relationshipContext: context.relationshipContext,
      timestamp: Date.now(),
    });

    log.debug({ trigger: context.trigger }, '💞 BTH: Emotional bond deepen signal dispatched');
  } catch (error) {
    log.warn({ error: String(error) }, 'emotional_bond_deepen dispatch failed');
  }
}

/**
 * 2. PROTECTIVE INSTINCT - Sensing user vulnerability
 *
 * Trigger when: Voice-text mismatch detected (saying "I'm fine" with sad voice),
 * or detecting user hiding distress.
 */
export async function dispatchProtectiveInstinct(
  sendDataMessage: SendDataMessageFn,
  context: { mismatchType?: string; voiceEmotion?: string; textEmotion?: string; intensity?: number }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'protective_instinct',
      intensity: context.intensity ?? 0.8,
      mismatchType: context.mismatchType,
      voiceState: context.voiceEmotion,
      timestamp: Date.now(),
    });

    log.debug({ mismatchType: context.mismatchType }, '🛡️ BTH: Protective instinct signal dispatched');
  } catch (error) {
    log.warn({ error: String(error) }, 'protective_instinct dispatch failed');
  }
}

/**
 * 3. SPONTANEOUS DELIGHT - User shares joy/achievement
 *
 * Trigger when: User shares good news, achievement, or happy event.
 */
export async function dispatchSpontaneousDelight(
  sendDataMessage: SendDataMessageFn,
  context: { trigger: string; intensity?: number }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'spontaneous_delight',
      intensity: context.intensity ?? 0.85,
      timestamp: Date.now(),
    });

    // Also trigger delight_flash micro-expression
    await dispatchMicroExpression('delight_flash', sendDataMessage, context.intensity ?? 0.85);

    log.debug({ trigger: context.trigger }, '🎉 BTH: Spontaneous delight signal dispatched');
  } catch (error) {
    log.warn({ error: String(error) }, 'spontaneous_delight dispatch failed');
  }
}

/**
 * 4. INSIDE JOKE CALLBACK - Referencing shared humor from memory
 *
 * Trigger when: Memory system detects reference to previous funny moment or inside joke.
 */
export async function dispatchInsideJokeCallback(
  sendDataMessage: SendDataMessageFn,
  context: { memoryReference: string; intensity?: number }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'inside_joke_callback',
      intensity: context.intensity ?? 0.75,
      memoryReference: context.memoryReference,
      timestamp: Date.now(),
    });

    // Also trigger insider micro-expression
    await dispatchMicroExpression('insider', sendDataMessage, context.intensity ?? 0.75);

    log.debug({ memoryReference: context.memoryReference }, '😄 BTH: Inside joke callback dispatched');
  } catch (error) {
    log.warn({ error: String(error) }, 'inside_joke_callback dispatch failed');
  }
}

/**
 * 5. SUPERHUMAN OBSERVATION - Pattern surfacing from cross-session analysis
 *
 * Trigger when: System detects pattern across multiple conversations
 * (e.g., "I've noticed over the past 3 weeks, your energy dips on Mondays...")
 */
export async function dispatchSuperhumanObservation(
  sendDataMessage: SendDataMessageFn,
  context: {
    observationType: 'pattern' | 'correlation' | 'temporal' | 'insight';
    observationContent: string;
    intensity?: number;
  }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'superhuman_observation',
      intensity: context.intensity ?? 0.9,
      observationType: context.observationType,
      observationContent: context.observationContent,
      timestamp: Date.now(),
    });

    // Also trigger noticing micro-expression
    await dispatchMicroExpression('noticing', sendDataMessage, context.intensity ?? 0.9);

    log.debug(
      { observationType: context.observationType },
      '🔮 BTH: Superhuman observation signal dispatched'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'superhuman_observation dispatch failed');
  }
}

/**
 * 6. VISIBLE VULNERABILITY - Ferni expressing uncertainty/doubt
 *
 * Trigger when: LLM output contains expressions of uncertainty like
 * "I'm not sure...", "I might be wrong...", "I realize I don't know..."
 * This humanizes Ferni by showing they're not a perfect know-it-all.
 */
export async function dispatchVisibleVulnerability(
  sendDataMessage: SendDataMessageFn,
  context: {
    vulnerabilityType: 'uncertainty' | 'admission' | 'reflection' | 'growth';
    intensity?: number;
  }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'visible_vulnerability',
      intensity: context.intensity ?? 0.6,
      vulnerabilityType: context.vulnerabilityType,
      timestamp: Date.now(),
    });

    log.debug(
      { vulnerabilityType: context.vulnerabilityType },
      '🌱 BTH: Visible vulnerability signal dispatched'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'visible_vulnerability dispatch failed');
  }
}

/**
 * 7. TEMPORAL INSIGHT - Cross-session comparison
 *
 * Trigger when: Ferni references past sessions with temporal context
 * (e.g., "Last month you mentioned...", "Remember when we talked about...")
 */
export async function dispatchTemporalInsight(
  sendDataMessage: SendDataMessageFn,
  context: { memoryReference: string; timeSpan?: string; intensity?: number }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'temporal_insight',
      intensity: context.intensity ?? 0.8,
      memoryReference: context.memoryReference,
      timestamp: Date.now(),
    });

    // Also trigger memory_spark micro-expression
    await dispatchMicroExpression('memory_spark', sendDataMessage, context.intensity ?? 0.8);

    log.debug({ memoryReference: context.memoryReference }, '⏳ BTH: Temporal insight dispatched');
  } catch (error) {
    log.warn({ error: String(error) }, 'temporal_insight dispatch failed');
  }
}

/**
 * 8. META RELATIONSHIP MOMENT - Commentary on the relationship itself
 *
 * Trigger when: Ferni's response includes meta-commentary about the relationship
 * (e.g., "I really value how open you've become with me...")
 */
export async function dispatchMetaRelationshipMoment(
  sendDataMessage: SendDataMessageFn,
  context: { relationshipContext: string; intensity?: number }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'meta_relationship_moment',
      intensity: context.intensity ?? 0.75,
      relationshipContext: context.relationshipContext,
      timestamp: Date.now(),
    });

    // Also trigger warmth_pulse micro-expression
    await dispatchMicroExpression('warmth_pulse', sendDataMessage, context.intensity ?? 0.75);

    log.debug(
      { relationshipContext: context.relationshipContext },
      '💝 BTH: Meta relationship moment dispatched'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'meta_relationship_moment dispatch failed');
  }
}

/**
 * 9. SOMATIC PRESENCE - Breathing/settling/grounding cues
 *
 * Trigger when: Avatar should show physical grounding behaviors
 * (deep breath, settling, pause for presence).
 */
export async function dispatchSomaticPresence(
  sendDataMessage: SendDataMessageFn,
  context: { somaticType: 'breathing' | 'settling' | 'grounding' | 'pause'; intensity?: number }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'somatic_presence',
      intensity: context.intensity ?? 0.6,
      somaticType: context.somaticType,
      timestamp: Date.now(),
    });

    // Also trigger steady_presence micro-expression
    await dispatchMicroExpression('steady_presence', sendDataMessage, context.intensity ?? 0.6);

    log.debug({ somaticType: context.somaticType }, '🧘 BTH: Somatic presence signal dispatched');
  } catch (error) {
    log.warn({ error: String(error) }, 'somatic_presence dispatch failed');
  }
}

/**
 * 10. ANTICIPATORY PRESENCE - Time-of-day awareness
 *
 * Trigger when: Session context detects meaningful time context
 * (2am late-night check-in, Monday blues, early morning, etc.)
 */
export async function dispatchAnticipatoryPresence(
  sendDataMessage: SendDataMessageFn,
  context: {
    timeContext: 'late_night' | 'early_morning' | 'weekend' | 'monday' | 'evening';
    intensity?: number;
  }
): Promise<void> {
  try {
    await sendDataMessage('humanization_signal', {
      signalType: 'anticipatory_presence',
      intensity: context.intensity ?? 0.7,
      timeContext: context.timeContext,
      timestamp: Date.now(),
    });

    log.debug({ timeContext: context.timeContext }, '🌙 BTH: Anticipatory presence signal dispatched');
  } catch (error) {
    log.warn({ error: String(error) }, 'anticipatory_presence dispatch failed');
  }
}

// ============================================================================
// BTH SIGNAL DETECTION HELPERS
// These help detect when to trigger BTH signals from conversation content
// ============================================================================

/**
 * Patterns that indicate user is sharing good news/achievement
 */
const DELIGHT_PATTERNS = [
  /i got (the|a) (job|promotion|raise|offer)/i,
  /i (passed|aced|nailed|crushed) (the|my)/i,
  /we('re| are) (pregnant|having a baby|engaged|getting married)/i,
  /i('m| am) so (happy|excited|thrilled|proud)/i,
  /guess what[!?]/i,
  /great news/i,
  /can('t| not) believe it/i,
];

/**
 * Patterns that indicate sarcasm or frustration (false delight)
 * These should NOT trigger delight response
 */
const SARCASM_PATTERNS = [
  /great,? (another|more|just what)/i, // "Great, another problem"
  /oh (great|wonderful|perfect),? (so|now)/i, // "Oh great, so now..."
  /just (great|wonderful|perfect)/i, // "Just great" (often sarcastic)
  /(yeah|sure),? (that's )?(great|wonderful)/i, // "Yeah, that's great" (dismissive)
  /how (great|wonderful|fantastic)\.{3}/i, // "How wonderful..." (sarcastic ellipsis)
];

/**
 * Patterns indicating user is discussing someone else's news (third-person)
 */
const THIRD_PERSON_PATTERNS = [
  /\b(he|she|they|my (friend|sister|brother|mom|dad|boss|coworker))\b.*(got|got a|passed|aced)/i,
  /\b(his|her|their)\b.*(promotion|job|raise|offer)/i,
  /\bdid you (hear|know) (about|that)\b/i, // Often leads to others' news
];

/**
 * Patterns that indicate vulnerability expression (Ferni's output)
 */
const VULNERABILITY_PATTERNS = [
  /i('m| am) not (sure|certain)/i,
  /i (might|may|could) be wrong/i,
  /i (don't|do not) (know|have all the answers)/i,
  /i('m| am) still (learning|figuring)/i,
  /honestly,? i('m| am) (not sure|uncertain)/i,
  /i realize i/i,
  /that('s| is) a good question.* i/i,
];

/**
 * Patterns that indicate meta-relationship commentary
 */
const META_RELATIONSHIP_PATTERNS = [
  /i (really )?(appreciate|value|love) (how|that|when)/i, // More flexible - matches "I appreciate how open..."
  /our (conversations?|relationship|friendship|time together)/i,
  /i('ve| have) (noticed|seen) (how|that) you('ve| have)/i,
  /you('ve| have) (come|grown|changed) (so|a long) (far|way|much)/i,
  /i feel (close|connected|honored) to/i,
];

/**
 * Patterns that indicate temporal insight (memory reference)
 */
const TEMPORAL_PATTERNS = [
  /remember (when|that time|how)/i,
  /(last|a few) (week|month|year)s?( ago| back)?( you)?/i, // More flexible - matches "Last month you..."
  /the (first|last) time (we|you)/i,
  /back (when|in)/i,
  /you (mentioned|said|told me) (earlier|before|last time)/i,
];

/**
 * Detect if user message contains delight/achievement (simple version)
 * @deprecated Use detectUserDelightWithContext for better accuracy
 */
export function detectUserDelight(userMessage: string): boolean {
  return DELIGHT_PATTERNS.some((pattern) => pattern.test(userMessage));
}

/**
 * Context-aware delight detection result
 */
export interface DelightDetectionResult {
  detected: boolean;
  confidence: number;
  /** Reason detection was rejected (if not detected) */
  rejectionReason?: 'sarcasm' | 'third_person' | 'negative_context' | 'no_match';
  /** The specific trigger pattern that matched */
  trigger?: string;
}

/**
 * Context-aware delight detection
 * Filters out sarcasm, third-person references, and negative emotional context
 *
 * @param userMessage - The user's message
 * @param emotionalContext - Optional emotional context from turn analysis
 * @returns Detection result with confidence and reasoning
 */
export function detectUserDelightWithContext(
  userMessage: string,
  emotionalContext?: { sentiment?: 'positive' | 'negative' | 'neutral'; intensity?: number }
): DelightDetectionResult {
  // Check for sarcasm patterns first (high priority rejection)
  if (SARCASM_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return {
      detected: false,
      confidence: 0,
      rejectionReason: 'sarcasm',
    };
  }

  // Check for third-person patterns (they're discussing someone else's news)
  if (THIRD_PERSON_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return {
      detected: false,
      confidence: 0,
      rejectionReason: 'third_person',
    };
  }

  // Check for negative emotional context from turn analysis
  if (emotionalContext?.sentiment === 'negative' && (emotionalContext.intensity ?? 0) > 0.6) {
    return {
      detected: false,
      confidence: 0,
      rejectionReason: 'negative_context',
    };
  }

  // Check for positive delight patterns
  for (const pattern of DELIGHT_PATTERNS) {
    if (pattern.test(userMessage)) {
      // Calculate confidence based on pattern strength and context
      let confidence = 0.8;

      // Boost confidence for explicit first-person achievements
      if (/\bi\b/i.test(userMessage)) {
        confidence += 0.1;
      }

      // Boost confidence for exclamation marks (genuine excitement)
      if (userMessage.includes('!')) {
        confidence += 0.05;
      }

      // Boost confidence for positive emotional context
      if (emotionalContext?.sentiment === 'positive') {
        confidence += 0.05;
      }

      return {
        detected: true,
        confidence: Math.min(confidence, 1.0),
        trigger: pattern.source,
      };
    }
  }

  return {
    detected: false,
    confidence: 0,
    rejectionReason: 'no_match',
  };
}

/**
 * Detect if Ferni's response contains vulnerability expression
 * @deprecated Use detectVulnerabilityWithContext for topic-aware detection
 */
export function detectVulnerabilityInResponse(ferniResponse: string): {
  detected: boolean;
  type: 'uncertainty' | 'admission' | 'reflection' | 'growth';
} {
  for (const pattern of VULNERABILITY_PATTERNS) {
    if (pattern.test(ferniResponse)) {
      // Categorize the type
      if (/not (sure|certain)|might be wrong/i.test(ferniResponse)) {
        return { detected: true, type: 'uncertainty' };
      }
      if (/don't (know|have)/i.test(ferniResponse)) {
        return { detected: true, type: 'admission' };
      }
      if (/realize|still (learning|figuring)/i.test(ferniResponse)) {
        return { detected: true, type: 'reflection' };
      }
      return { detected: true, type: 'growth' };
    }
  }
  return { detected: false, type: 'uncertainty' };
}

/**
 * Patterns indicating technical/factual context where vulnerability shouldn't trigger
 * These are "I don't know" statements about technical things, not emotional/philosophical
 */
const TECHNICAL_CONTEXT_PATTERNS = [
  /i('m| am) not sure (how|what) (the|this|that) (api|code|function|method|syntax)/i,
  /i don't (know|have) (the|that) (api|code|documentation|spec)/i,
  /technically|implementation|configuration|syntax|parameter/i,
  /let me (check|look that up|find out)/i, // Informational not emotional
  /i('ll| will) need to (look|check|verify)/i,
];

/**
 * Patterns indicating emotional/philosophical context where vulnerability should trigger
 * These represent genuine emotional uncertainty that humanizes Ferni
 */
const EMOTIONAL_VULNERABILITY_PATTERNS = [
  /i('m| am) not sure (what|how) (you|to help you|to support|the best way)/i,
  /i don't (have|know) all the answers (when it comes to|about|for) (life|feelings|emotions|relationships)/i,
  /this (is|feels) (hard|difficult) (to|for) (me|even) (to )?know/i,
  /honestly,? (i'm|i am) (unsure|uncertain) (how|what) (you|to)/i,
  /i (might|may) be wrong (about|on) this,? but/i,
  /i realize (i|that i) (don't|may not) (fully )?understand/i,
];

/**
 * Context-aware vulnerability detection result
 */
export interface VulnerabilityDetectionResult {
  detected: boolean;
  type: 'uncertainty' | 'admission' | 'reflection' | 'growth';
  confidence: number;
  /** Whether this is emotional vulnerability (vs technical uncertainty) */
  isEmotional: boolean;
  /** Reason for rejection if not detected */
  rejectionReason?: 'technical_context' | 'no_match';
}

/**
 * Context-aware vulnerability detection
 * Distinguishes between technical "I don't know" (ignore) and emotional vulnerability (trigger)
 *
 * @param ferniResponse - Ferni's response to analyze
 * @param userTopic - The topic the user was asking about (optional, for context)
 * @returns Detection result with type and context
 */
export function detectVulnerabilityWithContext(
  ferniResponse: string,
  userTopic?: string
): VulnerabilityDetectionResult {
  // Check for technical context first (should NOT trigger vulnerability)
  const isTechnicalContext =
    TECHNICAL_CONTEXT_PATTERNS.some((p) => p.test(ferniResponse)) ||
    (userTopic && /(api|code|bug|error|config|setup|install|deploy)/i.test(userTopic));

  if (isTechnicalContext) {
    // Check if there's ALSO emotional vulnerability layered in
    const hasEmotionalVulnerability = EMOTIONAL_VULNERABILITY_PATTERNS.some((p) => p.test(ferniResponse));
    if (!hasEmotionalVulnerability) {
      return {
        detected: false,
        type: 'uncertainty',
        confidence: 0,
        isEmotional: false,
        rejectionReason: 'technical_context',
      };
    }
  }

  // Check for emotional vulnerability patterns (high priority)
  if (EMOTIONAL_VULNERABILITY_PATTERNS.some((p) => p.test(ferniResponse))) {
    const type = categorizeVulnerabilityType(ferniResponse);
    return {
      detected: true,
      type,
      confidence: 0.9,
      isEmotional: true,
    };
  }

  // Fall back to standard vulnerability patterns
  for (const pattern of VULNERABILITY_PATTERNS) {
    if (pattern.test(ferniResponse)) {
      const type = categorizeVulnerabilityType(ferniResponse);
      return {
        detected: true,
        type,
        confidence: 0.7,
        isEmotional: !isTechnicalContext,
      };
    }
  }

  return {
    detected: false,
    type: 'uncertainty',
    confidence: 0,
    isEmotional: false,
    rejectionReason: 'no_match',
  };
}

/**
 * Helper to categorize vulnerability type
 */
function categorizeVulnerabilityType(
  response: string
): 'uncertainty' | 'admission' | 'reflection' | 'growth' {
  if (/not (sure|certain)|might be wrong/i.test(response)) {
    return 'uncertainty';
  }
  if (/don't (know|have)/i.test(response)) {
    return 'admission';
  }
  if (/realize|still (learning|figuring)/i.test(response)) {
    return 'reflection';
  }
  return 'growth';
}

/**
 * Detect if Ferni's response contains meta-relationship commentary
 */
export function detectMetaRelationship(ferniResponse: string): boolean {
  return META_RELATIONSHIP_PATTERNS.some((pattern) => pattern.test(ferniResponse));
}

/**
 * Detect if Ferni's response contains temporal insight
 */
export function detectTemporalInsight(ferniResponse: string): boolean {
  return TEMPORAL_PATTERNS.some((pattern) => pattern.test(ferniResponse));
}

/**
 * Get appropriate time context for anticipatory presence
 */
export function getTimeContext(): 'late_night' | 'early_morning' | 'weekend' | 'monday' | 'evening' | null {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Late night: 11pm - 4am
  if (hour >= 23 || hour < 4) return 'late_night';

  // Early morning: 4am - 6am
  if (hour >= 4 && hour < 6) return 'early_morning';

  // Weekend (Saturday=6, Sunday=0)
  if (day === 0 || day === 6) return 'weekend';

  // Monday
  if (day === 1 && hour < 12) return 'monday';

  // Evening: 6pm - 10pm
  if (hour >= 18 && hour < 22) return 'evening';

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default dispatchEmotionEvents;
