/**
 * 🎧 Spotify Library Integration
 *
 * Deep integration with user's Spotify library for personalized games.
 * Enables "Play from Your Library" mode where games use the user's
 * own saved songs, playlists, and liked tracks.
 *
 * Features:
 * - Sync user's Spotify library
 * - Get playable tracks with preview URLs
 * - Build "Our Songs" collaborative playlist
 * - Analyze user's musical taste from library
 *
 * @module SpotifyLibrary
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  SpotifyLibraryData,
  SpotifyTrack,
  SpotifyArtist,
  OurSongsPlaylist,
  OurSong,
} from './types.js';

const log = createLogger({ module: 'SpotifyLibrary' });

// ============================================================================
// CONSTANTS
// ============================================================================

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const MAX_LIBRARY_TRACKS = 500; // Limit for performance
const PREVIEW_REQUIRED_PERCENTAGE = 0.3; // At least 30% of tracks need previews

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const libraryCache = new Map<string, SpotifyLibraryData>();
const ourSongsCache = new Map<string, OurSongsPlaylist>();

// ============================================================================
// SPOTIFY API HELPERS
// ============================================================================

interface SpotifyRequestOptions {
  method?: string;
  body?: unknown;
}

async function spotifyRequest<T>(
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

interface SpotifyTrackObject {
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

function convertSpotifyTrack(track: SpotifyTrackObject): SpotifyTrack {
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

// ============================================================================
// LIBRARY SYNC
// ============================================================================

interface SavedTracksResponse {
  items: Array<{ track: SpotifyTrackObject }>;
  total: number;
  next: string | null;
}

interface UserProfileResponse {
  id: string;
  display_name: string;
}

interface PlaylistsResponse {
  total: number;
}

interface FollowedArtistsResponse {
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

/**
 * Sync user's Spotify library
 * Fetches saved tracks, playlists, and followed artists
 */
export async function syncSpotifyLibrary(
  userId: string,
  accessToken: string
): Promise<SpotifyLibraryData | null> {
  log.info({ userId }, '🎧 Syncing Spotify library...');

  try {
    // Get user profile
    const profile = await spotifyRequest<UserProfileResponse>('/me', accessToken);
    if (!profile) {
      log.warn({ userId }, '⚠️ Could not get Spotify profile');
      return null;
    }

    // Get saved tracks (liked songs)
    const allTracks: SpotifyTrack[] = [];
    let nextUrl: string | null = '/me/tracks?limit=50';

    while (nextUrl && allTracks.length < MAX_LIBRARY_TRACKS) {
      const endpoint: string = nextUrl.replace(SPOTIFY_API_BASE, '');
      const response: SavedTracksResponse | null = await spotifyRequest<SavedTracksResponse>(
        endpoint,
        accessToken
      );

      if (!response) break;

      const tracks = response.items.map((item: { track: SpotifyTrackObject }) =>
        convertSpotifyTrack(item.track)
      );
      allTracks.push(...tracks);

      nextUrl = response.next;
    }

    // Get playlists count
    const playlists = await spotifyRequest<PlaylistsResponse>('/me/playlists?limit=1', accessToken);

    // Get followed artists
    const followed = await spotifyRequest<FollowedArtistsResponse>(
      '/me/following?type=artist&limit=50',
      accessToken
    );

    // Filter tracks with preview URLs
    const playableTracks = allTracks.filter((t) => t.previewUrl);

    // Analyze top genres and decades
    const genreCounts = new Map<string, number>();
    const decadeCounts = new Map<string, number>();

    for (const track of allTracks) {
      // Decade counting
      const decade = `${Math.floor(track.releaseYear / 10) * 10}s`;
      decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
    }

    // Get unique genres from followed artists
    if (followed?.artists.items) {
      for (const artist of followed.artists.items) {
        for (const genre of artist.genres) {
          genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
        }
      }
    }

    // Sort and get top items
    const topGenres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([genre]) => genre);

    const topDecades = [...decadeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([decade]) => decade);

    // Convert followed artists
    const topArtists: SpotifyArtist[] = (followed?.artists.items || []).slice(0, 20).map((a) => ({
      id: a.id,
      name: a.name,
      genres: a.genres,
      imageUrl: a.images[0]?.url || '',
      popularity: a.popularity,
    }));

    const libraryData: SpotifyLibraryData = {
      userId,
      spotifyUserId: profile.id,
      connected: true,
      lastSyncedAt: new Date(),

      savedTracksCount: allTracks.length,
      savedAlbumsCount: 0, // Would require additional API call
      playlistCount: playlists?.total || 0,
      followedArtistsCount: followed?.artists.total || 0,

      topArtists,
      topGenres,
      topDecades,

      libraryTracks: allTracks,
      playableTracks,
    };

    // Cache the data
    libraryCache.set(userId, libraryData);

    log.info(
      {
        userId,
        totalTracks: allTracks.length,
        playableTracks: playableTracks.length,
        topGenres: topGenres.slice(0, 3),
      },
      '✅ Spotify library synced'
    );

    return libraryData;
  } catch (error) {
    log.error({ error, userId }, '❌ Failed to sync Spotify library');
    return null;
  }
}

/**
 * Get cached library data or sync if needed
 */
export async function getSpotifyLibrary(
  userId: string,
  accessToken?: string
): Promise<SpotifyLibraryData | null> {
  const cached = libraryCache.get(userId);

  // Return cached if fresh (less than 1 hour old)
  if (cached && cached.lastSyncedAt) {
    const age = Date.now() - cached.lastSyncedAt.getTime();
    if (age < 60 * 60 * 1000) {
      return cached;
    }
  }

  // Need to sync
  if (accessToken) {
    return syncSpotifyLibrary(userId, accessToken);
  }

  return cached || null;
}

// ============================================================================
// GAME HELPERS
// ============================================================================

/**
 * Get random playable tracks for games
 * Only returns tracks with preview URLs
 */
export function getRandomPlayableTracks(
  userId: string,
  count: number = 10,
  options?: {
    genre?: string;
    decade?: string;
    excludeIds?: string[];
  }
): SpotifyTrack[] {
  const library = libraryCache.get(userId);
  if (!library) return [];

  let tracks = [...library.playableTracks];

  // Filter by options
  if (options?.excludeIds) {
    tracks = tracks.filter((t) => !options.excludeIds!.includes(t.id));
  }

  if (options?.decade) {
    const decadeStart = parseInt(options.decade.replace('s', ''), 10);
    tracks = tracks.filter((t) => t.releaseYear >= decadeStart && t.releaseYear < decadeStart + 10);
  }

  // Shuffle and take
  const shuffled = tracks.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Check if library has enough playable content for games
 */
export function hasEnoughPlayableContent(userId: string): {
  hasEnough: boolean;
  playableCount: number;
  totalCount: number;
  percentage: number;
} {
  const library = libraryCache.get(userId);
  if (!library) {
    return { hasEnough: false, playableCount: 0, totalCount: 0, percentage: 0 };
  }

  const playableCount = library.playableTracks.length;
  const totalCount = library.libraryTracks.length;
  const percentage = totalCount > 0 ? playableCount / totalCount : 0;

  return {
    hasEnough: playableCount >= 20 && percentage >= PREVIEW_REQUIRED_PERCENTAGE,
    playableCount,
    totalCount,
    percentage,
  };
}

/**
 * Get tracks the user might not recognize well
 * (older tracks, less popular, less frequently played)
 */
export function getChallengerTracks(userId: string, count: number = 5): SpotifyTrack[] {
  const library = libraryCache.get(userId);
  if (!library) return [];

  // Sort by age (older first) and lower popularity
  const sorted = [...library.playableTracks].sort((a, b) => {
    const ageScore = a.releaseYear - b.releaseYear;
    const popScore = a.popularity - b.popularity;
    return ageScore + popScore; // Lower is more challenging
  });

  // Take from the "harder" end
  return sorted.slice(0, count);
}

// ============================================================================
// OUR SONGS PLAYLIST
// ============================================================================

/**
 * Get or create the "Our Songs" playlist
 */
export function getOurSongsPlaylist(userId: string): OurSongsPlaylist {
  let playlist = ourSongsCache.get(userId);

  if (!playlist) {
    playlist = {
      spotifyPlaylistId: null,
      songs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    ourSongsCache.set(userId, playlist);
  }

  return playlist;
}

/**
 * Add a song to "Our Songs"
 */
export function addOurSong(userId: string, song: Omit<OurSong, 'addedAt'>): OurSongsPlaylist {
  const playlist = getOurSongsPlaylist(userId);

  // Check if already exists
  if (playlist.songs.some((s) => s.trackId === song.trackId)) {
    log.debug({ userId, trackId: song.trackId }, '🎵 Song already in Our Songs');
    return playlist;
  }

  playlist.songs.push({
    ...song,
    addedAt: new Date(),
  });
  playlist.updatedAt = new Date();

  log.info(
    { userId, trackName: song.trackName, totalSongs: playlist.songs.length },
    '🎵 Added to Our Songs'
  );

  return playlist;
}

/**
 * Create or sync "Our Songs" as a real Spotify playlist
 */
export async function syncOurSongsToSpotify(
  userId: string,
  accessToken: string
): Promise<string | null> {
  const playlist = getOurSongsPlaylist(userId);

  if (playlist.songs.length === 0) {
    log.warn({ userId }, '⚠️ No songs to sync to Our Songs playlist');
    return null;
  }

  try {
    // Get user's Spotify ID
    const profile = await spotifyRequest<UserProfileResponse>('/me', accessToken);
    if (!profile) return null;

    // Create playlist if doesn't exist
    if (!playlist.spotifyPlaylistId) {
      const createResponse = await spotifyRequest<{ id: string }>(
        `/users/${profile.id}/playlists`,
        accessToken,
        {
          method: 'POST',
          body: {
            name: 'Our Songs with Ferni 🌿',
            description: 'Songs from my conversations with Ferni - memories in music.',
            public: false,
          },
        }
      );

      if (createResponse) {
        playlist.spotifyPlaylistId = createResponse.id;
        log.info(
          { userId, playlistId: createResponse.id },
          '🎵 Created Our Songs playlist on Spotify'
        );
      }
    }

    // Add tracks to playlist
    if (playlist.spotifyPlaylistId) {
      const uris = playlist.songs.filter((s) => s.spotifyUri).map((s) => s.spotifyUri);

      if (uris.length > 0) {
        await spotifyRequest(`/playlists/${playlist.spotifyPlaylistId}/tracks`, accessToken, {
          method: 'PUT', // Replace all tracks
          body: { uris },
        });

        log.info({ userId, trackCount: uris.length }, '🎵 Synced Our Songs to Spotify');
      }
    }

    return playlist.spotifyPlaylistId;
  } catch (error) {
    log.error({ error, userId }, '❌ Failed to sync Our Songs to Spotify');
    return null;
  }
}

// ============================================================================
// TASTE ANALYSIS
// ============================================================================

interface TasteAnalysis {
  topGenres: Array<{ genre: string; percentage: number }>;
  topDecades: Array<{ decade: string; percentage: number }>;
  topArtists: Array<{ name: string; trackCount: number }>;
  energyProfile: 'chill' | 'balanced' | 'energetic';
  diversityScore: number; // 0-100
  obscurityScore: number; // 0-100 (higher = more obscure taste)
}

/**
 * Analyze user's musical taste from their library
 */
export function analyzeLibraryTaste(userId: string): TasteAnalysis | null {
  const library = libraryCache.get(userId);
  if (!library || library.libraryTracks.length === 0) return null;

  const tracks = library.libraryTracks;
  const totalTracks = tracks.length;

  // Decade distribution
  const decadeCounts = new Map<string, number>();
  for (const track of tracks) {
    const decade = `${Math.floor(track.releaseYear / 10) * 10}s`;
    decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
  }

  const topDecades = [...decadeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([decade, count]) => ({
      decade,
      percentage: Math.round((count / totalTracks) * 100),
    }));

  // Artist distribution
  const artistCounts = new Map<string, number>();
  for (const track of tracks) {
    artistCounts.set(track.artistName, (artistCounts.get(track.artistName) || 0) + 1);
  }

  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, trackCount]) => ({ name, trackCount }));

  // Energy profile based on average popularity
  const avgPopularity = tracks.reduce((sum, t) => sum + t.popularity, 0) / totalTracks;

  let energyProfile: 'chill' | 'balanced' | 'energetic';
  if (avgPopularity < 40) energyProfile = 'chill';
  else if (avgPopularity > 70) energyProfile = 'energetic';
  else energyProfile = 'balanced';

  // Diversity score (number of unique artists / total tracks)
  const diversityScore = Math.min(100, Math.round((artistCounts.size / totalTracks) * 200));

  // Obscurity score (inverse of average popularity)
  const obscurityScore = Math.round(100 - avgPopularity);

  // Genre distribution (from top artists)
  const topGenres = library.topGenres.slice(0, 5).map((genre, i) => ({
    genre,
    percentage: Math.round(100 / (i + 1)), // Approximate
  }));

  return {
    topGenres,
    topDecades,
    topArtists,
    energyProfile,
    diversityScore,
    obscurityScore,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  syncSpotifyLibrary,
  getSpotifyLibrary,
  getRandomPlayableTracks,
  hasEnoughPlayableContent,
  getChallengerTracks,
  getOurSongsPlaylist,
  addOurSong,
  syncOurSongsToSpotify,
  analyzeLibraryTaste,
};
