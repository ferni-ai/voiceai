/**
 * Cartesia Voice Localization Service
 *
 * This service handles localizing Ferni voices to different English accents
 * using Cartesia's Voice Localization API.
 *
 * CRITICAL: The `language` parameter in Cartesia TTS does NOT change accents.
 * You must use the Localization API to create accent-specific voice IDs.
 *
 * PERSISTENCE: Localized voice IDs are cached in Firestore to avoid
 * repeated API calls across server restarts.
 *
 * @see https://docs.cartesia.ai/api-reference/voices/localize
 */
import { type EnglishAccent } from '../../config/voice-accents.js';
export interface LocalizedVoice {
    id: string;
    name: string;
    description: string;
    language: string;
    dialect: string;
    originalVoiceId: string;
    createdAt: string;
}
export interface LocalizationResult {
    voiceId: string;
    isLocalized: boolean;
    accent: EnglishAccent;
    cached: boolean;
}
/**
 * Load all cached localized voices from Firestore into memory.
 * Call this at startup to hydrate the in-memory cache.
 */
export declare function loadCacheFromFirestore(): Promise<number>;
/**
 * Get a localized voice ID for a persona + accent combination.
 *
 * - For American accent: returns the original voice ID (no localization needed)
 * - For other accents: returns a cached localized voice ID, or creates one
 *
 * @param personaId - Canonical persona ID (e.g., 'ferni', 'peter-john')
 * @param accent - Target English accent
 * @returns Localization result with voice ID
 *
 * @example
 * const result = await getLocalizedVoiceId('ferni', 'british');
 * // result.voiceId is the British-accented Ferni voice
 */
export declare function getLocalizedVoiceId(personaId: string, accent: EnglishAccent): Promise<LocalizationResult>;
/**
 * Synchronous version that returns from cache only.
 * Use this when you can't await (e.g., in TTS constructor).
 *
 * Returns the original voice ID if not cached.
 */
export declare function getLocalizedVoiceIdSync(personaId: string, accent: EnglishAccent): string;
/**
 * Pre-warm the localized voice cache for common persona + accent combinations.
 * Call this at application startup to avoid API calls during user sessions.
 *
 * @param personaIds - Personas to pre-warm (defaults to all)
 * @param accents - Accents to pre-warm (defaults to all non-American)
 */
export declare function preWarmLocalizedVoices(personaIds?: string[], accents?: EnglishAccent[]): Promise<void>;
/**
 * Check if a localized voice is cached.
 */
export declare function isVoiceCached(personaId: string, accent: EnglishAccent): boolean;
/**
 * Get cache statistics.
 */
export declare function getLocalizationCacheStats(): {
    size: number;
    entries: Array<{
        personaId: string;
        accent: string;
        voiceId: string;
    }>;
};
/**
 * Clear the cache (for testing).
 * @param clearFirestore - Also clear Firestore (default: false for tests)
 */
export declare function clearLocalizationCache(clearFirestore?: boolean): Promise<void>;
/**
 * Initialize the localization service.
 * Call this at application startup.
 *
 * @param options.loadFromFirestore - Load cached voices from Firestore (default: true)
 * @param options.preWarm - Pre-warm cache by calling Cartesia API (default: false)
 */
export declare function initializeLocalizationService(options?: {
    loadFromFirestore?: boolean;
    preWarm?: boolean;
}): Promise<void>;
//# sourceMappingURL=cartesia-voice-localization.d.ts.map