/**
 * Lines the model leaks into the TTS stream that must not be spoken: the silence handler's
 * cue, bracketed or starred stage directions.
 *
 * A chunk that is only whitespace is NOT one of them: the model streams spaces as their own
 * chunks ("Hello", " ", "there"), and dropping them glued words together on the way to TTS
 * (prod 2026-10-12/13: 8 lone-space drops in 72 h, SDK speech audit G7).
 *
 * @module agents/shared/tts-meta-filter
 */

const META_INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /^Speaking now/i, // the silence handler's cue, alone or leading a chunk
  /^\[.*\]\s*$/, // bracketed stage directions: [Ferni plays music]
  /^\*.*\*\s*$/, // asterisk stage directions: *plays music*
];

/** Whether this streamed chunk is a leaked instruction to strip. Whitespace passes through. */
export function isMetaInstructionChunk(chunk: string): boolean {
  const text = chunk.trim();
  return text !== '' && META_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text));
}
