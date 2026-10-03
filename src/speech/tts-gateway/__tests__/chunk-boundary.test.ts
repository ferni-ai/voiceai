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

  it('keeps an ordinary long sentence whole until it ends', () => {
    // Cut at 80 characters, sentences like this reached Cartesia in two halves.
    const partial =
      'Sometimes it helps to just pick one tiny, almost ridiculously easy thing first to get';
    expect(partial.length).toBeGreaterThan(80);
    expect(findChunkEnd(partial, 15)).toBeNull();
    expect(findChunkEnd(`${partial} some momentum. And`, 15)).toBe(
      `${partial} some momentum. `.length
    );
  });

  it('still cuts runaway unpunctuated text at a word boundary', () => {
    const plain = 'word '.repeat(60);
    expect(findChunkEnd(plain, 15)).toBeGreaterThan(0);
    expect(plain.slice(0, findChunkEnd(plain, 15)!)).toMatch(/ $/);
  });

  it('does not cut a price at its decimal point while it streams', () => {
    expect(findChunkEnd('That will cost about 3.', 15)).toBeNull();
    expect(findChunkEnd('That will cost about 3.50 today. And', 15)).toBe(
      'That will cost about 3.50 today. '.length
    );
  });

  // The abbreviation guard (SENTENCE_END's old fixed-width lookbehind only
  // covered 1-2 letter prefixes like "Dr." and "U.S.") had no way to catch
  // "Mrs.", "etc." or "vs." — their period is preceded by two lowercase
  // letters, exactly like any real sentence end.
  it('does not cut after a title abbreviation', () => {
    const text = 'Mrs. Johnson called early. She wanted to talk.';
    const end = findChunkEnd(text, 5);
    expect(end).not.toBe('Mrs. '.length);
    expect(text.slice(0, end!)).toBe('Mrs. Johnson called early. ');
  });

  it('does not cut after "etc." or "vs." mid-sentence', () => {
    const text = 'Bring snacks, drinks, etc. for the trip. It should be fun.';
    const end = findChunkEnd(text, 5);
    expect(text.slice(0, end!)).toBe('Bring snacks, drinks, etc. for the trip. ');

    const vs = 'Comparing option A vs. option B is tricky. Let me explain.';
    const vsEnd = findChunkEnd(vs, 5);
    expect(vs.slice(0, vsEnd!)).toBe('Comparing option A vs. option B is tricky. ');
  });

  it('keeps buffering when the buffer ends right after an abbreviation', () => {
    // "Mrs." ends the buffer with no more text yet — nothing abbreviation-free
    // to cut on, so the gateway should keep buffering, not split mid-title.
    expect(findChunkEnd('I spoke with Mrs.', 5)).toBeNull();
  });

  it('does not cut on "a.m."/"p.m." mid-sentence (lowercase word follows)', () => {
    const text = 'The call starts at 7 p.m. sharp tonight. See you then.';
    const end = findChunkEnd(text, 5);
    expect(text.slice(0, end!)).toBe('The call starts at 7 p.m. sharp tonight. ');
  });

  // Treating every abbreviation period as permanently non-terminal (the
  // opposite bug) ran the chunk past a genuine sentence end to the 80-char
  // fallback, cutting mid-phrase instead. A TITLE ("Dr.", "Mrs.") is always
  // followed by the name it introduces, so it never splits; a GENERAL
  // abbreviation ("etc.", "p.m.") does end a sentence when a capitalized
  // word follows.
  describe('abbreviations that CAN end a sentence vs. titles that never do', () => {
    it('"Dr. Smith" stays joined even though a capital follows', () => {
      const text = "Dr. Smith is here. Let's get started.";
      const end = findChunkEnd(text, 5);
      // The only real sentence end in this buffer is after "here.", not "Dr."
      expect(text.slice(0, end!)).not.toMatch(/^Dr\. $/);
      expect(text.slice(0, end!)).toBe('Dr. Smith is here. ');
    });

    it('"p.m. Then" splits — the time abbreviation really ends the sentence', () => {
      const text = "We'll meet at 5 p.m. Then we left.";
      const end = findChunkEnd(text, 5);
      expect(text.slice(0, end!)).toBe("We'll meet at 5 p.m. ");
    });

    it('"etc. Then" splits — a general abbreviation before a capitalized word', () => {
      const text = 'We packed food, water, etc. Then we discussed the route.';
      const end = findChunkEnd(text, 5);
      expect(text.slice(0, end!)).toBe('We packed food, water, etc. ');
    });

    it('"etc. for" (lowercase follows) is not treated as a sentence end', () => {
      const text = 'Bring snacks, drinks, etc. for the trip.';
      const end = findChunkEnd(text, 5);
      // Not a regression: the only real cut is the final period, not "etc."
      expect(end).toBe(text.length);
    });
  });
});

describe('findFirstChunkEnd', () => {
  it('starts on the first clause instead of waiting for the sentence', async () => {
    const { findFirstChunkEnd } = await import('../chunk-boundary.js');
    const text = "Oh man, that's a rough one, and on a Friday too";
    const end = findFirstChunkEnd(text, 12)!;
    expect(text.slice(0, end)).toBe("Oh man, that's a rough one, ");
  });

  it('takes a short first sentence', async () => {
    const { findFirstChunkEnd } = await import('../chunk-boundary.js');
    const text = "Friday? That's, what, two days";
    expect(text.slice(0, findFirstChunkEnd(text, 12)!)).toBe('Friday? ');
  });

  it('waits when nothing is long enough yet', async () => {
    const { findFirstChunkEnd } = await import('../chunk-boundary.js');
    expect(findFirstChunkEnd('Oh, wow', 12)).toBeNull();
    expect(findFirstChunkEnd('Oh, I see what you', 12)).toBeNull();
  });

  it('never cuts inside markup', async () => {
    const { findFirstChunkEnd } = await import('../chunk-boundary.js');
    const text = '<emotion value="calm"/>Take a breath, okay? We can sort it';
    const cut = text.slice(0, findFirstChunkEnd(text, 12)!);
    expect(cut).toBe('<emotion value="calm"/>Take a breath, ');
  });

  it('does not cut at a comma inside a number', async () => {
    const { findFirstChunkEnd } = await import('../chunk-boundary.js');
    const text = 'That is about 1,200 dollars a month, give or take';
    expect(text.slice(0, findFirstChunkEnd(text, 12)!)).toBe(
      'That is about 1,200 dollars a month, '
    );
  });
});

describe('findFirstWordEnd', () => {
  it('cuts after the last complete word once enough will be spoken', async () => {
    const { findFirstWordEnd } = await import('../chunk-boundary.js');
    const text = 'Honestly I think that the keyb';
    expect(text.slice(0, findFirstWordEnd(text, 12)!)).toBe('Honestly I think that the ');
  });

  it('waits when too little would be spoken, counting spoken text only', async () => {
    const { findFirstWordEnd } = await import('../chunk-boundary.js');
    expect(findFirstWordEnd('Oh no that ', 12)).toBeNull();
    expect(findFirstWordEnd('<emotion value="sympathetic"/>Oh no that ', 12)).toBeNull();
  });

  it('never cuts inside markup', async () => {
    const { findFirstWordEnd } = await import('../chunk-boundary.js');
    const text = 'Well I guess that <speed ratio="0.9"/';
    const cut = findFirstWordEnd(text, 12)!;
    expect(text.slice(0, cut)).toBe('Well I guess that ');
  });
});
