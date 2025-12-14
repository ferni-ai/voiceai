/**
 * Sesame-Inspired Pipeline Integration
 *
 * Optimizes the emotion detection → SSML pipeline by:
 * 1. Processing anticipatory signals during partial transcripts (not after)
 * 2. Pre-computing prosody adjustments before TTS
 * 3. Caching micro-reaction decisions to reduce response latency
 * 4. Integrating all Sesame features into a single, fast call path
 *
 * @module speech/sesame-inspired/pipeline-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';
import type {
  AnticipatedResponse,
  ConversationProsodyRecommendation,
  DisfluencyInjection,
  MicroReaction,
  PartialTranscript,
} from './types.js';
import {
  anticipateResponse,
  shouldAnticipate,
  updateAnticipation,
} from './anticipatory-prosody.js';
import {
  getSessionProsodyRecommendation,
  updateConversationState,
} from './conversation-prosody.js';
import { getSessionMicroReaction } from './micro-reactions.js';
import { smartInjectDisfluency } from './rich-disfluencies.js';

const log = createLogger({ module: 'SesamePipelineIntegration' });

// =============================================================================
// TYPES
// =============================================================================

/**
 * Pre-computed response preparation from partial transcript
 */
export interface PreparedResponse {
  /** Anticipated emotion from partial transcript */
  anticipatedEmotion: CartesiaEmotion | null;
  /** Opening micro-reaction SSML */
  microReactionSsml: string | null;
  /** Speed adjustment */
  speedMultiplier: number;
  /** Volume adjustment */
  volumeMultiplier: number;
  /** Pause multiplier for context */
  pauseMultiplier: number;
  /** Should use softer delivery? */
  softerDelivery: boolean;
  /** Confidence in anticipation (0-1) */
  confidence: number;
  /** Reason for adjustments */
  reason: string;
  /** Timestamp of preparation */
  preparedAt: number;
}

/**
 * Enhanced text result with all Sesame features applied
 */
export interface SesameEnhancedResult {
  /** Original text */
  original: string;
  /** Enhanced text with SSML */
  enhanced: string;
  /** Features applied */
  features: string[];
  /** Processing time in ms */
  processingMs: number;
}

// =============================================================================
// SESSION STATE
// =============================================================================

interface SessionState {
  lastPreparedResponse: PreparedResponse | null;
  turnCount: number;
  lastPartialText: string;
  processingPartial: boolean;
}

const sessions = new Map<string, SessionState>();

function getSession(sessionId: string): SessionState {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      lastPreparedResponse: null,
      turnCount: 0,
      lastPartialText: '',
      processingPartial: false,
    });
  }
  return sessions.get(sessionId)!;
}

// =============================================================================
// PARTIAL TRANSCRIPT PROCESSING (ANTICIPATORY - CALL THIS DURING SPEECH)
// =============================================================================

/**
 * Process partial transcript to prepare response prosody in advance
 *
 * CALL THIS DURING USER SPEECH, NOT AFTER!
 * This is what makes Sesame-style anticipatory response possible.
 *
 * @param sessionId - Session ID
 * @param partial - Partial transcript from STT
 * @returns Prepared response parameters
 */
export function processPartialTranscript(
  sessionId: string,
  partial: PartialTranscript
): PreparedResponse | null {
  const session = getSession(sessionId);

  // Don't reprocess the same text
  if (partial.text === session.lastPartialText) {
    return session.lastPreparedResponse;
  }
  session.lastPartialText = partial.text;

  // Check if we should anticipate yet
  if (!shouldAnticipate(partial)) {
    return null;
  }

  // Mark as processing to prevent redundant calls
  if (session.processingPartial) {
    return session.lastPreparedResponse;
  }
  session.processingPartial = true;

  try {
    // Anticipate emotional response
    const anticipation = anticipateResponse(partial);
    updateAnticipation(sessionId, partial, anticipation);

    // Get conversation-aware prosody adjustments
    const prosody = getSessionProsodyRecommendation(sessionId);

    // Prepare micro-reaction (may return null based on rate limiting)
    const microReaction = prosody.includeMicroReactions
      ? getSessionMicroReaction(sessionId, partial.text)
      : null;

    // Combine anticipation with conversation prosody
    const prepared: PreparedResponse = {
      anticipatedEmotion: anticipation.emotion,
      microReactionSsml: microReaction?.ssml ?? anticipation.openingReaction ?? null,
      speedMultiplier: combineSpeed(anticipation.speed, prosody.baseSpeed),
      volumeMultiplier: combineVolume(anticipation.volume, prosody.baseVolume),
      pauseMultiplier: prosody.pauseMultiplier,
      softerDelivery: prosody.softerDelivery,
      confidence: anticipation.confidence,
      reason: `${anticipation.reason}; ${prosody.reason}`,
      preparedAt: Date.now(),
    };

    session.lastPreparedResponse = prepared;

    log.debug(
      {
        sessionId,
        anticipatedEmotion: prepared.anticipatedEmotion,
        hasMicroReaction: !!prepared.microReactionSsml,
        confidence: prepared.confidence.toFixed(2),
      },
      'Prepared anticipatory response'
    );

    return prepared;
  } finally {
    session.processingPartial = false;
  }
}

/**
 * Get the last prepared response (use when generating TTS)
 */
export function getPreparedResponse(sessionId: string): PreparedResponse | null {
  const session = sessions.get(sessionId);
  return session?.lastPreparedResponse ?? null;
}

// =============================================================================
// RESPONSE ENHANCEMENT (CALL THIS BEFORE TTS)
// =============================================================================

/**
 * Enhance response text with all Sesame-inspired features
 *
 * Call this BEFORE sending to TTS. It uses pre-computed anticipatory
 * data when available for faster processing.
 *
 * @param sessionId - Session ID
 * @param text - Response text from LLM
 * @param detectedEmotion - Detected emotion (from content or voice)
 * @param turnNumber - Current turn number
 * @returns Enhanced text with SSML
 */
export function enhanceResponseWithSesame(
  sessionId: string,
  text: string,
  detectedEmotion: CartesiaEmotion,
  turnNumber: number
): SesameEnhancedResult {
  const startTime = Date.now();
  const session = getSession(sessionId);
  session.turnCount = turnNumber;

  const features: string[] = [];
  let enhanced = text;

  // Update conversation state for future turns
  updateConversationState(sessionId, detectedEmotion);

  // Get prepared response (from anticipatory processing)
  const prepared = session.lastPreparedResponse;
  const isStale = prepared && Date.now() - prepared.preparedAt > 5000;

  // 1. Prepend micro-reaction if available and fresh
  if (prepared?.microReactionSsml && !isStale) {
    enhanced = prepared.microReactionSsml + enhanced;
    features.push('micro_reaction');
  }

  // 2. Apply speed/volume adjustments from anticipation or conversation prosody
  const prosody = getSessionProsodyRecommendation(sessionId);

  if (prepared && !isStale && prepared.confidence > 0.5) {
    // Use anticipated prosody (higher confidence = used anticipatory data)
    if (prepared.speedMultiplier !== 1.0) {
      enhanced = `<speed ratio="${prepared.speedMultiplier.toFixed(2)}"/>${enhanced}`;
      features.push('anticipated_speed');
    }
    if (prepared.volumeMultiplier !== 1.0) {
      enhanced = `<volume ratio="${prepared.volumeMultiplier.toFixed(2)}"/>${enhanced}`;
      features.push('anticipated_volume');
    }
  } else {
    // Fall back to conversation prosody
    if (prosody.baseSpeed !== 1.0) {
      enhanced = `<speed ratio="${prosody.baseSpeed.toFixed(2)}"/>${enhanced}`;
      features.push('conversation_speed');
    }
    if (prosody.baseVolume !== 1.0) {
      enhanced = `<volume ratio="${prosody.baseVolume.toFixed(2)}"/>${enhanced}`;
      features.push('conversation_volume');
    }
  }

  // 3. Add contextual pause if needed
  if (prosody.pauseMultiplier > 1.2 && !enhanced.includes('<break')) {
    const pauseMs = Math.round(100 * prosody.pauseMultiplier);
    enhanced = `<break time="${pauseMs}ms"/>${enhanced}`;
    features.push('contextual_pause');
  }

  // 4. Inject disfluency (natural speech patterns) - probabilistic
  const disfluency = smartInjectDisfluency(
    sessionId,
    enhanced,
    detectedEmotion,
    turnNumber
  );
  if (disfluency) {
    enhanced = disfluency.enhanced;
    features.push(`disfluency_${disfluency.type}`);
  }

  // 5. Apply emotion tag if not already present
  if (!enhanced.includes('<emotion')) {
    enhanced = `<emotion value="${detectedEmotion}"/>${enhanced}`;
    features.push('emotion_tag');
  }

  const processingMs = Date.now() - startTime;

  log.debug(
    {
      sessionId,
      turnNumber,
      features,
      processingMs,
      usedAnticipation: prepared && !isStale && prepared.confidence > 0.5,
    },
    'Enhanced response with Sesame features'
  );

  return {
    original: text,
    enhanced,
    features,
    processingMs,
  };
}

/**
 * Quick enhancement for simple cases (lower latency)
 *
 * Use this when you don't need full disfluency injection
 */
export function quickEnhance(
  sessionId: string,
  text: string,
  emotion: CartesiaEmotion
): string {
  const prepared = getPreparedResponse(sessionId);

  let enhanced = text;

  // Apply micro-reaction if fresh
  if (prepared && Date.now() - prepared.preparedAt < 3000) {
    if (prepared.microReactionSsml) {
      enhanced = prepared.microReactionSsml + enhanced;
    }
    if (prepared.speedMultiplier !== 1.0) {
      enhanced = `<speed ratio="${prepared.speedMultiplier.toFixed(2)}"/>${enhanced}`;
    }
  }

  // Add emotion
  if (!enhanced.includes('<emotion')) {
    enhanced = `<emotion value="${emotion}"/>${enhanced}`;
  }

  return enhanced;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Combine anticipated speed with conversation speed
 */
function combineSpeed(anticipated: number, conversation: number): number {
  // Average them, clamping to safe range
  const combined = (anticipated + conversation) / 2;
  return Math.max(0.7, Math.min(1.3, combined));
}

/**
 * Combine anticipated volume with conversation volume
 */
function combineVolume(anticipated: number, conversation: number): number {
  const combined = (anticipated + conversation) / 2;
  return Math.max(0.7, Math.min(1.2, combined));
}

// =============================================================================
// SESSION CLEANUP
// =============================================================================

/**
 * Mark start of new turn (reset anticipation)
 */
export function startNewTurn(sessionId: string): void {
  const session = getSession(sessionId);
  session.lastPreparedResponse = null;
  session.lastPartialText = '';
  session.turnCount++;
}

/**
 * Reset session state
 */
export function resetSesamePipeline(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Get active session count
 */
export function getActiveSesamePipelineSessionCount(): number {
  return sessions.size;
}

// =============================================================================
// METRICS
// =============================================================================

/**
 * Get latency metrics for the pipeline
 */
export function getSesamePipelineMetrics(sessionId: string): {
  hasAnticipation: boolean;
  anticipationAge: number | null;
  turnCount: number;
} {
  const session = sessions.get(sessionId);
  if (!session) {
    return {
      hasAnticipation: false,
      anticipationAge: null,
      turnCount: 0,
    };
  }

  const anticipationAge = session.lastPreparedResponse
    ? Date.now() - session.lastPreparedResponse.preparedAt
    : null;

  return {
    hasAnticipation: !!session.lastPreparedResponse,
    anticipationAge,
    turnCount: session.turnCount,
  };
}
