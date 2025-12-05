/**
 * Cartesia SSML Tag Helpers
 *
 * Utility functions for generating valid Cartesia Sonic-3 SSML tags.
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 */

/**
 * Clamp speed to Cartesia's valid range (0.6-1.5)
 */
export function clampSpeed(speed: number): number {
  return Math.max(0.6, Math.min(1.5, speed));
}

/**
 * Clamp volume to Cartesia's valid range (0.5-2.0)
 */
export function clampVolume(volume: number): number {
  return Math.max(0.5, Math.min(2.0, volume));
}

/**
 * Generate SSML break tag with time
 * @param time - Time in ms or s (e.g., "500ms" or "1s")
 */
export function breakTag(time: string): string {
  return `<break time="${time}"/>`;
}

/**
 * Generate safe SSML speed tag with clamped value
 */
export function speedTag(ratio: number): string {
  return `<speed ratio="${clampSpeed(ratio).toFixed(2)}"/>`;
}

/**
 * Generate safe SSML volume tag with clamped value
 */
export function volumeTag(ratio: number): string {
  return `<volume ratio="${clampVolume(ratio).toFixed(2)}"/>`;
}

/**
 * Generate SSML emotion tag
 */
export function emotionTag(emotion: string): string {
  return `<emotion value="${emotion}"/>`;
}

/**
 * Generate SSML spell tag for letter-by-letter pronunciation
 */
export function spellTag(text: string): string {
  return `<spell>${text}</spell>`;
}

/**
 * Cartesia Sonic-3 supported emotions
 */
export const CARTESIA_EMOTIONS = [
  'neutral',
  'angry',
  'excited',
  'content',
  'sad',
  'scared',
  'happy',
  'surprised',
  'curious',
  'affectionate',
  'nostalgic',
  'contemplative',
  'grateful',
  'proud',
  'sympathetic',
  'skeptical',
] as const;

export type CartesiaEmotion = (typeof CARTESIA_EMOTIONS)[number];
