/**
 * Cognitive Profiles for Each Persona
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Defines HOW each persona THINKS - their reasoning style,
 * attention patterns, cognitive biases, and metacognitive awareness.
 *
 * These profiles make each AI truly different, not just in personality
 * but in how they approach problems and process information.
 *
 * Real humans have blind spots, biases, and uncertainty. So do we.
 */
import type { CognitiveProfile } from './cognitive-types.js';
export declare const ferniCognitiveProfile: CognitiveProfile;
export declare const peterCognitiveProfile: CognitiveProfile;
export declare const alexCognitiveProfile: CognitiveProfile;
export declare const mayaCognitiveProfile: CognitiveProfile;
export declare const jordanCognitiveProfile: CognitiveProfile;
export declare const nayanCognitiveProfile: CognitiveProfile;
/**
 * Hardcoded cognitive profiles - used as fallbacks when bundles aren't loaded.
 * NOTE: Prefer loading from bundles via loadCognitiveProfileFromBundle()
 */
export declare const cognitiveProfiles: Record<string, CognitiveProfile>;
/**
 * Register a cognitive profile loaded from a bundle.
 * Called by the bundle adapter when loading persona bundles.
 */
export declare function registerBundleCognitiveProfile(personaId: string, profile: CognitiveProfile): void;
/**
 * Clear bundle cognitive profiles (for testing).
 */
export declare function clearBundleCognitiveProfiles(): void;
/**
 * Convert bundle cognitive JSON to CognitiveProfile type.
 * Handles the snake_case to camelCase conversion.
 */
export declare function convertBundleCognitive(bundleCognitive: Record<string, unknown>): CognitiveProfile;
/**
 * Get cognitive profile for a persona.
 * Checks bundle-loaded profiles first, falls back to hardcoded profiles.
 *
 * @param personaId - Canonical persona ID
 * @returns CognitiveProfile or undefined if not found
 */
export declare function getCognitiveProfile(personaId: string): CognitiveProfile | undefined;
/**
 * Check if a cognitive profile exists (in either bundles or hardcoded).
 */
export declare function hasCognitiveProfile(personaId: string): boolean;
export default cognitiveProfiles;
//# sourceMappingURL=cognitive-profiles.d.ts.map