/**
 * Spotify Web API helpers for spotify-library.ts: authenticated requests,
 * track conversion and the response shapes we read.
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SpotifyTrack } from './types.js';

const log = createLogger({ module: 'SpotifyLibrary' });

export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// ============================================================================
// SPOTIFY API HELPERS
// ============================================================================

interface SpotifyRequestOptions {
  method?: string;
  body?: unknown;
}

export async function spotifyRequest<T>(
  endpoint: string,
  accessToken: string,
  options: SpotifyRequestOptions = {}
): Promise<T | null> {
  try {
    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      log.warn({ status: response.status, endpoint }, '⚠️ Spotify API request failed');
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    log.error({ error, endpoint }, '❌ Spotify API request error');
    return null;
  }
}

// ============================================================================
// TRACK CONVERSION
// ============================================================================

export interface SpotifyTrackObject {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    name: string;
    images: Array<{ url: string }>;
    release_date: string;
  };
  preview_url: string | null;
  uri: string;
  duration_ms: number;
  popularity: number;
}

export function convertSpotifyTrack(track: SpotifyTrackObject): SpotifyTrack {
  const releaseYear = track.album.release_date
    ? parseInt(track.album.release_date.slice(0, 4), 10)
    : new Date().getFullYear();

  return {
    id: track.id,
    name: track.name,
    artistName: track.artists.map((a) => a.name).join(', '),
    artistId: track.artists[0]?.id || '',
    albumName: track.album.name,
    albumArt: track.album.images[0]?.url || '',
    previewUrl: track.preview_url,
    uri: track.uri,
    durationMs: track.duration_ms,
    popularity: track.popularity,
    releaseYear,
    genres: [], // Genres require additional API calls
  };
}

// Response shapes used by library sync

export interface SavedTracksResponse {
  items: Array<{ track: SpotifyTrackObject }>;
  total: number;
  next: string | null;
}

export interface UserProfileResponse {
  id: string;
  display_name: string;
}

export interface PlaylistsResponse {
  total: number;
}

export interface FollowedArtistsResponse {
  artists: {
    total: number;
    items: Array<{
      id: string;
      name: string;
      genres: string[];
      images: Array<{ url: string }>;
      popularity: number;
    }>;
  };
}
