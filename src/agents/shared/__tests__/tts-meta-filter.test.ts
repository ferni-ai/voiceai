import { describe, expect, it } from 'vitest';
import { isMetaInstructionChunk } from '../tts-meta-filter.js';

describe('isMetaInstructionChunk', () => {
  // Prod 2026-10-12/13: the model streamed "Hello", " ", "there" and the lone space was
  // stripped, so TTS read "Hellothere".
  it('lets a chunk that is only whitespace through, so words keep their spaces', () => {
    const chunks = ['Hello', ' ', 'there', '\n', 'friend.'];
    expect(chunks.filter((c) => !isMetaInstructionChunk(c)).join('')).toBe('Hello there\nfriend.');
  });

  it('still strips the silence cue and stage directions', () => {
    for (const leak of [
      'Speaking now:',
      'Speaking now',
      '[Ferni plays music]',
      '*searches weather*',
    ]) {
      expect(isMetaInstructionChunk(leak)).toBe(true);
    }
  });

  it('keeps ordinary speech, including words in brackets mid-sentence', () => {
    for (const ok of [
      'Sure, I can do that.',
      'It was [mostly] fine.',
      'Speaking of dogs, how is Biscuit?',
    ]) {
      expect(isMetaInstructionChunk(ok)).toBe(false);
    }
  });
});
