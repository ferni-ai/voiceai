/**
 * Ferni Speech Traits
 *
 * Character-specific SSML processing functions that define Ferni's unique
 * voice personality: warm presence, thoughtful pacing, kintsugi philosophy,
 * and the gentle wisdom of someone who's lived many lives.
 *
 * Ferni is the heart of the team - narrative-driven, Wyoming-patient,
 * believes in second chances, and carries the weight of experience
 * (tsunami survival, blended family, cross-cultural wisdom) with grace.
 *
 * @module personas/bundles/ferni/speech-traits
 */
/**
 * Add special treatment for Ferni's signature catchphrases
 * These phrases get warmth, weight, and deliberate pacing
 */
export declare function addCatchphraseEmphasis(text: string, _emotion: string): string;
/**
 * Add weight to moments referencing Ferni's personal history
 * These are the stories that shaped who Ferni is
 */
export declare function addPersonalHistoryWeight(text: string, _emotion: string): string;
/**
 * Add gentle wisdom cadence for reflective moments
 * Ferni's wisdom is earned, not lectured
 */
export declare function addWisdomCadence(text: string, _emotion: string): string;
/**
 * Add warmth to emotionally present moments
 * Ferni sits WITH people in their feelings
 */
export declare function addEmotionalPresence(text: string, emotion: string): string;
/**
 * Add natural thinking sounds and pauses
 * Ferni thinks out loud with warmth
 */
export declare function addThinkingSounds(text: string, _emotion: string): string;
/**
 * Add genuine curiosity to questions
 * Ferni asks because they truly want to know
 */
export declare function addCuriousQuestions(text: string, _emotion: string): string;
/**
 * Add warmth to celebration moments
 * Ferni celebrates with you, not at you
 */
export declare function addCelebrationWarmth(text: string, emotion: string): string;
/**
 * Add softer presence for vulnerable moments
 * 2am gets the same warmth as noon
 */
export declare function addLateNightPresence(text: string, _emotion: string): string;
/**
 * Add active listening sounds
 * Ferni shows they're engaged with verbal acknowledgments
 */
export declare function addActiveListeningSounds(text: string, emotion: string): string;
/**
 * Add natural transitions
 * Ferni guides conversations with gentle flow
 */
export declare function addTransitionPhrases(text: string, _emotion: string): string;
/**
 * Apply all Ferni speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Ferni's unique speech patterns to the text.
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed (unused but kept for API compatibility)
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Ferni's speech traits applied
 */
export declare function applyFerniSpeechTraits(text: string, emotion: string, _baseSpeed: number, _laughterCount: number): string;
/**
 * Configuration for Ferni's speech traits
 */
export declare const FERNI_SPEECH_CONFIG: {
    /** Base speech speed (deliberate, warm presence) */
    readonly baseSpeed: 0.95;
    /** Whether to enable personal history weight */
    readonly enablePersonalHistoryWeight: true;
    /** Whether to enable wisdom cadence */
    readonly enableWisdomCadence: true;
    /** Whether to enable emotional presence */
    readonly enableEmotionalPresence: true;
    /** Probability of thinking sounds (0-1) */
    readonly thinkingSoundProbability: 0.15;
    /** Whether to enable active listening sounds */
    readonly enableActiveListening: true;
    /** Probability of active listening sounds (0-1) */
    readonly activeListeningProbability: 0.2;
};
//# sourceMappingURL=speech-traits.d.ts.map