/**
 * The movie tools against TMDB v3 response shapes (fixtures captured from the
 * live API): endpoints and parameters, the caller's country, speakable replies,
 * "unreachable" kept apart from "not found", and showtimes never invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../../utils/safe-logger.js', () => {
  const rec = (...args: unknown[]) => void logs.calls.push(args);
  const l = { debug: rec, info: rec, warn: rec, error: rec };
  return { getLogger: () => l, createLogger: () => l, safeLog: () => l };
});

import {
  createMovieTools,
  getMovieInfo,
  getMovieShowtimes,
  getMoviesNowPlaying,
  getUpcomingMoviesList,
} from '../movies.js';
import { callerRegion, spokenDate } from '../tmdb-client.js';
import { TMDB } from './fixtures/tmdb-responses.js';
import { V3_KEY, callFrom, invalidKey, stubTmdb } from './tmdb-test-utils.js';

/** A spoken clock time, e.g. "7:30", "7 pm", "19:00". */
const CLOCK_TIME = /\b\d{1,2}(:\d{2})\s*(am|pm)?\b|\b\d{1,2}\s*(am|pm)\b/i;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T18:00:00Z'));
  vi.stubEnv('TMDB_API_KEY', V3_KEY);
  logs.calls.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getMovieInfo', () => {
  it('searches, reads the details, and answers in speakable words', async () => {
    const requests = stubTmdb();
    const reply = await getMovieInfo('Dune Part Two');
    expect(reply).toBe(
      'Dune: Part Two (2024), rated 8.1 out of 10 on TMDB. 2 hours 47 minutes. Science Fiction and Adventure. ' +
        'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.'
    );
    expect(requests.map((r) => r.url.pathname)).toEqual(['/3/search/movie', '/3/movie/693134']);
    const search = requests[0].url.searchParams;
    expect(search.get('query')).toBe('Dune Part Two');
    expect(search.get('include_adult')).toBe('false');
    expect(search.get('language')).toBe('en-US');
    expect(search.get('api_key')).toBe(V3_KEY);
  });

  it('passes a year the caller gave', async () => {
    const requests = stubTmdb();
    await getMovieInfo('Dune', 1984);
    expect(requests[0].url.searchParams.get('year')).toBe('1984');
  });

  it('an unreleased film gets its date, not a score', async () => {
    const upcoming = { ...TMDB.searchMovie.results[0], release_date: '2026-10-30', vote_count: 3 };
    stubTmdb((url) =>
      url.pathname === '/3/search/movie' ? { body: { results: [upcoming] } } : undefined
    );
    const reply = await getMovieInfo('Dune Part Two');
    expect(reply).toContain('Dune: Part Two (2026), out October 30.');
    expect(reply).not.toContain('rated');
  });

  it('a rejected key is "can\'t reach", not "couldn\'t find"', async () => {
    stubTmdb(invalidKey);
    expect(await getMovieInfo('Dune')).toBe("I can't reach the movie database right now.");
  });

  it('no match says so', async () => {
    stubTmdb((url) => (url.pathname === '/3/search/movie' ? { body: { results: [] } } : undefined));
    expect(await getMovieInfo('Zzyzx Movie')).toBe(
      'I couldn\'t find a movie called "Zzyzx Movie".'
    );
  });

  it('never logs the key', async () => {
    stubTmdb(invalidKey);
    await getMovieInfo('Dune');
    stubTmdb(() => {
      throw new TypeError(`fetch failed for ?api_key=${V3_KEY}`);
    });
    await getMovieInfo('Dune');
    expect(logs.calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs.calls)).not.toContain(V3_KEY);
  });
});

describe('now playing and upcoming', () => {
  it("lists five films in theaters in the caller's country", async () => {
    const requests = stubTmdb();
    const tools = createMovieTools();
    const reply = await (tools.getMoviesNowPlaying.execute as any)({}, callFrom('gb'));
    expect(requests[0].url.pathname).toBe('/3/movie/now_playing');
    expect(requests[0].url.searchParams.get('region')).toBe('GB');
    const titles = TMDB.nowPlaying.results.slice(0, 5).map((m) => m.title);
    expect(reply).toBe(
      `Movies in theaters now: ${titles.slice(0, 4).join(', ')} and ${titles[4]}. Want me to tell you more about any of these?`
    );
  });

  it('defaults to the US without a known country', async () => {
    const requests = stubTmdb();
    await (createMovieTools().getMoviesNowPlaying.execute as any)({}, callFrom());
    expect(requests[0].url.searchParams.get('region')).toBe('US');
  });

  it('upcoming leaves out films already out, and reads dates as calendar dates', async () => {
    const requests = stubTmdb();
    const reply = await getUpcomingMoviesList('US');
    expect(requests[0].url.searchParams.get('region')).toBe('US');
    // Five of the fixture's ten are re-releases (Rocky, 1976) or opened 2026-10-16.
    expect(reply).toBe(
      'Coming soon to theaters: The Mongoose on October 30, Clayface on October 23, Kung Fu Soccer on October 23, ' +
        'Godzilla Minus Zero on November 3 and Ghost Soldier on November 11. Let me know if you want details on any of these!'
    );
    for (const old of ['Rocky', 'V for Vendetta', 'La bola negra', 'Pet Sematary', 'Hollywood']) {
      expect(reply).not.toContain(old);
    }
  });

  it('an unreachable TMDB is said plainly, not as "no listings"', async () => {
    stubTmdb(invalidKey);
    expect(await getMoviesNowPlaying('US')).toBe("I can't reach the movie database right now.");
    expect(await getUpcomingMoviesList('US')).toBe("I can't reach the movie database right now.");
  });
});

describe('getMovieShowtimes never invents a time', () => {
  it('says it cannot see showtimes, and where to look', async () => {
    stubTmdb();
    const reply = await getMovieShowtimes('Dune Part Two', 'Austin');
    expect(reply).toBe(
      "I can't see theater showtimes, so I won't guess at times. Fandango or the theater's own site will have Dune: Part Two times near Austin."
    );
    expect(reply).not.toMatch(CLOCK_TIME);
    expect(reply).not.toContain('in theaters'); // the old reply's claim for any unrated film
  });

  it("a film that isn't out yet gets its opening date", async () => {
    const soon = { ...TMDB.searchMovie.results[0], title: 'Clayface', release_date: '2026-10-23' };
    stubTmdb((url) =>
      url.pathname === '/3/search/movie' ? { body: { results: [soon] } } : undefined
    );
    const reply = await getMovieShowtimes('Clayface', '');
    expect(reply).toBe(
      "Clayface doesn't open until October 23. I can't see theater showtimes, so I won't guess at times."
    );
  });

  it('stays honest when TMDB is down or the film is unknown', async () => {
    stubTmdb(invalidKey);
    expect(await getMovieShowtimes('Dune', 'Austin')).toMatch(/^I can't see theater showtimes/);
    stubTmdb((url) => (url.pathname === '/3/search/movie' ? { body: { results: [] } } : undefined));
    expect(await getMovieShowtimes('Zzyzx', 'Austin')).toBe(
      "I can't see theater showtimes, so I won't guess at times. I also couldn't find a movie called \"Zzyzx\"."
    );
  });
});

describe('the TMDB client', () => {
  it('a v4 read token goes in the Authorization header, never the URL', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ0ZXN0In0.c2lnbmF0dXJl';
    vi.stubEnv('TMDB_API_KEY', token);
    const requests = stubTmdb();
    await getMoviesNowPlaying('US');
    expect(requests[0].headers.Authorization).toBe(`Bearer ${token}`);
    expect(requests[0].url.searchParams.has('api_key')).toBe(false);
  });

  it('without a key it makes no request', async () => {
    vi.stubEnv('TMDB_API_KEY', '');
    const requests = stubTmdb();
    expect(await getMoviesNowPlaying('US')).toBe("I can't reach the movie database right now.");
    expect(requests).toHaveLength(0);
  });

  it("the caller's country: run first, then the tool context, else US", () => {
    expect(callerRegion(callFrom('ca'), 'GB')).toBe('CA');
    expect(callerRegion(callFrom(), 'gb')).toBe('GB');
    expect(callerRegion(callFrom('United States'))).toBe('US');
    expect(callerRegion(undefined)).toBe('US');
  });

  it('spokenDate keeps the calendar day west of UTC', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles'); // where new Date('2026-10-23') is October 22
    expect(new Date('2026-10-23').toLocaleDateString('en-US', { day: 'numeric' })).toBe('22');
    expect(spokenDate('2026-10-23')).toBe('October 23');
  });
});
