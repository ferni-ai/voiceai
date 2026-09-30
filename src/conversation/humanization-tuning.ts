/**
 * Centralized Humanization Tuning Configuration
 *
 * All probability values, cooldowns, and feature toggles in ONE place.
 * This replaces the scattered magic numbers throughout the codebase.
 *
 * TUNING GUIDE:
 * - Higher probability = more frequent (0.0 to 1.0)
 * - Cooldown = minimum turns between same effect
 * - MaxPerSession = hard cap per conversation
 *
 * PERSONA PROFILES:
 * Each persona can override defaults (read them via getTuningValue(personaId, category))
 *
 * @module @ferni/conversation/humanization-tuning
 */

// ============================================================================
// CORE TUNING VALUES
// ============================================================================

/**
 * Default humanization tuning - balanced for natural conversation
 */
export const DEFAULT_TUNING = {
  // ==========================================================================
  // PRESENCE - Making the agent feel "alive"
  // ==========================================================================
  presence: {
    /** Subtle breathing sounds, sighs */
    breathSound: {
      probability: 0.32,
      cooldownTurns: 3,
      maxPerSession: 6,
    },
    /** Energy/mood changes over conversation */
    moodSignal: {
      probability: 0.2,
      cooldownTurns: 8,
      maxPerSession: 3,
    },
    /** Physical awareness - "Let me shift...", time-of-day */
    physicalPresence: {
      probability: 0.28,
      cooldownTurns: 7,
      maxPerSession: 3,
    },
    /** Random thoughts that pop up */
    spontaneousThought: {
      probability: 0.18,
      cooldownTurns: 4,
      maxPerSession: 4,
    },
  },

  // ==========================================================================
  // ATTUNEMENT - Reading and responding to the user
  // ==========================================================================
  attunement: {
    /** The "they see me" moment - detecting hesitation/deflection */
    firstTurnNoticing: {
      probability: 0.55, // Base probability
      turnOneBoost: 0.15, // Extra probability on turn 1
      maxTurn: 3, // Only active in first 3 turns
    },
    /** Respond to detected disengagement */
    disengagementResponse: {
      probability: 0.4,
      cooldownTurns: 6,
      maxPerSession: 4,
    },
    /** Respond to high engagement */
    engagementCelebration: {
      probability: 0.25,
      cooldownTurns: 6,
      maxPerSession: 4,
    },
  },

  // ==========================================================================
  // NATURALNESS - Speech imperfections that create authenticity
  // ==========================================================================
  naturalness: {
    /** Base rate for any speech modification */
    baseFrequency: 0.15,
    /** Um, uh, so, like */
    fillerProbability: 0.4, // 40% of baseFrequency triggers
    /** "I think", "maybe" */
    hedgeProbability: 0.3,
    /** Thinking phrases */
    thinkingProbability: 0.3,
    /** Self-correction "wait, let me rephrase" */
    selfCorrection: {
      probability: 0.12,
      cooldownTurns: 5,
      maxPerSession: 3,
    },
    /** Context modifiers */
    seriousContextMultiplier: 0.3, // 70% reduction in serious contexts
    earlyTurnMultiplier: 0.5, // 50% reduction in early turns
    distressedUserMultiplier: 0.5, // 50% reduction when user is distressed
  },

  // ==========================================================================
  // REACTIONS - Responding to what user said
  // ==========================================================================
  reactions: {
    /** Excitement at breakthrough moments */
    excitementInterruption: {
      probability: 0.45,
      cooldownTurns: 4,
      maxPerSession: 5,
    },
    /** Acknowledging when user changed our mind */
    mindChange: {
      probability: 0.5,
      cooldownTurns: 6,
      maxPerSession: 3,
    },
    /** Live reactions to surprising/moving content */
    liveReaction: {
      probability: 0.45, // For strong triggers
      weakTriggerProbability: 0.35,
      cooldownTurns: 2,
      maxPerSession: 4,
    },
    /** Light playful moments */
    playfulness: {
      probability: 0.15,
      cooldownTurns: 6,
      maxPerSession: 5,
      minEmotionalLoad: 0.4, // Don't be playful when heavy
      minTurn: 4, // Need rapport first
    },
  },

  // ==========================================================================
  // MEMORY - Relationship continuity
  // ==========================================================================
  memory: {
    /** "Earlier you mentioned..." callbacks */
    memoryCallback: {
      probability: 0.2,
      minTurn: 4,
    },
    /** "Last time we talked about..." (cross-session) */
    anticipation: {
      probability: 0.4, // When there IS something to anticipate
      sessionOpeningProbability: 0.6,
      cooldownTurns: 10,
      maxPerSession: 3,
    },
    /** Inside jokes and patterns */
    runningJoke: {
      probability: 0.15,
      minPatternCount: 3, // Pattern must occur 3+ times
      cooldownTurns: 12,
      maxPerSession: 2,
    },
    /** Surfacing contradictions gently */
    contradiction: {
      probability: 0.12,
      cooldownTurns: 10,
      maxPerSession: 2,
      requiresRelationship: true, // Not for strangers
    },
  },

  // ==========================================================================
  // QUESTIONS - Follow-up engagement
  // ==========================================================================
  questions: {
    /** Add follow-up question at end */
    followUpQuestion: {
      probability: 0.55,
      skipIfUserAskedQuestion: true,
    },
  },

  // ==========================================================================
  // SILENCE - Meaningful pauses
  // ==========================================================================
  silence: {
    /** Use intentional silence before heavy responses */
    presencePause: {
      probability: 0.25,
      minDurationMs: 300,
      maxDurationMs: 800,
    },
  },

  // ==========================================================================
  // GLOBAL LIMITS
  // ==========================================================================
  global: {
    /** Max humanization effects per response */
    maxEffectsPerResponse: 3,
    /** Turn threshold for "rapport established" */
    rapportTurnThreshold: 5,
    /** Session minutes before "late session" behaviors */
    lateSessionMinutes: 15,
    /** Turn count before energy naturally dips */
    energyDipTurnThreshold: 15,
  },
};

// Type for the tuning structure (without const assertion for flexibility)
export type HumanizationTuning = typeof DEFAULT_TUNING;

// ============================================================================
// PERSONA-SPECIFIC OVERRIDES
// ============================================================================

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] extends number ? number : T[P];
};

/**
 * Persona-specific tuning overrides
 * Only specify values that differ from DEFAULT_TUNING
 */
const PERSONA_OVERRIDES: Record<string, DeepPartial<typeof DEFAULT_TUNING>> = {
  ferni: {
    // Ferni: More empathetic, uses silence, less playful initially
    presence: {
      breathSound: { probability: 0.35 }, // More breathing
      physicalPresence: { probability: 0.3 },
    },
    attunement: {
      firstTurnNoticing: { probability: 0.6 }, // More perceptive
    },
    naturalness: {
      baseFrequency: 0.12, // Slightly less disfluent - more composed
    },
    silence: {
      presencePause: { probability: 0.35 }, // More comfortable with silence
    },
  },

  'nayan-patel': {
    // Nayan: Wise, measured, fewer imperfections
    presence: {
      breathSound: { probability: 0.2 },
      spontaneousThought: { probability: 0.1 },
    },
    naturalness: {
      baseFrequency: 0.08, // Very composed speech
      selfCorrection: { probability: 0.08 },
    },
    reactions: {
      playfulness: { probability: 0.08 }, // More serious
    },
    silence: {
      presencePause: { probability: 0.4 }, // Comfortable with silence
    },
  },

  'peter-john': {
    // Peter: Energetic, curious, more expressive
    presence: {
      spontaneousThought: { probability: 0.25 }, // More spontaneous
    },
    naturalness: {
      baseFrequency: 0.18, // More natural speech imperfections
    },
    reactions: {
      excitementInterruption: { probability: 0.55 }, // Gets excited easily
      liveReaction: { probability: 0.55 },
      playfulness: { probability: 0.22 },
    },
    attunement: {
      engagementCelebration: { probability: 0.35 },
    },
  },

  'maya-santos': {
    // Maya: Warm, encouraging, habit-focused
    presence: {
      physicalPresence: { probability: 0.25 },
    },
    reactions: {
      excitementInterruption: { probability: 0.4 },
      playfulness: { probability: 0.18 },
    },
    naturalness: {
      baseFrequency: 0.14,
    },
  },

  'alex-chen': {
    // Alex: Professional, efficient, clear
    presence: {
      breathSound: { probability: 0.22 },
      spontaneousThought: { probability: 0.12 },
    },
    naturalness: {
      baseFrequency: 0.1, // More polished
    },
    reactions: {
      playfulness: { probability: 0.12 },
    },
  },

  'jordan-taylor': {
    // Jordan: High energy, enthusiastic, playful
    presence: {
      spontaneousThought: { probability: 0.22 },
    },
    naturalness: {
      baseFrequency: 0.16,
    },
    reactions: {
      excitementInterruption: { probability: 0.55 },
      liveReaction: { probability: 0.55 },
      playfulness: { probability: 0.25 }, // Most playful
    },
  },
};

// ============================================================================
// TUNING API
// ============================================================================

/**
 * Get tuning for a specific persona (merges defaults with overrides)
 */
function getPersonaTuning(personaId: string): HumanizationTuning {
  const overrides = PERSONA_OVERRIDES[personaId];
  if (!overrides) {
    return DEFAULT_TUNING;
  }

  return deepMerge(DEFAULT_TUNING, overrides) as HumanizationTuning;
}

/**
 * Get a specific tuning value with persona override
 */
export function getTuningValue<K extends keyof HumanizationTuning>(
  personaId: string,
  category: K
): HumanizationTuning[K] {
  return getPersonaTuning(personaId)[category];
}

// ============================================================================
// UTILITY
// ============================================================================

function deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key as keyof typeof source];
    const targetValue = target[key as keyof T];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(sourceValue)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue as object,
        sourceValue as DeepPartial<typeof targetValue>
      );
    } else if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return result;
}

// ============================================================================
// PRESETS (for quick A/B testing)
// ============================================================================

export const TUNING_PRESETS = {
  /** More humanization - for testing engagement */
  expressive: {
    multiplier: 1.3,
    description: 'More frequent humanization effects',
  },
  /** Less humanization - cleaner responses */
  minimal: {
    multiplier: 0.5,
    description: 'Reduced humanization for clarity',
  },
  /** Default balanced */
  balanced: {
    multiplier: 1.0,
    description: 'Default balanced humanization',
  },
  /** Heavy emphasis on attunement/empathy */
  empathetic: {
    multiplier: 1.0,
    overrides: {
      attunement: { firstTurnNoticing: { probability: 0.7 } },
      silence: { presencePause: { probability: 0.4 } },
      reactions: { playfulness: { probability: 0.08 } },
    },
    description: 'More attunement, less playfulness',
  },
} as const;

/**
 * Apply a preset multiplier to all probability values recursively
 *
 * Finds all properties containing "probability", "Probability", or "Prob" and scales them.
 * Values are clamped to [0, 1].
 *
 * @param tuning - The tuning object to scale
 * @param multiplier - Scale factor (e.g., 1.3 for 30% increase, 0.5 for 50% decrease)
 */
export function applyPresetMultiplier(
  tuning: HumanizationTuning,
  multiplier: number
): HumanizationTuning {
  if (multiplier === 1.0) return tuning;

  return scaleProbabilitiesRecursive(tuning, multiplier) as HumanizationTuning;
}

/**
 * Recursively walk an object and scale all probability values
 */
function scaleProbabilitiesRecursive<T>(obj: T, multiplier: number): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj))
    return obj.map((item) => scaleProbabilitiesRecursive(item, multiplier)) as T;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Check if this key is a probability value
    const isProbabilityKey =
      key === 'probability' ||
      key.endsWith('Probability') ||
      key.endsWith('Prob') ||
      key === 'baseFrequency'; // Also scale baseFrequency

    if (isProbabilityKey && typeof value === 'number') {
      // Scale and clamp to [0, 1]
      result[key] = Math.max(0, Math.min(1, value * multiplier));
    } else if (typeof value === 'object' && value !== null) {
      // Recursively process nested objects
      result[key] = scaleProbabilitiesRecursive(value, multiplier);
    } else {
      // Keep non-probability values unchanged
      result[key] = value;
    }
  }

  return result as T;
}
