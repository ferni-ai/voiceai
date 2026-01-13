/**
 * Alex Chen Speech Traits
 *
 * Character-specific SSML processing functions that define Alex's unique
 * voice personality: clear efficiency, organized communication, and warmth
 * hidden beneath practicality.
 *
 * Alex is Ferni's communications and organization specialist - Chinese heritage,
 * grew up in the family restaurant Chen's Garden, believes "clear is kind,"
 * and has a secretly emotional core beneath their efficient exterior.
 *
 * @module personas/bundles/alex-chen/speech-traits
 */
/**
 * Add special treatment for Alex's signature catchphrases
 * These phrases get clarity and emphasis
 */
export declare function addCatchphraseEmphasis(text: string, _emotion: string): string;
/**
 * Add clarity to organization-related terminology
 * Alex has specific ways of talking about systems and processes
 */
export declare function addOrganizationVocabulary(text: string, _emotion: string): string;
/**
 * Add clarity to instruction-giving moments
 * Alex is direct and clear when explaining
 */
export declare function addInstructionClarity(text: string, _emotion: string): string;
/**
 * Add calming presence for overwhelmed moments
 * Voice guidance: "SLOWER, not faster" when anxious
 *
 * When they're overwhelmed, go SLOWER, not faster.
 */
export declare function addCalmingPresence(text: string, _emotion: string): string;
/**
 * Add emphasis to efficiency-focused statements
 * Alex values respecting people's time - but efficiency is LOVE, not cold
 */
export declare function addEfficiencyEmphasis(text: string, _emotion: string): string;
/**
 * Add warmth when Alex's softer side emerges
 * Hidden beneath efficiency is genuine care
 */
export declare function addWarmMoments(text: string, emotion: string): string;
/**
 * Add directness to Alex's questions
 * Alex asks pointed, clear questions
 */
export declare function addDirectQuestions(text: string, _emotion: string): string;
/**
 * Add professional acknowledgments
 * Alex confirms understanding efficiently
 */
export declare function addProfessionalAcknowledgment(text: string, _emotion: string): string;
/**
 * Add firmness to boundary-related statements
 * Alex learned boundaries the hard way
 */
export declare function addBoundaryFirmness(text: string, _emotion: string): string;
/**
 * Add clear transitions
 * Alex guides conversations with structure
 */
export declare function addClearTransitions(text: string, _emotion: string): string;
/**
 * Add slight warmth when mentioning plant names
 * Alex's plants have personalities
 */
export declare function addPlantWarmth(text: string, _emotion: string): string;
/**
 * Add natural thinking sounds and pauses
 * Alex thinks efficiently - short processing sounds before solutions
 */
export declare function addThinkingSounds(text: string, _emotion: string): string;
/**
 * Add efficient active listening cues
 * Alex acknowledges to signal tracking, not to fill space
 */
export declare function addActiveListeningInjection(text: string, emotion: string): string;
/**
 * Add extra calming presence for overwhelm situations
 * Voice guidance: "SLOWER, not faster" when anxious
 *
 * When they're drowning in to-dos, Alex goes SLOWEST and warmest
 */
export declare function addOverwhelmSupport(text: string, _emotion: string): string;
/**
 * Apply all Alex Chen speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Alex's unique speech patterns to the text.
 *
 * Processing order:
 * 1. Check for overwhelm content first (most important)
 * 2. Apply calming presence and humanization
 * 3. Apply communication style
 * 4. Add warmth and nuance
 *
 * NOTE: Calming presence is TIER 1 - most important for Alex's purpose
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed (unused but kept for API compatibility)
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Alex Chen's speech traits applied
 */
export declare function applyAlexChenSpeechTraits(text: string, emotion: string, _baseSpeed: number, _laughterCount: number): string;
/**
 * Configuration for Alex Chen's speech traits
 */
export declare const ALEX_CHEN_SPEECH_CONFIG: {
    /** Base speech speed (calmer default - efficiency is love, not rush) */
    readonly baseSpeed: 0.92;
    /** Whether to enable calming presence (Alex's core purpose) */
    readonly enableCalmingPresence: true;
    /** Speed for calming moments (slower for anxiety) */
    readonly calmingSpeed: 0.85;
    /** Whether to enable instruction clarity */
    readonly enableInstructionClarity: true;
    /** Whether to enable warm moments */
    readonly enableWarmMoments: true;
    /** Probability of warm moments showing through (0-1) */
    readonly warmthProbability: 0.25;
    /** Whether to enable boundary language */
    readonly enableBoundaryLanguage: true;
    /** Whether to enable overwhelm support */
    readonly enableOverwhelmSupport: true;
    /** Whether to enable thinking sounds */
    readonly enableThinkingSounds: true;
    /** Whether to enable active listening injection */
    readonly enableActiveListening: true;
    /** Probability of active listening sounds (0-1, lower for efficiency) */
    readonly activeListeningProbability: 0.18;
};
//# sourceMappingURL=speech-traits.d.ts.map