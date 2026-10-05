/**
 * Whether a mid-reply emotion change starts a new Cartesia context.
 *
 * A new context resets intonation, so it is worth it only for a voice that
 * renders the emotion. A Pro clone ignores <emotion> (config/voice-capabilities.ts),
 * so on Ferni's voice the reset was the only audible effect: a seam mid-reply
 * for nothing. The director owns the change when its emotion lever is live (#176).
 *
 * @module speech/tts-gateway/emotion-context
 */

import { voiceHonorsProsodyTags } from '../../config/voice-capabilities.js';
import { leverModes } from './director/gate.js';

export function opensContextOnEmotionChange(
  voiceId: string,
  emotionLever: string = leverModes().emotion
): boolean {
  return emotionLever !== 'live' && voiceHonorsProsodyTags(voiceId);
}

/** `open` when an emotion change should start a new context, else undefined. */
export function emotionContextOpener<T>(voiceId: string, open: () => T): (() => T) | undefined {
  return opensContextOnEmotionChange(voiceId) ? open : undefined;
}
