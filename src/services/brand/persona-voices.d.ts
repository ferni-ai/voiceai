/**
 * Persona Voice Profiles
 *
 * Distinct voice configurations for each Ferni persona.
 * These profiles ensure each specialist sounds unique while
 * staying on-brand.
 *
 * @module @ferni/brand/persona-voices
 */
import type { ContextType, PersonaId, PersonaVoice } from './types.js';
/**
 * Complete voice profiles for all personas
 */
export declare const PERSONA_VOICES: Record<PersonaId, PersonaVoice>;
/**
 * Get a persona voice profile by ID
 */
export declare function getPersonaVoice(personaId: PersonaId): PersonaVoice;
/**
 * Get all core team personas (not marketplace)
 */
export declare function getCorePersonas(): PersonaVoice[];
/**
 * Get marketplace personas
 */
export declare function getMarketplacePersonas(): PersonaVoice[];
/**
 * Get a random greeting for a persona
 */
export declare function getRandomGreeting(personaId: PersonaId): string;
/**
 * Get response patterns for a context
 */
export declare function getResponsePatterns(personaId: PersonaId, context: ContextType): string[];
/**
 * Check if content matches persona anti-patterns
 */
export declare function containsAntiPattern(content: string, personaId: PersonaId): string | null;
//# sourceMappingURL=persona-voices.d.ts.map