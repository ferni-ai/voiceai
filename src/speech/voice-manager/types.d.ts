/**
 * Voice Manager Types
 *
 * Type definitions for voice management and TTS.
 */
/**
 * All supported agent IDs for voice switching.
 * Includes canonical IDs and aliases for flexibility.
 */
export type VoiceAgentId = 'ferni' | 'peter-john' | 'alex-chen' | 'maya-santos' | 'jordan-taylor' | 'nayan-patel' | 'alex' | 'maya' | 'jordan' | 'peter' | 'nayan' | 'jack-b' | 'comm-specialist' | 'spend-save' | 'event-planner';
/**
 * Voice configuration for a persona
 */
export interface VoiceConfig {
    id: string;
    name: string;
    model: string;
    description: string;
}
/**
 * Voice configuration from PersonaConfig
 *
 * Speed values for Cartesia sonic-2-2025-03-07:
 * - String: "slowest", "slow", "normal", "fast", "fastest"
 * - Number: -1.0 (slowest) to 1.0 (fastest), 0 = normal
 */
export interface PersonaVoiceConfig {
    voiceId: string;
    provider?: string;
    language?: string;
    defaultRate?: number | string;
    /** English accent preference (american, british, australian, indian) */
    accent?: 'american' | 'british' | 'australian' | 'indian';
    /** Whether the voiceId is a localized voice from Cartesia's localization API */
    isLocalizedVoice?: boolean;
    /** Default emotion for this persona (Cartesia Sonic-3) */
    defaultEmotion?: string;
    /** Range of emotions this persona naturally expresses */
    emotionRange?: string[];
    /** Default speech speed (0.6 - 1.5, default 1.0) */
    defaultSpeed?: number;
    /** Default volume (0.5 - 2.0, default 1.0) */
    defaultVolume?: number;
    /** How often the persona laughs (0.0 - 1.0) */
    laughterFrequency?: number;
    /** Nonverbal sounds this persona uses */
    nonverbals?: string[];
}
//# sourceMappingURL=types.d.ts.map