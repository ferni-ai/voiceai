/**
 * Productivity Tool Definitions for Semantic Router
 *
 * Routes productivity queries - tasks, notes, focus, time management.
 *
 * @module tools/semantic-router/tool-definitions/productivity
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// TASK MANAGEMENT
// ============================================================================

export const taskManagementTool: SemanticToolDefinition = {
  id: 'productivity_tasks',
  name: 'Task Management',
  description: 'Create, list, and manage tasks and to-do items.',
  shortDescription: 'manage tasks',
  category: 'productivity',

  triggers: {
    phrases: [
      'add a task',
      'create a task',
      'to-do list',
      'my tasks',
      'what do I need to do',
      'show my tasks',
      'remind me to',
      'add to my list',
    ],
    patterns: [
      /^(?:add|create|make)\s+(?:a\s+)?(?:new\s+)?task/i,
      /^(?:show|list|what\s+are)\s+(?:my\s+)?(?:tasks|to-?dos?)/i,
      /^(?:remind\s+me\s+to|don(?:'t| not)\s+let\s+me\s+forget\s+to)\s+(.+)/i,
      /^(?:what|what(?:'s| is))\s+(?:on\s+)?(?:my\s+)?(?:to-?do|task)\s+list/i,
    ],
    keywords: [
      { word: 'task', weight: 1.0 },
      { word: 'tasks', weight: 1.0 },
      { word: 'to-do', weight: 1.0 },
      { word: 'todo', weight: 1.0 },
      { word: 'remind', weight: 0.7 },
      { word: 'list', weight: 0.5 },
    ],
    antiKeywords: ['grocery', 'shopping', 'playlist'],
  },

  examples: [
    'Add a task to call mom',
    'Show my to-do list',
    'What do I need to do today?',
    'Remind me to buy milk',
    'Create a task for the project',
    "What's on my task list?",
  ],

  counterExamples: ['Grocery list', 'Add to playlist', 'Shopping list'],

  arguments: [
    {
      name: 'task',
      type: 'string',
      description: 'Task description',
      required: false,
      extractionPatterns: [
        /(?:add|create)\s+(?:a\s+)?task\s+(?:to|for)\s+(.+?)$/i,
        /remind\s+me\s+to\s+(.+?)$/i,
      ],
    },
    {
      name: 'action',
      type: 'string',
      description: 'Task action',
      required: false,
      enumValues: ['add', 'list', 'complete', 'delete'],
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
      toolId: 'taskManagement',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// NOTES
// ============================================================================

export const notesTool: SemanticToolDefinition = {
  id: 'productivity_notes',
  name: 'Notes',
  description: 'Create, find, and manage notes.',
  shortDescription: 'take notes',
  category: 'productivity',

  triggers: {
    phrases: [
      'take a note',
      'make a note',
      'note this',
      'jot this down',
      'save a note',
      'my notes',
      'find my note',
    ],
    patterns: [
      /^(?:take|make|create|save)\s+(?:a\s+)?note/i,
      /^(?:note|jot)\s+(?:this|that)\s+(?:down)?/i,
      /^(?:show|find|search)\s+(?:my\s+)?notes?/i,
      /^(?:what\s+(?:was|were|did)\s+(?:my\s+)?notes?\s+(?:about|on|from))/i,
    ],
    keywords: [
      { word: 'note', weight: 1.0 },
      { word: 'notes', weight: 1.0 },
      { word: 'jot', weight: 0.9 },
      { word: 'write down', weight: 0.8 },
    ],
    antiKeywords: ['music note', 'musical'],
  },

  examples: [
    'Take a note',
    'Make a note about the meeting',
    'Jot this down',
    'Show my notes',
    'Find my note about the project',
    'Note: call dentist tomorrow',
  ],

  counterExamples: ['Play a music note', 'High note in the song'],

  arguments: [
    {
      name: 'content',
      type: 'string',
      description: 'Note content',
      required: false,
      extractionPatterns: [
        /(?:note|jot\s+down):\s*(.+?)$/i,
        /(?:note|jot\s+down)\s+(?:that\s+)?(.+?)$/i,
      ],
    },
    {
      name: 'action',
      type: 'string',
      description: 'Note action',
      required: false,
      enumValues: ['create', 'find', 'list', 'delete'],
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
      toolId: 'notes',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// FOCUS / DEEP WORK
// ============================================================================

export const focusTool: SemanticToolDefinition = {
  id: 'productivity_focus',
  name: 'Focus Mode',
  description: 'Help with focus, concentration, and deep work sessions.',
  shortDescription: 'focus help',
  category: 'productivity',

  triggers: {
    phrases: [
      "can't focus",
      'need to concentrate',
      'distracted',
      'focus mode',
      'deep work',
      'pomodoro',
      'help me focus',
      'stay focused',
    ],
    patterns: [
      /^(?:i\s+)?(?:can(?:'t|not)|don(?:'t| not))\s+(?:seem\s+to\s+)?(?:focus|concentrate)/i,
      /^(?:help\s+me\s+)?(?:focus|concentrate|stay\s+focused)/i,
      /^(?:start|begin|do)\s+(?:a\s+)?(?:focus|pomodoro|deep\s+work)\s+(?:session|mode)/i,
      /^(?:i(?:'m| am)?|i\s+keep\s+(?:getting)?)\s+(?:so\s+)?distracted/i,
    ],
    keywords: [
      { word: 'focus', weight: 1.0 },
      { word: 'concentrate', weight: 0.9 },
      { word: 'distracted', weight: 0.9 },
      { word: 'deep work', weight: 1.0 },
      { word: 'pomodoro', weight: 1.0 },
      { word: 'attention', weight: 0.7 },
    ],
    antiKeywords: ['camera focus', 'focus group'],
  },

  examples: [
    "I can't focus",
    'Help me concentrate',
    'Start a focus session',
    'I keep getting distracted',
    'Deep work mode',
    'Start a pomodoro',
  ],

  counterExamples: ['Camera focus', 'Focus group results'],

  arguments: [
    {
      name: 'duration',
      type: 'number',
      description: 'Focus session duration in minutes',
      required: false,
      extractionPatterns: [/(?:for\s+)?(\d+)\s*(?:min|minutes)/i],
    },
    {
      name: 'method',
      type: 'string',
      description: 'Focus method',
      required: false,
      enumValues: ['pomodoro', 'deep_work', 'timeboxing', 'general'],
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
      toolId: 'focusMode',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// TIME MANAGEMENT
// ============================================================================

export const timeManagementTool: SemanticToolDefinition = {
  id: 'productivity_time',
  name: 'Time Management',
  description: 'Help with time management, planning, and prioritization.',
  shortDescription: 'manage time better',
  category: 'productivity',

  triggers: {
    phrases: [
      'manage my time',
      'time management',
      'prioritize',
      'too much to do',
      'overwhelmed with tasks',
      'plan my day',
      'what should I do first',
    ],
    patterns: [
      /^(?:help\s+me\s+)?(?:manage|plan|organize)\s+(?:my\s+)?(?:time|day|schedule)/i,
      /^(?:i\s+have|got)\s+(?:so\s+)?(?:much|many|too\s+much)\s+to\s+do/i,
      /^(?:how\s+(?:do|should)\s+i)\s+prioritize/i,
      /^(?:what|which)\s+(?:should|do)\s+i\s+(?:do|tackle)\s+first/i,
    ],
    keywords: [
      { word: 'time management', weight: 1.0 },
      { word: 'prioritize', weight: 0.9 },
      { word: 'plan', weight: 0.6 },
      { word: 'organize', weight: 0.7 },
      { word: 'overwhelmed', weight: 0.7 },
      { word: 'schedule', weight: 0.6 },
    ],
    antiKeywords: ['calendar', 'meeting', 'appointment'],
  },

  examples: [
    'Help me manage my time better',
    'I have too much to do',
    'How do I prioritize?',
    'Plan my day',
    'What should I tackle first?',
    "I'm overwhelmed with tasks",
  ],

  counterExamples: ['Schedule a meeting', 'Add to calendar'],

  arguments: [
    {
      name: 'timeframe',
      type: 'string',
      description: 'Time period to plan',
      required: false,
      enumValues: ['today', 'this_week', 'general'],
      extractionPatterns: [/plan\s+(?:my\s+)?(today|this\s+week|tomorrow)/i],
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
      toolId: 'timeManagement',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const productivityTools: SemanticToolDefinition[] = [
  taskManagementTool,
  notesTool,
  focusTool,
  timeManagementTool,
];
