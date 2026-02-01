/**
 * Local Search Tool Definitions for Semantic Router
 *
 * Routes local business discovery queries.
 * Strategy: Google Places (primary) + Yelp (fallback/explicit)
 *
 * Users can say "on Yelp" or "on Google" to use a specific source.
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
  description: 'Search for local businesses like restaurants, shops, gyms, salons using Yelp.',
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
      'on yelp',
      'on google',
      'check yelp',
      'search google for',
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
      { word: 'yelp', weight: 0.9 },
      { word: 'google', weight: 0.8 },
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
    'Check Yelp for pizza places',
    'Search Google for coffee shops',
    'Find restaurants on Yelp',
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
      description: 'Location to search',
      required: true,
      extractionPatterns: [/(?:near|in|around)\s+(.+?)$/i, /(?:nearby|close\s+to)\s+(.+?)$/i],
    },
    {
      name: 'openNow',
      type: 'boolean',
      description: 'Only show places that are open',
      required: false,
      extractionPatterns: [/(?:open\s+now|currently\s+open|that\s+is\s+open)/i],
    },
    {
      name: 'source',
      type: 'string',
      description: 'Explicit source preference',
      required: false,
      enumValues: ['google', 'yelp'],
      extractionPatterns: [/(?:on|check|search)\s+(yelp|google)/i],
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
// FIND RESTAURANTS (Yelp-specific)
// ============================================================================

export const findRestaurantsTool: SemanticToolDefinition = {
  id: 'find_restaurants_yelp',
  name: 'Find Restaurants',
  description: 'Find restaurants with Yelp ratings, reviews, and reservation info.',
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
      description: 'Where to search',
      required: true,
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
// GET BUSINESS REVIEWS
// ============================================================================

export const getBusinessReviewsTool: SemanticToolDefinition = {
  id: 'get_business_reviews',
  name: 'Get Business Reviews',
  description: 'Get customer reviews and ratings for a specific business.',
  shortDescription: 'read reviews',
  category: 'local-search',

  triggers: {
    phrases: [
      'reviews for',
      'what do people say about',
      'is it good',
      'any reviews',
      'how is',
      'what are the reviews',
      'customer feedback',
      'ratings for',
    ],
    patterns: [
      /^(?:what\s+are\s+the\s+)?reviews?\s+(?:for|of)\s+(.+)/i,
      /^(?:is|are)\s+(.+?)\s+(?:good|any\s+good)/i,
      /^(?:what\s+do\s+people\s+say\s+about|how\s+is)\s+(.+)/i,
      /^(?:tell\s+me\s+about|read)\s+reviews?\s+(?:for|of)\s+(.+)/i,
    ],
    keywords: [
      { word: 'review', weight: 1.0 },
      { word: 'reviews', weight: 1.0 },
      { word: 'rating', weight: 0.9 },
      { word: 'ratings', weight: 0.9 },
      { word: 'feedback', weight: 0.7 },
      { word: 'reputation', weight: 0.6 },
      { word: 'good', weight: 0.3 },
    ],
    antiKeywords: ['write', 'leave', 'post', 'submit'],
  },

  examples: [
    'Reviews for Blue Bottle Coffee',
    'What do people say about State Bird Provisions?',
    'Is Tartine any good?',
    'How is the new Thai place on Valencia?',
    'Read reviews for Zuni Cafe',
    'What are the ratings for this restaurant?',
  ],

  counterExamples: ['Write a review', 'Leave a review', 'Post feedback'],

  arguments: [
    {
      name: 'businessName',
      type: 'string',
      description: 'Name of the business',
      required: true,
      extractionPatterns: [
        /reviews?\s+(?:for|of)\s+(.+?)$/i,
        /(?:how\s+is|what\s+about)\s+(.+?)$/i,
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
      toolId: 'getBusinessReviews',
      args,
      delegateTo: 'domains/local-search',
    };
  },
};

// ============================================================================
// LOOKUP BUSINESS BY PHONE
// ============================================================================

export const lookupBusinessByPhoneTool: SemanticToolDefinition = {
  id: 'lookup_business_phone',
  name: 'Lookup Business by Phone',
  description: 'Find what business a phone number belongs to.',
  shortDescription: 'identify business by phone',
  category: 'local-search',

  triggers: {
    phrases: [
      'what business is this',
      'who does this number belong to',
      'look up this number',
      'whose number is',
      'identify this phone number',
      'what place is',
    ],
    patterns: [
      /^(?:what|which)\s+(?:business|place|restaurant)\s+(?:is|has)\s+(?:this|the)\s+(?:phone\s+)?number/i,
      /^(?:who|what)\s+does\s+(?:this|the)\s+number\s+belong\s+to/i,
      /^(?:look\s+up|identify)\s+(?:this\s+)?(?:phone\s+)?number/i,
      /^whose\s+(?:phone\s+)?number\s+is\s+/i,
    ],
    keywords: [
      { word: 'phone', weight: 0.8 },
      { word: 'number', weight: 0.7 },
      { word: 'lookup', weight: 0.6 },
      { word: 'identify', weight: 0.6 },
      { word: 'belong', weight: 0.5 },
    ],
    antiKeywords: ['call', 'dial', 'text'],
  },

  examples: [
    'What business is 415-555-1234?',
    'Look up this phone number',
    'Who does 212-555-0000 belong to?',
    'What place has this number: (650) 555-1234?',
    'Identify this business number',
  ],

  counterExamples: ['Call this number', 'Dial 555-1234', 'Text this number'],

  arguments: [
    {
      name: 'phone',
      type: 'string',
      description: 'Phone number to look up',
      required: true,
      extractionPatterns: [
        /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/,
        /(\d{10,11})/,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'lookupBusinessByPhone',
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
  getBusinessReviewsTool,
  lookupBusinessByPhoneTool,
];
