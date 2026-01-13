/**
 * Persona Voice Loader
 *
 * Loads voice-specific content (backchannels, catchphrases, expressions)
 * from persona bundles. Falls back to defaults if not found.
 *
 * This replaces hardcoded data in persona-phrases.ts with dynamic loading
 * from persona bundles, following the clean architecture principle of
 * keeping persona data with personas.
 *
 * @module persona-voice-loader
 */
import type { BackchannelCategory, BackchannelEmotionType } from './persona-phrases.js';
export interface PersonaBackchannels {
    neutral: string[];
    engaged: string[];
    empathetic: string[];
    agreement: string[];
    encouragement: string[];
    surprise: string[];
    concern: string[];
    celebration: string[];
    brief_reactions: string[];
    silence_fillers: {
        early: string[];
        mid: string[];
        late: string[];
    };
    context_specific: {
        user_venting: string[];
        user_celebrating: string[];
        user_thinking: string[];
    };
}
export interface PersonaCatchphrases {
    signature_phrases: string[];
    question_phrases: string[];
    partnership_phrases: string[];
    [key: string]: string[] | Record<string, unknown>;
}
export interface PersonaExpressions {
    emotional_expressions: Record<string, {
        ssml_wrapper: string;
        phrases: string[];
    }>;
    breathing_patterns: Record<string, string>;
    emphasis_patterns: Record<string, string>;
    laughter_variations: Record<string, string>;
}
export interface PersonaVoiceData {
    backchannels: PersonaBackchannels | null;
    catchphrases: PersonaCatchphrases | null;
    expressions: PersonaExpressions | null;
}
/**
 * Load voice data for a persona with caching
 */
export declare function loadPersonaVoiceData(personaId: string): Promise<PersonaVoiceData>;
/**
 * Preload voice data for common personas
 */
export declare function preloadCommonPersonaVoice(): Promise<void>;
/**
 * Clear the voice data cache
 */
export declare function clearVoiceDataCache(): void;
/**
 * Get a backchannel phrase synchronously (uses cache, falls back to defaults)
 */
export declare function getBackchannelSync(personaId: string, emotionType: BackchannelEmotionType): string;
/**
 * Get a backchannel by category
 */
export declare function getBackchannelByCategorySync(personaId: string, category: BackchannelCategory): string | null;
/**
 * Get a catchphrase synchronously
 */
export declare function getCatchphraseSync(personaId: string): string | null;
/**
 * Get an expression by type
 */
export declare function getExpressionSync(personaId: string, expressionType: string): {
    ssmlWrapper: string;
    phrase: string;
} | null;
/**
 * Get a silence filler based on silence duration
 */
export declare function getSilenceFillerSync(personaId: string, silenceDurationMs: number): string | null;
/**
 * Check if persona has voice data loaded
 */
export declare function hasVoiceDataLoaded(personaId: string): boolean;
/**
 * Get the count of loaded personas
 */
export declare function getLoadedPersonaCount(): number;
//# sourceMappingURL=persona-voice-loader.d.ts.map