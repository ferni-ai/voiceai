/**
 * How a reply should sound, decided once per reply.
 *
 * Two sources, in order: the reply's own opening tag (the LLM heard the
 * words), then the caller's voice this turn (adaptive delivery, empathic
 * rather than mirrored). Only calm-adjacent emotions reach the voice: big
 * ones widened the cloned voice's pitch range from 8.7 to 10.9 semitones and
 * swung it between turns. Pace stays within a range a listener feels but
 * does not notice.
 *
 * @module speech/expression/vocal-direction
 */

import type { DeliveryStyle } from '../tts/delivery-style.js';
import type { SSMLProsodyConfig } from '../tts-gateway/types.js';

import { NEUTRAL_DIRECTION, type VocalDirection } from './types.js';

export const CALM_EMOTIONS: ReadonlySet<string> = new Set([
  'calm',
  'content',
  'curious',
  'affectionate',
  'sympathetic',
  'contemplative',
]);

/** A bright caller gets warmth and a little lift, not a louder, wider voice. */
const BRIGHT_EMOTIONS = new Set(['happy', 'excited', 'enthusiastic', 'joyful']);

const SPEED_RANGE = [0.88, 1.08] as const;
const VOLUME_RANGE = [0.85, 1.1] as const;

const clamp = (value: number, [min, max]: readonly [number, number]): number =>
  Math.min(max, Math.max(min, value));

/** The emotion if the cloned voice carries it well, else undefined. */
export function calmEmotion(emotion: string | undefined): string | undefined {
  return emotion && CALM_EMOTIONS.has(emotion) ? emotion : undefined;
}

/** Direction for a reply, from this turn's adaptive delivery style (null = default voice). */
export function directVoice(style: DeliveryStyle | null | undefined): VocalDirection {
  if (!style) return NEUTRAL_DIRECTION;
  const emotion = BRIGHT_EMOTIONS.has(style.emotion) ? 'content' : calmEmotion(style.emotion);
  return { emotion, speed: clamp(style.speed, SPEED_RANGE), volume: 1 };
}

/**
 * The reply's opening prosody: what the reply asked for wins, the direction
 * fills the rest. An emotion outside the calm set is dropped, and the voice
 * takes its tone from the words.
 */
export function openingProsody(
  direction: VocalDirection,
  reply: SSMLProsodyConfig
): SSMLProsodyConfig {
  return {
    ...reply,
    emotion: calmEmotion(reply.emotion) ?? direction.emotion,
    speed: reply.speed ?? (direction.speed !== 1 ? direction.speed : undefined),
    volume:
      reply.volume ?? (direction.volume !== 1 ? clamp(direction.volume, VOLUME_RANGE) : undefined),
  };
}
