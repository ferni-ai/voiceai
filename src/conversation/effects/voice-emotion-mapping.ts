/**
 * Voice Emotion to Effect Mapping
 *
 * Maps detected voice emotions to appropriate humanization effects.
 * Enables the AI to respond to HOW the user is speaking, not just what they say.
 *
 * @module @ferni/conversation/effects/voice-emotion-mapping
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { HumanizationCapability } from './types.js';

const log = createLogger({ module: 'VoiceEmotionMapping' });

// ============================================================================
// TYPES
// ============================================================================

export type VoiceEmotion =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'anxious'
  | 'frustrated'
  | 'confident'
  | 'hesitant'
  | 'tired'
  | 'stressed'
  | 'relieved'
  | 'curious'
  | 'surprised';

export interface VoiceEmotionSignal {
  emotion: VoiceEmotion;
  confidence: number;
  /** Voice quality indicators */
  voiceQuality?: {
    tremor: boolean;
    breathiness: number;
    pitch: 'high' | 'normal' | 'low';
    pace: 'fast' | 'normal' | 'slow';
    volume: 'loud' | 'normal' | 'quiet';
  };
}

export interface EffectRecommendation {
  /** Effect ID to boost */
  effectId: string;
  /** Probability multiplier (>1 = boost, <1 = reduce) */
  probabilityMultiplier: number;
  /** Reason for recommendation */
  reason: string;
}

export interface EmotionEffectMapping {
  /** Capabilities to prioritize */
  priorityCapabilities: HumanizationCapability[];
  /** Specific effect recommendations */
  recommendations: EffectRecommendation[];
  /** Overall humanization intensity adjustment */
  intensityModifier: number;
  /** Should we slow down our response? */
  shouldSlowDown: boolean;
  /** Should we be more gentle? */
  shouldSoften: boolean;
}

// ============================================================================
// EMOTION TO EFFECT MAPPINGS
// ============================================================================

const EMOTION_MAPPINGS: Record<VoiceEmotion, EmotionEffectMapping> = {
  neutral: {
    priorityCapabilities: ['naturalness', 'questions'],
    recommendations: [],
    intensityModifier: 1.0,
    shouldSlowDown: false,
    shouldSoften: false,
  },

  happy: {
    priorityCapabilities: ['reactions', 'naturalness'],
    recommendations: [
      { effectId: 'live_reaction', probabilityMultiplier: 1.3, reason: 'Match their energy' },
      { effectId: 'playfulness', probabilityMultiplier: 1.4, reason: 'They are in good spirits' },
    ],
    intensityModifier: 1.1,
    shouldSlowDown: false,
    shouldSoften: false,
  },

  excited: {
    priorityCapabilities: ['reactions', 'presence'],
    recommendations: [
      {
        effectId: 'excitement_interruption',
        probabilityMultiplier: 1.5,
        reason: 'Share their excitement',
      },
      { effectId: 'live_reaction', probabilityMultiplier: 1.4, reason: 'Match their energy' },
    ],
    intensityModifier: 1.2,
    shouldSlowDown: false,
    shouldSoften: false,
  },

  sad: {
    priorityCapabilities: ['presence', 'silence', 'attunement'],
    recommendations: [
      { effectId: 'breath_sound', probabilityMultiplier: 1.3, reason: 'Show presence' },
      { effectId: 'physical_presence', probabilityMultiplier: 1.4, reason: 'Be there with them' },
      { effectId: 'playfulness', probabilityMultiplier: 0.1, reason: 'Not appropriate now' },
      {
        effectId: 'excitement_interruption',
        probabilityMultiplier: 0.1,
        reason: 'Not appropriate now',
      },
    ],
    intensityModifier: 0.8, // Less humanization noise
    shouldSlowDown: true,
    shouldSoften: true,
  },

  angry: {
    priorityCapabilities: ['attunement', 'presence'],
    recommendations: [
      {
        effectId: 'first_turn_notice',
        probabilityMultiplier: 1.5,
        reason: 'Acknowledge their frustration',
      },
      { effectId: 'playfulness', probabilityMultiplier: 0, reason: 'Absolutely not appropriate' },
      { effectId: 'speech_filler', probabilityMultiplier: 0.5, reason: 'Be more direct' },
    ],
    intensityModifier: 0.7,
    shouldSlowDown: false,
    shouldSoften: true,
  },

  fearful: {
    priorityCapabilities: ['presence', 'attunement', 'silence'],
    recommendations: [
      { effectId: 'breath_sound', probabilityMultiplier: 1.4, reason: 'Grounding presence' },
      { effectId: 'physical_presence', probabilityMultiplier: 1.5, reason: 'Be a steady presence' },
      { effectId: 'playfulness', probabilityMultiplier: 0, reason: 'Not appropriate' },
    ],
    intensityModifier: 0.6,
    shouldSlowDown: true,
    shouldSoften: true,
  },

  anxious: {
    priorityCapabilities: ['presence', 'silence', 'attunement'],
    recommendations: [
      { effectId: 'breath_sound', probabilityMultiplier: 1.5, reason: 'Model calm breathing' },
      { effectId: 'physical_presence', probabilityMultiplier: 1.3, reason: 'Steady presence' },
      {
        effectId: 'spontaneous_thought',
        probabilityMultiplier: 0.3,
        reason: 'Don not add to their load',
      },
    ],
    intensityModifier: 0.7,
    shouldSlowDown: true,
    shouldSoften: true,
  },

  frustrated: {
    priorityCapabilities: ['attunement', 'presence'],
    recommendations: [
      { effectId: 'first_turn_notice', probabilityMultiplier: 1.4, reason: 'Validate frustration' },
      { effectId: 'live_reaction', probabilityMultiplier: 1.2, reason: 'Show you hear them' },
      { effectId: 'playfulness', probabilityMultiplier: 0.2, reason: 'Not the right time' },
    ],
    intensityModifier: 0.8,
    shouldSlowDown: false,
    shouldSoften: true,
  },

  confident: {
    priorityCapabilities: ['reactions', 'naturalness', 'questions'],
    recommendations: [
      { effectId: 'live_reaction', probabilityMultiplier: 1.2, reason: 'Engage with their energy' },
      { effectId: 'playfulness', probabilityMultiplier: 1.3, reason: 'They can handle it' },
    ],
    intensityModifier: 1.0,
    shouldSlowDown: false,
    shouldSoften: false,
  },

  hesitant: {
    priorityCapabilities: ['attunement', 'presence', 'silence'],
    recommendations: [
      {
        effectId: 'first_turn_notice',
        probabilityMultiplier: 1.6,
        reason: 'Notice their hesitation',
      },
      { effectId: 'breath_sound', probabilityMultiplier: 1.2, reason: 'Create space' },
      {
        effectId: 'excitement_interruption',
        probabilityMultiplier: 0.3,
        reason: 'Don not overwhelm',
      },
    ],
    intensityModifier: 0.8,
    shouldSlowDown: true,
    shouldSoften: true,
  },

  tired: {
    priorityCapabilities: ['presence', 'silence'],
    recommendations: [
      { effectId: 'breath_sound', probabilityMultiplier: 1.3, reason: 'Gentle presence' },
      { effectId: 'physical_presence', probabilityMultiplier: 1.2, reason: 'Calm energy' },
      {
        effectId: 'excitement_interruption',
        probabilityMultiplier: 0.2,
        reason: 'Match their energy',
      },
      { effectId: 'playfulness', probabilityMultiplier: 0.5, reason: 'They are tired' },
    ],
    intensityModifier: 0.7,
    shouldSlowDown: true,
    shouldSoften: true,
  },

  stressed: {
    priorityCapabilities: ['presence', 'attunement', 'silence'],
    recommendations: [
      { effectId: 'breath_sound', probabilityMultiplier: 1.5, reason: 'Model calm' },
      { effectId: 'first_turn_notice', probabilityMultiplier: 1.3, reason: 'Notice the stress' },
      { effectId: 'spontaneous_thought', probabilityMultiplier: 0.4, reason: 'Don not add load' },
    ],
    intensityModifier: 0.7,
    shouldSlowDown: true,
    shouldSoften: true,
  },

  relieved: {
    priorityCapabilities: ['reactions', 'presence'],
    recommendations: [
      { effectId: 'breath_sound', probabilityMultiplier: 1.3, reason: 'Share the relief' },
      { effectId: 'live_reaction', probabilityMultiplier: 1.3, reason: 'Acknowledge the shift' },
      { effectId: 'playfulness', probabilityMultiplier: 1.2, reason: 'Lighter mood now' },
    ],
    intensityModifier: 1.0,
    shouldSlowDown: false,
    shouldSoften: false,
  },

  curious: {
    priorityCapabilities: ['naturalness', 'questions', 'reactions'],
    recommendations: [
      { effectId: 'spontaneous_thought', probabilityMultiplier: 1.4, reason: 'Engage curiosity' },
      { effectId: 'live_reaction', probabilityMultiplier: 1.2, reason: 'Match interest' },
    ],
    intensityModifier: 1.0,
    shouldSlowDown: false,
    shouldSoften: false,
  },

  surprised: {
    priorityCapabilities: ['reactions', 'presence'],
    recommendations: [
      { effectId: 'live_reaction', probabilityMultiplier: 1.5, reason: 'Share the moment' },
      {
        effectId: 'excitement_interruption',
        probabilityMultiplier: 1.3,
        reason: 'React genuinely',
      },
    ],
    intensityModifier: 1.1,
    shouldSlowDown: false,
    shouldSoften: false,
  },
};

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

/**
 * Get effect recommendations based on detected voice emotion
 */
export function getEffectMappingForEmotion(emotion: VoiceEmotion): EmotionEffectMapping {
  return EMOTION_MAPPINGS[emotion] || EMOTION_MAPPINGS.neutral;
}

/**
 * Get effect probability modifier for a specific effect based on voice emotion
 */
export function getEffectModifierForEmotion(effectId: string, emotion: VoiceEmotion): number {
  const mapping = getEffectMappingForEmotion(emotion);

  // Check specific recommendations
  const recommendation = mapping.recommendations.find((r) => r.effectId === effectId);
  if (recommendation) {
    return recommendation.probabilityMultiplier;
  }

  // Return overall intensity modifier
  return mapping.intensityModifier;
}

/**
 * Process voice emotion signal and return effect configuration
 */
export function processVoiceEmotionForEffects(signal: VoiceEmotionSignal): {
  mapping: EmotionEffectMapping;
  /** Additional adjustments based on voice quality */
  voiceQualityAdjustments: Record<string, number>;
} {
  const mapping = getEffectMappingForEmotion(signal.emotion);
  const voiceQualityAdjustments: Record<string, number> = {};

  if (signal.voiceQuality) {
    // Tremor in voice = emotional moment, boost presence effects
    if (signal.voiceQuality.tremor) {
      voiceQualityAdjustments.breath_sound = 1.3;
      voiceQualityAdjustments.physical_presence = 1.3;
      voiceQualityAdjustments.playfulness = 0.2;
    }

    // High breathiness = possibly anxious/stressed
    if (signal.voiceQuality.breathiness > 0.6) {
      voiceQualityAdjustments.breath_sound = 1.4;
    }

    // Fast pace = possibly excited or anxious
    if (signal.voiceQuality.pace === 'fast') {
      // Could be excitement or anxiety - context dependent
      voiceQualityAdjustments.live_reaction = 1.2;
    }

    // Slow pace = possibly tired or sad
    if (signal.voiceQuality.pace === 'slow') {
      voiceQualityAdjustments.excitement_interruption = 0.5;
    }

    // Quiet voice = being careful, hesitant, or emotional
    if (signal.voiceQuality.volume === 'quiet') {
      voiceQualityAdjustments.first_turn_notice = 1.3;
    }
  }

  log.debug(
    {
      emotion: signal.emotion,
      confidence: signal.confidence,
      adjustments: Object.keys(voiceQualityAdjustments).length,
    },
    'Processed voice emotion for effects'
  );

  return { mapping, voiceQualityAdjustments };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const voiceEmotionEffects = {
  getMapping: getEffectMappingForEmotion,
  getModifier: getEffectModifierForEmotion,
  process: processVoiceEmotionForEffects,
};
