/**
 * Delete a voice we cloned from our Cartesia account (DELETE /voices/{id}).
 *
 * Replaces voice-clone-service's stub, which returned true without calling
 * Cartesia, so a deleted agent's clone stayed in the account. A 404 counts as
 * deleted (already gone). Never throws: the agent is deleted either way, and a
 * failure is logged with the voice id so the clone can be removed by hand.
 *
 * @module services/custom-agent/cartesia-voice-delete
 */

import { CARTESIA_API_VERSION, isValidVoiceId } from '../../config/voice-ids.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CartesiaVoiceDelete' });

const CARTESIA_BASE_URL = 'https://api.cartesia.ai';

export type CartesiaVoiceDeleteResult = 'deleted' | 'already_gone' | 'skipped' | 'failed';

export interface CartesiaVoiceDeleteDeps {
  apiKey?: string;
  fetch?: typeof fetch;
}

export async function deleteCartesiaVoice(
  voiceId: string,
  deps: CartesiaVoiceDeleteDeps = {}
): Promise<CartesiaVoiceDeleteResult> {
  const apiKey = deps.apiKey ?? process.env.CARTESIA_API_KEY;
  if (!isValidVoiceId(voiceId)) return 'skipped';
  if (!apiKey) {
    log.warn({ voiceId }, 'Cartesia voice not deleted: CARTESIA_API_KEY is not set');
    return 'failed';
  }
  try {
    const response = await (deps.fetch ?? fetch)(
      `${CARTESIA_BASE_URL}/voices/${encodeURIComponent(voiceId)}`,
      {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey, 'Cartesia-Version': CARTESIA_API_VERSION },
      }
    );
    if (response.ok) return 'deleted';
    if (response.status === 404) return 'already_gone';
    log.error({ voiceId, status: response.status }, 'Cartesia voice delete failed');
    return 'failed';
  } catch (error) {
    log.error({ voiceId, error: String(error) }, 'Cartesia voice delete failed');
    return 'failed';
  }
}
