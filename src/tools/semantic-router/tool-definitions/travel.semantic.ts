/**
 * Travel Tool Definitions for Semantic Router
 *
 * Routes travel-related queries - flights, hotels, trip planning.
 *
 * @module tools/semantic-router/tool-definitions/travel
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SEARCH FLIGHTS
// ============================================================================

export const searchFlightsTool: SemanticToolDefinition = {
  id: 'travel_search_flights',
  name: 'Search Flights',
  description: 'Search for flights between destinations.',
  shortDescription: 'search flights',
  category: 'travel',

  triggers: {
    phrases: [
      'search for flights',
      'find flights',
      'look up flights',
      'flights to',
      'fly to',
      'book a flight',
      'flight prices',
      'airfare to',
      'plane tickets',
    ],
    patterns: [
      /^(?:search|find|look\s+up)(?:\s+for)?\s+flights?\s+(?:to|from)\s+(.+)/i,
      /^(?:how\s+much\s+(?:are|is|to)\s+)?fly(?:ing)?\s+to\s+(.+)/i,
      /^flights?\s+(?:to|from)\s+(.+?)(?:\s+to\s+(.+))?/i,
      /^(?:book|get)\s+(?:a\s+)?flight\s+to\s+(.+)/i,
      /^(?:plane|airline)\s+tickets?\s+to\s+(.+)/i,
    ],
    keywords: [
      { word: 'flight', weight: 1.0 },
      { word: 'flights', weight: 1.0 },
      { word: 'fly', weight: 0.9 },
      { word: 'airplane', weight: 0.8 },
      { word: 'airline', weight: 0.8 },
      { word: 'airfare', weight: 0.9 },
      { word: 'plane tickets', weight: 0.9 },
      { word: 'book', weight: 0.5 },
    ],
    antiKeywords: ['hotel', 'lodging', 'restaurant', 'car rental', 'train', 'bus'],
  },

  examples: [
    'Search for flights to Paris',
    'Find flights from NYC to LA next week',
    'How much to fly to Tokyo?',
    'Flights to London in March',
  ],

  counterExamples: ['Book a hotel', 'Find restaurants', 'Rent a car', 'Train to Boston'],

  arguments: [
    {
      name: 'origin',
      type: 'string',
      description: 'Departure city or airport code',
      required: false,
      extractionPatterns: [/from\s+(.+?)(?:\s+to|\s*$)/i],
    },
    {
      name: 'destination',
      type: 'string',
      description: 'Arrival city or airport code',
      required: true,
      extractionPatterns: [
        /to\s+(.+?)(?:\s+(?:on|in|for|next|this)|\s*$)/i,
        /flights?\s+(.+?)(?:\s*$)/i,
      ],
    },
    {
      name: 'departureDate',
      type: 'string',
      description: 'Departure date',
      required: false,
      extractionPatterns: [
        /(?:on|for)\s+(.+?)(?:\s*$)/i,
        /(?:in|next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|january|february|march|april|may|june|july|august|september|october|november|december)/i,
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
      toolId: 'searchFlights',
      args,
      delegateTo: 'domains/travel',
    };
  },
};

// ============================================================================
// SEARCH HOTELS
// ============================================================================

export const searchHotelsTool: SemanticToolDefinition = {
  id: 'travel_search_hotels',
  name: 'Search Hotels',
  description: 'Search for hotels in a destination.',
  shortDescription: 'search hotels',
  category: 'travel',

  triggers: {
    phrases: [
      'search for hotels',
      'find hotels',
      'hotels in',
      'book a hotel',
      'places to stay',
      'accommodation in',
      'lodging in',
      'where to stay',
    ],
    patterns: [
      /^(?:search|find|look\s+up)(?:\s+for)?\s+hotels?\s+(?:in|near|at)\s+(.+)/i,
      /^hotels?\s+(?:in|near|at)\s+(.+)/i,
      /^(?:book|get)\s+(?:a\s+)?(?:hotel|room)\s+(?:in|at|near)\s+(.+)/i,
      /^(?:places?|where)\s+to\s+stay\s+(?:in|near)\s+(.+)/i,
      /^(?:accommodation|lodging)\s+(?:in|near|at)\s+(.+)/i,
    ],
    keywords: [
      { word: 'hotel', weight: 1.0 },
      { word: 'hotels', weight: 1.0 },
      { word: 'accommodation', weight: 0.9 },
      { word: 'lodging', weight: 0.9 },
      { word: 'stay', weight: 0.7 },
      { word: 'room', weight: 0.7 },
      { word: 'book', weight: 0.5 },
    ],
    antiKeywords: ['flight', 'airplane', 'restaurant', 'car rental', 'airfare'],
  },

  examples: [
    'Find hotels in Paris',
    'Search for hotels near Times Square',
    'Book a hotel in Tokyo for next week',
    'Where to stay in Barcelona?',
  ],

  counterExamples: ['Book a flight', 'Find restaurants', 'Rent a car', 'Search for flights'],

  arguments: [
    {
      name: 'destination',
      type: 'string',
      description: 'City or area to search',
      required: true,
      extractionPatterns: [/(?:in|near|at)\s+(.+?)(?:\s+(?:for|on|from)|\s*$)/i],
    },
    {
      name: 'checkIn',
      type: 'string',
      description: 'Check-in date',
      required: false,
    },
    {
      name: 'checkOut',
      type: 'string',
      description: 'Check-out date',
      required: false,
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
      toolId: 'searchHotels',
      args,
      delegateTo: 'domains/travel',
    };
  },
};

// ============================================================================
// PLAN TRIP
// ============================================================================

export const planTripTool: SemanticToolDefinition = {
  id: 'travel_plan_trip',
  name: 'Plan Trip',
  description: 'Create and save a trip plan.',
  shortDescription: 'plan trip',
  category: 'travel',

  triggers: {
    phrases: [
      'plan a trip',
      'plan my trip',
      'trip to',
      'vacation to',
      'travel to',
      'going to',
      'planning a vacation',
      'help me plan',
    ],
    patterns: [
      /^(?:plan|organize|schedule)\s+(?:a|my)?\s*(?:trip|vacation|travel)\s+to\s+(.+)/i,
      /^(?:i(?:'m|m)?\s+)?(?:planning|going)\s+(?:a\s+)?(?:trip|vacation)\s+to\s+(.+)/i,
      /^(?:help\s+me\s+)?plan\s+(?:a|my)?\s*(?:trip|vacation)/i,
      /^(?:trip|vacation)\s+to\s+(.+)/i,
    ],
    keywords: [
      { word: 'plan', weight: 0.9 },
      { word: 'trip', weight: 1.0 },
      { word: 'vacation', weight: 1.0 },
      { word: 'travel', weight: 0.8 },
      { word: 'itinerary', weight: 0.9 },
      { word: 'destination', weight: 0.7 },
    ],
    antiKeywords: ['flight', 'hotel', 'restaurant', 'work', 'meeting'],
  },

  examples: [
    'Plan a trip to Hawaii',
    'Help me plan my vacation to Italy',
    "I'm planning a trip to Japan next spring",
    'Trip to Costa Rica in March',
  ],

  counterExamples: ['Search for flights', 'Book a hotel', 'Plan a meeting', 'Schedule a call'],

  arguments: [
    {
      name: 'destination',
      type: 'string',
      description: 'Destination',
      required: true,
      extractionPatterns: [/to\s+(.+?)(?:\s+(?:in|for|on|next|this)|\s*$)/i],
    },
    {
      name: 'startDate',
      type: 'string',
      description: 'Start date',
      required: false,
    },
    {
      name: 'endDate',
      type: 'string',
      description: 'End date',
      required: false,
    },
    {
      name: 'budget',
      type: 'number',
      description: 'Total budget',
      required: false,
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
      toolId: 'planTrip',
      args,
      delegateTo: 'domains/travel',
    };
  },
};

// ============================================================================
// GET SAVED TRIPS
// ============================================================================

export const getSavedTripsTool: SemanticToolDefinition = {
  id: 'travel_saved_trips',
  name: 'Get Saved Trips',
  description: 'View saved trip plans.',
  shortDescription: 'my trips',
  category: 'travel',

  triggers: {
    phrases: [
      'my trips',
      'show my trips',
      'saved trips',
      'upcoming trips',
      'planned trips',
      'what trips do I have',
      'travel plans',
    ],
    patterns: [
      /^(?:show|list|get|view)\s+(?:my|all|saved|upcoming|planned)\s+trips?/i,
      /^(?:what|which)\s+trips?\s+do\s+i\s+have/i,
      /^my\s+(?:travel\s+)?(?:trips?|plans?|itineraries?)/i,
    ],
    keywords: [
      { word: 'trips', weight: 1.0 },
      { word: 'saved', weight: 0.8 },
      { word: 'upcoming', weight: 0.8 },
      { word: 'planned', weight: 0.8 },
      { word: 'travel plans', weight: 0.9 },
      { word: 'itinerary', weight: 0.7 },
    ],
    antiKeywords: ['plan a', 'search', 'find', 'book'],
  },

  examples: [
    'Show my trips',
    'What trips do I have planned?',
    'My upcoming trips',
    'List saved trips',
  ],

  counterExamples: ['Plan a trip', 'Search for flights', 'Book a hotel'],

  arguments: [],

  confidence: {
    baseScore: 0.85,
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
      toolId: 'getSavedTrips',
      args,
      delegateTo: 'domains/travel',
    };
  },
};

// ============================================================================
// GET TRIP SUGGESTIONS
// ============================================================================

export const getTripSuggestionsTool: SemanticToolDefinition = {
  id: 'travel_suggestions',
  name: 'Get Trip Suggestions',
  description: 'Get destination suggestions based on preferences.',
  shortDescription: 'trip suggestions',
  category: 'travel',

  triggers: {
    phrases: [
      'where should I travel',
      'suggest a destination',
      'trip ideas',
      'vacation ideas',
      'where to go',
      'recommend a place to visit',
      'travel suggestions',
      'destination recommendations',
    ],
    patterns: [
      /^(?:where\s+should\s+i|recommend\s+a\s+place\s+to)\s+(?:travel|go|visit)/i,
      /^(?:suggest|recommend)\s+(?:a\s+)?(?:destination|place|trip|vacation)/i,
      /^(?:trip|vacation|travel|destination)\s+(?:ideas?|suggestions?|recommendations?)/i,
      /^where\s+(?:can|should)\s+i\s+(?:go|travel|visit)/i,
    ],
    keywords: [
      { word: 'suggest', weight: 0.9 },
      { word: 'recommend', weight: 0.9 },
      { word: 'destination', weight: 0.8 },
      { word: 'ideas', weight: 0.7 },
      { word: 'where', weight: 0.6 },
      { word: 'travel', weight: 0.7 },
      { word: 'vacation', weight: 0.8 },
    ],
    antiKeywords: ['flight', 'hotel', 'book', 'search', 'price'],
  },

  examples: [
    'Where should I travel this summer?',
    'Suggest a beach destination',
    'Trip ideas for adventure travel',
    'Recommend a place to visit in Europe',
  ],

  counterExamples: ['Search for flights', 'Book a hotel', 'Flight prices to Paris'],

  arguments: [
    {
      name: 'type',
      type: 'string',
      description: 'Type of trip (beach, city, adventure, relaxation, budget, luxury)',
      required: false,
      extractionPatterns: [/(beach|city|adventure|relaxation|budget|luxury)/i],
    },
    {
      name: 'budget',
      type: 'string',
      description: 'Budget level (budget, moderate, luxury)',
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
      toolId: 'getTripSuggestions',
      args,
      delegateTo: 'domains/travel',
    };
  },
};

// ============================================================================
// GET FLIGHT PRICE
// ============================================================================

export const getFlightPriceTool: SemanticToolDefinition = {
  id: 'travel_flight_price',
  name: 'Get Flight Price',
  description: 'Get quick flight price estimate.',
  shortDescription: 'flight price',
  category: 'travel',

  triggers: {
    phrases: [
      'how much is a flight',
      'flight prices',
      'cost to fly',
      'airfare to',
      'price of flights',
      'cheap flights',
    ],
    patterns: [
      /^how\s+much\s+(?:is|are|does|to)\s+(?:a\s+)?(?:flight|fly)(?:ing)?\s+to\s+(.+)/i,
      /^(?:what(?:'s|s)?|get)\s+(?:the\s+)?(?:flight\s+)?price(?:s)?\s+to\s+(.+)/i,
      /^(?:cheap|budget)\s+flights?\s+to\s+(.+)/i,
      /^(?:cost|price)\s+(?:of\s+)?(?:a\s+)?flight\s+to\s+(.+)/i,
    ],
    keywords: [
      { word: 'price', weight: 0.9 },
      { word: 'cost', weight: 0.9 },
      { word: 'flight', weight: 0.9 },
      { word: 'cheap', weight: 0.8 },
      { word: 'airfare', weight: 0.9 },
      { word: 'how much', weight: 0.8 },
    ],
    antiKeywords: ['hotel', 'restaurant', 'car', 'train'],
  },

  examples: [
    'How much is a flight to Tokyo?',
    'Flight prices to Paris',
    'Cheap flights to Mexico',
    'Cost to fly to London next month',
  ],

  counterExamples: ['Hotel prices', 'Restaurant costs', 'Car rental prices'],

  arguments: [
    {
      name: 'origin',
      type: 'string',
      description: 'From city/airport',
      required: false,
    },
    {
      name: 'destination',
      type: 'string',
      description: 'To city/airport',
      required: true,
      extractionPatterns: [/to\s+(.+?)(?:\s+(?:in|next|this|for)|\s*$)/i],
    },
    {
      name: 'when',
      type: 'string',
      description: 'Approximate time',
      required: false,
      extractionPatterns: [/(?:in|next|this)\s+(.+?)(?:\s*$)/i],
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
      toolId: 'getFlightPrice',
      args,
      delegateTo: 'domains/travel',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const travelTools: SemanticToolDefinition[] = [
  searchFlightsTool,
  searchHotelsTool,
  planTripTool,
  getSavedTripsTool,
  getTripSuggestionsTool,
  getFlightPriceTool,
];
