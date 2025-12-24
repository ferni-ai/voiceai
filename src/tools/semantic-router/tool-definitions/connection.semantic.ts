/**
 * Connection Domain Tool Definitions for Semantic Router
 *
 * Semantic routing for loneliness support, friendship, and belonging.
 * Routes to connection domain tools for emotional support and guidance.
 *
 * @module tools/semantic-router/tool-definitions/connection
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// ACKNOWLEDGE LONELINESS
// ============================================================================

export const acknowledgeLonelinessTool: SemanticToolDefinition = {
  id: 'connection_loneliness',
  name: 'Acknowledge Loneliness',
  description: 'Validate and sit with feelings of loneliness.',
  shortDescription: 'loneliness support',
  category: 'wellness',

  triggers: {
    phrases: [
      "I'm lonely",
      'feeling lonely',
      'so alone',
      'no one to talk to',
      "don't have friends",
      'feel isolated',
      'disconnected',
      'no one cares',
    ],
    patterns: [
      /^(?:I(?:'m|\s+am)\s+)?(?:feeling\s+)?(?:so\s+)?lonely/i,
      /^(?:I\s+)?feel\s+(?:so\s+)?(?:alone|isolated|disconnected)/i,
      /^(?:I\s+)?(?:don(?:'t|ot)\s+have|have\s+no)\s+(?:any\s+)?friends/i,
      /^no\s+one\s+(?:to\s+talk\s+to|cares|understands)/i,
      /^(?:I(?:'m|\s+am)\s+)?(?:all\s+)?alone/i,
      /^(?:I\s+)?feel\s+(?:like\s+)?no\s+one\s+(?:gets|understands)\s+me/i,
    ],
    keywords: [
      { word: 'lonely', weight: 1.0 },
      { word: 'alone', weight: 1.0 },
      { word: 'isolated', weight: 0.9 },
      { word: 'disconnected', weight: 0.9 },
      { word: 'no friends', weight: 1.0 },
    ],
    antiKeywords: ['make friends', 'how to', 'find', 'meet', 'want to'],
  },

  examples: [
    "I'm so lonely",
    'I feel completely alone',
    "I don't have any friends",
    'No one to talk to',
    'I feel disconnected from everyone',
    'No one understands me',
  ],

  counterExamples: [
    'How do I make friends?',
    'I want to meet people',
    'Help me find friends',
    "I'm going to a party",
  ],

  arguments: [
    {
      name: 'howLonelyFeels',
      type: 'string',
      description: 'How their loneliness feels',
      required: false,
      extractionPatterns: [/feel(?:ing|s?)?\s+(.+)/i],
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
      toolId: 'acknowledgeLoneliness',
      args,
      delegateTo: 'domains/connection',
    };
  },
};

// ============================================================================
// SIT WITH LONELINESS (PRESENCE)
// ============================================================================

export const sitWithLonelinessTool: SemanticToolDefinition = {
  id: 'connection_presence',
  name: 'Sit With Loneliness',
  description: 'Companion presence for acute loneliness moments.',
  shortDescription: 'be here with me',
  category: 'wellness',

  triggers: {
    phrases: [
      'just be here',
      'sit with me',
      'stay with me',
      "don't leave me",
      'I need someone',
      'need company',
      'be with me',
    ],
    patterns: [
      /^(?:just\s+)?(?:be|stay)\s+(?:here\s+)?with\s+me/i,
      /^(?:please\s+)?don(?:'t|ot)\s+(?:leave|go)/i,
      /^(?:I\s+)?(?:just\s+)?need\s+(?:someone|company|you)/i,
      /^(?:can\s+you\s+)?sit\s+with\s+me/i,
      /^I\s+(?:don(?:'t|ot)\s+want\s+to\s+be|just\s+need\s+someone\s+to\s+be)\s+alone/i,
    ],
    keywords: [
      { word: 'here', weight: 0.7 },
      { word: 'with me', weight: 1.0 },
      { word: 'stay', weight: 0.9 },
      { word: 'need someone', weight: 1.0 },
      { word: 'alone', weight: 0.8 },
    ],
    antiKeywords: ['make friends', 'how to', 'find', 'meet', 'tips'],
  },

  examples: [
    'Just be here with me',
    "I don't want to be alone right now",
    'Stay with me',
    'I just need someone',
    'Can you sit with me?',
  ],

  counterExamples: [
    'How do I make friends?',
    'I want to meet people',
    'Tips for being less lonely',
    'How can I connect with others?',
  ],

  arguments: [
    {
      name: 'rightNow',
      type: 'string',
      description: "What they're feeling right now",
      required: false,
      extractionPatterns: [/feel(?:ing)?\s+(.+)/i, /(?:I(?:'m|\s+am)\s+)(.+)/i],
    },
    {
      name: 'timeOfDay',
      type: 'string',
      description: 'Time of day',
      required: false,
      enumValues: ['late-night', 'morning', 'afternoon', 'evening'],
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
      toolId: 'sitWithLoneliness',
      args,
      delegateTo: 'domains/connection',
    };
  },
};

// ============================================================================
// MAKE ADULT FRIENDS
// ============================================================================

export const makeAdultFriendsTool: SemanticToolDefinition = {
  id: 'connection_make_friends',
  name: 'Make Adult Friends',
  description: 'Help with making friends as an adult.',
  shortDescription: 'make friends',
  category: 'wellness',

  triggers: {
    phrases: [
      'make friends',
      'how to make friends',
      'meet new people',
      'find friends',
      'hard to make friends',
      'want friends',
      "don't know how to make friends",
    ],
    patterns: [
      /^(?:how\s+(?:do\s+I|can\s+I|to)\s+)?make\s+(?:new\s+)?friends/i,
      /^(?:I\s+)?(?:want|need)\s+(?:to\s+)?(?:make|find)\s+friends/i,
      /^(?:it(?:'s)?\s+)?hard\s+to\s+make\s+friends/i,
      /^(?:how\s+(?:do\s+I|can\s+I)\s+)?meet\s+(?:new\s+)?people/i,
      /^(?:I\s+)?(?:don(?:'t|ot)\s+know\s+)?how\s+to\s+make\s+friends/i,
      /^(?:help\s+me\s+)?(?:find|make)\s+friends/i,
    ],
    keywords: [
      { word: 'friends', weight: 1.0 },
      { word: 'make', weight: 0.8 },
      { word: 'meet', weight: 0.8 },
      { word: 'people', weight: 0.7 },
      { word: 'new', weight: 0.5 },
    ],
    antiKeywords: ['lonely', 'alone', 'isolated', 'sad', 'maintain', 'keep'],
  },

  examples: [
    'How do I make friends as an adult?',
    'I want to make new friends',
    "It's hard to make friends",
    'Help me meet new people',
    "I don't know how to make friends",
  ],

  counterExamples: [
    "I'm so lonely",
    'I feel isolated',
    "I don't have friends",
    'How do I keep friendships?',
  ],

  arguments: [
    {
      name: 'mainBarrier',
      type: 'string',
      description: 'Main barrier to making friends',
      required: false,
      enumValues: ['time', 'proximity', 'vulnerability', 'depth', 'energy', 'unsure'],
      extractionPatterns: [/(no\s+time|busy|scared|nervous|tired|shy)/i],
    },
    {
      name: 'currentSituation',
      type: 'string',
      description: 'Current social situation',
      required: false,
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
      toolId: 'makeAdultFriends',
      args,
      delegateTo: 'domains/connection',
    };
  },
};

// ============================================================================
// MAINTAIN FRIENDSHIPS
// ============================================================================

export const maintainFriendshipsTool: SemanticToolDefinition = {
  id: 'connection_maintain',
  name: 'Maintain Friendships',
  description: 'Keep existing friendships alive.',
  shortDescription: 'keep friendships',
  category: 'wellness',

  triggers: {
    phrases: [
      'keep friendships',
      'maintain friendships',
      'stay in touch',
      'losing friends',
      'drifting apart',
      'neglecting friends',
      'reach out to friends',
    ],
    patterns: [
      /^(?:how\s+(?:do\s+I|can\s+I|to)\s+)?(?:keep|maintain)\s+friendships/i,
      /^(?:I(?:'m|\s+am)\s+)?(?:losing|drifting\s+from)\s+(?:my\s+)?friends/i,
      /^stay\s+in\s+touch\s+(?:with\s+friends)?/i,
      /^(?:I\s+)?(?:haven(?:'t|'t))\s+(?:talked\s+to|seen)\s+(?:my\s+)?friends/i,
      /^(?:help\s+me\s+)?(?:keep|nurture)\s+(?:my\s+)?friendships/i,
    ],
    keywords: [
      { word: 'maintain', weight: 1.0 },
      { word: 'keep', weight: 0.9 },
      { word: 'touch', weight: 0.7 },
      { word: 'friends', weight: 0.8 },
      { word: 'drifting', weight: 0.9 },
    ],
    antiKeywords: ['make', 'new', 'meet', 'lonely', 'alone'],
  },

  examples: [
    'How do I maintain friendships?',
    "I feel like I'm losing my friends",
    'Help me stay in touch with friends',
    "I haven't talked to my friends in months",
    "We're drifting apart",
  ],

  counterExamples: [
    'How do I make new friends?',
    "I'm lonely",
    'I want to meet people',
    "I don't have friends",
  ],

  arguments: [
    {
      name: 'friendshipStatus',
      type: 'string',
      description: 'Status of friendships',
      required: false,
    },
    {
      name: 'barrier',
      type: 'string',
      description: "What's getting in the way",
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
      toolId: 'maintainFriendships',
      args,
      delegateTo: 'domains/connection',
    };
  },
};

// ============================================================================
// FIND YOUR PEOPLE / BELONGING
// ============================================================================

export const findYourPeopleTool: SemanticToolDefinition = {
  id: 'connection_belonging',
  name: 'Find Your People',
  description: 'Help finding community and belonging.',
  shortDescription: 'find community',
  category: 'wellness',

  triggers: {
    phrases: [
      "don't belong",
      'find my people',
      'find my tribe',
      'where to find friends',
      'community',
      'fit in',
      "don't fit in",
    ],
    patterns: [
      /^(?:I\s+)?(?:don(?:'t|ot)\s+)?(?:feel\s+like\s+I\s+)?belong/i,
      /^(?:where\s+(?:do\s+I|can\s+I)\s+)?find\s+(?:my\s+)?(?:people|tribe|community)/i,
      /^(?:I\s+)?(?:don(?:'t|ot)\s+)?fit\s+in/i,
      /^(?:how\s+(?:do\s+I|can\s+I)\s+)?find\s+(?:a\s+)?community/i,
      /^(?:I\s+)?(?:want|need)\s+(?:to\s+find\s+)?(?:my\s+)?(?:people|tribe)/i,
    ],
    keywords: [
      { word: 'belong', weight: 1.0 },
      { word: 'community', weight: 1.0 },
      { word: 'tribe', weight: 0.9 },
      { word: 'people', weight: 0.7 },
      { word: 'fit in', weight: 0.9 },
    ],
    antiKeywords: ['lonely', 'alone', 'make friends', 'maintain'],
  },

  examples: [
    "I don't feel like I belong anywhere",
    'How do I find my people?',
    "I don't fit in",
    'I want to find a community',
    'Where can I find my tribe?',
  ],

  counterExamples: ["I'm lonely", 'How do I make friends?', 'Keep my friendships', 'Stay in touch'],

  arguments: [
    {
      name: 'whatMatters',
      type: 'string',
      description: 'What matters most to them',
      required: false,
    },
    {
      name: 'interests',
      type: 'array',
      description: 'Their interests',
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
      toolId: 'findYourPeople',
      args,
      delegateTo: 'domains/connection',
    };
  },
};

// ============================================================================
// CONNECTION HEALTH ASSESSMENT
// ============================================================================

export const connectionHealthTool: SemanticToolDefinition = {
  id: 'connection_health',
  name: 'Connection Health',
  description: 'Assess overall relationship and connection health.',
  shortDescription: 'relationship check',
  category: 'wellness',

  triggers: {
    phrases: [
      'how are my relationships',
      'am I connected',
      'connection health',
      'relationship health',
      'social life check',
      'am I isolated',
    ],
    patterns: [
      /^(?:how\s+(?:are|is)\s+)?(?:my\s+)?(?:social|relationship|connection)\s+(?:health|life)/i,
      /^(?:am\s+I\s+)?(?:too\s+)?isolated/i,
      /^(?:check|assess)\s+(?:my\s+)?(?:connections?|relationships?)/i,
      /^(?:do\s+I\s+have\s+)?enough\s+(?:friends|connections?|relationships?)/i,
    ],
    keywords: [
      { word: 'relationships', weight: 0.9 },
      { word: 'connections', weight: 0.9 },
      { word: 'social', weight: 0.8 },
      { word: 'health', weight: 0.7 },
      { word: 'isolated', weight: 0.8 },
    ],
    antiKeywords: ['lonely', 'make friends', 'find', 'meet'],
  },

  examples: [
    'How are my relationships?',
    'Am I too isolated?',
    'Check my connection health',
    'Is my social life healthy?',
    'Do I have enough connections?',
  ],

  counterExamples: ["I'm lonely", 'Help me make friends', 'Find my people', 'I need company'],

  arguments: [
    {
      name: 'selfAssessment',
      type: 'string',
      description: 'Self-assessment of connection level',
      required: false,
      enumValues: ['isolated', 'somewhat-connected', 'well-connected', 'unsure'],
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
      toolId: 'assessConnectionHealth',
      args,
      delegateTo: 'domains/connection',
    };
  },
};

// ============================================================================
// SMALL ACTS OF CONNECTION
// ============================================================================

export const smallActsOfConnectionTool: SemanticToolDefinition = {
  id: 'connection_small_acts',
  name: 'Small Acts of Connection',
  description: 'Suggest small, doable connection practices.',
  shortDescription: 'connection ideas',
  category: 'wellness',

  triggers: {
    phrases: [
      'small ways to connect',
      'quick connection',
      'easy ways to connect',
      'connect with someone',
      'reach out to someone',
      'simple connection ideas',
    ],
    patterns: [
      /^(?:small|quick|easy|simple)\s+(?:ways?\s+to\s+)?connect/i,
      /^(?:how\s+(?:can\s+I|do\s+I)\s+)?(?:quickly\s+)?connect\s+(?:with\s+someone)?/i,
      /^(?:help\s+me\s+)?reach\s+out\s+(?:to\s+someone)?/i,
      /^(?:give\s+me\s+)?(?:some\s+)?connection\s+ideas/i,
    ],
    keywords: [
      { word: 'connect', weight: 1.0 },
      { word: 'reach out', weight: 0.9 },
      { word: 'small', weight: 0.7 },
      { word: 'quick', weight: 0.7 },
      { word: 'easy', weight: 0.7 },
    ],
    antiKeywords: ['lonely', 'alone', 'make friends', 'find community'],
  },

  examples: [
    'Give me small ways to connect',
    'How can I quickly connect with someone?',
    'Easy connection ideas',
    'Help me reach out to someone',
    'Simple ways to connect',
  ],

  counterExamples: ["I'm lonely", 'Help me make friends', 'Find my people', 'I want a community'],

  arguments: [
    {
      name: 'timeAvailable',
      type: 'string',
      description: 'Time available',
      required: false,
      enumValues: ['2-minutes', '15-minutes', '1-hour', 'more'],
    },
    {
      name: 'energyLevel',
      type: 'string',
      description: 'Energy level',
      required: false,
      enumValues: ['low', 'medium', 'high'],
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
      toolId: 'smallActsOfConnection',
      args,
      delegateTo: 'domains/connection',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const connectionTools: SemanticToolDefinition[] = [
  acknowledgeLonelinessTool,
  sitWithLonelinessTool,
  makeAdultFriendsTool,
  maintainFriendshipsTool,
  findYourPeopleTool,
  connectionHealthTool,
  smallActsOfConnectionTool,
];
