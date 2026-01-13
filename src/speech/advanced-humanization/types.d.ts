/**
 * Advanced Humanization Types
 *
 * Type definitions for the voice humanization system.
 *
 * @module advanced-humanization/types
 */
/**
 * Cartesia Sonic-3 supported emotions organized by category
 */
export declare const CARTESIA_EMOTIONS: {
    readonly positive: readonly ["happy", "excited", "enthusiastic", "elated", "euphoric", "triumphant", "content", "peaceful", "serene", "calm", "grateful", "affectionate", "trust", "sympathetic", "flirtatious"];
    readonly engagement: readonly ["curious", "amazed", "surprised", "anticipation", "mysterious", "joking", "comedic", "sarcastic", "ironic"];
    readonly negative: readonly ["sad", "dejected", "melancholic", "disappointed", "hurt", "angry", "mad", "outraged", "frustrated", "agitated", "threatened", "scared", "disgusted", "contempt", "envious"];
    readonly nuanced: readonly ["hesitant", "insecure", "confused", "resigned", "guilty", "bored", "tired", "rejected", "nostalgic", "wistful", "apologetic"];
};
/**
 * All Cartesia emotions flattened into a single array
 */
export declare const ALL_CARTESIA_EMOTIONS: readonly ["happy", "excited", "enthusiastic", "elated", "euphoric", "triumphant", "content", "peaceful", "serene", "calm", "grateful", "affectionate", "trust", "sympathetic", "flirtatious", "curious", "amazed", "surprised", "anticipation", "mysterious", "joking", "comedic", "sarcastic", "ironic", "sad", "dejected", "melancholic", "disappointed", "hurt", "angry", "mad", "outraged", "frustrated", "agitated", "threatened", "scared", "disgusted", "contempt", "envious", "hesitant", "insecure", "confused", "resigned", "guilty", "bored", "tired", "rejected", "nostalgic", "wistful", "apologetic"];
/**
 * Type representing any valid Cartesia emotion
 */
export type CartesiaEmotion = (typeof ALL_CARTESIA_EMOTIONS)[number];
/**
 * Context for emotion mapping decisions
 */
export interface EmotionContext {
    /** What the agent is doing */
    agentIntent: 'supportive' | 'thinking' | 'explaining' | 'celebrating' | 'comforting' | 'joking' | 'remembering' | 'questioning' | 'uncertain' | 'apologizing' | 'encouraging' | 'reflecting';
    /** User's emotional state (if detected) */
    userEmotion?: 'happy' | 'sad' | 'anxious' | 'frustrated' | 'neutral' | 'excited';
    /** Conversation weight */
    topicWeight: 'light' | 'medium' | 'heavy';
    /** Relationship depth */
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    /** Optional: Current persona */
    personaId?: string;
}
/**
 * Configuration for natural filler injection
 */
export interface FillerConfig {
    /** Probability of adding filler (0-1) */
    probability: number;
    /** Max fillers per response */
    maxPerResponse: number;
    /** Persona-specific filler preference */
    preferredFillers?: string[];
}
/**
 * Default filler configuration
 */
export declare const DEFAULT_FILLER_CONFIG: FillerConfig;
/**
 * Configuration for breath group pacing
 */
export interface BreathGroupConfig {
    /** Short pause (ms) for minor boundaries */
    shortPause: number;
    /** Medium pause (ms) for clause boundaries */
    mediumPause: number;
    /** Long pause (ms) for sentence boundaries */
    longPause: number;
    /** Enable breath group detection */
    enabled: boolean;
}
/**
 * Default breath group configuration
 */
export declare const DEFAULT_BREATH_CONFIG: BreathGroupConfig;
/**
 * Speech rhythm variation for a text segment
 */
export interface RhythmVariation {
    /** Speed multiplier for this segment */
    speedRatio: number;
    /** Text content */
    content: string;
}
/**
 * Options for the humanization pipeline
 */
export interface HumanizationOptions {
    /** Enable filler injection */
    fillers: boolean;
    /** Enable breath group pacing */
    breathGroups: boolean;
    /** Enable rhythm variation */
    rhythmVariation: boolean;
    /** Enable emotion mapping */
    emotionMapping: boolean;
    /** Filler configuration */
    fillerConfig?: FillerConfig;
    /** Breath group configuration */
    breathConfig?: BreathGroupConfig;
    /** Persona ID for persona-specific adjustments */
    personaId?: string;
    /** Emotion context for mapping */
    emotionContext?: EmotionContext;
}
/**
 * Default humanization options
 */
export declare const DEFAULT_HUMANIZATION_OPTIONS: HumanizationOptions;
//# sourceMappingURL=types.d.ts.map