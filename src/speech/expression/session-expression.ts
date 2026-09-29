/**
 * Session adapter: reads the expression signals the live call already
 * records on userData, and remembers the cues it gives.
 *
 * userData fields:
 * - deliveryStyle: this turn's adaptive delivery (final-transcript observer)
 * - detectedLaughter / detectedLaughterAt: the caller's last laugh (audio processor)
 * - laughCue: the last laugh-along cue given (written here)
 *
 * @module speech/expression/session-expression
 */

import type { DeliveryStyle } from '../tts/delivery-style.js';

import { laughCue, type LaughCueRecord } from './laughter-reciprocity.js';
import type { UserLaugh, VocalDirection, VoiceCapabilities } from './types.js';
import { directVoice } from './vocal-direction.js';

type SessionData = Record<string, unknown>;

interface RecordedLaugh {
  isLaughing?: boolean;
  confidence?: number;
  suggestedResponse?: UserLaugh['suggestedResponse'];
}

/** The caller's last laugh, if the audio processor heard one and stamped it. */
export function readUserLaugh(userData: SessionData | undefined): UserLaugh | undefined {
  const laugh = userData?.detectedLaughter as RecordedLaugh | undefined;
  const at = userData?.detectedLaughterAt;
  if (!laugh?.isLaughing || typeof at !== 'number') return undefined;
  return {
    at,
    confidence: laugh.confidence ?? 0,
    suggestedResponse: laugh.suggestedResponse ?? 'smile',
  };
}

/** Direction for the reply about to be voiced. */
export function sessionVocalDirection(userData: SessionData | undefined): VocalDirection {
  return directVoice(userData?.deliveryStyle as DeliveryStyle | null | undefined);
}

/** Expression cues for the reply about to be generated; records what it gives. */
export function nextReplyCues(
  userData: SessionData | undefined,
  voice: VoiceCapabilities,
  now: number = Date.now()
): string[] {
  if (!userData) return [];
  const laugh = readUserLaugh(userData);
  const cue = laughCue({
    laugh,
    lastCue: userData.laughCue as LaughCueRecord | undefined,
    voice,
    now,
  });
  if (!cue || !laugh) return [];
  const prior = userData.laughCue as LaughCueRecord | undefined;
  const record: LaughCueRecord = {
    laughAt: laugh.at,
    at: prior?.laughAt === laugh.at ? prior.at : now,
  };
  userData.laughCue = record;
  return [cue];
}
