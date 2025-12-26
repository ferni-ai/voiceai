/**
 * Humor Tool Definitions for Semantic Router
 *
 * Jokes, fun facts, and mini-stories for light moments.
 *
 * @module tools/semantic-router/tool-definitions/humor
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// TELL JOKE
// ============================================================================

export const tellJokeTool: SemanticToolDefinition = {
  id: 'humor_joke',
  name: 'Tell Joke',
  description: 'Tell a joke - dad jokes, puns, clever humor.',
  shortDescription: 'tell a joke',
  category: 'entertainment',

  triggers: {
    phrases: [
      'tell me a joke',
      'make me laugh',
      'say something funny',
      'got any jokes',
      'give me a joke',
      'need a laugh',
      'cheer me up',
      'tell me something funny',
      'dad joke',
      'pun',
    ],
    patterns: [
      /^tell\s+(?:me\s+)?(?:a\s+)?joke/i,
      /^(?:make|get)\s+me\s+(?:to\s+)?laugh/i,
      /^(?:say|tell)\s+(?:me\s+)?something\s+funny/i,
      /^(?:got|have|know)\s+any\s+jokes?/i,
      /^(?:I\s+)?need\s+(?:a\s+)?laugh/i,
      /^(?:cheer|brighten)\s+me\s+up/i,
      /^(?:give|hit)\s+me\s+(?:with\s+)?(?:a\s+)?(?:joke|pun)/i,
    ],
    keywords: [
      { word: 'joke', weight: 1.0 },
      { word: 'laugh', weight: 0.9 },
      { word: 'funny', weight: 0.9 },
      { word: 'pun', weight: 0.9 },
      { word: 'humor', weight: 0.8 },
      { word: 'dad joke', weight: 1.0 },
      { word: 'cheer', weight: 0.7 },
    ],
    antiKeywords: ['serious', 'help', 'important'],
  },

  examples: [
    'Tell me a joke',
    'Make me laugh',
    'Got any good puns?',
    'I need a laugh',
    'Cheer me up with a joke',
    'Hit me with a dad joke',
    'Say something funny',
  ],

  counterExamples: [
    "This isn't a joke",
    'Stop joking around',
    'I need serious help',
    "That's not funny",
  ],

  arguments: [
    {
      name: 'category',
      type: 'string',
      description: 'Type of joke',
      required: false,
      enumValues: ['any', 'dad', 'pun', 'clever', 'absurd'],
      extractionPatterns: [
        /(dad|pun|clever|absurd)\s+joke/i,
        /joke.*?(dad|pun|clever|absurd)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'tellJoke',
      args: { category: args.category || 'any' },
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// FUN FACT
// ============================================================================

export const funFactTool: SemanticToolDefinition = {
  id: 'humor_fact',
  name: 'Fun Fact',
  description: 'Share an interesting fun fact.',
  shortDescription: 'share a fun fact',
  category: 'entertainment',

  triggers: {
    phrases: [
      'tell me a fun fact',
      'random fact',
      'interesting fact',
      'did you know',
      'blow my mind',
      'something interesting',
      'trivia',
      'learn something new',
      'fun fact',
    ],
    patterns: [
      /^tell\s+(?:me\s+)?(?:a\s+)?(?:fun|interesting|random)\s+fact/i,
      /^(?:give\s+me\s+)?(?:a\s+)?(?:random|fun)\s+fact/i,
      /^(?:blow|expand)\s+my\s+mind/i,
      /^(?:I\s+want\s+to|want\s+to)\s+learn\s+something\s+new/i,
      /^(?:did\s+you\s+know|know\s+that)/i,
      /^something\s+interesting/i,
    ],
    keywords: [
      { word: 'fact', weight: 1.0 },
      { word: 'interesting', weight: 0.8 },
      { word: 'random', weight: 0.7 },
      { word: 'trivia', weight: 0.8 },
      { word: 'learn', weight: 0.6 },
      { word: 'mind', weight: 0.5 },
      { word: 'did you know', weight: 0.9 },
    ],
    antiKeywords: ['weather', 'news', 'serious'],
  },

  examples: [
    'Tell me a fun fact',
    'Give me a random fact',
    'Blow my mind',
    'I want to learn something new',
    'Something interesting about space',
    'Fun fact about history',
  ],

  counterExamples: [
    "What's the weather?",
    'Tell me the news',
    'Fact check this',
    'Is this a fact?',
  ],

  arguments: [
    {
      name: 'category',
      type: 'string',
      description: 'Category of fact',
      required: false,
      enumValues: ['any', 'science', 'history', 'nature', 'space', 'human-body', 'food', 'random'],
      extractionPatterns: [
        /(?:fact|something)\s+(?:about\s+)?(science|history|nature|space|body|food)/i,
        /(science|history|nature|space|body|food)\s+fact/i,
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
      toolId: 'getFunFact',
      args: { category: args.category || 'any' },
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// MINI STORY
// ============================================================================

export const miniStoryTool: SemanticToolDefinition = {
  id: 'humor_story',
  name: 'Mini Story',
  description: 'Tell a short, heartwarming or inspiring mini-story.',
  shortDescription: 'tell a mini story',
  category: 'entertainment',

  triggers: {
    phrases: [
      'tell me a short story',
      'mini story',
      'quick story',
      'heartwarming story',
      'inspiring story',
      'tell me a tale',
      'share a story',
      'story time',
    ],
    patterns: [
      /^tell\s+(?:me\s+)?(?:a\s+)?(?:short|mini|quick|little)\s+story/i,
      /^(?:share|give\s+me)\s+(?:a\s+)?story/i,
      /^(?:story\s+time|storytime)/i,
      /^(?:heartwarming|inspiring|uplifting)\s+story/i,
      /^tell\s+(?:me\s+)?(?:a\s+)?tale/i,
    ],
    keywords: [
      { word: 'story', weight: 1.0 },
      { word: 'tale', weight: 0.9 },
      { word: 'short', weight: 0.5 },
      { word: 'heartwarming', weight: 0.8 },
      { word: 'inspiring', weight: 0.8 },
      { word: 'uplifting', weight: 0.7 },
    ],
    antiKeywords: ['my story', 'life story', 'what happened to me'],
  },

  examples: [
    'Tell me a short story',
    'Mini story please',
    'Story time!',
    'Share a heartwarming story',
    'Tell me an inspiring tale',
    'Quick story about friendship',
  ],

  counterExamples: [
    'Tell me about my story',
    "What's my life story?",
    'I have a story to share',
    'Let me tell you what happened',
  ],

  arguments: [
    {
      name: 'mood',
      type: 'string',
      description: 'Mood of the story',
      required: false,
      enumValues: ['any', 'heartwarming', 'inspiring', 'funny', 'thoughtful'],
      extractionPatterns: [
        /(heartwarming|inspiring|funny|thoughtful)\s+story/i,
        /story.*?(heartwarming|inspiring|funny|thoughtful)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.8,
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
      toolId: 'tellMiniStory',
      args: { mood: args.mood || 'any' },
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const humorTools: SemanticToolDefinition[] = [tellJokeTool, funFactTool, miniStoryTool];

