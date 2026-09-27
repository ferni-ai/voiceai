/**
 * The gateway TTS path cuts the streamed reply into chunks and synthesizes each
 * one. Cuts landed inside Cartesia markup: '<speed ratio="0.92"/>' was split at
 * its inner space, the tag regex no longer matched either half, and the caller
 * heard "ratio equals 0.92 slash" (live call, 2026-09-27).
 */
import { describe, expect, it } from 'vitest';
import { findChunkEnd } from '../chunk-boundary.js';

/** Drive the gateway's loop: stream tokens in, cut whenever findChunkEnd allows. */
function chunk(reply: string, tokenSize: number): string[] {
  const out: string[] = [];
  let buffer = '';
  let first = true;
  for (let i = 0; i < reply.length; i += tokenSize) {
    buffer += reply.slice(i, i + tokenSize);
    const end = findChunkEnd(buffer, first ? 20 : 15);
    if (end !== null) {
      out.push(buffer.slice(0, end));
      buffer = buffer.slice(end);
      first = false;
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

const hasSplitMarkup = (c: string) =>
  c.lastIndexOf('<') > c.lastIndexOf('>') ||
  c.indexOf('>') < c.indexOf('<') ||
  c.lastIndexOf('[') > c.lastIndexOf(']');

describe('gateway chunk boundaries', () => {
  const reply =
    'So I was thinking about what you said earlier about your weekend plans <speed ratio="0.92"/>and honestly, a golden retriever named Biscuit sounds perfect<break time="150ms"/> for a house like yours <emotion value="happy"/>how is he settling in [laughter] so far';

  it.each([1, 3, 5, 7, 13])('never cuts inside a tag (token size %i)', (size) => {
    const chunks = chunk(reply, size);
    expect(chunks.join('')).toBe(reply);
    expect(chunks.filter(hasSplitMarkup)).toEqual([]);
  });

  it('still cuts long untagged text at a word boundary', () => {
    const plain = 'word '.repeat(40);
    expect(findChunkEnd(plain, 15)).toBeGreaterThan(0);
    expect(plain.slice(0, findChunkEnd(plain, 15)!)).toMatch(/ $/);
  });

  it('does not cut a price at its decimal point while it streams', () => {
    expect(findChunkEnd('That will cost about 3.', 15)).toBeNull();
    expect(findChunkEnd('That will cost about 3.50 today. And', 15)).toBe(
      'That will cost about 3.50 today. '.length
    );
  });
});
