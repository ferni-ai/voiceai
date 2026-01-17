/**
 * Reminder Tool Definitions for Semantic Router
 *
 * Routes reminder-related queries to the appropriate tools.
 * "Remind me to..." - natural, human-friendly reminders.
 *
 * @module tools/semantic-router/tool-definitions/reminders
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SET REMINDER
// ============================================================================

export const setReminderTool: SemanticToolDefinition = {
  id: 'productivity_set_reminder',
  name: 'Set Reminder',
  description: 'Set a personal reminder with natural language time.',
  shortDescription: 'remind me',
  category: 'productivity',

  triggers: {
    phrases: [
      'remind me',
      'set a reminder',
      "don't let me forget",
      "don't let me forget",
      'remember to',
      'make sure I',
      'notify me',
      'alert me',
    ],
    patterns: [
      /^remind\s+me\s+(?:to\s+)?(.+)/i,
      /^(?:can\s+you\s+)?remind\s+me\s+(?:about|to)\s+(.+)/i,
      /^set\s+(?:a\s+)?reminder\s+(?:to|for)\s+(.+)/i,
      /^(?:don(?:'t|'t)\s+let\s+me\s+forget)\s+(?:to\s+)?(.+)/i,
      /^(?:i\s+need\s+(?:a\s+)?reminder)\s+(?:to\s+)?(.+)/i,
      /^(?:in\s+\d+\s+(?:minute|hour|day)s?)\s+(?:remind\s+me|tell\s+me)\s+(.+)/i,
    ],
    keywords: [
      { word: 'remind', weight: 1.0 },
      { word: 'reminder', weight: 1.0 },
      { word: 'forget', weight: 0.7 },
      { word: 'notify', weight: 0.8 },
      { word: 'alert', weight: 0.7 },
      { word: 'later', weight: 0.5 },
      { word: 'tomorrow', weight: 0.6 },
      { word: 'minutes', weight: 0.5 },
    ],
    antiKeywords: ['appointment', 'meeting', 'calendar', 'schedule with'],
  },

  examples: [
    'Remind me to call mom',
    'Remind me in 30 minutes to check the oven',
    'Set a reminder for tomorrow at 2pm to submit the report',
    "Don't let me forget to pick up groceries",
    'Remind me to take my medication tonight',
    'In an hour, remind me to move the laundry',
  ],

  counterExamples: [
    'Schedule a meeting with John', // Calendar, not reminder
    'Book an appointment', // Appointment, not reminder
    'Add to my calendar', // Calendar
  ],

  arguments: [
    {
      name: 'message',
      type: 'string',
      description: 'What to remind the user about',
      required: true,
      extractionPatterns: [
        /remind\s+me\s+(?:to\s+)?(.+?)(?:\s+(?:in|at|on|tomorrow|tonight))/i,
        /remind\s+me\s+(?:to\s+)?(.+)$/i,
      ],
    },
    {
      name: 'when',
      type: 'string',
      description: 'When to send the reminder',
      required: false,
      extractionPatterns: [
        /(in\s+\d+\s+(?:minute|hour|day)s?)/i,
        /(tomorrow\s+(?:at\s+)?\d+(?::\d+)?(?:\s*(?:am|pm))?)/i,
        /((?:at\s+)?\d+(?::\d+)?(?:\s*(?:am|pm))?)/i,
        /(tonight|this\s+evening|this\s+morning|this\s+afternoon)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.08,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'setReminder',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// GET REMINDERS
// ============================================================================

export const getRemindersTool: SemanticToolDefinition = {
  id: 'productivity_get_reminders',
  name: 'Get Reminders',
  description: 'View pending reminders.',
  shortDescription: 'show reminders',
  category: 'productivity',

  triggers: {
    phrases: [
      'my reminders',
      'show reminders',
      'what reminders',
      'list reminders',
      'pending reminders',
      'upcoming reminders',
    ],
    patterns: [
      /^(?:what\s+are\s+)?(?:my\s+)?reminders/i,
      /^(?:show|list|get)\s+(?:my\s+)?reminders/i,
      /^(?:do\s+i\s+have\s+(?:any\s+)?reminders)/i,
      /^(?:what\s+(?:am\s+i|did\s+i)\s+supposed\s+to\s+remember)/i,
    ],
    keywords: [
      { word: 'reminders', weight: 1.0 },
      { word: 'reminder', weight: 0.9 },
      { word: 'scheduled', weight: 0.5 },
      { word: 'pending', weight: 0.6 },
    ],
    antiKeywords: ['set', 'create', 'add', 'new'],
  },

  examples: [
    'What are my reminders?',
    'Show my reminders',
    'Do I have any reminders?',
    'List my pending reminders',
    'What am I supposed to remember?',
  ],

  counterExamples: [
    'Set a reminder', // Creating, not listing
    'Remind me to', // Creating, not listing
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
      toolId: 'getReminders',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// CANCEL REMINDER
// ============================================================================

export const cancelReminderTool: SemanticToolDefinition = {
  id: 'productivity_cancel_reminder',
  name: 'Cancel Reminder',
  description: 'Cancel a pending reminder.',
  shortDescription: 'cancel reminder',
  category: 'productivity',

  triggers: {
    phrases: [
      'cancel reminder',
      'delete reminder',
      'remove reminder',
      'never mind the reminder',
      'forget the reminder',
    ],
    patterns: [
      /^(?:cancel|delete|remove)\s+(?:the\s+)?(?:my\s+)?reminder/i,
      /^(?:never\s+mind|forget)\s+(?:about\s+)?(?:the\s+)?reminder/i,
      /^(?:don(?:'t|'t)\s+remind\s+me)\s+(?:about\s+)?(.+)/i,
    ],
    keywords: [
      { word: 'cancel', weight: 0.8 },
      { word: 'delete', weight: 0.8 },
      { word: 'remove', weight: 0.7 },
      { word: 'reminder', weight: 1.0 },
    ],
    antiKeywords: ['set', 'create', 'add'],
  },

  examples: [
    'Cancel my reminder about the call',
    'Delete the reminder',
    'Never mind the reminder about groceries',
    "Don't remind me about the meeting anymore",
    'Remove reminder 1',
  ],

  counterExamples: ['Set a reminder', 'Remind me about'],

  arguments: [
    {
      name: 'reminderQuery',
      type: 'string',
      description: 'Which reminder to cancel',
      required: true,
      extractionPatterns: [
        /(?:cancel|delete|remove)\s+(?:the\s+)?(?:my\s+)?reminder\s+(?:about|for)\s+(.+)/i,
        /(?:cancel|delete|remove)\s+reminder\s+(\d+)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'cancelReminder',
      args,
      delegateTo: 'domains/productivity',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const reminderSemanticTools: SemanticToolDefinition[] = [
  setReminderTool,
  getRemindersTool,
  cancelReminderTool,
];
