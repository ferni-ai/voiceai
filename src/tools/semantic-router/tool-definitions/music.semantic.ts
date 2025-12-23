/**
 * Music Tool Definitions for Semantic Router
 *
 * Example of how to define tools for semantic routing.
 * Each tool includes triggers, examples, and argument extraction.
 *
 * @module tools/semantic-router/tool-definitions/music
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

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
      'play music',
      'play some music',
      'play spotify',
      'start playing',
      'put on some music',
      'put on music',
    ],
    patterns: [
      /^play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
      /^put\s+on\s+(?:some\s+)?(.+)/i,
      /^i(?:'d|\s+would)\s+like\s+(?:to\s+)?(?:hear|listen\s+to)\s+(.+)/i,
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
      { word: 'jazz', weight: 0.8 },
      { word: 'rock', weight: 0.7 },
      { word: 'classical', weight: 0.7 },
      { word: 'chill', weight: 0.6 },
      { word: 'focus', weight: 0.5 },
    ],
    antiKeywords: ['stop', 'pause', 'next', 'skip'],
  },

  examples: [
    'play some jazz',
    'play chill music for focus',
    'play Bohemian Rhapsody by Queen',
    'put on some classical music',
    'play something relaxing',
    'play my discover weekly',
    'play music for working',
    'I want to hear some rock',
    'play some background music',
    'can you play some upbeat music',
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
