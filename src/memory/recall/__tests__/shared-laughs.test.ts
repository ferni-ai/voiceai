import { describe, expect, it } from 'vitest';

import {
  callbackForTurn,
  captureLaugh,
  echoes,
  formatCallback,
  isRetired,
  mergeLaughs,
  fromInsideJoke,
  fromStoredLaugh,
  type SharedLaugh,
} from '../shared-laughs.js';

const laugh = (over: Partial<SharedLaugh> = {}): SharedLaugh => ({
  id: 'l1',
  moment: 'Your sourdough starter has more of a social life than I do',
  context: 'I have been baking bread every weekend',
  at: 1000,
  source: 'laugh',
  ...over,
});

describe('captureLaugh', () => {
  it('anchors the laugh to what Ferni said and what they were talking about', () => {
    const l = captureLaugh({
      agentLine: '  Your sourdough starter has more of a social life than I do.  ',
      userLine: 'I named my sourdough starter',
      at: 42,
    });
    expect(l).toEqual({
      id: 'laugh_42',
      moment: 'Your sourdough starter has more of a social life than I do.',
      context: 'I named my sourdough starter',
      at: 42,
      source: 'laugh',
    });
  });

  it('keeps nothing without a real line to anchor to, and clips long ones', () => {
    expect(captureLaugh({ agentLine: 'Ha!', userLine: 'x', at: 1 })).toBeNull();
    const long = captureLaugh({
      agentLine: 'the tiny stubborn printer jammed again '.repeat(10),
      userLine: '',
      at: 1,
    });
    expect(long!.moment.length).toBeLessThanOrEqual(160);
  });
});

describe('callbackForTurn', () => {
  it('needs a real echo, not a single shared word', () => {
    expect(callbackForTurn([laugh()], 'I baked something today')).toBeNull();
    expect(callbackForTurn([laugh()], 'My sourdough starter is thriving')?.id).toBe('l1');
  });

  it('skips moments already called back and prefers the stronger echo', () => {
    const weak = laugh({ id: 'weak', moment: 'sourdough starter jokes', context: '' });
    const strong = laugh({ id: 'strong' });
    const text = 'My sourdough starter has a social life now, baking every weekend';
    expect(callbackForTurn([weak, strong], text)?.id).toBe('strong');
    expect(callbackForTurn([weak, strong], text, new Set(['strong']))?.id).toBe('weak');
  });
});

describe('stored forms', () => {
  it('reads stored laughs and extractor inside jokes, dropping empty ones', () => {
    expect(fromStoredLaugh({ id: 'a', moment: 'x y', context: '', at: 5 })?.source).toBe('laugh');
    expect(fromStoredLaugh({ id: 'b' })).toBeNull();
    const joke = fromInsideJoke({
      id: 'j',
      reference: 'the great pancake incident',
      origin: 'breakfast disaster story',
      originatedAt: '2026-09-01T00:00:00Z',
    });
    expect(joke).toMatchObject({
      id: 'j',
      source: 'inside_joke',
      context: 'breakfast disaster story',
    });
    expect(joke!.at).toBe(Date.parse('2026-09-01T00:00:00Z'));
    expect(fromInsideJoke({ id: 'k' })).toBeNull();
  });
});

describe('formatCallback', () => {
  it('asks for a light, unexplained nod, and to let it go if it does not fit', () => {
    const note = formatCallback(laugh(), 'Sam');
    expect(note).toContain('Sam laughed when you said');
    expect(note).toContain('never explained');
    expect(note).toContain('Otherwise let it go');
  });
});

describe('running jokes', () => {
  it('lets a joke that keeps landing come back on a single echo', () => {
    const running = laugh({ landed: 2 });
    expect(callbackForTurn([laugh()], 'I baked sourdough')).toBeNull();
    expect(callbackForTurn([running], 'I baked sourdough')?.id).toBe('l1');
    expect(formatCallback(running)).toContain('running joke');
  });

  it('retires a joke that falls flat more than it lands', () => {
    expect(isRetired(laugh({ flat: 2, landed: 0 }))).toBe(true);
    expect(isRetired(laugh({ flat: 2, landed: 3 }))).toBe(false);
    expect(callbackForTurn([laugh({ flat: 2 })], 'My sourdough starter is thriving')).toBeNull();
  });

  it('knows when a reply actually used the callback', () => {
    expect(echoes("Ha, how is the starter's social life these days?", laugh())).toBe(true);
    expect(echoes('That sounds like a lovely weekend.', laugh())).toBe(false);
  });

  it('prefers the stored record, which carries the counts, over the extractor copy', () => {
    const merged = mergeLaughs(
      [laugh({ id: 'j', landed: 1 })],
      [laugh({ id: 'j' }), laugh({ id: 'k' })]
    );
    expect(merged.map((l) => [l.id, l.landed ?? 0])).toEqual([
      ['j', 1],
      ['k', 0],
    ]);
  });
});
