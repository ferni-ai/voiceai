/**
 * Live TMDB smoke test: skipped unless TMDB_API_KEY is set. Run it with the
 * key exported for that one command, e.g.
 *   TMDB_API_KEY="$(gcloud secrets versions access latest --secret=tmdb-api-key \
 *     --project=johnb-2025)" npx vitest run --config vitest.config.integration.ts \
 *     src/tools/domains/entertainment/__tests__/tmdb.integration.test.ts
 */
import { describe, expect, it } from 'vitest';
import { getMovieInfo, getMoviesNowPlaying, getUpcomingMoviesList } from '../movies.js';
import { whereToWatch } from '../watch-providers.js';

const UNREACHABLE = "I can't reach the movie database right now.";

describe.skipIf(!process.env.TMDB_API_KEY)('TMDB, live', () => {
  it('looks up a movie', async () => {
    const reply = await getMovieInfo('Dune Part Two');
    expect(reply).toMatch(/^Dune: Part Two \(2024\), rated \d\.\d out of 10 on TMDB\./);
  }, 20_000);

  it('lists what is in theaters and coming, in the US', async () => {
    expect(await getMoviesNowPlaying('US')).toMatch(/^Movies in theaters now: /);
    expect(await getUpcomingMoviesList('US')).not.toBe(UNREACHABLE);
  }, 20_000);

  it('says where a show streams, crediting JustWatch', async () => {
    const reply = await whereToWatch('Severance', 'US');
    expect(reply).toMatch(
      /^Severance is streaming on .+ in the United States, according to JustWatch\./
    );
  }, 20_000);
});
