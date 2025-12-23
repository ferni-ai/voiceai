/**
 * Memory Tool Definitions for Semantic Router
 *
 * Semantic routing for memory/recall queries.
 * Routes to Ferni's memory system tools.
 *
 * @module tools/semantic-router/tool-definitions/memory
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// REMEMBER / SAVE MEMORY
// ============================================================================

export const rememberTool: SemanticToolDefinition = {
  id: 'memory_save',
  name: 'Remember',
  description:
    'Save something to memory for later recall. Works for facts, preferences, people, etc.',
  shortDescription: 'remember something',
  category: 'memory',

  triggers: {
    phrases: [
      'remember this',
      'remember that',
      "don't forget",
      'save this',
      'note that',
      'keep in mind',
      'remember I',
      'make a note',
    ],
    patterns: [
      /^(?:please\s+)?remember\s+(?:that\s+)?(.+)/i,
      /^(?:don(?:'t|ot)\s+)?forget\s+(?:that\s+)?(.+)/i,
      /^(?:save|note|record)\s+(?:that\s+)?(.+)/i,
      /^(?:keep\s+in\s+mind|make\s+a\s+note)\s+(?:that\s+)?(.+)/i,
      /^(?:i\s+want\s+you\s+to\s+)?remember\s+(.+)/i,
    ],
    keywords: [
      { word: 'remember', weight: 1.0 },
      { word: 'forget', weight: 0.9 },
      { word: 'save', weight: 0.7 },
      { word: 'note', weight: 0.7 },
      { word: 'record', weight: 0.6 },
      { word: 'keep', weight: 0.5 },
    ],
    antiKeywords: ['what', 'when', 'who', 'tell me', 'recall', 'do you remember'],
  },

  examples: [
    "Remember that I'm allergic to peanuts",
    "Don't forget my anniversary is June 15th",
    'Remember I prefer morning meetings',
    'Save this: my favorite color is blue',
    "Note that John's birthday is March 3rd",
    'Keep in mind I have a dog named Max',
    'Remember my wife is named Sarah',
  ],

  counterExamples: [
    'What did I tell you?',
    'Do you remember my name?',
    "What's my favorite color?",
    'Recall what I said yesterday',
  ],

  arguments: [
    {
      name: 'content',
      type: 'string',
      description: 'What to remember',
      required: true,
      extractionPatterns: [
        /remember\s+(?:that\s+)?(.+)$/i,
        /(?:don(?:'t|ot)\s+)?forget\s+(?:that\s+)?(.+)$/i,
        /(?:save|note|record)\s+(?:that\s+)?(.+)$/i,
      ],
    },
    {
      name: 'category',
      type: 'string',
      description: 'Category for the memory',
      required: false,
      enumValues: ['preference', 'fact', 'person', 'date', 'health', 'other'],
      extractionPatterns: [/(preference|fact|person|date|health)/i],
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
      toolId: 'memory_save',
      args,
      delegateTo: 'domains/memory',
    };
  },
};

// ============================================================================
// RECALL / SEARCH MEMORY
// ============================================================================

export const recallTool: SemanticToolDefinition = {
  id: 'memory_recall',
  name: 'Recall',
  description: 'Recall or search memories. Find what the user told you before.',
  shortDescription: 'recall a memory',
  category: 'memory',

  triggers: {
    phrases: [
      'what did I tell you',
      'do you remember',
      'what do you know about',
      'recall',
      "what's my",
      'who is my',
      'when is my',
      'you mentioned',
    ],
    patterns: [
      /^(?:what|when|who)\s+did\s+i\s+(?:tell|say|mention)/i,
      /^do\s+you\s+(?:remember|recall|know)\s+(?:what|when|who|my)/i,
      /^(?:what(?:'s| is)|who(?:'s| is)|when(?:'s| is))\s+my\s+(.+)/i,
      /^recall\s+(?:what\s+i\s+)?(.+)/i,
      /^(?:what\s+do\s+you\s+know\s+about)\s+(.+)/i,
      /^(?:tell\s+me\s+)?what\s+you\s+(?:remember|know)\s+about\s+(.+)/i,
    ],
    keywords: [
      { word: 'remember', weight: 0.9 },
      { word: 'recall', weight: 1.0 },
      { word: 'know', weight: 0.6 },
      { word: 'told', weight: 0.8 },
      { word: 'mentioned', weight: 0.7 },
      { word: 'said', weight: 0.7 },
    ],
    antiKeywords: ['save', 'note', "don't forget", 'keep'],
  },

  examples: [
    "What's my wife's name?",
    'Do you remember my birthday?',
    'What did I tell you about John?',
    "Who's my doctor?",
    "When's my anniversary?",
    'What do you know about my job?',
    'Recall what I said about my diet',
    "What's my favorite restaurant?",
  ],

  counterExamples: ['Remember this', "Don't forget", 'Save this note', 'Note that my name is John'],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'What to recall or search for',
      required: true,
      extractionPatterns: [
        /(?:what(?:'s| is)|who(?:'s| is)|when(?:'s| is))\s+(?:my\s+)?(.+)/i,
        /(?:remember|recall|know)\s+(?:about\s+)?(?:my\s+)?(.+)/i,
        /(?:tell|say|mention)\s+(?:about\s+)?(.+)/i,
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
      toolId: 'memory_recall',
      args,
      delegateTo: 'domains/memory',
    };
  },
};

// ============================================================================
// PEOPLE / RELATIONSHIPS
// ============================================================================

export const peopleMemoryTool: SemanticToolDefinition = {
  id: 'memory_people',
  name: 'People Memory',
  description: 'Recall information about people in your life - family, friends, colleagues.',
  shortDescription: 'recall info about people',
  category: 'memory',

  triggers: {
    phrases: [
      "who's my",
      'who is my',
      'tell me about',
      'what do you know about',
      "who's that person",
      'my friend',
      'my colleague',
    ],
    patterns: [
      /^who(?:'s| is)\s+(?:my\s+)?(.+)/i,
      /^tell\s+me\s+(?:about|what\s+you\s+know\s+about)\s+(.+)/i,
      /^what\s+(?:do\s+you\s+know\s+about|can\s+you\s+tell\s+me\s+about)\s+(.+)/i,
      /^(?:my\s+)?(?:friend|colleague|boss|wife|husband|partner|sister|brother)\s+(.+)/i,
    ],
    keywords: [
      { word: 'who', weight: 0.9 },
      { word: 'friend', weight: 0.8 },
      { word: 'colleague', weight: 0.8 },
      { word: 'family', weight: 0.8 },
      { word: 'wife', weight: 0.9 },
      { word: 'husband', weight: 0.9 },
      { word: 'partner', weight: 0.9 },
      { word: 'boss', weight: 0.8 },
      { word: 'person', weight: 0.6 },
    ],
    antiKeywords: ['remember', 'save', 'call', 'email', 'text'],
  },

  examples: [
    "Who's my doctor?",
    'Tell me about Sarah',
    'What do you know about John?',
    "Who's my boss?",
    "Who's my wife?",
    'What do you know about my friend Mike?',
  ],

  counterExamples: [
    'Remember that John is my friend',
    'Call Sarah',
    'Email my boss',
    'Text my wife',
  ],

  arguments: [
    {
      name: 'personName',
      type: 'string',
      description: 'Name or relationship to query',
      required: true,
      extractionPatterns: [/who(?:'s| is)\s+(?:my\s+)?(.+)/i, /about\s+(?:my\s+)?(.+)/i],
      entityType: 'person',
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
      toolId: 'memory_people',
      args,
      delegateTo: 'domains/memory',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const memoryTools: SemanticToolDefinition[] = [rememberTool, recallTool, peopleMemoryTool];
