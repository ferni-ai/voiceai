/**
 * Traffic Tool Definitions for Semantic Router
 *
 * Routes traffic/directions queries - commute times, navigation, traffic conditions.
 *
 * @module tools/semantic-router/tool-definitions/traffic
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// GET COMMUTE TIME
// ============================================================================

export const getCommuteTimeTool: SemanticToolDefinition = {
  id: 'traffic_commute',
  name: 'Get Commute Time',
  description: 'Get current traffic conditions and travel time between locations.',
  shortDescription: 'check traffic',
  category: 'information',

  triggers: {
    phrases: [
      'how long to get to',
      'how long to',
      'commute time',
      'traffic to',
      'travel time',
      'drive time',
      "what's traffic like",
      'how bad is traffic',
      'ETA',
    ],
    patterns: [
      /^(?:how\s+long\s+(?:will\s+it\s+take|to\s+(?:get|drive|go)))\s+(?:to|from)\s+(.+)/i,
      /^(?:what(?:'s| is))\s+(?:the\s+)?(?:commute|drive|travel)\s+time\s+(?:to|from)\s+(.+)/i,
      /^(?:what(?:'s| is))\s+(?:the\s+)?traffic\s+(?:like\s+)?(?:to|on|from)\s+(.+)/i,
      /^(?:how\s+(?:bad|good)\s+is)\s+(?:the\s+)?traffic\s+(?:to|on)\s+(.+)/i,
      /^(?:traffic|commute)\s+(?:to|from)\s+(.+)/i,
    ],
    keywords: [
      { word: 'traffic', weight: 1.0 },
      { word: 'commute', weight: 0.95 },
      { word: 'drive', weight: 0.7 },
      { word: 'travel time', weight: 0.9 },
      { word: 'ETA', weight: 0.8 },
      { word: 'how long', weight: 0.6 },
      { word: 'get to', weight: 0.6 },
    ],
    antiKeywords: ['directions', 'route', 'map', 'navigate'],
  },

  examples: [
    'How long to get to work?',
    "What's the traffic like to downtown?",
    'Commute time to the airport',
    'How bad is traffic on I-95?',
    "What's my ETA to the office?",
  ],

  counterExamples: ['Give me directions to work', 'Navigate to downtown', 'Map to the airport'],

  arguments: [
    {
      name: 'destination',
      type: 'string',
      description: 'Destination location',
      required: true,
      extractionPatterns: [
        /(?:to|from)\s+(?:the\s+)?(.+?)(?:\s+from|\s*$)/i,
        /traffic\s+(?:to|on)\s+(?:the\s+)?(.+)/i,
      ],
    },
    {
      name: 'origin',
      type: 'string',
      description: 'Starting location (defaults to current/home)',
      required: false,
      extractionPatterns: [/from\s+(?:the\s+)?(.+?)\s+to/i],
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
      toolId: 'getCommuteTime',
      args,
      delegateTo: 'domains/information',
    };
  },
};

// ============================================================================
// GET DIRECTIONS
// ============================================================================

export const getDirectionsTool: SemanticToolDefinition = {
  id: 'traffic_directions',
  name: 'Get Directions',
  description: 'Get turn-by-turn directions between two locations.',
  shortDescription: 'get directions',
  category: 'information',

  triggers: {
    phrases: [
      'directions to',
      'how do I get to',
      'navigate to',
      'route to',
      'take me to',
      'get me to',
      'show me how to get',
    ],
    patterns: [
      /^(?:give\s+me\s+)?directions\s+(?:to|from)\s+(.+)/i,
      /^(?:how\s+do\s+i\s+)?get\s+(?:to|from)\s+(.+)/i,
      /^(?:navigate|route)\s+(?:me\s+)?(?:to|from)\s+(.+)/i,
      /^(?:take|get)\s+me\s+to\s+(.+)/i,
      /^show\s+(?:me\s+)?(?:the\s+)?(?:way|route|directions?)\s+to\s+(.+)/i,
    ],
    keywords: [
      { word: 'directions', weight: 1.0 },
      { word: 'navigate', weight: 0.95 },
      { word: 'route', weight: 0.9 },
      { word: 'how to get', weight: 0.85 },
      { word: 'take me', weight: 0.8 },
      { word: 'way to', weight: 0.7 },
    ],
    antiKeywords: ['traffic', 'commute', 'how long', 'ETA'],
  },

  examples: [
    'Directions to the airport',
    'How do I get to downtown?',
    'Navigate to 123 Main Street',
    'Take me to Starbucks',
    'Show me the way to work',
  ],

  counterExamples: ['How long to get to work?', "What's traffic like?", 'Commute time to airport'],

  arguments: [
    {
      name: 'destination',
      type: 'string',
      description: 'Destination location',
      required: true,
      extractionPatterns: [
        /(?:to|from)\s+(?:the\s+)?(.+?)(?:\s+from|\s*$)/i,
        /(?:navigate|route)\s+(?:me\s+)?to\s+(.+)/i,
        /take\s+me\s+to\s+(.+)/i,
      ],
    },
    {
      name: 'origin',
      type: 'string',
      description: 'Starting location',
      required: false,
    },
    {
      name: 'mode',
      type: 'string',
      description: 'Travel mode',
      required: false,
      enumValues: ['driving', 'walking', 'bicycling', 'transit'],
      extractionPatterns: [
        /(?:by|via)\s+(car|foot|bike|bus|train|transit|walking|driving|bicycling)/i,
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
      toolId: 'getDirections',
      args,
      delegateTo: 'domains/information',
    };
  },
};

// ============================================================================
// SAVE LOCATION
// ============================================================================

export const saveLocationTool: SemanticToolDefinition = {
  id: 'traffic_save_location',
  name: 'Save Location',
  description: 'Save a location with a name for quick access.',
  shortDescription: 'save location',
  category: 'information',

  triggers: {
    phrases: [
      'save location',
      'save address',
      'remember location',
      'set home address',
      'set work address',
      'my home is',
      'my work is',
    ],
    patterns: [
      /^(?:save|remember)\s+(?:this\s+)?(?:location|address|place)\s+as\s+(.+)/i,
      /^(?:set|save)\s+(?:my\s+)?(home|work)\s+(?:address\s+)?(?:to|as)\s+(.+)/i,
      /^(?:my\s+)?(home|work)\s+(?:is|address\s+is)\s+(.+)/i,
    ],
    keywords: [
      { word: 'save', weight: 0.8 },
      { word: 'location', weight: 0.9 },
      { word: 'address', weight: 0.9 },
      { word: 'home', weight: 0.8 },
      { word: 'work', weight: 0.8 },
      { word: 'remember', weight: 0.7 },
    ],
    antiKeywords: ['directions', 'traffic', 'commute'],
  },

  examples: [
    'Save this location as home',
    'Set my work address to 456 Corporate Blvd',
    'My home is 123 Main Street',
    'Remember this place as gym',
  ],

  counterExamples: ['Directions to home', 'Traffic to work', 'How long to get home?'],

  arguments: [
    {
      name: 'name',
      type: 'string',
      description: 'Name for the location (home, work, etc.)',
      required: true,
      extractionPatterns: [
        /(?:as|called)\s+(.+?)$/i,
        /(?:set|save)\s+(?:my\s+)?(.+?)\s+(?:address|to)/i,
      ],
    },
    {
      name: 'address',
      type: 'string',
      description: 'The address to save',
      required: true,
      extractionPatterns: [/(?:to|as|is)\s+(.+?)$/i],
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
      toolId: 'saveLocation',
      args,
      delegateTo: 'domains/information',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const trafficTools: SemanticToolDefinition[] = [
  getCommuteTimeTool,
  getDirectionsTool,
  saveLocationTool,
];
