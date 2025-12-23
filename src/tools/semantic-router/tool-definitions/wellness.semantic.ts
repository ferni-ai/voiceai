/**
 * Wellness Tool Definitions for Semantic Router
 *
 * Semantic routing for wellness, grounding, and mental health support.
 * These tools are boosted when voice emotion detects stress/anxiety.
 *
 * @module tools/semantic-router/tool-definitions/wellness
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// GROUNDING EXERCISE
// ============================================================================

export const groundingExerciseTool: SemanticToolDefinition = {
  id: 'grounding_exercise',
  name: 'Grounding Exercise',
  description:
    'Guides through a grounding exercise to help with anxiety, stress, or feeling overwhelmed.',
  shortDescription: 'do a grounding exercise',
  category: 'wellness',

  triggers: {
    phrases: [
      "I'm anxious",
      "I'm stressed",
      'feeling overwhelmed',
      'need to calm down',
      'help me relax',
      'grounding exercise',
      'breathing exercise',
      "I'm panicking",
      'having a panic attack',
      'calm me down',
    ],
    patterns: [
      /^i(?:'m| am)\s+(?:feeling\s+)?(?:anxious|stressed|overwhelmed|panicking)/i,
      /^(?:i\s+)?need\s+(?:to\s+)?(?:calm\s+down|relax|ground\s+myself)/i,
      /^(?:help|can\s+you\s+help)\s+me\s+(?:calm\s+down|relax|feel\s+better)/i,
      /^(?:do\s+)?(?:a\s+)?(?:grounding|breathing|calming)\s+exercise/i,
      /^(?:i(?:'m| am)\s+)?having\s+(?:a\s+)?(?:panic\s+attack|anxiety\s+attack)/i,
    ],
    keywords: [
      { word: 'anxious', weight: 1.0 },
      { word: 'anxiety', weight: 1.0 },
      { word: 'stressed', weight: 0.9 },
      { word: 'stress', weight: 0.9 },
      { word: 'overwhelmed', weight: 0.9 },
      { word: 'panic', weight: 1.0 },
      { word: 'calm', weight: 0.8 },
      { word: 'relax', weight: 0.7 },
      { word: 'breathe', weight: 0.8 },
      { word: 'breathing', weight: 0.8 },
      { word: 'grounding', weight: 1.0 },
    ],
    antiKeywords: [],
  },

  examples: [
    "I'm feeling really anxious",
    'Help me calm down',
    "I'm having a panic attack",
    'I need a grounding exercise',
    "I'm so stressed out",
    'Can you help me relax?',
    'Do a breathing exercise with me',
    "I'm overwhelmed",
    'I need to calm down',
    "I can't stop my racing thoughts",
  ],

  counterExamples: [
    "I'm excited about the party",
    'Tell me a joke',
    "What's the weather?",
    'Play some music',
  ],

  arguments: [
    {
      name: 'type',
      type: 'string',
      description: 'Type of exercise',
      required: false,
      enumValues: ['breathing', '5-4-3-2-1', 'body_scan', 'progressive_relaxation'],
      extractionPatterns: [/(breathing|body\s+scan|progressive|5-4-3-2-1)/i],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.2,
  },

  // This tool gets boosted when voice emotion shows stress
  contextBoosts: {
    emotionBoost: {
      condition: 'stress > 0.6 || anxiety > 0',
      boost: 0.2,
    },
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'grounding_exercise',
      args,
      delegateTo: 'domains/wellness',
    };
  },
};

// ============================================================================
// WELLNESS CHECK-IN
// ============================================================================

export const wellnessCheckinTool: SemanticToolDefinition = {
  id: 'wellness_checkin',
  name: 'Wellness Check-in',
  description: 'A supportive check-in about how you are feeling emotionally and mentally.',
  shortDescription: 'check in on wellness',
  category: 'wellness',

  triggers: {
    phrases: [
      "I'm not okay",
      "I'm struggling",
      'having a hard time',
      "I don't feel good",
      'feeling down',
      'feeling sad',
      'feeling depressed',
      "I'm hurting",
      'need someone to talk to',
    ],
    patterns: [
      /^i(?:'m| am)\s+(?:not\s+)?(?:okay|alright|doing\s+well)/i,
      /^i(?:'m| am)\s+(?:feeling\s+)?(?:sad|down|depressed|blue|low)/i,
      /^i(?:'m| am)\s+(?:struggling|hurting|having\s+a\s+hard\s+time)/i,
      /^(?:i\s+)?need\s+(?:someone\s+)?to\s+talk\s+(?:to)?/i,
      /^(?:i\s+)?(?:don(?:'t|ot)\s+)?feel\s+(?:good|great|well)/i,
    ],
    keywords: [
      { word: 'sad', weight: 0.9 },
      { word: 'depressed', weight: 1.0 },
      { word: 'struggling', weight: 0.9 },
      { word: 'hurting', weight: 0.9 },
      { word: 'down', weight: 0.7 },
      { word: 'lonely', weight: 0.9 },
      { word: 'alone', weight: 0.8 },
      { word: 'hard time', weight: 0.8 },
      { word: 'difficult', weight: 0.6 },
    ],
    antiKeywords: ['joke', 'music', 'weather', 'calendar'],
  },

  examples: [
    "I'm not doing okay",
    "I'm feeling really sad today",
    'I need someone to talk to',
    "I'm struggling",
    "I'm having a hard time",
    "I don't feel good emotionally",
    "I'm feeling down",
    "I'm hurting inside",
    'I feel alone',
    "I'm going through something difficult",
  ],

  counterExamples: [
    "I'm doing great!",
    'Tell me a joke',
    "What's on my calendar?",
    'Play some music',
  ],

  arguments: [],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.2,
  },

  contextBoosts: {
    emotionBoost: {
      condition: 'stress > 0.5 || anxiety > 0 || valence < 0.3',
      boost: 0.15,
    },
  },

  execute: async (
    _args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'wellness_checkin',
      args: {},
      delegateTo: 'domains/wellness',
    };
  },
};

// ============================================================================
// SLEEP / REST
// ============================================================================

export const sleepHelpTool: SemanticToolDefinition = {
  id: 'sleep_help',
  name: 'Sleep Help',
  description: 'Help with sleep issues, insomnia, or relaxation before bed.',
  shortDescription: 'help with sleep',
  category: 'wellness',

  triggers: {
    phrases: [
      "can't sleep",
      "can't fall asleep",
      'trouble sleeping',
      'help me sleep',
      'insomnia',
      'tired but wired',
      'bedtime routine',
      'wind down',
    ],
    patterns: [
      /^i\s+can(?:'t|not)\s+(?:fall\s+)?sleep/i,
      /^(?:i(?:'m| am)\s+)?having\s+trouble\s+sleeping/i,
      /^help\s+me\s+(?:fall\s+)?(?:asleep|sleep|relax)/i,
      /^(?:i\s+)?need\s+(?:help\s+)?(?:to\s+)?(?:wind\s+down|relax|sleep)/i,
      /^(?:i(?:'m| am)\s+)?(?:tired\s+but\s+can(?:'t|not)\s+sleep|exhausted)/i,
    ],
    keywords: [
      { word: 'sleep', weight: 1.0 },
      { word: 'insomnia', weight: 1.0 },
      { word: 'tired', weight: 0.7 },
      { word: 'bedtime', weight: 0.9 },
      { word: 'rest', weight: 0.7 },
      { word: 'relax', weight: 0.6 },
      { word: 'exhausted', weight: 0.8 },
      { word: 'awake', weight: 0.7 },
    ],
    antiKeywords: ['calendar', 'meeting', 'work', 'email'],
  },

  examples: [
    "I can't sleep",
    'Help me fall asleep',
    "I'm having trouble sleeping",
    'I have insomnia',
    "I'm tired but can't sleep",
    'Help me wind down',
    'I need help relaxing before bed',
    "I'm exhausted but wired",
  ],

  counterExamples: [
    'I slept great!',
    "What's on my calendar?",
    'Send an email',
    'Play energizing music',
  ],

  arguments: [
    {
      name: 'type',
      type: 'string',
      description: 'Type of sleep help',
      required: false,
      enumValues: ['guided_relaxation', 'sleep_story', 'breathing', 'tips'],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.3,
  },

  contextBoosts: {
    timeBoost: {
      // Boost at night (9pm-6am)
      hours: [21, 22, 23, 0, 1, 2, 3, 4, 5],
      boost: 0.1,
    },
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'sleep_help',
      args,
      delegateTo: 'domains/wellness',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const wellnessTools: SemanticToolDefinition[] = [
  groundingExerciseTool,
  wellnessCheckinTool,
  sleepHelpTool,
];
