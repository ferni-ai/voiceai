/**
 * Books Domain Tool Definitions for Semantic Router
 *
 * Semantic routing for book discovery and reading list management.
 * Routes to books domain tools for search, recommendations, and CRUD.
 *
 * @module tools/semantic-router/tool-definitions/books
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SEARCH BOOKS
// ============================================================================

export const searchBooksTool: SemanticToolDefinition = {
  id: 'books_search',
  name: 'Search Books',
  description: 'Search for books by title, author, or topic.',
  shortDescription: 'search for books',
  category: 'recommendations',

  triggers: {
    phrases: [
      'search for books',
      'find books',
      'look up a book',
      'books about',
      'books by',
      'find me a book',
      'search book',
    ],
    patterns: [
      /^(?:search|find|look\s+up)\s+(?:for\s+)?(?:a\s+)?books?\s+(?:about|on|by)\s+(.+)/i,
      /^(?:find|search)\s+(?:me\s+)?(?:a\s+)?book\s+(?:called|named|titled)\s+(.+)/i,
      /^books?\s+(?:about|on|by)\s+(.+)/i,
      /^(?:what|any)\s+books?\s+(?:about|on|by)\s+(.+)/i,
    ],
    keywords: [
      { word: 'book', weight: 1.0 },
      { word: 'books', weight: 1.0 },
      { word: 'search', weight: 0.8 },
      { word: 'find', weight: 0.8 },
      { word: 'author', weight: 0.7 },
      { word: 'title', weight: 0.7 },
    ],
    antiKeywords: ['reading list', 'my list', 'add', 'remove', 'recommend'],
  },

  examples: [
    'Search for books about habits',
    'Find books by James Clear',
    'Books on psychology',
    'Look up a book called Atomic Habits',
    'Find me a book about meditation',
  ],

  counterExamples: [
    'Add this book to my reading list',
    'Recommend me a book',
    "What's on my reading list?",
    'I finished reading a book',
  ],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query (title, author, or topic)',
      required: true,
      extractionPatterns: [
        /books?\s+(?:about|on|by)\s+(.+)/i,
        /(?:called|named|titled)\s+(.+)/i,
        /(?:search|find)\s+(?:for\s+)?(.+)/i,
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
      toolId: 'searchBooks',
      args,
      delegateTo: 'domains/books',
    };
  },
};

// ============================================================================
// PERSONALIZED READING RECOMMENDATIONS (distinct from generic recommendations)
// ============================================================================

export const whatToReadNextTool: SemanticToolDefinition = {
  id: 'books_what_to_read',
  name: 'What to Read Next',
  description: 'Get personalized book recommendations based on reading history and interests.',
  shortDescription: 'what to read next',
  category: 'recommendations',

  triggers: {
    phrases: [
      'recommend a book',
      'book recommendation',
      'suggest a book',
      'what should I read',
      'good books',
      'best books',
      'books to read',
    ],
    patterns: [
      /^(?:recommend|suggest)\s+(?:me\s+)?(?:a\s+)?books?/i,
      /^what\s+(?:books?\s+)?should\s+I\s+read/i,
      /^(?:any\s+)?good\s+books?\s+(?:about|on|for)\s+(.+)/i,
      /^(?:best|top)\s+books?\s+(?:about|on|for)\s+(.+)/i,
      /^books?\s+(?:you\s+)?recommend/i,
      /^I\s+(?:want|need)\s+(?:a\s+)?book\s+(?:about|on|for)\s+(.+)/i,
    ],
    keywords: [
      { word: 'recommend', weight: 1.0 },
      { word: 'suggestion', weight: 0.9 },
      { word: 'good', weight: 0.7 },
      { word: 'best', weight: 0.7 },
      { word: 'read', weight: 0.6 },
      { word: 'book', weight: 0.8 },
    ],
    antiKeywords: ['search', 'find', 'look up', 'reading list', 'add'],
  },

  examples: [
    'Recommend me a book',
    'What should I read next?',
    'Good books about leadership',
    'Suggest a fiction book',
    'Best self-help books',
    'I need a book about productivity',
  ],

  counterExamples: [
    'Search for a book',
    'Add to my reading list',
    "What's my reading list?",
    'Find books by this author',
  ],

  arguments: [
    {
      name: 'interests',
      type: 'array',
      description: 'Topics of interest',
      required: false,
      extractionPatterns: [/(?:about|on|for)\s+(.+)/i],
    },
    {
      name: 'genre',
      type: 'string',
      description: 'Book genre',
      required: false,
      enumValues: [
        'fiction',
        'nonfiction',
        'mystery',
        'romance',
        'science_fiction',
        'fantasy',
        'biography',
        'self_help',
        'business',
        'psychology',
      ],
      extractionPatterns: [
        /(fiction|nonfiction|mystery|romance|sci-fi|fantasy|biography|self-help|business)/i,
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
      toolId: 'getBookRecommendations',
      args,
      delegateTo: 'domains/books',
    };
  },
};

// ============================================================================
// POPULAR BOOKS
// ============================================================================

export const popularBooksTool: SemanticToolDefinition = {
  id: 'books_popular',
  name: 'Popular Books',
  description: 'Get popular and bestselling books.',
  shortDescription: 'popular books',
  category: 'recommendations',

  triggers: {
    phrases: [
      'popular books',
      'bestsellers',
      'bestselling books',
      'top books',
      'trending books',
      "what's popular",
    ],
    patterns: [
      /^(?:popular|trending|bestselling?)\s+books?/i,
      /^(?:top|best)\s+(?:selling\s+)?books?/i,
      /^what(?:'s|\s+are)\s+(?:the\s+)?(?:popular|trending|bestselling)\s+books?/i,
      /^bestsellers?\s+(?:in|for)\s+(.+)/i,
    ],
    keywords: [
      { word: 'popular', weight: 1.0 },
      { word: 'bestseller', weight: 1.0 },
      { word: 'trending', weight: 0.9 },
      { word: 'top', weight: 0.8 },
    ],
    antiKeywords: ['my', 'reading list', 'add', 'search'],
  },

  examples: [
    'What are the popular books right now?',
    'Show me bestsellers',
    'Top fiction books',
    'Trending books in business',
    'Bestselling self-help books',
  ],

  counterExamples: [
    'Search for a book',
    'My reading list',
    'Add a book',
    'Recommend based on my interests',
  ],

  arguments: [
    {
      name: 'genre',
      type: 'string',
      description: 'Genre to filter by',
      required: false,
      enumValues: ['fiction', 'nonfiction', 'mystery', 'romance', 'self_help', 'business'],
      extractionPatterns: [/(?:in|for)\s+(.+)/i],
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
      toolId: 'getPopularBooks',
      args,
      delegateTo: 'domains/books',
    };
  },
};

// ============================================================================
// ADD TO READING LIST
// ============================================================================

export const addToReadingListTool: SemanticToolDefinition = {
  id: 'books_add_to_list',
  name: 'Add to Reading List',
  description: 'Add a book to your reading list.',
  shortDescription: 'add to reading list',
  category: 'recommendations',

  triggers: {
    phrases: [
      'add to reading list',
      'add to my list',
      'save this book',
      'add this book',
      'put on my reading list',
      'want to read',
    ],
    patterns: [
      /^add\s+(?:this\s+)?(?:book\s+)?to\s+(?:my\s+)?(?:reading\s+)?list/i,
      /^save\s+(?:this\s+)?book/i,
      /^put\s+(?:this\s+)?(?:book\s+)?on\s+(?:my\s+)?(?:reading\s+)?list/i,
      /^(?:I\s+)?want\s+to\s+read\s+(?:this|that|it)/i,
      /^add\s+(.+)\s+to\s+(?:my\s+)?(?:reading\s+)?list/i,
    ],
    keywords: [
      { word: 'add', weight: 1.0 },
      { word: 'reading list', weight: 1.0 },
      { word: 'save', weight: 0.8 },
      { word: 'list', weight: 0.7 },
      { word: 'want to read', weight: 0.9 },
    ],
    antiKeywords: ['remove', 'delete', 'finished', 'completed', 'what', 'show'],
  },

  examples: [
    'Add this to my reading list',
    'Save this book',
    'Add Atomic Habits to my list',
    'I want to read this',
    'Put this on my reading list',
  ],

  counterExamples: [
    'Remove from reading list',
    "What's on my reading list?",
    'I finished this book',
    'Search for a book',
  ],

  arguments: [
    {
      name: 'title',
      type: 'string',
      description: 'Book title to add',
      required: false,
      extractionPatterns: [/add\s+(.+?)\s+to\s+(?:my\s+)?(?:reading\s+)?list/i],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'addToReadingList',
      args,
      delegateTo: 'domains/books',
    };
  },
};

// ============================================================================
// GET READING LIST
// ============================================================================

export const getReadingListTool: SemanticToolDefinition = {
  id: 'books_get_list',
  name: 'Get Reading List',
  description: 'View your reading list.',
  shortDescription: 'view reading list',
  category: 'recommendations',

  triggers: {
    phrases: [
      'my reading list',
      'show reading list',
      'what books',
      "what's on my list",
      'books to read',
      'reading queue',
    ],
    patterns: [
      /^(?:show|get|view)\s+(?:my\s+)?reading\s+list/i,
      /^(?:what(?:'s|\s+is))\s+(?:on\s+)?my\s+(?:reading\s+)?list/i,
      /^my\s+(?:reading\s+)?list/i,
      /^what\s+books?\s+(?:do\s+I\s+have|am\s+I\s+reading)/i,
      /^(?:books?\s+)?(?:I(?:'m|\s+am)\s+)?(?:reading|to\s+read)/i,
    ],
    keywords: [
      { word: 'reading list', weight: 1.0 },
      { word: 'my list', weight: 0.9 },
      { word: 'books to read', weight: 0.8 },
      { word: 'queue', weight: 0.7 },
    ],
    antiKeywords: ['add', 'remove', 'search', 'recommend', 'finished'],
  },

  examples: [
    "What's on my reading list?",
    'Show my reading list',
    'My books to read',
    'What books am I reading?',
    'Reading queue',
  ],

  counterExamples: [
    'Add to reading list',
    'Search for books',
    'Recommend a book',
    'I finished a book',
  ],

  arguments: [
    {
      name: 'status',
      type: 'string',
      description: 'Filter by status',
      required: false,
      enumValues: ['want_to_read', 'reading', 'completed'],
      extractionPatterns: [/(reading|completed|to\s+read)/i],
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
      toolId: 'getReadingList',
      args,
      delegateTo: 'domains/books',
    };
  },
};

// ============================================================================
// MARK BOOK READ / FINISHED
// ============================================================================

export const markBookReadTool: SemanticToolDefinition = {
  id: 'books_mark_read',
  name: 'Mark Book Read',
  description: 'Mark a book as completed.',
  shortDescription: 'mark book finished',
  category: 'recommendations',

  triggers: {
    phrases: [
      'finished reading',
      'finished the book',
      'completed reading',
      'done reading',
      'mark as read',
      'I read',
    ],
    patterns: [
      /^(?:I\s+)?(?:just\s+)?finished\s+(?:reading\s+)?(.+)?/i,
      /^(?:I\s+)?(?:just\s+)?completed\s+(?:reading\s+)?(.+)?/i,
      /^mark\s+(.+?)?\s*(?:as\s+)?(?:read|completed|finished)/i,
      /^done\s+(?:reading\s+)?(?:with\s+)?(.+)?/i,
      /^(?:I\s+)?read\s+(.+)/i,
    ],
    keywords: [
      { word: 'finished', weight: 1.0 },
      { word: 'completed', weight: 1.0 },
      { word: 'done', weight: 0.9 },
      { word: 'read', weight: 0.7 },
    ],
    antiKeywords: ['want to', 'add', 'search', 'recommend', 'reading'],
  },

  examples: [
    'I finished reading Atomic Habits',
    'Mark this book as read',
    'Just completed the book',
    'Done reading',
    'I read The Alchemist',
  ],

  counterExamples: [
    'I want to read this',
    'Add to reading list',
    'What am I reading?',
    'Currently reading',
  ],

  arguments: [
    {
      name: 'title',
      type: 'string',
      description: 'Book title',
      required: false,
      extractionPatterns: [
        /finished\s+(?:reading\s+)?(.+)/i,
        /completed\s+(?:reading\s+)?(.+)/i,
        /read\s+(.+)/i,
      ],
    },
    {
      name: 'rating',
      type: 'number',
      description: 'Rating (1-5)',
      required: false,
      extractionPatterns: [/(\d)\s*(?:stars?|out\s+of)/i],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'markBookRead',
      args,
      delegateTo: 'domains/books',
    };
  },
};

// ============================================================================
// REMOVE FROM READING LIST
// ============================================================================

export const removeFromReadingListTool: SemanticToolDefinition = {
  id: 'books_remove',
  name: 'Remove from Reading List',
  description: 'Remove a book from your reading list.',
  shortDescription: 'remove from list',
  category: 'recommendations',

  triggers: {
    phrases: [
      'remove from list',
      'remove from reading list',
      'delete from list',
      'take off list',
      'remove book',
    ],
    patterns: [
      /^remove\s+(?:this\s+)?(?:book\s+)?from\s+(?:my\s+)?(?:reading\s+)?list/i,
      /^delete\s+(?:this\s+)?(?:book\s+)?from\s+(?:my\s+)?(?:reading\s+)?list/i,
      /^take\s+(.+?)?\s*off\s+(?:my\s+)?(?:reading\s+)?list/i,
      /^remove\s+(.+?)\s+from\s+(?:my\s+)?list/i,
    ],
    keywords: [
      { word: 'remove', weight: 1.0 },
      { word: 'delete', weight: 1.0 },
      { word: 'take off', weight: 0.9 },
    ],
    antiKeywords: ['add', 'finished', 'completed', 'search', 'recommend'],
  },

  examples: [
    'Remove this from my reading list',
    'Delete this book from my list',
    'Take this off my reading list',
    'Remove Atomic Habits from my list',
  ],

  counterExamples: [
    'Add to reading list',
    'I finished this book',
    'Search for books',
    'Show my reading list',
  ],

  arguments: [
    {
      name: 'title',
      type: 'string',
      description: 'Book title to remove',
      required: false,
      extractionPatterns: [
        /remove\s+(.+?)\s+from/i,
        /delete\s+(.+?)\s+from/i,
        /take\s+(.+?)\s+off/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'removeFromReadingList',
      args,
      delegateTo: 'domains/books',
    };
  },
};

// ============================================================================
// READING STATS
// ============================================================================

export const readingStatsTool: SemanticToolDefinition = {
  id: 'books_stats',
  name: 'Reading Stats',
  description: 'View your reading statistics.',
  shortDescription: 'reading stats',
  category: 'recommendations',

  triggers: {
    phrases: [
      'reading stats',
      'how many books',
      'books I read',
      'reading statistics',
      'reading progress',
    ],
    patterns: [
      /^(?:my\s+)?reading\s+(?:stats|statistics|progress)/i,
      /^how\s+many\s+books\s+(?:have\s+I|did\s+I)\s+read/i,
      /^(?:show\s+)?(?:my\s+)?reading\s+(?:history|summary)/i,
    ],
    keywords: [
      { word: 'stats', weight: 1.0 },
      { word: 'statistics', weight: 1.0 },
      { word: 'how many', weight: 0.8 },
      { word: 'progress', weight: 0.7 },
    ],
    antiKeywords: ['add', 'remove', 'search', 'recommend', 'list'],
  },

  examples: [
    'Show my reading stats',
    'How many books have I read?',
    'My reading progress',
    'Reading statistics',
  ],

  counterExamples: ['My reading list', 'Add a book', 'Search for books', 'Recommend a book'],

  arguments: [],

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
      toolId: 'getReadingStats',
      args,
      delegateTo: 'domains/books',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const booksTools: SemanticToolDefinition[] = [
  searchBooksTool,
  whatToReadNextTool,
  popularBooksTool,
  addToReadingListTool,
  getReadingListTool,
  markBookReadTool,
  removeFromReadingListTool,
  readingStatsTool,
];
