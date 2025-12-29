/**
 * Sonos Smart Home Integration
 *
 * Controls Sonos speakers for vibe and music playback.
 * Uses Sonos Cloud API (OAuth 2.0) for control.
 *
 * Setup: https://developer.sonos.com/
 * 1. Create app at developer.sonos.com
 * 2. Get OAuth credentials
 * 3. User authorizes via our OAuth flow
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'sonos-service' });

// ============================================================================
// TYPES
// ============================================================================

export interface SonosCredentials {
  accessToken: string;
  refreshToken: string;
  tokenExpiry?: number;
  householdId?: string;
}

export interface SonosHousehold {
  id: string;
  name: string;
}

export interface SonosGroup {
  id: string;
  name: string;
  playbackState: 'playing' | 'paused' | 'idle';
  volume: number;
  muted: boolean;
  coordinatorId: string;
}

export interface SonosPlayer {
  id: string;
  name: string;
  icon: string;
  websocketUrl: string;
  softwareVersion: string;
  capabilities: string[];
}

export interface SonosTrack {
  name: string;
  artist?: string;
  album?: string;
  imageUrl?: string;
  service?: string;
}

// ============================================================================
// SONOS API CLIENT
// ============================================================================

const SONOS_API_BASE = 'https://api.ws.sonos.com/control/api/v1';

/**
 * Make authenticated request to Sonos API
 */
async function sonosRequest<T>(
  credentials: SonosCredentials,
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T> {
  const url = `${SONOS_API_BASE}${endpoint}`;

  log.debug({ endpoint, method }, 'Sonos API request');

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error({ status: response.status, error: errorText, endpoint }, 'Sonos API error');
    throw new Error(`Sonos API error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// HOUSEHOLD & DISCOVERY
// ============================================================================

/**
 * Get all households (homes) the user has access to
 */
export async function getHouseholds(credentials: SonosCredentials): Promise<SonosHousehold[]> {
  interface HouseholdsResponse {
    households: SonosHousehold[];
  }

  const response = await sonosRequest<HouseholdsResponse>(credentials, '/households');
  return response.households;
}

/**
 * Get all player groups in a household
 */
export async function getGroups(credentials: SonosCredentials, householdId: string): Promise<SonosGroup[]> {
  interface GroupsResponse {
    groups: Array<{
      id: string;
      name: string;
      playbackState: string;
      coordinatorId: string;
      playerIds: string[];
    }>;
    players: SonosPlayer[];
  }

  const response = await sonosRequest<GroupsResponse>(credentials, `/households/${householdId}/groups`);

  // Get volume for each group
  const groupsWithVolume: SonosGroup[] = await Promise.all(
    response.groups.map(async (group) => {
      try {
        const volume = await getGroupVolume(credentials, group.id);
        return {
          id: group.id,
          name: group.name,
          playbackState: group.playbackState as SonosGroup['playbackState'],
          volume: volume.volume,
          muted: volume.muted,
          coordinatorId: group.coordinatorId,
        };
      } catch {
        return {
          id: group.id,
          name: group.name,
          playbackState: group.playbackState as SonosGroup['playbackState'],
          volume: 50,
          muted: false,
          coordinatorId: group.coordinatorId,
        };
      }
    })
  );

  return groupsWithVolume;
}

/**
 * Get all players in a household
 */
export async function getPlayers(credentials: SonosCredentials, householdId: string): Promise<SonosPlayer[]> {
  interface GroupsResponse {
    players: SonosPlayer[];
  }

  const response = await sonosRequest<GroupsResponse>(credentials, `/households/${householdId}/groups`);
  return response.players;
}

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================

/**
 * Play/pause a group
 */
export async function setPlaybackState(
  credentials: SonosCredentials,
  groupId: string,
  action: 'play' | 'pause' | 'togglePlayPause'
): Promise<void> {
  await sonosRequest(credentials, `/groups/${groupId}/playback/${action}`, 'POST');
  log.info({ groupId, action }, 'Set Sonos playback state');
}

/**
 * Skip to next track
 */
export async function skipToNext(credentials: SonosCredentials, groupId: string): Promise<void> {
  await sonosRequest(credentials, `/groups/${groupId}/playback/skipToNextTrack`, 'POST');
}

/**
 * Skip to previous track
 */
export async function skipToPrevious(credentials: SonosCredentials, groupId: string): Promise<void> {
  await sonosRequest(credentials, `/groups/${groupId}/playback/skipToPreviousTrack`, 'POST');
}

/**
 * Get current playback status
 */
export async function getPlaybackStatus(credentials: SonosCredentials, groupId: string): Promise<{
  playbackState: string;
  positionMillis: number;
  playModes: {
    repeat: boolean;
    repeatOne: boolean;
    shuffle: boolean;
    crossfade: boolean;
  };
}> {
  return sonosRequest(credentials, `/groups/${groupId}/playback`);
}

/**
 * Get current track info
 */
export async function getCurrentTrack(credentials: SonosCredentials, groupId: string): Promise<SonosTrack | null> {
  interface MetadataResponse {
    currentItem?: {
      track?: {
        name: string;
        artist?: { name: string };
        album?: { name: string };
        imageUrl?: string;
        service?: { name: string };
      };
    };
  }

  try {
    const response = await sonosRequest<MetadataResponse>(credentials, `/groups/${groupId}/playbackMetadata`);
    
    if (!response.currentItem?.track) return null;
    
    const track = response.currentItem.track;
    return {
      name: track.name,
      artist: track.artist?.name,
      album: track.album?.name,
      imageUrl: track.imageUrl,
      service: track.service?.name,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// VOLUME CONTROL
// ============================================================================

/**
 * Get group volume
 */
export async function getGroupVolume(credentials: SonosCredentials, groupId: string): Promise<{
  volume: number;
  muted: boolean;
  fixed: boolean;
}> {
  return sonosRequest(credentials, `/groups/${groupId}/groupVolume`);
}

/**
 * Set group volume (0-100)
 */
export async function setGroupVolume(credentials: SonosCredentials, groupId: string, volume: number): Promise<void> {
  const clampedVolume = Math.max(0, Math.min(100, Math.round(volume)));
  await sonosRequest(credentials, `/groups/${groupId}/groupVolume`, 'POST', { volume: clampedVolume });
  log.info({ groupId, volume: clampedVolume }, 'Set Sonos volume');
}

/**
 * Set group mute state
 */
export async function setGroupMute(credentials: SonosCredentials, groupId: string, muted: boolean): Promise<void> {
  await sonosRequest(credentials, `/groups/${groupId}/groupVolume/mute`, 'POST', { muted });
  log.info({ groupId, muted }, 'Set Sonos mute');
}

/**
 * Adjust volume relative (positive to increase, negative to decrease)
 */
export async function adjustVolume(credentials: SonosCredentials, groupId: string, delta: number): Promise<void> {
  await sonosRequest(credentials, `/groups/${groupId}/groupVolume/relative`, 'POST', { volumeDelta: delta });
}

// ============================================================================
// FAVORITES & PLAYLISTS
// ============================================================================

/**
 * Get user's Sonos favorites
 */
export async function getFavorites(credentials: SonosCredentials, householdId: string): Promise<Array<{
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  service?: string;
}>> {
  interface FavoritesResponse {
    items: Array<{
      id: string;
      name: string;
      description?: string;
      imageUrl?: string;
      service?: { name: string };
    }>;
  }

  const response = await sonosRequest<FavoritesResponse>(credentials, `/households/${householdId}/favorites`);
  
  return response.items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    service: item.service?.name,
  }));
}

/**
 * Play a favorite
 */
export async function playFavorite(credentials: SonosCredentials, groupId: string, favoriteId: string): Promise<void> {
  await sonosRequest(credentials, `/groups/${groupId}/favorites`, 'POST', {
    favoriteId,
    playOnCompletion: true,
  });
  log.info({ groupId, favoriteId }, 'Playing Sonos favorite');
}

// ============================================================================
// VIBE INTEGRATION
// ============================================================================

/**
 * Set volume across all groups for a vibe
 */
export async function setAllGroupsVolume(credentials: SonosCredentials, volume: number): Promise<void> {
  const households = await getHouseholds(credentials);
  
  for (const household of households) {
    const groups = await getGroups(credentials, household.id);
    
    await Promise.all(
      groups.map((group) => setGroupVolume(credentials, group.id, volume))
    );
  }

  log.info({ volume, householdCount: households.length }, 'Set volume on all Sonos groups');
}

/**
 * Find and play a vibe-appropriate playlist/favorite
 */
export async function playVibeMusic(
  credentials: SonosCredentials,
  vibe: string,
  targetRoom?: string
): Promise<boolean> {
  const vibeKeywords: Record<string, string[]> = {
    relax: ['chill', 'calm', 'ambient', 'peaceful', 'spa', 'meditation'],
    focus: ['focus', 'study', 'concentration', 'work', 'instrumental', 'classical'],
    energy: ['energy', 'workout', 'pump', 'motivation', 'upbeat'],
    party: ['party', 'dance', 'fun', 'celebration', 'hits'],
    sleep: ['sleep', 'night', 'lullaby', 'white noise', 'rain'],
    romance: ['romantic', 'love', 'jazz', 'smooth'],
    movie: ['cinematic', 'soundtracks', 'epic'],
  };

  const keywords = vibeKeywords[vibe.toLowerCase()] || [vibe];

  const households = await getHouseholds(credentials);
  
  for (const household of households) {
    const favorites = await getFavorites(credentials, household.id);
    const groups = await getGroups(credentials, household.id);

    // Find matching favorite
    const matchingFavorite = favorites.find((fav) =>
      keywords.some((keyword) =>
        fav.name.toLowerCase().includes(keyword) ||
        (fav.description?.toLowerCase().includes(keyword) ?? false)
      )
    );

    // Find target group (by room name or first available)
    let targetGroup = groups[0];
    if (targetRoom) {
      const roomMatch = groups.find((g) =>
        g.name.toLowerCase().includes(targetRoom.toLowerCase())
      );
      if (roomMatch) targetGroup = roomMatch;
    }

    if (matchingFavorite && targetGroup) {
      await playFavorite(credentials, targetGroup.id, matchingFavorite.id);
      return true;
    }
  }

  log.warn({ vibe, targetRoom }, 'No matching Sonos favorite found for vibe');
  return false;
}

// ============================================================================
// OAuth HELPERS
// ============================================================================

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'playback-control-all',
    state,
  });

  return `https://api.sonos.com/login/v3/oauth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch('https://api.sonos.com/login/v3/oauth/access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch('https://api.sonos.com/login/v3/oauth/access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ============================================================================
// CONNECTION TEST
// ============================================================================

/**
 * Test Sonos connection
 */
export async function testConnection(credentials: SonosCredentials): Promise<{
  connected: boolean;
  households: number;
  players: number;
  error?: string;
}> {
  try {
    const households = await getHouseholds(credentials);
    
    let totalPlayers = 0;
    for (const household of households) {
      const players = await getPlayers(credentials, household.id);
      totalPlayers += players.length;
    }

    return {
      connected: true,
      households: households.length,
      players: totalPlayers,
    };
  } catch (error) {
    return {
      connected: false,
      households: 0,
      players: 0,
      error: String(error),
    };
  }
}
