/**
 * Prosody-to-Turn-Prediction Bridge
 *
 * Connects voice prosody analysis with turn prediction to enable
 * more accurate end-of-turn detection using actual voice intonation.
 *
 * When a user's pitch rises at the end of a sentence, they might be asking
 * a question or continuing. When it falls, they're likely done speaking.
 * Real humans pick up on this - now Ferni can too.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { ProsodyFeatures, VoiceEmotionResult } from '../audio-prosody.js';
import {
  getTurnPredictionService,
  type TurnPredictionContext,
  type TurnPrediction,
} from '../../conversation/turn-prediction.js';

const log = getLogger().child({ service: 'prosody-turn-bridge' });

// ============================================================================
// TYPES
// ============================================================================

export type Intonation = 'rising' | 'falling' | 'neutral';

export interface EnhancedTurnPrediction extends TurnPrediction {
  /** Voice-based signals used in prediction */
  voiceSignals: {
    intonation: Intonation;
    stressLevel: number;
    speechRate: number;
    confidenceFromVoice: number;
  };
}

// ============================================================================
// INTONATION MAPPING
// ============================================================================

/**
 * Map prosody pitch contour to turn prediction intonation
 */
export function mapPitchContourToIntonation(
  pitchContour: ProsodyFeatures['pitchContour']
): Intonation {
  switch (pitchContour) {
    case 'rising':
      return 'rising';
    case 'falling':
      return 'falling';
    case 'flat':
    case 'dynamic':
    default:
      return 'neutral';
  }
}

/**
 * Extract intonation from voice emotion result
 */
export function getIntonationFromVoiceEmotion(voiceEmotion: VoiceEmotionResult | null): Intonation {
  if (!voiceEmotion || voiceEmotion.confidence < 0.3) {
    return 'neutral';
  }
  return mapPitchContourToIntonation(voiceEmotion.prosody.pitchContour);
}

// ============================================================================
// ENHANCED TURN PREDICTION
// ============================================================================

/**
 * Create turn prediction context with voice prosody signals
 */
export function createTurnPredictionContext(
  transcript: string,
  options: {
    voiceEmotion?: VoiceEmotionResult | null;
    speakingDurationMs?: number;
    silenceDurationMs?: number;
    turnCount?: number;
    topicWeight?: 'light' | 'medium' | 'heavy';
  }
): TurnPredictionContext {
  const {
    voiceEmotion,
    speakingDurationMs = 0,
    silenceDurationMs = 0,
    turnCount = 0,
    topicWeight,
  } = options;

  return {
    transcript,
    speakingDurationMs,
    silenceDurationMs,
    intonation: getIntonationFromVoiceEmotion(voiceEmotion ?? null),
    topicWeight,
    emotionIntensity: voiceEmotion?.arousal ?? undefined,
    turnCount,
    userWPM: voiceEmotion?.prosody.speechRate
      ? voiceEmotion.prosody.speechRate * 15 // Rough syllables/sec to WPM conversion
      : undefined,
  };
}

/**
 * Get enhanced turn prediction with voice signals
 */
export function predictTurnWithVoice(
  sessionId: string,
  transcript: string,
  voiceEmotion: VoiceEmotionResult | null,
  options: {
    speakingDurationMs?: number;
    silenceDurationMs?: number;
    turnCount?: number;
    topicWeight?: 'light' | 'medium' | 'heavy';
  } = {}
): EnhancedTurnPrediction {
  const turnPredictor = getTurnPredictionService(sessionId);

  const context = createTurnPredictionContext(transcript, {
    voiceEmotion,
    ...options,
  });

  const basePrediction = turnPredictor.predict(context);

  // Extract voice signals for logging/debugging
  const voiceSignals = {
    intonation: context.intonation || ('neutral' as Intonation),
    stressLevel: voiceEmotion?.stressLevel ?? 0,
    speechRate: voiceEmotion?.prosody.speechRate ?? 0,
    confidenceFromVoice: voiceEmotion?.confidence ?? 0,
  };

  // Log if voice signals significantly affected the prediction
  if (voiceEmotion && voiceEmotion.confidence > 0.5) {
    log.debug(
      {
        transcript: transcript.slice(0, 50),
        intonation: voiceSignals.intonation,
        pitchContour: voiceEmotion.prosody.pitchContour,
        isComplete: basePrediction.isComplete,
        confidence: basePrediction.confidence.toFixed(2),
      },
      '🎤 Voice-enhanced turn prediction'
    );
  }

  return {
    ...basePrediction,
    voiceSignals,
  };
}

/**
 * Check if voice prosody strongly suggests turn completion
 * This can be used for faster response initiation
 */
export function voiceSuggestsTurnComplete(voiceEmotion: VoiceEmotionResult | null): {
  suggests: boolean;
  confidence: number;
  reason: string;
} {
  if (!voiceEmotion || voiceEmotion.confidence < 0.4) {
    return {
      suggests: false,
      confidence: 0,
      reason: 'Insufficient voice confidence',
    };
  }

  const { prosody, stressLevel } = voiceEmotion;

  // Strong falling pitch = likely done speaking
  if (prosody.pitchContour === 'falling' && voiceEmotion.confidence > 0.6) {
    return {
      suggests: true,
      confidence: voiceEmotion.confidence * 0.9,
      reason: 'Falling pitch contour indicates statement completion',
    };
  }

  // Low speaking ratio with pause = likely done
  if (prosody.speakingRatio < 0.3 && prosody.pauseDuration > 500) {
    return {
      suggests: true,
      confidence: 0.7,
      reason: 'Long pause with low speaking ratio',
    };
  }

  // Slow, deliberate speech with falling pitch
  if (prosody.speechRate < 2 && prosody.pitchContour === 'falling') {
    return {
      suggests: true,
      confidence: 0.65,
      reason: 'Slow deliberate speech with falling pitch',
    };
  }

  // High stress with falling pitch = emotional completion
  if (stressLevel > 0.6 && prosody.pitchContour === 'falling') {
    return {
      suggests: true,
      confidence: 0.75,
      reason: 'Emotional statement with falling pitch',
    };
  }

  // Rising pitch = probably a question or continuation
  if (prosody.pitchContour === 'rising') {
    return {
      suggests: false,
      confidence: voiceEmotion.confidence * 0.8,
      reason: 'Rising pitch suggests question or continuation',
    };
  }

  return {
    suggests: false,
    confidence: 0.5,
    reason: 'No clear voice signal for turn completion',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  mapPitchContourToIntonation,
  getIntonationFromVoiceEmotion,
  createTurnPredictionContext,
  predictTurnWithVoice,
  voiceSuggestsTurnComplete,
};
