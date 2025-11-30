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
import { z } from 'zod';

const getLogger = () => log();

import * as fs from 'fs';
import * as path from 'path';

// Spotify API credentials
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN || '';

// API endpoints
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Cache access token
let accessToken: string | null = null;
let tokenExpiry: number = 0;

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
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Get available Spotify devices (for phone users who have Spotify open)
 */
async function getAvailableDevices(): Promise<Array<{ id: string; name: string; type: string; is_active: boolean }>> {
  try {
    const result = await spotifyRequest('/me/player/devices') as { devices: Array<{ id: string; name: string; type: string; is_active: boolean }> };
    return result.devices || [];
  } catch (error) {
    getLogger().error({ error }, 'Failed to get Spotify devices');
    return [];
  }
}

/**
 * Find the best device to play on
 * Priority: 1. Web player, 2. Active device, 3. Any available device
 */
async function getBestPlaybackDevice(): Promise<{ deviceId: string | null; deviceName: string | null; source: 'web' | 'active' | 'available' | 'none' }> {
  // First, check for web player
  const webDeviceId = getWebPlayerDeviceId();
  if (webDeviceId) {
    return { deviceId: webDeviceId, deviceName: 'Jack Bogle AI (Browser)', source: 'web' };
  }
  
  // No web player - check for other devices (phone users)
  const devices = await getAvailableDevices();
  
  if (devices.length === 0) {
    return { deviceId: null, deviceName: null, source: 'none' };
  }
  
  // Prefer active device
  const activeDevice = devices.find(d => d.is_active);
  if (activeDevice) {
    return { deviceId: activeDevice.id, deviceName: activeDevice.name, source: 'active' };
  }
  
  // Use first available device
  const firstDevice = devices[0];
  return { deviceId: firstDevice.id, deviceName: firstDevice.name, source: 'available' };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Get a fresh access token using the refresh token
 */
async function getAccessToken(): Promise<string | null> {
  console.log('🎵 [SPOTIFY] Getting access token...');
  
  // Return cached token if still valid
  if (accessToken && Date.now() < tokenExpiry - 60000) {
    console.log('🎵 [SPOTIFY] Using cached token');
    return accessToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    console.log('❌ [SPOTIFY] Missing credentials!');
    getLogger().warn('Spotify credentials not configured');
    return null;
  }
  
  console.log('🎵 [SPOTIFY] Refreshing token...');

  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: SPOTIFY_REFRESH_TOKEN,
      }),
    });

    if (!response.ok) {
      getLogger().error({ status: response.status }, 'Spotify token refresh failed');
      return null;
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    
    getLogger().info('Spotify access token refreshed');
    return accessToken;
  } catch (error) {
    getLogger().error({ error }, 'Spotify auth error');
    return null;
  }
}

/**
 * Make an authenticated Spotify API request
 */
async function spotifyRequest(
  endpoint: string, 
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: Record<string, unknown>
): Promise<unknown> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Spotify not authenticated');
  }

  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return { success: true };
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify API error: ${response.status} - ${error}`);
  }

  return response.json();
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
async function searchTracks(query: string, limit: number = 5): Promise<string> {
  try {
    const result = await spotifyRequest(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`
    ) as SpotifySearchResult;

    const tracks = result.tracks?.items || [];
    
    if (tracks.length === 0) {
      return `I couldn't find any songs matching "${query}". Try a different search?`;
    }

    const trackList = tracks.map((t, i) => 
      `${i + 1}. "${t.name}" by ${t.artists.map(a => a.name).join(', ')}`
    ).join('\n');

    return `Found these tracks:\n${trackList}\n\nWant me to play one?`;
  } catch (error) {
    getLogger().error({ error, query }, 'Spotify search error');
    return "I'm having trouble searching Spotify right now. Is your Spotify connected?";
  }
}

/**
 * Play a track, album, or playlist
 */
async function playMusic(query: string): Promise<string> {
  console.log(`\n🎵 [SPOTIFY] playMusic called with: "${query}"`);
  
  try {
    console.log('🎵 [SPOTIFY] Searching for track...');
    // First search for the track
    const searchResult = await spotifyRequest(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=1`
    ) as SpotifySearchResult;
    console.log('🎵 [SPOTIFY] Search result:', searchResult.tracks?.items?.[0]?.name || 'no results');

    const track = searchResult.tracks?.items?.[0];
    
    if (!track) {
      return `Couldn't find "${query}" on Spotify. Try a different song?`;
    }

    // Find the best device to play on (web player OR phone/other device)
    const { deviceId, deviceName, source } = await getBestPlaybackDevice();
    console.log(`🎵 [SPOTIFY] Best device: ${deviceName || 'none'} (source: ${source})`);
    
    if (!deviceId) {
      // No device available - give helpful guidance
      return "I found the song but can't play it yet! If you're on a phone, open your Spotify app first - I can control it remotely. If you're on the web, just refresh the page to connect the player.";
    }
    
    // Build the play endpoint with device_id
    const playEndpoint = `/me/player/play?device_id=${deviceId}`;
    console.log('🎵 [SPOTIFY] Playing on:', deviceName);

    // Play the track
    await spotifyRequest(playEndpoint, 'PUT', {
      uris: [track.uri],
    });

    const artists = track.artists.map(a => a.name).join(', ');
    getLogger().info({ track: track.name, artists, deviceId, deviceName, source }, '🎵 Playing track');
    
    // Customize response based on where it's playing
    if (source === 'web') {
      return `Now playing "${track.name}" by ${artists} in your browser. Enjoy!`;
    } else {
      return `Now playing "${track.name}" by ${artists} on your ${deviceName}. Enjoy!`;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMsg.includes('NO_ACTIVE_DEVICE') || errorMsg.includes('404') || errorMsg.includes('DEVICE_NOT_FOUND')) {
      return "I can't reach your Spotify right now. If you're on a phone, make sure Spotify is open. If you're on the web, try refreshing the page!";
    }
    
    if (errorMsg.includes('PREMIUM_REQUIRED')) {
      return "Playing music requires Spotify Premium, I'm afraid. But I can recommend some great songs if you'd like!";
    }
    
    getLogger().error({ error, query }, 'Spotify play error');
    return "I'm having trouble playing that. Let me know if you want to try a different song!";
  }
}

/**
 * Pause playback
 */
async function pauseMusic(): Promise<string> {
  try {
    await spotifyRequest('/me/player/pause', 'PUT');
    return "Music paused. Let me know when you want to continue!";
  } catch (error) {
    getLogger().error({ error }, 'Spotify pause error');
    return "Couldn't pause the music. Is Spotify playing?";
  }
}

/**
 * Resume playback
 */
async function resumeMusic(): Promise<string> {
  try {
    await spotifyRequest('/me/player/play', 'PUT');
    return "Music resumed! 🎵";
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
    await new Promise(resolve => setTimeout(resolve, 500));
    const state = await spotifyRequest('/me/player') as SpotifyPlaybackState;
    
    if (state?.item) {
      const artists = state.item.artists.map(a => a.name).join(', ');
      return `Skipped! Now playing "${state.item.name}" by ${artists}`;
    }
    
    return "Skipped to the next track!";
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
    const state = await spotifyRequest('/me/player') as SpotifyPlaybackState;
    
    if (!state || !state.item) {
      return "Nothing is playing right now. Want me to put something on?";
    }

    const track = state.item;
    const artists = track.artists.map(a => a.name).join(', ');
    const progress = Math.floor((state.progress_ms || 0) / 1000);
    const duration = Math.floor(track.duration_ms / 1000);
    const progressMin = Math.floor(progress / 60);
    const progressSec = progress % 60;
    const durationMin = Math.floor(duration / 60);
    const durationSec = duration % 60;

    const status = state.is_playing ? '▶️ Now playing' : '⏸️ Paused';
    
    return `${status}: "${track.name}" by ${artists}\n${progressMin}:${progressSec.toString().padStart(2, '0')} / ${durationMin}:${durationSec.toString().padStart(2, '0')}`;
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
 */
function getJackMusicSuggestion(mood: string): string {
  const suggestions: Record<string, string[]> = {
    focus: [
      'classical piano',
      'lo-fi beats',
      'ambient music',
      'jazz instrumental',
    ],
    relaxing: [
      'Frank Sinatra',
      'Nat King Cole',
      'smooth jazz',
      'classical guitar',
    ],
    energizing: [
      'upbeat jazz',
      'swing music',
      'big band',
      'classic rock',
    ],
    stressed: [
      'meditation music',
      'nature sounds',
      'calm classical',
      'spa music',
    ],
    celebrating: [
      'celebration playlist',
      'feel good hits',
      'party classics',
      'disco',
    ],
  };

  const moodKey = Object.keys(suggestions).find(k => mood.toLowerCase().includes(k)) || 'relaxing';
  const options = suggestions[moodKey];
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSpotifyTools() {
  const isConfigured = !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REFRESH_TOKEN);
  
  if (!isConfigured) {
    getLogger().warn('Spotify not configured - tools will return setup instructions');
  }

  return {
    playMusic: llm.tool({
      description: `Play a song, artist, or album on the user's Spotify. 
Examples: "play some jazz", "play Fly Me to the Moon", "play Frank Sinatra"
Use when user asks to play music or hear a song. DO NOT read return value aloud.`,
      parameters: z.object({
        query: z.string().describe('Song name, artist, or search query'),
      }),
      execute: async ({ query }) => {
        console.log(`\n🎵 [SPOTIFY TOOL] playMusic called! query="${query}"`);
        if (!isConfigured) {
          console.log('❌ [SPOTIFY TOOL] Not configured!');
          return "[INTERNAL: Spotify not connected] I'd love to play some music, but my Spotify isn't connected yet.";
        }
        getLogger().info({ query }, '🎵 Playing music');
        const result = await playMusic(query);
        console.log(`🎵 [SPOTIFY TOOL] Result: ${result}`);
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
        if (!isConfigured) {
          return "Spotify isn't connected. I can't search right now.";
        }
        return searchTracks(query, limit || 5);
      },
    }),

    pauseMusic: llm.tool({
      description: `Pause the currently playing music.
Use when user says "pause", "stop the music", "quiet please"`,
      parameters: z.object({}),
      execute: async () => {
        if (!isConfigured) return "Spotify isn't connected.";
        return pauseMusic();
      },
    }),

    resumeMusic: llm.tool({
      description: `Resume paused music.
Use when user says "play", "resume", "continue the music"`,
      parameters: z.object({}),
      execute: async () => {
        if (!isConfigured) return "Spotify isn't connected.";
        return resumeMusic();
      },
    }),

    skipSong: llm.tool({
      description: `Skip to the next song.
Use when user says "skip", "next song", "I don't like this one"`,
      parameters: z.object({}),
      execute: async () => {
        if (!isConfigured) return "Spotify isn't connected.";
        return skipTrack();
      },
    }),

    whatsPlaying: llm.tool({
      description: `Check what's currently playing on Spotify.
Use when user asks "what's playing", "what song is this", "who sings this"`,
      parameters: z.object({}),
      execute: async () => {
        if (!isConfigured) return "Spotify isn't connected.";
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
        if (!isConfigured) return "Spotify isn't connected.";
        return setVolume(volume);
      },
    }),

    suggestMusic: llm.tool({
      description: `Get Jack's music suggestion based on mood or activity.
Use when user says "put on some music" without specifics, or asks for recommendations.`,
      parameters: z.object({
        mood: z.string().describe('Current mood or activity (e.g., "focus", "relaxing", "energizing", "stressed", "celebrating")'),
      }),
      execute: async ({ mood }) => {
        const suggestion = getJackMusicSuggestion(mood);
        
        if (!isConfigured) {
          return `For ${mood}, I'd recommend searching for "${suggestion}" on Spotify. Unfortunately, I can't play it directly right now.`;
        }
        
        // Actually play the suggestion
        const result = await playMusic(suggestion);
        return `For ${mood}? Let me put on something good... ${result}`;
      },
    }),
  };
}

export default createSpotifyTools;

