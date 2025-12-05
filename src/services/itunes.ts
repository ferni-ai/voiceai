/**
 * iTunes Search API Service
 *
 * Provides free music search and 30-second preview URLs without authentication.
 * Perfect for music playback when users don't have Spotify Premium.
 *
 * API Documentation: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface iTunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string; // Album name
  previewUrl: string; // 30-second preview MP3 URL
  artworkUrl100: string; // Album artwork
  trackTimeMillis: number; // Duration in ms
  primaryGenreName: string;
  releaseDate: string;
}

export interface iTunesSearchResult {
  resultCount: number;
  results: iTunesTrack[];
}

export interface MusicSearchResult {
  found: boolean;
  track?: {
    name: string;
    artist: string;
    album: string;
    previewUrl: string;
    duration: number;
    genre: string;
    artwork: string;
  };
  alternatives?: Array<{
    name: string;
    artist: string;
    previewUrl: string;
  }>;
  error?: string;
}

// ============================================================================
// ITUNES API
// ============================================================================

const ITUNES_API_BASE = 'https://itunes.apple.com';

/**
 * Search for tracks on iTunes.
 * No authentication required!
 */
export async function searchItunes(query: string, limit: number = 5): Promise<iTunesSearchResult> {
  const url = `${ITUNES_API_BASE}/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`;

  console.log('🎵🎵🎵 [ITUNES API DEBUG] searchItunes called:', { query, limit, url });
  getLogger().info({ query, limit, url: url.slice(0, 80) }, '🎵 [iTunes API] Searching...');

  try {
    console.log('🎵🎵🎵 [ITUNES API DEBUG] Making fetch request to:', url);
    const response = await fetch(url);

    console.log('🎵🎵🎵 [ITUNES API DEBUG] Response:', { status: response.status, ok: response.ok });
    getLogger().info(
      { status: response.status, ok: response.ok },
      '🎵 [iTunes API] Response received'
    );

    if (!response.ok) {
      console.log('🎵🎵🎵 [ITUNES API DEBUG] ❌ HTTP ERROR:', response.status);
      getLogger().error({ status: response.status }, '🎵 [iTunes API] HTTP error');
      throw new Error(`iTunes API error: ${response.status}`);
    }

    const data = (await response.json()) as iTunesSearchResult;

    console.log('🎵🎵🎵 [ITUNES API DEBUG] ✅ Results:', {
      resultCount: data.resultCount,
      firstTrack: data.results[0]?.trackName,
      firstArtist: data.results[0]?.artistName,
      hasPreviewUrl: !!data.results[0]?.previewUrl,
      previewUrl: data.results[0]?.previewUrl?.slice(0, 80),
    });
    getLogger().info(
      {
        query,
        resultCount: data.resultCount,
        firstResult: data.results[0]?.trackName,
        hasPreview: !!data.results[0]?.previewUrl,
      },
      '🎵 [iTunes API] ✅ Search complete'
    );

    return data;
  } catch (error) {
    console.log('🎵🎵🎵 [ITUNES API DEBUG] ❌ EXCEPTION:', error);
    getLogger().error({ error, query, url }, '🎵 [iTunes API] EXCEPTION');
    return { resultCount: 0, results: [] };
  }
}

/**
 * Search for a single best match track.
 * Returns the track with preview URL, or null if not found.
 */
export async function findTrack(query: string): Promise<MusicSearchResult> {
  const results = await searchItunes(query, 5);

  if (results.resultCount === 0) {
    return {
      found: false,
      error: `Couldn't find "${query}" on iTunes. Try a different search?`,
    };
  }

  // Find first result with a preview URL
  const trackWithPreview = results.results.find((t) => t.previewUrl);

  if (!trackWithPreview) {
    return {
      found: false,
      error: `Found "${query}" but no preview is available.`,
    };
  }

  // Build alternatives list (other results with previews)
  const alternatives = results.results
    .filter((t) => t.previewUrl && t.trackId !== trackWithPreview.trackId)
    .slice(0, 3)
    .map((t) => ({
      name: t.trackName,
      artist: t.artistName,
      previewUrl: t.previewUrl,
    }));

  return {
    found: true,
    track: {
      name: trackWithPreview.trackName,
      artist: trackWithPreview.artistName,
      album: trackWithPreview.collectionName,
      previewUrl: trackWithPreview.previewUrl,
      duration: trackWithPreview.trackTimeMillis,
      genre: trackWithPreview.primaryGenreName,
      artwork: trackWithPreview.artworkUrl100,
    },
    alternatives,
  };
}

/**
 * Search for tracks by artist.
 */
export async function searchByArtist(artist: string, limit: number = 10): Promise<iTunesTrack[]> {
  const results = await searchItunes(artist, limit);
  return results.results.filter((t) => t.previewUrl);
}

/**
 * Search for tracks by genre/mood.
 * iTunes doesn't have a great genre search, so we use keyword combinations.
 */
export async function searchByMood(mood: string): Promise<MusicSearchResult> {
  // Map moods to search terms that work well with iTunes
  const moodQueries: Record<string, string[]> = {
    focus: ['lofi study', 'instrumental focus', 'classical piano', 'ambient study'],
    relaxing: ['relaxing piano', 'chill acoustic', 'peaceful music', 'calm instrumental'],
    energizing: ['upbeat pop', 'workout music', 'high energy', 'pump up'],
    stressed: ['calming music', 'meditation piano', 'stress relief', 'peaceful'],
    celebrating: ['celebration', 'party hits', 'happy music', 'feel good'],
    sad: ['sad songs', 'emotional ballads', 'melancholy piano'],
    romantic: ['love songs', 'romantic ballads', 'smooth jazz'],
    workout: ['workout playlist', 'gym music', 'high energy beats'],
    sleep: ['sleep music', 'lullaby', 'ambient sleep', 'peaceful night'],
  };

  const moodKey =
    Object.keys(moodQueries).find((k) => mood.toLowerCase().includes(k)) || 'relaxing';

  const queries = moodQueries[moodKey];
  const randomQuery = queries[Math.floor(Math.random() * queries.length)];

  return findTrack(randomQuery);
}

/**
 * Get popular/trending tracks (by searching common chart terms).
 */
export async function getPopularTracks(): Promise<iTunesTrack[]> {
  const results = await searchItunes('top hits 2024', 10);
  return results.results.filter((t) => t.previewUrl);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if iTunes API is reachable.
 */
export async function isItunesAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${ITUNES_API_BASE}/search?term=test&limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}
