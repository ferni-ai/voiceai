/**
 * Dynamic Response Generator
 *
 * CRITICAL FIX: Replaces static response lists with persona-trait-based generation.
 *
 * Problem solved: All personas had 80%+ identical backchannels, comfort phrases,
 * and thinking sounds because they shared the same static JSON files.
 *
 * This generator:
 * 1. Uses persona personality traits to vary responses
 * 2. Tracks what's been used to avoid repetition
 * 3. Generates contextually-appropriate variations
 * 4. Makes each persona sound distinctly different
 */
import type { PersonaConfig } from './types.js';
export interface PersonaVoiceTraits {
    warmth: number;
    energy: number;
    formality: number;
    humor: number;
    directness: number;
}
export type ResponseCategory = 'backchannel_neutral' | 'backchannel_engaged' | 'backchannel_empathetic' | 'backchannel_thinking' | 'comfort_phrase' | 'acknowledgment' | 'transition' | 'silence_presence' | 'silence_question' | 'silence_observation';
interface ResponseVariant {
    text: string;
    minWarmth?: number;
    maxWarmth?: number;
    minEnergy?: number;
    maxEnergy?: number;
    minFormality?: number;
    maxFormality?: number;
    minDirectness?: number;
    maxDirectness?: number;
}
/**
 * Extract voice traits from persona config
 */
export declare function extractVoiceTraits(persona: PersonaConfig): PersonaVoiceTraits;
/**
 * Backchannel variants with trait requirements
 */
declare const BACKCHANNEL_VARIANTS: Record<string, ResponseVariant[]>;
/**
 * Comfort phrase variants with trait requirements
 */
declare const COMFORT_VARIANTS: ResponseVariant[];
/**
 * Acknowledgment variants
 */
declare const ACKNOWLEDGMENT_VARIANTS: ResponseVariant[];
/**
 * Silence presence variants - "I'm here" energy
 */
declare const SILENCE_PRESENCE_VARIANTS: ResponseVariant[];
/**
 * Silence question variants - thoughtful questions during silence
 */
declare const SILENCE_QUESTION_VARIANTS: ResponseVariant[];
/**
 * Silence observation variants - gentle observations during silence
 */
declare const SILENCE_OBSERVATION_VARIANTS: ResponseVariant[];
/**
 * Clear session usage tracking
 */
export declare function clearSessionUsage(sessionId: string): void;
/**
 * Get a dynamic backchannel for a persona
 */
export declare function getDynamicBackchannel(persona: PersonaConfig, sessionId: string, type?: 'neutral' | 'engaged' | 'empathetic' | 'thinking'): string;
/**
 * Get a dynamic comfort phrase for a persona
 */
export declare function getDynamicComfortPhrase(persona: PersonaConfig, sessionId: string): string;
/**
 * Get a dynamic acknowledgment for a persona
 */
export declare function getDynamicAcknowledgment(persona: PersonaConfig, sessionId: string): string;
/**
 * Get a dynamic thinking sound for a persona
 */
export declare function getDynamicThinkingSound(persona: PersonaConfig, sessionId: string): string;
/**
 * Get a dynamic silence presence phrase for a persona
 * Used when offering warm presence during silence
 */
export declare function getDynamicSilencePresence(persona: PersonaConfig, sessionId: string): string;
/**
 * Get a dynamic silence question for a persona
 * Used when asking a thoughtful question during silence
 */
export declare function getDynamicSilenceQuestion(persona: PersonaConfig, sessionId: string): string;
/**
 * Get a dynamic silence observation for a persona
 * Used when sharing a gentle observation during silence
 */
export declare function getDynamicSilenceObservation(persona: PersonaConfig, sessionId: string): string;
/**
 * Get silence response by persona ID (convenience function)
 */
export declare function getDynamicSilenceResponseByPersonaId(personaId: string, sessionId: string, type?: 'presence' | 'question' | 'observation'): string;
/**
 * Persona-specific phrases that should ONLY come from that persona
 */
declare const PERSONA_EXCLUSIVE_PHRASES: Record<string, string[]>;
/**
 * Get a persona-exclusive phrase (their signature lines)
 */
export declare function getPersonaExclusivePhrase(persona: PersonaConfig, sessionId: string): string | null;
/**
 * Persona trait profiles - defines personality characteristics for each persona
 * These are used to generate appropriate backchannels without async registry calls
 */
export declare const PERSONA_TRAIT_PROFILES: Record<string, PersonaVoiceTraits>;
/**
 * Get a dynamic backchannel using just personaId
 * This is the main entry point for integration with other systems
 */
export declare function getDynamicBackchannelByPersonaId(personaId: string, sessionId: string, type?: 'neutral' | 'engaged' | 'empathetic' | 'thinking'): string;
/**
 * Map emotion/topic context to backchannel type
 */
export declare function mapContextToBackchannelType(context: {
    topicSeriousness?: 'serious' | 'casual' | 'emotional';
    userEmotion?: string;
    userJustSharedSomethingPersonal?: boolean;
}): 'neutral' | 'engaged' | 'empathetic' | 'thinking';
export { ACKNOWLEDGMENT_VARIANTS, BACKCHANNEL_VARIANTS, COMFORT_VARIANTS, PERSONA_EXCLUSIVE_PHRASES, SILENCE_OBSERVATION_VARIANTS, SILENCE_PRESENCE_VARIANTS, SILENCE_QUESTION_VARIANTS, };
//# sourceMappingURL=dynamic-responses.d.ts.map