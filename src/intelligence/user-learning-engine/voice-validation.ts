/**
 * Voice Emotion Validation Module
 *
 * Validates voice emotion predictions against subsequent text emotion.
 * This helps calibrate voice emotion detection accuracy.
 *
 * @module user-learning-engine/voice-validation
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { EmotionResult } from '../detectors/emotion.js';

const log = getLogger();

/** Voice emotion validation record */
export interface VoiceEmotionValidation {
  predicted: string;
  confirmed: boolean;
  timestamp: Date;
}

/** Voice emotion tracking state */
export interface VoiceEmotionState {
  lastVoiceEmotion: { emotion: string; confidence: number; timestamp: number } | null;
  voiceEmotionValidations: VoiceEmotionValidation[];
  voiceEmotionAccuracy: number;
}

/**
 * Create initial voice emotion state
 */
export function createVoiceEmotionState(): VoiceEmotionState {
  return {
    lastVoiceEmotion: null,
    voiceEmotionValidations: [],
    voiceEmotionAccuracy: 0.5, // Start neutral
  };
}

/**
 * Record a voice emotion detection for later validation
 */
export function recordVoiceEmotion(
  state: VoiceEmotionState,
  emotion: string,
  confidence: number
): void {
  state.lastVoiceEmotion = {
    emotion,
    confidence,
    timestamp: Date.now(),
  };
}

/**
 * Voice to text emotion mapping
 */
const VOICE_TO_TEXT_MAP: Record<string, string[]> = {
  happy: ['joy', 'anticipation'],
  sad: ['sadness', 'grief'],
  angry: ['anger', 'frustration'],
  fearful: ['fear', 'anxiety'],
  anxious: ['anxiety', 'fear', 'worry'],
  excited: ['anticipation', 'joy'],
  stressed: ['anxiety', 'frustration'],
  neutral: ['neutral'],
};

/**
 * Validate voice emotion prediction against subsequent text emotion
 * This helps calibrate voice emotion detection accuracy
 */
export function validateVoiceEmotionPrediction(
  state: VoiceEmotionState,
  textEmotion: EmotionResult
): void {
  if (!state.lastVoiceEmotion) return;

  // Only validate if voice prediction was recent (within 30 seconds)
  if (Date.now() - state.lastVoiceEmotion.timestamp > 30000) {
    state.lastVoiceEmotion = null;
    return;
  }

  const expectedTextEmotions = VOICE_TO_TEXT_MAP[state.lastVoiceEmotion.emotion] || [];
  const confirmed =
    expectedTextEmotions.includes(textEmotion.primary) ||
    (state.lastVoiceEmotion.emotion === 'stressed' && (textEmotion.distressLevel || 0) > 0.5);

  // Record validation
  state.voiceEmotionValidations.push({
    predicted: state.lastVoiceEmotion.emotion,
    confirmed,
    timestamp: new Date(),
  });

  // Update accuracy (rolling average of last 20)
  const recent = state.voiceEmotionValidations.slice(-20);
  const correctCount = recent.filter((v) => v.confirmed).length;
  state.voiceEmotionAccuracy = correctCount / recent.length;

  if (state.voiceEmotionValidations.length % 10 === 0) {
    log.debug(
      {
        accuracy: state.voiceEmotionAccuracy,
        totalValidations: state.voiceEmotionValidations.length,
      },
      'Voice emotion accuracy updated'
    );
  }

  // Clear the prediction after validation
  state.lastVoiceEmotion = null;
}

/**
 * Get current voice emotion detection accuracy
 */
export function getVoiceEmotionAccuracy(state: VoiceEmotionState): number {
  return state.voiceEmotionAccuracy;
}
