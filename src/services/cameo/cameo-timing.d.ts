/**
 * Cameo Timing Configuration
 *
 * Centralized timing constants for the Team Cameo system.
 * These values are carefully tuned for natural, human-like transitions.
 *
 * Philosophy: Cameos should feel like a friend briefly chiming in -
 * quick enough to not disrupt flow, long enough to add value.
 */
import type { CameoConfig, CameoPersonaId, PersonaCameoConfig } from './types.js';
/**
 * Timing constants for cameo transitions
 */
export declare const CAMEO_TIMING: {
    /** Delay before voice switch after cameo announced (ms) - allows sound + visual */
    readonly ARRIVAL_DELAY: 500;
    /** Delay before returning to Ferni after cameo ends (ms) */
    readonly RETURN_DELAY: 300;
    /** Duration of arrival sound effect (ms) */
    readonly ARRIVAL_SOUND_DURATION: 500;
    /** Duration of return sound effect (ms) */
    readonly RETURN_SOUND_DURATION: 400;
    /** Maximum time a cameo can last (ms) - hard limit */
    readonly MAX_DURATION: 15000;
    /** Ideal/target duration for cameos (ms) */
    readonly IDEAL_DURATION: 5000;
    /** Minimum duration for a cameo to be worthwhile (ms) */
    readonly MIN_DURATION: 2000;
    /** Warning threshold - prompt handback if exceeded (ms) */
    readonly WARNING_DURATION: 10000;
    /** Minimum time between cameos (ms) */
    readonly COOLDOWN: 60000;
    /** Reduced cooldown for high-priority cameos (ms) */
    readonly HIGH_PRIORITY_COOLDOWN: 30000;
    /** Celebration cameos can happen more frequently (ms) */
    readonly CELEBRATION_COOLDOWN: 20000;
    /** Maximum cameos per session */
    readonly MAX_PER_SESSION: 6;
    /** Maximum cameos in a 10-minute window */
    readonly MAX_PER_WINDOW: 3;
    /** Window size for rate limiting (ms) */
    readonly RATE_LIMIT_WINDOW: number;
    /** Visual transition duration for avatar morph (ms) */
    readonly VISUAL_TRANSITION: 350;
    /** Glow pulse duration during cameo (ms) */
    readonly GLOW_PULSE_DURATION: 600;
    /** Text morph duration (ms) */
    readonly TEXT_MORPH_DURATION: 250;
    /** Color transition duration (ms) */
    readonly COLOR_TRANSITION: 400;
    /** Buffer time for voice switch to complete (ms) */
    readonly VOICE_SWITCH_BUFFER: 100;
    /** Time to wait for TTS to start after voice switch (ms) */
    readonly TTS_START_BUFFER: 50;
    /** Max time to wait for the voice-agent handler to confirm greeting (ms) */
    readonly HANDLER_TIMEOUT: 10000;
};
/**
 * Persona-specific cameo configurations
 * Each persona has their own style, energy, and typical duration
 */
export declare const PERSONA_CAMEO_CONFIGS: Record<CameoPersonaId, PersonaCameoConfig>;
/**
 * Complete cameo configuration
 */
export declare const CAMEO_CONFIG: CameoConfig;
/**
 * Get the cooldown time for a given priority level
 */
export declare function getCooldownForPriority(priority: 'normal' | 'high' | 'celebration'): number;
/**
 * Get persona-specific cameo configuration
 */
export declare function getPersonaCameoConfig(personaId: CameoPersonaId): PersonaCameoConfig;
/**
 * Get a random introduction phrase for a persona
 */
export declare function getRandomIntroduction(personaId: CameoPersonaId): string;
/**
 * Get a random handback phrase for a persona
 */
export declare function getRandomHandback(personaId: CameoPersonaId): string;
/**
 * Check if enough time has passed since last cameo
 * @param lastCameoEndTime - When the last cameo ended
 * @param priority - Priority level affects cooldown
 * @param customCooldownMs - Optional custom cooldown (e.g., from user preferences)
 */
export declare function isCooldownExpired(lastCameoEndTime: number, priority?: 'normal' | 'high' | 'celebration', customCooldownMs?: number): boolean;
/**
 * Get remaining cooldown time in milliseconds
 * @param lastCameoEndTime - When the last cameo ended
 * @param priority - Priority level affects cooldown
 * @param customCooldownMs - Optional custom cooldown (e.g., from user preferences)
 */
export declare function getRemainingCooldown(lastCameoEndTime: number, priority?: 'normal' | 'high' | 'celebration', customCooldownMs?: number): number;
/**
 * Calculate total transition time (arrival + return)
 */
export declare function getTotalTransitionTime(): number;
export default CAMEO_TIMING;
//# sourceMappingURL=cameo-timing.d.ts.map