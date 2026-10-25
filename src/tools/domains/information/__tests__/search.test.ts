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

describe('searchWeb failure shape, NO_INVENTED_INTERNALS', () => {
  const prev = process.env.NO_INVENTED_INTERNALS;
  afterEach(() => {
    vi.restoreAllMocks();
    if (prev === undefined) delete process.env.NO_INVENTED_INTERNALS;
    else process.env.NO_INVENTED_INTERNALS = prev;
  });

  it('off: the failure text as before', async () => {
    delete process.env.NO_INVENTED_INTERNALS;
    respond({ AbstractText: '', RelatedTopics: [] });
    const out = await searchWeb('baseball game tonight');
    expect(out).toMatch(/^No results for "baseball game tonight"\./);
    expect(out).not.toMatch(/status:/);
  });

  it('on: an explicit status and the no-fill-in rule, for nothing found and for a failure', async () => {
    process.env.NO_INVENTED_INTERNALS = 'on';
    respond({ AbstractText: '', RelatedTopics: [] });
    const none = await searchWeb('baseball game tonight');
    expect(none).toMatch(/^\[status: no_results\] No results for/);
    expect(none).toMatch(/don't guess at why, or describe how your search works/);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    expect(await searchWeb('score')).toMatch(/^\[status: error\] The search didn't work/);
    vi.restoreAllMocks();
    respond({}, false);
    expect(await searchWeb('score')).toMatch(/^\[status: error\] I couldn't search/);
  });

  it('on: a found answer is untouched', async () => {
    process.env.NO_INVENTED_INTERNALS = 'on';
    respond({ AbstractText: 'Zion National Park is in Utah.', AbstractSource: 'Wikipedia' });
    expect(await searchWeb('Zion')).toBe('Zion National Park is in Utah. (via Wikipedia)');
  });
});
