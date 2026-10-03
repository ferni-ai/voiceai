/**
 * Native Sonic breaks kept through SSML parsing.
 *
 * A deliberate pause stays a native Sonic break: as punctuation a 1 s break
 * became ". ", a 270 ms gap, against 1.3 s for the tag (measured on Ferni's
 * voice, sonic-3.6, 2026-09-29). Cartesia notes a break splits the
 * generation, so only real pauses keep it.
 *
 * A kept break is held as a placeholder between the break conversion and the
 * parser's catch-all tag strip, then restored as a tag.
 *
 * @module speech/tts-gateway/ssml/native-breaks
 */

const BREAK_HOLD = '⦃BREAK';
const BREAK_HOLD_END = '⦄';
const BREAK_HOLD_REGEX = /⦃BREAK(\d+)⦄/g;

/** Placeholder for a kept break, capped at 3 s. */
export function holdBreak(durationMs: number): string {
  return `${BREAK_HOLD}${Math.min(durationMs, 3000)}${BREAK_HOLD_END}`;
}

/** Turn held placeholders back into native break tags. */
export function restoreHeldBreaks(text: string): string {
  return text.replace(BREAK_HOLD_REGEX, (_m, ms: string) => `<break time="${ms}ms"/>`);
}

/** Text as spoken: without the native break tags Sonic consumes. */
export function speakableText(text: string): string {
  return text.replace(/<break time="\d+ms"\/>/g, '');
}

/** Only pauses and punctuation left: nothing to say. */
export function isUnspeakable(text: string): boolean {
  return !speakableText(text).replace(/[\s.,!?…-]/g, '');
}
