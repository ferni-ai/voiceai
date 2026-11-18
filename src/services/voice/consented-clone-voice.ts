/**
 * Whether a voice id is a consented clone (personas/roster): a real person's
 * cloned voice that only its own listing may speak in. Such a voice is never
 * localized, because POST /voices/localize creates a new voice derived from it
 * that no voice policy knows about, and its id is never handed to a client.
 *
 * @module services/voice/consented-clone-voice
 */

import { configuredLegendVoiceIds } from '../../personas/roster/index.js';

/** True when `voiceId` (trimmed, any case) is a configured consented clone. */
export function isConsentedCloneVoice(voiceId: string | undefined): boolean {
  const id = voiceId?.trim().toLowerCase();
  return Boolean(id) && configuredLegendVoiceIds().some((clone) => clone.toLowerCase() === id);
}
