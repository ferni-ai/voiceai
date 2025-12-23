/**
 * Information Tool Definitions for Semantic Router
 *
 * Semantic routing for general information queries.
 * Routes to time, date, news, and search tools.
 *
 * @module tools/semantic-router/tool-definitions/information
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// TIME
// ============================================================================

export const timeTool: SemanticToolDefinition = {
  id: 'info_time',
  name: 'Current Time',
  description: 'Gets the current time, optionally for a specific timezone.',
  shortDescription: 'check the time',
  category: 'information',

  triggers: {
    phrases: ['what time is it', "what's the time", 'current time', 'tell me the time', 'time in'],
    patterns: [
      /^what(?:'s| is)\s+the\s+time/i,
      /^(?:what\s+)?time\s+is\s+it/i,
      /^(?:what(?:'s| is)\s+the\s+)?time\s+in\s+(.+)/i,
      /^(?:tell|give)\s+me\s+the\s+time/i,
    ],
    keywords: [
      { word: 'time', weight: 1.0 },
      { word: 'clock', weight: 0.8 },
      { word: 'hour', weight: 0.6 },
    ],
    antiKeywords: ['weather', 'calendar', 'schedule', 'meeting'],
  },

  examples: [
    'What time is it?',
    "What's the time?",
    'Time in Tokyo',
    'What time is it in New York?',
    'Tell me the time',
    'Current time',
  ],

  counterExamples: [
    "What's the weather?",
    "What's on my calendar?",
    'Do I have time for a meeting?',
  ],

  arguments: [
    {
      name: 'timezone',
      type: 'string',
      description: 'Timezone or city',
      required: false,
      extractionPatterns: [/time\s+in\s+(.+)/i],
      entityType: 'location',
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
      toolId: 'info_time',
      args,
      delegateTo: 'domains/information',
    };
  },
};

// ============================================================================
// DATE
// ============================================================================

export const dateTool: SemanticToolDefinition = {
  id: 'info_date',
  name: 'Current Date',
  description: 'Gets the current date or day of the week.',
  shortDescription: 'check the date',
  category: 'information',

  triggers: {
    phrases: [
      "what's today's date",
      'what date is it',
      'what day is it',
      'what day is today',
      "today's date",
      'current date',
    ],
    patterns: [
      /^what(?:'s|\s+is)\s+(?:today(?:'s)?\s+)?date/i,
      /^what\s+(?:day|date)\s+is\s+(?:it|today)/i,
      /^(?:tell|give)\s+me\s+(?:the\s+)?(?:date|day)/i,
      /^(?:is\s+)?today\s+(\w+day)/i,
    ],
    keywords: [
      { word: 'date', weight: 1.0 },
      { word: 'day', weight: 0.9 },
      { word: 'today', weight: 0.7 },
    ],
    antiKeywords: ['weather', 'calendar', 'meeting', 'time'],
  },

  examples: [
    "What's today's date?",
    'What day is it?',
    'What date is it?',
    'Is today Friday?',
    "What's the date today?",
    'Current date',
  ],

  counterExamples: [
    "What's the time?",
    "What's on my calendar today?",
    "What's the weather today?",
  ],

  arguments: [],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    _args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'info_date',
      args: {},
      delegateTo: 'domains/information',
    };
  },
};

// ============================================================================
// NEWS
// ============================================================================

export const newsTool: SemanticToolDefinition = {
  id: 'info_news',
  name: 'News',
  description: 'Gets current news headlines or news about a specific topic.',
  shortDescription: 'get news updates',
  category: 'information',

  triggers: {
    phrases: [
      "what's the news",
      'news today',
      'headlines',
      'current events',
      'top stories',
      'news about',
      'any news on',
    ],
    patterns: [
      /^(?:what(?:'s| is)|get|show)\s+(?:the\s+)?(?:latest\s+)?news/i,
      /^(?:any\s+)?news\s+(?:about|on)\s+(.+)/i,
      /^(?:tell\s+me\s+)?(?:the\s+)?(?:top\s+)?(?:headlines|stories)/i,
      /^(?:what(?:'s| is)\s+)?(?:happening|going\s+on)\s+(?:in\s+the\s+world|today)/i,
    ],
    keywords: [
      { word: 'news', weight: 1.0 },
      { word: 'headlines', weight: 0.9 },
      { word: 'stories', weight: 0.7 },
      { word: 'current events', weight: 0.8 },
      { word: 'happening', weight: 0.5 },
    ],
    antiKeywords: ['weather', 'calendar', 'music'],
  },

  examples: [
    "What's the news?",
    'Top headlines',
    'News about technology',
    "What's happening in the world?",
    'Any news on the stock market?',
    "What's going on today?",
    'Latest news',
  ],

  counterExamples: ["What's the weather?", 'Play music', "What's on my calendar?"],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'News topic to search for',
      required: false,
      extractionPatterns: [/news\s+(?:about|on)\s+(.+)/i, /headlines\s+(?:about|on)\s+(.+)/i],
    },
    {
      name: 'category',
      type: 'string',
      description: 'News category',
      required: false,
      enumValues: [
        'general',
        'business',
        'technology',
        'sports',
        'entertainment',
        'health',
        'science',
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
      toolId: 'info_news',
      args,
      delegateTo: 'domains/information',
    };
  },
};

// ============================================================================
// SEARCH / LOOKUP
// ============================================================================

export const searchTool: SemanticToolDefinition = {
  id: 'info_search',
  name: 'Search',
  description: 'Search for information about any topic.',
  shortDescription: 'search for info',
  category: 'information',

  triggers: {
    phrases: ['search for', 'look up', 'find out', 'google', 'what is', 'who is', 'tell me about'],
    patterns: [
      /^(?:search|look\s+up|find)\s+(?:for\s+)?(.+)/i,
      /^(?:can\s+you\s+)?(?:google|search)\s+(.+)/i,
      /^what\s+is\s+(?:a\s+)?(.+)/i,
      /^who\s+is\s+(.+)/i,
      /^tell\s+me\s+about\s+(.+)/i,
      /^(?:i\s+)?(?:want\s+to\s+)?(?:know|learn)\s+(?:about\s+)?(.+)/i,
    ],
    keywords: [
      { word: 'search', weight: 0.9 },
      { word: 'look up', weight: 0.9 },
      { word: 'find', weight: 0.6 },
      { word: 'google', weight: 1.0 },
      { word: 'what is', weight: 0.7 },
      { word: 'who is', weight: 0.7 },
    ],
    antiKeywords: ['weather', 'calendar', 'music', 'habit', 'remember'],
  },

  examples: [
    'Search for the capital of France',
    'Look up Albert Einstein',
    'What is photosynthesis?',
    'Who is the president of France?',
    'Tell me about the Roman Empire',
    'Google how to make pasta',
  ],

  counterExamples: ["What's the weather?", 'Play music', "What's on my calendar?", 'Remember this'],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'What to search for',
      required: true,
      extractionPatterns: [
        /(?:search|look\s+up|find)\s+(?:for\s+)?(.+)/i,
        /(?:what|who)\s+is\s+(?:a\s+)?(.+)/i,
        /(?:tell\s+me|learn)\s+about\s+(.+)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.75, // Lower base - should be a fallback
    patternMatchBonus: 0.15,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'info_search',
      args,
      delegateTo: 'domains/information',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const informationTools: SemanticToolDefinition[] = [
  timeTool,
  dateTool,
  newsTool,
  searchTool,
];
