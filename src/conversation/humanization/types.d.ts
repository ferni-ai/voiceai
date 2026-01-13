/**
 * Humanization Types
 *
 * Shared types for the advanced humanization subsystem.
 *
 * @module @ferni/humanization/types
 */
/**
 * Placement of humanization injection in response
 */
export type InjectionPlacement = 'opening' | 'mid_sentence' | 'between_sentences' | 'before_key_point' | 'closing';
/**
 * Intensity of humanization effect
 */
export type HumanizationIntensity = 'subtle' | 'moderate' | 'pronounced';
/**
 * Base humanization injection result
 */
export interface HumanizationInjection {
    /** Type of humanization */
    type: string;
    /** Content to inject */
    content: string;
    /** SSML version */
    ssml: string;
    /** Where to place it */
    placement: InjectionPlacement;
    /** Why this was triggered */
    reason: string;
}
/**
 * Full humanization context for decision-making
 */
export interface HumanizationContext {
    userMessage: string;
    userWordCount: number;
    userEmotion?: string;
    userEnergy: 'high' | 'medium' | 'low';
    responseText: string;
    responseWordCount: number;
    responseComplexity: number;
    isGivingAdvice: boolean;
    isEmotionalContent: boolean;
    turnCount: number;
    sessionMinutes: number;
    comfortLevel: number;
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    personaId: string;
    recentTopics: string[];
    recentHumanizations: string[];
}
/**
 * Decision result for whether to apply humanization
 */
export interface HumanizationDecision {
    shouldApply: boolean;
    reason: string;
    cooldownTurns?: number;
}
/**
 * Tracks humanization usage within a session
 */
export interface HumanizationSessionState {
    sessionId: string;
    selfCorrectionCount: number;
    disfluencyCount: number;
    catchingYourselfCount: number;
    lastSelfCorrectionTurn: number;
    lastDisfluencyTurn: number;
    lastCatchingYourselfTurn: number;
    currentTurn: number;
    sessionStartTime: number;
    userPhoneticPatterns: string[];
    userFillerPreference: string | null;
}
/**
 * Base configuration for humanization features
 */
export interface HumanizationFeatureConfig {
    /** Is this feature enabled? */
    enabled: boolean;
    /** Base probability of triggering (0-1) */
    baseProbability: number;
    /** Maximum uses per session */
    maxPerSession: number;
    /** Minimum turns between uses */
    cooldownTurns: number;
    /** Minimum comfort level required */
    minComfortLevel: number;
    /** Minimum turn to start using */
    minTurnNumber: number;
}
/**
 * Configuration for all humanization features
 */
export interface HumanizationConfig {
    selfCorrection: HumanizationFeatureConfig & {
        /** Multiplier for complex content */
        complexityMultiplier: number;
        /** Multiplier for emotional content */
        emotionalMultiplier: number;
    };
    disfluency: HumanizationFeatureConfig & {
        /** Types of disfluencies to use */
        enabledTypes: Array<'filled_pause' | 'discourse_marker' | 'lengthening' | 'false_start' | 'repetition'>;
        /** Never use for simple responses */
        skipSimpleResponses: boolean;
    };
    phoneticMirroring: HumanizationFeatureConfig & {
        /** Minimum samples to start mirroring */
        minSamples: number;
        /** How aggressively to mirror (0-1) */
        mirroringStrength: number;
    };
    catchingYourself: HumanizationFeatureConfig & {
        /** Types of catching yourself to use */
        enabledTypes: Array<'talking_too_much' | 'circling_back' | 'noticing_pattern' | 'checking_understanding' | 'energy_mismatch'>;
    };
}
/**
 * Persona-specific humanization patterns
 */
export interface PersonaHumanizationProfile {
    personaId: string;
    selfCorrectionPatterns: {
        restart: string[];
        midSentence: string[];
        refinement: string[];
    };
    disfluencyPreferences: {
        filledPauses: string[];
        discourseMarkers: string[];
        probability: number;
    };
    catchingYourselfPatterns: {
        talkingTooMuch: string[];
        circlingBack: string[];
        noticingPattern: string[];
        checkingUnderstanding: string[];
        energyMismatch: string[];
    };
    phoneticStyle: {
        usesReductions: boolean;
        regionalMarkers: string[];
        preferredFillers: string[];
    };
}
/**
 * Result of applying humanization to a response
 */
export interface HumanizedResponseResult {
    /** Original response */
    original: string;
    /** Humanized response (plain text) */
    text: string;
    /** Humanized response (SSML) */
    ssml: string;
    /** What was applied */
    appliedHumanizations: HumanizationInjection[];
    /** Features that were considered but not applied */
    skippedFeatures: Array<{
        feature: string;
        reason: string;
    }>;
}
/**
 * Default humanization configuration
 */
export declare const DEFAULT_HUMANIZATION_CONFIG: HumanizationConfig;
//# sourceMappingURL=types.d.ts.map