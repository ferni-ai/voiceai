/**
 * searchWeb with WEB_SEARCH=on: the grounded answer is shaped for speech, a
 * slow or failed search says it couldn't find it, and every search spends
 * from the caller's hour and everyone's day, refusing when either is spent or
 * the count can't be reached. Gemini (the Vertex SDK client) is mocked; the
 * counts are the real rate limiter on its in-memory store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('../../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getGeminiClient: async () => ({ models: { generateContent } }),
}));

import { circuitBreaker } from '../../../execution/circuit-breaker.js';
import { rateLimiter } from '../../../../services/platform/rate-limiter.js';
import {
  CAPPED,
  DAY_KEY,
  NOT_FOUND,
  PERSON_KEY,
  WEB_SEARCH_TIMEOUT_MS,
  formatSearchResult,
  runWebSearch,
  searchPrincipal,
  sourceName,
  speakable,
  withGroundedSearch,
} from '../web-search.js';
import type { ToolDefinition } from '../../../registry/types.js';

function grounded(text: string, titles: string[], queries = ['q']) {
  return {
    text,
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: titles.map((title, i) => ({
            web: {
              uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${i}`,
              title,
            },
          })),
          webSearchQueries: queries,
        },
      },
    ],
  };
}

let principal = 0;
const nextCaller = () => `user:test-${++principal}-${Date.now()}`;

beforeEach(() => {
  circuitBreaker.resetAll();
  generateContent.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('answer and source shaping', () => {
  it('speaks at most three plain sentences with no links, markdown, dashes or ellipses', () => {
    const raw =
      '**The Eagles won** 24–17 [1]. See https://espn.com/x for more — it was close... ' +
      'Hurts threw two touchdowns. [The recap](https://nfl.com/r) says the defense held. ' +
      'A fourth sentence the caller never hears.';
    const out = speakable(raw);
    expect(out).toBe(
      'The Eagles won 24 to 17. See for more, it was close. Hurts threw two touchdowns.'
    );
  });

  it('keeps decimals and abbreviations inside one sentence', () => {
    expect(speakable('Gemini 3.5 Flash shipped in the U.S. today. Prices fell.', 1)).toBe(
      'Gemini 3.5 Flash shipped in the U.S. today.'
    );
  });

  it('names a domain source by its name and keeps a page title', () => {
    expect(sourceName('apnews.com')).toBe('apnews');
    expect(sourceName('www.bbc.co.uk')).toBe('bbc');
    expect(sourceName('en.wikipedia.org')).toBe('wikipedia');
    expect(sourceName('Eagles beat Giants')).toBe('Eagles beat Giants');
    expect(sourceName('https://example.com/page')).toBeNull();
  });

  it('adds up to two distinct source names and never a URL', () => {
    const out = formatSearchResult('The Eagles won.', [
      'espn.com',
      'ESPN.com',
      'nfl.com',
      'apnews.com',
    ]);
    expect(out).toContain('The Eagles won.');
    expect(out).toContain('Sources: espn and nfl.');
    expect(out).not.toContain('apnews');
    expect(out).not.toMatch(/https?:|www\.|\.com/);
  });

  it('answers a grounded search with the spoken answer and source names', async () => {
    generateContent.mockResolvedValue(
      grounded('The **Eagles** beat the Giants 24 to 17 (https://espn.com). Hurts threw two.', [
        'espn.com',
        'nfl.com',
      ])
    );
    const out = await runWebSearch('eagles score', nextCaller());
    expect(out).toContain('The Eagles beat the Giants 24 to 17. Hurts threw two.');
    expect(out).toContain('Sources: espn and nfl.');
    expect(out).not.toMatch(/https?:|\*\*|vertexaisearch/);
    const req = generateContent.mock.calls[0][0];
    expect(req.contents).toContain('eagles score');
    expect(req.config.tools).toEqual([{ googleSearch: {} }]);
  });

  it('asks for detail instead of searching a placeholder', async () => {
    const out = await runWebSearch('weather in [user location]', nextCaller());
    expect(out).toMatch(/Ask them/);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('timeout and error paths', () => {
  it('says it could not find it when the search outlasts the time limit', async () => {
    vi.useFakeTimers();
    generateContent.mockImplementation(() => new Promise(() => {}));
    const pending = runWebSearch('slow thing', nextCaller());
    await vi.advanceTimersByTimeAsync(WEB_SEARCH_TIMEOUT_MS + 10);
    expect(await pending).toBe(NOT_FOUND);
  });

  it('says it could not find it when Vertex errors', async () => {
    generateContent.mockRejectedValue(new Error('503 UNAVAILABLE'));
    expect(await runWebSearch('broken', nextCaller())).toBe(NOT_FOUND);
  });

  it('never serves an earlier answer when a later search fails', async () => {
    generateContent.mockResolvedValueOnce(grounded('A private earlier answer.', ['a.com']));
    expect(await runWebSearch('first', nextCaller())).toContain('A private earlier answer.');
    generateContent.mockRejectedValueOnce(new Error('timeout'));
    expect(await runWebSearch('second', nextCaller())).toBe(NOT_FOUND);
  });

  it('says it could not find it when the answer is empty', async () => {
    generateContent.mockResolvedValue(grounded('', ['a.com']));
    expect(await runWebSearch('nothing', nextCaller())).toBe(NOT_FOUND);
  });
});

describe('spend caps', () => {
  it('refuses a caller past SEARCH_MAX_PER_PERSON_HOUR and lets another caller search', async () => {
    vi.stubEnv('SEARCH_MAX_PER_PERSON_HOUR', '2');
    generateContent.mockResolvedValue(grounded('An answer.', ['a.com']));
    const caller = nextCaller();
    expect(await runWebSearch('one', caller)).toContain('An answer.');
    expect(await runWebSearch('two', caller)).toContain('An answer.');
    expect(await runWebSearch('three', caller)).toBe(CAPPED);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(await runWebSearch('four', nextCaller())).toContain('An answer.');
  });

  it('refuses everyone past SEARCH_MAX_PER_DAY, counting each Google query', async () => {
    vi.stubEnv('SEARCH_MAX_PER_DAY', '3');
    const dayKeyCalls: number[] = [];
    const original = rateLimiter.checkShared.bind(rateLimiter);
    const isolatedDay = `${DAY_KEY}:isolated-${Date.now()}`;
    vi.spyOn(rateLimiter, 'checkShared').mockImplementation(async (key, max, windowMs, cost) => {
      if (key === DAY_KEY) dayKeyCalls.push(cost ?? 1);
      return original(key === DAY_KEY ? isolatedDay : key, max, windowMs, cost);
    });
    // One prompt that made two Google queries spends two of the day's three.
    generateContent.mockResolvedValue(grounded('An answer.', ['a.com'], ['q1', 'q2']));
    expect(await runWebSearch('first', nextCaller())).toContain('An answer.');
    expect(dayKeyCalls).toEqual([1, 1]);
    expect(await runWebSearch('second', nextCaller())).toContain('An answer.');
    expect(await runWebSearch('third', nextCaller())).toBe(CAPPED);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the shared count is unreachable', async () => {
    vi.spyOn(rateLimiter, 'checkShared').mockResolvedValue(null);
    expect(await runWebSearch('anything', nextCaller())).toBe(CAPPED);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('fails closed when only the day count is unreachable', async () => {
    const original = rateLimiter.checkShared.bind(rateLimiter);
    vi.spyOn(rateLimiter, 'checkShared').mockImplementation(async (key, ...rest) =>
      key === DAY_KEY ? null : original(key, ...rest)
    );
    expect(await runWebSearch('anything', nextCaller())).toBe(CAPPED);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('charges the call’s signed-in user, not the shared tool user', () => {
    const ctx = { userId: 'shared', agentId: 'ferni', agentDisplayName: 'Ferni' };
    expect(searchPrincipal({ ctx: { userData: { userId: 'u1' } } }, ctx)).toBe('user:u1');
    expect(searchPrincipal({ ctx: { userData: {} } }, ctx)).toBe('anonymous');
    expect(searchPrincipal(undefined, { ...ctx, userId: 'u2' })).toBe('user:u2');
    expect(PERSON_KEY).toBe('web-search:person');
  });
});

describe('withGroundedSearch', () => {
  const legacyTool = { description: 'legacy', execute: async () => 'duckduckgo' };
  const legacy: ToolDefinition = {
    id: 'searchWeb',
    name: 'Search Web',
    description: 'legacy',
    domain: 'information',
    create: () => legacyTool as never,
  };
  const ctx = { userId: 'u', agentId: 'ferni', agentDisplayName: 'Ferni' };

  it('keeps the legacy tool with the flag off', () => {
    expect(withGroundedSearch(legacy).create(ctx)).toBe(legacyTool);
  });

  it('builds the grounded tool with WEB_SEARCH=on', () => {
    vi.stubEnv('WEB_SEARCH', 'on');
    const tool = withGroundedSearch(legacy).create(ctx) as { description: string };
    expect(tool).not.toBe(legacyTool);
    expect(tool.description).toMatch(/today's news/);
  });
});
