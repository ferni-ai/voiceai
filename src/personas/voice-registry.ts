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

import { getLogger } from '../utils/safe-logger.js';
import { discoverAndLoadBundles } from './bundles/index.js';
import { VOICE_IDS, getVoiceIdForPersona, isValidVoiceId } from '../config/voice-ids.js';
// Import from persona-ids.ts - the SINGLE SOURCE OF TRUTH for alias resolution
import {
  toCanonical,
  isKnownId,
  DISPLAY_NAMES,
  ALL_CANONICAL_IDS,
  ALIAS_TO_CANONICAL,
  type CanonicalPersonaId,
} from './persona-ids.js';

// Logger instance for this module
const logger = getLogger();

// ============================================================================
// FALLBACK VOICE IDS
// Imported from config/voice-ids.ts - the SINGLE SOURCE OF TRUTH
// ============================================================================

// Re-export for backwards compatibility
export { VOICE_IDS, isValidVoiceId };

// FIX BUG #11: Build fallback map from single source of truth - include all personas
const FALLBACK_VOICE_IDS: Record<string, string> = {
  ferni: getVoiceIdForPersona('ferni'),
  'jack-b': getVoiceIdForPersona('jack-b'),
  'peter-john': getVoiceIdForPersona('peter-john'),
  'alex-chen': getVoiceIdForPersona('alex-chen'),
  'maya-santos': getVoiceIdForPersona('maya-santos'),
  'jordan-taylor': getVoiceIdForPersona('jordan-taylor'),
  'nayan-patel': getVoiceIdForPersona('nayan-patel'),
  'generic-advisor': getVoiceIdForPersona('generic-advisor'),
};

// Default fallback voice (Ferni)
const DEFAULT_VOICE_ID = VOICE_IDS.FERNI;

// ============================================================================
// VOICE REGISTRY STATE
// ============================================================================

interface VoiceEntry {
  voiceId: string;
  personaName: string;
  provider: string;
}

// Main registry: canonical persona ID -> voice entry
const voiceRegistry = new Map<string, VoiceEntry>();

// NOTE: Alias resolution is now handled by persona-ids.ts (SINGLE SOURCE OF TRUTH)
// The aliasToCanonical map has been removed - use toCanonical() instead

// Initialization state
let initialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the voice registry from bundle manifests.
 * Call this once at application startup.
 * 
 * NOTE: Alias resolution is handled by persona-ids.ts (SINGLE SOURCE OF TRUTH).
 * This function only maps canonical persona IDs to their voice IDs.
 */
export async function initializeVoiceRegistry(): Promise<void> {
  if (initialized) {
    logger.debug('Voice registry already initialized');
    return;
  }

  try {
    const result = await discoverAndLoadBundles();

    for (const bundle of result.bundles) {
      const { manifest } = bundle;
      const canonicalId = manifest.identity.id;

      // Register the voice entry (only for canonical IDs)
      voiceRegistry.set(canonicalId, {
        voiceId: manifest.voice.voice_id,
        personaName: manifest.identity.name,
        provider: manifest.voice.provider,
      });

      // NOTE: Alias registration is handled by persona-ids.ts
      // Bundle aliases should be added to ALIAS_TO_CANONICAL in persona-ids.ts
    }

    initialized = true;

    logger.info(
      {
        voiceCount: voiceRegistry.size,
        personas: Array.from(voiceRegistry.keys()),
      },
      'Voice registry initialized from bundles'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to initialize voice registry from bundles');
    // Fall back to hardcoded defaults
    initializeFallbacks();
  }
}

/**
 * Initialize with fallback values (used if bundle loading fails)
 * 
 * NOTE: Alias resolution is now handled by persona-ids.ts (SINGLE SOURCE OF TRUTH).
 * This function only sets up voice ID mappings for canonical IDs.
 */
function initializeFallbacks(): void {
  // Register fallback voices for all canonical personas
  for (const canonicalId of ALL_CANONICAL_IDS) {
    const voiceId = FALLBACK_VOICE_IDS[canonicalId] || VOICE_IDS.FERNI;
    const displayName = DISPLAY_NAMES[canonicalId] || canonicalId;
    
    voiceRegistry.set(canonicalId, {
      voiceId,
      personaName: displayName,
      provider: 'cartesia',
    });
  }

  // NOTE: Alias resolution is delegated to persona-ids.ts via toCanonical()
  // No need to duplicate alias mappings here

  initialized = true;
  logger.warn('Voice registry initialized with fallback values');
}

// ============================================================================
// VOICE ID RETRIEVAL
// ============================================================================

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
export function getVoiceId(personaId: string): string {
  // Initialize with fallbacks if not yet initialized
  if (!initialized) {
    initializeFallbacks();
  }

  // Use persona-ids.ts for alias resolution (SINGLE SOURCE OF TRUTH)
  const canonicalId = toCanonical(personaId);

  // Look up voice ID for canonical persona
  const entry = voiceRegistry.get(canonicalId);
  if (entry) {
    return entry.voiceId;
  }

  // Check fallbacks
  const fallback = FALLBACK_VOICE_IDS[canonicalId];
  if (fallback) {
    return fallback;
  }

  logger.warn({ personaId, canonicalId }, 'No voice ID found, using default');
  return DEFAULT_VOICE_ID;
}

/**
 * Get voice entry with full details for a persona.
 * 
 * NOTE: Alias resolution is delegated to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export function getVoiceEntry(personaId: string): VoiceEntry | undefined {
  if (!initialized) {
    initializeFallbacks();
  }

  // Use persona-ids.ts for alias resolution
  const canonicalId = toCanonical(personaId);
  return voiceRegistry.get(canonicalId);
}

/**
 * Get canonical persona ID from any alias.
 * 
 * NOTE: Delegates to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export function getCanonicalPersonaId(personaId: string): string {
  // Delegate to persona-ids.ts - no need for initialization here
  return toCanonical(personaId);
}

/**
 * Check if a persona ID or alias is known.
 * 
 * NOTE: Delegates to persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export function isKnownPersona(personaId: string): boolean {
  // Delegate to persona-ids.ts
  return isKnownId(personaId);
}

/**
 * Get all registered persona IDs (canonical only).
 */
export function getAllPersonaIds(): string[] {
  if (!initialized) {
    initializeFallbacks();
  }

  return Array.from(voiceRegistry.keys());
}

/**
 * Get all aliases for a persona.
 * 
 * NOTE: Uses ALIAS_TO_CANONICAL from persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export function getAliasesForPersona(canonicalId: string): string[] {
  const aliases: string[] = [];
  for (const [alias, canonical] of Object.entries(ALIAS_TO_CANONICAL)) {
    if (canonical === canonicalId && alias !== canonicalId) {
      aliases.push(alias);
    }
  }
  return aliases;
}

/**
 * Get the frontend persona ID from any alias.
 * Frontend now uses canonical IDs: ferni, peter-john, alex-chen, maya-santos, jordan-taylor, nayan-patel
 */
export function getFrontendPersonaId(personaId: string): string {
  // Frontend now uses canonical IDs directly (after ID standardization)
  return getCanonicalPersonaId(personaId);
}

/**
 * Get display name for a persona.
 * 
 * NOTE: Uses DISPLAY_NAMES from persona-ids.ts (SINGLE SOURCE OF TRUTH).
 */
export function getPersonaDisplayName(personaId: string): string {
  // Try to get from voice registry first (has bundle-loaded names)
  const entry = getVoiceEntry(personaId);
  if (entry) {
    return entry.personaName;
  }

  // Fall back to DISPLAY_NAMES from persona-ids.ts
  const canonical = toCanonical(personaId);
  return DISPLAY_NAMES[canonical] || personaId;
}

/**
 * Check if voice registry is initialized.
 */
export function isVoiceRegistryInitialized(): boolean {
  return initialized;
}

/**
 * Reset the voice registry (for testing).
 */
export function resetVoiceRegistry(): void {
  voiceRegistry.clear();
  initialized = false;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export default {
  initializeVoiceRegistry,
  getVoiceId,
  getVoiceEntry,
  getCanonicalPersonaId,
  getFrontendPersonaId,
  getPersonaDisplayName,
  isKnownPersona,
  getAllPersonaIds,
  getAliasesForPersona,
  isVoiceRegistryInitialized,
  resetVoiceRegistry,
};
