/**
 * 🍎 Apple Music Library Integration
 *
 * Deep integration with user's Apple Music library via MusicKit API.
 * Enables richer Musical DNA by accessing actual listening behavior:
 * - Recently played tracks
 * - Heavy Rotation (most played - includes PLAY COUNTS!)
 * - Library songs and playlists
 *
 * Key advantage over Spotify: Apple Music provides play counts,
 * which gives much more accurate preference data.
 *
 * @module AppleMusic
 */

import crypto from 'crypto';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  AppleMusicLibraryData,
  AppleMusicTrack,
  AppleMusicArtist,
  AppleMusicTasteAnalysis,
} from './types.js';

const log = createLogger({ module: 'AppleMusic' });

// ============================================================================
// CONSTANTS
// ============================================================================

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';
const MAX_LIBRARY_TRACKS = 500; // Limit for performance

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const libraryCache = new Map<string, AppleMusicLibraryData>();

// ============================================================================
// JWT HELPERS
// ============================================================================

/**
 * Base64URL encode (no padding)
 */
function base64urlEncode(data: Buffer | string): string {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buffer.toString('base64url');
}

// ============================================================================
// DEVELOPER TOKEN GENERATION
// ============================================================================

/**
 * Generate Apple Music Developer Token (JWT)
 *
 * Required env vars:
 * - APPLE_MUSIC_TEAM_ID
 * - APPLE_MUSIC_KEY_ID
 * - APPLE_MUSIC_PRIVATE_KEY (contents of .p8 file)
 */
export async function generateDeveloperToken(): Promise<string | null> {
  try {
    const teamId = process.env.APPLE_MUSIC_TEAM_ID;
    const keyId = process.env.APPLE_MUSIC_KEY_ID;
    const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;

    if (!teamId || !keyId || !privateKey) {
      log.warn('Apple Music credentials not configured');
      return null;
    }

    // JWT header
    const header = {
      alg: 'ES256',
      kid: keyId,
    };

    // JWT payload - Apple Music tokens can be valid up to 6 months
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: teamId,
      iat: now,
      exp: now + 15777000, // ~6 months
    };

    // Encode header and payload
    const headerEncoded = base64urlEncode(JSON.stringify(header));
    const payloadEncoded = base64urlEncode(JSON.stringify(payload));
    const signingInput = `${headerEncoded}.${payloadEncoded}`;

    // Sign with ES256 (ECDSA P-256 with SHA-256)
    const sign = crypto.createSign('SHA256');
    sign.update(signingInput);
    sign.end();

    // Apple's private key is in PEM format
    const signature = sign.sign(
      {
        key: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines from env
        dsaEncoding: 'ieee-p1363', // Required for JWT ES256 format
      },
      'base64url'
    );

    const jwt = `${signingInput}.${signature}`;

    log.debug('Generated Apple Music developer token');
    return jwt;
  } catch (error) {
    log.error({ error }, 'Failed to generate Apple Music developer token');
    return null;
  }
}

// ============================================================================
// API HELPERS
// ============================================================================

interface AppleMusicRequestOptions {
  method?: string;
  body?: unknown;
}

/**
 * Make authenticated request to Apple Music API
 */
async function appleMusicRequest<T>(
  endpoint: string,
  developerToken: string,
  userToken: string,
  options: AppleMusicRequestOptions = {}
): Promise<T | null> {
  try {
    const response = await fetch(`${APPLE_MUSIC_API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${developerToken}`,
        'Music-User-Token': userToken,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      log.warn({ status: response.status, endpoint }, '⚠️ Apple Music API request failed');
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    log.error({ error, endpoint }, '❌ Apple Music API request error');
    return null;
  }
}

// ============================================================================
// TRACK CONVERSION
// ============================================================================

interface AppleMusicAttributes {
  name?: string;
  artistName?: string;
  albumName?: string;
  artwork?: { url: string };
  durationInMillis?: number;
  releaseDate?: string;
  genreNames?: string[];
  playParams?: { id: string };
}

interface AppleMusicMeta {
  playCount?: number;
  lastPlayedDate?: string;
  dateAdded?: string;
}

interface AppleMusicSongResource {
  id: string;
  attributes?: AppleMusicAttributes;
  meta?: AppleMusicMeta;
}

function convertAppleMusicTrack(song: AppleMusicSongResource): AppleMusicTrack {
  const attrs: AppleMusicAttributes = song.attributes || {};
  const meta: AppleMusicMeta = song.meta || {};

  // Parse release year from date string (e.g., "2024-01-15")
  let releaseYear = new Date().getFullYear();
  if (attrs.releaseDate) {
    const parsed = parseInt(attrs.releaseDate.slice(0, 4), 10);
    if (!isNaN(parsed)) releaseYear = parsed;
  }

  // Convert artwork URL template to actual URL
  let albumArt = '';
  if (attrs.artwork?.url) {
    albumArt = attrs.artwork.url.replace('{w}', '300').replace('{h}', '300');
  }

  return {
    id: song.id,
    name: attrs.name || 'Unknown',
    artistName: attrs.artistName || 'Unknown Artist',
    albumName: attrs.albumName || 'Unknown Album',
    albumArt,
    durationMs: attrs.durationInMillis || 0,
    releaseYear,
    releaseDate: attrs.releaseDate,
    genres: attrs.genreNames || [],
    playCount: meta.playCount,
    lastPlayedAt: meta.lastPlayedDate ? new Date(meta.lastPlayedDate) : undefined,
    dateAdded: meta.dateAdded ? new Date(meta.dateAdded) : undefined,
  };
}

// ============================================================================
// LIBRARY SYNC
// ============================================================================

interface LibrarySongsResponse {
  data: AppleMusicSongResource[];
  next?: string;
  meta?: { total: number };
}

interface RecentlyPlayedResponse {
  data: AppleMusicSongResource[];
}

interface HeavyRotationResponse {
  data: Array<{
    id: string;
    type: string;
    attributes?: {
      name?: string;
      artistName?: string;
      playParams?: { id: string };
    };
  }>;
}

/**
 * Sync user's Apple Music library
 * Fetches library songs, recently played, and heavy rotation
 */
export async function syncAppleMusicLibrary(
  userId: string,
  developerToken: string,
  userToken: string
): Promise<AppleMusicLibraryData | null> {
  log.info({ userId }, '🍎 Syncing Apple Music library...');

  try {
    // Get library songs
    const allTracks: AppleMusicTrack[] = [];
    let nextUrl: string | null = '/me/library/songs?limit=100';

    while (nextUrl && allTracks.length < MAX_LIBRARY_TRACKS) {
      const response: LibrarySongsResponse | null = await appleMusicRequest<LibrarySongsResponse>(
        nextUrl,
        developerToken,
        userToken
      );

      if (!response) break;

      const tracks = response.data.map(convertAppleMusicTrack);
      allTracks.push(...tracks);

      nextUrl = response.next || null;
    }

    // Get recently played (last 25 tracks)
    const recentResponse = await appleMusicRequest<RecentlyPlayedResponse>(
      '/me/recent/played/tracks?limit=25',
      developerToken,
      userToken
    );
    const recentlyPlayed = recentResponse?.data.map(convertAppleMusicTrack) || [];

    // Get heavy rotation (most played)
    const heavyResponse = await appleMusicRequest<HeavyRotationResponse>(
      '/me/history/heavy-rotation?limit=25',
      developerToken,
      userToken
    );

    // Heavy rotation returns different resource types, need to fetch details
    const heavyRotation: AppleMusicTrack[] = [];
    if (heavyResponse?.data) {
      for (const item of heavyResponse.data) {
        if (item.type === 'songs' || item.type === 'library-songs') {
          // Fetch full track details
          const trackResponse = await appleMusicRequest<{ data: AppleMusicSongResource[] }>(
            `/me/library/songs/${item.id}`,
            developerToken,
            userToken
          );
          if (trackResponse?.data?.[0]) {
            heavyRotation.push(convertAppleMusicTrack(trackResponse.data[0]));
          }
        }
      }
    }

    // Analyze genres and decades
    const genreCounts = new Map<string, number>();
    const decadeCounts = new Map<string, number>();
    const artistCounts = new Map<string, { name: string; count: number }>();

    for (const track of allTracks) {
      // Count genres
      for (const genre of track.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      }

      // Count decades
      const decade = `${Math.floor(track.releaseYear / 10) * 10}s`;
      decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);

      // Count artists
      const existing = artistCounts.get(track.artistName);
      if (existing) {
        existing.count++;
      } else {
        artistCounts.set(track.artistName, { name: track.artistName, count: 1 });
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

    const topArtists: AppleMusicArtist[] = [...artistCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([id, data]) => ({
        id,
        name: data.name,
        genres: [], // Would need additional API call
      }));

    const libraryData: AppleMusicLibraryData = {
      userId,
      appleMusicUserId: userId, // Apple doesn't expose user ID like Spotify
      connected: true,
      lastSyncedAt: new Date(),

      libraryTrackCount: allTracks.length,
      playlistCount: 0, // Would need additional API call

      topArtists,
      topGenres,
      topDecades,

      libraryTracks: allTracks,
      recentlyPlayed,
      heavyRotation,
    };

    // Cache the data
    libraryCache.set(userId, libraryData);

    log.info(
      {
        userId,
        totalTracks: allTracks.length,
        recentlyPlayed: recentlyPlayed.length,
        heavyRotation: heavyRotation.length,
        topGenres: topGenres.slice(0, 3),
      },
      '✅ Apple Music library synced'
    );

    return libraryData;
  } catch (error) {
    log.error({ error, userId }, '❌ Failed to sync Apple Music library');
    return null;
  }
}

/**
 * Get cached library data or sync if needed
 */
export async function getAppleMusicLibrary(
  userId: string,
  developerToken?: string,
  userToken?: string
): Promise<AppleMusicLibraryData | null> {
  const cached = libraryCache.get(userId);

  // Return cached if fresh (less than 1 hour old)
  if (cached && cached.lastSyncedAt) {
    const age = Date.now() - cached.lastSyncedAt.getTime();
    if (age < 60 * 60 * 1000) {
      return cached;
    }
  }

  // Need to sync
  if (developerToken && userToken) {
    return syncAppleMusicLibrary(userId, developerToken, userToken);
  }

  return cached || null;
}

/**
 * Check if Apple Music is connected for user
 */
export function isAppleMusicConnected(userId: string): boolean {
  const cached = libraryCache.get(userId);
  return cached?.connected === true;
}

// ============================================================================
// TASTE ANALYSIS
// ============================================================================

/**
 * Analyze user's musical taste from Apple Music data
 * Uses play counts for much more accurate preferences than Spotify!
 */
export function analyzeAppleMusicTaste(
  library: AppleMusicLibraryData
): AppleMusicTasteAnalysis | null {
  if (!library || library.libraryTracks.length === 0) return null;

  const tracks = library.libraryTracks;
  const heavyRotation = library.heavyRotation;

  // Use heavy rotation for weighted analysis (has play counts)
  const genrePlayCounts = new Map<string, number>();
  const decadePlayCounts = new Map<string, number>();
  const artistPlayCounts = new Map<string, number>();

  let totalPlayCount = 0;
  let tracksWithPlayCount = 0;

  for (const track of heavyRotation) {
    const playCount = track.playCount || 1;
    totalPlayCount += playCount;
    tracksWithPlayCount++;

    // Genres weighted by plays
    for (const genre of track.genres) {
      genrePlayCounts.set(genre, (genrePlayCounts.get(genre) || 0) + playCount);
    }

    // Decades weighted by plays
    const decade = `${Math.floor(track.releaseYear / 10) * 10}s`;
    decadePlayCounts.set(decade, (decadePlayCounts.get(decade) || 0) + playCount);

    // Artists weighted by plays
    artistPlayCounts.set(
      track.artistName,
      (artistPlayCounts.get(track.artistName) || 0) + playCount
    );
  }

  // Fall back to library if no heavy rotation data
  if (totalPlayCount === 0) {
    for (const track of tracks) {
      for (const genre of track.genres) {
        genrePlayCounts.set(genre, (genrePlayCounts.get(genre) || 0) + 1);
      }
      const decade = `${Math.floor(track.releaseYear / 10) * 10}s`;
      decadePlayCounts.set(decade, (decadePlayCounts.get(decade) || 0) + 1);
      artistPlayCounts.set(track.artistName, (artistPlayCounts.get(track.artistName) || 0) + 1);
    }
    totalPlayCount = tracks.length;
  }

  // Calculate percentages and sort
  const topGenres = [...genrePlayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre, playCount]) => ({
      genre,
      playCount,
      percentage: Math.round((playCount / totalPlayCount) * 100),
    }));

  const topDecades = [...decadePlayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([decade, playCount]) => ({
      decade,
      playCount,
      percentage: Math.round((playCount / totalPlayCount) * 100),
    }));

  const topArtists = [...artistPlayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, playCount]) => ({ name, playCount }));

  // Calculate listening style
  const avgPlaysPerTrack = tracksWithPlayCount > 0 ? totalPlayCount / tracksWithPlayCount : 0;
  let listeningStyle: 'deep-diver' | 'variety-seeker' | 'balanced';
  if (avgPlaysPerTrack > 10) {
    listeningStyle = 'deep-diver'; // Replays favorites a lot
  } else if (avgPlaysPerTrack < 3) {
    listeningStyle = 'variety-seeker'; // Listens to many different songs
  } else {
    listeningStyle = 'balanced';
  }

  // Estimate repeat vs discover ratio
  const recentIds = new Set(library.recentlyPlayed.map((t) => t.id));
  const heavyIds = new Set(heavyRotation.map((t) => t.id));
  const overlapCount = [...recentIds].filter((id) => heavyIds.has(id)).length;
  const repeatVsDiscoverRatio = recentIds.size > 0 ? overlapCount / recentIds.size : 0.5;

  // Estimate total listening time (rough: plays * avg 3.5 min)
  const avgDurationMs = tracks.reduce((sum, t) => sum + t.durationMs, 0) / tracks.length || 210000;
  const estimatedListeningMinutes = Math.round((totalPlayCount * avgDurationMs) / 60000);

  return {
    topGenres,
    topDecades,
    topArtists,
    listeningStyle,
    repeatVsDiscoverRatio,
    avgPlaysPerTrack,
    estimatedListeningMinutes,
  };
}

// ============================================================================
// GAME HELPERS
// ============================================================================

/**
 * Get tracks from user's library for games
 * Note: Apple Music doesn't provide preview URLs, so we need to
 * cross-reference with iTunes Search API for playable tracks
 */
export function getAppleMusicTracksForGames(userId: string, count = 10): AppleMusicTrack[] {
  const library = libraryCache.get(userId);
  if (!library) return [];

  // Shuffle and return
  const shuffled = [...library.libraryTracks].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get tracks from heavy rotation (most familiar to user)
 * Great for easier game rounds
 */
export function getHeavyRotationTracks(userId: string, count = 5): AppleMusicTrack[] {
  const library = libraryCache.get(userId);
  if (!library) return [];

  return library.heavyRotation.slice(0, count);
}

/**
 * Get recently played tracks
 * Good for "what were you just listening to" features
 */
export function getRecentlyPlayedTracks(userId: string, count = 10): AppleMusicTrack[] {
  const library = libraryCache.get(userId);
  if (!library) return [];

  return library.recentlyPlayed.slice(0, count);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateDeveloperToken,
  syncAppleMusicLibrary,
  getAppleMusicLibrary,
  isAppleMusicConnected,
  analyzeAppleMusicTaste,
  getAppleMusicTracksForGames,
  getHeavyRotationTracks,
  getRecentlyPlayedTracks,
};
