/**
 * Voice Configuration
 *
 * Voice configurations for all personas with Cartesia Sonic-3 expressiveness settings.
 * Voice IDs are loaded dynamically from the voice registry.
 * Model is imported from config/voice-ids.ts (single source of truth).
 *
 * Each persona has:
 * - defaultEmotion: Their baseline emotional state
 * - emotionRange: Natural emotions they express
 * - defaultSpeed: Speech pace (0.6-1.5)
 * - defaultVolume: Volume (0.5-2.0)
 * - laughterFrequency: How often they laugh
 */
import type { VoiceAgentId, VoiceConfig } from './types.js';
export { getEmotionProfile, PERSONA_EMOTION_PROFILES, type PersonaEmotionProfile, } from '../emotion-profiles.js';
/**
 * Voice configurations for all personas.
 * Voice IDs are loaded dynamically from the voice registry.
 * Legacy 'peter' alias included for backward compatibility.
 */
export declare const VOICES: Record<VoiceAgentId, VoiceConfig>;
//# sourceMappingURL=config.d.ts.map