/**
 * Local Search Tool Definitions for Semantic Router
 *
 * Routes local business discovery queries.
 * Source: Google Places. Yelp was removed 2026-10-30 (its API terms ban
 * generative-model use), with the Yelp-only review and phone-lookup tools.
 *
 * @module tools/semantic-router/tool-definitions/local-search
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SEARCH LOCAL BUSINESSES
// ============================================================================

export const searchLocalBusinessesTool: SemanticToolDefinition = {
  id: 'search_local_businesses',
  name: 'Search Local Businesses',
  description: 'Search for local businesses like restaurants, shops, gyms, salons.',
  shortDescription: 'find local businesses',
  category: 'local-search',

  triggers: {
    phrases: [
      'find a place',
      'search for',
      'looking for a',
      'where can I find',
      'nearby',
      'around here',
      'close to me',
      'in my area',
      'local',
      'best place for',
    ],
    patterns: [
      /^(?:find|search|look)\s+(?:for\s+)?(?:a\s+)?(?:good\s+)?(.+?)\s+(?:near|in|around)\s+/i,
      /^(?:where|what)\s+(?:is|are)\s+(?:the\s+)?(?:best|good|nearest)\s+(.+?)\s+(?:near|in|around)/i,
      /^(?:any|got\s+any)\s+(?:good\s+)?(.+?)\s+(?:nearby|around\s+here)/i,
      /^(?:looking\s+for|need)\s+(?:a\s+)?(.+?)\s+(?:near|in|around)/i,
      /^(?:what|where)\s+are\s+(?:some\s+)?(?:good\s+)?(.+?)\s+(?:options?|places?)\s+(?:near|in)/i,
    ],
    keywords: [
      { word: 'nearby', weight: 1.0 },
      { word: 'near', weight: 0.9 },
      { word: 'local', weight: 0.9 },
      { word: 'around', weight: 0.7 },
      { word: 'find', weight: 0.5 },
      { word: 'search', weight: 0.5 },
      { word: 'place', weight: 0.6 },
      { word: 'shop', weight: 0.7 },
      { word: 'store', weight: 0.7 },
      { word: 'gym', weight: 0.8 },
      { word: 'salon', weight: 0.8 },
      { word: 'spa', weight: 0.8 },
      { word: 'dentist', weight: 0.8 },
      { word: 'doctor', weight: 0.7 },
      { word: 'mechanic', weight: 0.8 },
      { word: 'plumber', weight: 0.8 },
    ],
    antiKeywords: ['online', 'website', 'app', 'download'],
  },

  examples: [
    'Find a coffee shop near me',
    'Search for gyms in downtown',
    'Looking for a good hair salon nearby',
    'Where can I find a dentist in Brooklyn?',
    'Best mechanic around here',
    'Find pet stores near 94102',
    'Any good spas in the area?',
    'Looking for a dry cleaner close by',
  ],

  counterExamples: [
    'Search Google for recipes',
    'Find information online',
    'Download an app',
    'Search for a website',
  ],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'What to search for',
      required: true,
      extractionPatterns: [
        /(?:find|search|look)\s+(?:for\s+)?(?:a\s+)?(?:good\s+)?(.+?)\s+(?:near|in|around|on)/i,
        /(?:looking\s+for|need)\s+(?:a\s+)?(.+?)\s+(?:near|in|around)/i,
      ],
    },
    {
      name: 'location',
      type: 'string',
      description: "Where to search (defaults to the caller's location)",
      required: false,
      extractionPatterns: [/(?:near|in|around)\s+(.+?)$/i, /(?:nearby|close\s+to)\s+(.+?)$/i],
    },
    {
      name: 'openNow',
      type: 'boolean',
      description: 'Only show places that are open',
      required: false,
      extractionPatterns: [/(?:open\s+now|currently\s+open|that\s+is\s+open)/i],
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
      toolId: 'searchLocalBusinesses',
      args,
      delegateTo: 'domains/local-search',
    };
  },
};

// ============================================================================
// FIND RESTAURANTS
// ============================================================================

export const findRestaurantsTool: SemanticToolDefinition = {
  id: 'find_restaurants',
  name: 'Find Restaurants',
  description: 'Find restaurants with ratings, review counts, and open status.',
  shortDescription: 'find restaurants',
  category: 'local-search',

  triggers: {
    phrases: [
      'find a restaurant',
      'restaurant near',
      'place to eat',
      'good food',
      'where to eat',
      'dinner spot',
      'lunch place',
      'breakfast spot',
      'brunch',
      'good eats',
    ],
    patterns: [
      /^(?:find|search)\s+(?:for\s+)?(?:a\s+)?(?:good\s+)?(.+?)\s+restaurant/i,
      /^(?:where|what)\s+(?:is|are)\s+(?:some\s+)?(?:good\s+)?(.+?)\s+(?:restaurants?|places?\s+to\s+eat)/i,
      /^(?:find|looking\s+for)\s+(?:a\s+)?place\s+(?:to\s+eat|for\s+dinner|for\s+lunch)/i,
      /^(?:what's|where's)\s+(?:a\s+)?good\s+(?:place|spot)\s+(?:to\s+eat|for\s+dinner)/i,
    ],
    keywords: [
      { word: 'restaurant', weight: 1.0 },
      { word: 'restaurants', weight: 1.0 },
      { word: 'eat', weight: 0.8 },
      { word: 'food', weight: 0.7 },
      { word: 'dinner', weight: 0.9 },
      { word: 'lunch', weight: 0.9 },
      { word: 'breakfast', weight: 0.9 },
      { word: 'brunch', weight: 0.9 },
      { word: 'cuisine', weight: 0.8 },
      { word: 'italian', weight: 0.7 },
      { word: 'mexican', weight: 0.7 },
      { word: 'chinese', weight: 0.7 },
      { word: 'japanese', weight: 0.7 },
      { word: 'sushi', weight: 0.8 },
      { word: 'pizza', weight: 0.7 },
      { word: 'thai', weight: 0.7 },
      { word: 'indian', weight: 0.7 },
    ],
    antiKeywords: ['cook', 'recipe', 'make', 'delivery', 'doordash', 'uber eats'],
  },

  examples: [
    'Find Italian restaurants in North Beach',
    'Good sushi places near me',
    'Where should I eat dinner tonight?',
    'Best Mexican food in the Mission',
    'Looking for a romantic restaurant',
    'Find restaurants with outdoor seating',
    'What are good lunch spots downtown?',
    'Thai food near 10001',
  ],

  counterExamples: [
    'Order food delivery',
    'What should I cook?',
    'Recipe for pasta',
    'DoorDash near me',
  ],

  arguments: [
    {
      name: 'cuisine',
      type: 'string',
      description: 'Type of cuisine',
      required: false,
      extractionPatterns: [
        /(italian|mexican|chinese|japanese|indian|thai|french|american|korean|vietnamese|mediterranean|greek|middle\s*eastern|sushi|pizza|bbq|seafood|vegetarian|vegan)\s*(?:restaurant|food|place)?/i,
      ],
    },
    {
      name: 'location',
      type: 'string',
      description: "Where to search (defaults to the caller's location)",
      required: false,
      extractionPatterns: [/(?:in|near|around)\s+(.+?)$/i, /(?:near\s+me|around\s+here|nearby)/i],
    },
    {
      name: 'priceLevel',
      type: 'string',
      description: 'Price range',
      required: false,
      enumValues: ['1', '2', '3', '4'],
      extractionPatterns: [
        /(?:cheap|inexpensive|budget)/i, // -> 1
        /(?:moderate|mid-range|reasonable)/i, // -> 2
        /(?:upscale|fancy|nice)/i, // -> 3
        /(?:expensive|high-end|fine\s*dining)/i, // -> 4
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'findRestaurants',
      args,
      delegateTo: 'domains/local-search',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const localSearchTools: SemanticToolDefinition[] = [
  searchLocalBusinessesTool,
  findRestaurantsTool,
];
