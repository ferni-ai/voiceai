import { describe, expect, it } from 'vitest';

import {
  commaDensity,
  PAUSE_RANGES,
  pauseDuration,
  planPauses,
  removeMidSentenceEllipses,
} from '../pauses.js';
import type { PauseKind } from '../types.js';

const kinds = (text: string): string[] => planPauses(text).map((e) => String(e.params.kind));

describe('pauseDuration', () => {
  it('stays inside each human bucket and is deterministic', () => {
    for (const kind of Object.keys(PAUSE_RANGES) as PauseKind[]) {
      const [lo, hi] = PAUSE_RANGES[kind];
      for (const seed of ['a', 'b', 'hello there', 'x'.repeat(40)]) {
        const ms = pauseDuration(kind, seed);
        expect(ms).toBeGreaterThanOrEqual(lo);
        expect(ms).toBeLessThanOrEqual(hi);
        expect(pauseDuration(kind, seed)).toBe(ms);
      }
    }
  });

  it('varies with the text so pauses are not metronomic', () => {
    const values = new Set(
      ['one', 'two', 'three', 'four', 'five'].map((s) => pauseDuration('thought', s))
    );
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('planPauses', () => {
  it('classifies clause, thought and pre-reveal pauses', () => {
    expect(kinds('Oh, I hear you.')).toEqual(['clause', 'thought']);
    expect(kinds("Here's the thing... you did fine")).toEqual(['preReveal', 'clause']);
    expect(kinds('It was hard — really hard; still, you went?')).toEqual([
      'thought',
      'clause',
      'clause',
      'thought',
    ]);
    expect(kinds('And then...')).toEqual(['preReveal']);
  });

  it('anchors internal pauses by word index and the last one to the segment end', () => {
    const events = planPauses('Oh, I hear you.');
    expect(events[0].anchor).toEqual({ atWordIndex: 1 });
    expect(events[1].anchor).toEqual({ edge: 'segment-end' });
    for (const e of events) {
      expect(e.type).toBe('pause');
      expect(e.params.render).toBe('punctuation');
    }
  });
});

describe('removeMidSentenceEllipses', () => {
  const drop = (text: string): string => removeMidSentenceEllipses(text).text;

  it('takes out the ellipses measured as mid-sentence breaks on dev', () => {
    expect(drop("Oh wow, that's just... huge news.")).toBe("Oh wow, that's just huge news.");
    expect(drop('The light outside my window... reminds me of home.')).toBe(
      'The light outside my window reminds me of home.'
    );
    expect(drop('the whole thing… alive')).toBe('the whole thing alive');
  });

  it('joins "word...word" and "word ...word" with one space', () => {
    expect(drop('that is...huge')).toBe('that is huge');
    expect(drop('that is ...huge')).toBe('that is huge');
    expect(drop('...and then it rained.')).toBe('and then it rained.');
  });

  it('keeps markup between the words', () => {
    expect(drop('it was a drop... [laughter] just a drop.')).toBe(
      'it was a drop [laughter] just a drop.'
    );
  });

  it('keeps a trailing-off at the end of a sentence or turn', () => {
    expect(drop("I don't know...")).toBe("I don't know...");
    expect(drop('this morning... I went outside.')).toBe('this morning... I went outside.');
  });

  it('counts what it removed and never adds a pause or a break', () => {
    const out = removeMidSentenceEllipses("that's just... huge, and the window... reminds me");
    expect(out.removed).toBe(2);
    expect(out.text).not.toMatch(/<break|\.\.\./);
    expect(out.text.match(/,/g)).toHaveLength(1);
  });
});

describe('commaDensity', () => {
  it('counts commas and words', () => {
    expect(commaDensity('Oh, well, I mean it works.')).toEqual({ commas: 2, words: 6 });
  });
});
