/**
 * Cameo Content Generation
 *
 * Handles persona-specific content for cameos including:
 * - Introduction phrases (how they pop in)
 * - Handback phrases (how they return to Ferni)
 * - Context-aware greetings
 * - First-time vs returning cameo variations
 */
import type { CameoPersonaId, CameoTriggerType } from './types.js';
/**
 * Special introductions for when a persona does their FIRST cameo of the session.
 * These are warmer and more personal than repeat cameos.
 */
declare const FIRST_TIME_INTRODUCTIONS: Record<CameoPersonaId, string[]>;
/**
 * Introductions for subsequent cameos (they've met before this session)
 */
declare const RETURNING_INTRODUCTIONS: Record<CameoPersonaId, string[]>;
/**
 * Context-aware greetings based on what triggered the cameo
 */
declare const TRIGGER_GREETINGS: Record<CameoTriggerType, Record<CameoPersonaId, string[]>>;
/**
 * Handback phrases that acknowledge what was just discussed
 */
declare const CONTEXTUAL_HANDBACKS: Record<CameoTriggerType, Record<CameoPersonaId, string[]>>;
/**
 * Get a greeting for a cameo based on context
 */
export declare function getCameoGreeting(personaId: CameoPersonaId, options: {
    isFirstCameo: boolean;
    triggerType?: CameoTriggerType;
    customGreeting?: string;
}): string;
/**
 * Get a handback phrase for a cameo
 */
export declare function getCameoHandback(personaId: CameoPersonaId, options: {
    triggerType?: CameoTriggerType;
    customHandback?: string;
}): string;
/**
 * Build complete cameo speech (greeting + insight + handback)
 */
export declare function buildCameoSpeech(personaId: CameoPersonaId, insight: string, options: {
    isFirstCameo: boolean;
    triggerType?: CameoTriggerType;
    customGreeting?: string;
    customHandback?: string;
}): {
    greeting: string;
    insight: string;
    handback: string;
    fullSpeech: string;
};
/**
 * Get all trigger topics for a persona (for detection)
 */
export declare function getTriggerTopicsForPersona(personaId: CameoPersonaId): string[];
/**
 * Get the best persona for a given topic
 */
export declare function getBestPersonaForTopic(topic: string): CameoPersonaId | null;
/**
 * Get persona color for UI transitions
 * Uses centralized brand colors with cameo config override
 */
export declare function getPersonaColor(personaId: CameoPersonaId): string;
/**
 * Get persona glow color for avatar effects
 * Uses centralized brand colors with cameo config override
 */
export declare function getPersonaGlowColor(personaId: CameoPersonaId): string;
/**
 * Check if persona tends to be energetic in cameos
 */
export declare function isPersonaEnergetic(personaId: CameoPersonaId): boolean;
export { CONTEXTUAL_HANDBACKS, FIRST_TIME_INTRODUCTIONS, RETURNING_INTRODUCTIONS, TRIGGER_GREETINGS, };
declare const _default: {
    getCameoGreeting: typeof getCameoGreeting;
    getCameoHandback: typeof getCameoHandback;
    buildCameoSpeech: typeof buildCameoSpeech;
    getTriggerTopicsForPersona: typeof getTriggerTopicsForPersona;
    getBestPersonaForTopic: typeof getBestPersonaForTopic;
    getPersonaColor: typeof getPersonaColor;
    getPersonaGlowColor: typeof getPersonaGlowColor;
    isPersonaEnergetic: typeof isPersonaEnergetic;
};
export default _default;
//# sourceMappingURL=cameo-content.d.ts.map