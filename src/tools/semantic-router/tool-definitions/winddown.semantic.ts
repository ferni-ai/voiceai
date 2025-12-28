/**
 * Wind-Down Tool Definitions for Semantic Router
 *
 * Evening rituals and bedtime support.
 *
 * @module tools/semantic-router/tool-definitions/winddown
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// WIND DOWN - Evening Ritual
// ============================================================================

export const windDownTool: SemanticToolDefinition = {
  id: 'winddown_evening',
  name: 'Wind Down',
  description: 'Start an evening wind-down routine.',
  shortDescription: 'wind down',
  category: 'wellness',

  triggers: {
    phrases: [
      'wind down',
      'help me relax',
      'evening routine',
      'time to relax',
      'ready for bed',
      'prepare for sleep',
      'unwind',
      'decompress',
      "can't sleep",
      'help me sleep',
    ],
    patterns: [
      /^(?:help\s+me\s+)?wind\s+down/i,
      /^(?:help\s+me\s+)?(?:relax|unwind|decompress)/i,
      /^(?:evening|night(?:time)?)\s+routine/i,
      /^(?:ready|time)\s+(?:to\s+)?(?:for\s+)?(?:bed|sleep)/i,
      /^(?:prepare|get\s+ready)\s+(?:for|to)\s+sleep/i,
      /^(?:I\s+)?can(?:'t| not)\s+(?:sleep|relax)/i,
      /^(?:help\s+me\s+)?(?:get\s+to\s+)?sleep/i,
    ],
    keywords: [
      { word: 'wind down', weight: 1.0 },
      { word: 'relax', weight: 0.9 },
      { word: 'sleep', weight: 0.8 },
      { word: 'bed', weight: 0.7 },
      { word: 'unwind', weight: 0.9 },
      { word: 'evening', weight: 0.6 },
      { word: 'night', weight: 0.6 },
      { word: 'decompress', weight: 0.8 },
    ],
    antiKeywords: ['wake', 'morning', 'energy', 'workout'],
  },

  examples: [
    'Help me wind down',
    "I'm ready for bed",
    'Start my evening routine',
    "I can't sleep",
    'Help me relax',
    'Time to unwind',
    'Prepare me for sleep',
  ],

  counterExamples: ['Wake me up', 'Morning routine', 'Give me energy', 'Start a workout'],

  arguments: [
    {
      name: 'style',
      type: 'string',
      description: 'Wind-down style',
      required: false,
      enumValues: ['gentle', 'quick', 'full', 'meditation'],
      extractionPatterns: [/(gentle|quick|full|meditation)\s+(?:wind.?down|routine)/i],
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
      toolId: 'windDown',
      args: { style: args.style || 'gentle' },
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// BEDTIME CHECK-IN
// ============================================================================

export const bedtimeCheckInTool: SemanticToolDefinition = {
  id: 'winddown_checkin',
  name: 'Bedtime Check-In',
  description: 'Reflect on the day before sleep.',
  shortDescription: 'bedtime reflection',
  category: 'wellness',

  triggers: {
    phrases: [
      'bedtime check-in',
      'reflect on my day',
      'how was my day',
      'end of day reflection',
      'what did I accomplish',
      'daily reflection',
      'review my day',
      'before I sleep',
    ],
    patterns: [
      /^(?:bedtime|evening)\s+check.?in/i,
      /^reflect\s+(?:on\s+)?(?:my|the|today(?:'s)?)\s+day/i,
      /^(?:how\s+was|review)\s+(?:my|the)\s+day/i,
      /^(?:end\s+of\s+)?(?:day|daily)\s+(?:reflection|review)/i,
      /^what\s+did\s+I\s+(?:accomplish|do|achieve)\s+today/i,
      /^before\s+I\s+(?:go\s+to\s+)?sleep/i,
    ],
    keywords: [
      { word: 'bedtime', weight: 0.9 },
      { word: 'reflection', weight: 0.9 },
      { word: 'day', weight: 0.6 },
      { word: 'accomplish', weight: 0.7 },
      { word: 'review', weight: 0.7 },
      { word: 'check-in', weight: 0.8 },
    ],
    antiKeywords: ['morning', 'wake', 'start'],
  },

  examples: [
    'Bedtime check-in',
    'Reflect on my day',
    'What did I accomplish today?',
    'End of day reflection',
    'Review my day with me',
    'Before I sleep, let me reflect',
  ],

  counterExamples: ['Morning check-in', 'Start my day', "What's on my schedule?", 'Plan my day'],

  arguments: [
    {
      name: 'focus',
      type: 'string',
      description: 'Focus of reflection',
      required: false,
      enumValues: ['gratitude', 'accomplishments', 'lessons', 'general'],
      extractionPatterns: [/(?:focus\s+on|about)\s+(gratitude|accomplishments?|lessons?)/i],
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
      toolId: 'bedtimeCheckIn',
      args: { focus: args.focus || 'general' },
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// SLEEP AFFIRMATION
// ============================================================================

export const sleepAffirmationTool: SemanticToolDefinition = {
  id: 'winddown_affirmation',
  name: 'Sleep Affirmation',
  description: 'Receive a calming affirmation for restful sleep.',
  shortDescription: 'sleep affirmation',
  category: 'wellness',

  triggers: {
    phrases: [
      'sleep affirmation',
      'bedtime affirmation',
      'calming words',
      'tell me something peaceful',
      'soothe me',
      'goodnight message',
      'peaceful thoughts',
      'help me drift off',
    ],
    patterns: [
      /^(?:sleep|bedtime|nighttime)\s+affirmation/i,
      /^(?:calming|peaceful|soothing)\s+(?:words|thoughts|message)/i,
      /^(?:tell|say)\s+(?:me\s+)?something\s+(?:peaceful|calming|soothing)/i,
      /^(?:soothe|calm)\s+me/i,
      /^good\s*night\s+(?:message|affirmation)/i,
      /^help\s+me\s+(?:drift\s+off|fall\s+asleep)/i,
    ],
    keywords: [
      { word: 'affirmation', weight: 1.0 },
      { word: 'peaceful', weight: 0.9 },
      { word: 'calming', weight: 0.9 },
      { word: 'soothing', weight: 0.9 },
      { word: 'sleep', weight: 0.7 },
      { word: 'goodnight', weight: 0.8 },
      { word: 'drift', weight: 0.7 },
    ],
    antiKeywords: ['morning', 'energy', 'wake', 'alert'],
  },

  examples: [
    'Give me a sleep affirmation',
    'Tell me something peaceful',
    'Goodnight message',
    'Calming words before bed',
    'Soothe me to sleep',
    'Help me drift off',
  ],

  counterExamples: ['Morning affirmation', 'Give me energy', 'Wake me up', 'Motivate me'],

  arguments: [
    {
      name: 'theme',
      type: 'string',
      description: 'Theme of affirmation',
      required: false,
      enumValues: ['peace', 'gratitude', 'release', 'tomorrow', 'general'],
      extractionPatterns: [/(?:about|for)\s+(peace|gratitude|release|tomorrow)/i],
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
      toolId: 'sleepAffirmation',
      args: { theme: args.theme || 'general' },
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const winddownTools: SemanticToolDefinition[] = [
  windDownTool,
  bedtimeCheckInTool,
  sleepAffirmationTool,
];
