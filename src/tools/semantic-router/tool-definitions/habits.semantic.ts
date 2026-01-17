/**
 * Habits Tool Definitions for Semantic Router
 *
 * Semantic routing for habit tracking and coaching queries.
 * Routes to Maya's habit domain tools.
 *
 * @module tools/semantic-router/tool-definitions/habits
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// TRACK HABIT / LOG COMPLETION
// ============================================================================

export const trackHabitTool: SemanticToolDefinition = {
  id: 'habit_track',
  name: 'Track Habit',
  description: 'Log that a habit was completed. Tracks streaks and awards XP.',
  shortDescription: 'log a habit completion',
  category: 'habits',

  triggers: {
    phrases: [
      'I did my',
      'I completed',
      'I finished',
      'mark habit done',
      'log my habit',
      'track my habit',
      'I meditated',
      'I exercised',
      'I worked out',
      'I journaled',
      'I went to the gym',
    ],
    patterns: [
      /^i\s+(?:just\s+)?(?:did|completed|finished|done)\s+(?:my\s+)?(.+)/i,
      /^(?:mark|log|track)\s+(?:my\s+)?(?:habit|(.+))\s+(?:as\s+)?(?:done|complete|finished)/i,
      /^i\s+(?:just\s+)?(?:meditated|exercised|worked\s+out|journaled|read)/i,
      /^(?:log|track)\s+(?:that\s+)?i\s+(.+)/i,
    ],
    keywords: [
      { word: 'done', weight: 0.8 },
      { word: 'completed', weight: 0.9 },
      { word: 'finished', weight: 0.8 },
      { word: 'log', weight: 0.7 },
      { word: 'track', weight: 0.7 },
      { word: 'habit', weight: 0.8 },
      { word: 'meditated', weight: 0.9 },
      { word: 'exercised', weight: 0.9 },
      { word: 'gym', weight: 0.8 },
      { word: 'journaled', weight: 0.9 },
      { word: 'workout', weight: 0.8 },
    ],
    antiKeywords: ['create', 'add', 'new', 'suggest', 'help', 'what'],
  },

  examples: [
    'I did my meditation today',
    'I completed my workout',
    'Log that I exercised',
    'I finished my morning routine',
    'Mark my reading habit as done',
    'I just meditated for 10 minutes',
    'I went to the gym',
    'Track that I journaled',
    'I did my gratitude practice',
  ],

  counterExamples: [
    'Create a new habit',
    'What habits do I have?',
    'Help me build a habit',
    "I haven't done my habit",
  ],

  arguments: [
    {
      name: 'habitName',
      type: 'string',
      description: 'Name of the habit that was completed',
      required: false,
      extractionPatterns: [
        /i\s+(?:just\s+)?(?:did|completed|finished)\s+(?:my\s+)?(.+?)(?:\s+today|\s+habit)?$/i,
        /(?:log|track|mark)\s+(?:my\s+)?(.+?)\s+(?:as\s+)?(?:done|complete)/i,
      ],
    },
    {
      name: 'notes',
      type: 'string',
      description: 'Optional notes about the completion',
      required: false,
      extractionPatterns: [/(?:for|about)\s+(.+?)$/i],
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
      toolId: 'logHabitCompletion',
      args,
      delegateTo: 'domains/habits',
    };
  },
};

// ============================================================================
// GET HABITS / CHECK DUE
// ============================================================================

export const getHabitsTool: SemanticToolDefinition = {
  id: 'habits_list',
  name: 'List Habits',
  description: 'Get habits due today, list all habits, or view habit stats.',
  shortDescription: 'check your habits',
  category: 'habits',

  triggers: {
    phrases: [
      'what habits do I have',
      'show my habits',
      'my habits',
      'list my habits',
      "what's due today",
      'habit status',
      'how are my habits',
      'habit check',
    ],
    patterns: [
      /^(?:what|which)\s+habits\s+(?:do\s+i\s+have|are\s+due)/i,
      /^(?:show|list|get)\s+(?:my\s+)?habits/i,
      /^(?:how\s+are|what(?:'s| is)\s+the\s+status\s+of)\s+my\s+habits/i,
      /^habit\s+(?:check|status|update)/i,
      /^(?:what(?:'s| is))\s+(?:due|left)\s+(?:for\s+)?today/i,
    ],
    keywords: [
      { word: 'habits', weight: 1.0 },
      { word: 'habit', weight: 0.9 },
      { word: 'due', weight: 0.7 },
      { word: 'status', weight: 0.6 },
      { word: 'streak', weight: 0.8 },
      { word: 'progress', weight: 0.6 },
    ],
    antiKeywords: ['create', 'add', 'new', 'completed', 'done', 'log', 'track'],
  },

  examples: [
    'What habits do I have?',
    'Show my habits',
    "What's due today?",
    'How are my habits going?',
    'Habit status',
    "What's my streak?",
    'List my daily habits',
    'Which habits are due?',
  ],

  counterExamples: [
    'I completed my habit',
    'Create a new habit',
    'Add a habit',
    'Log my meditation',
  ],

  arguments: [
    {
      name: 'type',
      type: 'string',
      description: 'What to show: due, all, or stats',
      required: false,
      enumValues: ['due', 'all', 'stats'],
      extractionPatterns: [/(due|all|stats|status)/i],
    },
    {
      name: 'habitName',
      type: 'string',
      description: 'Specific habit to check',
      required: false,
      extractionPatterns: [/(?:for|about|of)\s+(?:my\s+)?(.+?)(?:\s+habit)?$/i],
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
      toolId: 'getHabits',
      args: { type: args.type || 'due' },
      delegateTo: 'domains/habits',
    };
  },
};

// ============================================================================
// CREATE HABIT
// ============================================================================

export const createHabitTool: SemanticToolDefinition = {
  id: 'habit_create',
  name: 'Create Habit',
  description: 'Create a new habit to track.',
  shortDescription: 'create a new habit',
  category: 'habits',

  triggers: {
    phrases: [
      'create a habit',
      'add a habit',
      'new habit',
      'start tracking',
      'I want to build',
      'help me build',
      'set up a habit',
    ],
    patterns: [
      /^(?:create|add|start|set\s+up)\s+(?:a\s+)?(?:new\s+)?habit/i,
      /^i\s+want\s+to\s+(?:start|build|track)\s+(?:a\s+)?(?:habit|routine)/i,
      /^help\s+me\s+(?:build|create|start)\s+(?:a\s+)?(?:habit|routine)/i,
      /^(?:can\s+you\s+)?(?:track|add)\s+(.+)\s+(?:as\s+)?(?:a\s+)?habit/i,
    ],
    keywords: [
      { word: 'create', weight: 0.9 },
      { word: 'add', weight: 0.8 },
      { word: 'new', weight: 0.7 },
      { word: 'habit', weight: 0.9 },
      { word: 'start', weight: 0.6 },
      { word: 'build', weight: 0.7 },
      { word: 'routine', weight: 0.6 },
    ],
    antiKeywords: ['completed', 'done', 'finished', 'what', 'list', 'show', 'delete'],
  },

  examples: [
    'Create a meditation habit',
    'Add a new habit for exercise',
    'I want to start meditating daily',
    'Help me build a reading habit',
    'Set up a habit for journaling',
    'Track my gym visits as a habit',
    'I want to build a morning routine',
  ],

  counterExamples: [
    'What habits do I have?',
    'I completed my habit',
    'Delete my habit',
    'Show my habits',
  ],

  arguments: [
    {
      name: 'name',
      type: 'string',
      description: 'Name for the new habit',
      required: true,
      extractionPatterns: [
        /habit\s+(?:for|called|named)\s+["']?(.+?)["']?$/i,
        /(?:track|add)\s+(.+?)\s+(?:as\s+)?(?:a\s+)?habit/i,
        /(?:start|build)\s+(?:a\s+)?(.+?)\s+(?:habit|routine)/i,
      ],
    },
    {
      name: 'frequency',
      type: 'string',
      description: 'How often (daily, weekly, etc)',
      required: false,
      enumValues: ['daily', 'weekly', 'weekdays', 'custom'],
      extractionPatterns: [/(daily|weekly|every\s+day|weekdays)/i],
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
      toolId: 'createHabit',
      args,
      delegateTo: 'domains/habits',
    };
  },
};

// ============================================================================
// HABIT COACHING (Handoff to Maya)
// ============================================================================

export const habitCoachingTool: SemanticToolDefinition = {
  id: 'habit_coaching',
  name: 'Habit Coaching',
  description:
    'Get coaching on habits from Maya, the habit expert. For help building routines, overcoming setbacks, or habit advice.',
  shortDescription: 'get habit coaching',
  category: 'habits',

  triggers: {
    phrases: [
      'help with habits',
      'struggling with habits',
      'habit advice',
      'habit coach',
      "can't stick to",
      'keep failing',
      'habit help',
    ],
    patterns: [
      /^(?:i(?:'m| am)?\s+)?(?:struggling|having\s+trouble)\s+(?:with\s+)?(?:my\s+)?habits?/i,
      /^(?:help|advice)\s+(?:with|on|for)\s+(?:my\s+)?habits?/i,
      /^(?:i\s+)?(?:keep|can(?:'t|not))\s+(?:failing|missing|skipping)\s+(?:my\s+)?habits?/i,
      /^(?:how\s+do\s+i|how\s+can\s+i)\s+(?:build|start|stick\s+to)\s+(?:a\s+)?habit/i,
    ],
    keywords: [
      { word: 'struggling', weight: 0.9 },
      { word: 'help', weight: 0.7 },
      { word: 'advice', weight: 0.8 },
      { word: 'coach', weight: 0.9 },
      { word: 'failing', weight: 0.8 },
      { word: 'trouble', weight: 0.7 },
      { word: 'habit', weight: 0.6 },
    ],
    // Avoid triggering on persona names - handoff tool handles those
    antiKeywords: ['completed', 'done', 'what', 'list', 'talk to', 'speak to', 'transfer'],
  },

  examples: [
    "I'm struggling with my exercise habit",
    'Help me stick to my routine',
    'I keep failing at meditation',
    'How do I build a habit?',
    "Can't stick to my morning routine",
    'Habit advice please',
    "I'm having trouble with consistency",
    'I need habit coaching',
  ],

  counterExamples: ['I completed my habit', 'What habits do I have?', 'Create a habit'],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'What habit issue to discuss',
      required: false,
      extractionPatterns: [
        /(?:struggling|trouble)\s+(?:with\s+)?(?:my\s+)?(.+?)(?:\s+habit)?$/i,
        /(?:help|advice)\s+(?:with|on)\s+(.+)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    // This triggers a handoff to Maya
    return {
      success: true,
      toolId: 'handoff',
      args: { targetPersona: 'maya', reason: args.topic || 'habit coaching' },
      delegateTo: 'handoff',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const habitsTools: SemanticToolDefinition[] = [
  trackHabitTool,
  getHabitsTool,
  createHabitTool,
  habitCoachingTool,
];
