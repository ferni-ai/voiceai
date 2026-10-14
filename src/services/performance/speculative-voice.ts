/**
 * Voice resolution for speculative TTS.
 *
 * Speculative TTS callers pass a persona id ('ferni', 'peter-john') or, from the
 * cache-aware TTS node, an already-resolved Cartesia voice UUID. The engine used
 * to tell them apart with `voiceId.includes('-')`, so every hyphenated persona id
 * ('peter-john', 'maya-santos', ...) went to Cartesia verbatim and came back
 * HTTP 400 "voice ID must be a valid UUID".
 *
 * Resolution matches the live TTS gateway (agents/shared/tts-wrapper.ts):
 * `getVoiceIdForPersona(personaId)`, env override first, then the default map.
 *
 * @module services/performance/speculative-voice
 */

import { getVoiceIdForPersona, isValidVoiceId } from '../../config/voice-ids.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SpeculativeTTS' });

/** Inputs already reported as unresolvable, so the skip is logged once each. */
const reportedUnresolvable = new Set<string>();

/**
 * Resolve a persona id or voice UUID to a Cartesia voice UUID.
 *
 * @returns the UUID, or null when none is valid (the caller should skip the
 *   request, since Cartesia rejects anything that is not a UUID)
 */
export function resolveSpeculativeVoiceId(voiceId: string): string | null {
  if (isValidVoiceId(voiceId)) return voiceId;

  const resolved = voiceId ? getVoiceIdForPersona(voiceId) : '';
  if (isValidVoiceId(resolved)) return resolved;

  if (!reportedUnresolvable.has(voiceId)) {
    reportedUnresolvable.add(voiceId);
    log.debug({ voiceId }, 'No valid Cartesia voice UUID for speculative TTS, skipping');
  }
  return null;
}
