/**
 * Relationships Tool Definitions for Semantic Router
 *
 * Routes relationship-related queries - conflict resolution, communication,
 * connection, and relationship advice.
 *
 * @module tools/semantic-router/tool-definitions/relationships
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// RELATIONSHIP ADVICE
// ============================================================================

export const relationshipAdviceTool: SemanticToolDefinition = {
  id: 'relationship_advice',
  name: 'Relationship Advice',
  description: 'Get advice on relationships, communication, and connection.',
  shortDescription: 'relationship help',
  category: 'relationships',

  triggers: {
    phrases: [
      'relationship advice',
      'help with my relationship',
      'my partner and I',
      "we're having problems",
      "we've been fighting",
      'relationship issues',
      'couples advice',
      'marriage help',
    ],
    patterns: [
      /^(?:i\s+need|give\s+me)\s+(?:some\s+)?relationship\s+advice/i,
      /^(?:help|advice)\s+(?:with|about|for)\s+(?:my\s+)?relationship/i,
      /^my\s+(?:partner|spouse|husband|wife|boyfriend|girlfriend)\s+(?:and\s+i|is)/i,
      /^(?:we(?:'re| are)|i(?:'m| am))\s+(?:having|going\s+through)\s+(?:relationship\s+)?(?:problems|issues)/i,
    ],
    keywords: [
      { word: 'relationship', weight: 1.0 },
      { word: 'partner', weight: 0.9 },
      { word: 'spouse', weight: 0.9 },
      { word: 'marriage', weight: 0.9 },
      { word: 'boyfriend', weight: 0.8 },
      { word: 'girlfriend', weight: 0.8 },
      { word: 'couples', weight: 0.8 },
      { word: 'fighting', weight: 0.7 },
    ],
    antiKeywords: ['friend', 'coworker', 'boss', 'parent', 'family'],
  },

  examples: [
    'I need relationship advice',
    'My partner and I have been fighting',
    "We're having communication problems",
    'Help me with my marriage',
    'How do I connect better with my spouse?',
    "My girlfriend doesn't understand me",
  ],

  counterExamples: ['Help with my friend', "I'm having issues at work", 'My parents are difficult'],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'Relationship topic',
      required: false,
      extractionPatterns: [
        /(?:about|with)\s+(.+?)$/i,
        /(?:problems?|issues?)\s+(?:with|about)\s+(.+?)$/i,
      ],
    },
    {
      name: 'relationshipType',
      type: 'string',
      description: 'Type of relationship',
      required: false,
      enumValues: ['romantic', 'marriage', 'dating', 'long-distance'],
      extractionPatterns: [/(marriage|dating|long[\s-]distance)/i],
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
      toolId: 'relationshipAdvice',
      args,
      delegateTo: 'domains/relationships',
    };
  },
};

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

export const conflictResolutionTool: SemanticToolDefinition = {
  id: 'relationship_conflict',
  name: 'Conflict Resolution',
  description: 'Help resolve conflicts and disagreements with others.',
  shortDescription: 'resolve a conflict',
  category: 'relationships',

  triggers: {
    phrases: [
      'we had a fight',
      'had an argument',
      'disagreement',
      'conflict resolution',
      "we're not talking",
      'how to apologize',
      'make things right',
      'how to make up',
    ],
    patterns: [
      /^(?:we|i)\s+(?:had|got\s+into)\s+(?:a\s+)?(?:big\s+)?(?:fight|argument)/i,
      /^(?:i\s+need\s+to|how\s+(?:do|can)\s+i)\s+(?:apologize|make\s+(?:up|things\s+right))/i,
      /^(?:we(?:'re| are)|i(?:'m| am))\s+(?:not\s+talking|in\s+a\s+fight)/i,
      /^(?:help|advice)\s+(?:with|about)\s+(?:a\s+)?(?:conflict|disagreement|fight)/i,
    ],
    keywords: [
      { word: 'fight', weight: 0.9 },
      { word: 'argument', weight: 0.9 },
      { word: 'conflict', weight: 1.0 },
      { word: 'disagreement', weight: 0.9 },
      { word: 'apologize', weight: 0.8 },
      { word: 'make up', weight: 0.8 },
      { word: 'forgive', weight: 0.7 },
    ],
    antiKeywords: [],
  },

  examples: [
    'We had a big fight last night',
    'How do I apologize to my partner?',
    "We're not talking after the argument",
    'Help me resolve this conflict',
    'How do I make things right?',
    'I want to make up with my friend',
  ],

  counterExamples: ["We're doing great together", 'Plan a date night'],

  arguments: [
    {
      name: 'situation',
      type: 'string',
      description: 'Description of the conflict',
      required: false,
      extractionPatterns: [/(?:fight|argument)\s+(?:about|over)\s+(.+?)$/i],
    },
    {
      name: 'withWhom',
      type: 'string',
      description: 'Who the conflict is with',
      required: false,
      extractionPatterns: [/(?:with|to)\s+(?:my\s+)?(.+?)$/i],
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
      toolId: 'conflictResolution',
      args,
      delegateTo: 'domains/relationships',
    };
  },
};

// ============================================================================
// FRIENDSHIP SUPPORT
// ============================================================================

export const friendshipSupportTool: SemanticToolDefinition = {
  id: 'relationship_friendship',
  name: 'Friendship Support',
  description: 'Help with friendships, making friends, and social connections.',
  shortDescription: 'friendship help',
  category: 'relationships',

  triggers: {
    phrases: [
      "i don't have friends",
      'making friends',
      'hard to connect',
      'lonely',
      'social anxiety',
      'find friends',
      'keep friends',
      'lost touch with friends',
    ],
    patterns: [
      /^(?:i\s+)?(?:don(?:'t| not)|can(?:'t|not))\s+(?:have|make)\s+friends/i,
      /^(?:how\s+(?:do|can)\s+i)\s+(?:make|find|keep)\s+friends/i,
      /^i(?:'m| am)?\s+(?:feeling\s+)?(?:lonely|alone|isolated)/i,
      /^(?:i\s+have|having)\s+(?:trouble|difficulty)\s+(?:making|keeping)\s+friends/i,
    ],
    keywords: [
      { word: 'friends', weight: 1.0 },
      { word: 'friendship', weight: 1.0 },
      { word: 'lonely', weight: 0.9 },
      { word: 'alone', weight: 0.7 },
      { word: 'isolated', weight: 0.8 },
      { word: 'social', weight: 0.6 },
      { word: 'connect', weight: 0.6 },
    ],
    antiKeywords: ['partner', 'spouse', 'dating', 'romantic'],
  },

  examples: [
    "I don't have any close friends",
    'How do I make friends as an adult?',
    "I'm feeling lonely",
    "It's hard for me to connect with people",
    "I've lost touch with all my friends",
    'Help me keep friendships going',
  ],

  counterExamples: ['My partner and I are fighting', 'Dating advice', 'Romantic relationship help'],

  arguments: [
    {
      name: 'concern',
      type: 'string',
      description: 'Friendship concern',
      required: false,
      enumValues: ['making', 'keeping', 'loneliness', 'social_anxiety'],
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
      toolId: 'friendshipSupport',
      args,
      delegateTo: 'domains/relationships',
    };
  },
};

// ============================================================================
// FAMILY DYNAMICS
// ============================================================================

export const familyDynamicsTool: SemanticToolDefinition = {
  id: 'relationship_family',
  name: 'Family Dynamics',
  description: 'Help with family relationships, boundaries, and dynamics.',
  shortDescription: 'family help',
  category: 'relationships',

  triggers: {
    phrases: [
      'family issues',
      'my parents',
      'my siblings',
      'family drama',
      'toxic family',
      'family boundaries',
      'dealing with family',
    ],
    patterns: [
      /^(?:help|advice)\s+(?:with|about)\s+(?:my\s+)?family/i,
      /^my\s+(?:parents?|mom|dad|mother|father|siblings?|brother|sister)/i,
      /^(?:dealing|coping)\s+with\s+(?:my\s+)?(?:toxic\s+)?family/i,
      /^(?:i\s+have|having)\s+(?:family\s+)?(?:issues|problems|drama)/i,
    ],
    keywords: [
      { word: 'family', weight: 1.0 },
      { word: 'parents', weight: 0.9 },
      { word: 'mom', weight: 0.8 },
      { word: 'dad', weight: 0.8 },
      { word: 'siblings', weight: 0.8 },
      { word: 'in-laws', weight: 0.8 },
      { word: 'toxic', weight: 0.6 },
    ],
    antiKeywords: ['partner', 'spouse', 'boyfriend', 'girlfriend'],
  },

  examples: [
    'My parents are too controlling',
    'Help with family boundaries',
    "My sister and I don't get along",
    'Dealing with toxic family members',
    'My in-laws are difficult',
    'Family drama is stressing me out',
  ],

  counterExamples: ['My partner and I are fighting', 'Help with my romantic relationship'],

  arguments: [
    {
      name: 'familyMember',
      type: 'string',
      description: 'Which family member',
      required: false,
      extractionPatterns: [
        /(?:my\s+)(parents?|mom|dad|mother|father|siblings?|brother|sister|in-laws?)/i,
      ],
    },
    {
      name: 'issue',
      type: 'string',
      description: 'Type of family issue',
      required: false,
      extractionPatterns: [/(?:with|about)\s+(.+?)$/i],
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
      toolId: 'familyDynamics',
      args,
      delegateTo: 'domains/relationships',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const relationshipsTools: SemanticToolDefinition[] = [
  relationshipAdviceTool,
  conflictResolutionTool,
  friendshipSupportTool,
  familyDynamicsTool,
];
