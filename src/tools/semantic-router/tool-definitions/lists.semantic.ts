/**
 * Lists Tool Definitions for Semantic Router
 *
 * Routes general list queries - packing lists, bucket lists, guest lists, etc.
 * Different from shopping lists or tasks - these are general purpose lists.
 *
 * @module tools/semantic-router/tool-definitions/lists
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// CREATE LIST
// ============================================================================

export const createListTool: SemanticToolDefinition = {
  id: 'lists_create',
  name: 'Create List',
  description: 'Create a new list (packing, bucket, guest, reading, etc.).',
  shortDescription: 'create a list',
  category: 'productivity',

  triggers: {
    phrases: [
      'create a list',
      'make a list',
      'start a list',
      'new list',
      'packing list',
      'bucket list',
      'guest list',
      'reading list',
      'movie list',
      'watchlist',
    ],
    patterns: [
      /^(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?(?:(\w+)\s+)?list/i,
      /^(?:i\s+(?:need|want)\s+)?(?:a\s+)?(\w+)\s+list/i,
      /^(?:let(?:'s| us)\s+)?(?:create|make|start)\s+(?:a\s+)?list\s+(?:for|of)\s+(.+)/i,
    ],
    keywords: [
      { word: 'list', weight: 1.0 },
      { word: 'packing', weight: 0.9 },
      { word: 'bucket', weight: 0.9 },
      { word: 'guest', weight: 0.8 },
      { word: 'reading', weight: 0.8 },
      { word: 'watchlist', weight: 0.8 },
      { word: 'movies', weight: 0.7 },
      { word: 'create', weight: 0.6 },
    ],
    antiKeywords: ['shopping', 'grocery', 'todo', 'task', 'reminder'],
  },

  examples: [
    'Create a packing list for vacation',
    'Make a bucket list',
    'Start a guest list for the party',
    'I need a reading list',
    'Create a movie watchlist',
  ],

  counterExamples: [
    'Add milk to my shopping list',
    'Create a task',
    'Make a todo list',
    'Add to grocery list',
  ],

  arguments: [
    {
      name: 'name',
      type: 'string',
      description: 'Name of the list',
      required: true,
      extractionPatterns: [
        /(?:called|named)\s+["\']?(.+?)["\']?$/i,
        /(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?(.+?)\s+list/i,
        /(?:for|of)\s+(?:my\s+)?(.+?)$/i,
      ],
    },
    {
      name: 'type',
      type: 'string',
      description: 'Type of list',
      required: false,
      enumValues: ['packing', 'bucket', 'guest', 'reading', 'movies', 'custom'],
      extractionPatterns: [/(packing|bucket|guest|reading|movie|movies|watchlist)/i],
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
      toolId: 'createList',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// ADD TO LIST
// ============================================================================

export const addToListTool: SemanticToolDefinition = {
  id: 'lists_add',
  name: 'Add to List',
  description: 'Add an item to an existing list.',
  shortDescription: 'add to list',
  category: 'productivity',

  triggers: {
    phrases: [
      'add to list',
      'put on list',
      'add to my list',
      'add to packing list',
      'add to bucket list',
      'add to reading list',
    ],
    patterns: [
      /^add\s+(.+?)\s+to\s+(?:my\s+)?(?:the\s+)?(\w+)\s+list/i,
      /^put\s+(.+?)\s+on\s+(?:my\s+)?(?:the\s+)?(\w+)\s+list/i,
      /^(?:i\s+(?:want|need)\s+to\s+)?add\s+(.+?)\s+to\s+(?:the\s+)?list/i,
    ],
    keywords: [
      { word: 'add', weight: 0.9 },
      { word: 'list', weight: 1.0 },
      { word: 'put', weight: 0.7 },
      { word: 'include', weight: 0.6 },
    ],
    antiKeywords: ['shopping', 'grocery', 'cart'],
  },

  examples: [
    'Add sunscreen to packing list',
    'Put Machu Picchu on my bucket list',
    'Add The Great Gatsby to reading list',
    'Add John to guest list',
  ],

  counterExamples: ['Add milk to shopping list', 'Add eggs to grocery list', 'Add to cart'],

  arguments: [
    {
      name: 'item',
      type: 'string',
      description: 'Item to add',
      required: true,
      extractionPatterns: [/add\s+(.+?)\s+to/i, /put\s+(.+?)\s+on/i],
    },
    {
      name: 'listName',
      type: 'string',
      description: 'Name of the list',
      required: true,
      extractionPatterns: [
        /to\s+(?:my\s+)?(?:the\s+)?(.+?)\s+list/i,
        /on\s+(?:my\s+)?(?:the\s+)?(.+?)\s+list/i,
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
      toolId: 'addToList',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// VIEW LIST
// ============================================================================

export const viewListTool: SemanticToolDefinition = {
  id: 'lists_view',
  name: 'View List',
  description: 'View items in a specific list.',
  shortDescription: 'view list',
  category: 'productivity',

  triggers: {
    phrases: [
      'show my list',
      'view list',
      'read list',
      "what's on my list",
      'show packing list',
      'show bucket list',
      'show guest list',
    ],
    patterns: [
      /^(?:show|view|read|display)\s+(?:my\s+)?(?:the\s+)?(\w+)\s+list/i,
      /^what(?:'s| is)\s+on\s+(?:my\s+)?(?:the\s+)?(\w+)\s+list/i,
      /^(?:let\s+me\s+)?see\s+(?:my\s+)?(?:the\s+)?(\w+)\s+list/i,
    ],
    keywords: [
      { word: 'list', weight: 1.0 },
      { word: 'show', weight: 0.7 },
      { word: 'view', weight: 0.7 },
      { word: 'read', weight: 0.6 },
      { word: "what's on", weight: 0.8 },
    ],
    antiKeywords: ['create', 'add', 'delete', 'remove'],
  },

  examples: [
    'Show my packing list',
    "What's on my bucket list?",
    'View the guest list',
    'Read my reading list',
  ],

  counterExamples: ['Create a packing list', 'Add to my list', 'Delete my list'],

  arguments: [
    {
      name: 'listName',
      type: 'string',
      description: 'Name of the list to view',
      required: true,
      extractionPatterns: [
        /(?:show|view|read)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+list/i,
        /what(?:'s| is)\s+on\s+(?:my\s+)?(?:the\s+)?(.+?)\s+list/i,
      ],
    },
  ],

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
      toolId: 'viewList',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// GET ALL LISTS
// ============================================================================

export const getAllListsTool: SemanticToolDefinition = {
  id: 'lists_all',
  name: 'Get All Lists',
  description: 'Show all your lists.',
  shortDescription: 'show all lists',
  category: 'productivity',

  triggers: {
    phrases: [
      'show my lists',
      'all my lists',
      'what lists do I have',
      'view all lists',
      'list all lists',
    ],
    patterns: [
      /^(?:show|view|list)\s+(?:all\s+)?(?:my\s+)?lists/i,
      /^what\s+lists\s+do\s+i\s+have/i,
      /^(?:do\s+i\s+have\s+)?any\s+lists/i,
    ],
    keywords: [
      { word: 'lists', weight: 1.0 },
      { word: 'all', weight: 0.6 },
      { word: 'show', weight: 0.5 },
    ],
    antiKeywords: ['packing', 'bucket', 'guest', 'reading', 'create'],
  },

  examples: ['Show all my lists', 'What lists do I have?', 'View my lists'],

  counterExamples: ['Show my packing list', 'Create a list', 'Show my bucket list'],

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
      toolId: 'getAllLists',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// CHECK OFF ITEM
// ============================================================================

export const checkOffItemTool: SemanticToolDefinition = {
  id: 'lists_check',
  name: 'Check Off Item',
  description: 'Mark an item as completed in a list.',
  shortDescription: 'check off item',
  category: 'productivity',

  triggers: {
    phrases: ['check off', 'mark as done', 'cross off', 'completed', 'done with'],
    patterns: [
      /^(?:check|mark|cross)\s+(?:off\s+)?(.+?)\s+(?:on|from|in)\s+(?:my\s+)?(?:the\s+)?(\w+)\s+list/i,
      /^(?:i(?:'m| am)|i\s+have)\s+done\s+(?:with\s+)?(.+?)(?:\s+(?:on|from)\s+(?:the\s+)?list)?/i,
      /^(.+?)\s+is\s+(?:done|completed|checked)/i,
    ],
    keywords: [
      { word: 'check', weight: 0.9 },
      { word: 'done', weight: 0.8 },
      { word: 'completed', weight: 0.8 },
      { word: 'cross off', weight: 0.9 },
      { word: 'mark', weight: 0.7 },
      { word: 'list', weight: 0.6 },
    ],
    antiKeywords: ['add', 'create', 'delete'],
  },

  examples: [
    'Check off sunscreen from packing list',
    'Mark passport as done',
    'Cross off skydiving from bucket list',
    "I'm done with The Great Gatsby on my reading list",
  ],

  counterExamples: ['Add sunscreen to packing list', 'Delete my list'],

  arguments: [
    {
      name: 'item',
      type: 'string',
      description: 'Item to check off',
      required: true,
      extractionPatterns: [
        /(?:check|mark|cross)\s+(?:off\s+)?(.+?)\s+(?:on|from|in)/i,
        /done\s+(?:with\s+)?(.+?)(?:\s+(?:on|from))?/i,
      ],
    },
    {
      name: 'listName',
      type: 'string',
      description: 'Name of the list',
      required: true,
      extractionPatterns: [/(?:on|from|in)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+list/i],
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
      toolId: 'checkOffItem',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// DELETE LIST
// ============================================================================

export const deleteListTool: SemanticToolDefinition = {
  id: 'lists_delete',
  name: 'Delete List',
  description: 'Delete an entire list.',
  shortDescription: 'delete list',
  category: 'productivity',

  triggers: {
    phrases: ['delete list', 'remove list', 'clear list', 'delete my list'],
    patterns: [
      /^(?:delete|remove|clear)\s+(?:my\s+)?(?:the\s+)?(\w+)\s+list/i,
      /^(?:get\s+rid\s+of|erase)\s+(?:my\s+)?(?:the\s+)?(\w+)\s+list/i,
    ],
    keywords: [
      { word: 'delete', weight: 1.0 },
      { word: 'remove', weight: 0.9 },
      { word: 'clear', weight: 0.8 },
      { word: 'list', weight: 0.8 },
    ],
    antiKeywords: ['item', 'add', 'check'],
  },

  examples: ['Delete my packing list', 'Remove the guest list', 'Clear my old bucket list'],

  counterExamples: ['Delete item from list', 'Remove sunscreen from packing list', 'Show my list'],

  arguments: [
    {
      name: 'listName',
      type: 'string',
      description: 'Name of the list to delete',
      required: true,
      extractionPatterns: [/(?:delete|remove|clear)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+list/i],
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
      toolId: 'deleteList',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const listsTools: SemanticToolDefinition[] = [
  createListTool,
  addToListTool,
  viewListTool,
  getAllListsTool,
  checkOffItemTool,
  deleteListTool,
];
