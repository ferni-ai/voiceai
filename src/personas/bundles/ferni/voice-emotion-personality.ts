/**
 * Voice Emotion → Personality Integration
 *
 * "Better than human" means responding to HOW something is said, not just WHAT.
 *
 * This module maps voice emotion signals to personality expression adaptations:
 * - Stressed voice → warmer, gentler expressions
 * - Excited voice → match energy, enthusiasm
 * - Hesitant voice → more encouraging, patient expressions
 * - Sad voice → softer, more empathetic expressions
 *
 * @module personas/bundles/ferni/voice-emotion-personality
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ThemeCategory } from '../../../services/session-variety-tracker.js';

// VoiceEmotionResult type (inline to avoid import issues)
export interface VoiceEmotionResult {
  primary?: string;
  arousal?: number;
  valence?: number;
  confidence?: number;
}

const log = createLogger({ module: 'voice-emotion-personality' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoicePersonalityAdjustment {
  /** Themes that match this voice state */
  preferredThemes: ThemeCategory[];

  /** Themes to avoid in this voice state */
  avoidThemes: ThemeCategory[];

  /** Expression tone modifier */
  toneModifier: 'warmer' | 'gentler' | 'energetic' | 'calmer' | 'encouraging' | 'neutral';

  /** Whether to prioritize acknowledgment over expression */
  prioritizeAcknowledgment: boolean;

  /** Whether expressions should be shorter */
  preferShorterExpressions: boolean;

  /** Intimacy level adjustment (-0.3 to +0.3) */
  intimacyAdjustment: number;

  /** Suggested injection point (ComposedExpression.timing compatible) */
  suggestedInjectionPoint: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';

  /** Reason for this adjustment */
  reason: string;
}

export interface VoiceEmotionContext {
  /** Primary voice emotion detected */
  primary?: string;

  /** Arousal level (0-1, 0=calm, 1=activated) */
  arousal?: number;

  /** Valence (-1 to 1, negative=distressed, positive=happy) */
  valence?: number;

  /** Confidence in detection (0-1) */
  confidence?: number;

  /** Speech rate category */
  speechPace?: 'slow' | 'normal' | 'fast';

  /** Energy level */
  energyLevel?: 'low' | 'medium' | 'high';

  /** Voice quality signals */
  hasStrain?: boolean;
  hasTremor?: boolean;
  hasBreathiness?: boolean;
}

// ============================================================================
// VOICE EMOTION MAPPINGS
// ============================================================================

const VOICE_EMOTION_ADJUSTMENTS: Record<string, Partial<VoicePersonalityAdjustment>> = {
  // Distressed states - prioritize warmth and gentleness
  stressed: {
    preferredThemes: ['vulnerability', 'sensory_moment', 'physical_habits'],
    avoidThemes: ['quirky_interests', 'family_life'],
    toneModifier: 'gentler',
    prioritizeAcknowledgment: true,
    preferShorterExpressions: true,
    intimacyAdjustment: 0.1,
    suggestedInjectionPoint: 'immediate',
    reason: 'Stress detected in voice - prioritizing gentle acknowledgment',
  },

  anxious: {
    preferredThemes: ['sensory_moment', 'physical_habits', 'vulnerability'],
    avoidThemes: ['quirky_interests', 'global_traveler'],
    toneModifier: 'calmer',
    prioritizeAcknowledgment: true,
    preferShorterExpressions: true,
    intimacyAdjustment: 0.15,
    suggestedInjectionPoint: 'immediate',
    reason: 'Anxiety detected - using grounding expressions',
  },

  sad: {
    preferredThemes: ['vulnerability', 'sensory_moment', 'music_taste'],
    avoidThemes: ['quirky_interests', 'global_traveler'],
    toneModifier: 'warmer',
    prioritizeAcknowledgment: true,
    preferShorterExpressions: true,
    intimacyAdjustment: 0.2,
    suggestedInjectionPoint: 'immediate',
    reason: 'Sadness detected - leading with warmth',
  },

  frustrated: {
    preferredThemes: ['physical_habits', 'sensory_moment'],
    avoidThemes: ['quirky_interests', 'vulnerability'],
    toneModifier: 'calmer',
    prioritizeAcknowledgment: true,
    preferShorterExpressions: true,
    intimacyAdjustment: 0,
    suggestedInjectionPoint: 'at_end',
    reason: 'Frustration detected - staying grounded and brief',
  },

  // Positive states - match energy
  excited: {
    preferredThemes: ['quirky_interests', 'global_traveler', 'music_taste'],
    avoidThemes: [],
    toneModifier: 'energetic',
    prioritizeAcknowledgment: false,
    preferShorterExpressions: false,
    intimacyAdjustment: 0.1,
    suggestedInjectionPoint: 'mid_response',
    reason: 'Excitement detected - matching energy',
  },

  happy: {
    preferredThemes: ['quirky_interests', 'music_taste', 'global_traveler', 'family_life'],
    avoidThemes: [],
    toneModifier: 'energetic',
    prioritizeAcknowledgment: false,
    preferShorterExpressions: false,
    intimacyAdjustment: 0.1,
    suggestedInjectionPoint: 'mid_response',
    reason: 'Happiness detected - joining the positive energy',
  },

  curious: {
    preferredThemes: ['global_traveler', 'sensory_moment', 'quirky_interests'],
    avoidThemes: ['vulnerability'],
    toneModifier: 'encouraging',
    prioritizeAcknowledgment: false,
    preferShorterExpressions: false,
    intimacyAdjustment: 0,
    suggestedInjectionPoint: 'at_end',
    reason: 'Curiosity detected - encouraging exploration',
  },

  // Uncertain states - be encouraging
  hesitant: {
    preferredThemes: ['vulnerability', 'sensory_moment'],
    avoidThemes: ['quirky_interests'],
    toneModifier: 'encouraging',
    prioritizeAcknowledgment: true,
    preferShorterExpressions: true,
    intimacyAdjustment: 0.1,
    suggestedInjectionPoint: 'immediate',
    reason: 'Hesitation detected - being encouraging',
  },

  // Neutral - no adjustment
  neutral: {
    preferredThemes: [],
    avoidThemes: [],
    toneModifier: 'neutral',
    prioritizeAcknowledgment: false,
    preferShorterExpressions: false,
    intimacyAdjustment: 0,
    suggestedInjectionPoint: 'mid_response',
    reason: 'Neutral voice - standard personality',
  },
};

// ============================================================================
// ADJUSTMENT LOGIC
// ============================================================================

/**
 * Get personality adjustment based on voice emotion
 */
export function getVoiceEmotionAdjustment(
  voiceContext: VoiceEmotionContext
): VoicePersonalityAdjustment {
  const defaultAdjustment: VoicePersonalityAdjustment = {
    preferredThemes: [],
    avoidThemes: [],
    toneModifier: 'neutral',
    prioritizeAcknowledgment: false,
    preferShorterExpressions: false,
    intimacyAdjustment: 0,
    suggestedInjectionPoint: 'mid_response',
    reason: 'No voice emotion context',
  };

  // No voice context - return defaults
  if (!voiceContext.primary) {
    return defaultAdjustment;
  }

  // Low confidence - don't adjust too much
  if (voiceContext.confidence && voiceContext.confidence < 0.4) {
    log.debug({ confidence: voiceContext.confidence }, 'Low voice confidence - minimal adjustment');
    return defaultAdjustment;
  }

  // Get base adjustment for primary emotion
  const baseAdjustment = VOICE_EMOTION_ADJUSTMENTS[voiceContext.primary];
  if (!baseAdjustment) {
    log.debug({ emotion: voiceContext.primary }, 'Unknown voice emotion');
    return defaultAdjustment;
  }

  const adjustment: VoicePersonalityAdjustment = {
    ...defaultAdjustment,
    ...baseAdjustment,
  };

  // Amplify adjustments based on arousal/valence
  if (voiceContext.arousal !== undefined && voiceContext.arousal > 0.7) {
    // High arousal - be more responsive
    adjustment.prioritizeAcknowledgment = true;
    adjustment.reason += ' (high arousal)';
  }

  if (voiceContext.valence !== undefined && voiceContext.valence < -0.3) {
    // Negative valence - be warmer
    adjustment.intimacyAdjustment = Math.min(0.3, adjustment.intimacyAdjustment + 0.1);
    adjustment.toneModifier = 'warmer';
    adjustment.reason += ' (negative valence)';
  }

  // Voice quality signals
  if (voiceContext.hasStrain) {
    adjustment.preferredThemes = ['sensory_moment', 'physical_habits'];
    adjustment.preferShorterExpressions = true;
    adjustment.reason += ' (voice strain detected)';
  }

  if (voiceContext.hasTremor) {
    adjustment.prioritizeAcknowledgment = true;
    adjustment.toneModifier = 'gentler';
    adjustment.reason += ' (tremor in voice)';
  }

  // Energy level adjustments
  if (voiceContext.energyLevel === 'low') {
    adjustment.preferShorterExpressions = true;
    adjustment.suggestedInjectionPoint = 'immediate';
    adjustment.reason += ' (low energy)';
  } else if (voiceContext.energyLevel === 'high') {
    adjustment.toneModifier = 'energetic';
    adjustment.reason += ' (high energy)';
  }

  log.debug(
    {
      primary: voiceContext.primary,
      confidence: voiceContext.confidence,
      adjustment: adjustment.toneModifier,
      themes: adjustment.preferredThemes,
    },
    '🎙️ Voice emotion adjustment'
  );

  return adjustment;
}

/**
 * Check if a theme is preferred for current voice state
 */
export function isThemePreferredForVoice(
  theme: ThemeCategory,
  adjustment: VoicePersonalityAdjustment
): boolean {
  // If no preferences, all themes are ok
  if (adjustment.preferredThemes.length === 0) return true;

  return adjustment.preferredThemes.includes(theme);
}

/**
 * Check if a theme should be avoided for current voice state
 */
export function shouldAvoidThemeForVoice(
  theme: ThemeCategory,
  adjustment: VoicePersonalityAdjustment
): boolean {
  return adjustment.avoidThemes.includes(theme);
}

/**
 * Convert VoiceEmotionResult to our internal context format
 */
export function fromVoiceEmotionResult(result?: VoiceEmotionResult): VoiceEmotionContext {
  if (!result) {
    return {};
  }

  return {
    primary: result.primary,
    arousal: result.arousal,
    valence: result.valence,
    confidence: result.confidence,
    // Map additional properties if available
    speechPace: result.arousal !== undefined
      ? (result.arousal > 0.7 ? 'fast' : result.arousal < 0.3 ? 'slow' : 'normal')
      : undefined,
    energyLevel: result.arousal !== undefined
      ? (result.arousal > 0.7 ? 'high' : result.arousal < 0.3 ? 'low' : 'medium')
      : undefined,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const voiceEmotionPersonality = {
  getAdjustment: getVoiceEmotionAdjustment,
  isThemePreferred: isThemePreferredForVoice,
  shouldAvoidTheme: shouldAvoidThemeForVoice,
  fromVoiceEmotionResult,
};

export default voiceEmotionPersonality;

