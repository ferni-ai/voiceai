/**
 * Dynamic Voice Parameters
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module adjusts TTS voice parameters in real-time based on:
 * - Detected user emotion
 * - Time of day
 * - Conversation context (heavy topic, celebration, etc.)
 * - Relationship depth
 *
 * The goal: Ferni's voice should FEEL different when someone is:
 * - Distressed (slower, softer, more pauses)
 * - Excited (energetic, faster)
 * - Late at night (gentler, quieter)
 * - Sharing something vulnerable (warmer, slower)
 *
 * @module DynamicVoiceParameters
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'DynamicVoiceParameters' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceParameters {
  /** Speed multiplier (1.0 = normal, 0.8 = slower, 1.2 = faster) */
  speedMultiplier: number;

  /** Pause multiplier (1.0 = normal pauses, 1.5 = longer pauses) */
  pauseMultiplier: number;

  /** Volume level (soft, normal, energetic) */
  volumeLevel: 'soft' | 'normal' | 'energetic';

  /** Emotional tone hint for TTS */
  emotionalTone: 'warm' | 'gentle' | 'energetic' | 'calm' | 'compassionate';

  /** Additional SSML pre-processing hints */
  ssmlHints: {
    addBreathingPauses: boolean;
    emphasizeComfort: boolean;
    softenDelivery: boolean;
  };
}

export interface VoiceContext {
  /** Detected user emotion */
  userEmotion?: {
    primary: string;
    intensity: number;
    needsSupport?: boolean;
  };

  /** Time of day (0-23) */
  currentHour: number;

  /** Is this a heavy/sensitive topic? */
  isHeavyTopic: boolean;

  /** Is this a celebration moment? */
  isCelebration: boolean;

  /** Relationship stage */
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** How long they've been talking (minutes) */
  sessionMinutes: number;

  /** Turn count in this session */
  turnCount: number;
}

// ============================================================================
// EMOTION-BASED PARAMETERS
// ============================================================================

const EMOTION_PARAMETERS: Record<string, Partial<VoiceParameters>> = {
  // Distress states - slow down, be gentle
  sadness: {
    speedMultiplier: 0.85,
    pauseMultiplier: 1.4,
    volumeLevel: 'soft',
    emotionalTone: 'compassionate',
    ssmlHints: { addBreathingPauses: true, emphasizeComfort: true, softenDelivery: true },
  },
  fear: {
    speedMultiplier: 0.85,
    pauseMultiplier: 1.3,
    volumeLevel: 'soft',
    emotionalTone: 'gentle',
    ssmlHints: { addBreathingPauses: true, emphasizeComfort: true, softenDelivery: true },
  },
  anxiety: {
    speedMultiplier: 0.88,
    pauseMultiplier: 1.3,
    volumeLevel: 'soft',
    emotionalTone: 'calm',
    ssmlHints: { addBreathingPauses: true, emphasizeComfort: false, softenDelivery: true },
  },
  distress: {
    speedMultiplier: 0.82,
    pauseMultiplier: 1.5,
    volumeLevel: 'soft',
    emotionalTone: 'compassionate',
    ssmlHints: { addBreathingPauses: true, emphasizeComfort: true, softenDelivery: true },
  },

  // Excitement states - match energy
  excitement: {
    speedMultiplier: 1.08,
    pauseMultiplier: 0.85,
    volumeLevel: 'energetic',
    emotionalTone: 'energetic',
    ssmlHints: { addBreathingPauses: false, emphasizeComfort: false, softenDelivery: false },
  },
  joy: {
    speedMultiplier: 1.05,
    pauseMultiplier: 0.9,
    volumeLevel: 'energetic',
    emotionalTone: 'warm',
    ssmlHints: { addBreathingPauses: false, emphasizeComfort: false, softenDelivery: false },
  },

  // Reflective states - give space
  contemplation: {
    speedMultiplier: 0.9,
    pauseMultiplier: 1.2,
    volumeLevel: 'normal',
    emotionalTone: 'calm',
    ssmlHints: { addBreathingPauses: true, emphasizeComfort: false, softenDelivery: false },
  },
  confusion: {
    speedMultiplier: 0.92,
    pauseMultiplier: 1.15,
    volumeLevel: 'normal',
    emotionalTone: 'warm',
    ssmlHints: { addBreathingPauses: false, emphasizeComfort: false, softenDelivery: false },
  },

  // Neutral/default
  neutral: {
    speedMultiplier: 1.0,
    pauseMultiplier: 1.0,
    volumeLevel: 'normal',
    emotionalTone: 'warm',
    ssmlHints: { addBreathingPauses: false, emphasizeComfort: false, softenDelivery: false },
  },
};

// ============================================================================
// TIME-BASED PARAMETERS
// ============================================================================

interface TimeModifiers {
  speedMultiplier: number;
  pauseMultiplier: number;
  volumeLevel: 'soft' | 'normal' | 'energetic';
}

function getTimeBasedModifiers(hour: number): TimeModifiers {
  // Late night (10pm - 5am) - softer, slower
  if (hour >= 22 || hour < 5) {
    return {
      speedMultiplier: 0.9,
      pauseMultiplier: 1.2,
      volumeLevel: 'soft',
    };
  }

  // Early morning (5am - 8am) - gentle wake-up energy
  if (hour >= 5 && hour < 8) {
    return {
      speedMultiplier: 0.95,
      pauseMultiplier: 1.1,
      volumeLevel: 'normal',
    };
  }

  // Peak hours (8am - 5pm) - full energy
  if (hour >= 8 && hour < 17) {
    return {
      speedMultiplier: 1.0,
      pauseMultiplier: 1.0,
      volumeLevel: 'normal',
    };
  }

  // Evening (5pm - 10pm) - winding down
  return {
    speedMultiplier: 0.97,
    pauseMultiplier: 1.05,
    volumeLevel: 'normal',
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Calculate dynamic voice parameters based on context
 */
export function calculateVoiceParameters(context: VoiceContext): VoiceParameters {
  // Start with defaults
  let params: VoiceParameters = {
    speedMultiplier: 1.0,
    pauseMultiplier: 1.0,
    volumeLevel: 'normal',
    emotionalTone: 'warm',
    ssmlHints: {
      addBreathingPauses: false,
      emphasizeComfort: false,
      softenDelivery: false,
    },
  };

  // Apply emotion-based parameters (primary factor)
  if (context.userEmotion?.primary) {
    const emotionKey = context.userEmotion.primary.toLowerCase();
    const emotionParams = EMOTION_PARAMETERS[emotionKey] || EMOTION_PARAMETERS.neutral;

    // Scale by intensity
    const intensity = context.userEmotion.intensity || 0.5;
    const intensityFactor = 0.5 + intensity * 0.5; // Range: 0.5 to 1.0

    params = {
      ...params,
      speedMultiplier: 1.0 + ((emotionParams.speedMultiplier || 1.0) - 1.0) * intensityFactor,
      pauseMultiplier: 1.0 + ((emotionParams.pauseMultiplier || 1.0) - 1.0) * intensityFactor,
      volumeLevel: emotionParams.volumeLevel || params.volumeLevel,
      emotionalTone: emotionParams.emotionalTone || params.emotionalTone,
      ssmlHints: emotionParams.ssmlHints || params.ssmlHints,
    };

    // Override for high-need situations
    if (context.userEmotion.needsSupport) {
      params.speedMultiplier = Math.min(params.speedMultiplier, 0.88);
      params.pauseMultiplier = Math.max(params.pauseMultiplier, 1.3);
      params.ssmlHints.softenDelivery = true;
      params.ssmlHints.addBreathingPauses = true;
    }
  }

  // Apply time-based modifiers (secondary factor)
  const timeModifiers = getTimeBasedModifiers(context.currentHour);
  params.speedMultiplier *= timeModifiers.speedMultiplier;
  params.pauseMultiplier *= timeModifiers.pauseMultiplier;

  // Late night always soft
  if (context.currentHour >= 22 || context.currentHour < 5) {
    params.volumeLevel = 'soft';
  }

  // Context overrides
  if (context.isHeavyTopic) {
    params.speedMultiplier = Math.min(params.speedMultiplier, 0.9);
    params.pauseMultiplier = Math.max(params.pauseMultiplier, 1.2);
    params.ssmlHints.softenDelivery = true;
  }

  if (context.isCelebration) {
    params.speedMultiplier = Math.max(params.speedMultiplier, 1.05);
    params.volumeLevel = 'energetic';
    params.emotionalTone = 'energetic';
  }

  // Session fatigue - slow down as session goes on
  if (context.sessionMinutes > 30) {
    const fatigueFactor = Math.min((context.sessionMinutes - 30) / 60, 0.15);
    params.speedMultiplier *= 1 - fatigueFactor;
    params.pauseMultiplier *= 1 + fatigueFactor * 0.5;
  }

  // Clamp values to reasonable ranges
  params.speedMultiplier = Math.max(0.75, Math.min(1.25, params.speedMultiplier));
  params.pauseMultiplier = Math.max(0.7, Math.min(1.8, params.pauseMultiplier));

  log.debug(
    {
      userEmotion: context.userEmotion?.primary,
      hour: context.currentHour,
      isHeavy: context.isHeavyTopic,
      speed: params.speedMultiplier.toFixed(2),
      pause: params.pauseMultiplier.toFixed(2),
      volume: params.volumeLevel,
      tone: params.emotionalTone,
    },
    '🎙️ Voice parameters calculated'
  );

  return params;
}

/**
 * Apply voice parameters to SSML text
 * Adds prosody tags based on calculated parameters
 */
export function applyVoiceParametersToSSML(ssml: string, params: VoiceParameters): string {
  let result = ssml;

  // Add prosody wrapper for speed adjustment
  if (params.speedMultiplier !== 1.0) {
    const ratePercent = Math.round(params.speedMultiplier * 100);
    result = `<prosody rate="${ratePercent}%">${result}</prosody>`;
  }

  // Add volume adjustment
  if (params.volumeLevel === 'soft') {
    result = `<prosody volume="soft">${result}</prosody>`;
  } else if (params.volumeLevel === 'energetic') {
    result = `<prosody volume="loud">${result}</prosody>`;
  }

  // Add breathing pauses if needed
  if (params.ssmlHints.addBreathingPauses) {
    // Add subtle breathing pauses after periods
    result = result.replace(/\.\s+/g, '. <break time="400ms"/> ');
  }

  // Extend pauses if needed
  if (params.pauseMultiplier > 1.1) {
    // Increase existing break times
    result = result.replace(/<break time="(\d+)ms"\/>/g, (_match, time) => {
      const newTime = Math.round(parseInt(time) * params.pauseMultiplier);
      return `<break time="${newTime}ms"/>`;
    });
  }

  return result;
}

/**
 * Get voice parameter summary for logging/debugging
 */
export function getVoiceParameterSummary(params: VoiceParameters): string {
  const parts = [];

  if (params.speedMultiplier < 0.95) {
    parts.push('slower');
  } else if (params.speedMultiplier > 1.05) {
    parts.push('faster');
  }

  if (params.volumeLevel === 'soft') {
    parts.push('softer');
  } else if (params.volumeLevel === 'energetic') {
    parts.push('energetic');
  }

  if (params.pauseMultiplier > 1.2) {
    parts.push('more pauses');
  }

  if (params.ssmlHints.softenDelivery) {
    parts.push('gentler');
  }

  return parts.length > 0 ? parts.join(', ') : 'normal';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateVoiceParameters,
  applyVoiceParametersToSSML,
  getVoiceParameterSummary,
};
