/**
 * Dating Tool Definitions for Semantic Router
 *
 * Routes dating, dating apps, and romantic pursuit queries.
 *
 * @module tools/semantic-router/tool-definitions/dating
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// DATING ADVICE
// ============================================================================

export const datingAdviceTool: SemanticToolDefinition = {
  id: 'dating_advice',
  name: 'Dating Advice',
  description: 'Help with dating, meeting people, and romantic pursuits.',
  shortDescription: 'dating advice',
  category: 'dating',

  triggers: {
    phrases: [
      'dating advice',
      'how to date',
      'meet someone',
      'find a partner',
      'looking for love',
      'dating tips',
      'single life',
      'dating scene',
    ],
    patterns: [
      /^(?:help|advice)\s+(?:with|for|on)\s+(?:my\s+)?dating/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:meet|find)\s+(?:someone|a\s+partner)/i,
      /^(?:i(?:'m| am)?|i(?:'ve| have)?\s+been)\s+(?:trying\s+to\s+date|single|looking)/i,
      /^(?:tips|advice)\s+(?:for|on)\s+dating/i,
    ],
    keywords: [
      { word: 'dating', weight: 1.0 },
      { word: 'date', weight: 0.9 },
      { word: 'single', weight: 0.7 },
      { word: 'partner', weight: 0.7 },
      { word: 'romance', weight: 0.8 },
      { word: 'relationship', weight: 0.5 },
    ],
    antiKeywords: ['breakup', 'divorce', 'ex'],
  },

  examples: [
    'Give me dating advice',
    'How do I meet someone?',
    "I'm tired of being single",
    'Dating tips please',
    'How do I find a partner?',
    'Help me with the dating scene',
  ],

  counterExamples: ['Going through a breakup', 'My ex', 'Relationship problems with my partner'],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'Dating topic',
      required: false,
      enumValues: ['meeting_people', 'first_dates', 'apps', 'confidence', 'general'],
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
      toolId: 'datingAdvice',
      args,
      delegateTo: 'domains/dating',
    };
  },
};

// ============================================================================
// DATING APPS
// ============================================================================

export const datingAppsTool: SemanticToolDefinition = {
  id: 'dating_apps',
  name: 'Dating Apps Help',
  description: 'Help with dating apps, profiles, and online dating.',
  shortDescription: 'dating app help',
  category: 'dating',

  triggers: {
    phrases: [
      'dating app',
      'dating profile',
      'tinder',
      'hinge',
      'bumble',
      'online dating',
      'swipe right',
      'no matches',
    ],
    patterns: [
      /^(?:help|advice)\s+(?:with|for)\s+(?:my\s+)?(?:dating\s+)?(?:app|profile)/i,
      /^(?:improve|fix|write)\s+(?:my\s+)?(?:dating\s+)?profile/i,
      /^(?:i(?:'m| am)?)\s+(?:not\s+getting|getting\s+no)\s+(?:matches|likes)/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:get\s+more\s+)?(?:matches|likes|swipes)/i,
    ],
    keywords: [
      { word: 'dating app', weight: 1.0 },
      { word: 'profile', weight: 0.8 },
      { word: 'tinder', weight: 1.0 },
      { word: 'hinge', weight: 1.0 },
      { word: 'bumble', weight: 1.0 },
      { word: 'matches', weight: 0.8 },
      { word: 'swipe', weight: 0.9 },
      { word: 'online dating', weight: 1.0 },
    ],
    antiKeywords: [],
  },

  examples: [
    'Help with my dating profile',
    "I'm not getting any matches on Tinder",
    'How do I improve my Hinge profile?',
    'Online dating tips',
    'Write my dating bio',
    'Why am I not getting likes?',
  ],

  counterExamples: ['Delete my dating app', 'I quit dating apps'],

  arguments: [
    {
      name: 'app',
      type: 'string',
      description: 'Which dating app',
      required: false,
      enumValues: ['tinder', 'hinge', 'bumble', 'other'],
      extractionPatterns: [/(tinder|hinge|bumble|okcupid|match)/i],
    },
    {
      name: 'issue',
      type: 'string',
      description: 'What issue to address',
      required: false,
      enumValues: ['profile', 'photos', 'messages', 'matches'],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'datingApps',
      args,
      delegateTo: 'domains/dating',
    };
  },
};

// ============================================================================
// FIRST DATE HELP
// ============================================================================

export const firstDateTool: SemanticToolDefinition = {
  id: 'dating_first_date',
  name: 'First Date Help',
  description: 'Help planning and preparing for first dates.',
  shortDescription: 'first date help',
  category: 'dating',

  triggers: {
    phrases: [
      'first date',
      'date ideas',
      'date conversation',
      'nervous about date',
      'what to wear',
      'date planning',
      'good date spots',
    ],
    patterns: [
      /^(?:i\s+have|got)\s+(?:a\s+)?(?:first\s+)?date/i,
      /^(?:help|advice)\s+(?:with|for)\s+(?:my\s+)?(?:first\s+)?date/i,
      /^(?:what|where)\s+(?:should|can)\s+(?:i|we)\s+(?:do|go)\s+(?:on|for)\s+(?:a\s+)?date/i,
      /^(?:i(?:'m| am)?)\s+(?:nervous|anxious)\s+(?:about|for)\s+(?:my\s+)?date/i,
    ],
    keywords: [
      { word: 'first date', weight: 1.0 },
      { word: 'date', weight: 0.8 },
      { word: 'date ideas', weight: 0.9 },
      { word: 'nervous', weight: 0.5 },
      { word: 'conversation', weight: 0.4 },
    ],
    antiKeywords: ['anniversary', 'married', 'years together'],
  },

  examples: [
    'I have a first date tomorrow',
    'What should we do on our date?',
    "I'm nervous about my date",
    'First date conversation tips',
    'Good first date spots',
    'What to wear on a first date',
  ],

  counterExamples: ['Anniversary date night', 'Date with my spouse of 10 years'],

  arguments: [
    {
      name: 'help_type',
      type: 'string',
      description: 'Type of first date help',
      required: false,
      enumValues: ['planning', 'conversation', 'nerves', 'outfit', 'general'],
    },
    {
      name: 'when',
      type: 'string',
      description: 'When the date is',
      required: false,
      extractionPatterns: [/date\s+(tonight|tomorrow|this\s+(?:week|weekend))/i],
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
      toolId: 'firstDateHelp',
      args,
      delegateTo: 'domains/dating',
    };
  },
};

// ============================================================================
// BREAKUP RECOVERY
// ============================================================================

export const breakupRecoveryTool: SemanticToolDefinition = {
  id: 'dating_breakup',
  name: 'Breakup Recovery',
  description: 'Help processing and recovering from a breakup.',
  shortDescription: 'breakup help',
  category: 'dating',

  triggers: {
    phrases: [
      'just broke up',
      'going through a breakup',
      'ex',
      'heartbroken',
      'got dumped',
      'ended things',
      'miss my ex',
      'get over someone',
    ],
    patterns: [
      /^(?:i\s+)?(?:just\s+)?(?:broke\s+up|got\s+dumped|ended\s+things)/i,
      /^(?:i(?:'m| am)?|i(?:'ve| have)?\s+been)\s+(?:going\s+through\s+)?(?:a\s+)?breakup/i,
      /^(?:i(?:'m| am)?|feeling)\s+(?:so\s+)?heartbroken/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:get\s+over|move\s+on\s+from)\s+(?:my\s+)?(?:ex|someone)/i,
    ],
    keywords: [
      { word: 'breakup', weight: 1.0 },
      { word: 'broke up', weight: 1.0 },
      { word: 'ex', weight: 0.9 },
      { word: 'heartbroken', weight: 0.9 },
      { word: 'dumped', weight: 0.9 },
      { word: 'get over', weight: 0.7 },
      { word: 'move on', weight: 0.7 },
    ],
    antiKeywords: ['break up a fight', 'breakup of company'],
  },

  examples: [
    'I just broke up with my partner',
    'Going through a painful breakup',
    "I'm heartbroken",
    'How do I get over my ex?',
    "I can't stop thinking about them",
    'Got dumped yesterday',
  ],

  counterExamples: ['Break up a fight', 'Company breakup'],

  arguments: [
    {
      name: 'recency',
      type: 'string',
      description: 'How recent the breakup was',
      required: false,
      enumValues: ['just_happened', 'recent', 'months_ago', 'long_ago'],
      extractionPatterns: [/(?:broke\s+up|dumped)\s+(today|yesterday|last\s+week|last\s+month)/i],
    },
    {
      name: 'concern',
      type: 'string',
      description: 'Primary concern',
      required: false,
      enumValues: ['pain', 'moving_on', 'closure', 'wanting_back'],
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
      toolId: 'breakupRecovery',
      args,
      delegateTo: 'domains/dating',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const datingTools: SemanticToolDefinition[] = [
  datingAdviceTool,
  datingAppsTool,
  firstDateTool,
  breakupRecoveryTool,
];
