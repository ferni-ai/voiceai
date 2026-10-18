/**
 * A fetch stand-in for the TMDB tools: answers by path from the captured
 * fixtures and records every request.
 */
import { vi } from 'vitest';
import { TMDB } from './fixtures/tmdb-responses.js';

export const V3_KEY = 'f00dfeedcafe0123456789abcdef0123';

export type Route = (url: URL) => { status?: number; body: unknown } | undefined;

const DEFAULT_ROUTES: Record<string, unknown> = {
  '/3/search/movie': TMDB.searchMovie,
  '/3/movie/693134': TMDB.movieDetails,
  '/3/movie/now_playing': TMDB.nowPlaying,
  '/3/movie/upcoming': TMDB.upcoming,
  '/3/search/multi': TMDB.searchMulti,
  '/3/search/tv': TMDB.searchTv,
  '/3/tv/95396/watch/providers': TMDB.tvProviders,
  '/3/movie/693134/watch/providers': TMDB.movieProviders,
};

/** Stub global fetch; `route` overrides answer first. Returns the requests seen. */
export function stubTmdb(route: Route = () => undefined) {
  const requests: Array<{ url: URL; headers: Record<string, string> }> = [];
  const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const hit = route(url) ?? { body: DEFAULT_ROUTES[url.pathname] };
    if (hit.body === undefined) return new Response('{"status_code":34}', { status: 404 });
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return requests;
}

export const invalidKey: Route = () => ({ status: 401, body: TMDB.invalidKey });

/** A tool call's RunContext with the caller's IP-detected country. */
export const callFrom = (countryCode?: string) => ({
  ctx: { userData: { userLocation: countryCode ? { city: 'X', countryCode } : undefined } },
});
