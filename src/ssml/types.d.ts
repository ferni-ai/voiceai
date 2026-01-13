/**
 * SSML Types - Single Source of Truth
 *
 * Type definitions for the SSML module.
 * This is the CANONICAL source for all SSML-related types.
 *
 * Other modules should import types from here:
 * ```typescript
 * import type { PronunciationEntry, CartesiaEmotion } from '../ssml/types.js';
 * ```
 *
 * @module ssml/types
 */
export type { ThinkingContext, ThinkingInjection } from '../conversation/thinking-time-injector.js';
export type { BreathGroupConfig, FillerConfig } from '../speech/advanced-humanization.js';
/**
 * Entry for pronunciation dictionary
 */
export interface PronunciationEntry {
    /** Regex pattern to match */
    pattern: RegExp;
    /** Replacement text (phonetic representation) */
    replacement: string;
    /** Optional description for documentation */
    description?: string;
}
/**
 * Context information used during SSML tagging
 */
export interface TaggingContext {
    /** Detected emotion */
    emotion: string;
    /** Base speech speed ratio */
    baseSpeed: number;
    /** Base volume ratio */
    baseVolume: number;
    /** Whether emphasis was detected */
    hasEmphasis: boolean;
    /** Whether whisper was detected */
    hasWhisper: boolean;
    /** Whether laughter was detected */
    hasLaughter: boolean;
    /** Whether a sigh was detected */
    hasSigh: boolean;
    /** Whether disfluency was detected */
    hasDisfluency?: boolean;
    /** Whether repetition was detected */
    hasRepetition?: boolean;
    /** Whether sarcasm was detected */
    hasSarcasm?: boolean;
    /** Number of sentences in text */
    sentenceCount?: number;
    /** Average sentence length */
    avgSentenceLength?: number;
}
/**
 * Result of pacing detection
 */
export interface DetectedPacing {
    /** Speed ratio (0.6-1.5) */
    speed: number;
    /** Reason for the detected speed */
    reason: string;
}
/**
 * Result of volume detection
 */
export interface DetectedVolume {
    /** Volume ratio (0.5-2.0) */
    volume: number;
    /** Whether emphasis was detected */
    hasEmphasis: boolean;
    /** Whether whisper was detected */
    hasWhisper: boolean;
}
/**
 * Result of vocal cue detection
 */
export interface DetectedVocalCues {
    /** Whether laughter was detected */
    hasLaughter: boolean;
    /** Whether a sigh was detected */
    hasSigh: boolean;
    /** Whether disfluency was detected */
    hasDisfluency: boolean;
    /** Whether repetition was detected */
    hasRepetition: boolean;
    /** Whether sarcasm was detected */
    hasSarcasm: boolean;
    /** Count of laughter occurrences */
    laughterCount?: number;
}
/**
 * All 60+ emotions supported by Cartesia Sonic-3 TTS
 * Use these values in <emotion value="..."/> tags
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 *
 * Primary emotions (best results): neutral, angry, excited, content, sad, scared
 */
export declare const CARTESIA_EMOTIONS: {
    readonly NEUTRAL: "neutral";
    readonly ANGRY: "angry";
    readonly EXCITED: "excited";
    readonly CONTENT: "content";
    readonly SAD: "sad";
    readonly SCARED: "scared";
    readonly HAPPY: "happy";
    readonly ENTHUSIASTIC: "enthusiastic";
    readonly ELATED: "elated";
    readonly EUPHORIC: "euphoric";
    readonly TRIUMPHANT: "triumphant";
    readonly AMAZED: "amazed";
    readonly SURPRISED: "surprised";
    readonly FLIRTATIOUS: "flirtatious";
    readonly JOKING: "joking";
    readonly CURIOUS: "curious";
    readonly PEACEFUL: "peaceful";
    readonly SERENE: "serene";
    readonly CALM: "calm";
    readonly GRATEFUL: "grateful";
    readonly AFFECTIONATE: "affectionate";
    readonly TRUST: "trust";
    readonly SYMPATHETIC: "sympathetic";
    readonly ANTICIPATION: "anticipation";
    readonly MYSTERIOUS: "mysterious";
    readonly MAD: "mad";
    readonly OUTRAGED: "outraged";
    readonly FRUSTRATED: "frustrated";
    readonly AGITATED: "agitated";
    readonly THREATENED: "threatened";
    readonly DISGUSTED: "disgusted";
    readonly CONTEMPT: "contempt";
    readonly ENVIOUS: "envious";
    readonly SARCASTIC: "sarcastic";
    readonly IRONIC: "ironic";
    readonly DEJECTED: "dejected";
    readonly MELANCHOLIC: "melancholic";
    readonly DISAPPOINTED: "disappointed";
    readonly HURT: "hurt";
    readonly GUILTY: "guilty";
    readonly BORED: "bored";
    readonly TIRED: "tired";
    readonly REJECTED: "rejected";
    readonly NOSTALGIC: "nostalgic";
    readonly WISTFUL: "wistful";
    readonly APOLOGETIC: "apologetic";
    readonly HESITANT: "hesitant";
    readonly INSECURE: "insecure";
    readonly CONFUSED: "confused";
    readonly RESIGNED: "resigned";
    readonly ANXIOUS: "anxious";
    readonly PANICKED: "panicked";
    readonly ALARMED: "alarmed";
    readonly PROUD: "proud";
    readonly CONFIDENT: "confident";
    readonly DISTANT: "distant";
    readonly SKEPTICAL: "skeptical";
    readonly CONTEMPLATIVE: "contemplative";
    readonly DETERMINED: "determined";
    readonly WARM: "affectionate";
    readonly CARING: "sympathetic";
    readonly THOUGHTFUL: "contemplative";
};
/**
 * Union type of all valid Cartesia emotion values
 */
export type CartesiaEmotion = (typeof CARTESIA_EMOTIONS)[keyof typeof CARTESIA_EMOTIONS];
/**
 * Array of all Cartesia emotion values for validation
 */
export declare const ALL_CARTESIA_EMOTIONS: CartesiaEmotion[];
/**
 * Emotions that are directly supported by Cartesia's emotion tag
 * (subset that definitely work in <emotion value="..."/>)
 */
export declare const CARTESIA_SUPPORTED_EMOTIONS: CartesiaEmotion[];
/**
 * Check if an emotion value is directly supported in Cartesia's emotion tag
 */
export declare function isCartesiaSupportedEmotion(emotion: string): boolean;
import type { BreathGroupConfig, FillerConfig } from '../speech/advanced-humanization.js';
import type { ThinkingContext, ThinkingInjection } from '../conversation/thinking-time-injector.js';
/**
 * Options for SSML tagging functions
 */
export interface SsmlTagOptions {
    /** Persona ID for persona-specific adjustments */
    personaId?: string;
    /** Base speech speed (0.6-1.5) */
    baseSpeed?: number;
    /** Base volume (0.5-2.0) */
    baseVolume?: number;
    /** Whether to apply humanization */
    humanize?: boolean;
    /** Enable natural filler injection ("um", "well", etc.) - default: true */
    naturalFillers?: boolean;
    /** Enable breath group pacing (pauses at phrase boundaries) - default: true */
    breathGroupPacing?: boolean;
    /** Filler injection configuration */
    fillerConfig?: FillerConfig;
    /** Breath group configuration */
    breathConfig?: BreathGroupConfig;
    /** Enable thinking time injection - default: false */
    thinkingTime?: boolean;
    /** Context for thinking time calculation */
    thinkingContext?: ThinkingContext;
    /** Pre-calculated thinking injection */
    thinkingInjection?: ThinkingInjection;
}
/**
 * Result of SSML sanitization
 */
export interface SanitizationResult {
    /** Sanitized text */
    text: string;
    /** Whether any issues were found */
    hasIssues: boolean;
    /** List of issues found */
    issues: string[];
}
/**
 * TTS check result
 */
export interface TTSCheckResult {
    /** Whether any issues were found */
    hasIssues: boolean;
    /** List of suspicious patterns found */
    suspiciousPatterns: string[];
    /** List of potential stage directions */
    potentialStageDirections: string[];
}
//# sourceMappingURL=types.d.ts.map