/**
 * Recommendations Tool Definitions for Semantic Router
 *
 * Routes recommendation queries - books, podcasts, restaurants, etc.
 *
 * @module tools/semantic-router/tool-definitions/recommendations
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// BOOK RECOMMENDATIONS
// ============================================================================

export const bookRecommendationTool: SemanticToolDefinition = {
  id: 'recommend_books',
  name: 'Book Recommendations',
  description: 'Get book recommendations based on interests, mood, or genre.',
  shortDescription: 'recommend a book',
  category: 'recommendations',

  triggers: {
    phrases: [
      'recommend a book',
      'book suggestion',
      'what should I read',
      'good books',
      'book recommendation',
      'reading suggestions',
      'books like',
      'next book to read',
    ],
    patterns: [
      /^(?:recommend|suggest)?\s*(?:me\s+)?(?:a\s+)?(?:good\s+)?book/i,
      /^what\s+(?:book|should\s+i)\s+(?:should\s+i\s+)?read/i,
      /^(?:any|got\s+any)\s+(?:good\s+)?book\s+(?:suggestions?|recommendations?)/i,
      /^(?:looking\s+for|need)\s+(?:a\s+)?(?:good\s+)?book\s+(?:to\s+read)?/i,
    ],
    keywords: [
      { word: 'book', weight: 1.0 },
      { word: 'books', weight: 1.0 },
      { word: 'read', weight: 0.8 },
      { word: 'reading', weight: 0.8 },
      { word: 'novel', weight: 0.9 },
      { word: 'author', weight: 0.6 },
    ],
    antiKeywords: ['audio', 'ebook', 'audiobook', 'cook'],
  },

  examples: [
    'Recommend a good book',
    'What should I read next?',
    'Book suggestions for self-improvement',
    'Books like Atomic Habits',
    'Good fiction books',
    'I need a book recommendation',
  ],

  counterExamples: ['Find audiobooks', 'Read my book to me', 'Cookbook recommendations'],

  arguments: [
    {
      name: 'genre',
      type: 'string',
      description: 'Book genre',
      required: false,
      enumValues: [
        'fiction',
        'nonfiction',
        'self-help',
        'biography',
        'mystery',
        'scifi',
        'fantasy',
        'business',
      ],
      extractionPatterns: [
        /(fiction|nonfiction|non-fiction|self[- ]help|biography|mystery|sci-?fi|fantasy|business)\s+book/i,
      ],
    },
    {
      name: 'similar_to',
      type: 'string',
      description: 'Book or author to find similar recommendations',
      required: false,
      extractionPatterns: [
        /(?:books?\s+)?like\s+["\']?(.+?)["\']?$/i,
        /(?:similar\s+to|by)\s+["\']?(.+?)["\']?$/i,
      ],
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
      toolId: 'recommendBook',
      args,
      delegateTo: 'domains/recommendations',
    };
  },
};

// ============================================================================
// PODCAST RECOMMENDATIONS
// ============================================================================

export const podcastRecommendationTool: SemanticToolDefinition = {
  id: 'recommend_podcasts',
  name: 'Podcast Recommendations',
  description: 'Get podcast recommendations based on interests.',
  shortDescription: 'recommend a podcast',
  category: 'recommendations',

  triggers: {
    phrases: [
      'recommend a podcast',
      'podcast suggestion',
      'good podcasts',
      'podcast recommendation',
      'what podcast should I listen to',
      'podcasts about',
      'podcasts like',
    ],
    patterns: [
      /^(?:recommend|suggest)?\s*(?:me\s+)?(?:a\s+)?(?:good\s+)?podcast/i,
      /^what\s+podcast\s+should\s+i\s+listen\s+to/i,
      /^(?:any|got\s+any)\s+(?:good\s+)?podcast\s+(?:suggestions?|recommendations?)/i,
      /^(?:looking\s+for|need)\s+(?:a\s+)?(?:good\s+)?podcast/i,
    ],
    keywords: [
      { word: 'podcast', weight: 1.0 },
      { word: 'podcasts', weight: 1.0 },
      { word: 'listen', weight: 0.5 },
      { word: 'episode', weight: 0.7 },
    ],
    antiKeywords: ['music', 'song', 'playlist', 'album'],
  },

  examples: [
    'Recommend a good podcast',
    'Podcast suggestions about business',
    'Podcasts like Huberman Lab',
    'What podcast should I listen to?',
    'Good true crime podcasts',
    'Looking for a new podcast',
  ],

  counterExamples: ['Play music', 'Recommend a song', 'Make a playlist'],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'Podcast topic',
      required: false,
      extractionPatterns: [/podcast\s+(?:about|on)\s+(.+?)$/i],
    },
    {
      name: 'category',
      type: 'string',
      description: 'Podcast category',
      required: false,
      enumValues: [
        'business',
        'tech',
        'health',
        'comedy',
        'true_crime',
        'news',
        'education',
        'self_improvement',
      ],
      extractionPatterns: [
        /(business|tech|health|comedy|true\s*crime|news|education|self[- ]improvement)\s+podcast/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'recommendPodcast',
      args,
      delegateTo: 'domains/recommendations',
    };
  },
};

// ============================================================================
// RESTAURANT RECOMMENDATIONS
// ============================================================================

export const restaurantRecommendationTool: SemanticToolDefinition = {
  id: 'recommend_restaurants',
  name: 'Restaurant Recommendations',
  description: 'Get restaurant recommendations for dining.',
  shortDescription: 'recommend a restaurant',
  category: 'recommendations',

  triggers: {
    phrases: [
      'where should I eat',
      'restaurant recommendation',
      'good restaurants',
      'where to eat',
      'food recommendation',
      'dinner suggestions',
      'places to eat',
    ],
    patterns: [
      /^(?:where|what)\s+should\s+(?:i|we)\s+eat/i,
      /^(?:recommend|suggest)?\s*(?:a\s+)?(?:good\s+)?restaurant/i,
      /^(?:any|got\s+any)\s+(?:good\s+)?(?:restaurant|food|dining)\s+(?:suggestions?|recommendations?)/i,
      /^(?:looking\s+for|need)\s+(?:a\s+)?(?:good\s+)?(?:place|restaurant)\s+to\s+eat/i,
    ],
    keywords: [
      { word: 'restaurant', weight: 1.0 },
      { word: 'eat', weight: 0.8 },
      { word: 'dinner', weight: 0.8 },
      { word: 'lunch', weight: 0.8 },
      { word: 'food', weight: 0.6 },
      { word: 'dining', weight: 0.9 },
    ],
    antiKeywords: ['cook', 'recipe', 'make'],
  },

  examples: [
    'Where should I eat tonight?',
    'Recommend a good Italian restaurant',
    'Dinner suggestions nearby',
    'Good restaurants for a date',
    'Where to eat in downtown?',
    'Best sushi place?',
  ],

  counterExamples: ['What should I cook?', 'Give me a recipe', 'How do I make pasta?'],

  arguments: [
    {
      name: 'cuisine',
      type: 'string',
      description: 'Type of cuisine',
      required: false,
      extractionPatterns: [
        /(italian|mexican|chinese|japanese|indian|thai|french|american|sushi|pizza)\s*(?:restaurant|food|place)?/i,
      ],
    },
    {
      name: 'occasion',
      type: 'string',
      description: 'Dining occasion',
      required: false,
      enumValues: ['date', 'family', 'business', 'casual', 'special'],
      extractionPatterns: [/(?:for\s+(?:a\s+)?)(date|family|business|casual|special\s+occasion)/i],
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
      toolId: 'recommendRestaurant',
      args,
      delegateTo: 'domains/recommendations',
    };
  },
};

// ============================================================================
// GIFT RECOMMENDATIONS
// ============================================================================

export const giftRecommendationTool: SemanticToolDefinition = {
  id: 'recommend_gifts',
  name: 'Gift Recommendations',
  description: 'Get gift ideas for different people and occasions.',
  shortDescription: 'gift ideas',
  category: 'recommendations',

  triggers: {
    phrases: [
      'gift ideas',
      'what should I get',
      'gift suggestion',
      'present for',
      'birthday gift',
      'christmas gift',
      'gift recommendation',
    ],
    patterns: [
      /^(?:what|which)\s+(?:gift|present)\s+should\s+i\s+(?:get|buy)/i,
      /^(?:gift|present)\s+(?:ideas?|suggestions?|recommendations?)\s+(?:for)?/i,
      /^(?:what\s+(?:do|can|should)\s+i)\s+(?:get|buy)\s+(?:for\s+)?(?:my\s+)?(.+)/i,
      /^(?:need|looking\s+for)\s+(?:a\s+)?gift\s+(?:idea|for)/i,
    ],
    keywords: [
      { word: 'gift', weight: 1.0 },
      { word: 'present', weight: 1.0 },
      { word: 'birthday', weight: 0.7 },
      { word: 'christmas', weight: 0.7 },
      { word: 'anniversary', weight: 0.7 },
      { word: 'buy', weight: 0.4 },
    ],
    antiKeywords: ['wrap', 'return'],
  },

  examples: [
    'Gift ideas for my mom',
    'What should I get my boyfriend for his birthday?',
    'Christmas gift suggestions',
    'Present for a 5 year old',
    'Anniversary gift ideas',
    'What do you get someone who has everything?',
  ],

  counterExamples: ['How do I wrap a gift?', 'Return a gift'],

  arguments: [
    {
      name: 'recipient',
      type: 'string',
      description: 'Who the gift is for',
      required: false,
      extractionPatterns: [
        /(?:gift|present)\s+(?:for\s+)?(?:my\s+)?(.+?)$/i,
        /(?:get|buy)\s+(?:for\s+)?(?:my\s+)?(.+?)$/i,
      ],
    },
    {
      name: 'occasion',
      type: 'string',
      description: 'Gift occasion',
      required: false,
      enumValues: ['birthday', 'christmas', 'anniversary', 'wedding', 'graduation', 'other'],
      extractionPatterns: [
        /(birthday|christmas|anniversary|wedding|graduation)\s+(?:gift|present)/i,
      ],
    },
    {
      name: 'budget',
      type: 'string',
      description: 'Budget range',
      required: false,
      extractionPatterns: [/(?:under|around|about)\s+\$?(\d+)/i],
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
      toolId: 'recommendGift',
      args,
      delegateTo: 'domains/recommendations',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const recommendationsTools: SemanticToolDefinition[] = [
  bookRecommendationTool,
  podcastRecommendationTool,
  restaurantRecommendationTool,
  giftRecommendationTool,
];
