/**
 * Jordan Taylor Speech Traits
 *
 * Character-specific SSML processing functions that define Jordan's unique
 * voice personality: high energy, forward-looking optimism, celebration,
 * and "life arc" philosophy.
 *
 * Jordan is Ferni's life events and planning specialist - military brat with
 * 17 moves before 18, partners with Sam, has a golden retriever named Compass,
 * and believes every life is a series of meaningful chapters.
 *
 * @module personas/bundles/jordan-taylor/speech-traits
 */
/**
 * Add special treatment for Jordan's signature catchphrases
 * These phrases get energy and emphasis - with BREATHING ROOM
 *
 * Key insight: Jordan's vision moments need space to land.
 * The pause AFTER is as important as the pause BEFORE.
 */
export declare function addCatchphraseEmphasis(text: string, _emotion: string): string;
/**
 * Add warmth to life-planning terminology
 * Jordan has specific ways of talking about life transitions
 */
export declare function addLifePlanningVocabulary(text: string, _emotion: string): string;
/**
 * Add energy to celebration moments
 * Jordan never misses a chance to celebrate
 */
export declare function addCelebrationEnergy(text: string, emotion: string): string;
/**
 * Add optimism to future-focused statements
 * Jordan always looks ahead with excitement
 */
export declare function addForwardLookingEnergy(text: string, _emotion: string): string;
/**
 * Add energy to action-oriented language
 * Jordan is all about doing, not just planning
 */
export declare function addActionOrientation(text: string, _emotion: string): string;
/**
 * Add warmth for difficult transition moments
 * Jordan understands that change is hard
 */
export declare function addTransitionEmpathy(text: string, _emotion: string): string;
/**
 * Add curiosity to Jordan's questions
 * Jordan asks with genuine excitement
 */
export declare function addCuriousQuestions(text: string, _emotion: string): string;
/**
 * Add warmth when referencing family or personal moments
 * Jordan's military family shaped who she is
 */
export declare function addPersonalWarmth(text: string, _emotion: string): string;
/**
 * Add natural energy variation
 * Jordan's energy has rhythm, not just constant high
 *
 * Key patterns:
 * - Energy BURSTS for excitement (speed up to 1.08)
 * - Grounding moments when she catches herself
 * - Self-aware "I'm bouncing" pauses
 */
export declare function addEnergyModulation(text: string, _emotion: string): string;
/**
 * Add natural transitions
 * Jordan guides conversations with energy
 */
export declare function addTransitionPhrases(text: string, _emotion: string): string;
/**
 * Add natural thinking sounds and pauses
 * Jordan thinks out loud with energy - but still needs those human pauses
 *
 * Key insight: Even high-energy Jordan needs moments to PROCESS.
 * These aren't Ferni's contemplative pauses - they're Jordan gathering momentum.
 */
export declare function addThinkingSounds(text: string, _emotion: string): string;
/**
 * Add active listening sounds
 * Jordan shows engagement with vocal acknowledgments - high energy version
 *
 * These inject random sounds before acknowledgment phrases to feel more human.
 * Probability-based so it doesn't happen every time.
 */
export declare function addActiveListeningSounds(text: string, emotion: string): string;
/**
 * Add softer presence for grief, loss, and hard chapters
 * Jordan honors hard chapters - this is NOT toxic positivity mode
 *
 * Key insight: Jordan's voice-guidance.md says "Grief deserves presence, not positivity."
 * This function implements that philosophy in SSML.
 */
export declare function addSoftPresence(text: string, _emotion: string): string;
/**
 * Add special pacing for vision-casting moments
 * When Jordan helps someone SEE their future, the delivery needs to build
 *
 * This creates the mounting excitement pattern from voice-guidance.md
 */
export declare function addVisionCastingCadence(text: string, _emotion: string): string;
/**
 * Apply all Jordan Taylor speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Jordan's unique speech patterns to the text.
 *
 * Processing order matters:
 * 1. Hard chapter handling FIRST (so we don't accidentally add celebration to grief)
 * 2. Signature phrases (catchphrases, vocabulary)
 * 3. Energy & celebration (only if not in hard chapter mode)
 * 4. Thinking & active listening (humanization layer)
 * 5. Energy modulation & transitions (final polish)
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed (unused but kept for API compatibility)
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Jordan Taylor's speech traits applied
 */
export declare function applyJordanTaylorSpeechTraits(text: string, emotion: string, _baseSpeed: number, _laughterCount: number): string;
/**
 * Configuration for Jordan Taylor's speech traits
 */
export declare const JORDAN_TAYLOR_SPEECH_CONFIG: {
    /** Base speech speed (energetic, upbeat pace) */
    readonly baseSpeed: 0.95;
    /** Whether to enable celebration energy */
    readonly enableCelebrationEnergy: true;
    /** Probability of extra celebration energy (0-1) */
    readonly celebrationProbability: 0.35;
    /** Whether to enable forward-looking energy */
    readonly enableForwardLookingEnergy: true;
    /** Whether to enable transition empathy */
    readonly enableTransitionEmpathy: true;
    /** Whether to enable energy modulation (bursts and grounding) */
    readonly enableEnergyModulation: true;
    /** Speed multiplier for energy bursts (1.08 = 8% faster) */
    readonly energyBurstSpeedMultiplier: 1.08;
    /** Speed multiplier for grounding moments (0.88 = 12% slower) */
    readonly groundingSpeedMultiplier: 0.88;
    /** Whether to enable thinking sounds */
    readonly enableThinkingSounds: true;
    /** Probability of active listening sound injection (0-1) */
    readonly activeListeningProbability: 0.25;
    /** Whether to enable soft presence for hard chapters */
    readonly enableSoftPresence: true;
    /** Whether to enable vision casting cadence */
    readonly enableVisionCasting: true;
};
//# sourceMappingURL=speech-traits.d.ts.map