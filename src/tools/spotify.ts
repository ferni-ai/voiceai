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
import * as fs from 'fs';
import * as path from 'path';
import { getMusicPlayer, type MusicTrack } from '../audio/index.js';
import { getSpotifyAccessToken, isSpotifyConfigured, startAutoRefresh, stopAutoRefresh, getSpotifyTokenStatus } from '../services/spotify-auth.js';

const getLogger = () => log();

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
async function getAvailableDevices(): Promise<Array<{ id: string; name: string; type: string; is_active: boolean }>> {
  try {
    const result = await spotifyRequest('/me/player/devices') as { devices: Array<{ id: string; name: string; type: string; is_active: boolean }> };
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
    const user = await spotifyRequest('/me') as { product?: string };
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
 * Priority: 1. Active device, 2. Web player (if Premium), 3. Any available device
 * Note: Web Playback SDK requires Spotify Premium!
 */
async function getBestPlaybackDevice(): Promise<{ deviceId: string | null; deviceName: string | null; source: 'web' | 'active' | 'available' | 'none' }> {
  // Get available devices from Spotify
  const devices = await getAvailableDevices();
  
  // First, prefer an active device (user's phone/computer)
  // This works for all accounts (not just Premium)
  const activeDevice = devices.find(d => d.is_active);
  if (activeDevice) {
    return { deviceId: activeDevice.id, deviceName: activeDevice.name, source: 'active' };
  }
  
  // Check for web player - but only use if Premium
  const webDeviceId = getWebPlayerDeviceId();
  if (webDeviceId) {
    const isPremium = await checkPremiumStatus();
    if (isPremium) {
      return { deviceId: webDeviceId, deviceName: 'Jack Bogle AI (Browser)', source: 'web' };
    } else {
      getLogger().debug('Web player registered but account is not Premium - skipping');
    }
  }
  
  // Fall back to any available device
  if (devices.length > 0) {
    const firstDevice = devices[0];
    return { deviceId: firstDevice.id, deviceName: firstDevice.name, source: 'available' };
  }
  
  return { deviceId: null, deviceName: null, source: 'none' };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Get a fresh access token (uses auto-refresh token manager)
 */
async function getAccessToken(): Promise<string | null> {
  getLogger().debug('Getting Spotify access token...');
  
  // Use the new token manager that auto-refreshes
  const token = await getSpotifyAccessToken();
  
  if (!token) {
    getLogger().warn('Spotify token not available - run scripts/spotify-auth.js');
    return null;
  }
  
  return token;
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
 * Supports two modes:
 * 1. Spotify Connect - Control user's Spotify app/device
 * 2. Stream into call - Play 30-second preview directly into the call
 */
async function playMusic(query: string, streamIntoCallOverride?: boolean): Promise<string> {
  getLogger().info({ query }, 'playMusic called');
  const shouldStreamIntoCall = streamIntoCallOverride ?? streamIntoCall;
  
  try {
    getLogger().debug('Searching for track...');
    // First search for the track
    const searchResult = await spotifyRequest(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=1`
    ) as SpotifySearchResult;
    getLogger().debug({ result: searchResult.tracks?.items?.[0]?.name || 'no results' }, 'Spotify search result');

    const track = searchResult.tracks?.items?.[0];
    
    if (!track) {
      return `Couldn't find "${query}" on Spotify. Try a different song?`;
    }

    const artists = track.artists.map(a => a.name).join(', ');
    
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
        getLogger().info({ track: track.name, artists, mode: 'stream' }, '🎵 Streaming track into call');
        return `Here's a preview of "${track.name}" by ${artists}. I'll play it softly so we can still chat!`;
      } else {
        return `I had trouble streaming that. Let me try playing it on your Spotify instead.`;
      }
    }
    
    // MODE 2: Spotify Connect - Control user's device
    const { deviceId, deviceName, source } = await getBestPlaybackDevice();
    getLogger().debug({ deviceName: deviceName || 'none', source }, 'Best playback device');
    
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
 * Enable/disable streaming music into the call
 */
export function setStreamIntoCall(enabled: boolean): void {
  streamIntoCall = enabled;
  getLogger().info({ enabled }, 'Stream into call mode updated');
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
  // Use the new token manager to check if Spotify is configured
  const isConfigured = isSpotifyConfigured();
  
  if (!isConfigured) {
    getLogger().warn('Spotify not configured - run: node scripts/spotify-auth.js');
  } else {
    // Start auto-refresh for token freshness
    startAutoRefresh();
    
    // Log current token status
    const status = getSpotifyTokenStatus();
    if (status.valid) {
      getLogger().info({ minutesRemaining: status.minutesRemaining }, 'Spotify token status');
    }
  }

  return {
    playMusic: llm.tool({
      description: `Play music on the user's Spotify. Jack loves music and enjoys sharing it!
TRIGGER PHRASES: "play music", "play some", "put on", "let's hear", "play me", "can you play"
Examples: "play some jazz", "play Fly Me to the Moon", "play classical music", "put on some Sinatra"
Jack especially loves classical music (Beethoven!) and jazz. Always use this tool when music is requested.
DO NOT read return value aloud - just acknowledge what's playing.`,
      parameters: z.object({
        query: z.string().describe('Song name, artist, or search query'),
      }),
      execute: async ({ query }) => {
        getLogger().info({ query }, 'playMusic tool called');
        if (!isConfigured) {
          getLogger().warn('Spotify not configured');
          return "[INTERNAL: Spotify not connected] I'd love to play some music, but my Spotify isn't connected yet.";
        }
        const result = await playMusic(query);
        getLogger().debug({ result: result.slice(0, 100) }, 'playMusic result');
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
        if (!isConfigured) return "Spotify isn't connected for previews.";
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
        return "Music paused. Let me know when you want me to continue!";
      },
    }),
    
    resumeCallMusic: llm.tool({
      description: `Resume background music in the call.
Use when user says "play the music again", "continue the song", "unpause"`,
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        musicPlayer.resume();
        return "Music resumed!";
      },
    }),
    
    stopCallMusic: llm.tool({
      description: `Stop background music completely.
Use when user says "stop the music", "turn it off", "no more music"`,
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        musicPlayer.stop();
        return "Music stopped. Our call just got a lot quieter!";
      },
    }),
    
    setCallMusicVolume: llm.tool({
      description: `Adjust the volume of background music in the call.
Use when user says "make it quieter", "turn up the background music"`,
      parameters: z.object({
        volume: z.number().min(0).max(100).describe('Volume percentage (0-100). 20-30% is good for background.'),
      }),
      execute: async ({ volume }) => {
        const musicPlayer = getMusicPlayer();
        musicPlayer.setVolume(volume / 100);
        return `Background music volume set to ${volume}%`;
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
  getLogger().info('Spotify services shut down');
}

export default createSpotifyTools;

