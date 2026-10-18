/**
 * "Where can I watch X" / "is X on Netflix" against TMDB's watch providers
 * (fixtures captured from the live API; the data is JustWatch's): the caller's
 * country, movies and TV, a brief answer, and JustWatch credited every time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whereToWatch } from '../watch-providers.js';
import { createMovieTools } from '../movies.js';
import { V3_KEY, callFrom, invalidKey, stubTmdb } from './tmdb-test-utils.js';

beforeEach(() => vi.stubEnv('TMDB_API_KEY', V3_KEY));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('whereToWatch', () => {
  it('a show: search/multi, then its tv providers in the caller country', async () => {
    const requests = stubTmdb();
    const reply = await whereToWatch('Severance', 'US');
    expect(requests.map((r) => r.url.pathname)).toEqual([
      '/3/search/multi',
      '/3/tv/95396/watch/providers',
    ]);
    // "Apple TV Amazon Channel" is Apple TV again: one name, said once.
    expect(reply).toBe(
      'Severance is streaming on Apple TV in the United States, according to JustWatch.'
    );
  });

  it('reads the caller country, not the US', async () => {
    stubTmdb();
    const reply = await (createMovieTools().getWhereToWatch.execute as any)(
      { title: 'Severance' },
      callFrom('GB')
    );
    expect(reply).toBe(
      'Severance is streaming on Apple TV in the United Kingdom, according to JustWatch.'
    );
  });

  it('a movie: streaming first, with a channel variant at its own place, then rent or buy', async () => {
    const requests = stubTmdb();
    const reply = await whereToWatch('Dune Part Two', 'US', { type: 'movie' });
    expect(requests.map((r) => r.url.pathname)).toEqual([
      '/3/search/movie',
      '/3/movie/693134/watch/providers',
    ]);
    // HBO Max is 151st by itself but 11th as "HBO Max Amazon Channel".
    expect(reply).toBe(
      'Dune: Part Two is streaming on HBO Max, YouTube TV and TNT in the United States, according to JustWatch. ' +
        "It's also for rent or sale on Amazon Video, Apple TV Store and Google Play Movies."
    );
  });

  it('type tv uses search/tv', async () => {
    const requests = stubTmdb();
    await whereToWatch('Severance', 'US', { type: 'tv' });
    expect(requests[0].url.pathname).toBe('/3/search/tv');
    expect(requests[0].url.searchParams.get('query')).toBe('Severance');
  });

  it('"is it on Netflix?" answers no, and where it is', async () => {
    stubTmdb();
    expect(await whereToWatch('Severance', 'US', { service: 'Netflix' })).toBe(
      "No, Severance isn't streaming on Netflix in the United States, according to JustWatch. It's streaming on Apple TV."
    );
  });

  it('answers yes for the service as the caller says it ("Apple TV+", "Max")', async () => {
    stubTmdb();
    expect(await whereToWatch('Severance', 'US', { service: 'Apple TV+' })).toBe(
      'Yes, Severance is streaming on Apple TV+ in the United States, according to JustWatch.'
    );
    expect(await whereToWatch('Dune Part Two', 'US', { type: 'movie', service: 'Max' })).toMatch(
      /^Yes, Dune: Part Two is streaming on Max/
    );
  });

  it('a service that only rents or sells it is a no, with that said', async () => {
    stubTmdb();
    expect(await whereToWatch('Dune Part Two', 'US', { type: 'movie', service: 'Amazon' })).toBe(
      "No, Dune: Part Two isn't streaming on Amazon in the United States, according to JustWatch. You can rent or buy it there."
    );
  });

  it('a country with no providers says so, still credited', async () => {
    stubTmdb();
    expect(await whereToWatch('Severance', 'IS')).toBe(
      "Severance isn't streaming, for rent or for sale in Iceland right now, according to JustWatch."
    );
  });

  it('every answer built on provider data credits JustWatch', async () => {
    stubTmdb();
    const asks: Array<[string, string, object]> = [
      ['Severance', 'US', {}],
      ['Severance', 'CA', { service: 'Netflix' }],
      ['Dune Part Two', 'US', { type: 'movie' }],
      ['Severance', 'IS', {}],
    ];
    for (const [title, region, options] of asks) {
      expect(await whereToWatch(title, region, options)).toContain('according to JustWatch');
    }
  });

  it('unreachable or unknown is said plainly', async () => {
    stubTmdb(invalidKey);
    expect(await whereToWatch('Severance', 'US')).toBe(
      "I can't reach the movie database right now."
    );
    stubTmdb((url) => (url.pathname === '/3/search/multi' ? { body: { results: [] } } : undefined));
    expect(await whereToWatch('Zzyzx', 'US')).toBe(
      'I couldn\'t find a movie or show called "Zzyzx".'
    );
    // Only people matched: not a title.
    stubTmdb((url) =>
      url.pathname === '/3/search/multi'
        ? { body: { results: [{ id: 1, media_type: 'person', name: 'Joan Severance' }] } }
        : undefined
    );
    expect(await whereToWatch('Joan Severance', 'US')).toMatch(/^I couldn't find/);
  });
});
