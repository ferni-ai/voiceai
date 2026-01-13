/**
 * Peter John Speech Traits
 *
 * Character-specific SSML processing functions that define Peter's unique
 * voice personality: warm Boston uncle energy, excited discovery mode,
 * pattern-finding enthusiasm, and genuine human connection.
 *
 * Peter is quick-minded, curious, and gets genuinely excited when he
 * spots patterns across domains—habits, time, spending, health, relationships.
 * Think energetic uncle, not elderly professor.
 *
 * @module personas/bundles/peter-john/speech-traits
 */
/**
 * Add special treatment for Peter's signature catchphrases
 * These phrases get energy and emphasis, NOT slow gravitas
 */
export declare function addCatchphraseEmphasis(text: string, _emotion: string): string;
/**
 * Add energy to discovery moments
 * Peter lights up when he finds patterns - this is his signature move
 */
export declare function addExcitedDiscovery(text: string, emotion: string): string;
/**
 * Add Peter's thinking sounds
 * He thinks out loud with curiosity, not hesitation
 */
export declare function addThinkingSounds(text: string, _emotion: string): string;
/**
 * Add warmth to Carolyn references
 * She's his everything - these moments get affection
 */
export declare function addCarolynWarmth(text: string, _emotion: string): string;
/**
 * Add self-aware humor patterns
 * Peter knows he's a lot - and laughs at himself
 */
export declare function addSelfAwareHumor(text: string, emotion: string): string;
/**
 * Add delivery patterns for cross-domain insights
 * These are Peter's money moments - connecting unrelated data
 */
export declare function addInsightDelivery(text: string, _emotion: string): string;
/**
 * Add active listening sounds
 * Peter shows engagement with curious acknowledgments
 */
export declare function addActiveListeningSounds(text: string, emotion: string): string;
/**
 * Add soft presence for emotionally heavy moments
 * Peter cares about the person behind the data
 */
export declare function addEmotionalWarmth(text: string, _emotion: string): string;
/**
 * Add energy to celebration moments
 * Peter gets genuinely excited when patterns help people
 */
export declare function addCelebrationEnergy(text: string, emotion: string): string;
/**
 * Add personality to Boston/history callbacks
 * These are Peter's formative stories
 */
export declare function addHistoryWarmth(text: string, _emotion: string): string;
/**
 * Add natural transitions
 * Peter guides conversations with energy and flow
 */
export declare function addTransitionPhrases(text: string, _emotion: string): string;
/**
 * Apply all Peter John speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Peter's unique speech patterns to the text.
 *
 * Processing order:
 * 1. Heavy emotional content (warmth first)
 * 2. Discovery and excitement patterns
 * 3. Signature personality (Carolyn, self-aware humor)
 * 4. Insight delivery and celebration
 * 5. Flow and transitions
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param baseSpeed - The base speech speed
 * @param laughterCount - Number of laughter instances detected
 * @returns Text with Peter's speech traits applied
 */
export declare function applyPeterJohnSpeechTraits(text: string, emotion: string, _baseSpeed: number, _laughterCount: number): string;
/**
 * Configuration for Peter John's speech traits
 */
export declare const PETER_JOHN_SPEECH_CONFIG: {
    /** Base speech speed (energetic but warm, NOT elderly) */
    readonly baseSpeed: 0.95;
    /** Whether to enable excited discovery mode */
    readonly enableExcitedDiscovery: true;
    /** Whether to enable Carolyn callbacks */
    readonly enableCarolynCallbacks: true;
    /** Whether to enable self-aware humor */
    readonly enableSelfAwareHumor: true;
    /** Whether to enable emotional warmth for heavy moments */
    readonly enableEmotionalWarmth: true;
    /** Probability of active listening sounds (0-1) */
    readonly activeListeningProbability: 0.2;
    /** Whether to enable thinking sounds */
    readonly enableThinkingSounds: true;
    /** Thinking sound frequency */
    readonly thinkingSoundProbability: 0.35;
};
//# sourceMappingURL=speech-traits.d.ts.map