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
 * Each persona can override defaults via getPersonaTuning(personaId)
 *
 * @module @ferni/conversation/humanization-tuning
 */
/**
 * Default humanization tuning - balanced for natural conversation
 */
export declare const DEFAULT_TUNING: {
    presence: {
        /** Subtle breathing sounds, sighs */
        breathSound: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Energy/mood changes over conversation */
        moodSignal: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Physical awareness - "Let me shift...", time-of-day */
        physicalPresence: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Random thoughts that pop up */
        spontaneousThought: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
    };
    attunement: {
        /** The "they see me" moment - detecting hesitation/deflection */
        firstTurnNoticing: {
            probability: number;
            turnOneBoost: number;
            maxTurn: number;
        };
        /** Respond to detected disengagement */
        disengagementResponse: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Respond to high engagement */
        engagementCelebration: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
    };
    naturalness: {
        /** Base rate for any speech modification */
        baseFrequency: number;
        /** Um, uh, so, like */
        fillerProbability: number;
        /** "I think", "maybe" */
        hedgeProbability: number;
        /** Thinking phrases */
        thinkingProbability: number;
        /** Self-correction "wait, let me rephrase" */
        selfCorrection: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Context modifiers */
        seriousContextMultiplier: number;
        earlyTurnMultiplier: number;
        distressedUserMultiplier: number;
    };
    reactions: {
        /** Excitement at breakthrough moments */
        excitementInterruption: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Acknowledging when user changed our mind */
        mindChange: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Live reactions to surprising/moving content */
        liveReaction: {
            probability: number;
            weakTriggerProbability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Light playful moments */
        playfulness: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
            minEmotionalLoad: number;
            minTurn: number;
        };
    };
    memory: {
        /** "Earlier you mentioned..." callbacks */
        memoryCallback: {
            probability: number;
            minTurn: number;
        };
        /** "Last time we talked about..." (cross-session) */
        anticipation: {
            probability: number;
            sessionOpeningProbability: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Inside jokes and patterns */
        runningJoke: {
            probability: number;
            minPatternCount: number;
            cooldownTurns: number;
            maxPerSession: number;
        };
        /** Surfacing contradictions gently */
        contradiction: {
            probability: number;
            cooldownTurns: number;
            maxPerSession: number;
            requiresRelationship: boolean;
        };
    };
    questions: {
        /** Add follow-up question at end */
        followUpQuestion: {
            probability: number;
            skipIfUserAskedQuestion: boolean;
        };
    };
    silence: {
        /** Use intentional silence before heavy responses */
        presencePause: {
            probability: number;
            minDurationMs: number;
            maxDurationMs: number;
        };
    };
    global: {
        /** Max humanization effects per response */
        maxEffectsPerResponse: number;
        /** Turn threshold for "rapport established" */
        rapportTurnThreshold: number;
        /** Session minutes before "late session" behaviors */
        lateSessionMinutes: number;
        /** Turn count before energy naturally dips */
        energyDipTurnThreshold: number;
    };
};
export type HumanizationTuning = typeof DEFAULT_TUNING;
/**
 * Flattened humanization config for easy access in effects.
 *
 * Usage:
 * ```typescript
 * import { HUMANIZATION_CONFIG } from './humanization-tuning.js';
 *
 * const prob = HUMANIZATION_CONFIG.probabilities.breathSound;
 * const cooldown = HUMANIZATION_CONFIG.cooldowns.breathSound;
 * const max = HUMANIZATION_CONFIG.maxPerSession.breathSound;
 * ```
 */
export declare const HUMANIZATION_CONFIG: {
    readonly probabilities: {
        readonly breathSound: number;
        readonly moodDrift: number;
        readonly physicalPresence: number;
        readonly spontaneousThought: number;
        readonly firstTurnNotice: number;
        readonly anticipation: number;
        readonly engagementCelebration: number;
        readonly speechFillers: number;
        readonly selfCorrection: number;
        readonly hedging: number;
        readonly thinkingOutLoud: number;
        readonly excitementInterruption: number;
        readonly liveReaction: number;
        readonly mindChange: number;
        readonly playfulness: number;
        readonly memoryCallback: number;
        readonly runningJoke: number;
        readonly followUpQuestion: number;
        readonly presencePause: number;
    };
    readonly cooldowns: {
        readonly breathSound: number;
        readonly moodDrift: number;
        readonly physicalPresence: number;
        readonly spontaneousThought: number;
        readonly firstTurnNotice: number;
        readonly anticipation: number;
        readonly excitementInterruption: number;
        readonly liveReaction: number;
        readonly mindChange: number;
        readonly playfulness: number;
        readonly memoryCallback: 4;
        readonly runningJoke: number;
    };
    readonly maxPerSession: {
        readonly breathSound: number;
        readonly moodDrift: number;
        readonly physicalPresence: number;
        readonly spontaneousThought: number;
        readonly firstTurnNotice: 2;
        readonly anticipation: number;
        readonly excitementInterruption: number;
        readonly liveReaction: number;
        readonly mindChange: number;
        readonly playfulness: number;
        readonly memoryCallback: 5;
        readonly runningJoke: number;
    };
    readonly global: {
        readonly maxEffectsPerTurn: number;
        readonly minTurnsBetweenAny: 1;
    };
};
/**
 * Get tuning for a specific persona (merges defaults with overrides)
 */
export declare function getPersonaTuning(personaId: string): HumanizationTuning;
/**
 * Get a specific tuning value with persona override
 */
export declare function getTuningValue<K extends keyof HumanizationTuning>(personaId: string, category: K): HumanizationTuning[K];
/**
 * Check if a feature should fire based on probability
 * Uses deterministic hashing for reproducibility
 */
export declare function shouldFireFeature(probability: number, seed: string): boolean;
/**
 * Get effective probability with context modifiers
 */
export declare function getEffectiveProbability(baseProbability: number, context: {
    isSeriousContext?: boolean;
    isDistressedUser?: boolean;
    turnNumber?: number;
    personaId?: string;
}): number;
export declare const TUNING_PRESETS: {
    /** More humanization - for testing engagement */
    readonly expressive: {
        readonly multiplier: 1.3;
        readonly description: "More frequent humanization effects";
    };
    /** Less humanization - cleaner responses */
    readonly minimal: {
        readonly multiplier: 0.5;
        readonly description: "Reduced humanization for clarity";
    };
    /** Default balanced */
    readonly balanced: {
        readonly multiplier: 1;
        readonly description: "Default balanced humanization";
    };
    /** Heavy emphasis on attunement/empathy */
    readonly empathetic: {
        readonly multiplier: 1;
        readonly overrides: {
            readonly attunement: {
                readonly firstTurnNoticing: {
                    readonly probability: 0.7;
                };
            };
            readonly silence: {
                readonly presencePause: {
                    readonly probability: 0.4;
                };
            };
            readonly reactions: {
                readonly playfulness: {
                    readonly probability: 0.08;
                };
            };
        };
        readonly description: "More attunement, less playfulness";
    };
};
/**
 * Apply a preset multiplier to all probability values recursively
 *
 * Finds all properties containing "probability", "Probability", or "Prob" and scales them.
 * Values are clamped to [0, 1].
 *
 * @param tuning - The tuning object to scale
 * @param multiplier - Scale factor (e.g., 1.3 for 30% increase, 0.5 for 50% decrease)
 */
export declare function applyPresetMultiplier(tuning: HumanizationTuning, multiplier: number): HumanizationTuning;
//# sourceMappingURL=humanization-tuning.d.ts.map