/**
 * Grief Tool Definitions for Semantic Router
 *
 * SENSITIVE: Routes grief, loss, and mourning-related queries
 * with compassionate, trauma-informed responses.
 *
 * @module tools/semantic-router/tool-definitions/grief
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// GRIEF SUPPORT
// ============================================================================

export const griefSupportTool: SemanticToolDefinition = {
  id: 'grief_support',
  name: 'Grief Support',
  description: 'Compassionate support for those experiencing loss and grief.',
  shortDescription: 'grief support',
  category: 'grief',

  triggers: {
    phrases: [
      'i lost someone',
      'death in the family',
      'someone died',
      'i miss them',
      "i'm grieving",
      "can't stop crying",
      'loss of a loved one',
      'passed away',
      'they died',
      'dealing with death',
    ],
    patterns: [
      /^(?:i\s+)?(?:just\s+)?lost\s+(?:my\s+)?(?:\w+)/i,
      /^my\s+(?:\w+)\s+(?:passed\s+away|died|is\s+gone)/i,
      /^(?:i(?:'m| am)?|i(?:'ve| have)?\s+been)\s+(?:so\s+)?(?:grieving|mourning)/i,
      /^i\s+miss\s+(?:my\s+)?(?:\w+)\s+(?:so\s+much)?/i,
      /^(?:dealing|coping)\s+with\s+(?:the\s+)?(?:loss|death|grief)/i,
    ],
    keywords: [
      { word: 'grief', weight: 1.0 },
      { word: 'grieving', weight: 1.0 },
      { word: 'died', weight: 0.9 },
      { word: 'death', weight: 0.9 },
      { word: 'loss', weight: 0.8 },
      { word: 'passed away', weight: 1.0 },
      { word: 'mourning', weight: 1.0 },
      { word: 'miss them', weight: 0.8 },
      { word: 'gone', weight: 0.5 },
    ],
    antiKeywords: ['lost my keys', 'lost weight', 'lost my job'],
  },

  examples: [
    'I lost my father last week',
    "My mom passed away and I'm struggling",
    "I'm grieving and don't know what to do",
    'I miss my grandmother so much',
    "My best friend died and I can't stop crying",
    'How do I deal with this loss?',
    "My dog died and I'm devastated",
  ],

  counterExamples: ['I lost my phone', 'I lost my job', 'I lost weight', 'Lost and found'],

  arguments: [
    {
      name: 'relationship',
      type: 'string',
      description: 'Relationship to the person lost',
      required: false,
      extractionPatterns: [
        /(?:lost|miss)\s+(?:my\s+)?(.+?)(?:\s+and|\s+last|\s+who|$)/i,
        /my\s+(.+?)\s+(?:passed|died)/i,
      ],
    },
    {
      name: 'timeframe',
      type: 'string',
      description: 'When the loss occurred',
      required: false,
      extractionPatterns: [
        /(yesterday|last\s+(?:week|month|year)|recently|today|\d+\s+(?:days?|weeks?|months?)\s+ago)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9, // High confidence - prioritize grief support
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5, // Strong penalty for non-grief contexts
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'griefSupport',
      args,
      delegateTo: 'domains/grief',
    };
  },
};

// ============================================================================
// GRIEF WAVES / TRIGGERS
// ============================================================================

export const griefWavesTool: SemanticToolDefinition = {
  id: 'grief_waves',
  name: 'Grief Waves',
  description: 'Help navigate sudden waves of grief and emotional triggers.',
  shortDescription: 'grief waves help',
  category: 'grief',

  triggers: {
    phrases: [
      'grief hit me',
      'wave of grief',
      'suddenly overwhelmed',
      'triggered by memories',
      'grief came back',
      'out of nowhere',
      'anniversary of death',
      'grief trigger',
    ],
    patterns: [
      /^(?:grief|sadness|pain)\s+(?:just\s+)?(?:hit|came|washed)/i,
      /^(?:i(?:'m| am)?|feeling)\s+(?:suddenly\s+)?(?:overwhelmed|overcome)\s+(?:by|with)\s+grief/i,
      /^(?:the\s+)?(?:anniversary|birthday|holiday)\s+(?:is\s+coming|reminds\s+me)/i,
      /^(?:something\s+)?(?:triggered|reminded)\s+(?:me\s+(?:of|about))?/i,
    ],
    keywords: [
      { word: 'wave', weight: 0.8 },
      { word: 'triggered', weight: 0.8 },
      { word: 'overwhelmed', weight: 0.7 },
      { word: 'anniversary', weight: 0.8 },
      { word: 'memories', weight: 0.6 },
      { word: 'reminded', weight: 0.6 },
      { word: 'suddenly', weight: 0.5 },
    ],
    antiKeywords: [],
  },

  examples: [
    'A wave of grief just hit me',
    "I saw their photo and I'm suddenly overwhelmed",
    'The anniversary of their death is coming up',
    'Something reminded me of them and I lost it',
    'The grief came back out of nowhere',
    'Holidays are so hard without them',
  ],

  counterExamples: ['I was triggered by something at work', 'The anniversary of my job'],

  arguments: [
    {
      name: 'trigger',
      type: 'string',
      description: 'What triggered the grief wave',
      required: false,
      extractionPatterns: [
        /(?:triggered|reminded)\s+(?:me\s+)?(?:by|of)\s+(.+?)$/i,
        /(?:saw|heard|found)\s+(.+?)$/i,
      ],
    },
    {
      name: 'occasion',
      type: 'string',
      description: 'Special occasion if applicable',
      required: false,
      enumValues: ['anniversary', 'birthday', 'holiday', 'other'],
      extractionPatterns: [/(anniversary|birthday|holiday|christmas|thanksgiving)/i],
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
      toolId: 'griefWaves',
      args,
      delegateTo: 'domains/grief',
    };
  },
};

// ============================================================================
// HONORING MEMORY
// ============================================================================

export const honoringMemoryTool: SemanticToolDefinition = {
  id: 'grief_honor',
  name: 'Honoring Memory',
  description: 'Ideas for honoring and remembering loved ones who have passed.',
  shortDescription: 'honor their memory',
  category: 'grief',

  triggers: {
    phrases: [
      'honor their memory',
      'remember them',
      'keep their memory alive',
      'memorial ideas',
      'tribute to',
      'celebrate their life',
      'legacy',
    ],
    patterns: [
      /^(?:how\s+(?:can|do)\s+i)\s+(?:honor|remember|celebrate)/i,
      /^(?:i\s+want\s+to)\s+(?:keep|honor)\s+(?:their|his|her)\s+(?:memory|legacy)/i,
      /^(?:ideas|ways)\s+(?:to|for)\s+(?:honor|remember|memorialize)/i,
      /^(?:what\s+can\s+i\s+do)\s+(?:to|for)\s+(?:remember|honor)/i,
    ],
    keywords: [
      { word: 'honor', weight: 0.9 },
      { word: 'memory', weight: 0.8 },
      { word: 'remember', weight: 0.7 },
      { word: 'memorial', weight: 0.9 },
      { word: 'tribute', weight: 0.9 },
      { word: 'legacy', weight: 0.8 },
      { word: 'celebrate', weight: 0.6 },
    ],
    antiKeywords: ['forget', 'move on'],
  },

  examples: [
    'How can I honor their memory?',
    'I want to keep their legacy alive',
    'Ideas for a memorial',
    'Ways to remember my grandmother',
    'I want to celebrate their life',
    'How do I create a tribute?',
  ],

  counterExamples: ['Help me forget', 'How do I move on?'],

  arguments: [
    {
      name: 'relationship',
      type: 'string',
      description: 'Relationship to the person',
      required: false,
      extractionPatterns: [
        /(?:my\s+)?(.+?)(?:'s\s+memory|'s\s+life|'s\s+legacy)/i,
        /remember\s+(?:my\s+)?(.+?)$/i,
      ],
    },
    {
      name: 'memorialType',
      type: 'string',
      description: 'Type of memorial',
      required: false,
      enumValues: ['physical', 'digital', 'ritual', 'charity', 'other'],
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.2,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'honoringMemory',
      args,
      delegateTo: 'domains/grief',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const griefTools: SemanticToolDefinition[] = [
  griefSupportTool,
  griefWavesTool,
  honoringMemoryTool,
];
