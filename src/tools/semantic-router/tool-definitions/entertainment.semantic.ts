/**
 * Entertainment Tool Definitions for Semantic Router
 *
 * Routes entertainment discovery queries (movies, TV, recommendations).
 * Note: Music is handled separately in music.semantic.ts
 *
 * @module tools/semantic-router/tool-definitions/entertainment
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// MOVIE RECOMMENDATIONS
// ============================================================================

export const movieRecommendationTool: SemanticToolDefinition = {
  id: 'entertainment_movie',
  name: 'Movie Recommendation',
  description: 'Get movie recommendations based on mood, genre, or preferences.',
  shortDescription: 'recommend a movie',
  category: 'entertainment',

  triggers: {
    phrases: [
      'recommend a movie',
      'what should I watch',
      'movie suggestion',
      'good movies',
      'movie recommendation',
      'suggest a film',
      'what to watch',
      'movie night',
      "i'm in the mood for a movie",
    ],
    patterns: [
      /^(?:recommend|suggest)\s+(?:me\s+)?(?:a\s+)?(?:good\s+)?movie/i,
      /^what\s+(?:movie|film)\s+should\s+i\s+watch/i,
      /^(?:any|got\s+any)\s+(?:good\s+)?movie\s+(?:suggestions?|recommendations?)/i,
      /^(?:i(?:'m| am)?\s+)?(?:looking\s+for|in\s+the\s+mood\s+for)\s+(?:a\s+)?(?:good\s+)?movie/i,
      /^what(?:'s| is)\s+(?:a\s+)?good\s+(?:movie|film)\s+(?:to\s+watch)?/i,
    ],
    keywords: [
      { word: 'movie', weight: 0.9 },
      { word: 'film', weight: 0.9 },
      { word: 'watch', weight: 0.7 },
      { word: 'recommend', weight: 0.8 },
      { word: 'suggestion', weight: 0.7 },
      { word: 'cinema', weight: 0.6 },
    ],
    antiKeywords: ['music', 'song', 'tv show', 'series', 'book'],
  },

  examples: [
    'Recommend a good movie',
    'What should I watch tonight?',
    'Any good movie suggestions?',
    "I'm in the mood for a comedy",
    'Suggest a thriller movie',
    'What are some good horror films?',
    "It's movie night, what should we watch?",
  ],

  counterExamples: [
    'Recommend a TV show',
    'Play a movie',
    'What music should I listen to?',
    'What book should I read?',
  ],

  arguments: [
    {
      name: 'genre',
      type: 'string',
      description: 'Movie genre preference',
      required: false,
      enumValues: [
        'action',
        'comedy',
        'drama',
        'horror',
        'thriller',
        'romance',
        'scifi',
        'documentary',
      ],
      extractionPatterns: [
        /(action|comedy|drama|horror|thriller|romance|sci-?fi|documentary)\s+(?:movie|film)/i,
        /(?:movie|film)\s+(?:that(?:'s| is)\s+)?(action|comedy|drama|horror|thriller|romance)/i,
      ],
    },
    {
      name: 'mood',
      type: 'string',
      description: 'Viewing mood',
      required: false,
      extractionPatterns: [
        /(?:i(?:'m| am)?\s+)?(?:in\s+the\s+)?mood\s+(?:for\s+)?(?:something\s+)?(.+?)$/i,
        /(?:something|movie)\s+(?:that(?:'s| is)\s+)?(.+?)$/i,
      ],
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
      toolId: 'recommendMovie',
      args,
      delegateTo: 'domains/entertainment',
    };
  },
};

// ============================================================================
// TV SHOW RECOMMENDATIONS
// ============================================================================

export const tvShowRecommendationTool: SemanticToolDefinition = {
  id: 'entertainment_tv',
  name: 'TV Show Recommendation',
  description: 'Get TV show and series recommendations.',
  shortDescription: 'recommend a TV show',
  category: 'entertainment',

  triggers: {
    phrases: [
      'recommend a show',
      'tv show suggestion',
      'what series should I watch',
      'good shows',
      'binge watch',
      'new series',
      'recommend a series',
      'tv recommendation',
    ],
    patterns: [
      /^(?:recommend|suggest)\s+(?:me\s+)?(?:a\s+)?(?:good\s+)?(?:tv\s+)?(?:show|series)/i,
      /^what\s+(?:tv\s+)?(?:show|series)\s+should\s+i\s+(?:watch|binge)/i,
      /^(?:any|got\s+any)\s+(?:good\s+)?(?:tv\s+)?(?:show|series)\s+(?:suggestions?|recommendations?)/i,
      /^(?:looking\s+for|need)\s+(?:a\s+)?(?:new\s+)?(?:show|series)\s+to\s+(?:watch|binge)/i,
    ],
    keywords: [
      { word: 'show', weight: 0.8 },
      { word: 'series', weight: 0.9 },
      { word: 'tv', weight: 0.7 },
      { word: 'binge', weight: 0.8 },
      { word: 'episode', weight: 0.7 },
      { word: 'season', weight: 0.6 },
    ],
    antiKeywords: ['movie', 'film', 'music', 'song', 'book'],
  },

  examples: [
    'Recommend a good TV show',
    'What series should I binge?',
    "I'm looking for a new show",
    'Any good drama series?',
    'Suggest a comedy show',
    'What should I watch on Netflix?',
  ],

  counterExamples: ['Recommend a movie', 'What music should I listen to?', 'Show me my calendar'],

  arguments: [
    {
      name: 'genre',
      type: 'string',
      description: 'TV show genre',
      required: false,
      enumValues: ['drama', 'comedy', 'thriller', 'scifi', 'documentary', 'reality', 'anime'],
      extractionPatterns: [
        /(drama|comedy|thriller|sci-?fi|documentary|reality|anime)\s+(?:show|series)/i,
      ],
    },
    {
      name: 'platform',
      type: 'string',
      description: 'Streaming platform',
      required: false,
      extractionPatterns: [/(?:on\s+)?(netflix|hulu|amazon|disney|hbo|apple\s*tv)/i],
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
      toolId: 'recommendTVShow',
      args,
      delegateTo: 'domains/entertainment',
    };
  },
};

// ============================================================================
// WHAT'S NEW / TRENDING
// ============================================================================

export const trendingEntertainmentTool: SemanticToolDefinition = {
  id: 'entertainment_trending',
  name: 'Trending Entertainment',
  description: "Get what's trending in movies and TV.",
  shortDescription: "what's trending",
  category: 'entertainment',

  triggers: {
    phrases: [
      "what's popular",
      "what's trending",
      "what's new",
      'new releases',
      'popular movies',
      "what's everyone watching",
      'top movies',
      'best shows right now',
    ],
    patterns: [
      /^what(?:'s| is)\s+(?:new|trending|popular|hot)\s+(?:in\s+)?(?:movies?|shows?|tv)?/i,
      /^(?:what\s+are\s+)?(?:the\s+)?(?:top|best|popular)\s+(?:movies?|shows?)\s+(?:right\s+now|this\s+week)?/i,
      /^(?:any\s+)?new\s+(?:movie\s+)?releases?/i,
    ],
    keywords: [
      { word: 'trending', weight: 0.9 },
      { word: 'popular', weight: 0.8 },
      { word: 'new', weight: 0.6 },
      { word: 'top', weight: 0.7 },
      { word: 'best', weight: 0.6 },
      { word: 'releases', weight: 0.8 },
    ],
    antiKeywords: ['music', 'songs', 'news'],
  },

  examples: [
    "What's trending in movies?",
    "What's new on Netflix?",
    'What are the top shows right now?',
    'Any new movie releases?',
    "What's everyone watching?",
  ],

  counterExamples: ["What's trending in music?", "What's in the news?", "What's new with you?"],

  arguments: [
    {
      name: 'type',
      type: 'string',
      description: 'Content type',
      required: false,
      enumValues: ['movies', 'shows', 'all'],
      extractionPatterns: [/(movies?|shows?|series|tv)/i],
    },
  ],

  confidence: {
    baseScore: 0.8,
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
      toolId: 'trendingEntertainment',
      args,
      delegateTo: 'domains/entertainment',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const entertainmentTools: SemanticToolDefinition[] = [
  movieRecommendationTool,
  tvShowRecommendationTool,
  trendingEntertainmentTool,
];
