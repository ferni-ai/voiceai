/**
 * Spotify Integration Tools
 *
 * Allows Jack to play music, search tracks, and control playback.
 *
 * Requirements:
 * - SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env
 * - User must authenticate via OAuth (one-time)
 * - SPOTIFY_REFRESH_TOKEN after initial auth
 *
 * @see https://developer.spotify.com/documentation/web-api
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { getMusicPlayer, type MusicTrack } from '../audio/index.js';
import {
  getSpotifyAccessToken,
  isSpotifyConfigured,
  startAutoRefresh,
  stopAutoRefresh,
  getSpotifyTokenStatus,
  recordSpotifyError,
  logSpotifyDiagnostics,
  getSpotifyHealthStatus,
} from '../services/spotify-auth.js';
import { getMusicCommentary, hasArtistInfo } from './music-commentary.js';
import { getMusicReaction, shouldReactToMusic } from '../speech/music-reactions.js';

// Flag to control playback mode
let streamIntoCall = false; // If true, stream music INTO the call (phone users)

// API endpoints
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Web player device ID (set by frontend via ui-server)
let webPlayerDeviceId: string | null = null;

/**
 * Get the web player device ID from the shared file
 */
function getWebPlayerDeviceId(): string | null {
  try {
    const deviceFile = path.join(process.cwd(), '.spotify-device.json');
    if (fs.existsSync(deviceFile)) {
      const data = JSON.parse(fs.readFileSync(deviceFile, 'utf8'));
      return data.device_id || null;
    }
  } catch (error) {
    // File doesn't exist or can't be read - this is expected on first run
    getLogger().debug({ error }, 'Could not read Spotify device file');
  }
  return null;
}

/**
 * Get available Spotify devices (for phone users who have Spotify open)
 */
async function getAvailableDevices(): Promise<
  Array<{ id: string; name: string; type: string; is_active: boolean }>
> {
  try {
    const result = (await spotifyRequest('/me/player/devices')) as {
      devices: Array<{ id: string; name: string; type: string; is_active: boolean }>;
    };
    return result.devices || [];
  } catch (error) {
    getLogger().error({ error }, 'Failed to get Spotify devices');
    return [];
  }
}

// Check if user has Spotify Premium (required for Web Playback SDK)
let hasPremium: boolean | null = null;

async function checkPremiumStatus(): Promise<boolean> {
  if (hasPremium !== null) return hasPremium;

  try {
    const user = (await spotifyRequest('/me')) as { product?: string };
    hasPremium = user.product === 'premium';
    if (!hasPremium) {
      getLogger().info('Spotify account is not Premium - Web Playback SDK will not work');
    }
    return hasPremium;
  } catch {
    return false;
  }
}

/**
 * Find the best device to play on
 * Priority: 1. Web player (play where you're talking!), 2. Active device, 3. Any available device
 * Note: Web Playback SDK requires Spotify Premium!
 */
async function getBestPlaybackDevice(): Promise<{
  deviceId: string | null;
  deviceName: string | null;
  source: 'web' | 'active' | 'available' | 'none';
  otherDevices: Array<{ id: string; name: string }>;
}> {
  // Get available devices from Spotify
  const devices = await getAvailableDevices();

  // Collect other devices for "transfer" suggestions
  const otherDevices: Array<{ id: string; name: string }> = [];

  // PRIORITY 1: Web player - play where the user is talking from!
  // This gives immediate feedback that music is working
  const webDeviceId = getWebPlayerDeviceId();
  if (webDeviceId) {
    const isPremium = await checkPremiumStatus();
    if (isPremium) {
      // Collect other devices for transfer option
      devices.forEach((d) => {
        if (d.id !== webDeviceId) {
          otherDevices.push({ id: d.id, name: d.name });
        }
      });
      getLogger().info(
        { webDeviceId, otherDevicesCount: otherDevices.length },
        '🎵 Using web player (where user is talking)'
      );
      return { deviceId: webDeviceId, deviceName: 'Your browser', source: 'web', otherDevices };
    } else {
      getLogger().debug('Web player registered but account is not Premium - skipping');
    }
  }

  // PRIORITY 2: Active device (user's phone/computer)
  const activeDevice = devices.find((d) => d.is_active);
  if (activeDevice) {
    devices.forEach((d) => {
      if (d.id !== activeDevice.id) {
        otherDevices.push({ id: d.id, name: d.name });
      }
    });
    return {
      deviceId: activeDevice.id,
      deviceName: activeDevice.name,
      source: 'active',
      otherDevices,
    };
  }

  // PRIORITY 3: Any available device
  if (devices.length > 0) {
    const firstDevice = devices[0];
    devices.slice(1).forEach((d) => {
      otherDevices.push({ id: d.id, name: d.name });
    });
    return {
      deviceId: firstDevice.id,
      deviceName: firstDevice.name,
      source: 'available',
      otherDevices,
    };
  }

  return { deviceId: null, deviceName: null, source: 'none', otherDevices: [] };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Get a fresh access token (uses auto-refresh token manager)
 * @param forceRefresh - Force a token refresh even if current token is valid
 */
async function getAccessToken(forceRefresh = false): Promise<string | null> {
  getLogger().info({ forceRefresh }, '🎵 Getting Spotify access token...');

  // Use the new token manager that auto-refreshes
  const token = await getSpotifyAccessToken(forceRefresh);

  if (!token) {
    getLogger().error('🎵 ❌ Spotify token not available - run scripts/spotify-auth.js');
    return null;
  }

  getLogger().debug('🎵 ✅ Token obtained');
  return token;
}

/**
 * Sleep helper for retry delays
 */
const sleep = async (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Make an authenticated Spotify API request with retry logic
 * Retries up to 3 times with exponential backoff for transient failures
 */
async function spotifyRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: Record<string, unknown>,
  options?: { maxRetries?: number; forceRefresh?: boolean }
): Promise<unknown> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      getLogger().info({ endpoint, method, attempt, maxRetries }, '🎵 Spotify API request');

      // Force token refresh on retry after auth errors
      const token = await getAccessToken(options?.forceRefresh || attempt > 1);
      if (!token) {
        getLogger().error('🎵 ❌ No token for Spotify request');
        throw new Error('Spotify not authenticated');
      }

      const url = `${SPOTIFY_API_BASE}${endpoint}`;

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      // Success cases
      if (response.status === 204) {
        getLogger().info('🎵 ✅ Spotify API success (204 No Content)');
        return { success: true };
      }

      if (response.ok) {
        const data = await response.json();
        getLogger().debug(
          { dataKeys: Object.keys(data as object) },
          '🎵 Spotify API response data'
        );
        return data;
      }

      // Handle specific error cases
      const errorText = await response.text();

      // 401 Unauthorized - token expired, force refresh on next attempt
      if (response.status === 401) {
        getLogger().warn({ attempt }, '🎵 Token expired, will refresh and retry');
        lastError = new Error(`Token expired: ${errorText}`);
        // Force token refresh on next attempt
        options = { ...options, forceRefresh: true };
        continue;
      }

      // 429 Rate limited - wait and retry
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        getLogger().warn({ retryAfter, attempt }, '🎵 Rate limited, waiting...');
        await sleep(retryAfter * 1000);
        continue;
      }

      // 502/503/504 Server errors - exponential backoff
      if (response.status >= 500) {
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000); // 1s, 2s, 4s, max 8s
        getLogger().warn(
          { status: response.status, backoff, attempt },
          '🎵 Server error, backing off...'
        );
        await sleep(backoff);
        lastError = new Error(`Server error: ${response.status}`);
        continue;
      }

      // Other errors - don't retry (404, 400, etc.)
      getLogger().error(
        { status: response.status, error: errorText.slice(0, 200) },
        '🎵 ❌ Spotify API error'
      );
      throw new Error(`Spotify API error: ${response.status} - ${errorText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Network errors - retry with backoff
      if (lastError.message.includes('fetch') || lastError.message.includes('network')) {
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        getLogger().warn(
          { error: lastError.message, backoff, attempt },
          '🎵 Network error, retrying...'
        );
        await sleep(backoff);
        continue;
      }

      // Re-throw non-retryable errors
      if (
        !lastError.message.includes('Token expired') &&
        !lastError.message.includes('Server error')
      ) {
        throw lastError;
      }
    }
  }

  // All retries exhausted
  const errorMessage = lastError?.message || 'Spotify request failed after retries';
  getLogger().error({ attempts: maxRetries, error: errorMessage }, '🎵 ❌ All retries exhausted');
  recordSpotifyError(errorMessage);
  throw lastError || new Error(errorMessage);
}

// ============================================================================
// SPOTIFY FUNCTIONS
// ============================================================================

interface SpotifyTrack {
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string };
  uri: string;
  duration_ms: number;
}

interface SpotifySearchResult {
  tracks?: {
    items: SpotifyTrack[];
  };
}

interface SpotifyPlaybackState {
  is_playing: boolean;
  item?: SpotifyTrack;
  progress_ms?: number;
  device?: {
    name: string;
    type: string;
  };
}

/**
 * Search for tracks on Spotify
 */
async function searchTracks(query: string, limit = 5): Promise<string> {
  try {
    const result = (await spotifyRequest(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`
    )) as SpotifySearchResult;

    const tracks = result.tracks?.items || [];

    if (tracks.length === 0) {
      return `I couldn't find any songs matching "${query}". Try a different search?`;
    }

    const trackList = tracks
      .map((t, i) => `${i + 1}. "${t.name}" by ${t.artists.map((a) => a.name).join(', ')}`)
      .join('\n');

    return `Found these tracks:\n${trackList}\n\nWant me to play one?`;
  } catch (error) {
    getLogger().error({ error, query }, 'Spotify search error');
    return "I'm having trouble searching Spotify right now. Is your Spotify connected?";
  }
}

/**
 * Search for tracks and return those with preview URLs
 * Used for ambient music where we need streamable tracks
 */
export async function searchTracksWithPreviews(
  query: string,
  limit = 5
): Promise<
  Array<{
    name: string;
    artist: string;
    previewUrl: string;
    uri?: string;
    duration?: number;
  }>
> {
  try {
    const result = (await spotifyRequest(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit * 2}` // Fetch more to filter
    )) as SpotifySearchResult;

    const tracks = result.tracks?.items || [];

    // Filter to only tracks with preview URLs
    const tracksWithPreviews = tracks
      .filter((t: SpotifyTrack & { preview_url?: string }) => t.preview_url)
      .slice(0, limit)
      .map((t: SpotifyTrack & { preview_url?: string }) => ({
        name: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        previewUrl: t.preview_url!,
        uri: t.uri,
        duration: t.duration_ms,
      }));

    return tracksWithPreviews;
  } catch (error) {
    getLogger().debug({ error, query }, 'Spotify search for previews failed');
    return [];
  }
}

/**
 * Play a track, album, or playlist
 * Supports two modes:
 * 1. Spotify Connect - Control user's Spotify app/device
 * 2. Stream into call - Play 30-second preview directly into the call
 */
async function playMusic(query: string, streamIntoCallOverride?: boolean): Promise<string> {
  getLogger().info(
    {
      query,
      streamIntoCallOverride,
      globalStreamIntoCall: streamIntoCall,
      willStreamIntoCall: streamIntoCallOverride ?? streamIntoCall,
    },
    '🎵 ===== PLAY MUSIC CALLED ====='
  );
  const shouldStreamIntoCall = streamIntoCallOverride ?? streamIntoCall;

  try {
    getLogger().info(
      { shouldStreamIntoCall },
      `🎵 Mode: ${shouldStreamIntoCall ? 'STREAM INTO CALL' : 'SPOTIFY CONNECT'}`
    );
    // First search for the track
    const searchResult = (await spotifyRequest(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=1`
    )) as SpotifySearchResult;
    getLogger().debug(
      { result: searchResult.tracks?.items?.[0]?.name || 'no results' },
      'Spotify search result'
    );

    const track = searchResult.tracks?.items?.[0];

    if (!track) {
      return `Couldn't find "${query}" on Spotify. Try a different song?`;
    }

    const artists = track.artists.map((a) => a.name).join(', ');

    // MODE 1: Stream preview directly into the call
    if (shouldStreamIntoCall) {
      const previewUrl = (track as SpotifyTrack & { preview_url?: string }).preview_url;

      if (!previewUrl) {
        return `I found "${track.name}" by ${artists}, but it doesn't have a preview available. Want me to play it on your Spotify instead?`;
      }

      getLogger().info('Streaming preview into call...');
      const musicPlayer = getMusicPlayer();

      const musicTrack: MusicTrack = {
        name: track.name,
        artist: artists,
        uri: track.uri,
        previewUrl: previewUrl,
        duration: track.duration_ms,
      };

      const success = await musicPlayer.playFromUrl(previewUrl, musicTrack);

      if (success) {
        getLogger().info(
          { track: track.name, artists, mode: 'stream' },
          '🎵 Streaming track into call'
        );
        return `Here's a preview of "${track.name}" by ${artists}. I'll play it softly so we can still chat!`;
      } else {
        return `I had trouble streaming that. Let me try playing it on your Spotify instead.`;
      }
    }

    // MODE 2: Spotify Connect - Control user's device
    getLogger().info('🎵 Trying Spotify Connect mode...');
    const { deviceId, deviceName, source, otherDevices } = await getBestPlaybackDevice();
    getLogger().info(
      {
        deviceId: deviceId || 'NONE',
        deviceName: deviceName || 'none',
        source,
        otherDevicesCount: otherDevices.length,
      },
      '🎵 Best playback device'
    );

    if (!deviceId) {
      // No device available - try streaming preview instead
      const previewUrl = (track as SpotifyTrack & { preview_url?: string }).preview_url;

      if (previewUrl) {
        getLogger().info('No device - falling back to preview stream');
        const musicPlayer = getMusicPlayer();
        const musicTrack: MusicTrack = {
          name: track.name,
          artist: artists,
          uri: track.uri,
          previewUrl: previewUrl,
          duration: track.duration_ms,
        };

        const success = await musicPlayer.playFromUrl(previewUrl, musicTrack);
        if (success) {
          return `I'll play a preview of "${track.name}" by ${artists} right here in our call!`;
        }
      }

      // No device available - give helpful guidance
      const isPremium = await checkPremiumStatus();
      if (!isPremium) {
        return "I found the song! To play it, open your Spotify app on your phone or computer and start playing any song briefly. Then ask me again and I'll take over from there!";
      }
      return "I found the song but can't play it yet! If you're on a phone, open your Spotify app first. If you're on the web, refresh the page to connect the player.";
    }

    // Build the play endpoint with device_id
    const playEndpoint = `/me/player/play?device_id=${deviceId}`;
    getLogger().info({ deviceName }, 'Playing on device');

    // Play the track
    await spotifyRequest(playEndpoint, 'PUT', {
      uris: [track.uri],
    });

    getLogger().info(
      { track: track.name, artists, deviceId, deviceName, source },
      '🎵 Playing track'
    );

    // Natural intro reaction
    const intro = getMusicReaction('intro');

    // Build transfer suggestion if other devices are available
    let transferSuggestion = '';
    if (otherDevices.length > 0) {
      const deviceNames = otherDevices
        .slice(0, 2)
        .map((d) => d.name)
        .join(' or ');
      transferSuggestion = ` Want me to transfer it to ${deviceNames}?`;
    }

    // Get music commentary (stories, facts) if we know this artist - 50% chance
    const commentary = getMusicCommentary(track.name, artists);

    // Sometimes add a nostalgic moment instead of facts
    let extraReaction = '';
    if (commentary) {
      extraReaction = `\n\n${commentary}`;
    } else if (shouldReactToMusic()) {
      // Even if no facts, sometimes share a feeling about the music
      extraReaction = `\n\n${getMusicReaction('mood')}`;
    }

    // Customize response based on where it's playing
    if (source === 'web') {
      return `${intro}Now playing "${track.name}" by ${artists}.${transferSuggestion}${extraReaction}`;
    } else {
      return `${intro}Playing "${track.name}" by ${artists} on ${deviceName}.${transferSuggestion}${extraReaction}`;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    // Record the error for diagnostics
    recordSpotifyError(errorMsg);

    if (
      errorMsg.includes('NO_ACTIVE_DEVICE') ||
      errorMsg.includes('404') ||
      errorMsg.includes('DEVICE_NOT_FOUND')
    ) {
      return "I can't reach your Spotify right now. If you're on a phone, make sure Spotify is open. If you're on the web, try refreshing the page! I can also play music through iTunes if you prefer.";
    }

    if (errorMsg.includes('PREMIUM_REQUIRED')) {
      return 'Playing on Spotify requires Premium, but I can play 30-second previews through iTunes instead! Want me to try that?';
    }

    if (errorMsg.includes('Token expired') || errorMsg.includes('401')) {
      return 'My Spotify session expired. Let me refresh it... Try again in a moment!';
    }

    if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
      return 'Spotify is asking me to slow down. Let me try again in a few seconds, or I can play through iTunes!';
    }

    getLogger().error({ error, query }, 'Spotify play error');
    return "I'm having trouble with Spotify. Would you like me to play through iTunes instead?";
  }
}

/**
 * Enable/disable streaming music into the call
 */
export function setStreamIntoCall(enabled: boolean): void {
  streamIntoCall = enabled;
  getLogger().info({ enabled }, 'Stream into call mode updated');
}

/**
 * Pause playback
 * First checks if music is actually playing before trying to pause
 */
async function pauseMusic(): Promise<string> {
  try {
    // First check if anything is actually playing
    const state = (await spotifyRequest('/me/player')) as SpotifyPlaybackState | null;

    if (!state) {
      getLogger().info('No active Spotify session to pause');
      return 'No music is currently playing. Would you like me to play something?';
    }

    if (!state.is_playing) {
      getLogger().info('Spotify already paused');
      return 'Music is already paused. Would you like me to resume it or play something new?';
    }

    // Get device info for logging
    const deviceName = state.device?.name || 'unknown device';
    getLogger().info({ device: deviceName, track: state.item?.name }, 'Pausing Spotify');

    await spotifyRequest('/me/player/pause', 'PUT');

    const trackName = state.item?.name || 'the music';
    return `Paused "${trackName}". Let me know when you want to continue!`;
  } catch (error) {
    getLogger().error({ error }, 'Spotify pause error');
    // More specific error message
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('NO_ACTIVE_DEVICE') || errorMsg.includes('404')) {
      return "I don't see an active music player. Are you sure something was playing?";
    }
    return "Had some trouble pausing the music. Try saying 'stop' again?";
  }
}

/**
 * Resume playback
 */
async function resumeMusic(): Promise<string> {
  try {
    await spotifyRequest('/me/player/play', 'PUT');
    return 'Music resumed! 🎵';
  } catch (error) {
    getLogger().error({ error }, 'Spotify resume error');
    return "Couldn't resume playback. Try playing a specific song instead?";
  }
}

/**
 * Skip to next track
 */
async function skipTrack(): Promise<string> {
  try {
    await spotifyRequest('/me/player/next', 'POST');

    // Wait a moment then get what's playing
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    const state = (await spotifyRequest('/me/player')) as SpotifyPlaybackState;

    if (state?.item) {
      const artists = state.item.artists.map((a) => a.name).join(', ');
      return `Skipped! Now playing "${state.item.name}" by ${artists}`;
    }

    return 'Skipped to the next track!';
  } catch (error) {
    getLogger().error({ error }, 'Spotify skip error');
    return "Couldn't skip the track. Is something playing?";
  }
}

/**
 * Get current playback state
 */
async function getCurrentlyPlaying(): Promise<string> {
  try {
    const state = (await spotifyRequest('/me/player')) as SpotifyPlaybackState;

    if (!state || !state.item) {
      return 'Nothing is playing right now. Want me to put something on?';
    }

    const track = state.item;
    const artists = track.artists.map((a) => a.name).join(', ');
    const progress = Math.floor((state.progress_ms || 0) / 1000);
    const duration = Math.floor(track.duration_ms / 1000);
    const progressMin = Math.floor(progress / 60);
    const progressSec = progress % 60;
    const durationMin = Math.floor(duration / 60);
    const durationSec = duration % 60;

    const status = state.is_playing ? '▶️ Now playing' : '⏸️ Paused';

    // Get commentary about this artist/song
    const commentary = getMusicCommentary(track.name, artists);
    const commentaryText = commentary ? `\n\n${commentary}` : '';

    return `${status}: "${track.name}" by ${artists}\n${progressMin}:${progressSec.toString().padStart(2, '0')} / ${durationMin}:${durationSec.toString().padStart(2, '0')}${commentaryText}`;
  } catch (error) {
    getLogger().error({ error }, 'Spotify status error');
    return "I can't check Spotify right now. Is it connected?";
  }
}

/**
 * Set volume
 */
async function setVolume(volumePercent: number): Promise<string> {
  try {
    const volume = Math.max(0, Math.min(100, volumePercent));
    await spotifyRequest(`/me/player/volume?volume_percent=${volume}`, 'PUT');
    return `Volume set to ${volume}%`;
  } catch (error) {
    getLogger().error({ error }, 'Spotify volume error');
    return "Couldn't change the volume. Some devices don't support remote volume control.";
  }
}

// ============================================================================
// JACK'S MUSIC RECOMMENDATIONS
// ============================================================================

/**
 * Jack's personal music recommendations based on mood/situation
 *
 * Jack Bogle (1929-2019) grew up with Big Band, classical, and early jazz.
 * These suggestions reflect his era and tastes.
 */
function getJackMusicSuggestion(mood: string): string {
  const suggestions: Record<string, string[]> = {
    focus: [
      'Beethoven Symphony', // Jack loved Beethoven
      'Bach Cello Suites',
      'classical piano Mozart',
      'jazz instrumental Dave Brubeck',
      'Glenn Gould piano',
    ],
    relaxing: [
      'Frank Sinatra In The Wee Small Hours',
      'Nat King Cole Unforgettable',
      'Tony Bennett I Left My Heart',
      'smooth jazz Chet Baker',
      'classical guitar Segovia',
      'Ella Fitzgerald Cole Porter',
    ],
    energizing: [
      'Glenn Miller In The Mood',
      'Benny Goodman Sing Sing Sing',
      'Duke Ellington Take The A Train',
      'Count Basie swing',
      'Louis Armstrong What A Wonderful World',
      'big band swing',
    ],
    stressed: [
      'Debussy Clair de Lune',
      'calm classical Chopin Nocturnes',
      'Beethoven Moonlight Sonata',
      'peaceful piano classical',
      'baroque music relaxing',
    ],
    celebrating: [
      'Frank Sinatra New York New York',
      'Louis Armstrong What A Wonderful World',
      'Dean Martin Thats Amore',
      'Tony Bennett The Good Life',
      'Nat King Cole L-O-V-E',
      'swing celebration music',
    ],
    thinking: [
      'Beethoven Symphony No 9', // Jack's favorite
      'Mozart Piano Concerto',
      'Bach Well Tempered Clavier',
      'classical thinking music',
      'jazz Dave Brubeck Take Five',
    ],
    nostalgic: [
      'Big Band 1940s',
      'Andrews Sisters',
      'Bing Crosby',
      'Artie Shaw',
      'Tommy Dorsey',
      'Glenn Miller Orchestra',
    ],
  };

  // Find the best matching mood
  const moodLower = mood.toLowerCase();
  let moodKey = 'relaxing'; // default

  for (const key of Object.keys(suggestions)) {
    if (moodLower.includes(key)) {
      moodKey = key;
      break;
    }
  }

  // Also check for synonyms
  if (moodLower.includes('work') || moodLower.includes('concentrate')) moodKey = 'focus';
  if (moodLower.includes('calm') || moodLower.includes('chill') || moodLower.includes('unwind'))
    moodKey = 'relaxing';
  if (moodLower.includes('happy') || moodLower.includes('upbeat') || moodLower.includes('pump'))
    moodKey = 'energizing';
  if (moodLower.includes('anxious') || moodLower.includes('worried') || moodLower.includes('tense'))
    moodKey = 'stressed';
  if (
    moodLower.includes('party') ||
    moodLower.includes('celebrat') ||
    moodLower.includes('good news')
  )
    moodKey = 'celebrating';
  if (moodLower.includes('old') || moodLower.includes('memory') || moodLower.includes('remember'))
    moodKey = 'nostalgic';
  if (moodLower.includes('deep') || moodLower.includes('philosoph')) moodKey = 'thinking';

  const options = suggestions[moodKey];
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSpotifyTools() {
  // Check initial config state and start auto-refresh if available
  if (isSpotifyConfigured()) {
    startAutoRefresh();
    const status = getSpotifyTokenStatus();
    if (status.valid) {
      getLogger().info({ minutesRemaining: status.minutesRemaining }, 'Spotify token status');
    }
    // Log full diagnostics at startup
    logSpotifyDiagnostics();
  } else {
    getLogger().warn(
      '🎵 Spotify not configured at startup.\n' +
        '   To enable Spotify:\n' +
        '   1. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env\n' +
        '   2. Run: node scripts/spotify-auth.js\n' +
        '   3. Restart the agent'
    );
  }

  // Helper to check configuration dynamically (not just at startup)
  const checkConfigured = (): boolean => {
    const health = getSpotifyHealthStatus();
    if (!health.configured) {
      getLogger().debug(
        {
          hasClientId: health.hasClientId,
          hasClientSecret: health.hasClientSecret,
          hasRefreshToken: health.hasRefreshToken,
        },
        'Spotify not configured'
      );
    }
    return health.configured;
  };

  // Helper to build user-friendly error messages
  const buildErrorMessage = (context: string): string => {
    const health = getSpotifyHealthStatus();

    if (health.circuitBreakerOpen) {
      return "Spotify is temporarily unavailable. I'll try again in a minute. In the meantime, I can play music through iTunes instead!";
    }

    if (!health.hasClientId || !health.hasClientSecret) {
      return "Spotify isn't set up yet. Would you like me to play some music through iTunes instead?";
    }

    if (!health.hasRefreshToken) {
      return 'I need to reconnect to Spotify. Would you like me to play music through iTunes for now?';
    }

    if (!health.tokenValid) {
      return 'Let me refresh my Spotify connection... Try again in a moment, or I can play through iTunes!';
    }

    return `I'm having trouble with Spotify (${context}). Would you like me to try playing through iTunes instead?`;
  };

  return {
    playMusic: llm.tool({
      description: `Play music on Spotify. Use this tool when the user asks to:
- play a song, artist, or genre
- put on music
- hear something
Examples: "play jazz", "play Beethoven", "put on some music"`,
      parameters: z.object({
        query: z.string().describe('Song, artist, genre, or search query'),
      }),
      execute: async ({ query }) => {
        getLogger().info({ query }, 'TOOL: playMusic CALLED');
        if (!checkConfigured()) {
          return "Spotify isn't connected right now. Would you like to talk about something else?";
        }
        const result = await playMusic(query);
        getLogger().info({ result: result.slice(0, 100) }, 'TOOL: playMusic RESULT');
        return result;
      },
    }),

    searchMusic: llm.tool({
      description: `Search for songs on Spotify without playing them.
Use when user wants to find music or asks "what songs do you have by..."`,
      parameters: z.object({
        query: z.string().describe('Search query'),
        limit: z.number().optional().describe('Number of results (default 5)'),
      }),
      execute: async ({ query, limit }) => {
        if (!checkConfigured()) {
          return "Spotify isn't connected. I can't search right now.";
        }
        return searchTracks(query, limit || 5);
      },
    }),

    pauseMusic: llm.tool({
      description: `Pause/stop the currently playing music.
Use when user says ANY of these:
- "stop", "stop the music", "stop playing"
- "pause", "pause the music", "pause it"
- "quiet", "quiet please", "be quiet"
- "turn it off", "turn off the music"
- "enough", "that's enough", "no more music"
- "shh", "hush", "silence"`,
      parameters: z.object({}),
      execute: async () => {
        if (!checkConfigured()) return "Spotify isn't connected.";
        getLogger().info('TOOL: pauseMusic called');
        const result = await pauseMusic();
        getLogger().info({ result }, 'TOOL: pauseMusic result');
        return result;
      },
    }),

    resumeMusic: llm.tool({
      description: `Resume paused music.
Use when user says "play", "resume", "continue the music"`,
      parameters: z.object({}),
      execute: async () => {
        if (!checkConfigured()) return "Spotify isn't connected.";
        return resumeMusic();
      },
    }),

    skipSong: llm.tool({
      description: `Skip to the next song.
Use when user says "skip", "next song", "I don't like this one"`,
      parameters: z.object({}),
      execute: async () => {
        if (!checkConfigured()) return "Spotify isn't connected.";
        return skipTrack();
      },
    }),

    whatsPlaying: llm.tool({
      description: `Check what's currently playing on Spotify.
Use when user asks "what's playing", "what song is this", "who sings this"`,
      parameters: z.object({}),
      execute: async () => {
        if (!checkConfigured()) return "Spotify isn't connected.";
        return getCurrentlyPlaying();
      },
    }),

    setMusicVolume: llm.tool({
      description: `Adjust Spotify volume. 
Use when user says "turn it up", "louder", "quieter", "volume to 50%"`,
      parameters: z.object({
        volume: z.number().min(0).max(100).describe('Volume percentage (0-100)'),
      }),
      execute: async ({ volume }) => {
        if (!checkConfigured()) return "Spotify isn't connected.";
        return setVolume(volume);
      },
    }),

    suggestMusic: llm.tool({
      description: `Get Jack's music suggestion based on mood or activity.
Use when user says "put on some music" without specifics, or asks for recommendations.`,
      parameters: z.object({
        mood: z
          .string()
          .describe(
            'Current mood or activity (e.g., "focus", "relaxing", "energizing", "stressed", "celebrating")'
          ),
      }),
      execute: async ({ mood }) => {
        const suggestion = getJackMusicSuggestion(mood);

        if (!checkConfigured()) {
          return `For ${mood}, I'd recommend searching for "${suggestion}" on Spotify. Unfortunately, I can't play it directly right now.`;
        }

        // Actually play the suggestion
        const result = await playMusic(suggestion);
        return `For ${mood}? Let me put on something good... ${result}`;
      },
    }),

    tellMeAboutThisMusic: llm.tool({
      description: `Share a story, fact, or personal memory about the currently playing music.
Use when user asks:
- "tell me about this song/artist"
- "do you know anything about this?"
- "what's the story behind this?"
- Or proactively when Jack wants to share something interesting about the music`,
      parameters: z.object({}),
      execute: async () => {
        if (!checkConfigured()) return "Spotify isn't connected.";

        try {
          const state = (await spotifyRequest('/me/player')) as SpotifyPlaybackState;

          if (!state || !state.item) {
            return "Nothing is playing right now. Play something and I'll tell you about it!";
          }

          const track = state.item;
          const artists = track.artists.map((a) => a.name).join(', ');

          // Sometimes start with a physical reaction or appreciation
          const preface = shouldReactToMusic()
            ? `${getMusicReaction(Math.random() > 0.5 ? 'appreciation' : 'physical')}\n\n`
            : '';

          // Force get commentary (not random, always return something)
          const commentary = getMusicCommentary(track.name, artists);

          if (commentary) {
            return preface + commentary;
          }

          if (!hasArtistInfo(artists)) {
            const appreciation = getMusicReaction('appreciation');
            return `I don't have any stories about ${artists} in my memory, I'm afraid. ${appreciation}`;
          }

          return `Ah, ${artists}... I know them, but nothing specific is coming to mind right now. Good music though!`;
        } catch (error) {
          getLogger().error({ error }, 'Error getting music info');
          return "I'm having trouble checking what's playing right now.";
        }
      },
    }),

    // ========================================
    // IN-CALL MUSIC CONTROLS (Preview streaming)
    // ========================================

    playPreview: llm.tool({
      description: `Play a song preview DIRECTLY into the call (30 seconds). 
Use when user is on a phone call and wants to hear music through the call itself.
Great for: "play that in the call", "let me hear it", "play a sample"`,
      parameters: z.object({
        query: z.string().describe('Song name, artist, or search query'),
      }),
      execute: async ({ query }) => {
        if (!checkConfigured()) return "Spotify isn't connected for previews.";
        getLogger().info({ query }, 'Playing preview in call');
        return playMusic(query, true); // Force stream into call mode
      },
    }),

    pauseCallMusic: llm.tool({
      description: `Pause background music playing in the call.
Use when user says "pause the music", "stop playing", "quiet please"`,
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        musicPlayer.pause();
        return 'Music paused. Let me know when you want me to continue!';
      },
    }),

    resumeCallMusic: llm.tool({
      description: `Resume background music in the call (replays from start).
Use when user says "play the music again", "continue the song", "unpause"`,
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        const currentTrack = musicPlayer.getCurrentTrack();
        if (!currentTrack) {
          return 'No music was playing. Would you like me to play something?';
        }
        await musicPlayer.resume();
        return `Replaying "${currentTrack.name}" by ${currentTrack.artist}!`;
      },
    }),

    stopCallMusic: llm.tool({
      description: `Stop background music completely and move on to a new topic.
Use when user says:
- "stop", "stop the music", "turn it off", "no more music"
- "quit", "enough", "that's enough"
- Any indication they want the music to stop
After stopping, naturally transition to a new topic or ask what they'd like to talk about.`,
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        const wasPlaying = musicPlayer.getCurrentTrack();
        musicPlayer.stop();
        // Use natural transition
        const transition = getMusicReaction('transition');
        if (wasPlaying) {
          return `${transition} So... what else is on your mind? We could talk about your investments, the markets, or anything you'd like.`;
        }
        return 'Music stopped. What would you like to talk about?';
      },
    }),

    setCallMusicVolume: llm.tool({
      description: `Adjust the volume of background music in the call.
Use when user says "make it quieter", "turn up the background music"`,
      parameters: z.object({
        volume: z
          .number()
          .min(0)
          .max(100)
          .describe('Volume percentage (0-100). 20-30% is good for background.'),
      }),
      execute: async ({ volume }) => {
        const musicPlayer = getMusicPlayer();
        musicPlayer.setVolume(volume / 100);
        return `Background music volume set to ${volume}%`;
      },
    }),

    transferMusic: llm.tool({
      description: `Transfer currently playing music to another device (car, phone, speaker, etc).
Use when user says:
- "transfer to my car", "play it in my car"
- "move the music to my phone"
- "play on my speaker"
- "yes" or "sure" after you offered to transfer`,
      parameters: z.object({
        deviceName: z
          .string()
          .optional()
          .describe(
            'Target device name (e.g., "car", "phone", "speaker"). If empty, will list available devices.'
          ),
      }),
      execute: async ({ deviceName }) => {
        if (!checkConfigured()) return "Spotify isn't connected.";

        try {
          // Get available devices
          const devices = await getAvailableDevices();

          if (devices.length === 0) {
            return "I don't see any other Spotify devices available. Make sure Spotify is open on the device you want to use.";
          }

          // If no device specified, list options
          if (!deviceName) {
            const deviceList = devices.map((d) => d.name).join(', ');
            return `I can transfer to: ${deviceList}. Which one would you like?`;
          }

          // Find matching device (fuzzy match)
          const targetDevice = devices.find(
            (d) =>
              d.name.toLowerCase().includes(deviceName.toLowerCase()) ||
              deviceName.toLowerCase().includes(d.name.toLowerCase())
          );

          if (!targetDevice) {
            const deviceList = devices.map((d) => d.name).join(', ');
            return `I couldn't find "${deviceName}". Available devices are: ${deviceList}`;
          }

          // Transfer playback to the device
          await spotifyRequest('/me/player', 'PUT', {
            device_ids: [targetDevice.id],
            play: true,
          });

          getLogger().info(
            { targetDevice: targetDevice.name, deviceId: targetDevice.id },
            '🎵 Transferred music to device'
          );

          return `Done! Music is now playing on ${targetDevice.name}. Enjoy!`;
        } catch (error) {
          getLogger().error({ error }, '🎵 Transfer failed');
          return 'I had trouble transferring the music. Make sure the target device has Spotify open and try again.';
        }
      },
    }),

    getMusicStatus: llm.tool({
      description: `Check what music is currently playing.
Use when user asks "what's playing?", "what song is this?", "is music playing?"`,
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        const state = musicPlayer.getState();

        if (!state.isInitialized) {
          return "Music player isn't active right now.";
        }

        if (state.isPlaying && state.currentTrack) {
          const volumePercent = Math.round(state.volume * 100);
          const isDucked = state.isDucked ? ' (lowered while I talk)' : '';
          return `Playing "${state.currentTrack.name}" by ${state.currentTrack.artist} at ${volumePercent}% volume${isDucked}.`;
        }

        if (state.currentTrack) {
          return `"${state.currentTrack.name}" by ${state.currentTrack.artist} is paused.`;
        }

        return 'No music is playing. Would you like me to play something?';
      },
    }),

    // ========================================
    // DIAGNOSTICS TOOL (for debugging)
    // ========================================

    checkSpotifyHealth: llm.tool({
      description: `Check Spotify connection health. Use when:
- User reports music isn't working
- You need to diagnose Spotify issues
- User asks "is Spotify connected?", "why isn't music working?"`,
      parameters: z.object({}),
      execute: async () => {
        const health = getSpotifyHealthStatus();
        logSpotifyDiagnostics();

        const issues: string[] = [];
        const goodPoints: string[] = [];

        // Check configuration
        if (health.hasClientId && health.hasClientSecret) {
          goodPoints.push('Spotify credentials are configured');
        } else {
          issues.push('Spotify credentials are missing');
        }

        // Check tokens
        if (health.hasRefreshToken) {
          goodPoints.push('Refresh token is available');
        } else {
          issues.push('No refresh token - need to re-authenticate');
        }

        if (health.tokenValid) {
          goodPoints.push(
            `Access token is valid (${health.tokenMinutesRemaining} minutes remaining)`
          );
        } else if (health.hasRefreshToken) {
          issues.push('Access token expired - will auto-refresh');
        }

        // Check circuit breaker
        if (health.circuitBreakerOpen) {
          issues.push(`Circuit breaker is open after ${health.circuitBreakerFailures} failures`);
        }

        // Check last error
        if (health.lastError) {
          issues.push(`Last error: ${health.lastError}`);
        }

        // Build response
        let response = '';

        if (issues.length === 0) {
          response = '✅ Spotify is healthy!\n\n';
          response += 'Status:\n';
          response += goodPoints.map((p) => `• ${p}`).join('\n');
        } else {
          response = '⚠️ Spotify has some issues:\n\n';
          response += 'Problems:\n';
          response += issues.map((p) => `• ${p}`).join('\n');

          if (goodPoints.length > 0) {
            response += '\n\nWorking:\n';
            response += goodPoints.map((p) => `• ${p}`).join('\n');
          }

          // Add remediation steps
          response += '\n\nTo fix:\n';
          if (!health.hasClientId || !health.hasClientSecret) {
            response += '1. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env\n';
          }
          if (!health.hasRefreshToken) {
            response += '2. Run: node scripts/spotify-auth.js\n';
          }
          if (health.circuitBreakerOpen) {
            response += '3. Wait 1 minute for circuit breaker to reset, or restart the agent\n';
          }
        }

        return response;
      },
    }),
  };
}

/**
 * Stop Spotify auto-refresh (call on shutdown)
 */
export function shutdownSpotify(): void {
  stopAutoRefresh();
  webPlayerDeviceId = null;
  streamIntoCall = false; // Reset for next session
  hasPremium = null; // Reset premium status cache
  getLogger().info('Spotify services shut down');
}

export default createSpotifyTools;
