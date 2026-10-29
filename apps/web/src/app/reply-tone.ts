/**
 * Ferni's face matches Ferni's voice (avatar audit item 8).
 *
 * The agent decides one emotion per reply for the voice and, with
 * AVATAR_REPLY_TONE=on, sends it as `reply_tone { emotion, speed }` when the
 * reply starts (src/speech/tts-gateway/reply-tone-signal.ts). Here that tone
 * sets the lid expression Ferni rests in for the reply, and the reply's speed
 * sets the breathing rate: a slower, softer reply breathes slower.
 *
 * Off by default: the replyTone switch in config/motion-flags.ts.
 */

import type { DataMessage } from '../types/events.js';
import { ferniExpressions, type EmotionalExpression } from '../ui/ferni-expressions.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { isMotionFlagOn } from '../config/motion-flags.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ReplyTone');

export const REPLY_TONE_MESSAGE = 'reply_tone';

/** The voice's emotions (src/speech/tts-gateway/director/emotion.ts) as resting faces. */
export const REPLY_TONE_EXPRESSIONS: Readonly<Record<string, EmotionalExpression>> = {
  calm: 'present',
  content: 'warm',
  curious: 'curious',
  affectionate: 'pleased',
  sympathetic: 'empathetic',
  contemplative: 'contemplative',
};

/** Ferni's resting breath at normal speaking speed, breaths per minute. */
export const BASE_BREATHS_PER_MINUTE = 15;
/** Speeds this close to 1 keep the default breathing. */
const SPEED_DEADBAND = 0.05;

let breathAdjusted = false;
/** The face the last reply tone set, so a reply with no emotion can clear it. */
let restingFace: EmotionalExpression | null = null;

export function isReplyToneEnabled(): boolean {
  return isMotionFlagOn('replyTone');
}

/** Breaths per minute for a reply spoken at `speed`, or null for the default. */
export function breathRateForSpeed(speed: number): number | null {
  if (!Number.isFinite(speed) || Math.abs(speed - 1) < SPEED_DEADBAND) return null;
  return Math.round(BASE_BREATHS_PER_MINUTE * Math.min(1.5, Math.max(0.6, speed)) * 10) / 10;
}

function applySpeed(speed: number): void {
  const rate = breathRateForSpeed(speed);
  if (rate === null) {
    if (breathAdjusted) presenceUI.resetBreathSync();
    breathAdjusted = false;
    return;
  }
  // presence.ui listens for this event and restarts breathing at the new rate.
  document.dispatchEvent(new CustomEvent('ferni:breath-sync', { detail: { rate } }));
  breathAdjusted = true;
}

/** Puts a resting face on Ferni; the expression arbiter passes its own gate. */
export type SetRestingFace = (expression: EmotionalExpression) => void;

/**
 * Handle a `reply_tone` message. Returns true when the message was one (it is
 * consumed even with the flag off, so it never reaches the other handlers).
 */
export function handleReplyTone(
  message: DataMessage,
  setFace: SetRestingFace = (expression) => ferniExpressions.setExpression(expression)
): boolean {
  if (message.type !== REPLY_TONE_MESSAGE) return false;
  if (!isReplyToneEnabled()) return true;
  const { emotion, speed } = message;
  const expression = typeof emotion === 'string' ? REPLY_TONE_EXPRESSIONS[emotion] : undefined;
  if (expression) {
    setFace(expression);
    restingFace = expression;
  } else if (restingFace && ferniExpressions.getExpression() === restingFace) {
    // The voice takes its tone from the words: drop the last reply's face.
    setFace('neutral');
    restingFace = null;
  }
  if (typeof speed === 'number') applySpeed(speed);
  log.debug('Reply tone applied', { emotion, speed, expression });
  return true;
}

/** Forget what the last reply set (tests). */
export function resetReplyTone(): void {
  breathAdjusted = false;
  restingFace = null;
}
