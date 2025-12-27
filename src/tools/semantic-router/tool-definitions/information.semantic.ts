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
// SPORTS SCORES
// ============================================================================

export const sportsTool: SemanticToolDefinition = {
  id: 'info_sports',
  name: 'Sports Scores',
  description: 'Get live sports scores, game schedules, and team standings.',
  shortDescription: 'check sports scores',
  category: 'information',

  triggers: {
    phrases: [
      'sports score',
      'game score',
      'who won',
      'who is winning',
      'score of the game',
      'how are the',
      'did the',
      'nfl scores',
      'nba scores',
      'mlb scores',
      'nhl scores',
      'football score',
      'basketball score',
      'baseball score',
      'hockey score',
    ],
    patterns: [
      /^(?:what(?:'s| is) the )?score\s+(?:of\s+)?(?:the\s+)?(.+?)(?:\s+game)?$/i,
      /^how\s+(?:are|is|did)\s+(?:the\s+)?(.+?)(?:\s+doing)?$/i,
      /^(?:did|has|have)\s+(?:the\s+)?(.+?)\s+(?:win|won|play|score)/i,
      /^(?:nfl|nba|mlb|nhl|soccer)\s+scores?$/i,
      /^(.+?)\s+(?:score|game)$/i,
      /^who\s+(?:is\s+)?(?:winning|won)(?:\s+the\s+)?(?:.+)?$/i,
      /^when\s+(?:do|does|is|are)\s+(?:the\s+)?(.+?)\s+play/i,
    ],
    keywords: [
      { word: 'score', weight: 1.0 },
      { word: 'game', weight: 0.7 },
      { word: 'sports', weight: 0.9 },
      { word: 'winning', weight: 0.8 },
      { word: 'playing', weight: 0.6 },
      { word: 'nfl', weight: 1.0 },
      { word: 'nba', weight: 1.0 },
      { word: 'mlb', weight: 1.0 },
      { word: 'nhl', weight: 1.0 },
      { word: 'football', weight: 0.9 },
      { word: 'basketball', weight: 0.9 },
      { word: 'baseball', weight: 0.9 },
      { word: 'hockey', weight: 0.9 },
      { word: 'soccer', weight: 0.9 },
    ],
    antiKeywords: ['weather', 'music', 'calendar'],
  },

  examples: [
    "What's the score of the Lakers game?",
    'How are the Yankees doing?',
    'NFL scores',
    'Did the Patriots win?',
    'When do the Knicks play next?',
    'NBA scores today',
    'How is the Phillies game going?',
    'Eagles score',
  ],

  counterExamples: ['Play music', "What's the weather?", 'Set a reminder'],

  arguments: [
    {
      name: 'team',
      type: 'string',
      description: 'Team name to look up',
      required: false,
      extractionPatterns: [
        /score\s+(?:of\s+)?(?:the\s+)?(.+?)(?:\s+game)?$/i,
        /how\s+(?:are|is)\s+(?:the\s+)?(.+)/i,
        /^(.+?)\s+(?:score|game)$/i,
      ],
    },
    {
      name: 'sport',
      type: 'string',
      description: 'Sport/league (nfl, nba, mlb, nhl)',
      required: false,
      enumValues: ['nfl', 'nba', 'mlb', 'nhl', 'mls', 'epl'],
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
      toolId: 'info_sports',
      args,
      delegateTo: 'domains/information',
    };
  },
};

// ============================================================================
// STOCK MARKET
// ============================================================================

export const stockTool: SemanticToolDefinition = {
  id: 'info_stock',
  name: 'Stock Quote',
  description: 'Get stock prices, market updates, and financial data.',
  shortDescription: 'check stock prices',
  category: 'information',

  triggers: {
    phrases: [
      'stock price',
      'stock quote',
      'how is stock',
      'market today',
      'dow jones',
      's&p 500',
      'nasdaq',
      'trading at',
    ],
    patterns: [
      /^(?:how(?:'s| is))?\s*(.+?)\s+stock(?:\s+doing)?$/i,
      /^(?:what(?:'s| is))?\s*(?:the\s+)?(?:price|value)\s+of\s+(.+?)(?:\s+stock)?$/i,
      /^(?:stock\s+)?(?:price|quote)\s+(?:for\s+)?(.+)/i,
      /^how(?:'s| is)\s+(?:the\s+)?market(?:\s+today)?$/i,
      /^(?:s&p|dow|nasdaq)(?:\s+500)?(?:\s+today)?$/i,
      /^(.+?)\s+(?:stock\s+)?(?:price|quote|today)/i,
    ],
    keywords: [
      { word: 'stock', weight: 1.0 },
      { word: 'price', weight: 0.7 },
      { word: 'market', weight: 0.9 },
      { word: 'dow', weight: 1.0 },
      { word: 'nasdaq', weight: 1.0 },
      { word: 's&p', weight: 1.0 },
      { word: 'trading', weight: 0.8 },
      { word: 'shares', weight: 0.8 },
      { word: 'ticker', weight: 0.9 },
    ],
    antiKeywords: ['weather', 'music', 'calendar', 'game', 'score'],
  },

  examples: [
    'How is Apple stock doing?',
    'Tesla stock price',
    "What's the price of NVDA?",
    "How's the market today?",
    'S&P 500',
    'Check my stocks',
    'Amazon stock quote',
  ],

  counterExamples: ['Play music', "What's the weather?", 'Sports scores'],

  arguments: [
    {
      name: 'symbol',
      type: 'string',
      description: 'Stock ticker symbol',
      required: false,
      extractionPatterns: [
        /(.+?)\s+stock/i,
        /price\s+of\s+(.+)/i,
        /quote\s+(?:for\s+)?(.+)/i,
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
      toolId: 'info_stock',
      args,
      delegateTo: 'domains/finance',
    };
  },
};

// ============================================================================
// PODCASTS
// ============================================================================

export const podcastTool: SemanticToolDefinition = {
  id: 'info_podcast',
  name: 'Podcast Search',
  description: 'Search for podcasts, get recommendations, and find episodes.',
  shortDescription: 'find podcasts',
  category: 'information',

  triggers: {
    phrases: [
      'play podcast',
      'find podcast',
      'podcast about',
      'podcast recommendation',
      'what podcasts',
      'good podcasts',
      'popular podcasts',
      'latest episode',
    ],
    patterns: [
      /^(?:play|find|search)\s+(?:a\s+)?podcast\s+(?:about\s+)?(.+)/i,
      /^(?:what|any)\s+(?:good\s+)?podcasts?\s+(?:about|on)\s+(.+)/i,
      /^(?:recommend|suggest)\s+(?:a\s+)?podcast/i,
      /^podcast\s+(?:about|on)\s+(.+)/i,
      /^(?:play\s+)?(?:the\s+)?(.+?)\s+podcast/i,
    ],
    keywords: [
      { word: 'podcast', weight: 1.0 },
      { word: 'episode', weight: 0.9 },
      { word: 'listen', weight: 0.6 },
      { word: 'show', weight: 0.4 },
    ],
    antiKeywords: ['music', 'song', 'weather', 'stock'],
  },

  examples: [
    'Find podcasts about history',
    'Recommend a comedy podcast',
    'Play The Daily podcast',
    'What are some good business podcasts?',
    'Latest episode of Serial',
  ],

  counterExamples: ['Play music', 'Play a song', "What's the weather?"],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'Podcast topic or name',
      required: false,
      extractionPatterns: [
        /podcast\s+(?:about|on)\s+(.+)/i,
        /(.+?)\s+podcast/i,
        /podcasts?\s+(?:about|on)\s+(.+)/i,
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
      toolId: 'info_podcast',
      args,
      delegateTo: 'domains/podcasts',
    };
  },
};

// ============================================================================
// RECIPES
// ============================================================================

export const recipeTool: SemanticToolDefinition = {
  id: 'info_recipe',
  name: 'Recipe Search',
  description: 'Search for recipes and cooking instructions.',
  shortDescription: 'find recipes',
  category: 'information',

  triggers: {
    phrases: [
      'recipe for',
      'how to make',
      'how to cook',
      'cooking instructions',
      'ingredients for',
      'what do I need to make',
    ],
    patterns: [
      /^(?:find|get|give)\s+(?:me\s+)?(?:a\s+)?recipe\s+(?:for\s+)?(.+)/i,
      /^how\s+(?:do\s+I|to)\s+(?:make|cook|bake|prepare)\s+(.+)/i,
      /^(?:what(?:'s| is) the )?recipe\s+(?:for\s+)?(.+)/i,
      /^(.+?)\s+recipe$/i,
      /^(?:what\s+)?ingredients\s+(?:do\s+I\s+need\s+)?(?:for|to\s+make)\s+(.+)/i,
    ],
    keywords: [
      { word: 'recipe', weight: 1.0 },
      { word: 'cook', weight: 0.9 },
      { word: 'make', weight: 0.5 },
      { word: 'bake', weight: 0.9 },
      { word: 'ingredients', weight: 0.9 },
      { word: 'prepare', weight: 0.7 },
    ],
    antiKeywords: ['music', 'weather', 'stock', 'game'],
  },

  examples: [
    'Recipe for chocolate chip cookies',
    'How do I make lasagna?',
    'How to cook beef stroganoff',
    'What ingredients do I need for pancakes?',
    'Give me a recipe for chicken soup',
  ],

  counterExamples: ['Play music', "What's the weather?", 'Sports scores'],

  arguments: [
    {
      name: 'dish',
      type: 'string',
      description: 'Dish or food to get recipe for',
      required: true,
      extractionPatterns: [
        /recipe\s+(?:for\s+)?(.+)/i,
        /(?:make|cook|bake|prepare)\s+(.+)/i,
        /(.+?)\s+recipe/i,
        /ingredients\s+(?:for|to\s+make)\s+(.+)/i,
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
      toolId: 'info_recipe',
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
  sportsTool,
  stockTool,
  podcastTool,
  recipeTool,
];
