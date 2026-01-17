/**
 * Games Tool Definitions for Semantic Router
 *
 * Routes game-related queries for engagement and fun.
 *
 * @module tools/semantic-router/tool-definitions/games
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// PLAY A GAME
// ============================================================================

export const playGameTool: SemanticToolDefinition = {
  id: 'game_play',
  name: 'Play Game',
  description: 'Start a game like 20 questions, trivia, word games, or storytelling.',
  shortDescription: 'play a game',
  category: 'games',

  triggers: {
    phrases: [
      "let's play a game",
      'play a game',
      "i'm bored",
      'play 20 questions',
      'play trivia',
      'word game',
      'guessing game',
      "let's have some fun",
      'entertain me',
      'play something',
      'want to play',
    ],
    patterns: [
      /^(?:let(?:'s| us)|can\s+we|i\s+want\s+to)\s+play\s+(?:a\s+)?(?:game|something)/i,
      /^play\s+(?:a\s+)?(?:game|20\s+questions|trivia|word\s+game)/i,
      /^i(?:'m| am)?\s+bored/i,
      /^(?:can\s+you|want\s+to)\s+play\s+(?:a\s+game\s+)?with\s+me/i,
      /^(?:let(?:'s| us))\s+(?:have\s+)?(?:some\s+)?fun/i,
    ],
    keywords: [
      { word: 'play', weight: 0.8 },
      { word: 'game', weight: 0.9 },
      { word: 'bored', weight: 0.7 },
      { word: '20 questions', weight: 1.0 },
      { word: 'trivia', weight: 0.9 },
      { word: 'fun', weight: 0.6 },
      { word: 'guess', weight: 0.7 },
      { word: 'riddle', weight: 0.8 },
    ],
    antiKeywords: ['music', 'song', 'playlist', 'video', 'movie'],
  },

  examples: [
    "Let's play a game",
    'Play 20 questions with me',
    "I'm bored, entertain me",
    'Can we play trivia?',
    "Let's play a guessing game",
    'Play a word game',
    'Want to play something fun?',
    "Let's have some fun",
  ],

  counterExamples: [
    'Play some music',
    'Play a movie',
    'I played tennis yesterday',
    'What games do you know?',
  ],

  arguments: [
    {
      name: 'gameType',
      type: 'string',
      description: 'Type of game to play',
      required: false,
      enumValues: ['20questions', 'trivia', 'wordgame', 'riddles', 'storytelling', 'random'],
      extractionPatterns: [/play\s+(20\s+questions|trivia|word\s+game|riddles?|story)/i],
    },
    {
      name: 'topic',
      type: 'string',
      description: 'Topic for the game',
      required: false,
      extractionPatterns: [/(?:about|on|with)\s+(.+?)(?:\s+please)?$/i],
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
      toolId: 'playGame',
      args: { gameType: args.gameType || 'random', ...args },
      delegateTo: 'domains/games',
    };
  },
};

// ============================================================================
// TRIVIA GAME
// ============================================================================

export const triviaTool: SemanticToolDefinition = {
  id: 'game_trivia',
  name: 'Trivia Game',
  description: 'Play trivia questions on various topics.',
  shortDescription: 'play trivia',
  category: 'games',

  triggers: {
    phrases: [
      'trivia question',
      'quiz me',
      'test my knowledge',
      'trivia time',
      'ask me trivia',
      'trivia game',
    ],
    patterns: [
      /^(?:give\s+me|ask\s+me)\s+(?:a\s+)?trivia(?:\s+question)?/i,
      /^quiz\s+me(?:\s+on|\s+about)?/i,
      /^(?:test|challenge)\s+my\s+(?:knowledge|brain)/i,
      /^trivia\s+(?:time|question|game)/i,
    ],
    keywords: [
      { word: 'trivia', weight: 1.0 },
      { word: 'quiz', weight: 0.9 },
      { word: 'question', weight: 0.5 },
      { word: 'knowledge', weight: 0.6 },
      { word: 'test', weight: 0.5 },
    ],
    antiKeywords: ['help', 'explain', 'what is'],
  },

  examples: [
    'Give me a trivia question',
    'Quiz me on history',
    'Test my knowledge',
    'Trivia time!',
    'Ask me something',
  ],

  counterExamples: ['What is trivia?', 'Help me study', 'Explain this to me'],

  arguments: [
    {
      name: 'category',
      type: 'string',
      description: 'Trivia category',
      required: false,
      enumValues: ['general', 'history', 'science', 'sports', 'entertainment', 'geography'],
      extractionPatterns: [
        /(?:on|about)\s+(history|science|sports|entertainment|geography|movies|music)/i,
      ],
    },
    {
      name: 'difficulty',
      type: 'string',
      description: 'Difficulty level',
      required: false,
      enumValues: ['easy', 'medium', 'hard'],
      extractionPatterns: [/(easy|medium|hard)\s+(?:question|trivia)/i],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'triviaGame',
      args,
      delegateTo: 'domains/games',
    };
  },
};

// ============================================================================
// STORYTELLING GAME
// ============================================================================

export const storytellingTool: SemanticToolDefinition = {
  id: 'game_storytelling',
  name: 'Storytelling Game',
  description: 'Collaborative storytelling where we build a story together.',
  shortDescription: 'tell a story together',
  category: 'games',

  triggers: {
    phrases: [
      'tell me a story',
      'make up a story',
      'collaborative story',
      "let's write a story",
      'story time',
      'create a story',
    ],
    patterns: [
      /^(?:tell|make\s+up|create)\s+(?:me\s+)?a\s+story/i,
      /^(?:let(?:'s| us))\s+(?:write|create|make)\s+(?:a\s+)?story/i,
      /^story\s+time/i,
      /^collaborative\s+(?:story|storytelling)/i,
    ],
    keywords: [
      { word: 'story', weight: 0.9 },
      { word: 'tell', weight: 0.5 },
      { word: 'create', weight: 0.6 },
      { word: 'write', weight: 0.6 },
      { word: 'adventure', weight: 0.7 },
      { word: 'tale', weight: 0.8 },
    ],
    antiKeywords: ['my story', 'life story', 'what happened'],
  },

  examples: [
    'Tell me a story',
    "Let's write a story together",
    'Story time!',
    'Create an adventure story',
    'Make up a story about a dragon',
  ],

  counterExamples: [
    'Tell me about your story',
    "What's your life story?",
    'I have a story to tell',
  ],

  arguments: [
    {
      name: 'genre',
      type: 'string',
      description: 'Story genre',
      required: false,
      enumValues: ['adventure', 'mystery', 'fantasy', 'scifi', 'romance', 'comedy'],
      extractionPatterns: [/(adventure|mystery|fantasy|sci-?fi|romance|comedy|funny)\s+story/i],
    },
    {
      name: 'about',
      type: 'string',
      description: 'Story subject',
      required: false,
      extractionPatterns: [/story\s+(?:about|with|featuring)\s+(.+?)$/i],
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
      toolId: 'storytellingGame',
      args,
      delegateTo: 'domains/games',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const gamesTools: SemanticToolDefinition[] = [playGameTool, triviaTool, storytellingTool];
