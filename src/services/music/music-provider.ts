/**
 * Unified Music Provider
 *
 * Balances music playback across multiple sources:
 *
 * 1. **iTunes Previews** (Default) - Free 30-sec clips for everyone
 *    - No auth needed
 *    - Perfect for ambient/background music
 *    - Same catalog as Apple Music!
 *
 * 2. **Apple Music Previews** - Same 30-sec clips via MusicKit API
 *    - Requires Apple Developer credentials
 *    - Better search results for some queries
 *    - Falls back to iTunes if not configured
 *
 * 3. **Spotify** (Premium) - Full-length tracks
 *    - Requires user to link their Premium account
 *    - Best for "I want to hear the whole song"
 *
 * ## Intent-Based Routing
 *
 * - "Play some jazz" → Ambient mode → iTunes previews (chains them like a DJ)
 * - "Play Taylor Swift" → Listening mode → Spotify first, iTunes fallback
 * - "Search Apple Music for..." → Direct Apple Music search
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// Types
export type MusicIntent = 'ambient' | 'listening' | 'search';
export type MusicSource = 'itunes' | 'apple_music' | 'spotify';

export interface MusicTrackInfo {
  name: string;
  artist: string;
  album?: string;
  previewUrl?: string; // 30-sec preview (iTunes/Apple Music)
  spotifyUri?: string; // Full track (Spotify)
  duration?: number;
  source: MusicSource;
}

export interface PlayMusicResult {
  success: boolean;
  source: MusicSource;
  track?: MusicTrackInfo;
  message: string;
  isPreview: boolean;
}

/**
 * Detect user's intent from their music request
 */
export function detectMusicIntent(query: string): MusicIntent {
  const lowerQuery = query.toLowerCase();

  // Explicit search intent
  if (lowerQuery.includes('search') || lowerQuery.includes('find')) {
    return 'search';
  }

  // Ambient/background music indicators
  const ambientIndicators = [
    'some ',
    'background',
    'ambient',
    'mood',
    'vibe',
    'chill',
    'put on',
    'play some',
    'something',
    'relaxing',
    'upbeat',
    'while i',
    'work music',
    'study music',
    'focus music',
  ];

  if (ambientIndicators.some((ind) => lowerQuery.includes(ind))) {
    return 'ambient';
  }

  // Listening intent - specific song/artist requests
  const listeningIndicators = [
    'play ',
    'i want to hear',
    'put on ',
    'the song',
    'by ',
    'full song',
    'whole song',
  ];

  if (listeningIndicators.some((ind) => lowerQuery.includes(ind))) {
    return 'listening';
  }

  // Default to ambient for vague requests
  return 'ambient';
}

/**
 * Get the best music source for the user's intent
 */
export function getBestSource(
  intent: MusicIntent,
  options: {
    spotifyLinked?: boolean;
    appleMusicAvailable?: boolean;
  } = {}
): MusicSource {
  const { spotifyLinked = false, appleMusicAvailable = false } = options;

  switch (intent) {
    case 'listening':
      // For full songs, prefer Spotify if available
      return spotifyLinked ? 'spotify' : 'itunes';

    case 'ambient':
      // For background music, iTunes previews are perfect
      // They chain nicely and don't require any auth
      return 'itunes';

    case 'search':
      // For search, use Apple Music if available (better results)
      return appleMusicAvailable ? 'apple_music' : 'itunes';

    default:
      return 'itunes';
  }
}

/**
 * Format a playback result for voice output
 */
export function formatPlaybackResult(result: PlayMusicResult): string {
  if (!result.success) {
    return result.message;
  }

  const track = result.track;
  if (!track) {
    return result.message;
  }

  // Different framing based on source and whether it's a preview
  if (result.isPreview) {
    const previewFrames = [
      `Here's a taste of "${track.name}" by ${track.artist}...`,
      `Playing "${track.name}"...`,
      `${track.name} by ${track.artist}...`,
      `Here we go...`, // Sometimes minimal is better
    ];
    return previewFrames[Math.floor(Math.random() * previewFrames.length)];
  }

  // Full playback (Spotify)
  return `Playing "${track.name}" by ${track.artist} on Spotify.`;
}

/**
 * Log music playback for analytics
 */
export function logMusicPlay(
  userId: string,
  track: MusicTrackInfo,
  intent: MusicIntent,
  success: boolean
): void {
  log.info(
    {
      userId,
      trackName: track.name,
      artist: track.artist,
      source: track.source,
      intent,
      success,
      isPreview: !!track.previewUrl && !track.spotifyUri,
    },
    '🎵 Music playback logged'
  );
}

export default {
  detectMusicIntent,
  getBestSource,
  formatPlaybackResult,
  logMusicPlay,
};
