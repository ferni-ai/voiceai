import { describe, expect, it } from 'vitest';
import { arbitrateCues, judgeCues, type Cue } from '../cue-arbiter.js';

const cue = (kind: Cue['kind'], text: string, extra: Partial<Cue> = {}): Cue => ({
  kind,
  text,
  ...extra,
});

describe('arbitrateCues', () => {
  it('orders the notes by what matters most', () => {
    const out = arbitrateCues([
      cue('name', 'N'),
      cue('humor', 'H'),
      cue('yielding', 'Y'),
      cue('talk', 'T'),
    ]);
    expect(out).toEqual(['Y', 'T', 'H', 'N']);
  });

  it('drops playfulness on a heavy day or when they sound worn out', () => {
    const out = arbitrateCues([
      cue('day', 'Today is the anniversary of losing their dad.', { heavy: true }),
      cue('humor', 'Playfulness welcome.', { light: true }),
      cue('laugh', 'Laugh along.', { light: true }),
    ]);
    expect(out).toEqual(['Today is the anniversary of losing their dad.']);
    expect(arbitrateCues([cue('humor', 'P', { light: true })], undefined, true)).toEqual([]);
  });

  it('keeps light notes when nothing heavy is present', () => {
    expect(arbitrateCues([cue('humor', 'P', { light: true })])).toEqual(['P']);
  });

  it('cuts the least important notes past the budget, but always keeps one', () => {
    const out = arbitrateCues([cue('name', 'x'.repeat(50)), cue('repair', 'y'.repeat(80))], 100);
    expect(out).toEqual(['y'.repeat(80)]);
    expect(arbitrateCues([cue('talk', 'z'.repeat(500))], 100)).toHaveLength(1);
  });
});

describe('judgeCues', () => {
  it('reports what was left out and why', () => {
    const { dropped, heavy } = judgeCues(
      [
        cue('day', 'Loss today.', { heavy: true }),
        cue('humor', 'Playful.', { light: true }),
        cue('name', 'x'.repeat(200)),
      ],
      100
    );
    expect(heavy).toBe(true);
    expect(dropped).toEqual([
      { kind: 'humor', reason: 'heavy_moment' },
      { kind: 'name', reason: 'budget' },
    ]);
  });
});
