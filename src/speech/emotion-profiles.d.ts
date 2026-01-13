/**
 * Persona Emotion Profiles
 *
 * Static emotion configuration for each persona.
 * This file has NO dependencies on personas module to avoid circular imports.
 *
 * Used by: advanced-humanization, ssml, voice-manager
 *
 * @module speech/emotion-profiles
 */
export interface PersonaEmotionProfile {
    defaultEmotion: string;
    emotionRange: string[];
    defaultSpeed: number;
    defaultVolume: number;
    laughterFrequency: number;
    nonverbals: string[];
}
/**
 * Emotion profiles for each persona - makes their voice distinctly human.
 * These are static configurations with no runtime dependencies.
 */
export declare const PERSONA_EMOTION_PROFILES: Record<string, PersonaEmotionProfile>;
/**
 * Get emotion profile for a persona (with sensible defaults).
 * Returns Ferni's profile as fallback for unknown personas.
 */
export declare function getEmotionProfile(personaId: string): PersonaEmotionProfile;
//# sourceMappingURL=emotion-profiles.d.ts.map