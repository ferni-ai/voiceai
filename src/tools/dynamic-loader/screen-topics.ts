/**
 * Dynamic Tool Loader - topic keys that load the movie and where-to-watch
 * tools (getMovieInfo, getMoviesNowPlaying, getWhereToWatch…, video domain).
 *
 * They sat in entertainment, which every call loads up front, so a movie topic
 * never re-offered them, and the first agent's 64-tool cap kept the music
 * tools instead: "is Severance on Netflix?" loaded nothing and "what's playing
 * at the movies" only the play domain (local, 2026-10-17). Bare "theater" and
 * "series" are left out: "the theater downtown" and "a series of meetings"
 * would load it, and each false load swaps the agent's tools mid-turn.
 */

import type { ToolDomain } from '../registry/types.js';

const SCREEN: ToolDomain[] = ['video', 'entertainment'];

export const SCREEN_TOPICS: Record<string, ToolDomain[]> = {
  movie: SCREEN,
  film: SCREEN,
  cinema: SCREEN,
  'in theater': SCREEN,
  'in theatre': SCREEN,
  showtime: SCREEN,
  'tv show': SCREEN,
  'tv series': SCREEN,
  streaming: SCREEN,
  netflix: SCREEN,
  hulu: SCREEN,
  'disney plus': SCREEN,
  'disney+': SCREEN,
  'prime video': SCREEN,
  hbo: SCREEN,
  'apple tv': SCREEN,
  peacock: SCREEN,
  paramount: SCREEN,
};
