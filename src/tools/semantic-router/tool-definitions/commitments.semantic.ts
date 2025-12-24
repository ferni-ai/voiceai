/**
 * Commitment Tool Definitions for Semantic Router
 *
 * Routes commitment/accountability-related queries.
 * "Better Than Human" - never forgets what you said you'd do.
 *
 * @module tools/semantic-router/tool-definitions/commitments
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// RECORD COMMITMENT
// ============================================================================

/**
 * Detects when user makes a commitment, promise, or intention
 * These should be captured and tracked for follow-up
 */
export const recordCommitmentTool: SemanticToolDefinition = {
  id: 'productivity_record_commitment',
  name: 'Record Commitment',
  description: 'Record a commitment, intention, or promise the user made.',
  shortDescription: 'track commitment',
  category: 'productivity',

  triggers: {
    phrases: [
      "i'm going to",
      'i will',
      'i promise',
      'i commit to',
      "i've decided",
      'i need to',
      'i have to',
      "i'm committed to",
      'my goal is',
      'i swear',
    ],
    patterns: [
      /^i(?:'m| am)\s+going\s+to\s+(.+)/i,
      /^i(?:'ll| will)\s+(.+)/i,
      /^i\s+promise\s+(?:to\s+)?(.+)/i,
      /^i\s+commit\s+to\s+(.+)/i,
      /^i(?:'ve| have)\s+decided\s+(?:to\s+)?(.+)/i,
      /^i\s+need\s+to\s+(.+)/i,
      /^my\s+goal\s+is\s+(?:to\s+)?(.+)/i,
      /^i(?:'m| am)\s+done\s+with\s+(.+)/i,
      /^no\s+more\s+(.+)/i,
    ],
    keywords: [
      { word: 'promise', weight: 1.0 },
      { word: 'commit', weight: 1.0 },
      { word: 'decided', weight: 0.9 },
      { word: 'goal', weight: 0.8 },
      { word: 'going to', weight: 0.7 },
      { word: 'will', weight: 0.6 },
      { word: 'swear', weight: 0.9 },
      { word: 'vow', weight: 0.9 },
    ],
    antiKeywords: ['what if', 'maybe', 'might', 'could', 'thinking about'],
  },

  examples: [
    "I'm going to call my mom this week",
    'I promise to exercise every day',
    "I've decided to quit smoking",
    'I need to have that conversation with my boss',
    'My goal is to read 20 books this year',
    "I'm done with social media after 9pm",
    'No more junk food for me',
    'I commit to meditating every morning',
  ],

  counterExamples: [
    'I might try to exercise', // Too tentative
    'Maybe I should call mom', // Not a commitment
    "I'm thinking about quitting", // Just considering
    'What if I started running?', // Hypothetical
  ],

  arguments: [
    {
      name: 'statement',
      type: 'string',
      description: 'The full commitment statement',
      required: true,
      extractionPatterns: [/^(i(?:'m| am| will| promise).+)$/i],
    },
    {
      name: 'type',
      type: 'string',
      description: 'Type of commitment',
      required: false,
      enumValues: [
        'intention',
        'promise',
        'goal',
        'boundary',
        'conversation',
        'decision',
        'experiment',
      ],
    },
  ],

  confidence: {
    baseScore: 0.75, // Lower base - needs pattern match to confirm
    patternMatchBonus: 0.2,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'recordCommitment',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// GET COMMITMENTS
// ============================================================================

export const getCommitmentsTool: SemanticToolDefinition = {
  id: 'productivity_get_commitments',
  name: 'Get Commitments',
  description: 'View active commitments and promises.',
  shortDescription: 'show commitments',
  category: 'productivity',

  triggers: {
    phrases: [
      'my commitments',
      'what did I commit to',
      'what did I promise',
      'my promises',
      'what am I working on',
      'my goals',
      'what did I say I would do',
    ],
    patterns: [
      /^(?:what\s+are\s+)?(?:my\s+)?commitments/i,
      /^(?:what\s+did\s+i)\s+(?:commit|promise)\s+(?:to|that)/i,
      /^(?:show|list)\s+(?:my\s+)?(?:commitments|promises|goals)/i,
      /^(?:what\s+am\s+i\s+working\s+on)/i,
      /^(?:what\s+did\s+i\s+say\s+i\s+would\s+do)/i,
      /^(?:what\s+have\s+i\s+committed\s+to)/i,
    ],
    keywords: [
      { word: 'commitments', weight: 1.0 },
      { word: 'commitment', weight: 1.0 },
      { word: 'promises', weight: 0.9 },
      { word: 'promise', weight: 0.9 },
      { word: 'goals', weight: 0.8 },
      { word: 'working on', weight: 0.7 },
    ],
    antiKeywords: ['set', 'create', 'add', 'new', 'make'],
  },

  examples: [
    'What are my commitments?',
    'Show my commitments',
    'What did I promise to do?',
    'What am I working on?',
    'List my goals',
    'What did I say I would do?',
  ],

  counterExamples: [
    "I'm going to start exercising", // Making a commitment
    'I promise to call', // Making a commitment
  ],

  arguments: [],

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
      toolId: 'getCommitments',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// COMPLETE COMMITMENT
// ============================================================================

export const completeCommitmentTool: SemanticToolDefinition = {
  id: 'productivity_complete_commitment',
  name: 'Complete Commitment',
  description: 'Mark a commitment as completed.',
  shortDescription: 'done with commitment',
  category: 'productivity',

  triggers: {
    phrases: [
      'I did it',
      'I followed through',
      'I kept my promise',
      'I completed',
      'I finished',
      'I made good on',
      'I held up my end',
    ],
    patterns: [
      /^i\s+(?:did|completed|finished)\s+(?:it|that|the\s+.+)/i,
      /^i\s+(?:followed\s+through|kept\s+my\s+promise)/i,
      /^(?:i\s+)?(?:finally\s+)?(?:called|talked\s+to|spoke\s+with)\s+(.+)/i,
      /^(?:mark|set)\s+(?:my\s+)?(?:commitment|promise|goal)\s+(?:as\s+)?(?:done|complete)/i,
      /^i\s+made\s+good\s+on\s+(.+)/i,
    ],
    keywords: [
      { word: 'did it', weight: 0.9 },
      { word: 'completed', weight: 0.9 },
      { word: 'finished', weight: 0.8 },
      { word: 'followed through', weight: 1.0 },
      { word: 'kept my promise', weight: 1.0 },
      { word: 'done', weight: 0.7 },
    ],
    antiKeywords: ['going to', 'will', 'need to', 'have to'],
  },

  examples: [
    'I did it! I called my mom',
    'I followed through on my commitment',
    'I kept my promise and exercised',
    'Mark my gym commitment as done',
    'I finally talked to my boss',
    'I made good on my promise',
  ],

  counterExamples: [
    "I'm going to do it", // Future, not done
    'I need to finish', // Not done yet
  ],

  arguments: [
    {
      name: 'commitmentQuery',
      type: 'string',
      description: 'Which commitment was completed',
      required: false,
      extractionPatterns: [
        /i\s+(?:did|completed|finished)\s+(?:the\s+)?(.+)/i,
        /(?:mark|set)\s+(?:my\s+)?(.+)\s+(?:as\s+)?(?:done|complete)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.15,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'completeCommitment',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// DEFER COMMITMENT
// ============================================================================

export const deferCommitmentTool: SemanticToolDefinition = {
  id: 'productivity_defer_commitment',
  name: 'Defer Commitment',
  description: 'Postpone a commitment to later.',
  shortDescription: 'postpone commitment',
  category: 'productivity',

  triggers: {
    phrases: [
      "I couldn't do it",
      "I didn't get to it",
      'I need more time',
      "I'm not ready yet",
      'put it on hold',
      'postpone',
      'defer',
    ],
    patterns: [
      /^i\s+(?:couldn(?:'t|'t)|didn(?:'t|'t))\s+(?:do|get\s+to)\s+(.+)/i,
      /^(?:put|hold)\s+(?:the\s+)?(.+)\s+(?:on\s+hold|off)/i,
      /^(?:postpone|defer)\s+(?:my\s+)?(.+)/i,
      /^i(?:'m| am)\s+not\s+ready\s+(?:for|to)\s+(.+)/i,
      /^i\s+need\s+more\s+time\s+(?:for|on|with)\s+(.+)/i,
    ],
    keywords: [
      { word: 'postpone', weight: 1.0 },
      { word: 'defer', weight: 1.0 },
      { word: 'hold', weight: 0.7 },
      { word: "couldn't", weight: 0.7 },
      { word: 'more time', weight: 0.8 },
      { word: 'not ready', weight: 0.8 },
    ],
    antiKeywords: ['did it', 'completed', 'finished', 'done'],
  },

  examples: [
    "I couldn't call my mom yet",
    "I didn't get to the gym",
    'Put my exercise goal on hold',
    'I need more time on the job search',
    "I'm not ready to have that conversation yet",
    'Defer my commitment to quit smoking',
  ],

  counterExamples: [
    'I did it', // Completed, not deferred
    'I finished the task', // Completed
  ],

  arguments: [
    {
      name: 'commitmentQuery',
      type: 'string',
      description: 'Which commitment to defer',
      required: true,
      extractionPatterns: [
        /(?:postpone|defer)\s+(?:my\s+)?(.+)/i,
        /(?:put|hold)\s+(?:the\s+)?(.+)\s+(?:on\s+hold|off)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.15,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'deferCommitment',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const commitmentSemanticTools: SemanticToolDefinition[] = [
  recordCommitmentTool,
  getCommitmentsTool,
  completeCommitmentTool,
  deferCommitmentTool,
];
