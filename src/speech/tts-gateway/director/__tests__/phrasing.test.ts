import { describe, expect, it } from 'vitest';

import { endsSentence, lastPhraseBoundary, PhraseAssembler } from '../phrasing.js';

describe('endsSentence', () => {
  it('accepts real sentence ends', () => {
    expect(endsSentence('I hear you.')).toBe(true);
    expect(endsSentence('Really?  ')).toBe(true);
    expect(endsSentence('Well...')).toBe(true);
    expect(endsSentence('She said "go."')).toBe(true);
  });

  it('rejects mid-sentence cuts and abbreviations', () => {
    expect(endsSentence('and honestly that is a lot of')).toBe(false);
    expect(endsSentence('I talked to Mrs.')).toBe(false);
    expect(endsSentence('It was 3.')).toBe(false);
  });
});

describe('lastPhraseBoundary', () => {
  it('prefers the last punctuation boundary', () => {
    const text = 'The bill was really big, and honestly that is a lot of';
    const cut = lastPhraseBoundary(text)!;
    expect(text.slice(0, cut).trim()).toBe('The bill was really big,');
  });

  it('falls back to before a conjunction', () => {
    const text = 'You have been carrying this for weeks and trying to keep it together for';
    const cut = lastPhraseBoundary(text)!;
    expect(text.slice(cut).trim()).toBe('and trying to keep it together for');
  });

  it('never leaves a phrase too short to stand alone', () => {
    expect(lastPhraseBoundary('Oh, and the')).toBeNull();
  });

  it('never cuts inside a number or bracket markup', () => {
    expect(lastPhraseBoundary('It came to 4,200 dollars for all of the')).toBeNull();
    expect(lastPhraseBoundary('[laughter, then more] that was something else for')).toBeNull();
    expect(lastPhraseBoundary('<emotion value="a, b" that was something else for')).toBeNull();
  });
});

describe('PhraseAssembler', () => {
  it('passes sentence-ended pieces through unchanged', () => {
    const a = new PhraseAssembler();
    expect(a.accept('Oh, I hear you.', true)).toEqual(['Oh, I hear you.']);
    expect(a.accept('That sounds hard.', false)).toEqual(['That sounds hard.']);
    expect(a.flush()).toEqual([]);
  });

  it('re-cuts a fallback piece at its last phrase boundary and holds the tail', () => {
    const a = new PhraseAssembler();
    const head = a.accept(
      'Mrs. Johnson said the bill was due on October third, and honestly that is a lot of',
      false
    );
    expect(head).toEqual(['Mrs. Johnson said the bill was due on October third,']);
    expect(a.accept('money to find in one month.', false)).toEqual([
      'and honestly that is a lot of money to find in one month.',
    ]);
  });

  it('holds a boundary-less fragment mid-reply but never the first piece', () => {
    const later = new PhraseAssembler();
    expect(later.accept('so much of what you are carrying right now is', false)).toEqual([]);
    expect(later.accept('not yours to carry.', false)).toEqual([
      'so much of what you are carrying right now is not yours to carry.',
    ]);

    const first = new PhraseAssembler();
    expect(first.accept('so much of what you are carrying right now is', true)).toEqual([
      'so much of what you are carrying right now is',
    ]);
  });

  it('never holds a first piece that ends in "..." (time to first audio)', () => {
    // Review M3: the typical latency-masking opener was held until the next piece.
    const a = new PhraseAssembler();
    expect(a.accept('Hmm...', true)).toEqual(['Hmm...']);
    expect(a.holding).toBe(false);
    // Later pieces still wait to see whether the sentence goes on.
    expect(a.accept("that's just...", false)).toEqual([]);
    expect(a.holding).toBe(true);
    expect(a.accept('huge news.', false)).toEqual(["that's just... huge news."]);
  });

  it('can put back what it held when the caller fails mid-push', () => {
    const a = new PhraseAssembler();
    a.accept('so much of what you are carrying right now is', false);
    const before = a.snapshot();
    a.accept('not yours to carry.', false);
    expect(a.holding).toBe(false);
    a.restore(before);
    expect(a.flush()).toEqual(['so much of what you are carrying right now is']);
  });

  it('stops holding once the fragment gets long', () => {
    const a = new PhraseAssembler();
    const long = 'word '.repeat(50).trim();
    expect(a.accept(long, false)).toEqual([long]);
  });

  it('flushes whatever is held at the end, conserving every word', () => {
    const a = new PhraseAssembler();
    const pieces = [
      'You have been carrying this for weeks, and trying to keep it together for',
      'everyone else',
    ];
    const out = [...a.accept(pieces[0], true), ...a.accept(pieces[1], false), ...a.flush()];
    expect(out.join(' ').split(/\s+/)).toEqual(pieces.join(' ').split(/\s+/));
  });
});

describe('phrasing never cuts inside a <spell> element', () => {
  it('finds no boundary inside the spelled text', () => {
    const text = 'Your reference number is going to be <spell>AB, CD, EF</spell> and';
    const cut = lastPhraseBoundary(text);
    if (cut !== null) {
      const head = text.slice(0, cut);
      expect(head.lastIndexOf('<spell>') <= head.lastIndexOf('</spell>')).toBe(true);
    }
  });
});
