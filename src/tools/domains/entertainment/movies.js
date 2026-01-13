/**
 * Movie Information Tools
 *
 * Domain: Movie information, now playing, and showtimes.
 * Single responsibility: Looking up movie info and local showtimes.
 *
 * APIs used:
 * - The Movie Database (TMDB) - free API for movie info
 * - SerpAPI or manual Google search for showtimes
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
// ============================================================================
// TMDB API (Movie Database)
// ============================================================================
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
/**
 * Search for a movie on TMDB
 */
async function searchMovie(query) {
    const log = getLogger();
    if (!TMDB_API_KEY) {
        log.debug('🎬 TMDB API key not configured');
        return null;
    }
    try {
        const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) {
            log.debug({ query, status: response.status }, '🎬 TMDB search error');
            return null;
        }
        const data = (await response.json());
        if (!data.results?.length) {
            return null;
        }
        const movie = data.results[0];
        // Get additional details
        const detailsUrl = `${TMDB_BASE_URL}/movie/${movie.id}?api_key=${TMDB_API_KEY}`;
        const detailsResponse = await fetch(detailsUrl, { signal: AbortSignal.timeout(5000) });
        let runtime;
        let genres;
        if (detailsResponse.ok) {
            const details = (await detailsResponse.json());
            runtime = details.runtime;
            genres = details.genres?.map((g) => g.name);
        }
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
    }
    catch (error) {
        log.warn({ query, error: String(error) }, '🎬 TMDB exception');
        return null;
    }
}
/**
 * Get movies now playing in theaters
 */
async function getNowPlaying() {
    const log = getLogger();
    if (!TMDB_API_KEY) {
        log.debug('🎬 TMDB API key not configured');
        return [];
    }
    try {
        const url = `${TMDB_BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}&region=US`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) {
            return [];
        }
        const data = (await response.json());
        return (data.results || []).slice(0, 5).map((movie) => ({
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            releaseDate: movie.release_date,
            rating: movie.vote_average,
            voteCount: movie.vote_count,
        }));
    }
    catch (error) {
        log.warn({ error: String(error) }, '🎬 Now playing exception');
        return [];
    }
}
/**
 * Get upcoming movies
 */
async function getUpcomingMovies() {
    const log = getLogger();
    if (!TMDB_API_KEY) {
        return [];
    }
    try {
        const url = `${TMDB_BASE_URL}/movie/upcoming?api_key=${TMDB_API_KEY}&region=US`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) {
            return [];
        }
        const data = (await response.json());
        return (data.results || []).slice(0, 5).map((movie) => ({
            id: movie.id,
            title: movie.title,
            overview: movie.overview,
            releaseDate: movie.release_date,
            rating: movie.vote_average,
            voteCount: movie.vote_count,
        }));
    }
    catch (error) {
        log.warn({ error: String(error) }, '🎬 Upcoming movies exception');
        return [];
    }
}
// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================
/**
 * Get information about a specific movie
 */
export async function getMovieInfo(title) {
    const log = getLogger();
    log.info({ title }, '🎬 Looking up movie');
    const movie = await searchMovie(title);
    if (!movie) {
        return `I couldn't find information about "${title}". Check the spelling or try a different title.`;
    }
    const ratingStr = movie.rating > 0 ? ` Rated ${movie.rating.toFixed(1)}/10` : '';
    const runtimeStr = movie.runtime ? ` ${movie.runtime} minutes.` : '';
    const genreStr = movie.genres?.length ? ` Genres: ${movie.genres.join(', ')}.` : '';
    const yearStr = movie.releaseDate ? ` (${movie.releaseDate.split('-')[0]})` : '';
    // Truncate overview if too long
    const overview = movie.overview.length > 200 ? movie.overview.substring(0, 197) + '...' : movie.overview;
    return `${movie.title}${yearStr}:${ratingStr}.${runtimeStr}${genreStr} ${overview}`;
}
/**
 * Get movies currently in theaters
 */
export async function getMoviesNowPlaying() {
    const log = getLogger();
    log.info('🎬 Getting now playing movies');
    const movies = await getNowPlaying();
    if (movies.length === 0) {
        return "I couldn't get the current movie listings right now. Check your local theater's website for showtimes.";
    }
    const movieList = movies
        .map((m) => {
        const rating = m.rating > 0 ? ` (${m.rating.toFixed(1)}/10)` : '';
        return `${m.title}${rating}`;
    })
        .join(', ');
    return `Movies in theaters now: ${movieList}. Want me to tell you more about any of these?`;
}
/**
 * Get upcoming movies
 */
export async function getUpcomingMoviesList() {
    const log = getLogger();
    log.info('🎬 Getting upcoming movies');
    const movies = await getUpcomingMovies();
    if (movies.length === 0) {
        return "I couldn't get the upcoming movie schedule right now.";
    }
    const movieList = movies
        .map((m) => {
        const date = m.releaseDate
            ? ` (${new Date(m.releaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
            : '';
        return `${m.title}${date}`;
    })
        .join(', ');
    return `Coming soon to theaters: ${movieList}. Let me know if you want details on any of these!`;
}
/**
 * Get showtimes for a movie (requires location)
 * Note: This provides a search suggestion since actual showtimes require
 * theater-specific APIs or web scraping
 */
export async function getMovieShowtimes(title, location) {
    const log = getLogger();
    log.info({ title, location }, '🎬 Getting showtimes');
    // Verify the movie exists
    const movie = await searchMovie(title);
    if (!movie) {
        return `I couldn't find "${title}". Check the title and try again.`;
    }
    // Generate search suggestion
    const searchQuery = encodeURIComponent(`${movie.title} showtimes ${location}`);
    return `For ${movie.title} showtimes near ${location}, I'd recommend checking Fandango, AMC, or Google for the most accurate local listings. The movie is currently ${movie.rating > 0 ? `rated ${movie.rating.toFixed(1)}/10` : 'in theaters'}. Would you like me to tell you more about the movie instead?`;
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function createMovieTools() {
    const logger = getLogger();
    return {
        getMovieInfo: llm.tool({
            description: 'Get information about a specific movie including rating, runtime, genres, and description. Use when user asks about a movie.',
            parameters: z.object({
                title: z.string().describe('Name of the movie'),
            }),
            execute: async ({ title }) => {
                logger.info({ title }, '🎬 Movie info tool called');
                return getMovieInfo(title);
            },
        }),
        getMoviesNowPlaying: llm.tool({
            description: 'Get a list of movies currently playing in theaters. Use when user asks what movies are out, in theaters, or playing now.',
            parameters: z.object({}),
            execute: async () => {
                logger.info('🎬 Now playing tool called');
                return getMoviesNowPlaying();
            },
        }),
        getUpcomingMovies: llm.tool({
            description: 'Get a list of upcoming movies coming to theaters soon. Use when user asks about upcoming releases or what movies are coming out.',
            parameters: z.object({}),
            execute: async () => {
                logger.info('🎬 Upcoming movies tool called');
                return getUpcomingMoviesList();
            },
        }),
        getMovieShowtimes: llm.tool({
            description: 'Get showtime information for a movie in a specific location. Use when user asks for showtimes or when a movie is playing.',
            parameters: z.object({
                title: z.string().describe('Name of the movie'),
                location: z.string().describe('City or zip code for local theaters'),
            }),
            execute: async ({ title, location }) => {
                logger.info({ title, location }, '🎬 Showtimes tool called');
                return getMovieShowtimes(title, location);
            },
        }),
    };
}
export default createMovieTools;
//# sourceMappingURL=movies.js.map