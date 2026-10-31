import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANT_SEARCH, NO_ESTIMATE, defineTerm, searchWeb } from '../search.js';

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

// 2026-10-30 dev sweep: with WEB_SEARCH off, searchWeb said "No results" 6 of 6
// times and the model once gave a drive time anyway.
describe('searchWeb with WEB_SEARCH_HONEST_FALLBACK', () => {
  const unconfigured =
    /^\[status: unconfigured\] I can't search the web right now, so I couldn't find that and I don't know\./;
  beforeEach(() => {
    vi.stubEnv('WEB_SEARCH_HONEST_FALLBACK', 'on');
    vi.stubEnv('NO_INVENTED_INTERNALS', '');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('an empty instant answer says it can\'t search and couldn\'t find it, never "No results"', async () => {
    respond({ AbstractText: '', RelatedTopics: [] });
    const out = await searchWeb('drive time from Denver airport to Boulder');
    expect(out).toMatch(unconfigured);
    expect(out).not.toMatch(/no results/i);
  });

  it('a failed or refused lookup says the same', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    expect(await searchWeb('cheapest flight to Phoenix')).toMatch(unconfigured);
    vi.restoreAllMocks();
    respond({}, false);
    expect(await searchWeb('cheapest flight to Phoenix')).toMatch(unconfigured);
  });

  it('a whitespace-only instant answer is not presented as a result', async () => {
    respond({ AbstractText: '  ', AbstractSource: 'Wikipedia', RelatedTopics: [{ Text: ' ' }] });
    expect(await searchWeb('thai food near downtown Austin')).toMatch(unconfigured);
  });

  it('tells the model not to estimate a time, distance or price', async () => {
    respond({ AbstractText: '', RelatedTopics: [] });
    const out = await searchWeb('how far is Boulder');
    expect(out).toContain(NO_ESTIMATE);
    expect(out).toMatch(/no time, distance, price, score or 'usually about' figure/);
  });

  it('an instant-answer hit is returned as before', async () => {
    respond({ AbstractText: 'Zion National Park is in Utah.', AbstractSource: 'Wikipedia' });
    expect(await searchWeb('Zion')).toBe('Zion National Park is in Utah. (via Wikipedia)');
  });

  it('with NO_INVENTED_INTERNALS it adds the no-fill-in rule', async () => {
    vi.stubEnv('NO_INVENTED_INTERNALS', 'on');
    respond({ AbstractText: '', RelatedTopics: [] });
    const out = await searchWeb('Mars weather');
    expect(out).toMatch(unconfigured);
    expect(out).toMatch(/don't guess at why, or describe how your search works/);
  });

  it('defineTerm still falls through to Wikipedia on the miss', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ AbstractText: '' }) } as Response)
      .mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    const out = await defineTerm('petrichor');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('wikipedia.org');
    expect(out).not.toContain(CANT_SEARCH);
  });
});
