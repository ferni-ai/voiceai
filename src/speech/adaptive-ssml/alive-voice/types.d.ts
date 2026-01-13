/**
 * Alive Voice Types
 *
 * Type definitions for the alive voice module.
 *
 * @module speech/adaptive-ssml/alive-voice/types
 */
export interface AliveVoiceContext {
    /** User's current emotional state */
    userEmotion?: string;
    /** Topic weight: light, medium, heavy */
    topicWeight?: 'light' | 'medium' | 'heavy';
    /** Current turn count */
    turnCount?: number;
    /** Persona ID */
    personaId?: string;
    /** User's energy level (maps to energy-matching.json) */
    userEnergy?: 'very_low' | 'low' | 'neutral' | 'elevated' | 'high';
    /** Is this response to good news? */
    isGoodNews?: boolean;
    /** Is this response to bad news? */
    isBadNews?: boolean;
    /** Is user asking a question? */
    isQuestion?: boolean;
    /** Is this a greeting? */
    isGreeting?: boolean;
    /** User's last message (for laughter context) */
    userMessage?: string;
    /** Did the user just laugh? */
    userJustLaughed?: boolean;
    /** Comfort level with user (0-1) */
    comfortLevel?: number;
    /** Session ID for tracking */
    sessionId?: string;
    /** Enable contextual laughter */
    enableLaughter?: boolean;
    /** Is it late at night? (11pm-5am) */
    isLateNight?: boolean;
    /** Random seed for deterministic behavior selection */
    randomSeed?: string;
    /** Total conversation count with this user (for callback first-use vs repeat) */
    conversationCount?: number;
}
export interface AliveVoiceResult {
    /** Enhanced text with SSML */
    text: string;
    /** Features that were applied */
    appliedFeatures: string[];
    /** Debug info */
    debug?: Record<string, unknown>;
}
export interface PersonaFingerprint {
    baseSpeed: number;
    pauseMultiplier: number;
    defaultEmotion: string;
    emotionRange: string[];
    thinkingSounds: string[];
    thinkingSoundProbability: number;
    emphasisStyle: 'warm' | 'deliberate' | 'energetic' | 'encouraging' | 'celebratory' | 'meditative';
    specialPatterns: Array<{
        trigger: RegExp;
        pause?: number;
        speed?: number;
        emotion?: string;
    }>;
}
export interface OpeningSoundOption {
    sound: string;
    emotion: string;
    probability: number;
}
export interface EmotionArcPattern {
    pattern: RegExp;
    replacement: string;
    name: string;
}
export interface SpeedVariationPattern {
    pattern: RegExp;
    replacement: string;
    type: string;
}
export interface PauseScale {
    sentence: number;
    comma: number;
    question: number;
    emphasis: number;
    breathingRoom: number;
}
export type TopicWeight = 'light' | 'medium' | 'heavy';
//# sourceMappingURL=types.d.ts.map