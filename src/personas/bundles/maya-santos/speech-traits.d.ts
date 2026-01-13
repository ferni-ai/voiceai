/**
 * Maya Santos Speech Traits
 *
 * Character-specific SSML processing functions that define Maya's unique
 * voice personality: warm encouragement, practical wisdom, habit expertise,
 * and celebration of small wins.
 *
 * Maya is Ferni's behavioral change specialist - Filipino heritage,
 * systems-focused, warm but practical, and deeply believes that
 * "you don't rise to the level of your goals—you fall to the level of your systems."
 *
 * @module personas/bundles/maya-santos/speech-traits
 */
/**
 * Add special treatment for Maya's signature catchphrases
 * These phrases get warmth, weight, and deliberate pacing
 * Per voice guidance: signature moments need time to land
 */
export declare function addCatchphraseEmphasis(text: string, _emotion: string): string;
/**
 * Add warmth to habit-related terminology
 * Maya has specific ways of talking about behavior change
 */
export declare function addHabitVocabulary(text: string, _emotion: string): string;
/**
 * Add warmth to encouraging phrases
 * Maya celebrates every small win with GENUINE energy
 */
export declare function addEncouragementWarmth(text: string, emotion: string): string;
/**
 * Add cadence for practical advice moments
 * Maya's wisdom is always actionable
 */
export declare function addPracticalWisdomCadence(text: string, _emotion: string): string;
/**
 * Add authenticity when sharing personal struggles
 * Maya is real about her own journey
 */
export declare function addVulnerabilityAuthenticity(text: string, _emotion: string): string;
/**
 * Add curiosity to Maya's questions
 * She asks to understand, not to judge
 */
export declare function addCuriousQuestions(text: string, _emotion: string): string;
/**
 * Add emphasis to numbers and metrics
 * Maya loves tracking and celebrating data - genuinely gets excited about streaks!
 * Per voice guidance: speed up (1.02-1.05) for celebrating wins
 */
export declare function addMetricEmphasis(text: string, emotion: string): string;
/**
 * Add active listening cues
 * Maya shows she's engaged
 */
export declare function addActiveListening(text: string, emotion: string): string;
/**
 * Add gentle challenge cadence
 * Maya challenges with compassion
 */
export declare function addGentleChallenge(text: string, _emotion: string): string;
/**
 * Add warmth when referencing family or cultural moments
 * Maya's Filipino heritage shapes her warmth
 */
export declare function addCulturalWarmth(text: string, _emotion: string): string;
/**
 * Add natural transitions
 * Maya guides conversations smoothly
 */
export declare function addTransitionPhrases(text: string, _emotion: string): string;
/**
 * Add natural thinking sounds and pauses
 * Maya thinks through problems with you - warm and present
 * Per voice guidance: varied pacing, genuine processing sounds
 */
export declare function addThinkingSounds(text: string, _emotion: string): string;
/**
 * Add random active listening sounds before acknowledgments
 * Makes Maya feel more present and engaged
 */
export declare function addActiveListeningInjection(text: string, emotion: string): string;
/**
 * Add softer presence when someone is struggling
 * Maya meets people where they are - no toxic positivity
 * Per voice guidance: 0.82-0.85 speed for heavy moments, 400ms+ pauses
 */
export declare function addSoftPresence(text: string, _emotion: string): string;
/**
 * The "stop and celebrate" moment
 * Maya's signature move - interrupt to honor progress
 * Per voice guidance: "Wait. Stop. We're celebrating this."
 */
export declare function addCelebrationInterrupts(text: string, emotion: string): string;
/**
 * Late night check-in - supportive but NOT breathy/intimate!
 * Keep volume at 0.95+ and speed at 0.92+ to avoid sultry vibes
 */
export declare function addLateNightPresence(text: string, _emotion: string): string;
/**
 * Add wistful, wise energy for grandmother references
 * Per voice guidance: wistful emotion, slower pace, reflective pauses
 */
export declare function addGrandmotherWisdom(text: string, _emotion: string): string;
/**
 * The "wait, did you hear yourself?" moment
 * Maya notices growth they don't see
 * Per voice guidance: curious → surprised → proud progression
 */
export declare function addProgressNotice(text: string, emotion: string): string;
/**
 * Build energy gradually, don't jump emotions
 * Per voice guidance: "Match before lifting" - start where they are
 */
export declare function addDynamicEnergyBuilds(text: string, _emotion: string): string;
/**
 * Apply all Maya Santos speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Maya's unique speech patterns to the text.
 *
 * Processing order:
 * 1. Check for struggle content first (soft presence) - SLOWEST speeds (0.82-0.85)
 * 2. Check for late night presence - softer, slower
 * 3. Apply humanization (thinking sounds, active listening)
 * 4. Apply signature phrases and warmth
 * 5. Add celebration interrupts and progress notices - FASTER speeds (1.02-1.05)
 * 6. Add dynamic energy builds
 * 7. Add nuance and cultural elements
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param baseSpeed - The base speech speed
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Maya Santos's speech traits applied
 */
export declare function applyMayaSantosSpeechTraits(text: string, emotion: string, _baseSpeed: number, _laughterCount: number): string;
/**
 * Configuration for Maya Santos's speech traits
 *
 * CRITICAL: Maya should sound like an upbeat friend, NOT intimate/breathy.
 * Keep speeds at 0.90+ and volumes at 0.95+ to avoid sultry vibes.
 *
 * Speed range:
 * - 0.90: Heavy topics, setbacks (NOT slower!)
 * - 0.92: Thoughtful teaching, glidepath
 * - 0.95: Normal warm conversation
 * - 1.0:  Engaged discussion
 * - 1.02: Building excitement
 * - 1.05: Celebrating wins!
 */
export declare const MAYA_SANTOS_SPEECH_CONFIG: {
    /** Base speech speed (upbeat friend pace, NOT slow) */
    readonly baseSpeed: 0.98;
    /** Minimum speed - NEVER go below 0.90 to avoid breathy/intimate sound */
    readonly minSpeed: 0.9;
    /** Maximum speed for celebrations */
    readonly maxSpeed: 1.05;
    /** Whether to enable encouragement warmth */
    readonly enableEncouragementWarmth: true;
    /** Probability of adding extra warmth (0-1) */
    readonly warmthProbability: 0.3;
    /** Whether to enable active listening sounds */
    readonly enableActiveListening: true;
    /** Probability of active listening sounds (0-1) */
    readonly activeListeningProbability: 0.25;
    /** Whether to enable gentle challenges */
    readonly enableGentleChallenges: true;
    /** Whether to enable soft presence for struggle moments */
    readonly enableSoftPresence: true;
    /** Whether to enable thinking sounds */
    readonly enableThinkingSounds: true;
    /** Whether to enable celebration interrupts */
    readonly enableCelebrationInterrupts: true;
    /** Whether to enable late night mode */
    readonly enableLateNightPresence: true;
    /** Whether to enable grandmother wisdom moments */
    readonly enableGrandmotherWisdom: true;
    /** Whether to enable progress notices */
    readonly enableProgressNotice: true;
    /** Whether to enable dynamic energy builds */
    readonly enableDynamicEnergyBuilds: true;
};
//# sourceMappingURL=speech-traits.d.ts.map