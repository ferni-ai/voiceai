/**
 * Life Coaching Tool Definitions for Semantic Router
 *
 * Routes life coaching queries - burnout, stress, boundaries, anger,
 * procrastination, perfectionism, and personal growth.
 *
 * @module tools/semantic-router/tool-definitions/life-coaching
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// BURNOUT ASSESSMENT
// ============================================================================

export const burnoutTool: SemanticToolDefinition = {
  id: 'coaching_burnout',
  name: 'Burnout Support',
  description: 'Help identify and recover from burnout.',
  shortDescription: 'burnout help',
  category: 'life-coaching',

  triggers: {
    phrases: [
      "i'm burned out",
      'feeling burned out',
      'exhausted all the time',
      "can't keep going",
      'running on empty',
      'nothing left to give',
      'completely drained',
      'burnout recovery',
    ],
    patterns: [
      /^(?:i(?:'m| am)?|i\s+feel)\s+(?:so\s+)?(?:burned?\s*out|exhausted|drained)/i,
      /^(?:i(?:'m| am)?|feeling)\s+(?:running\s+on\s+empty|completely\s+depleted)/i,
      /^(?:i\s+)?(?:can(?:'t|not)|don(?:'t| not))\s+(?:keep\s+going|do\s+this\s+anymore)/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:recover\s+from|deal\s+with)\s+burnout/i,
    ],
    keywords: [
      { word: 'burnout', weight: 1.0 },
      { word: 'burned out', weight: 1.0 },
      { word: 'exhausted', weight: 0.8 },
      { word: 'drained', weight: 0.8 },
      { word: 'depleted', weight: 0.8 },
      { word: 'overwhelmed', weight: 0.7 },
      { word: 'running on empty', weight: 0.9 },
    ],
    antiKeywords: ['physically tired', 'sleepy'],
  },

  examples: [
    "I'm completely burned out",
    'Feeling exhausted all the time',
    'Running on empty',
    'How do I recover from burnout?',
    "I can't keep going like this",
    'Nothing left to give',
  ],

  counterExamples: ["I'm tired today", 'I need a nap', 'Physically exhausted from workout'],

  arguments: [
    {
      name: 'severity',
      type: 'string',
      description: 'Perceived burnout severity',
      required: false,
      enumValues: ['mild', 'moderate', 'severe'],
    },
    {
      name: 'source',
      type: 'string',
      description: 'Source of burnout',
      required: false,
      enumValues: ['work', 'caregiving', 'life', 'parenting', 'multiple'],
      extractionPatterns: [/(?:from|because\s+of|due\s+to)\s+(work|caregiving|parenting|life)/i],
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
      toolId: 'burnoutSupport',
      args,
      delegateTo: 'domains/life-coaching',
    };
  },
};

// ============================================================================
// BOUNDARIES
// ============================================================================

export const boundariesTool: SemanticToolDefinition = {
  id: 'coaching_boundaries',
  name: 'Boundaries Help',
  description: 'Help setting and maintaining healthy boundaries.',
  shortDescription: 'set boundaries',
  category: 'life-coaching',

  triggers: {
    phrases: [
      'set boundaries',
      'say no',
      "can't say no",
      'people pleaser',
      'being taken advantage of',
      'boundary issues',
      'how to decline',
      'too much for others',
    ],
    patterns: [
      /^(?:help\s+me\s+)?(?:set|establish|maintain)\s+(?:healthy\s+)?boundaries/i,
      /^(?:i(?:'m| am)?|i)\s+(?:can(?:'t|not)|don(?:'t| not)\s+know\s+how\s+to)\s+say\s+no/i,
      /^(?:i(?:'m| am)?)\s+(?:a\s+)?(?:people\s+)?pleaser/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:say\s+no|decline|set\s+boundaries)/i,
    ],
    keywords: [
      { word: 'boundaries', weight: 1.0 },
      { word: 'boundary', weight: 1.0 },
      { word: 'say no', weight: 0.9 },
      { word: 'people pleaser', weight: 0.9 },
      { word: 'overcommit', weight: 0.8 },
      { word: 'taken advantage', weight: 0.8 },
    ],
    antiKeywords: ['property boundaries', 'country boundaries'],
  },

  examples: [
    'Help me set boundaries',
    "I can't say no to people",
    "I'm a people pleaser",
    'How do I decline without guilt?',
    'Being taken advantage of',
    'I do too much for others',
  ],

  counterExamples: ['Property boundaries', 'Country borders'],

  arguments: [
    {
      name: 'context',
      type: 'string',
      description: 'Where boundaries are needed',
      required: false,
      enumValues: ['work', 'family', 'friends', 'romantic', 'general'],
      extractionPatterns: [/boundaries\s+(?:with|at)\s+(work|family|friends|partner)/i],
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
      toolId: 'boundariesHelp',
      args,
      delegateTo: 'domains/life-coaching',
    };
  },
};

// ============================================================================
// ANGER MANAGEMENT
// ============================================================================

export const angerTool: SemanticToolDefinition = {
  id: 'coaching_anger',
  name: 'Anger Management',
  description: 'Help managing anger and frustration constructively.',
  shortDescription: 'manage anger',
  category: 'life-coaching',

  triggers: {
    phrases: [
      "i'm so angry",
      'feeling furious',
      "can't control my anger",
      'seeing red',
      'rage',
      'so frustrated',
      'about to explode',
      'losing my temper',
    ],
    patterns: [
      /^(?:i(?:'m| am)?|feeling)\s+(?:so\s+)?(?:angry|furious|enraged|mad)/i,
      /^(?:i\s+)?(?:can(?:'t|not)|don(?:'t| not))\s+(?:control|manage)\s+(?:my\s+)?anger/i,
      /^(?:i(?:'m| am)?)\s+(?:about\s+to|going\s+to)\s+(?:explode|lose\s+it|snap)/i,
      /^(?:help|advice)\s+(?:with|for)\s+(?:my\s+)?(?:anger|temper|frustration)/i,
    ],
    keywords: [
      { word: 'angry', weight: 1.0 },
      { word: 'anger', weight: 1.0 },
      { word: 'furious', weight: 0.9 },
      { word: 'rage', weight: 0.9 },
      { word: 'mad', weight: 0.8 },
      { word: 'frustrated', weight: 0.7 },
      { word: 'temper', weight: 0.8 },
    ],
    antiKeywords: [],
  },

  examples: [
    "I'm so angry right now",
    "I can't control my temper",
    'Help with anger management',
    "I'm about to explode",
    'Feeling furious',
    'I keep losing my temper',
  ],

  counterExamples: ["I'm a little annoyed", 'Mildly frustrated'],

  arguments: [
    {
      name: 'intensity',
      type: 'string',
      description: 'Anger intensity',
      required: false,
      enumValues: ['mild', 'moderate', 'intense'],
    },
    {
      name: 'trigger',
      type: 'string',
      description: 'What triggered the anger',
      required: false,
      extractionPatterns: [/(?:angry|furious|mad)\s+(?:at|about|because\s+of)\s+(.+?)$/i],
    },
  ],

  confidence: {
    baseScore: 0.85,
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
      toolId: 'angerManagement',
      args,
      delegateTo: 'domains/life-coaching',
    };
  },
};

// ============================================================================
// PROCRASTINATION
// ============================================================================

export const procrastinationTool: SemanticToolDefinition = {
  id: 'coaching_procrastination',
  name: 'Procrastination Help',
  description: 'Help overcome procrastination and get started.',
  shortDescription: 'stop procrastinating',
  category: 'life-coaching',

  triggers: {
    phrases: [
      "i'm procrastinating",
      "can't get started",
      'keep putting it off',
      'avoiding',
      'been meaning to',
      "just can't start",
      'stuck in avoidance',
    ],
    patterns: [
      /^(?:i(?:'m| am)?|i(?:'ve| have)?\s+been)\s+(?:procrastinating|avoiding|putting\s+(?:it|things)\s+off)/i,
      /^(?:i\s+)?(?:can(?:'t|not)|don(?:'t| not))\s+(?:seem\s+to\s+)?(?:get\s+started|start|begin)/i,
      /^(?:help\s+me\s+)?(?:stop|overcome)\s+procrastinating/i,
      /^(?:i(?:'ve| have)?\s+been)\s+(?:meaning|wanting)\s+to\s+(?:do|start)\s+.+\s+(?:but|and)/i,
    ],
    keywords: [
      { word: 'procrastinating', weight: 1.0 },
      { word: 'procrastination', weight: 1.0 },
      { word: 'avoiding', weight: 0.8 },
      { word: 'putting off', weight: 0.9 },
      { word: 'get started', weight: 0.7 },
      { word: 'stuck', weight: 0.6 },
    ],
    antiKeywords: [],
  },

  examples: [
    "I've been procrastinating all day",
    "I can't get started on this project",
    'Help me stop procrastinating',
    'I keep putting it off',
    "I've been meaning to start but...",
    'Stuck in avoidance',
  ],

  counterExamples: ["I'm being productive", 'Got a lot done today'],

  arguments: [
    {
      name: 'task',
      type: 'string',
      description: 'Task being avoided',
      required: false,
      extractionPatterns: [
        /(?:procrastinating\s+on|avoiding|putting\s+off)\s+(.+?)$/i,
        /(?:get\s+started\s+on|start)\s+(.+?)$/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.85,
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
      toolId: 'procrastinationHelp',
      args,
      delegateTo: 'domains/life-coaching',
    };
  },
};

// ============================================================================
// PERFECTIONISM
// ============================================================================

export const coachingPerfectionismTool: SemanticToolDefinition = {
  id: 'coaching_perfectionism',
  name: 'Perfectionism Help',
  description: 'Help with perfectionism, self-criticism, and unrealistic standards.',
  shortDescription: 'perfectionism help',
  category: 'life-coaching',

  triggers: {
    phrases: [
      "i'm a perfectionist",
      'nothing is good enough',
      'too hard on myself',
      'unrealistic standards',
      'fear of failure',
      "can't make mistakes",
      'self-criticism',
    ],
    patterns: [
      /^(?:i(?:'m| am)?)\s+(?:a\s+)?perfectionist/i,
      /^(?:i(?:'m| am)?|i\s+feel)\s+(?:too\s+)?hard\s+on\s+myself/i,
      /^(?:nothing|it(?:'s| is)\s+never)\s+(?:is\s+)?(?:good|perfect)\s+enough/i,
      /^(?:i\s+)?(?:can(?:'t|not)|don(?:'t| not))\s+(?:accept|handle|make)\s+(?:mistakes|failure)/i,
    ],
    keywords: [
      { word: 'perfectionist', weight: 1.0 },
      { word: 'perfectionism', weight: 1.0 },
      { word: 'perfect', weight: 0.7 },
      { word: 'good enough', weight: 0.8 },
      { word: 'self-criticism', weight: 0.9 },
      { word: 'standards', weight: 0.6 },
      { word: 'mistakes', weight: 0.6 },
    ],
    antiKeywords: [],
  },

  examples: [
    "I'm such a perfectionist",
    'Nothing I do is good enough',
    "I'm too hard on myself",
    "I can't accept mistakes",
    'My standards are too high',
    'Fear of failure is paralyzing me',
  ],

  counterExamples: ["I'm okay with imperfection", 'Good enough is fine'],

  arguments: [
    {
      name: 'area',
      type: 'string',
      description: 'Area where perfectionism shows up',
      required: false,
      enumValues: ['work', 'appearance', 'relationships', 'parenting', 'general'],
    },
  ],

  confidence: {
    baseScore: 0.85,
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
      toolId: 'perfectionismHelp',
      args,
      delegateTo: 'domains/life-coaching',
    };
  },
};

// ============================================================================
// SELF-COMPASSION
// ============================================================================

export const selfCompassionTool: SemanticToolDefinition = {
  id: 'coaching_self_compassion',
  name: 'Self-Compassion',
  description: 'Help practice self-compassion and quiet the inner critic.',
  shortDescription: 'be kinder to yourself',
  category: 'life-coaching',

  triggers: {
    phrases: [
      "i'm so hard on myself",
      'inner critic',
      "don't deserve",
      'hate myself',
      'self-compassion',
      'be kinder to myself',
      'stop beating myself up',
    ],
    patterns: [
      /^(?:i(?:'m| am)?|i)\s+(?:being\s+)?(?:so\s+)?hard\s+on\s+myself/i,
      /^(?:my\s+)?inner\s+critic\s+(?:is|won(?:'t| not))/i,
      /^(?:i\s+)?(?:don(?:'t| not)|can(?:'t|not))\s+(?:love|forgive|like)\s+myself/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:be\s+kinder|practice\s+self-compassion|stop\s+beating\s+myself)/i,
    ],
    keywords: [
      { word: 'inner critic', weight: 1.0 },
      { word: 'self-compassion', weight: 1.0 },
      { word: 'hard on myself', weight: 0.9 },
      { word: 'hate myself', weight: 0.9 },
      { word: 'forgive myself', weight: 0.8 },
      { word: 'self-kindness', weight: 0.9 },
    ],
    antiKeywords: [],
  },

  examples: [
    "I'm so hard on myself",
    'My inner critic never stops',
    "I can't forgive myself",
    'Help me practice self-compassion',
    'I need to stop beating myself up',
    "I don't like who I am",
  ],

  counterExamples: ['I love myself', "I'm pretty kind to myself"],

  arguments: [
    {
      name: 'context',
      type: 'string',
      description: 'What triggers self-criticism',
      required: false,
      extractionPatterns: [
        /(?:hard\s+on\s+myself|beating\s+myself\s+up)\s+(?:about|for|over)\s+(.+?)$/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.85,
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
      toolId: 'selfCompassion',
      args,
      delegateTo: 'domains/life-coaching',
    };
  },
};

// ============================================================================
// MOTIVATION
// ============================================================================

export const motivationTool: SemanticToolDefinition = {
  id: 'coaching_motivation',
  name: 'Motivation Help',
  description: 'Help find motivation and overcome lack of drive.',
  shortDescription: 'get motivated',
  category: 'life-coaching',

  triggers: {
    phrases: [
      'no motivation',
      "can't get motivated",
      'feeling unmotivated',
      'lost my drive',
      'how to get motivated',
      'need motivation',
      "don't feel like doing anything",
    ],
    patterns: [
      /^(?:i(?:'m| am)?|i)\s+(?:have\s+)?(?:no|lost\s+(?:my\s+)?)\s*(?:motivation|drive)/i,
      /^(?:i\s+)?(?:can(?:'t|not)|don(?:'t| not))\s+(?:get|feel|find)\s+(?:any\s+)?(?:motivation|motivated)/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:get|find|stay)\s+motivated/i,
      /^(?:i\s+)?(?:don(?:'t| not)|can(?:'t|not))\s+(?:feel\s+like\s+doing|do)\s+anything/i,
    ],
    keywords: [
      { word: 'motivation', weight: 1.0 },
      { word: 'motivated', weight: 1.0 },
      { word: 'drive', weight: 0.8 },
      { word: 'unmotivated', weight: 1.0 },
      { word: 'lazy', weight: 0.6 },
      { word: 'stuck', weight: 0.5 },
    ],
    antiKeywords: [],
  },

  examples: [
    'I have no motivation',
    "I can't get motivated",
    "I've lost my drive",
    'How do I get motivated?',
    "I don't feel like doing anything",
    'Need some motivation',
  ],

  counterExamples: ["I'm so motivated right now", 'Feeling driven'],

  arguments: [
    {
      name: 'area',
      type: 'string',
      description: 'Area lacking motivation',
      required: false,
      extractionPatterns: [/(?:motivation|motivated)\s+(?:for|to|about)\s+(.+?)$/i],
    },
  ],

  confidence: {
    baseScore: 0.85,
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
      toolId: 'motivationHelp',
      args,
      delegateTo: 'domains/life-coaching',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const lifeCoachingTools: SemanticToolDefinition[] = [
  burnoutTool,
  boundariesTool,
  angerTool,
  procrastinationTool,
  coachingPerfectionismTool,
  selfCompassionTool,
  motivationTool,
];
