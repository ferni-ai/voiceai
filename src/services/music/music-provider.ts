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
 * 4. **Sonos** - Play on Sonos speakers
 *    - Searches user's favorites
 *    - Plays on specified room or default room
 *
 * ## Intent-Based Routing
 *
 * - "Play some jazz" → Ambient mode → iTunes previews (chains them like a DJ)
 * - "Play Taylor Swift" → Listening mode → Spotify first, iTunes fallback
 * - "Search Apple Music for..." → Direct Apple Music search
 * - "Play jazz on living room Sonos" → Sonos mode → Play on Sonos speakers
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// Types
export type MusicIntent = 'ambient' | 'listening' | 'search' | 'sonos';
export type MusicSource = 'itunes' | 'apple_music' | 'spotify' | 'sonos';

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

// ============================================================================
// UNIFIED SOURCE CONFIGURATION
// ============================================================================

export interface MusicSourceConfig {
  spotify: {
    available: boolean;
    premium: boolean;
    deviceReady: boolean;
  };
  sonos: {
    available: boolean;
    rooms: string[];
    defaultRoom?: string;
  };
  itunes: {
    available: true; // Always available
  };
}

/**
 * Build a music source config from available services
 */
export function buildSourceConfig(options: {
  spotifyLinked?: boolean;
  spotifyPremium?: boolean;
  spotifyDeviceReady?: boolean;
  sonosLinked?: boolean;
  sonosRooms?: string[];
  sonosDefaultRoom?: string;
}): MusicSourceConfig {
  return {
    spotify: {
      available: options.spotifyLinked ?? false,
      premium: options.spotifyPremium ?? false,
      deviceReady: options.spotifyDeviceReady ?? false,
    },
    sonos: {
      available: options.sonosLinked ?? false,
      rooms: options.sonosRooms ?? [],
      defaultRoom: options.sonosDefaultRoom,
    },
    itunes: {
      available: true,
    },
  };
}

/**
 * Select the best music source based on intent and configuration
 *
 * Priority:
 * 1. Sonos (if user said "on Sonos" or has default room and intent is listening)
 * 2. Spotify Connect (if Premium + device ready and intent is listening)
 * 3. Sonos search+play (if available and intent is listening)
 * 4. iTunes preview (always works)
 */
export function selectBestSource(
  intent: MusicIntent,
  config: MusicSourceConfig,
  options?: {
    explicitSonos?: boolean; // User explicitly said "on Sonos"
    explicitSpotify?: boolean; // User explicitly said "on Spotify"
    roomSpecified?: string; // User specified a room
  }
): MusicSource {
  const { explicitSonos, explicitSpotify, roomSpecified } = options ?? {};

  log.debug({ intent, config, options }, '🎵 Selecting best music source');

  // Explicit routing takes precedence
  if (explicitSonos && config.sonos.available) {
    log.info({ reason: 'explicit_sonos' }, '🎵 Using Sonos (explicit request)');
    return 'sonos';
  }

  if (explicitSpotify && config.spotify.available && config.spotify.premium) {
    log.info({ reason: 'explicit_spotify' }, '🎵 Using Spotify (explicit request)');
    return 'spotify';
  }

  // Room specified implies Sonos
  if (roomSpecified && config.sonos.available) {
    const roomMatch = config.sonos.rooms.some(
      (r) =>
        r.toLowerCase().includes(roomSpecified.toLowerCase()) ||
        roomSpecified.toLowerCase().includes(r.toLowerCase())
    );
    if (roomMatch) {
      log.info(
        { reason: 'room_specified', room: roomSpecified },
        '🎵 Using Sonos (room specified)'
      );
      return 'sonos';
    }
  }

  // Sonos intent from detection
  if (intent === 'sonos' && config.sonos.available) {
    log.info({ reason: 'sonos_intent' }, '🎵 Using Sonos (intent detected)');
    return 'sonos';
  }

  // Intent-based routing for other cases
  switch (intent) {
    case 'listening':
      // For full songs, prefer Spotify if Premium + device ready
      if (config.spotify.available && config.spotify.premium && config.spotify.deviceReady) {
        log.info({ reason: 'spotify_ready' }, '🎵 Using Spotify (Premium + device ready)');
        return 'spotify';
      }
      // Fall back to Sonos if available
      if (config.sonos.available && config.sonos.rooms.length > 0) {
        log.info({ reason: 'sonos_fallback' }, '🎵 Using Sonos (Spotify not ready)');
        return 'sonos';
      }
      // Otherwise iTunes preview
      log.info({ reason: 'itunes_fallback' }, '🎵 Using iTunes (fallback)');
      return 'itunes';

    case 'ambient':
      // For background music, iTunes previews are perfect
      // They chain nicely and don't require any auth
      log.info({ reason: 'ambient_intent' }, '🎵 Using iTunes (ambient music)');
      return 'itunes';

    case 'search':
      // For search, prefer Spotify if available (better results)
      if (config.spotify.available) {
        return 'spotify';
      }
      return 'itunes';

    default:
      log.info({ reason: 'default' }, '🎵 Using iTunes (default)');
      return 'itunes';
  }
}

/**
 * Detect user's intent from their music request
 */
export function detectMusicIntent(query: string): MusicIntent {
  const lowerQuery = query.toLowerCase();

  // Sonos-specific intent
  const sonosIndicators = [
    'sonos',
    'on the speaker',
    'in the living room',
    'in the kitchen',
    'in the bedroom',
    'in the office',
    'in the bathroom',
    'in the dining room',
    'on my speaker',
    'whole house',
    'all rooms',
  ];

  if (sonosIndicators.some((ind) => lowerQuery.includes(ind))) {
    return 'sonos';
  }

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
 * Extract room name from a music query
 * e.g., "play jazz in the living room" → "living room"
 */
export function extractRoomFromQuery(query: string): string | undefined {
  const lowerQuery = query.toLowerCase();

  // Common room patterns
  const roomPatterns = [
    /(?:in the|on the|in my|on my)\s+(\w+(?:\s+\w+)?)\s*(?:sonos|speaker|room)?/i,
    /(\w+(?:\s+room)?)\s+sonos/i,
  ];

  for (const pattern of roomPatterns) {
    const match = lowerQuery.match(pattern);
    if (match && match[1]) {
      const room = match[1].trim();
      // Filter out generic words
      if (!['some', 'the', 'my', 'a', 'an'].includes(room)) {
        return room;
      }
    }
  }

  return undefined;
}

/**
 * Check if query explicitly mentions Sonos
 */
export function mentionsSonos(query: string): boolean {
  return query.toLowerCase().includes('sonos');
}

/**
 * Check if query explicitly mentions Spotify
 */
export function mentionsSpotify(query: string): boolean {
  return query.toLowerCase().includes('spotify');
}

/**
 * Get the best music source for the user's intent (backward compatible)
 * @deprecated Use selectBestSource with MusicSourceConfig instead
 */
export function getBestSource(
  intent: MusicIntent,
  options: {
    spotifyLinked?: boolean;
    spotifyPremium?: boolean;
    spotifyDeviceReady?: boolean;
    appleMusicAvailable?: boolean;
    sonosLinked?: boolean;
    sonosRooms?: string[];
  } = {}
): MusicSource {
  const {
    spotifyLinked = false,
    spotifyPremium = false,
    spotifyDeviceReady = false,
    appleMusicAvailable = false,
    sonosLinked = false,
    sonosRooms = [],
  } = options;

  // Build config and use new selection logic
  const config = buildSourceConfig({
    spotifyLinked,
    spotifyPremium,
    spotifyDeviceReady,
    sonosLinked,
    sonosRooms,
  });

  // Use new unified selection
  const source = selectBestSource(intent, config);

  // Handle apple_music special case for backward compatibility
  if (intent === 'search' && appleMusicAvailable) {
    return 'apple_music';
  }

  return source;
}

/**
 * Format a playback result for voice output
 */
export function formatPlaybackResult(result: PlayMusicResult, room?: string): string {
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

  // Full playback based on source
  switch (result.source) {
    case 'spotify':
      return `Playing "${track.name}" by ${track.artist} on Spotify.`;

    case 'sonos':
      if (room) {
        return `Playing "${track.name}" by ${track.artist} on ${room}.`;
      }
      return `Playing "${track.name}" by ${track.artist} on Sonos.`;

    case 'itunes':
    case 'apple_music':
    default:
      return `Playing "${track.name}" by ${track.artist}.`;
  }
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
  selectBestSource,
  buildSourceConfig,
  formatPlaybackResult,
  logMusicPlay,
  extractRoomFromQuery,
  mentionsSonos,
  mentionsSpotify,
};
