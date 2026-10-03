import { describe, expect, it } from 'vitest';

import { PAUSE_RANGES, pauseDuration, planPauses, renderPauses } from '../pauses.js';
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

describe('renderPauses', () => {
  it('turns a lead-in to the point into a trailing pause', () => {
    expect(renderPauses("Here's the thing, you did the right thing.")).toEqual({
      text: "Here's the thing... you did the right thing.",
      inserted: 1,
    });
  });

  it('adds the comma after an opening discourse marker', () => {
    expect(renderPauses('Well I think that works. Honestly it does.').text).toBe(
      'Well, I think that works. Honestly, it does.'
    );
    expect(renderPauses('Well water is safe.').text).toBe('Well water is safe.');
  });

  it('breathes before a contrast in a long unpunctuated run only', () => {
    expect(
      renderPauses('I know you wanted to go to the party with all of them but you stayed home.')
        .text
    ).toBe('I know you wanted to go to the party with all of them, but you stayed home.');
    expect(renderPauses('Small but mighty.').text).toBe('Small but mighty.');
    expect(
      renderPauses('There was nothing left in the house to do that evening but sleep.').text
    ).toBe('There was nothing left in the house to do that evening but sleep.');
  });

  it('only ever writes punctuation, never a native break', () => {
    const out = renderPauses(
      "Well I tried. Here's the thing, it worked but not the way I thought it would at all."
    );
    expect(out.text).not.toMatch(/<break/);
    expect(out.text.replace(/[,.]|\.\.\./g, '')).toBe(
      "Well I tried Here's the thing it worked but not the way I thought it would at all"
    );
  });
});
