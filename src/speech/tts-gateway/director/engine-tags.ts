/**
 * Reading and composing the inline prosody tags on a TTS push (split out of
 * engine.ts, which is over its size limit): the leading speed/volume/emotion
 * tags, and the Director's reply speed and volume applied on top of them.
 *
 * @module speech/tts-gateway/director/engine-tags
 */

import type { SSMLProsodyConfig } from '../types.js';

/** Leading inline tags continuation-tts puts on a push. */
const LEAD_TAGS = /^((?:\s*<(?:speed|volume|emotion)\b[^>]*\/>)*)([\s\S]*)$/;
export const SPEED_TAG = /<speed\s+ratio="([\d.]+)"\s*\/>/;
export const VOLUME_TAG = /<volume\s+ratio="([\d.]+)"\s*\/>/;
const EMOTION_TAG = /<emotion\s+value="([a-z_]+)"\s*\/>/;
/** Any emotion tag, anywhere in a push: stripped after the opening when emotion is live. */
export const ANY_EMOTION_TAG = /<\/?emotion\b[^>]*>/gi;
/**
 * The tags a PVC ignores, stripped from each push for one. <volume> stays: a
 * PVC honors it (voice-capabilities.ts), and it is how a reply restarts
 * softly after the caller interrupts.
 */
export const PROSODY_TAG = /<\/?(?:speed|emotion)\b[^>]*>/gi;
const VOLUME_TAGS = /<volume\s+ratio="[\d.]+"\s*\/>/g;

/** Only the volume tags of a run of leading tags. */
export function volumeOnly(tags: string): string {
  return (tags.match(VOLUME_TAGS) ?? []).join('');
}
/** Cartesia's accepted speed range (providers/cartesia.ts prosodyTags). */
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.5;

export function parseLead(push: string): {
  tags: string;
  body: string;
  prosody: SSMLProsodyConfig;
} {
  const [, tags = '', body = ''] = LEAD_TAGS.exec(push) ?? [];
  const prosody: SSMLProsodyConfig = {};
  const speed = SPEED_TAG.exec(tags);
  const volume = VOLUME_TAG.exec(tags);
  const emotion = EMOTION_TAG.exec(tags);
  if (speed) prosody.speed = Number(speed[1]);
  if (volume) prosody.volume = Number(volume[1]);
  if (emotion) prosody.emotion = emotion[1];
  return { tags, body: body.trim(), prosody };
}

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/**
 * The Director's reply speed applied ON TOP of whatever speed the push already
 * asks for (a soft start, or per-sentence pace matching from continuation-tts):
 * multiplied, never substituted, inside Cartesia's range.
 */
export function composeSpeed(incoming: number, reply: number): number {
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, incoming * reply));
  return Math.round(ratio * 100) / 100;
}

/** An incoming volume (a soft start) scaled by the reply's attuned one, inside Cartesia's 0.5-2. */
export function composeVolume(incoming: number, reply: number): number {
  return Math.round(Math.min(2, Math.max(0.5, incoming * reply)) * 100) / 100;
}
