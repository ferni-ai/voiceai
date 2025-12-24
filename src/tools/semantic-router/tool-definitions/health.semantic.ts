/**
 * Health Domain Tool Definitions for Semantic Router
 *
 * Semantic routing for health, exercise, sleep, and nutrition.
 * Routes to health domain tools for tracking and coaching.
 *
 * @module tools/semantic-router/tool-definitions/health
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// LOG EXERCISE
// ============================================================================

export const logExerciseTool: SemanticToolDefinition = {
  id: 'health_log_exercise',
  name: 'Log Exercise',
  description: 'Record physical activity and exercise.',
  shortDescription: 'log a workout',
  category: 'wellness',

  triggers: {
    phrases: [
      'log exercise',
      'log workout',
      'i worked out',
      'i exercised',
      'went to the gym',
      'went for a run',
      'went for a walk',
      'did yoga',
      'track exercise',
    ],
    patterns: [
      /^(?:I\s+)?(?:just\s+)?(?:did|went|finished)\s+(?:a\s+)?(?:workout|exercise|run|walk|swim|yoga)/i,
      /^log\s+(?:my\s+)?(?:workout|exercise|run|walk)/i,
      /^track\s+(?:my\s+)?(?:workout|exercise)/i,
      /^(?:I\s+)?worked\s+out/i,
      /^(?:I\s+)?exercised/i,
      /^went\s+(?:to\s+the\s+)?gym/i,
      /^(?:I\s+)?ran\s+(?:for\s+)?(\d+)/i,
      /^(?:I\s+)?walked\s+(?:for\s+)?(\d+)/i,
    ],
    keywords: [
      { word: 'exercise', weight: 1.0 },
      { word: 'workout', weight: 1.0 },
      { word: 'gym', weight: 0.9 },
      { word: 'run', weight: 0.8 },
      { word: 'walk', weight: 0.7 },
      { word: 'yoga', weight: 0.8 },
      { word: 'swim', weight: 0.8 },
      { word: 'log', weight: 0.7 },
    ],
    antiKeywords: ['suggest', 'recommend', 'should I', 'what', 'sleep', 'eat'],
  },

  examples: [
    'I just finished a workout',
    'Log my exercise',
    'I went for a run',
    'Went to the gym today',
    'Did 30 minutes of yoga',
    'I walked for an hour',
    'Track my workout',
  ],

  counterExamples: [
    'Suggest a workout',
    'What exercise should I do?',
    'I should exercise more',
    'Help me sleep',
  ],

  arguments: [
    {
      name: 'activityType',
      type: 'string',
      description: 'Type of activity',
      required: false,
      enumValues: ['cardio', 'strength', 'flexibility', 'walking', 'running', 'yoga', 'swimming'],
      extractionPatterns: [/(run|walk|yoga|swim|gym|workout|cardio|strength)/i],
    },
    {
      name: 'durationMinutes',
      type: 'number',
      description: 'Duration in minutes',
      required: false,
      extractionPatterns: [/(\d+)\s*(?:min|minutes?|hour)/i],
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
      toolId: 'logExercise',
      args,
      delegateTo: 'domains/health',
    };
  },
};

// ============================================================================
// SUGGEST WORKOUT
// ============================================================================

export const suggestWorkoutTool: SemanticToolDefinition = {
  id: 'health_suggest_workout',
  name: 'Suggest Workout',
  description: 'Get workout recommendations based on energy and goals.',
  shortDescription: 'get workout ideas',
  category: 'wellness',

  triggers: {
    phrases: [
      'suggest a workout',
      'workout ideas',
      'what exercise',
      'recommend exercise',
      'help me exercise',
      'what should I do for exercise',
      'workout recommendation',
    ],
    patterns: [
      /^(?:suggest|recommend)\s+(?:a\s+)?(?:workout|exercise)/i,
      /^what\s+(?:workout|exercise)\s+should\s+I/i,
      /^(?:give\s+me\s+)?(?:some\s+)?(?:workout|exercise)\s+ideas/i,
      /^help\s+me\s+(?:with\s+)?(?:a\s+)?workout/i,
      /^I\s+(?:want|need)\s+(?:a\s+)?workout/i,
    ],
    keywords: [
      { word: 'suggest', weight: 1.0 },
      { word: 'recommend', weight: 1.0 },
      { word: 'workout', weight: 0.9 },
      { word: 'exercise', weight: 0.9 },
      { word: 'ideas', weight: 0.7 },
    ],
    antiKeywords: ['log', 'track', 'did', 'finished', 'went', 'sleep'],
  },

  examples: [
    'Suggest a workout',
    'What exercise should I do?',
    'Give me workout ideas',
    'I need a workout recommendation',
    'Help me with an exercise routine',
  ],

  counterExamples: ['I just worked out', 'Log my exercise', 'Track my workout', 'Help me sleep'],

  arguments: [
    {
      name: 'energyLevel',
      type: 'string',
      description: 'Current energy level',
      required: false,
      enumValues: ['low', 'moderate', 'high'],
      extractionPatterns: [/(tired|low\s+energy|energized|high\s+energy)/i],
    },
    {
      name: 'availableMinutes',
      type: 'number',
      description: 'Time available',
      required: false,
      extractionPatterns: [/(\d+)\s*(?:min|minutes?)/i],
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
      toolId: 'suggestWorkout',
      args,
      delegateTo: 'domains/health',
    };
  },
};

// ============================================================================
// TRACK HYDRATION
// ============================================================================

export const trackHydrationTool: SemanticToolDefinition = {
  id: 'health_hydration',
  name: 'Track Hydration',
  description: 'Log water intake and get hydration tips.',
  shortDescription: 'track water',
  category: 'wellness',

  triggers: {
    phrases: [
      'log water',
      'track water',
      'drank water',
      'hydration',
      'how much water',
      'water intake',
      'drink water',
    ],
    patterns: [
      /^(?:log|track)\s+(?:my\s+)?(?:water|hydration)/i,
      /^(?:I\s+)?(?:just\s+)?drank\s+(?:some\s+)?water/i,
      /^(?:I\s+)?drank\s+(\d+)\s*(?:oz|ounces?|glasses?|cups?)/i,
      /^(?:how\s+much\s+)?water\s+(?:did\s+I|have\s+I|should\s+I)/i,
      /^(?:remind\s+me\s+to\s+)?drink\s+(?:more\s+)?water/i,
    ],
    keywords: [
      { word: 'water', weight: 1.0 },
      { word: 'hydration', weight: 1.0 },
      { word: 'drink', weight: 0.7 },
      { word: 'drank', weight: 0.8 },
    ],
    antiKeywords: ['sleep', 'exercise', 'workout', 'eat', 'food'],
  },

  examples: [
    'Log water intake',
    'I just drank 16 oz of water',
    'Track my hydration',
    'Remind me to drink water',
    'How much water should I drink?',
  ],

  counterExamples: ['Log exercise', 'Help me sleep', 'What should I eat?', 'Track my workout'],

  arguments: [
    {
      name: 'amount',
      type: 'number',
      description: 'Amount in ounces',
      required: false,
      extractionPatterns: [/(\d+)\s*(?:oz|ounces?)/i],
    },
    {
      name: 'action',
      type: 'string',
      description: 'Action to take',
      required: false,
      enumValues: ['log', 'check', 'remind', 'tips'],
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
      toolId: 'trackHydration',
      args,
      delegateTo: 'domains/health',
    };
  },
};

// ============================================================================
// SLEEP ANALYSIS
// ============================================================================

export const sleepAnalysisTool: SemanticToolDefinition = {
  id: 'health_sleep',
  name: 'Sleep Analysis',
  description: 'Analyze sleep patterns and get sleep improvement tips.',
  shortDescription: 'help with sleep',
  category: 'wellness',

  triggers: {
    phrases: [
      "can't sleep",
      'trouble sleeping',
      'sleep problems',
      'help me sleep',
      'sleep better',
      'insomnia',
      'tired all the time',
      'not sleeping well',
      'sleep tips',
    ],
    patterns: [
      /^(?:I\s+)?(?:can(?:'t|not)|having\s+trouble)\s+(?:fall\s+asleep|sleep)/i,
      /^help\s+(?:me\s+)?(?:with\s+)?(?:my\s+)?sleep/i,
      /^(?:I\s+)?(?:need|want)\s+(?:to\s+)?sleep\s+better/i,
      /^(?:I(?:'m|\s+am)\s+)?(?:so\s+)?tired/i,
      /^(?:not\s+)?sleeping\s+well/i,
      /^(?:sleep|insomnia)\s+(?:help|tips|advice)/i,
    ],
    keywords: [
      { word: 'sleep', weight: 1.0 },
      { word: 'tired', weight: 0.8 },
      { word: 'insomnia', weight: 1.0 },
      { word: 'rest', weight: 0.7 },
      { word: 'bed', weight: 0.6 },
    ],
    antiKeywords: ['exercise', 'workout', 'water', 'eat', 'food'],
  },

  examples: [
    "I can't sleep",
    'Help me sleep better',
    "I'm having trouble sleeping",
    'Sleep tips',
    "I'm tired all the time",
    'Not sleeping well lately',
  ],

  counterExamples: ['Log exercise', 'Track water', 'What should I eat?', 'Suggest a workout'],

  arguments: [
    {
      name: 'mainConcern',
      type: 'string',
      description: 'Main sleep concern',
      required: false,
      enumValues: ['falling-asleep', 'staying-asleep', 'waking-early', 'not-rested', 'schedule'],
      extractionPatterns: [
        /(falling?\s+asleep|staying?\s+asleep|wak(?:e|ing)\s+up\s+early|not\s+rested)/i,
      ],
    },
    {
      name: 'averageHours',
      type: 'number',
      description: 'Average hours of sleep',
      required: false,
      extractionPatterns: [/(\d+)\s*hours?\s*(?:of\s+)?sleep/i],
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
      toolId: 'analyzeSleepPattern',
      args,
      delegateTo: 'domains/health',
    };
  },
};

// ============================================================================
// SLEEP HYGIENE TIPS
// ============================================================================

export const sleepHygieneTool: SemanticToolDefinition = {
  id: 'health_sleep_tips',
  name: 'Sleep Hygiene Tips',
  description: 'Get sleep hygiene and improvement tips.',
  shortDescription: 'sleep tips',
  category: 'wellness',

  triggers: {
    phrases: [
      'sleep hygiene',
      'sleep tips',
      'bedtime routine',
      'how to sleep better',
      'improve my sleep',
      'good sleep habits',
    ],
    patterns: [
      /^(?:give\s+me\s+)?sleep\s+(?:hygiene|tips|advice)/i,
      /^(?:how\s+(?:do\s+I|can\s+I|to)\s+)?(?:improve|get\s+better)\s+sleep/i,
      /^(?:what\s+are\s+)?good\s+sleep\s+habits/i,
      /^(?:help\s+me\s+)?(?:build\s+a\s+)?bedtime\s+routine/i,
    ],
    keywords: [
      { word: 'sleep', weight: 0.9 },
      { word: 'hygiene', weight: 1.0 },
      { word: 'tips', weight: 0.8 },
      { word: 'routine', weight: 0.7 },
      { word: 'habits', weight: 0.7 },
    ],
    antiKeywords: ['exercise', 'workout', 'water', 'eat', 'tired', "can't"],
  },

  examples: [
    'Give me sleep hygiene tips',
    'How can I improve my sleep?',
    'Good sleep habits',
    'Help me with a bedtime routine',
    'Sleep advice',
  ],

  counterExamples: ["I can't sleep right now", 'Log my sleep', 'Track exercise', "I'm so tired"],

  arguments: [
    {
      name: 'focus',
      type: 'string',
      description: 'Area to focus on',
      required: false,
      enumValues: ['environment', 'routine', 'daytime', 'all'],
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
      toolId: 'suggestSleepHygiene',
      args,
      delegateTo: 'domains/health',
    };
  },
};

// ============================================================================
// ENERGY LEVEL
// ============================================================================

export const energyLevelTool: SemanticToolDefinition = {
  id: 'health_energy',
  name: 'Energy Assessment',
  description: 'Assess and improve energy levels.',
  shortDescription: 'energy help',
  category: 'wellness',

  triggers: {
    phrases: [
      "I'm tired",
      'no energy',
      'low energy',
      'exhausted',
      'feeling drained',
      'boost my energy',
      'more energy',
    ],
    patterns: [
      /^(?:I(?:'m|\s+am)\s+)?(?:so\s+)?(?:tired|exhausted|drained)/i,
      /^(?:I\s+have\s+)?(?:no|low|zero)\s+energy/i,
      /^(?:how\s+(?:do\s+I|can\s+I)\s+)?(?:get|have)\s+more\s+energy/i,
      /^boost\s+(?:my\s+)?energy/i,
      /^(?:I\s+)?(?:need|want)\s+(?:more\s+)?energy/i,
      /^feeling\s+(?:so\s+)?(?:tired|drained|exhausted)/i,
    ],
    keywords: [
      { word: 'tired', weight: 1.0 },
      { word: 'exhausted', weight: 1.0 },
      { word: 'energy', weight: 1.0 },
      { word: 'drained', weight: 0.9 },
      { word: 'fatigue', weight: 0.9 },
    ],
    antiKeywords: ['sleep', 'exercise', 'workout', 'water'],
  },

  examples: [
    "I'm so tired",
    'I have no energy',
    'How can I get more energy?',
    'Boost my energy',
    'Feeling drained',
    "I'm exhausted",
  ],

  counterExamples: ["I can't sleep", 'Log exercise', 'Track water', 'Suggest a workout'],

  arguments: [
    {
      name: 'currentLevel',
      type: 'string',
      description: 'Current energy level',
      required: false,
      enumValues: ['depleted', 'low', 'moderate', 'good', 'high'],
    },
    {
      name: 'timeOfDay',
      type: 'string',
      description: 'Time of day',
      required: false,
      enumValues: ['morning', 'midday', 'afternoon', 'evening'],
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
      toolId: 'assessEnergyLevel',
      args,
      delegateTo: 'domains/health',
    };
  },
};

// ============================================================================
// ENERGY BOOST
// ============================================================================

export const energyBoostTool: SemanticToolDefinition = {
  id: 'health_energy_boost',
  name: 'Energy Boost Suggestions',
  description: 'Get quick energy boost ideas.',
  shortDescription: 'quick energy boost',
  category: 'wellness',

  triggers: {
    phrases: [
      'quick energy boost',
      'wake me up',
      'need a pick me up',
      'afternoon slump',
      'energy boost ideas',
    ],
    patterns: [
      /^(?:give\s+me\s+a\s+)?(?:quick\s+)?energy\s+boost/i,
      /^(?:help\s+me\s+)?wake\s+(?:me\s+)?up/i,
      /^(?:I\s+)?need\s+(?:a\s+)?pick[\s-]me[\s-]up/i,
      /^(?:afternoon|midday)\s+slump/i,
      /^(?:how\s+(?:do\s+I|can\s+I)\s+)?(?:get\s+)?(?:a\s+)?quick\s+(?:energy\s+)?boost/i,
    ],
    keywords: [
      { word: 'boost', weight: 1.0 },
      { word: 'quick', weight: 0.7 },
      { word: 'wake', weight: 0.8 },
      { word: 'slump', weight: 0.9 },
      { word: 'pick me up', weight: 0.9 },
    ],
    antiKeywords: ['sleep', 'tired', 'exhausted', 'exercise log'],
  },

  examples: [
    'Give me a quick energy boost',
    'I need a pick-me-up',
    'Help with my afternoon slump',
    'Wake me up',
    'Quick energy ideas',
  ],

  counterExamples: ["I'm so tired", "I can't sleep", 'Log my exercise', "What's wrong with me?"],

  arguments: [
    {
      name: 'availableTime',
      type: 'string',
      description: 'Time available',
      required: false,
      enumValues: ['1-minute', '5-minutes', '15-minutes', '30-plus'],
    },
    {
      name: 'setting',
      type: 'string',
      description: 'Current setting',
      required: false,
      enumValues: ['home', 'work', 'outside', 'anywhere'],
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
      toolId: 'suggestEnergyBoost',
      args,
      delegateTo: 'domains/health',
    };
  },
};

// ============================================================================
// NUTRITION COACHING
// ============================================================================

export const nutritionCoachingTool: SemanticToolDefinition = {
  id: 'health_nutrition',
  name: 'Nutrition Coaching',
  description: 'Get nutrition guidance and healthy eating tips.',
  shortDescription: 'nutrition help',
  category: 'wellness',

  triggers: {
    phrases: [
      'eating healthy',
      'nutrition tips',
      'what should I eat',
      'healthy eating',
      'diet advice',
      'eating better',
      'mindful eating',
    ],
    patterns: [
      /^(?:help\s+(?:me\s+)?(?:with\s+)?)?(?:healthy|better)\s+eating/i,
      /^(?:give\s+me\s+)?nutrition\s+(?:tips|advice)/i,
      /^what\s+should\s+I\s+eat/i,
      /^(?:I\s+)?(?:want|need)\s+(?:to\s+)?eat\s+(?:healthier|better)/i,
      /^(?:help\s+with\s+)?mindful\s+eating/i,
    ],
    keywords: [
      { word: 'nutrition', weight: 1.0 },
      { word: 'eating', weight: 0.9 },
      { word: 'diet', weight: 0.8 },
      { word: 'food', weight: 0.7 },
      { word: 'healthy', weight: 0.7 },
    ],
    antiKeywords: ['sleep', 'exercise', 'workout', 'water', 'tired'],
  },

  examples: [
    'Help me eat healthier',
    'Nutrition tips',
    'What should I eat for energy?',
    'Mindful eating advice',
    'I want to eat better',
  ],

  counterExamples: ['Log exercise', 'Help me sleep', 'Track water', 'Suggest a workout'],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'Nutrition topic',
      required: false,
      enumValues: [
        'general-eating',
        'mindful-eating',
        'meal-timing',
        'hydration',
        'energy-foods',
        'sleep-foods',
        'emotional-eating',
      ],
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
      toolId: 'coachOnNutrition',
      args,
      delegateTo: 'domains/health',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const healthTools: SemanticToolDefinition[] = [
  logExerciseTool,
  suggestWorkoutTool,
  trackHydrationTool,
  sleepAnalysisTool,
  sleepHygieneTool,
  energyLevelTool,
  energyBoostTool,
  nutritionCoachingTool,
];
