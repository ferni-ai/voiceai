/**
 * Voice Registry - Single Source of Truth for Voice IDs
 *
 * All voice IDs should be retrieved through this module.
 * Voice IDs are defined in bundle manifests and cached here for performance.
 *
 * Usage:
 *   import { getVoiceId, initializeVoiceRegistry } from './voice-registry.js';
 *
 *   // Initialize once at startup (loads from bundles)
 *   await initializeVoiceRegistry();
 *
 *   // Get voice ID for any persona (sync after initialization)
 *   const voiceId = getVoiceId('maya-santos'); // or 'maya', 'spend-save'
 */

import { getLogger } from '../utils/safe-logger.js';
import { discoverAndLoadBundles } from './bundles/index.js';
import { VOICE_IDS, getVoiceIdForPersona, isValidVoiceId } from '../config/voice-ids.js';

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

// Alias mapping: any alias -> canonical persona ID
const aliasToCanonical = new Map<string, string>();

// Initialization state
let initialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the voice registry from bundle manifests.
 * Call this once at application startup.
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

      // Register the voice entry
      voiceRegistry.set(canonicalId, {
        voiceId: manifest.voice.voice_id,
        personaName: manifest.identity.name,
        provider: manifest.voice.provider,
      });

      // Register canonical ID as its own alias
      aliasToCanonical.set(canonicalId, canonicalId);
      aliasToCanonical.set(canonicalId.toLowerCase(), canonicalId);

      // Register all aliases
      const aliases = manifest.identity.aliases || [];
      for (const alias of aliases) {
        aliasToCanonical.set(alias, canonicalId);
        aliasToCanonical.set(alias.toLowerCase(), canonicalId);
      }

      // Register name-based aliases (lowercase, hyphenated)
      const nameAlias = manifest.identity.name.toLowerCase().replace(/\s+/g, '-');
      if (!aliasToCanonical.has(nameAlias)) {
        aliasToCanonical.set(nameAlias, canonicalId);
      }
    }

    initialized = true;

    logger.info(
      {
        voiceCount: voiceRegistry.size,
        aliasCount: aliasToCanonical.size,
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
 */
function initializeFallbacks(): void {
  // Register fallback voices
  for (const [id, voiceId] of Object.entries(FALLBACK_VOICE_IDS)) {
    voiceRegistry.set(id, {
      voiceId,
      personaName: id,
      provider: 'cartesia',
    });
    aliasToCanonical.set(id, id);
  }

  // Common aliases - covers all ID formats used across the codebase:
  // - Bundle IDs (canonical): ferni, alex-chen, maya-santos, jordan-taylor
  // - Frontend IDs: jack-b, comm-specialist, spend-save, event-planner
  // - Short names: alex, maya, jordan, jack, peter
  // - Legacy IDs: coach, life-coach, etc.
  const commonAliases: Record<string, string> = {
    // Ferni (Coach) aliases
    'jack-b': 'ferni',
    coach: 'ferni',
    'life-coach': 'ferni',
    jackie: 'ferni',

    // Peter John aliases
    peter: 'peter-john',
    lynch: 'peter-john',
    researcher: 'peter-john',
    'stock-storyteller': 'peter-john',

    // Alex Chen aliases (frontend: comm-specialist, backend: alex-chen)
    alex: 'alex-chen',
    'comm-specialist': 'alex-chen',
    comm: 'alex-chen',
    communications: 'alex-chen',
    communicator: 'alex-chen',
    'generic-advisor': 'alex-chen', // Fallback maps to Alex

    // Maya Santos aliases (frontend: spend-save, backend: maya-santos)
    maya: 'maya-santos',
    'spend-save': 'maya-santos',
    spend: 'maya-santos',
    save: 'maya-santos',
    budget: 'maya-santos',
    'habits-coach': 'maya-santos',
    'debt-counselor': 'maya-santos', // Legacy
    debt: 'maya-santos',

    // Jordan Taylor aliases (frontend: event-planner, backend: jordan-taylor)
    jordan: 'jordan-taylor',
    'event-planner': 'jordan-taylor',
    event: 'jordan-taylor',
    planner: 'jordan-taylor',
    events: 'jordan-taylor',
    'retirement-specialist': 'jordan-taylor', // Legacy
    retirement: 'jordan-taylor',

    // Nayan Patel aliases (lifetime advisor, spiritual guide)
    nayan: 'nayan-patel',
    sadhguru: 'nayan-patel',
    guru: 'nayan-patel',
    mystic: 'nayan-patel',
    'lifetime-advisor': 'nayan-patel',
    'spiritual-guide': 'nayan-patel',
    sage: 'nayan-patel',
    'sage-mentor': 'nayan-patel',
    wisdom: 'nayan-patel',
  };

  for (const [alias, canonical] of Object.entries(commonAliases)) {
    aliasToCanonical.set(alias, canonical);
  }

  initialized = true;
  logger.warn('Voice registry initialized with fallback values');
}

// ============================================================================
// VOICE ID RETRIEVAL
// ============================================================================

/**
 * Get voice ID for a persona by any ID or alias.
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

  const normalized = personaId.toLowerCase();

  // Try to find canonical ID from alias
  const canonicalId = aliasToCanonical.get(normalized);

  if (canonicalId) {
    const entry = voiceRegistry.get(canonicalId);
    if (entry) {
      return entry.voiceId;
    }
  }

  // Try direct lookup
  const directEntry = voiceRegistry.get(normalized);
  if (directEntry) {
    return directEntry.voiceId;
  }

  // Check fallbacks
  const fallback = FALLBACK_VOICE_IDS[normalized];
  if (fallback) {
    return fallback;
  }

  logger.warn({ personaId }, 'Unknown persona ID, using default voice');
  return DEFAULT_VOICE_ID;
}

/**
 * Get voice entry with full details for a persona.
 */
export function getVoiceEntry(personaId: string): VoiceEntry | undefined {
  if (!initialized) {
    initializeFallbacks();
  }

  const normalized = personaId.toLowerCase();
  const canonicalId = aliasToCanonical.get(normalized);

  if (canonicalId) {
    return voiceRegistry.get(canonicalId);
  }

  return voiceRegistry.get(normalized);
}

/**
 * Get canonical persona ID from any alias.
 */
export function getCanonicalPersonaId(personaId: string): string {
  if (!initialized) {
    initializeFallbacks();
  }

  const normalized = personaId.toLowerCase();
  return aliasToCanonical.get(normalized) || personaId;
}

/**
 * Check if a persona ID or alias is known.
 */
export function isKnownPersona(personaId: string): boolean {
  if (!initialized) {
    initializeFallbacks();
  }

  const normalized = personaId.toLowerCase();
  return aliasToCanonical.has(normalized) || voiceRegistry.has(normalized);
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
 */
export function getAliasesForPersona(canonicalId: string): string[] {
  if (!initialized) {
    initializeFallbacks();
  }

  const aliases: string[] = [];
  for (const [alias, canonical] of aliasToCanonical.entries()) {
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
 */
export function getPersonaDisplayName(personaId: string): string {
  const entry = getVoiceEntry(personaId);
  if (entry) {
    return entry.personaName;
  }

  // Fallback display names
  const displayNames: Record<string, string> = {
    ferni: 'Ferni',
    'jack-b': 'Ferni',
    'peter-john': 'Peter',
    'alex-chen': 'Alex',
    'comm-specialist': 'Alex',
    'maya-santos': 'Maya',
    'spend-save': 'Maya',
    'jordan-taylor': 'Jordan',
    'event-planner': 'Jordan',
    'nayan-patel': 'Nayan',
    sadhguru: 'Nayan',
    nayan: 'Nayan',
    'lifetime-advisor': 'Nayan',
  };

  const canonical = getCanonicalPersonaId(personaId);
  return displayNames[canonical] || displayNames[personaId] || personaId;
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
  aliasToCanonical.clear();
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
