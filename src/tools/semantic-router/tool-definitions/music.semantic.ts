/**
 * Music Tool Definitions for Semantic Router
 *
 * Semantic routing definitions for music-related tools.
 * These tools route to real domain implementations via the domain-bridge.ts.
 *
 * EXECUTION FLOW:
 * 1. User says "play some jazz"
 * 2. Semantic router matches `spotify_play` with high confidence
 * 3. turn-processor-integration.ts calls executeMatchedTool()
 * 4. domain-bridge.ts maps `spotify_play` → `playMusic` domain tool
 * 5. Real music playback happens via entertainment/music.ts
 *
 * The `execute` functions here are FALLBACKS only - they return mock responses
 * if the domain bridge fails or the domain tool isn't loaded. In normal
 * operation, the domain bridge handles execution.
 *
 * @see domain-bridge.ts for semantic → domain tool mappings
 * @module tools/semantic-router/tool-definitions/music
 */

import type { SemanticToolDefinition, ToolExecutionResult } from '../types.js';

// ============================================================================
// PLAY MUSIC TOOL
// ============================================================================

export const playMusicTool: SemanticToolDefinition = {
  id: 'spotify_play',
  name: 'Play Music',
  description:
    'Plays music on Spotify. Can play specific songs, artists, albums, playlists, or genres. Supports mood-based and activity-based music selection.',
  shortDescription: 'play music on Spotify',
  category: 'music',

  triggers: {
    phrases: [
      // Direct commands
      'play music',
      'play some music',
      'play spotify',
      'start playing',
      'put on some music',
      'put on music',
      // Seasonal/Holiday music (CRITICAL - must beat seasonal→relationships boost)
      'play christmas music',
      'play some christmas music',
      'play holiday music',
      'play some holiday music',
      'put on christmas music',
      'put on some christmas music',
      'christmas songs',
      'holiday songs',
      // Polite requests (Gemini problem phrases)
      'can you play music',
      'can you play some music',
      'could you play music',
      'would you play music',
      'will you play music',
      // Conversational requests
      "i'd like to hear some music",
      'i want to hear some music',
      'i would like some music',
      "let's hear some music",
      'how about some music',
      // Casual slang
      'throw on some music',
      'spin some music',
      'queue up some music',
    ],
    patterns: [
      // Seasonal/Holiday music patterns (CRITICAL - must match before generic patterns)
      /^play\s+(?:me\s+)?(?:some\s+)?(?:christmas|holiday|festive)\s+(?:music|songs?)/i,
      /^(?:can|could|would|will)\s+you\s+play\s+(?:me\s+)?(?:some\s+)?(?:christmas|holiday)\s+(?:music|songs?)/i,
      /^put\s+on\s+(?:some\s+)?(?:christmas|holiday)\s+(?:music|songs?)/i,
      // Direct commands
      /^play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
      /^put\s+on\s+(?:some\s+)?(.+)/i,
      // Polite requests (CRITICAL - these are Gemini problem patterns)
      /^can\s+you\s+play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
      /^could\s+you\s+play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
      /^would\s+you\s+play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
      /^will\s+you\s+play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
      // Desire expressions
      /^i(?:'d|\s+would)\s+like\s+(?:to\s+)?(?:hear|listen\s+to)\s+(.+)/i,
      /^i\s+want\s+(?:to\s+)?(?:hear|listen\s+to)\s+(.+)/i,
      /^i(?:'d|\s+would)\s+love\s+(?:to\s+)?(?:hear|listen\s+to)\s+(.+)/i,
      // Suggestions
      /^(?:let's|let\s+us)\s+(?:hear|listen\s+to|play)\s+(.+)/i,
      /^how\s+about\s+(?:some\s+)?(.+?)(?:\s+music)?$/i,
      // Casual slang
      /^(?:throw|spin|queue)\s+(?:on|up)\s+(?:some\s+)?(.+)/i,
      /^(?:start|begin)\s+(?:playing|some)\s+(.+)/i,
    ],
    keywords: [
      { word: 'play', weight: 1.0 },
      { word: 'music', weight: 0.8 },
      { word: 'spotify', weight: 0.9 },
      { word: 'song', weight: 0.7 },
      { word: 'album', weight: 0.6 },
      { word: 'playlist', weight: 0.7 },
      { word: 'artist', weight: 0.6 },
      { word: 'listen', weight: 0.5 },
      { word: 'hear', weight: 0.5 },
      // Genres (boost confidence when detected)
      { word: 'jazz', weight: 0.8 },
      { word: 'rock', weight: 0.7 },
      { word: 'classical', weight: 0.7 },
      { word: 'pop', weight: 0.7 },
      { word: 'hip hop', weight: 0.7 },
      { word: 'electronic', weight: 0.7 },
      { word: 'country', weight: 0.7 },
      { word: 'indie', weight: 0.7 },
      { word: 'metal', weight: 0.7 },
      { word: 'folk', weight: 0.7 },
      { word: 'ambient', weight: 0.7 },
      { word: 'lofi', weight: 0.7 },
      // Seasonal/Holiday music
      { word: 'christmas', weight: 0.8 },
      { word: 'holiday', weight: 0.7 },
      { word: 'thanksgiving', weight: 0.6 },
      { word: 'halloween', weight: 0.6 },
      { word: 'easter', weight: 0.6 },
      { word: 'hanukkah', weight: 0.6 },
      { word: 'winter', weight: 0.5 },
      { word: 'summer', weight: 0.5 },
      // Moods
      { word: 'chill', weight: 0.6 },
      { word: 'focus', weight: 0.5 },
      { word: 'relax', weight: 0.6 },
      { word: 'relaxing', weight: 0.6 },
      { word: 'upbeat', weight: 0.6 },
      { word: 'energetic', weight: 0.6 },
      { word: 'calm', weight: 0.6 },
      { word: 'mellow', weight: 0.6 },
    ],
    antiKeywords: ['stop', 'pause', 'next', 'skip', 'volume', 'louder', 'quieter'],
  },

  examples: [
    // Direct commands
    'play some jazz',
    'play chill music for focus',
    'play Bohemian Rhapsody by Queen',
    'put on some classical music',
    'play something relaxing',
    'play my discover weekly',
    'play music for working',
    'play some background music',
    // Polite requests (CRITICAL - Gemini problem patterns)
    'can you play some jazz',
    'could you play some music',
    'would you play something relaxing',
    'will you play some upbeat music',
    // Desire expressions
    'I want to hear some rock',
    "I'd like to hear some jazz",
    'I would love to listen to some classical',
    // Suggestions
    'how about some jazz',
    "let's hear some rock",
    'how about putting on some music',
    // Casual slang
    'throw on some jazz',
    'spin some vinyl vibes',
    'queue up some chill music',
    // Seasonal/Holiday music
    'play some Christmas music',
    'play holiday music',
    'play some festive music',
    'put on some Christmas songs',
  ],

  counterExamples: [
    'stop the music',
    'pause playback',
    "what's playing",
    'skip this song',
    'next track',
  ],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query for music (song, artist, album, or genre)',
      required: false,
      extractionPatterns: [
        /play\s+(?:me\s+)?(?:some\s+)?(.+?)(?:\s+on\s+spotify|\s+for\s+me)?$/i,
        /put\s+on\s+(?:some\s+)?(.+)/i,
      ],
    },
    {
      name: 'genre',
      type: 'string',
      description: 'Music genre',
      required: false,
      entityType: 'genre',
      enumValues: [
        'jazz',
        'rock',
        'pop',
        'classical',
        'hip hop',
        'electronic',
        'country',
        'r&b',
        'folk',
        'metal',
        'indie',
        'ambient',
        'lofi',
      ],
    },
    {
      name: 'mood',
      type: 'string',
      description: 'Music mood or vibe',
      required: false,
      enumValues: [
        'happy',
        'sad',
        'energetic',
        'calm',
        'relaxing',
        'upbeat',
        'mellow',
        'focus',
        'workout',
        'party',
        'romantic',
      ],
    },
    {
      name: 'artist',
      type: 'string',
      description: 'Artist name',
      required: false,
      extractionPatterns: [/by\s+(.+?)(?:\s+(?:and|on|for|from)|$)/i],
    },
  ],

  execute: async (args, context): Promise<ToolExecutionResult> => {
    // This would call the actual Spotify integration
    // For now, return a mock response
    const query = args.query || args.genre || args.mood || 'music';

    return {
      success: true,
      data: { query, playing: true },
      naturalResponse: `Playing ${query}`,
      speakImmediately: true,
      sideEffects: ['spotify_playback_started'],
    };
  },

  priority: 100, // Music is a common request
  cooldownMs: 2000, // Prevent rapid-fire plays
  tags: ['spotify', 'entertainment', 'audio'],
};

// ============================================================================
// PAUSE MUSIC TOOL
// ============================================================================

export const pauseMusicTool: SemanticToolDefinition = {
  id: 'spotify_pause',
  name: 'Pause Music',
  description: 'Pauses currently playing music on Spotify',
  shortDescription: 'pause the music',
  category: 'music',

  triggers: {
    phrases: ['pause', 'pause music', 'pause the music', 'stop music', 'stop the music'],
    patterns: [/^(?:please\s+)?(?:pause|stop)\s*(?:the\s+)?music/i, /^pause$/i],
    keywords: [
      { word: 'pause', weight: 1.0 },
      { word: 'stop', weight: 0.8 },
      { word: 'music', weight: 0.5 },
    ],
    antiKeywords: ['play', 'start', 'resume'],
  },

  examples: ['pause', 'pause the music', 'stop the music', 'pause playback', 'stop playing'],

  arguments: [],

  execute: async (): Promise<ToolExecutionResult> => {
    return {
      success: true,
      naturalResponse: 'Paused',
      speakImmediately: true,
    };
  },

  priority: 90,
  tags: ['spotify', 'entertainment', 'audio'],
};

// ============================================================================
// SKIP SONG TOOL
// ============================================================================

export const skipSongTool: SemanticToolDefinition = {
  id: 'spotify_skip',
  name: 'Skip Song',
  description: 'Skips to the next song on Spotify',
  shortDescription: 'skip to next song',
  category: 'music',

  triggers: {
    phrases: ['skip', 'next', 'next song', 'skip this', 'next track'],
    patterns: [/^(?:please\s+)?(?:skip|next)\s*(?:this\s+)?(?:song|track)?/i],
    keywords: [
      { word: 'skip', weight: 1.0 },
      { word: 'next', weight: 0.9 },
      { word: 'song', weight: 0.4 },
      { word: 'track', weight: 0.4 },
    ],
    antiKeywords: ['previous', 'back', 'last'],
  },

  examples: ['skip', 'next', 'skip this song', 'next track', "I don't like this one"],

  arguments: [],

  execute: async (): Promise<ToolExecutionResult> => {
    return {
      success: true,
      naturalResponse: 'Skipping to next',
      speakImmediately: true,
    };
  },

  priority: 85,
  tags: ['spotify', 'entertainment', 'audio'],
};

// ============================================================================
// EXPORT ALL MUSIC TOOLS
// ============================================================================

export const musicTools: SemanticToolDefinition[] = [playMusicTool, pauseMusicTool, skipSongTool];
