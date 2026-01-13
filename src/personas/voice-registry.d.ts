/**
 * Voice Registry - Voice ID and Persona ID Resolution
 *
 * This module handles voice IDs and persona ID normalization.
 * Voice IDs are loaded from bundle manifests and cached for performance.
 *
 * NOTE: Alias resolution is delegated to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 * This module only handles voice ID mapping.
 *
 * PREFERRED IMPORT (via central module):
 *   import { getVoiceId, getCanonicalPersonaId } from '../personas/index.js';
 *
 * DIRECT IMPORT (also works):
 *   import { getVoiceId, initializeVoiceRegistry } from './voice-registry.js';
 *
 * Usage:
 *   // Initialize once at startup (loads from bundles)
 *   await initializeVoiceRegistry();
 *
 *   // Get voice ID for any persona (sync after initialization)
 *   const voiceId = getVoiceId('maya-santos'); // or 'maya', 'spend-save'
 */
import { VOICE_IDS, isValidVoiceId } from '../config/voice-ids.js';
export { VOICE_IDS, isValidVoiceId };
interface VoiceEntry {
    voiceId: string;
    personaName: string;
    provider: string;
}
/**
 * Initialize the voice registry from bundle manifests.
 * Call this once at application startup.
 *
 * NOTE: Alias resolution is handled by persona-ids.ts (SINGLE SOURCE OF TRUTH).
 * This function only maps canonical persona IDs to their voice IDs.
 */
export declare function initializeVoiceRegistry(): Promise<void>;
/**
 * Get voice ID for a persona by any ID or alias.
 *
 * NOTE: Alias resolution is delegated to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 *
 * @param personaId - Canonical ID, alias, or short name
 * @returns Voice ID string
 *
 * @example
 * getVoiceId('maya-santos')     // canonical
 * getVoiceId('maya')            // short alias
 * getVoiceId('spend-save')      // frontend ID
 */
export declare function getVoiceId(personaId: string): string;
/**
 * Get voice entry with full details for a persona.
 *
 * NOTE: Alias resolution is delegated to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export declare function getVoiceEntry(personaId: string): VoiceEntry | undefined;
/**
 * Get canonical persona ID from any alias.
 *
 * NOTE: For core team, delegates to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 * For marketplace agents, returns the ID as-is (already canonical).
 */
export declare function getCanonicalPersonaId(personaId: string): string;
/**
 * Check if a persona ID or alias is known.
 *
 * NOTE: Delegates to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export declare function isKnownPersona(personaId: string): boolean;
/**
 * Get all registered persona IDs (canonical only).
 */
export declare function getAllPersonaIds(): string[];
/**
 * Get all aliases for a persona.
 *
 * NOTE: Uses ALIAS_TO_CANONICAL from persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export declare function getAliasesForPersona(canonicalId: string): string[];
/**
 * Get the frontend persona ID from any alias.
 * Frontend now uses canonical IDs: ferni, peter-john, alex-chen, maya-santos, jordan-taylor, nayan-patel
 */
export declare function getFrontendPersonaId(personaId: string): string;
/**
 * Get display name for a persona.
 *
 * NOTE: Uses DISPLAY_NAMES from persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export declare function getPersonaDisplayName(personaId: string): string;
/**
 * Check if voice registry is initialized.
 */
export declare function isVoiceRegistryInitialized(): boolean;
/**
 * Reset the voice registry (for testing).
 */
export declare function resetVoiceRegistry(): void;
declare const _default: {
    initializeVoiceRegistry: typeof initializeVoiceRegistry;
    getVoiceId: typeof getVoiceId;
    getVoiceEntry: typeof getVoiceEntry;
    getCanonicalPersonaId: typeof getCanonicalPersonaId;
    getFrontendPersonaId: typeof getFrontendPersonaId;
    getPersonaDisplayName: typeof getPersonaDisplayName;
    isKnownPersona: typeof isKnownPersona;
    getAllPersonaIds: typeof getAllPersonaIds;
    getAliasesForPersona: typeof getAliasesForPersona;
    isVoiceRegistryInitialized: typeof isVoiceRegistryInitialized;
    resetVoiceRegistry: typeof resetVoiceRegistry;
};
export default _default;
//# sourceMappingURL=voice-registry.d.ts.map