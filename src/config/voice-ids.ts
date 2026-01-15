/**
 * Voice IDs - Internal Constants
 *
 * This file provides voice ID constants and lookup functions.
 * Used internally by voice-registry.ts.
 *
 * NOTE: For new code, use the voice-registry API via personas/voice-registry.js
 * which provides getVoiceId() for voice ID lookups.
 *
 * Environment variables can OVERRIDE these defaults:
 *   JACK_B_VOICE_ID, PETER_JOHN_VOICE_ID, NAYAN_VOICE_ID, etc.
 *
 * To find voice IDs: https://play.cartesia.ai/library
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'VoiceIds' });

// =============================================================================
// CARTESIA CONFIGURATION
// =============================================================================

/**
 * Cartesia model from environment variable.
 * sonic-3 is the latest with best quality.
 */
export const CARTESIA_MODEL = process.env.CARTESIA_MODEL || 'sonic-3-latest';

/**
 * Cartesia API version for all TTS requests
 */
export const CARTESIA_API_VERSION = process.env.CARTESIA_API_VERSION || '2024-06-10';

/**
 * Cartesia API URL
 */
export const CARTESIA_API_URL = process.env.CARTESIA_API_URL || 'https://api.cartesia.ai';

// =============================================================================
// CANONICAL VOICE IDS
// =============================================================================

/**
 * Voice ID constants - used as fallback/defaults.
 * Bundle manifests are the primary source of truth.
 */
export const VOICE_IDS = {
  // Ferni (life coach) - Dec 2024
  FERNI: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',

  // Peter John (insights quant) - Synced from .env Dec 2024
  PETER_JOHN: '3f04e815-3260-4f50-8fd9-af9c657be4c2',

  // Alex Chen (communications specialist) - Verified Dec 2024
  ALEX_CHEN: '81c164d9-7baa-419d-9f9a-6b18100a01ee',

  // Maya Santos (spend & save coach) - Synced from .env Dec 2024
  MAYA_SANTOS: '11175483-5332-496c-8c01-ca527ce04e4a',

  // Jordan Taylor (event planner) - Verified Dec 2024
  JORDAN_TAYLOR: 'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',

  // Nayan Patel (lifetime advisor / sage) - Updated Dec 2024
  NAYAN_PATEL: '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3',

  // Joel Dickson (Vanguard life mentor) - Added Jan 2025
  JOEL_DICKSON: '3ebcd114-d280-4eed-a238-b9323a6b8e52',

  // Generic advisor fallback
  GENERIC: '79a125e8-cd45-4c13-8a67-188112f4dd22',
} as const;

/**
 * Alias for backwards compatibility with cartesia-core.ts
 */
export const DEFAULT_VOICE_IDS = VOICE_IDS;

// =============================================================================
// PERSONA TO VOICE MAPPING
// =============================================================================

/**
 * Map canonical persona IDs to their voice IDs.
 * Environment variables can override these.
 * Used internally by voice-registry.ts.
 */
export function getVoiceIdForPersona(personaId: string): string {
  const normalized = personaId.toLowerCase();

  // Check environment variable override first
  // Canonical names (preferred) with fallback to legacy names
  const envOverrides: Record<string, string | undefined> = {
    ferni: process.env.FERNI_VOICE_ID || process.env.JACK_B_VOICE_ID,
    'jack-b': process.env.FERNI_VOICE_ID || process.env.JACK_B_VOICE_ID,
    // Peter John: check canonical name, then legacy JACK_BOGLE_VOICE_ID as temporary fallback
    'peter-john': process.env.PETER_JOHN_VOICE_ID || process.env.JACK_BOGLE_VOICE_ID,
    'alex-chen': process.env.ALEX_CHEN_VOICE_ID || process.env.COMM_SPECIALIST_VOICE_ID,
    'maya-santos': process.env.MAYA_SANTOS_VOICE_ID || process.env.SPEND_SAVE_VOICE_ID,
    'jordan-taylor': process.env.JORDAN_TAYLOR_VOICE_ID || process.env.EVENT_PLANNER_VOICE_ID,
    'nayan-patel':
      process.env.NAYAN_PATEL_VOICE_ID ||
      process.env.NAYAN_VOICE_ID ||
      process.env.PETER_LYNCH_VOICE_ID,
    'joel-dickson': process.env.JOEL_DICKSON_VOICE_ID,
    'generic-advisor': process.env.GENERIC_ADVISOR_VOICE_ID,
  };

  const envOverride = envOverrides[normalized];
  if (envOverride) {
    return envOverride;
  }

  // Use hardcoded defaults (for backwards compatibility)
  // New agents should use bundle manifests instead
  const defaults: Record<string, string> = {
    // Ferni aliases
    ferni: VOICE_IDS.FERNI,
    'jack-b': VOICE_IDS.FERNI,
    coach: VOICE_IDS.FERNI,
    'life-coach': VOICE_IDS.FERNI,

    // Peter John aliases
    'peter-john': VOICE_IDS.PETER_JOHN,
    peter: VOICE_IDS.PETER_JOHN,
    john: VOICE_IDS.PETER_JOHN,

    // Alex Chen aliases
    'alex-chen': VOICE_IDS.ALEX_CHEN,
    alex: VOICE_IDS.ALEX_CHEN,
    'comm-specialist': VOICE_IDS.ALEX_CHEN,

    // Maya Santos aliases
    'maya-santos': VOICE_IDS.MAYA_SANTOS,
    maya: VOICE_IDS.MAYA_SANTOS,
    'spend-save': VOICE_IDS.MAYA_SANTOS,

    // Jordan Taylor aliases
    'jordan-taylor': VOICE_IDS.JORDAN_TAYLOR,
    jordan: VOICE_IDS.JORDAN_TAYLOR,
    'event-planner': VOICE_IDS.JORDAN_TAYLOR,

    // Nayan Patel aliases
    'nayan-patel': VOICE_IDS.NAYAN_PATEL,
    nayan: VOICE_IDS.NAYAN_PATEL,
    patel: VOICE_IDS.NAYAN_PATEL,
    guru: VOICE_IDS.NAYAN_PATEL,
    mystic: VOICE_IDS.NAYAN_PATEL,
    'lifetime-advisor': VOICE_IDS.NAYAN_PATEL,

    // Joel Dickson aliases
    'joel-dickson': VOICE_IDS.JOEL_DICKSON,
    joel: VOICE_IDS.JOEL_DICKSON,
    dickson: VOICE_IDS.JOEL_DICKSON,
    'dr-dickson': VOICE_IDS.JOEL_DICKSON,
    'vanguard-mentor': VOICE_IDS.JOEL_DICKSON,
    'life-mentor': VOICE_IDS.JOEL_DICKSON,

    // Generic
    'generic-advisor': VOICE_IDS.GENERIC,
  };

  const voiceId = defaults[normalized];
  if (!voiceId) {
    // FIX: Log warning when falling back to Ferni's voice for debugging
    log.warn(
      { personaId, normalized },
      '⚠️ Unknown persona ID in voice lookup - falling back to Ferni voice'
    );
    return VOICE_IDS.FERNI;
  }
  return voiceId;
}

// =============================================================================
// NEW: ASYNC VOICE ID LOOKUP (uses unified registry)
// =============================================================================

/**
 * Get voice ID from bundle manifest (async, preferred method)
 * Falls back to legacy VOICE_IDS if agent not found
 */
export async function getVoiceIdFromManifest(personaId: string): Promise<string> {
  try {
    // Dynamic import to avoid circular dependencies
    const { AgentRegistry } = await import('../personas/registry/unified-registry.js');
    return await AgentRegistry.getVoiceId(personaId);
  } catch {
    // Fall back to synchronous lookup if registry fails
    log.warn({ personaId }, 'Failed to get voice ID from registry, using legacy lookup');
    return getVoiceIdForPersona(personaId);
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a voice ID format (UUID v4)
 */
export function isValidVoiceId(voiceId: string): boolean {
  if (!voiceId || typeof voiceId !== 'string') return false;
  // Cartesia uses UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(voiceId);
}

/**
 * Log voice ID assignments for debugging
 */
export function logVoiceIdAssignments(): void {
  log.info('Voice ID Assignments:');
  const personas = [
    'ferni',
    'peter-john',
    'alex-chen',
    'maya-santos',
    'jordan-taylor',
    'nayan-patel',
    'joel-dickson',
  ];

  for (const persona of personas) {
    const voiceId = getVoiceIdForPersona(persona);
    const isValid = isValidVoiceId(voiceId);
    const status = isValid ? 'valid' : 'INVALID';
    log.info({ persona, voiceId, status }, `${persona}: ${status}`);
  }
}
