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
  | 'disengagement';

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
function getExpressionForEmotion(
  emotion: string,
  intensity: number
): LuxoExpressionId {
  const candidates = EMOTION_TO_EXPRESSION[emotion] || ['neutral'];

  // Select expression based on intensity
  // Higher intensity = more expressive variant
  const index = Math.min(
    Math.floor(intensity * candidates.length),
    candidates.length - 1
  );

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
  const {
    expression,
    emotion,
    intensity = 0.7,
    duration = 300,
    hold = 0,
    concernLevel,
  } = options;

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
    await dispatchExpressionUpdate(
      { emotion: primary, intensity, duration: 300 },
      sendDataMessage
    );
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default dispatchEmotionEvents;
