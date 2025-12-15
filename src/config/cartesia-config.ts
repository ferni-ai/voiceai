/**
 * Cartesia TTS Configuration
 *
 * This module re-exports configuration from the unified TTS module
 * and adds additional utilities for non-TTS contexts.
 *
 * For TTS creation, use `import { ... } from '../speech/tts/index.js'` directly.
 *
 * @module @ferni/config/cartesia
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'CartesiaConfig' });

// ============================================================================
// RE-EXPORTS FROM TTS CORE
// ============================================================================

export {
  CARTESIA_MODEL,
  DEFAULT_VOICE_IDS,
  getVoiceIdForPersona,
} from '../speech/tts/cartesia-core.js';

// Import for local use
import { CARTESIA_MODEL, DEFAULT_VOICE_IDS } from '../speech/tts/cartesia-core.js';

// ============================================================================
// VOICE_IDS ALIAS (backwards compatibility)
// ============================================================================

/**
 * Voice IDs loaded from environment variables with fallbacks.
 * @deprecated Use DEFAULT_VOICE_IDS from '../speech/tts/cartesia-core.js'
 */
export const VOICE_IDS = DEFAULT_VOICE_IDS;

// ============================================================================
// ADDITIONAL UTILITIES
// ============================================================================

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
    voiceId: DEFAULT_VOICE_IDS.FERNI,
    model: CARTESIA_MODEL,
    provider: 'cartesia',
  };
}

/**
 * Log voice configuration for debugging.
 */
export function logVoiceConfiguration(): void {
  log.info(
    {
      model: CARTESIA_MODEL,
      voices: {
        ferni: DEFAULT_VOICE_IDS.FERNI,
        peterJohn: DEFAULT_VOICE_IDS.PETER_JOHN,
        alexChen: DEFAULT_VOICE_IDS.ALEX_CHEN,
        mayaSantos: DEFAULT_VOICE_IDS.MAYA_SANTOS,
        jordanTaylor: DEFAULT_VOICE_IDS.JORDAN_TAYLOR,
        nayanPatel: DEFAULT_VOICE_IDS.NAYAN_PATEL,
        generic: DEFAULT_VOICE_IDS.GENERIC,
      },
    },
    '🎙️ Cartesia TTS Configuration'
  );
}
