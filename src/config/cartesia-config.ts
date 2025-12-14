/**
 * Cartesia TTS Configuration - SINGLE SOURCE OF TRUTH
 *
 * ALL voice IDs and model configuration should come from here.
 * This module reads from environment variables with sensible fallbacks.
 *
 * Environment Variables:
 *   CARTESIA_MODEL - TTS model (default: sonic-3)
 *   FERNI_VOICE_ID - Ferni's voice (life coach)
 *   PETER_JOHN_VOICE_ID - Peter John's voice (research)
 *   ALEX_CHEN_VOICE_ID - Alex Chen's voice (communications)
 *   MAYA_SANTOS_VOICE_ID - Maya Santos's voice (habits)
 *   JORDAN_TAYLOR_VOICE_ID - Jordan Taylor's voice (events)
 *   NAYAN_PATEL_VOICE_ID - Nayan Patel's voice (wisdom)
 *   GENERIC_ADVISOR_VOICE_ID - Generic advisor fallback
 *
 * @module @ferni/config/cartesia
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'CartesiaConfig' });

// ============================================================================
// CARTESIA MODEL
// ============================================================================

/**
 * Cartesia TTS model to use.
 * sonic-3 is the latest model with best quality.
 */
export const CARTESIA_MODEL = process.env.CARTESIA_MODEL || 'sonic-3';

// ============================================================================
// VOICE IDS - Environment Variable Backed
// ============================================================================

/**
 * Default voice IDs - used ONLY if environment variables are not set.
 * These should match what's in the .env file.
 *
 * To find new voice IDs: https://play.cartesia.ai/library
 */
const DEFAULT_VOICE_IDS = {
  // Ferni (life coach) - warm, friendly male voice
  FERNI: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',

  // Peter John (research/insights) - energetic, curious
  PETER_JOHN: '3f04e815-3260-4f50-8fd9-af9c657be4c2',

  // Alex Chen (communications) - professional, clear
  ALEX_CHEN: '81c164d9-7baa-419d-9f9a-6b18100a01ee',

  // Maya Santos (habits/routines) - warm, encouraging
  MAYA_SANTOS: 'eef47c0d-cb49-4160-a4a0-6b97ed4c81e6',

  // Jordan Taylor (events/planning) - enthusiastic, organized
  JORDAN_TAYLOR: 'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',

  // Nayan Patel (wisdom/philosophy) - calm, thoughtful
  NAYAN_PATEL: '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3',

  // Generic advisor fallback
  GENERIC: '79a125e8-cd45-4c13-8a67-188112f4dd22',
} as const;

/**
 * Voice IDs loaded from environment variables with fallbacks.
 * Use these constants throughout the codebase.
 */
export const VOICE_IDS = {
  FERNI:
    process.env.FERNI_VOICE_ID || process.env.JACK_B_VOICE_ID || DEFAULT_VOICE_IDS.FERNI,

  PETER_JOHN:
    process.env.PETER_JOHN_VOICE_ID ||
    process.env.JACK_BOGLE_VOICE_ID ||
    DEFAULT_VOICE_IDS.PETER_JOHN,

  ALEX_CHEN:
    process.env.ALEX_CHEN_VOICE_ID ||
    process.env.COMM_SPECIALIST_VOICE_ID ||
    DEFAULT_VOICE_IDS.ALEX_CHEN,

  MAYA_SANTOS:
    process.env.MAYA_SANTOS_VOICE_ID ||
    process.env.SPEND_SAVE_VOICE_ID ||
    DEFAULT_VOICE_IDS.MAYA_SANTOS,

  JORDAN_TAYLOR:
    process.env.JORDAN_TAYLOR_VOICE_ID ||
    process.env.EVENT_PLANNER_VOICE_ID ||
    DEFAULT_VOICE_IDS.JORDAN_TAYLOR,

  NAYAN_PATEL:
    process.env.NAYAN_PATEL_VOICE_ID ||
    process.env.NAYAN_VOICE_ID ||
    process.env.PETER_LYNCH_VOICE_ID ||
    DEFAULT_VOICE_IDS.NAYAN_PATEL,

  GENERIC: process.env.GENERIC_ADVISOR_VOICE_ID || DEFAULT_VOICE_IDS.GENERIC,
} as const;

// ============================================================================
// PERSONA VOICE LOOKUP
// ============================================================================

/**
 * Map persona IDs to their voice IDs.
 * Supports canonical names, legacy names, and short aliases.
 */
const PERSONA_VOICE_MAP: Record<string, string> = {
  // Ferni / Coach
  ferni: VOICE_IDS.FERNI,
  'jack-b': VOICE_IDS.FERNI,
  coach: VOICE_IDS.FERNI,
  'life-coach': VOICE_IDS.FERNI,

  // Peter John
  'peter-john': VOICE_IDS.PETER_JOHN,
  peter: VOICE_IDS.PETER_JOHN,

  // Alex Chen
  'alex-chen': VOICE_IDS.ALEX_CHEN,
  alex: VOICE_IDS.ALEX_CHEN,
  'comm-specialist': VOICE_IDS.ALEX_CHEN,

  // Maya Santos
  'maya-santos': VOICE_IDS.MAYA_SANTOS,
  maya: VOICE_IDS.MAYA_SANTOS,
  'spend-save': VOICE_IDS.MAYA_SANTOS,

  // Jordan Taylor
  'jordan-taylor': VOICE_IDS.JORDAN_TAYLOR,
  jordan: VOICE_IDS.JORDAN_TAYLOR,
  'event-planner': VOICE_IDS.JORDAN_TAYLOR,

  // Nayan Patel
  'nayan-patel': VOICE_IDS.NAYAN_PATEL,
  nayan: VOICE_IDS.NAYAN_PATEL,
  guru: VOICE_IDS.NAYAN_PATEL,
  mystic: VOICE_IDS.NAYAN_PATEL,
  'lifetime-advisor': VOICE_IDS.NAYAN_PATEL,

  // Generic
  'generic-advisor': VOICE_IDS.GENERIC,
};

/**
 * Get the voice ID for a persona.
 * Falls back to Ferni's voice if unknown.
 *
 * @param personaId - Persona ID (supports various formats)
 * @returns Voice ID for the persona
 */
export function getVoiceIdForPersona(personaId: string): string {
  const normalized = personaId.toLowerCase();
  const voiceId = PERSONA_VOICE_MAP[normalized];

  if (!voiceId) {
    log.warn(
      { personaId, normalized },
      '⚠️ Unknown persona ID in voice lookup - falling back to Ferni voice'
    );
    return VOICE_IDS.FERNI;
  }

  return voiceId;
}

/**
 * Validate a voice ID format (UUID v4)
 */
export function isValidVoiceId(voiceId: string): boolean {
  if (!voiceId || typeof voiceId !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(voiceId);
}

/**
 * Get a default voice configuration for fallback scenarios.
 * Uses Ferni's voice as the default.
 */
export function getDefaultVoiceConfig(): { voiceId: string; model: string; provider: string } {
  return {
    voiceId: VOICE_IDS.FERNI,
    model: CARTESIA_MODEL,
    provider: 'cartesia',
  };
}

/**
 * Log voice configuration for debugging.
 */
export function logVoiceConfiguration(): void {
  log.info({
    model: CARTESIA_MODEL,
    voices: {
      ferni: VOICE_IDS.FERNI,
      peterJohn: VOICE_IDS.PETER_JOHN,
      alexChen: VOICE_IDS.ALEX_CHEN,
      mayaSantos: VOICE_IDS.MAYA_SANTOS,
      jordanTaylor: VOICE_IDS.JORDAN_TAYLOR,
      nayanPatel: VOICE_IDS.NAYAN_PATEL,
      generic: VOICE_IDS.GENERIC,
    },
  }, '🎙️ Cartesia TTS Configuration');
}

// Log on import in non-test environments
if (process.env.NODE_ENV !== 'test') {
  logVoiceConfiguration();
}
