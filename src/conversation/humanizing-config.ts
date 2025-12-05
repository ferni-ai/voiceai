/**
 * Humanizing Configuration
 *
 * Centralized tuning parameters for all humanization features.
 * Adjust these values to fine-tune how "human" the AI sounds.
 *
 * Usage:
 *   import { getHumanizingConfig, updateHumanizingConfig } from './humanizing-config.js';
 *
 *   // Get current config
 *   const config = getHumanizingConfig();
 *
 *   // Update specific values
 *   updateHumanizingConfig({ disfluency: { frequency: 0.2 } });
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HumanizingConfig {
  /**
   * Speech Naturalization Settings
   */
  disfluency: {
    /** Whether disfluencies are enabled */
    enabled: boolean;
    /** Base frequency of disfluencies (0-1) */
    frequency: number;
    /** Reduce in serious/emotional contexts */
    contextSensitivity: boolean;
    /** Persona-specific style override */
    personaStyle?: 'minimal' | 'natural' | 'conversational' | 'folksy';
  };

  /**
   * Hedging Settings (uncertainty markers)
   */
  hedging: {
    /** Whether hedging is enabled */
    enabled: boolean;
    /** Probability of adding hedge to advice statements (0-1) */
    adviceHedgingRate: number;
    /** Probability of adding hedge to predictions (0-1) */
    predictionHedgingRate: number;
    /** Default hedge strength */
    defaultStrength: 'soft' | 'medium' | 'strong';
  };

  /**
   * Backchannel Settings
   */
  backchannel: {
    /** Whether backchannels are enabled */
    enabled: boolean;
    /** Minimum ms between backchannels */
    minIntervalMs: number;
    /** Minimum user message length to trigger backchannel */
    minUserMessageLength: number;
    /** Probability of backchannel when conditions met (0-1) */
    probability: number;
  };

  /**
   * Silence Handling Settings
   */
  silence: {
    /** Ms of silence before backchannel is suggested */
    backchannelThresholdMs: number;
    /** Ms of silence before gentle prompt is suggested */
    gentlePromptThresholdMs: number;
    /** Extra patience after personal sharing (multiplier) */
    personalSharingPatienceMultiplier: number;
    /** Extra patience during high emotion (multiplier) */
    highEmotionPatienceMultiplier: number;
  };

  /**
   * Conversational Memory Settings
   */
  memory: {
    /** Whether memory callbacks are enabled */
    enabled: boolean;
    /** Minimum turns before callback is possible */
    minTurnsBeforeCallback: number;
    /** Probability of callback when conditions met (0-1) */
    callbackProbability: number;
    /** Probability of returning to unresolved thread (0-1) */
    threadReturnProbability: number;
    /** Probability of commitment follow-up (0-1) */
    commitmentFollowUpProbability: number;
    /** Max statements to track */
    maxTrackedStatements: number;
  };

  /**
   * Question Diversity Settings
   */
  questions: {
    /** Whether question suggestions are enabled */
    enabled: boolean;
    /** Probability of suggesting follow-up question (0-1) */
    followUpProbability: number;
    /** Avoid repeating same question type within N questions */
    typeRepeatAvoidance: number;
    /** Preferred depth for reflective questions */
    reflectiveDepthThreshold: number;
  };

  /**
   * Emotional Response Settings
   */
  emotional: {
    /** Whether emotional echoing is enabled */
    echoEnabled: boolean;
    /** Threshold for high intensity emotional response (0-1) */
    highIntensityThreshold: number;
    /** Whether to mirror vocabulary */
    vocabularyMirroringEnabled: boolean;
  };

  /**
   * Global Settings
   */
  global: {
    /** Master enable/disable for all humanization */
    enabled: boolean;
    /** Log humanization decisions */
    debugLogging: boolean;
    /** Reduce all features in first N turns */
    warmupTurns: number;
    /** Feature reduction during warmup (0-1) */
    warmupReduction: number;
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: HumanizingConfig = {
  disfluency: {
    enabled: true,
    // TUNED: 12% base - noticeable but not annoying
    // Testing showed 15% felt slightly excessive on short responses
    frequency: 0.12,
    contextSensitivity: true,
    personaStyle: 'natural',
  },

  hedging: {
    enabled: true,
    // TUNED: 20% for advice - builds trust without sounding uncertain
    adviceHedgingRate: 0.2,
    // TUNED: 30% for predictions - market/future uncertainty warrants more hedging
    predictionHedgingRate: 0.3,
    defaultStrength: 'medium',
  },

  backchannel: {
    enabled: true,
    // TUNED: 4 seconds minimum - prevents backchannels feeling rushed
    minIntervalMs: 4000,
    // TUNED: 80 chars - backchannels make sense for medium+ length messages
    minUserMessageLength: 80,
    // TUNED: 25% - one in four long messages gets a backchannel
    // Higher felt intrusive, lower felt disconnected
    probability: 0.25,
  },

  silence: {
    // TUNED: 3.5s before soft backchannel - gives space for thinking
    backchannelThresholdMs: 3500,
    // TUNED: 5s before gentle prompt - after backchannel might have fired
    gentlePromptThresholdMs: 5000,
    // TUNED: 2x patience after personal sharing - critical for trust
    personalSharingPatienceMultiplier: 2.0,
    // TUNED: 2.5x patience during high emotion - never rush emotional moments
    highEmotionPatienceMultiplier: 2.5,
  },

  memory: {
    enabled: true,
    // TUNED: 5 turns before callbacks - need enough context
    minTurnsBeforeCallback: 5,
    // TUNED: 18% callback probability - special when they happen
    callbackProbability: 0.18,
    // TUNED: 25% thread return - balances continuity with new topics
    threadReturnProbability: 0.25,
    // TUNED: 30% commitment follow-up - important for trust
    commitmentFollowUpProbability: 0.3,
    maxTrackedStatements: 20,
  },

  questions: {
    enabled: true,
    // TUNED: 30% follow-up - not every response needs a question
    followUpProbability: 0.3,
    // TUNED: Avoid same type within 4 questions - more diversity
    typeRepeatAvoidance: 4,
    // TUNED: Reflective questions after turn 6 - once rapport established
    reflectiveDepthThreshold: 6,
  },

  emotional: {
    echoEnabled: true,
    // TUNED: 0.4 threshold - catch moderately strong emotions
    highIntensityThreshold: 0.4,
    vocabularyMirroringEnabled: true,
  },

  global: {
    enabled: true,
    debugLogging: false,
    // TUNED: 2 turns warmup - start humanizing sooner
    warmupTurns: 2,
    // TUNED: 40% reduction during warmup - still some personality early
    warmupReduction: 0.4,
  },
};

// ============================================================================
// CONFIG STATE
// ============================================================================

let currentConfig: HumanizingConfig = { ...DEFAULT_CONFIG };

// ============================================================================
// CONFIG FUNCTIONS
// ============================================================================

/**
 * Get the current humanizing configuration
 */
export function getHumanizingConfig(): Readonly<HumanizingConfig> {
  return currentConfig;
}

/**
 * Update humanizing configuration (deep merge)
 */
export function updateHumanizingConfig(updates: DeepPartial<HumanizingConfig>): void {
  currentConfig = deepMerge(currentConfig, updates);

  if (currentConfig.global.debugLogging) {
    getLogger().info({ config: currentConfig }, 'Humanizing config updated');
  }
}

/**
 * Reset configuration to defaults
 */
export function resetHumanizingConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}

/**
 * Get effective frequency/probability considering warmup
 */
export function getEffectiveRate(baseRate: number, turnNumber: number): number {
  if (!currentConfig.global.enabled) return 0;

  if (turnNumber < currentConfig.global.warmupTurns) {
    return baseRate * currentConfig.global.warmupReduction;
  }

  return baseRate;
}

/**
 * Check if a feature should be applied this turn
 */
export function shouldApplyFeature(
  featureKey: keyof HumanizingConfig,
  probability: number,
  turnNumber: number
): boolean {
  if (!currentConfig.global.enabled) return false;

  const effectiveRate = getEffectiveRate(probability, turnNumber);
  return Math.random() < effectiveRate;
}

// ============================================================================
// PRESET CONFIGURATIONS
// ============================================================================

/**
 * Preset configurations for different use cases
 */
export const HUMANIZING_PRESETS = {
  /**
   * Minimal - Very subtle humanization
   * Good for: formal/professional interactions, efficiency-focused users
   */
  minimal: {
    disfluency: { frequency: 0.04 },
    hedging: { adviceHedgingRate: 0.08 },
    backchannel: { probability: 0.1, minIntervalMs: 6000 },
    memory: { callbackProbability: 0.1 },
    questions: { followUpProbability: 0.15 },
    silence: { backchannelThresholdMs: 5000, gentlePromptThresholdMs: 8000 },
  } as DeepPartial<HumanizingConfig>,

  /**
   * Natural - Balanced, production-ready
   * Good for: most conversations, general users
   * TUNED to match DEFAULT_CONFIG
   */
  natural: {
    disfluency: { frequency: 0.12 },
    hedging: { adviceHedgingRate: 0.2 },
    backchannel: { probability: 0.25 },
    memory: { callbackProbability: 0.18 },
    questions: { followUpProbability: 0.3 },
  } as DeepPartial<HumanizingConfig>,

  /**
   * Conversational - More casual, friendly
   * Good for: Jordan, Peter, relationship-building
   */
  conversational: {
    disfluency: { frequency: 0.18, personaStyle: 'conversational' as const },
    hedging: { adviceHedgingRate: 0.25 },
    backchannel: { probability: 0.35, minIntervalMs: 3500 },
    memory: { callbackProbability: 0.25, threadReturnProbability: 0.35 },
    questions: { followUpProbability: 0.4 },
    emotional: { vocabularyMirroringEnabled: true },
  } as DeepPartial<HumanizingConfig>,

  /**
   * Therapeutic - For supportive, coaching personas
   * Good for: Ferni, emotional support, coaching moments
   * TUNED: More patience, gentler interventions
   */
  therapeutic: {
    disfluency: { frequency: 0.08 }, // Fewer disfluencies - stability matters
    hedging: { adviceHedgingRate: 0.35, defaultStrength: 'soft' as const },
    backchannel: { probability: 0.35, minIntervalMs: 5000 }, // Slower but present
    silence: {
      backchannelThresholdMs: 4500, // More patience
      gentlePromptThresholdMs: 7000,
      personalSharingPatienceMultiplier: 2.5,
      highEmotionPatienceMultiplier: 3.0, // Maximum patience
    },
    memory: { callbackProbability: 0.25 }, // Memory callbacks build trust
    questions: { followUpProbability: 0.35, reflectiveDepthThreshold: 4 }, // Earlier reflection
    emotional: { echoEnabled: true, vocabularyMirroringEnabled: true, highIntensityThreshold: 0.3 },
  } as DeepPartial<HumanizingConfig>,

  /**
   * Expert - For authoritative personas
   * Good for: Jack Bogle, financial expertise, decisiveness
   */
  expert: {
    disfluency: { frequency: 0.06 }, // Confident, minimal hesitation
    hedging: { adviceHedgingRate: 0.12, predictionHedgingRate: 0.25 }, // Hedge predictions more than advice
    backchannel: { probability: 0.2 },
    memory: { callbackProbability: 0.22 }, // Remember what matters
    questions: { followUpProbability: 0.25 },
    global: { warmupTurns: 1, warmupReduction: 0.3 }, // Quick to personality
  } as DeepPartial<HumanizingConfig>,

  /**
   * Warm - For friendly, approachable personas
   * Good for: Maya, Alex, building rapport
   */
  warm: {
    disfluency: { frequency: 0.14, personaStyle: 'natural' as const },
    hedging: { adviceHedgingRate: 0.22, defaultStrength: 'soft' as const },
    backchannel: { probability: 0.3, minIntervalMs: 3500 },
    memory: { callbackProbability: 0.2, commitmentFollowUpProbability: 0.35 },
    questions: { followUpProbability: 0.35 },
    emotional: { echoEnabled: true, highIntensityThreshold: 0.35 },
  } as DeepPartial<HumanizingConfig>,

  /**
   * Disabled - All humanization off (for testing)
   */
  disabled: {
    global: { enabled: false },
  } as DeepPartial<HumanizingConfig>,
};

/**
 * Apply a preset configuration
 */
export function applyPreset(preset: keyof typeof HUMANIZING_PRESETS): void {
  updateHumanizingConfig(HUMANIZING_PRESETS[preset]);
  getLogger().info({ preset }, 'Applied humanizing preset');
}

/**
 * Get recommended preset for a persona
 * TUNED: Each persona gets a fitting humanization style
 */
export function getRecommendedPreset(personaId: string): keyof typeof HUMANIZING_PRESETS {
  const presetMap: Record<string, keyof typeof HUMANIZING_PRESETS> = {
    // Therapeutic personas - patience and empathy
    ferni: 'therapeutic',

    // Expert personas - authority and decisiveness
    'nayan-patel': 'expert',
    'jack-b': 'expert', // Alias

    // Conversational personas - friendly and engaged
    'peter-john': 'conversational',
    'jordan-taylor': 'conversational',

    // Warm personas - approachable and supportive
    'maya-santos': 'warm',
    'alex-chen': 'warm',

    // Generic/fallback
    'generic-advisor': 'natural',
  };

  return presetMap[personaId.toLowerCase()] || 'natural';
}

// ============================================================================
// PERSONA-SPECIFIC CONFIG STORAGE
// ============================================================================

/**
 * Per-persona config overrides loaded from bundles
 */
const personaConfigs = new Map<string, DeepPartial<HumanizingConfig>>();

/**
 * Register humanization config from a persona bundle.
 * Called by the bundle adapter when loading a persona.
 */
export function registerBundleHumanization(
  personaId: string,
  bundleConfig: {
    preset?: string;
    overrides?: {
      disfluency?: { enabled?: boolean; frequency?: number };
      hedging?: { enabled?: boolean; frequency?: number };
      active_listening?: {
        enabled?: boolean;
        backchannel_probability?: number;
        emotional_echo_probability?: number;
        vocabulary_mirroring_probability?: number;
      };
      conversational_memory?: { enabled?: boolean; callback_probability?: number };
      questions?: { enabled?: boolean; injection_probability?: number };
    };
    warmup?: { turns?: number; reduction?: number };
    context_modifiers?: {
      serious_topics_reduction?: number;
      personal_sharing_warmth_boost?: number;
      high_emotion_breathing_boost?: number;
    };
  }
): void {
  const config: DeepPartial<HumanizingConfig> = {};

  // Apply preset first
  if (
    bundleConfig.preset &&
    HUMANIZING_PRESETS[bundleConfig.preset as keyof typeof HUMANIZING_PRESETS]
  ) {
    Object.assign(
      config,
      HUMANIZING_PRESETS[bundleConfig.preset as keyof typeof HUMANIZING_PRESETS]
    );
  }

  // Apply overrides
  if (bundleConfig.overrides) {
    if (bundleConfig.overrides.disfluency) {
      config.disfluency = {
        ...(config.disfluency || {}),
        enabled: bundleConfig.overrides.disfluency.enabled,
        frequency: bundleConfig.overrides.disfluency.frequency,
      };
    }

    if (bundleConfig.overrides.hedging) {
      config.hedging = {
        ...(config.hedging || {}),
        adviceHedgingRate: bundleConfig.overrides.hedging.frequency,
      };
    }

    if (bundleConfig.overrides.active_listening) {
      const al = bundleConfig.overrides.active_listening;
      config.backchannel = {
        ...(config.backchannel || {}),
        enabled: al.enabled,
        probability: al.backchannel_probability,
      };
      config.emotional = {
        ...(config.emotional || {}),
        echoEnabled: al.enabled,
        vocabularyMirroringEnabled: (al.vocabulary_mirroring_probability ?? 0) > 0,
      };
    }

    if (bundleConfig.overrides.conversational_memory) {
      config.memory = {
        ...(config.memory || {}),
        enabled: bundleConfig.overrides.conversational_memory.enabled,
        callbackProbability: bundleConfig.overrides.conversational_memory.callback_probability,
      };
    }

    if (bundleConfig.overrides.questions) {
      config.questions = {
        ...(config.questions || {}),
        enabled: bundleConfig.overrides.questions.enabled,
        followUpProbability: bundleConfig.overrides.questions.injection_probability,
      };
    }
  }

  // Apply warmup settings
  if (bundleConfig.warmup) {
    config.global = {
      ...(config.global || {}),
      warmupTurns: bundleConfig.warmup.turns,
      warmupReduction: bundleConfig.warmup.reduction,
    };
  }

  // Apply context modifiers (stored separately, used by SSML integration)
  if (bundleConfig.context_modifiers) {
    // Store these in a way that can be retrieved later
    (config as any)._contextModifiers = bundleConfig.context_modifiers;
  }

  personaConfigs.set(personaId, config);
  getLogger().debug(
    { personaId, hasPreset: !!bundleConfig.preset },
    'Registered bundle humanization config'
  );
}

/**
 * Get the humanizing config for a specific persona.
 * Merges the base config with any persona-specific overrides.
 */
export function getPersonaHumanizingConfig(personaId: string): Readonly<HumanizingConfig> {
  const baseConfig = getHumanizingConfig();
  const personaOverrides = personaConfigs.get(personaId);

  if (!personaOverrides) {
    // No persona-specific config, use recommended preset
    const preset = getRecommendedPreset(personaId);
    return deepMerge(baseConfig, HUMANIZING_PRESETS[preset]);
  }

  return deepMerge(baseConfig, personaOverrides);
}

/**
 * Get context modifiers for a specific persona
 */
export function getPersonaContextModifiers(personaId: string): {
  serious_topics_reduction?: number;
  personal_sharing_warmth_boost?: number;
  high_emotion_breathing_boost?: number;
} {
  const personaOverrides = personaConfigs.get(personaId) as any;
  return (
    personaOverrides?._contextModifiers || {
      serious_topics_reduction: 0.5,
      personal_sharing_warmth_boost: 1.3,
      high_emotion_breathing_boost: 1.3,
    }
  );
}

/**
 * Clear all persona-specific configs (for testing)
 */
export function clearPersonaConfigs(): void {
  personaConfigs.clear();
}

// ============================================================================
// HELPER TYPES
// ============================================================================

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null
    ) {
      result[key] = deepMerge(
        targetValue as object,
        sourceValue as DeepPartial<object>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

export default {
  getHumanizingConfig,
  updateHumanizingConfig,
  resetHumanizingConfig,
  getEffectiveRate,
  shouldApplyFeature,
  applyPreset,
  getRecommendedPreset,
  registerBundleHumanization,
  getPersonaHumanizingConfig,
  getPersonaContextModifiers,
  clearPersonaConfigs,
  HUMANIZING_PRESETS,
};
