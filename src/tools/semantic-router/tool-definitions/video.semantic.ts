/**
 * Video Tool Definitions for Semantic Router
 *
 * Routes video-related queries - YouTube search, trending, recommendations.
 *
 * @module tools/semantic-router/tool-definitions/video
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SEARCH YOUTUBE
// ============================================================================

export const searchYouTubeTool: SemanticToolDefinition = {
  id: 'video_search_youtube',
  name: 'Search YouTube',
  description: 'Search for videos on YouTube by topic, title, or keyword.',
  shortDescription: 'search videos',
  category: 'entertainment',

  triggers: {
    phrases: [
      'search youtube',
      'find a video',
      'find videos about',
      'look up a video',
      'search for videos',
      'youtube search',
      'find me a video',
      'look for videos',
    ],
    patterns: [
      /^(?:search|find|look\s+(?:up|for))(?:\s+(?:me|a))?\s+(?:youtube\s+)?video(?:s)?(?:\s+(?:about|on|for))?\s*(.+)?/i,
      /^youtube\s+(?:search|find|look\s+up)\s+(.+)/i,
      /^(?:find|show)\s+(?:me\s+)?(?:a\s+)?video(?:s)?\s+(?:about|on|for)\s+(.+)/i,
      /^watch\s+(?:a\s+)?video\s+(?:about|on)\s+(.+)/i,
    ],
    keywords: [
      { word: 'youtube', weight: 1.0 },
      { word: 'video', weight: 0.9 },
      { word: 'videos', weight: 0.9 },
      { word: 'watch', weight: 0.6 },
      { word: 'search', weight: 0.5 },
      { word: 'tutorial', weight: 0.7 },
      { word: 'how to', weight: 0.6 },
    ],
    antiKeywords: [
      'music',
      'song',
      'spotify',
      'play music',
      'podcast',
      'memo',
      'voice memo',
      'recording',
      'call',
      'phone',
    ],
  },

  examples: [
    'Search YouTube for cooking tutorials',
    'Find videos about machine learning',
    'Look up a video on guitar lessons',
    'YouTube search for React tutorials',
  ],

  counterExamples: ['Play some music', 'Play my memo', 'Listen to a podcast', 'Call someone'],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query (topic, video title, or keyword)',
      required: true,
      extractionPatterns: [
        /(?:about|on|for)\s+(.+?)(?:\s*$)/i,
        /youtube\s+(?:search|find)\s+(.+?)(?:\s*$)/i,
      ],
    },
    {
      name: 'duration',
      type: 'string',
      description: 'Duration filter (short, medium, long)',
      required: false,
      extractionPatterns: [/(?:short|medium|long)\s+video/i],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'searchYouTube',
      args,
      delegateTo: 'domains/video',
    };
  },
};

// ============================================================================
// GET VIDEO RECOMMENDATIONS
// ============================================================================

export const getVideoRecommendationsTool: SemanticToolDefinition = {
  id: 'video_recommendations',
  name: 'Get Video Recommendations',
  description: 'Get YouTube video recommendations based on interests.',
  shortDescription: 'recommend videos',
  category: 'entertainment',

  triggers: {
    phrases: [
      'recommend videos',
      'video recommendations',
      'suggest videos',
      'what should i watch',
      'videos i might like',
      'recommend something to watch',
    ],
    patterns: [
      /^(?:recommend|suggest)(?:\s+(?:me|some))?\s+videos?(?:\s+(?:about|on|for))?\s*(.+)?/i,
      /^what\s+(?:videos?|youtube)\s+should\s+i\s+watch/i,
      /^(?:find|show)\s+(?:me\s+)?(?:some\s+)?videos?\s+(?:i\s+might|I\s+would)\s+like/i,
    ],
    keywords: [
      { word: 'recommend', weight: 0.9 },
      { word: 'suggestion', weight: 0.8 },
      { word: 'videos', weight: 0.8 },
      { word: 'watch', weight: 0.6 },
      { word: 'youtube', weight: 0.7 },
      { word: 'discover', weight: 0.7 },
    ],
    antiKeywords: ['music', 'song', 'spotify', 'podcast', 'memo', 'movie', 'netflix'],
  },

  examples: [
    'Recommend videos about cooking',
    'What videos should I watch?',
    'Suggest some tech videos',
    'Find videos I might like about photography',
  ],

  counterExamples: [
    'Recommend songs',
    'What podcast should I listen to?',
    'Suggest movies on Netflix',
  ],

  arguments: [
    {
      name: 'interests',
      type: 'array',
      description: 'List of interests or topics',
      required: false,
      extractionPatterns: [/(?:about|on|for)\s+(.+?)(?:\s*$)/i],
    },
    {
      name: 'duration',
      type: 'string',
      description: 'Duration filter (short, medium, long)',
      required: false,
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'getVideoRecommendations',
      args,
      delegateTo: 'domains/video',
    };
  },
};

// ============================================================================
// GET TRENDING VIDEOS
// ============================================================================

export const getTrendingVideosTool: SemanticToolDefinition = {
  id: 'video_trending',
  name: 'Get Trending Videos',
  description: 'Get trending/popular videos on YouTube.',
  shortDescription: 'trending videos',
  category: 'entertainment',

  triggers: {
    phrases: [
      'trending videos',
      'popular videos',
      'what videos are trending',
      'top youtube videos',
      'viral videos',
      'whats popular on youtube',
    ],
    patterns: [
      /^(?:what(?:'s|s)?|show|get)\s+(?:the\s+)?(?:trending|popular|viral)\s+videos?/i,
      /^(?:trending|popular|top)\s+(?:youtube\s+)?videos?/i,
      /^what(?:'s|s)?\s+(?:popular|trending)\s+on\s+youtube/i,
    ],
    keywords: [
      { word: 'trending', weight: 1.0 },
      { word: 'popular', weight: 0.9 },
      { word: 'viral', weight: 0.9 },
      { word: 'top', weight: 0.7 },
      { word: 'videos', weight: 0.8 },
      { word: 'youtube', weight: 0.7 },
    ],
    antiKeywords: ['music', 'songs', 'spotify', 'podcast', 'memo', 'news'],
  },

  examples: [
    'Show me trending videos',
    "What's popular on YouTube?",
    'Get trending gaming videos',
    'Show viral videos',
  ],

  counterExamples: ['Trending songs', "What's on the news?", 'Popular podcasts'],

  arguments: [
    {
      name: 'category',
      type: 'string',
      description: 'Category filter (music, gaming, entertainment, news, howto, etc.)',
      required: false,
      extractionPatterns: [/trending\s+(\w+)\s+videos?/i],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'getTrendingVideos',
      args,
      delegateTo: 'domains/video',
    };
  },
};

// ============================================================================
// GET VIDEO DETAILS
// ============================================================================

export const getVideoDetailsTool: SemanticToolDefinition = {
  id: 'video_details',
  name: 'Get Video Details',
  description: 'Get detailed information about a specific YouTube video.',
  shortDescription: 'video details',
  category: 'entertainment',

  triggers: {
    phrases: [
      'video details',
      'info about this video',
      'tell me about this video',
      'how long is this video',
      'video information',
    ],
    patterns: [
      /^(?:get|show|tell\s+me)\s+(?:the\s+)?(?:details?|info(?:rmation)?)\s+(?:about|on|for)\s+(?:this\s+)?video/i,
      /^how\s+(?:long|many\s+views)\s+(?:does|is)\s+(?:this\s+)?video/i,
      /^(?:what(?:'s|s)?)\s+this\s+video\s+about/i,
    ],
    keywords: [
      { word: 'details', weight: 0.9 },
      { word: 'info', weight: 0.8 },
      { word: 'information', weight: 0.8 },
      { word: 'video', weight: 0.9 },
      { word: 'duration', weight: 0.7 },
      { word: 'views', weight: 0.7 },
    ],
    antiKeywords: ['search', 'find', 'recommend', 'trending', 'memo'],
  },

  examples: [
    'Get details about this video',
    'How long is this video?',
    'Tell me about this video',
    'Video information',
  ],

  counterExamples: ['Search for videos', 'Find trending videos', 'Recommend videos'],

  arguments: [
    {
      name: 'videoId',
      type: 'string',
      description: 'The YouTube video ID',
      required: true,
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'getVideoDetails',
      args,
      delegateTo: 'domains/video',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const videoTools: SemanticToolDefinition[] = [
  searchYouTubeTool,
  getVideoRecommendationsTool,
  getTrendingVideosTool,
  getVideoDetailsTool,
];
