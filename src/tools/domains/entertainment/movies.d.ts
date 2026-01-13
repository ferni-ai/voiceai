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
/**
 * Get information about a specific movie
 */
export declare function getMovieInfo(title: string): Promise<string>;
/**
 * Get movies currently in theaters
 */
export declare function getMoviesNowPlaying(): Promise<string>;
/**
 * Get upcoming movies
 */
export declare function getUpcomingMoviesList(): Promise<string>;
/**
 * Get showtimes for a movie (requires location)
 * Note: This provides a search suggestion since actual showtimes require
 * theater-specific APIs or web scraping
 */
export declare function getMovieShowtimes(title: string, location: string): Promise<string>;
export declare function createMovieTools(): {
    getMovieInfo: llm.FunctionTool<{
        title: string;
    }, unknown, string>;
    getMoviesNowPlaying: llm.FunctionTool<Record<string, never>, unknown, string>;
    getUpcomingMovies: llm.FunctionTool<Record<string, never>, unknown, string>;
    getMovieShowtimes: llm.FunctionTool<{
        title: string;
        location: string;
    }, unknown, string>;
};
export default createMovieTools;
//# sourceMappingURL=movies.d.ts.map