/**
 * Dictionary Tool Definitions for Semantic Router
 *
 * Routes dictionary/vocabulary queries - definitions, synonyms, word of the day.
 *
 * @module tools/semantic-router/tool-definitions/dictionary
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// DEFINE WORD
// ============================================================================

export const defineWordTool: SemanticToolDefinition = {
  id: 'dictionary_define',
  name: 'Define Word',
  description: 'Look up the definition, pronunciation, and usage of a word.',
  shortDescription: 'define a word',
  category: 'utility',

  triggers: {
    phrases: [
      'define',
      'what does mean',
      'what is the definition',
      'meaning of',
      'what is a',
      'what is an',
      'how do you spell',
      'how do you pronounce',
    ],
    patterns: [
      /^(?:define|what(?:'s| is| does))\s+(?:the\s+)?(?:word\s+)?["\']?(\w+)["\']?/i,
      /^what\s+does\s+["\']?(\w+)["\']?\s+mean/i,
      /^(?:what(?:'s| is))\s+(?:the\s+)?(?:definition|meaning)\s+(?:of\s+)?["\']?(\w+)["\']?/i,
      /^(?:how\s+do\s+you|can\s+you)\s+(?:spell|pronounce)\s+["\']?(\w+)["\']?/i,
    ],
    keywords: [
      { word: 'define', weight: 1.0 },
      { word: 'definition', weight: 1.0 },
      { word: 'meaning', weight: 0.9 },
      { word: 'mean', weight: 0.8 },
      { word: 'spell', weight: 0.7 },
      { word: 'pronounce', weight: 0.7 },
      { word: 'word', weight: 0.6 },
      { word: 'vocabulary', weight: 0.8 },
    ],
    antiKeywords: ['password', 'code', 'variable', 'function'],
  },

  examples: [
    'Define serendipity',
    'What does ephemeral mean?',
    "What's the meaning of ubiquitous?",
    'How do you pronounce quinoa?',
    'Define the word "pragmatic"',
  ],

  counterExamples: ['What is the weather?', 'Define my goals', 'What does this code mean?'],

  arguments: [
    {
      name: 'word',
      type: 'string',
      description: 'The word to look up',
      required: true,
      extractionPatterns: [
        /(?:define|meaning\s+of|definition\s+of)\s+(?:the\s+)?(?:word\s+)?["\']?(\w+)["\']?/i,
        /what\s+does\s+["\']?(\w+)["\']?\s+mean/i,
        /what(?:'s| is)\s+(?:a|an)\s+["\']?(\w+)["\']?/i,
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
      toolId: 'defineWord',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// GET SYNONYMS
// ============================================================================

export const getSynonymsTool: SemanticToolDefinition = {
  id: 'dictionary_synonyms',
  name: 'Get Synonyms',
  description: 'Find synonyms and related words.',
  shortDescription: 'find synonyms',
  category: 'utility',

  triggers: {
    phrases: [
      'synonyms for',
      'another word for',
      'similar words',
      'what is another word',
      'different way to say',
      'thesaurus',
    ],
    patterns: [
      /^(?:what(?:'s| is|'re| are))\s+(?:some\s+)?(?:other|another|similar)\s+words?\s+for\s+["\']?(\w+)["\']?/i,
      /^(?:synonyms?|alternatives?)\s+(?:for|to)\s+["\']?(\w+)["\']?/i,
      /^(?:give\s+me|find|list)\s+(?:some\s+)?synonyms?\s+(?:for|of)\s+["\']?(\w+)["\']?/i,
      /^(?:another|different)\s+(?:word|way)\s+(?:for|to\s+say)\s+["\']?(\w+)["\']?/i,
    ],
    keywords: [
      { word: 'synonym', weight: 1.0 },
      { word: 'synonyms', weight: 1.0 },
      { word: 'thesaurus', weight: 0.9 },
      { word: 'similar', weight: 0.7 },
      { word: 'another word', weight: 0.9 },
      { word: 'alternative', weight: 0.7 },
    ],
    antiKeywords: ['antonym', 'opposite'],
  },

  examples: [
    'What are synonyms for happy?',
    'Another word for beautiful',
    'Give me synonyms for important',
    "What's a different way to say excited?",
  ],

  counterExamples: ["What's the opposite of happy?", 'Antonym for beautiful'],

  arguments: [
    {
      name: 'word',
      type: 'string',
      description: 'The word to find synonyms for',
      required: true,
      extractionPatterns: [
        /synonyms?\s+(?:for|of)\s+["\']?(\w+)["\']?/i,
        /another\s+word\s+for\s+["\']?(\w+)["\']?/i,
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
      toolId: 'getSynonyms',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// WORD OF THE DAY
// ============================================================================

export const wordOfDayTool: SemanticToolDefinition = {
  id: 'dictionary_wotd',
  name: 'Word of the Day',
  description: 'Get an interesting word to learn today.',
  shortDescription: 'word of the day',
  category: 'utility',

  triggers: {
    phrases: [
      'word of the day',
      'teach me a word',
      'new vocabulary',
      'learn a word',
      'interesting word',
    ],
    patterns: [
      /^(?:what(?:'s| is))\s+(?:the\s+)?word\s+of\s+(?:the\s+)?day/i,
      /^(?:give|teach|tell)\s+me\s+(?:a\s+)?(?:new|interesting)\s+word/i,
      /^(?:i\s+want\s+to\s+)?learn\s+(?:a\s+)?(?:new\s+)?word/i,
    ],
    keywords: [
      { word: 'word of the day', weight: 1.0 },
      { word: 'vocabulary', weight: 0.8 },
      { word: 'learn word', weight: 0.8 },
      { word: 'new word', weight: 0.8 },
    ],
    antiKeywords: [],
  },

  examples: [
    "What's the word of the day?",
    'Teach me a new word',
    'Give me an interesting vocabulary word',
    'I want to learn a new word',
  ],

  counterExamples: ['Define serendipity', 'What does ephemeral mean?'],

  arguments: [
    {
      name: 'category',
      type: 'string',
      description: 'Category of word',
      required: false,
      enumValues: ['general', 'advanced', 'casual', 'academic'],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.2,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'wordOfDay',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const dictionaryTools: SemanticToolDefinition[] = [
  defineWordTool,
  getSynonymsTool,
  wordOfDayTool,
];
