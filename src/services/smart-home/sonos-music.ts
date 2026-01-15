/**
 * Sonos Music Search & Playback Service
 *
 * Provides music search and playback capabilities for Sonos speakers.
 * Uses the Sonos Cloud API to:
 * - Search through user's connected music services (Spotify, Apple Music, etc.)
 * - Play music on specific rooms/groups
 * - Play from Sonos favorites
 *
 * Features:
 * - Automatic token refresh on 401 errors
 * - Credential persistence after refresh
 * - Circuit breaker integration
 *
 * @see https://developer.sonos.com/reference/control-api/
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  type SonosCredentials,
  type SonosGroup,
  type SonosTrack,
  getFavorites,
  getGroups,
  getHouseholds,
  playFavorite,
  setPlaybackState,
  setGroupVolume,
  getCurrentTrack,
  setTokenRefreshCallback,
  getSonosCircuitBreakerStatus,
  SonosApiError,
} from './sonos.js';
import { saveCredential } from './user-credentials.js';

const log = createLogger({ module: 'sonos-music' });

// ============================================================================
// TOKEN REFRESH INTEGRATION
// ============================================================================

// Map of userId to pending refresh operations (to avoid duplicate saves)
const pendingRefreshes = new Map<string, Promise<void>>();

/**
 * Create a token refresh callback for a specific user
 * This ensures refreshed tokens get persisted to Firestore
 */
export function createTokenRefreshHandler(userId: string): void {
  setTokenRefreshCallback(async (newCredentials: SonosCredentials) => {
    // Avoid duplicate saves
    if (pendingRefreshes.has(userId)) {
      log.debug({ userId }, 'Token refresh already pending, skipping duplicate save');
      return;
    }

    const savePromise = (async () => {
      try {
        const success = await saveCredential(userId, 'sonos', newCredentials);
        if (success) {
          log.info({ userId }, '✅ Sonos credentials updated after token refresh');
        } else {
          log.warn({ userId }, '⚠️ Failed to persist refreshed Sonos credentials');
        }
      } catch (error) {
        log.error({ error, userId }, 'Error saving refreshed Sonos credentials');
      } finally {
        pendingRefreshes.delete(userId);
      }
    })();

    pendingRefreshes.set(userId, savePromise);
    await savePromise;
  });
}

/**
 * Check if Sonos service is available (circuit breaker status)
 */
export function isSonosAvailable(): boolean {
  const status = getSonosCircuitBreakerStatus();
  return !status.isOpen;
}

// ============================================================================
// TYPES
// ============================================================================

export interface SonosMusicService {
  name: string;
  imageUrl?: string;
  id: string;
}

export interface SonosSearchResult {
  id: string;
  name: string;
  artist?: string;
  album?: string;
  imageUrl?: string;
  type: 'track' | 'album' | 'playlist' | 'station';
  serviceId: string;
  serviceName: string;
}

export interface SonosPlayResult {
  success: boolean;
  message: string;
  room?: string;
  track?: {
    name: string;
    artist?: string;
  };
}

export interface SonosRoomConfig {
  groupId: string;
  groupName: string;
  householdId: string;
}

// ============================================================================
// ROOM MANAGEMENT
// ============================================================================

// Cache for user's last used room
const lastUsedRoomCache = new Map<string, SonosRoomConfig>();

/**
 * Get the user's last used room
 */
export function getLastUsedRoom(userId: string): SonosRoomConfig | undefined {
  return lastUsedRoomCache.get(userId);
}

/**
 * Set the user's last used room
 */
export function setLastUsedRoom(userId: string, room: SonosRoomConfig): void {
  lastUsedRoomCache.set(userId, room);
  log.debug({ userId, room: room.groupName }, '🔊 Set last used Sonos room');
}

/**
 * Match a room name from natural language to available Sonos groups
 * Uses fuzzy matching for flexibility
 */
export function matchRoomName(query: string, groups: SonosGroup[]): SonosGroup | null {
  const normalizedQuery = query.toLowerCase().trim();

  // Common room name aliases
  const aliases: Record<string, string[]> = {
    'living room': ['living', 'lounge', 'main room', 'front room', 'family room'],
    'bedroom': ['bed', 'master', 'master bedroom'],
    'kitchen': ['kitchen', 'cooking'],
    'office': ['office', 'study', 'work', 'desk'],
    'bathroom': ['bath', 'bathroom', 'shower'],
    'dining room': ['dining', 'dinner'],
    'patio': ['patio', 'deck', 'outdoor', 'backyard', 'garden'],
    'basement': ['basement', 'downstairs', 'rec room'],
  };

  // First, try exact match
  const exactMatch = groups.find(
    (g) => g.name.toLowerCase() === normalizedQuery
  );
  if (exactMatch) return exactMatch;

  // Try substring match
  const substringMatch = groups.find(
    (g) =>
      g.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(g.name.toLowerCase())
  );
  if (substringMatch) return substringMatch;

  // Try alias matching
  for (const [canonical, aliasList] of Object.entries(aliases)) {
    if (
      normalizedQuery.includes(canonical) ||
      aliasList.some((a) => normalizedQuery.includes(a))
    ) {
      // Find a group that matches any alias
      const aliasMatch = groups.find((g) => {
        const groupLower = g.name.toLowerCase();
        return (
          groupLower.includes(canonical) ||
          aliasList.some((a) => groupLower.includes(a))
        );
      });
      if (aliasMatch) return aliasMatch;
    }
  }

  // No match found
  return null;
}

/**
 * Get all available rooms/groups for a user
 */
export async function getAvailableRooms(
  credentials: SonosCredentials
): Promise<SonosRoomConfig[]> {
  try {
    const households = await getHouseholds(credentials);
    const rooms: SonosRoomConfig[] = [];

    for (const household of households) {
      const groups = await getGroups(credentials, household.id);
      for (const group of groups) {
        rooms.push({
          groupId: group.id,
          groupName: group.name,
          householdId: household.id,
        });
      }
    }

    return rooms;
  } catch (error) {
    log.error({ error }, '🔊 Failed to get available Sonos rooms');
    return [];
  }
}

// ============================================================================
// FAVORITES PLAYBACK
// ============================================================================

/**
 * Search user's Sonos favorites by name
 */
export async function searchFavorites(
  credentials: SonosCredentials,
  query: string
): Promise<Array<{ id: string; name: string; imageUrl?: string }>> {
  try {
    const households = await getHouseholds(credentials);
    const allFavorites: Array<{ id: string; name: string; imageUrl?: string }> = [];

    for (const household of households) {
      const favorites = await getFavorites(credentials, household.id);
      const matches = favorites.filter(
        (f) =>
          f.name.toLowerCase().includes(query.toLowerCase()) ||
          query.toLowerCase().includes(f.name.toLowerCase())
      );
      allFavorites.push(...matches);
    }

    return allFavorites;
  } catch (error) {
    log.error({ error, query }, '🔊 Failed to search Sonos favorites');
    return [];
  }
}

/**
 * Play a Sonos favorite on a specific room
 */
export async function playSonosFavorite(
  credentials: SonosCredentials,
  userId: string,
  favoriteName: string,
  roomName?: string
): Promise<SonosPlayResult> {
  // Register token refresh callback
  createTokenRefreshHandler(userId);

  // Check circuit breaker
  if (!isSonosAvailable()) {
    return {
      success: false,
      message: 'Sonos is temporarily unavailable. Try again in a moment.',
    };
  }

  try {
    const households = await getHouseholds(credentials);

    for (const household of households) {
      const favorites = await getFavorites(credentials, household.id);
      const groups = await getGroups(credentials, household.id);

      // Find matching favorite
      const favorite = favorites.find(
        (f) =>
          f.name.toLowerCase().includes(favoriteName.toLowerCase()) ||
          favoriteName.toLowerCase().includes(f.name.toLowerCase())
      );

      if (!favorite) continue;

      // Find target room
      let targetGroup: SonosGroup | null = null;

      if (roomName) {
        targetGroup = matchRoomName(roomName, groups);
      } else {
        // Use last used room or first available
        const lastRoom = getLastUsedRoom(userId);
        if (lastRoom) {
          targetGroup = groups.find((g) => g.id === lastRoom.groupId) || null;
        }
        if (!targetGroup && groups.length > 0) {
          targetGroup = groups[0];
        }
      }

      if (!targetGroup) {
        return {
          success: false,
          message: `Couldn't find a Sonos room${roomName ? ` matching "${roomName}"` : ''}. Available rooms: ${groups.map((g) => g.name).join(', ')}`,
        };
      }

      // Play the favorite
      await playFavorite(credentials, targetGroup.id, favorite.id);

      // Remember this room for next time
      setLastUsedRoom(userId, {
        groupId: targetGroup.id,
        groupName: targetGroup.name,
        householdId: household.id,
      });

      log.info(
        { favorite: favorite.name, room: targetGroup.name },
        '🔊 Playing Sonos favorite'
      );

      return {
        success: true,
        message: `Playing "${favorite.name}" on ${targetGroup.name}`,
        room: targetGroup.name,
        track: { name: favorite.name },
      };
    }

    return {
      success: false,
      message: `Couldn't find a favorite matching "${favoriteName}". Try saying the exact name?`,
    };
  } catch (error) {
    log.error({ error, favoriteName }, '🔊 Failed to play Sonos favorite');

    // Provide specific error messages
    if (error instanceof SonosApiError) {
      if (error.statusCode === 401) {
        return {
          success: false,
          message: 'Your Sonos connection needs to be refreshed. Try reconnecting in settings?',
        };
      }
      if (error.statusCode === 503) {
        return {
          success: false,
          message: 'Sonos is temporarily unavailable. Try again in a moment.',
        };
      }
    }

    return {
      success: false,
      message: `Had trouble playing that favorite. Is your Sonos connected?`,
    };
  }
}

// ============================================================================
// MUSIC SEARCH & PLAYBACK (via connected services)
// ============================================================================

/**
 * Play music by searching through user's connected music services
 * This is the main entry point for "Play jazz on living room Sonos"
 *
 * Features:
 * - Automatic token refresh on 401 errors
 * - Circuit breaker for graceful degradation
 * - Vibe matching when exact favorites not found
 */
export async function playSonosMusic(
  credentials: SonosCredentials,
  userId: string,
  query: string,
  roomName?: string
): Promise<SonosPlayResult> {
  // Register token refresh callback for this user
  createTokenRefreshHandler(userId);

  // Check circuit breaker
  if (!isSonosAvailable()) {
    log.warn({ userId }, '🔌 Sonos circuit breaker open, service temporarily unavailable');
    return {
      success: false,
      message: "Sonos is temporarily unavailable. I'll try again in a moment.",
    };
  }

  try {
    const households = await getHouseholds(credentials);

    if (households.length === 0) {
      return {
        success: false,
        message: "I don't see any Sonos systems connected. Have you set up Sonos in the app?",
      };
    }

    for (const household of households) {
      const groups = await getGroups(credentials, household.id);

      if (groups.length === 0) continue;

      // Find target room
      let targetGroup: SonosGroup | null = null;

      if (roomName) {
        targetGroup = matchRoomName(roomName, groups);
        if (!targetGroup) {
          return {
            success: false,
            message: `Couldn't find "${roomName}". Available rooms: ${groups.map((g) => g.name).join(', ')}`,
          };
        }
      } else {
        // Use last used room or first available
        const lastRoom = getLastUsedRoom(userId);
        if (lastRoom) {
          targetGroup = groups.find((g) => g.id === lastRoom.groupId) || null;
        }
        if (!targetGroup && groups.length > 0) {
          targetGroup = groups[0];
        }
      }

      if (!targetGroup) {
        return {
          success: false,
          message: "Couldn't find a Sonos room to play on.",
        };
      }

      // Use smart search to find matching favorites
      const favorites = await getFavorites(credentials, household.id);
      const smartMatches = findSmartMatchingFavorites(query, favorites);

      log.debug(
        {
          query,
          matchCount: smartMatches.length,
          topMatch: smartMatches[0]?.name,
          topScore: smartMatches[0]?.score,
        },
        '🔊 Smart search results'
      );

      // Play the best match if we found one with decent confidence
      if (smartMatches.length > 0 && smartMatches[0].score >= 10) {
        const bestMatch = smartMatches[0];
        await playFavorite(credentials, targetGroup.id, bestMatch.id);

        // Remember this room
        setLastUsedRoom(userId, {
          groupId: targetGroup.id,
          groupName: targetGroup.name,
          householdId: household.id,
        });

        log.info(
          { favorite: bestMatch.name, room: targetGroup.name, query, score: bestMatch.score },
          '🔊 Playing smart-matched Sonos favorite'
        );

        // Customize message based on match quality
        const isExactMatch = bestMatch.score >= 50;
        const message = isExactMatch
          ? `Playing "${bestMatch.name}" on ${targetGroup.name}`
          : `Playing "${bestMatch.name}" on ${targetGroup.name} - seemed like a good match for "${query}"`;

        return {
          success: true,
          message,
          room: targetGroup.name,
          track: { name: bestMatch.name },
        };
      }

      // No good match - provide helpful suggestions
      const suggestions = getSuggestions(query, favorites);
      const suggestionText = suggestions.length > 0
        ? `Try asking for: ${suggestions.join(', ')}`
        : 'Try adding some favorites in the Sonos app!';

      return {
        success: false,
        message: `Couldn't find music matching "${query}" in your Sonos favorites. ${suggestionText}`,
      };
    }

    return {
      success: false,
      message: "Couldn't play music on Sonos right now. Is it connected?",
    };
  } catch (error) {
    log.error({ error, query, roomName }, '🔊 Failed to play music on Sonos');

    // Provide specific error messages based on error type
    if (error instanceof SonosApiError) {
      if (error.statusCode === 401) {
        return {
          success: false,
          message: "Your Sonos connection needs to be refreshed. Try reconnecting in settings?",
        };
      }
      if (error.statusCode === 503) {
        return {
          success: false,
          message: "Sonos is temporarily unavailable. I'll try again in a moment.",
        };
      }
    }

    return {
      success: false,
      message: `Had trouble playing "${query}" on Sonos. Check your connection and try again?`,
    };
  }
}

// ============================================================================
// SMART MUSIC SEARCH
// ============================================================================

/**
 * Extended vibe/mood/genre mapping for smart matching
 */
const MUSIC_VOCABULARY: Record<string, string[]> = {
  // Genres
  jazz: ['jazz', 'smooth jazz', 'bebop', 'blue note', 'coltrane', 'miles davis', 'swing', 'bossa nova'],
  chill: ['chill', 'relax', 'ambient', 'calm', 'peaceful', 'spa', 'lounge', 'downtempo', 'chillout'],
  rock: ['rock', 'classic rock', 'alternative', 'indie', 'hard rock', 'punk', 'grunge'],
  pop: ['pop', 'hits', 'top 40', 'chart', 'billboard', 'radio hits', 'mainstream'],
  classical: ['classical', 'orchestra', 'symphony', 'piano', 'beethoven', 'mozart', 'bach', 'chopin'],
  focus: ['focus', 'study', 'concentration', 'work', 'instrumental', 'deep work', 'productivity'],
  party: ['party', 'dance', 'edm', 'club', 'upbeat', 'house', 'techno', 'disco'],
  workout: ['workout', 'gym', 'running', 'energy', 'pump', 'fitness', 'exercise', 'cardio'],
  sleep: ['sleep', 'night', 'lullaby', 'dreamscape', 'bedtime', 'white noise', 'rain sounds'],
  morning: ['morning', 'wake', 'sunrise', 'coffee', 'start your day', 'good morning'],
  country: ['country', 'nashville', 'western', 'bluegrass', 'honky tonk'],
  hiphop: ['hip hop', 'hip-hop', 'rap', 'r&b', 'rnb', 'urban'],
  electronic: ['electronic', 'edm', 'synth', 'trance', 'dubstep'],
  folk: ['folk', 'acoustic', 'singer-songwriter', 'indie folk'],
  blues: ['blues', 'soul', 'motown', 'rhythm and blues'],
  latin: ['latin', 'salsa', 'reggaeton', 'bachata', 'cumbia'],
  metal: ['metal', 'heavy metal', 'thrash', 'death metal', 'metalcore'],

  // Moods
  happy: ['happy', 'uplifting', 'feel good', 'positive', 'joyful', 'cheerful'],
  sad: ['sad', 'melancholy', 'heartbreak', 'emotional', 'crying'],
  romantic: ['romantic', 'love', 'love songs', 'wedding', 'date night'],
  angry: ['angry', 'aggressive', 'intense', 'rage'],
  peaceful: ['peaceful', 'serene', 'tranquil', 'meditation', 'zen', 'mindfulness'],

  // Activities
  cooking: ['cooking', 'kitchen', 'dinner', 'dinner party'],
  reading: ['reading', 'book', 'quiet', 'background'],
  driving: ['driving', 'road trip', 'car', 'travel'],
  gaming: ['gaming', 'video game', 'epic', 'soundtrack'],

  // Times
  evening: ['evening', 'sunset', 'night time', 'after dark'],
  afternoon: ['afternoon', 'midday', 'lunch'],

  // Decades
  '80s': ['80s', '1980s', 'eighties', 'retro'],
  '90s': ['90s', '1990s', 'nineties'],
  '2000s': ['2000s', 'y2k', 'millennium'],
};

/**
 * Extract potential artist names from query
 * Uses common patterns like "play [artist]" or "[song] by [artist]"
 */
function extractArtistFromQuery(query: string): string | null {
  const normalizedQuery = query.toLowerCase();

  // Pattern: "by [artist]"
  const byMatch = normalizedQuery.match(/by\s+([^,]+?)(?:\s+on\s+|\s*$)/i);
  if (byMatch) return byMatch[1].trim();

  // Pattern: "play [artist]" when artist is a known name
  // (This is handled by the vocabulary matching below)
  return null;
}

/**
 * Score a favorite against a query using multiple matching strategies
 */
function scoreFavorite(
  favorite: { id: string; name: string; description?: string; service?: string },
  query: string
): number {
  const queryLower = query.toLowerCase();
  const favLower = (favorite.name + ' ' + (favorite.description || '')).toLowerCase();
  let score = 0;

  // 1. Exact name match (highest priority)
  if (favLower === queryLower || favorite.name.toLowerCase() === queryLower) {
    score += 100;
  }

  // 2. Partial name match
  if (favLower.includes(queryLower) || queryLower.includes(favLower)) {
    score += 50;
  }

  // 3. Word overlap (for multi-word queries)
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);
  const favWords = favLower.split(/\s+/).filter((w) => w.length > 2);
  const wordOverlap = queryWords.filter((qw) =>
    favWords.some((fw) => fw.includes(qw) || qw.includes(fw))
  ).length;
  score += wordOverlap * 10;

  // 4. Vocabulary/vibe matching
  for (const [, keywords] of Object.entries(MUSIC_VOCABULARY)) {
    const queryMatchesVibe = keywords.some((k) => queryLower.includes(k));
    const favMatchesVibe = keywords.some((k) => favLower.includes(k));

    if (queryMatchesVibe && favMatchesVibe) {
      score += 15;
    }
  }

  // 5. Artist extraction match
  const extractedArtist = extractArtistFromQuery(query);
  if (extractedArtist && favLower.includes(extractedArtist.toLowerCase())) {
    score += 40;
  }

  return score;
}

/**
 * Find favorites that match a query using smart scoring
 * Returns favorites sorted by relevance
 */
function findSmartMatchingFavorites(
  query: string,
  favorites: Array<{ id: string; name: string; description?: string; service?: string }>
): Array<{ id: string; name: string; description?: string; service?: string; score: number }> {
  // Score all favorites
  const scoredFavorites = favorites.map((f) => ({
    ...f,
    score: scoreFavorite(f, query),
  }));

  // Return favorites with any matches, sorted by score
  return scoredFavorites.filter((f) => f.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * Find favorites that match a vibe/mood query (legacy function for backward compatibility)
 */
function findVibeMatchingFavorites(
  query: string,
  favorites: Array<{ id: string; name: string; description?: string }>
): Array<{ id: string; name: string; description?: string; score: number }> {
  return findSmartMatchingFavorites(query, favorites);
}

/**
 * Get suggestions when no matches found
 */
function getSuggestions(
  query: string,
  favorites: Array<{ id: string; name: string; description?: string }>
): string[] {
  const queryLower = query.toLowerCase();

  // Find vibes that match the query
  const matchedVibes: string[] = [];
  for (const [vibe, keywords] of Object.entries(MUSIC_VOCABULARY)) {
    if (keywords.some((k) => queryLower.includes(k))) {
      matchedVibes.push(vibe);
    }
  }

  // Find favorites that might be similar
  const suggestions: string[] = [];

  if (matchedVibes.length > 0) {
    // Find favorites that match any of the matched vibes
    for (const fav of favorites) {
      const favLower = fav.name.toLowerCase();
      for (const vibe of matchedVibes) {
        const keywords = MUSIC_VOCABULARY[vibe] || [];
        if (keywords.some((k) => favLower.includes(k))) {
          if (!suggestions.includes(fav.name)) {
            suggestions.push(fav.name);
          }
        }
      }
      if (suggestions.length >= 3) break;
    }
  }

  // If still no suggestions, return first 3 favorites
  if (suggestions.length === 0) {
    return favorites.slice(0, 3).map((f) => f.name);
  }

  return suggestions.slice(0, 3);
}

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================

/**
 * Pause playback on a Sonos room
 */
export async function pauseSonos(
  credentials: SonosCredentials,
  userId: string,
  roomName?: string
): Promise<SonosPlayResult> {
  try {
    const room = await resolveRoom(credentials, userId, roomName);
    if (!room.success) return room;

    await setPlaybackState(credentials, room.groupId!, 'pause');

    return {
      success: true,
      message: `Paused music on ${room.room}`,
      room: room.room,
    };
  } catch (error) {
    log.error({ error }, '🔊 Failed to pause Sonos');
    return {
      success: false,
      message: 'Had trouble pausing Sonos.',
    };
  }
}

/**
 * Resume playback on a Sonos room
 */
export async function resumeSonos(
  credentials: SonosCredentials,
  userId: string,
  roomName?: string
): Promise<SonosPlayResult> {
  try {
    const room = await resolveRoom(credentials, userId, roomName);
    if (!room.success) return room;

    await setPlaybackState(credentials, room.groupId!, 'play');

    return {
      success: true,
      message: `Resumed music on ${room.room}`,
      room: room.room,
    };
  } catch (error) {
    log.error({ error }, '🔊 Failed to resume Sonos');
    return {
      success: false,
      message: 'Had trouble resuming Sonos.',
    };
  }
}

/**
 * Set volume on a Sonos room
 */
export async function setSonosVolume(
  credentials: SonosCredentials,
  userId: string,
  volume: number,
  roomName?: string
): Promise<SonosPlayResult> {
  try {
    const room = await resolveRoom(credentials, userId, roomName);
    if (!room.success) return room;

    await setGroupVolume(credentials, room.groupId!, volume);

    return {
      success: true,
      message: `Set volume to ${volume}% on ${room.room}`,
      room: room.room,
    };
  } catch (error) {
    log.error({ error }, '🔊 Failed to set Sonos volume');
    return {
      success: false,
      message: 'Had trouble changing the volume.',
    };
  }
}

/**
 * Get what's currently playing on Sonos
 */
export async function getSonosNowPlaying(
  credentials: SonosCredentials,
  userId: string,
  roomName?: string
): Promise<SonosPlayResult> {
  try {
    const room = await resolveRoom(credentials, userId, roomName);
    if (!room.success) return room;

    const track = await getCurrentTrack(credentials, room.groupId!);

    if (!track) {
      return {
        success: true,
        message: `Nothing is playing on ${room.room} right now.`,
        room: room.room,
      };
    }

    const trackInfo = track.artist
      ? `"${track.name}" by ${track.artist}`
      : `"${track.name}"`;

    return {
      success: true,
      message: `Playing ${trackInfo} on ${room.room}`,
      room: room.room,
      track: {
        name: track.name,
        artist: track.artist,
      },
    };
  } catch (error) {
    log.error({ error }, '🔊 Failed to get Sonos now playing');
    return {
      success: false,
      message: 'Had trouble checking what\'s playing.',
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

interface RoomResolution extends SonosPlayResult {
  groupId?: string;
}

/**
 * Helper to resolve a room from name or cache
 * Also sets up token refresh handler and checks circuit breaker
 */
async function resolveRoom(
  credentials: SonosCredentials,
  userId: string,
  roomName?: string
): Promise<RoomResolution> {
  // Register token refresh callback
  createTokenRefreshHandler(userId);

  // Check circuit breaker
  if (!isSonosAvailable()) {
    return {
      success: false,
      message: 'Sonos is temporarily unavailable. Try again in a moment.',
    };
  }

  try {
    const households = await getHouseholds(credentials);

    for (const household of households) {
      const groups = await getGroups(credentials, household.id);

      let targetGroup: SonosGroup | null = null;

      if (roomName) {
        targetGroup = matchRoomName(roomName, groups);
      } else {
        const lastRoom = getLastUsedRoom(userId);
        if (lastRoom) {
          targetGroup = groups.find((g) => g.id === lastRoom.groupId) || null;
        }
        if (!targetGroup && groups.length > 0) {
          targetGroup = groups[0];
        }
      }

      if (targetGroup) {
        return {
          success: true,
          message: '',
          room: targetGroup.name,
          groupId: targetGroup.id,
        };
      }
    }

    return {
      success: false,
      message: roomName
        ? `Couldn't find a room matching "${roomName}".`
        : 'No Sonos rooms found.',
    };
  } catch (error) {
    // Provide specific error messages
    if (error instanceof SonosApiError) {
      if (error.statusCode === 401) {
        return {
          success: false,
          message: 'Your Sonos connection needs to be refreshed. Try reconnecting in settings?',
        };
      }
    }
    return {
      success: false,
      message: 'Had trouble connecting to Sonos.',
    };
  }
}
