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
 * Cartesia model (CARTESIA_MODEL). A dated Sonic snapshot never changes; the bare sonic-3.6 alias moves to
 * each new stable snapshot, which can change Ferni's sound without a deploy.
 * Cartesia recommends a dated snapshot in production.
 */
export const CARTESIA_SNAPSHOT = 'sonic-3.6-2026-08-27';
/** The pinned snapshot under main's name (#179). */
export const DEFAULT_CARTESIA_MODEL = CARTESIA_SNAPSHOT;
export const CARTESIA_MODEL = pinCartesiaModel(process.env.CARTESIA_MODEL);

/**
 * Cartesia pronunciation dictionary for names TTS gets wrong (e.g. Nayan,
 * which sonic read as "NIGH-in"), built by pronunciationDictItems() in
 * speech/pronunciation-memory/team-names.ts. Spread into every TTS request.
 */
export function cartesiaPronunciation(env: Record<string, string | undefined> = process.env): {
  pronunciation_dict_id?: string;
} {
  const id = env.CARTESIA_PRONUNCIATION_DICT_ID?.trim();
  return id ? { pronunciation_dict_id: id } : {};
}

/**
 * True for a dated Sonic snapshot at 3.6 or newer (e.g. sonic-3.6-2026-08-27).
 * Everything else is an alias or a retired model: sonic-3-latest and
 * sonic-latest now point at the beta sonic-preview, the bare 3.6 alias moves
 * with each release, and Sonic 2, Turbo and Sonic 3 before 3.6 are shut down or
 * on their way out (docs.cartesia.ai/build-with-cartesia/tts-models/api-changes).
 */
export function isPinnedCartesiaModel(model: string): boolean {
  const match = /^sonic-(\d+)\.(\d+)-\d{4}-\d{2}-\d{2}$/.exec(model);
  if (!match) return false;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return major > 3 || (major === 3 && minor >= 6);
}

/** Any model that is not a dated 3.6+ snapshot (an alias, a retired model, or nothing) becomes the snapshot. */
export function pinCartesiaModel(model: string | undefined): string {
  const requested = model?.trim();
  if (!requested || isPinnedCartesiaModel(requested)) return requested || CARTESIA_SNAPSHOT;
  log.warn(
    { requested, using: CARTESIA_SNAPSHOT },
    'CARTESIA_MODEL is an alias or a retired model; using the pinned snapshot'
  );
  return CARTESIA_SNAPSHOT;
}

/**
 * Cartesia API version (Cartesia-Version header / cartesia_version query) for
 * every TTS and voices request. 2026-08-14 drops voice embeddings, the
 * experimental voice controls and top-level speed/duration, takes
 * locale/accent/normalization, returns JSON errors, and localizes by
 * accent id. An older override is ignored, like a retired model.
 */
export const CARTESIA_API_VERSION_PINNED = '2026-08-14';
export function pinCartesiaApiVersion(version: string | undefined): string {
  const requested = version?.trim();
  return requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested > CARTESIA_API_VERSION_PINNED
    ? requested
    : CARTESIA_API_VERSION_PINNED;
}
export const CARTESIA_API_VERSION = pinCartesiaApiVersion(process.env.CARTESIA_API_VERSION);

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
  // Ferni (life coach) - "First Principal 2", a Cartesia instant clone (Dec 2024
  // → 2026-10-03, 10-04 → 10-17, and again since 2026-10-20, when Seth moved
  // prod back from calm B (FERNI_CALM_B_VOICE_ID) because it was too calm).
  // The FERNI_VOICE_ID secret overrides this in dev and prod; read it through
  // getVoiceIdForPersona('ferni'), never this constant, so the two can't drift.
  // Instant clones only: a Pro clone ignores <emotion> and <speed>.
  FERNI: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',

  // Peter John (insights quant) - Synced from .env Dec 2024
  PETER_JOHN: '3f04e815-3260-4f50-8fd9-af9c657be4c2',

  // Alex Chen (communications specialist) - Verified Dec 2024
  ALEX_CHEN: '81c164d9-7baa-419d-9f9a-6b18100a01ee',

  // Maya Santos (spend & save coach) - Synced from .env Dec 2024
  MAYA_SANTOS: '11175483-5332-496c-8c01-ca527ce04e4a',

  // Jordan Taylor (event planner) - Verified Dec 2024
  JORDAN_TAYLOR: 'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',

  // Nayan Patel (lifetime advisor / sage): instant clone of Krishna Choudhary, with consent (2026-10-17)
  NAYAN_PATEL: '6da65da0-cad8-4820-901c-549561d93ff3',

  // Financial Legends: fictional characters on stock Cartesia library voices
  // (2026-10-11). The constant names are the persona ids, which predate them.
  // Nate Holloway (joel-dickson): "Ben - Helpful Man", warm, slightly raspy, middle-aged
  JOEL_DICKSON: 'bbee10a8-4f08-4c5c-8282-e69299115055',
  // Tom Brannigan (peter-lynch): "Hugh - Confident Veteran", seasoned, lively
  PETER_LYNCH: '4cf80313-54dc-4ca9-a17c-3e5b8f68a78c',
  // Henry Caldwell (john-bogle): "Carl - Steady Storyteller", mature, calm, measured
  JOHN_BOGLE: 'ed82c17b-4704-4d34-be43-5d19065acdf1',

  // Generic advisor fallback
  GENERIC: '79a125e8-cd45-4c13-8a67-188112f4dd22',
} as const;

/**
 * "Ferni calm B" (instant clone re-cloned 2026-10-16 from the calmest takes of
 * First Principal 2), Ferni's prod voice 2026-10-17 → 10-20. Seth found it too
 * calm. Kept only as the rollback value for FERNI_VOICE_ID; no persona's default.
 * Still a Ferni voice, so custom agents and the developer catalog may not use it.
 */
export const FERNI_CALM_B_VOICE_ID = '2e7f8a26-1627-4d66-88dc-293c297c1619';

/** Lester Nare (Pro) V3, Ferni's voice 2026-10-03 to 10-04: a PVC that ignores <emotion>/<speed>. */
export const LESTER_PRO_V3_VOICE_ID = 'ebaf7477-b6ae-417e-be54-19e6176777ea';

/**
 * Private voice clones the legends used to speak in, cloned from the real people
 * the persona ids are named for. No persona may speak in them, so an environment
 * override that names one is ignored (the clones stay in the Cartesia account;
 * nothing here deletes them).
 */
export const RETIRED_CLONE_VOICE_IDS: ReadonlySet<string> = new Set([
  '3ebcd114-d280-4eed-a238-b9323a6b8e52', // "joel"
  '85680374-8d94-43a1-bb15-5eea7a8bdbb8', // "Peter"
  '9c10dc48-8799-42f9-a72a-0c7dfe13a06d', // "john 2" (bogle)
]);

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
  // Every Ferni alias, and the unknown-persona fallback below, honours the override.
  const ferniOverride = process.env.FERNI_VOICE_ID || process.env.JACK_B_VOICE_ID;
  const envOverrides: Record<string, string | undefined> = {
    ferni: ferniOverride,
    'jack-b': ferniOverride,
    coach: ferniOverride,
    'life-coach': ferniOverride,
    // Peter John: check canonical name, then legacy JACK_BOGLE_VOICE_ID as temporary fallback
    'peter-john': process.env.PETER_JOHN_VOICE_ID || process.env.JACK_BOGLE_VOICE_ID,
    'alex-chen': process.env.ALEX_CHEN_VOICE_ID || process.env.COMM_SPECIALIST_VOICE_ID,
    'maya-santos': process.env.MAYA_SANTOS_VOICE_ID || process.env.SPEND_SAVE_VOICE_ID,
    'jordan-taylor': process.env.JORDAN_TAYLOR_VOICE_ID || process.env.EVENT_PLANNER_VOICE_ID,
    'nayan-patel': process.env.NAYAN_PATEL_VOICE_ID || process.env.NAYAN_VOICE_ID,
    'joel-dickson': process.env.JOEL_DICKSON_VOICE_ID,
    // Financial Legends
    'peter-lynch': process.env.PETER_LYNCH_VOICE_ID,
    'john-bogle': process.env.JOHN_BOGLE_VOICE_ID,
    'generic-advisor': process.env.GENERIC_ADVISOR_VOICE_ID,
  };

  const envOverride = envOverrides[normalized];
  if (envOverride && !RETIRED_CLONE_VOICE_IDS.has(envOverride)) {
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

    // Financial Legends: fictional characters; no real person's name maps to a voice.
    // Nate Holloway aliases (id joel-dickson)
    'joel-dickson': VOICE_IDS.JOEL_DICKSON,
    nate: VOICE_IDS.JOEL_DICKSON,
    holloway: VOICE_IDS.JOEL_DICKSON,
    'nate-holloway': VOICE_IDS.JOEL_DICKSON,
    'life-mentor': VOICE_IDS.JOEL_DICKSON,

    // Tom Brannigan aliases (id peter-lynch)
    'peter-lynch': VOICE_IDS.PETER_LYNCH,
    tom: VOICE_IDS.PETER_LYNCH,
    brannigan: VOICE_IDS.PETER_LYNCH,
    'tom-brannigan': VOICE_IDS.PETER_LYNCH,
    'stock-picker': VOICE_IDS.PETER_LYNCH,

    // Henry Caldwell aliases (id john-bogle)
    'john-bogle': VOICE_IDS.JOHN_BOGLE,
    henry: VOICE_IDS.JOHN_BOGLE,
    caldwell: VOICE_IDS.JOHN_BOGLE,
    'henry-caldwell': VOICE_IDS.JOHN_BOGLE,
    'index-investing': VOICE_IDS.JOHN_BOGLE,
    'index-pioneer': VOICE_IDS.JOHN_BOGLE,

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
    return getVoiceIdForPersona('ferni');
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
    'peter-lynch',
    'john-bogle',
  ];

  for (const persona of personas) {
    const voiceId = getVoiceIdForPersona(persona);
    const isValid = isValidVoiceId(voiceId);
    const status = isValid ? 'valid' : 'INVALID';
    log.info({ persona, voiceId, status }, `${persona}: ${status}`);
  }
}
