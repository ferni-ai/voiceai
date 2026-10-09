import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchWeb } from '../search.js';

const respond = (body: unknown, ok = true) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, json: async () => body } as Response);

describe('searchWeb with nothing found', () => {
  afterEach(() => vi.restoreAllMocks());

  // "Let me share what I know from experience instead" came back for a ball
  // score, a taco place and a drive time, and Ferni answered from memory
  // (local lookups calls, 2026-10-09).
  it('says nothing was found and does not invite a guess', async () => {
    respond({ AbstractText: '', RelatedTopics: [] });
    const out = await searchWeb('Dodgers game score last night');
    expect(out).toMatch(/no results?|couldn't find/i);
    expect(out).toMatch(/don't guess|not guess|rather than guess/i);
    expect(out).not.toMatch(/share what I know/i);
  });

  it('does not invite a guess when the search fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const out = await searchWeb('drive time to Zion');
    expect(out).not.toMatch(/share what I know/i);
    expect(out).toMatch(/don't guess|not guess|rather than guess/i);
  });

  it('still returns what it found', async () => {
    respond({ AbstractText: 'Zion National Park is in Utah.', AbstractSource: 'Wikipedia' });
    expect(await searchWeb('Zion')).toBe('Zion National Park is in Utah. (via Wikipedia)');
  });
});
