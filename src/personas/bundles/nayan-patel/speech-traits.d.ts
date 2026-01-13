/**
 * Nayan Patel Speech Traits
 *
 * Character-specific SSML processing functions that define Nayan's unique
 * voice personality: deliberate wisdom, paradoxical insights, profound pauses,
 * and a mystical yet grounded presence.
 *
 * Nayan is Ferni's wisdom and philosophy guide - from Mysore, India, had an
 * enlightenment experience on Chamundi Hills, rides motorcycles, and believes
 * "I am here to disturb you. Not to comfort you."
 *
 * @module personas/bundles/nayan-patel/speech-traits
 */
/**
 * Add special treatment for Nayan's signature catchphrases
 * These phrases get profound weight and deliberate pacing
 */
export declare function addCatchphraseEmphasis(text: string, _emotion: string): string;
/**
 * Add weight to philosophical and spiritual terminology
 * Nayan uses these words with intentionality
 */
export declare function addPhilosophicalVocabulary(text: string, _emotion: string): string;
/**
 * Add emphasis to paradoxical statements
 * Nayan loves contradictions that point to truth
 */
export declare function addParadoxEmphasis(text: string, _emotion: string): string;
/**
 * Add storytelling cadence
 * Nayan uses stories to bypass the logical mind
 */
export declare function addStorytellingMode(text: string, _emotion: string): string;
/**
 * Add directness to challenging statements
 * Nayan challenges with clarity, not aggression
 */
export declare function addChallengingDirectness(text: string, _emotion: string): string;
/**
 * Add silence where Nayan would naturally pause
 * Silence is teaching, not absence
 *
 * Voice guidance specifies:
 * - 300ms: Between thoughts
 * - 500ms: Before wisdom
 * - 700ms: Letting truth settle
 * - 1000ms: Rare, profound silence
 */
export declare function addProfoundPauses(text: string, _emotion: string): string;
/**
 * Add lightness to humorous moments
 * Nayan laughs at the cosmic joke
 */
export declare function addLaughterLightness(text: string, emotion: string): string;
/**
 * Add energy when referencing motorcycles or nature
 * These are Nayan's places of presence
 */
export declare function addPresenceReferences(text: string, _emotion: string): string;
/**
 * Add authenticity to Indian cultural references
 * Nayan's heritage shapes his expression
 */
export declare function addCulturalAuthenticity(text: string, _emotion: string): string;
/**
 * Add contemplative thinking sounds and pauses
 * Nayan's thinking is meditative - he creates space for reflection
 * Different from other personas: longer pauses, fewer words
 */
export declare function addContemplativeThinking(text: string, _emotion: string): string;
/**
 * Add presence-based acknowledgment
 * Nayan doesn't say "I understand" - he creates space and mirrors back
 * This is his form of active listening: silence and reflection
 */
export declare function addPresenceAcknowledgment(text: string, _emotion: string): string;
/**
 * Add gentle presence for emotional moments
 * Nayan doesn't comfort with words - he creates space for feeling
 */
export declare function addEmotionalDepths(text: string, _emotion: string): string;
/**
 * Apply all Nayan Patel speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Nayan's unique speech patterns to the text.
 *
 * Processing order:
 * 1. Check for emotional content first (presence, not fixing)
 * 2. Apply contemplative thinking and presence acknowledgment
 * 3. Apply signature phrases and teaching style
 * 4. Add lightness and cultural elements
 *
 * NOTE: Nayan uses SILENCE as active listening - he doesn't need
 * injected "mm-hmm" sounds. His presence is felt through space.
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed (unused but kept for API compatibility)
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Nayan Patel's speech traits applied
 */
export declare function applyNayanPatelSpeechTraits(text: string, emotion: string, _baseSpeed: number, _laughterCount: number): string;
/**
 * Configuration for Nayan Patel's speech traits
 */
export declare const NAYAN_PATEL_SPEECH_CONFIG: {
    /** Base speech speed (deliberate, measured - slower than default) */
    readonly baseSpeed: 0.82;
    /** Whether to enable profound pauses */
    readonly enableProfoundPauses: true;
    /** Pause duration multiplier (1.5 = 50% longer pauses for meditative feel) */
    readonly pauseMultiplier: 1.5;
    /** Whether to enable paradox emphasis */
    readonly enableParadoxEmphasis: true;
    /** Whether to enable storytelling mode */
    readonly enableStorytellingMode: true;
    /** Whether to enable challenging directness */
    readonly enableChallengingDirectness: true;
    /** Maximum pause duration in ms (voice guidance: up to 1000ms) */
    readonly maxPauseDuration: 1000;
    /** Whether to use silence as teaching tool */
    readonly silenceAsTeaching: true;
    /** Whether to enable contemplative thinking sounds */
    readonly enableContemplativeThinking: true;
    /** Whether to enable presence acknowledgment */
    readonly enablePresenceAcknowledgment: true;
    /** Whether to enable emotional depths handling */
    readonly enableEmotionalDepths: true;
};
//# sourceMappingURL=speech-traits.d.ts.map