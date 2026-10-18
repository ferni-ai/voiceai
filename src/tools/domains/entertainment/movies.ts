/**
 * Movie Information Tools
 *
 * Domain: Movie information, now playing, and showtimes, from The Movie
 * Database (TMDB, tmdb-client.ts). No showtimes source: getMovieShowtimes says
 * so and never names a time.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext } from '../../registry/types.js';
import { callerRegion, spokenDate, spokenList, tmdbGet, todayIso } from './tmdb-client.js';

// ============================================================================
// TMDB API (Movie Database)
// ============================================================================

const LANGUAGE = 'en-US';
const UNREACHABLE = "I can't reach the movie database right now.";

interface MovieInfo {
  id: number;
  title: string;
  overview: string;
  releaseDate: string;
  rating: number;
  voteCount: number;
  runtime?: number;
  genres?: string[];
}

/**
 * Search for a movie on TMDB: null when nothing matched, 'unreachable' when TMDB didn't answer
 */
async function searchMovie(
  query: string,
  year?: number
): Promise<MovieInfo | null | 'unreachable'> {
  const log = getLogger();

  try {
    const params = { query, include_adult: false, language: LANGUAGE, year };
    const data = (await tmdbGet('/search/movie', params)) as {
      results?: Array<{
        id: number;
        title: string;
        overview: string;
        release_date: string;
        vote_average: number;
        vote_count: number;
      }>;
    } | null;
    if (!data) return 'unreachable';

    if (!data.results?.length) {
      return null;
    }

    const movie = data.results[0];

    // Get additional details
    const details = (await tmdbGet(`/movie/${movie.id}`, { language: LANGUAGE })) as {
      runtime?: number | null;
      genres?: Array<{ name: string }>;
    } | null;
    const runtime = details?.runtime ?? undefined;
    const genres = details?.genres?.map((g) => g.name);

    return {
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      releaseDate: movie.release_date,
      rating: movie.vote_average,
      voteCount: movie.vote_count,
      runtime,
      genres,
    };
  } catch (error) {
    log.warn({ query, error: String(error) }, '🎬 TMDB exception');
    return 'unreachable';
  }
}

/**
 * Get movies now playing in theaters in a country; null when TMDB didn't answer
 */
async function getNowPlaying(region: string): Promise<MovieInfo[] | null> {
  const log = getLogger();

  try {
    const params = { language: LANGUAGE, region, page: 1 };
    const data = (await tmdbGet('/movie/now_playing', params)) as {
      results?: Array<{
        id: number;
        title: string;
        overview: string;
        release_date: string;
        vote_average: number;
        vote_count: number;
      }>;
    } | null;
    if (!data) return null;

    return (data.results || []).map((movie) => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      releaseDate: movie.release_date,
      rating: movie.vote_average,
      voteCount: movie.vote_count,
    }));
  } catch (error) {
    log.warn({ error: String(error) }, '🎬 Now playing exception');
    return null;
  }
}

/**
 * Get upcoming movies in a country; null when TMDB didn't answer
 */
async function getUpcomingMovies(region: string): Promise<MovieInfo[] | null> {
  const log = getLogger();

  try {
    const params = { language: LANGUAGE, region, page: 1 };
    const data = (await tmdbGet('/movie/upcoming', params)) as {
      results?: Array<{
        id: number;
        title: string;
        overview: string;
        release_date: string;
        vote_average: number;
        vote_count: number;
      }>;
    } | null;
    if (!data) return null;

    return (data.results || []).map((movie) => ({
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      releaseDate: movie.release_date,
      rating: movie.vote_average,
      voteCount: movie.vote_count,
    }));
  } catch (error) {
    log.warn({ error: String(error) }, '🎬 Upcoming movies exception');
    return null;
  }
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

function spokenRuntime(min: number): string {
  const [h, m] = [Math.floor(min / 60), min % 60];
  const parts = [h && `${h} hour${h > 1 ? 's' : ''}`, m && `${m} minute${m > 1 ? 's' : ''}`];
  return parts.filter(Boolean).join(' ');
}

/** The overview cut at a sentence end, roughly two sentences. */
function shortOverview(overview: string): string {
  if (overview.length <= 220) return overview;
  const cut = overview.slice(0, 220);
  const end = cut.lastIndexOf('. ');
  return end > 60 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * Get information about a specific movie
 */
export async function getMovieInfo(title: string, year?: number): Promise<string> {
  const log = getLogger();
  log.info({ title }, '🎬 Looking up movie');

  const movie = await searchMovie(title, year);

  if (movie === 'unreachable') return UNREACHABLE;
  if (!movie) {
    return `I couldn't find a movie called "${title}".`;
  }

  const out = Boolean(movie.releaseDate) && movie.releaseDate <= todayIso();
  // A score from a handful of votes, or from before release, says little.
  const ratingStr =
    out && movie.voteCount >= 20 ? `, rated ${movie.rating.toFixed(1)} out of 10 on TMDB` : '';
  const comingStr = movie.releaseDate && !out ? `, out ${spokenDate(movie.releaseDate)}` : '';
  const runtimeStr = movie.runtime ? ` ${spokenRuntime(movie.runtime)}.` : '';
  const genreStr = movie.genres?.length ? ` ${spokenList(movie.genres.slice(0, 2))}.` : '';
  const yearStr = movie.releaseDate ? ` (${movie.releaseDate.split('-')[0]})` : '';

  const facts = `${movie.title}${yearStr}${ratingStr}${comingStr}.${runtimeStr}${genreStr}`;
  return `${facts} ${shortOverview(movie.overview)}`.trim();
}

/**
 * Get movies currently in theaters
 */
export async function getMoviesNowPlaying(region = 'US'): Promise<string> {
  const log = getLogger();
  log.info({ region }, '🎬 Getting now playing movies');

  const movies = await getNowPlaying(region);

  if (!movies) return UNREACHABLE;
  if (movies.length === 0) {
    return "I don't see any theater listings there right now.";
  }

  const movieList = spokenList(movies.slice(0, 5).map((m) => m.title));

  return `Movies in theaters now: ${movieList}. Want me to tell you more about any of these?`;
}

/**
 * Get upcoming movies
 */
export async function getUpcomingMoviesList(region = 'US'): Promise<string> {
  const log = getLogger();
  log.info({ region }, '🎬 Getting upcoming movies');

  const listed = await getUpcomingMovies(region);
  if (!listed) return UNREACHABLE;

  // TMDB's "upcoming" also lists films that opened in the last few weeks.
  const today = todayIso();
  const movies = listed.filter((m) => m.releaseDate > today).slice(0, 5);
  if (movies.length === 0) {
    return "I don't see any upcoming releases listed right now.";
  }

  const movieList = spokenList(movies.map((m) => `${m.title} on ${spokenDate(m.releaseDate)}`));

  return `Coming soon to theaters: ${movieList}. Let me know if you want details on any of these!`;
}

/**
 * TMDB has no showtimes and nothing else here does: say so and never name a
 * time. The old reply called any film without a rating "in theaters".
 */
export async function getMovieShowtimes(title: string, location: string): Promise<string> {
  const log = getLogger();
  log.info({ title }, '🎬 Getting showtimes');

  const movie = await searchMovie(title);
  const honest = "I can't see theater showtimes, so I won't guess at times.";
  if (movie === null) return `${honest} I also couldn't find a movie called "${title}".`;
  const found = movie === 'unreachable' ? undefined : movie;
  if (found?.releaseDate && found.releaseDate > todayIso()) {
    return `${found.title} doesn't open until ${spokenDate(found.releaseDate)}. ${honest}`;
  }
  const near = location.trim() ? ` near ${location.trim()}` : '';
  return `${honest} Fandango or the theater's own site will have ${found?.title ?? title} times${near}.`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createMovieTools(ctx?: Pick<ToolContext, 'userLocation'>) {
  const logger = getLogger();
  const region = (run: unknown) => callerRegion(run, ctx?.userLocation?.countryCode);

  return {
    getMovieInfo: llm.tool({
      description:
        'Get information about a specific movie including rating, runtime, genres, and description. Use when user asks about a movie.',
      parameters: z.object({
        title: z.string().describe('Name of the movie'),
        year: z.number().int().optional().describe('Release year, only if the caller said one'),
      }),
      execute: async ({ title, year }) => {
        logger.info({ title }, '🎬 Movie info tool called');
        return getMovieInfo(title, year);
      },
    }),

    getMoviesNowPlaying: llm.tool({
      description:
        "Get a list of movies currently playing in theaters in the caller's country. Use when user asks what movies are out, in theaters, or playing now.",
      parameters: z.object({}),
      execute: async (_args, run) => {
        logger.info('🎬 Now playing tool called');
        return getMoviesNowPlaying(region(run));
      },
    }),

    getUpcomingMovies: llm.tool({
      description:
        'Get a list of upcoming movies coming to theaters soon. Use when user asks about upcoming releases or what movies are coming out.',
      parameters: z.object({}),
      execute: async (_args, run) => {
        logger.info('🎬 Upcoming movies tool called');
        return getUpcomingMoviesList(region(run));
      },
    }),

    getMovieShowtimes: llm.tool({
      description:
        "Use when the caller asks for a movie's showtimes. It cannot list times: it says where to find them, and when the movie opens if it isn't out yet. Never state showtimes yourself.",
      parameters: z.object({
        title: z.string().describe('Name of the movie'),
        location: z.string().describe('City or zip code, empty if unknown'),
      }),
      execute: async ({ title, location }) => {
        logger.info({ title }, '🎬 Showtimes tool called');
        return getMovieShowtimes(title, location);
      },
    }),
  };
}

export default createMovieTools;
