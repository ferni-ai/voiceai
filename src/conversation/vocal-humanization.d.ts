/**
 * Vocal Humanization - "Better Than Human" Voice Processing
 *
 * Makes Ferni's voice feel genuinely human through:
 * 1. Energy Matching - Mirror user's energy level
 * 2. Pitch Variation - Natural intonation patterns
 * 3. Contraction Enforcement - Natural speech patterns
 * 4. Intake Breath - Gathering moment before speaking
 * 5. Emotion Bleeding - Voice changes with emotional content
 * 6. Mid-sentence Reactions - React during thoughts, not just between
 *
 * Philosophy: Humans don't speak in monotone with perfect grammar.
 * They breathe, hesitate, get excited, match energy, and their
 * voice CHANGES based on what they're feeling - not just what they're saying.
 */
import { detectEmotionalContent as sharedDetectEmotionalContent, detectHeavyContent as sharedDetectHeavyContent, detectUserEnergy as sharedDetectUserEnergy, type EnergyLevel } from './utils/detection.js';
import { type RandomSource } from './utils/rng.js';
export type { EnergyLevel } from './utils/detection.js';
export interface VocalContext {
    /** Detected user energy level */
    userEnergy?: EnergyLevel;
    /** Emotional content of the response */
    emotion?: string;
    /** Is this a question? */
    isQuestion?: boolean;
    /** Is this responding to something heavy/emotional? */
    isHeavyContent?: boolean;
    /** Turn number in conversation */
    turnNumber?: number;
    /** Was this a meaningful moment? */
    isMeaningfulMoment?: boolean;
    /** Previous user message (for energy detection) */
    userMessage?: string;
    /**
     * Optional random source/seed to make behavior deterministic per session/turn.
     * If omitted, falls back to system randomness.
     */
    rng?: RandomSource;
    randomSeed?: string;
}
export interface VocalProfile {
    /** Speed ratio (0.85 = slower, 1.0 = normal, 1.1 = faster) */
    speed: number;
    /** Pitch adjustment in semitones or percentage */
    pitch: string;
    /** Volume level */
    volume: string;
    /** Base pause duration multiplier */
    pauseMultiplier: number;
    /** Should add intake breath? */
    addIntakeBreath: boolean;
    /** Breath duration if added */
    breathDuration: number;
}
export interface HumanizedVocals {
    /** The processed text with SSML */
    ssml: string;
    /** What was applied */
    appliedFeatures: string[];
    /** The detected/used energy level */
    energyLevel: EnergyLevel;
    /** The vocal profile used */
    profile: VocalProfile;
}
/**
 * Detect user's energy level from their message
 * @see {@link sharedDetectUserEnergy} - Uses shared detection utilities
 */
export declare const detectUserEnergy: typeof sharedDetectUserEnergy;
/**
 * Detect if content is emotionally charged
 * @see {@link sharedDetectEmotionalContent} - Uses shared detection utilities
 */
export declare const detectEmotionalContent: typeof sharedDetectEmotionalContent;
/**
 * Detect if content is heavy/serious
 * @see {@link sharedDetectHeavyContent} - Uses shared detection utilities
 */
export declare const detectHeavyContent: typeof sharedDetectHeavyContent;
/**
 * Convert formal speech to natural contractions
 * "I am going to help you" → "I'm gonna help you"
 */
export declare function enforceContractions(text: string): string;
/**
 * Generate vocal profile based on context
 */
export declare function generateVocalProfile(context: VocalContext): VocalProfile;
/**
 * Add natural pitch variation to text
 * - Questions rise at the end
 * - Lists have varied pitch
 * - Statements fall at the end
 * - Emphasis words get pitch boost
 */
export declare function addPitchVariation(text: string, context: VocalContext): string;
/**
 * Add intake breath before response if appropriate
 */
export declare function addIntakeBreath(text: string, context: VocalContext): string;
/**
 * Make voice automatically change based on emotional content
 * "Emotion bleeding through" - not stated, but heard
 *
 * Enhanced with more patterns for dynamic prosody
 */
export declare function applyEmotionBleeding(text: string, context: VocalContext): string;
/**
 * Add potential mid-sentence reaction points
 * Not every response, but when natural
 */
export declare function addMidSentenceReactions(text: string, context: VocalContext): string;
/**
 * Apply all vocal humanization to text
 */
export declare function humanizeVocals(text: string, context: VocalContext): HumanizedVocals;
declare const _default: {
    humanizeVocals: typeof humanizeVocals;
    detectUserEnergy: typeof sharedDetectUserEnergy;
    enforceContractions: typeof enforceContractions;
    generateVocalProfile: typeof generateVocalProfile;
    addPitchVariation: typeof addPitchVariation;
    addIntakeBreath: typeof addIntakeBreath;
    applyEmotionBleeding: typeof applyEmotionBleeding;
    addMidSentenceReactions: typeof addMidSentenceReactions;
    detectEmotionalContent: typeof sharedDetectEmotionalContent;
    detectHeavyContent: typeof sharedDetectHeavyContent;
};
export default _default;
//# sourceMappingURL=vocal-humanization.d.ts.map