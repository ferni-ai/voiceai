/**
 * Calendar Tool Definitions for Semantic Router
 *
 * Semantic routing for calendar and scheduling queries.
 * Routes to Google Calendar, Apple Calendar, and scheduling tools.
 *
 * @module tools/semantic-router/tool-definitions/calendar
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// LIST CALENDAR EVENTS
// ============================================================================

export const listCalendarTool: SemanticToolDefinition = {
  id: 'calendar_list_events',
  name: 'List Calendar Events',
  description: 'Lists calendar events for today, tomorrow, this week, or a specific date range.',
  shortDescription: 'check your calendar',
  category: 'calendar',

  triggers: {
    phrases: [
      "what's on my calendar",
      'check my calendar',
      'my schedule',
      "what's my schedule",
      'what do I have today',
      "what's on today",
      'any meetings today',
      'what meetings do I have',
      "what's coming up",
    ],
    patterns: [
      /^(?:what(?:'s| is)|show\s+me)\s+(?:on\s+)?my\s+(?:calendar|schedule)/i,
      /^(?:check|view|show)\s+(?:my\s+)?(?:calendar|schedule)/i,
      /^(?:what|any)\s+(?:meetings|events|appointments)\s+(?:do\s+i\s+have\s+)?(?:today|tomorrow|this\s+week)/i,
      /^(?:what(?:'s| do\s+i\s+have))\s+(?:on|for)\s+(?:today|tomorrow)/i,
      /^am\s+i\s+(?:free|busy|available)\s+(?:today|tomorrow|on)/i,
    ],
    keywords: [
      { word: 'calendar', weight: 1.0 },
      { word: 'schedule', weight: 0.9 },
      { word: 'meeting', weight: 0.8 },
      { word: 'meetings', weight: 0.8 },
      { word: 'appointment', weight: 0.8 },
      { word: 'event', weight: 0.7 },
      { word: 'events', weight: 0.7 },
      { word: 'today', weight: 0.5 },
      { word: 'tomorrow', weight: 0.5 },
      { word: 'week', weight: 0.4 },
      { word: 'busy', weight: 0.6 },
      { word: 'free', weight: 0.6 },
    ],
    antiKeywords: ['create', 'add', 'schedule', 'set up', 'cancel', 'delete', 'remove'],
  },

  examples: [
    "What's on my calendar today?",
    'Check my schedule for tomorrow',
    'Any meetings this week?',
    'What do I have today?',
    "What's my day look like?",
    'Am I free this afternoon?',
    'Show me my calendar',
    "What's coming up this week?",
    'Do I have any appointments tomorrow?',
  ],

  counterExamples: [
    'Schedule a meeting',
    'Add an event',
    'Create an appointment',
    'Cancel my meeting',
    'Delete the event',
  ],

  arguments: [
    {
      name: 'timeRange',
      type: 'string',
      description: 'Time range to check (today, tomorrow, this_week)',
      required: false,
      extractionPatterns: [
        /(?:for|on)\s+(today|tomorrow)/i,
        /(this\s+week|next\s+week)/i,
        /(this\s+afternoon|this\s+morning|tonight)/i,
      ],
    },
    {
      name: 'date',
      type: 'string',
      description: 'Specific date to check',
      required: false,
      extractionPatterns: [
        /(?:on|for)\s+(\w+day)/i, // Monday, Tuesday, etc.
        /(?:on|for)\s+(\d{1,2}\/\d{1,2})/i, // MM/DD format
      ],
      entityType: 'date',
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
      toolId: 'calendar_list_events',
      args: { timeRange: args.timeRange || 'today' },
      delegateTo: 'domains/calendar',
    };
  },
};

// ============================================================================
// CREATE CALENDAR EVENT
// ============================================================================

export const createEventTool: SemanticToolDefinition = {
  id: 'calendar_create_event',
  name: 'Create Calendar Event',
  description: 'Creates a new calendar event, meeting, or appointment.',
  shortDescription: 'add to your calendar',
  category: 'calendar',

  triggers: {
    phrases: [
      'schedule a meeting',
      'create an event',
      'add to my calendar',
      'set up a meeting',
      'book a time',
      'schedule time',
      'put on my calendar',
      'add an appointment',
    ],
    patterns: [
      /^(?:schedule|create|add|set\s+up|book)\s+(?:a\s+)?(?:meeting|event|appointment)/i,
      /^(?:put|add)\s+(?:on|to)\s+my\s+calendar/i,
      /^(?:can\s+you\s+)?(?:schedule|book)\s+(?:time|a\s+slot)/i,
      /^(?:i\s+need\s+to\s+)?(?:schedule|book)\s+(?:a\s+)?(?:call|meeting)\s+with/i,
    ],
    keywords: [
      { word: 'schedule', weight: 1.0 },
      { word: 'create', weight: 0.9 },
      { word: 'add', weight: 0.8 },
      { word: 'book', weight: 0.9 },
      { word: 'meeting', weight: 0.8 },
      { word: 'event', weight: 0.7 },
      { word: 'appointment', weight: 0.8 },
      { word: 'calendar', weight: 0.6 },
    ],
    antiKeywords: ['check', 'show', 'list', 'cancel', 'delete', 'what'],
  },

  examples: [
    'Schedule a meeting with John tomorrow at 2pm',
    'Add dentist appointment to my calendar',
    'Create an event for Friday at 3pm',
    'Book a call with the team',
    'Set up a meeting for Monday morning',
    'Put lunch with Sarah on my calendar',
    'Schedule time for project review',
  ],

  counterExamples: [
    "What's on my calendar?",
    'Show my meetings',
    'Cancel the meeting',
    'Delete the appointment',
  ],

  arguments: [
    {
      name: 'title',
      type: 'string',
      description: 'Event title or description',
      required: true,
      extractionPatterns: [
        /(?:meeting|event|appointment)\s+(?:for|about|called)\s+["']?(.+?)["']?(?:\s+(?:on|at|tomorrow|today))/i,
        /(?:schedule|create|add)\s+(?:a\s+)?["']?(.+?)["']?\s+(?:on|at|for|tomorrow|today)/i,
      ],
    },
    {
      name: 'date',
      type: 'string',
      description: 'Date for the event',
      required: false,
      extractionPatterns: [
        /(?:on|for)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /(today|tomorrow)/i,
        /(\d{1,2}\/\d{1,2})/i,
      ],
      entityType: 'date',
    },
    {
      name: 'time',
      type: 'string',
      description: 'Time for the event',
      required: false,
      extractionPatterns: [
        /at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
        /(morning|afternoon|evening|noon)/i,
      ],
      entityType: 'time',
    },
    {
      name: 'attendees',
      type: 'array',
      description: 'People to invite',
      required: false,
      extractionPatterns: [/with\s+(.+?)(?:\s+(?:on|at|tomorrow|today)|$)/i],
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
      toolId: 'calendar_create_event',
      args,
      delegateTo: 'domains/calendar',
    };
  },
};

// ============================================================================
// CHECK AVAILABILITY
// ============================================================================

export const checkAvailabilityTool: SemanticToolDefinition = {
  id: 'calendar_check_availability',
  name: 'Check Availability',
  description: 'Checks if you are free or busy at a specific time.',
  shortDescription: 'check if you are free',
  category: 'calendar',

  triggers: {
    phrases: [
      'am I free',
      'am I busy',
      'am I available',
      'do I have time',
      'check my availability',
      'when am I free',
      'find free time',
    ],
    patterns: [
      /^am\s+i\s+(?:free|busy|available)\s+(?:on|at|tomorrow|today)/i,
      /^(?:do|will)\s+i\s+have\s+(?:time|a\s+slot)/i,
      /^(?:when|what\s+time)\s+am\s+i\s+(?:free|available)/i,
      /^(?:find|check)\s+(?:my\s+)?(?:availability|free\s+time)/i,
    ],
    keywords: [
      { word: 'free', weight: 1.0 },
      { word: 'busy', weight: 0.9 },
      { word: 'available', weight: 0.9 },
      { word: 'availability', weight: 1.0 },
      { word: 'time', weight: 0.5 },
      { word: 'slot', weight: 0.6 },
    ],
    antiKeywords: ['schedule', 'create', 'cancel'],
  },

  examples: [
    'Am I free tomorrow at 3pm?',
    'Check my availability on Friday',
    'When am I free this week?',
    'Do I have time for a call tomorrow?',
    'Am I busy this afternoon?',
    'Find free time for a meeting',
  ],

  counterExamples: ['Schedule a meeting', 'Create an event', 'Cancel my appointment'],

  arguments: [
    {
      name: 'date',
      type: 'string',
      description: 'Date to check',
      required: false,
      extractionPatterns: [
        /(?:on|for)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /(today|tomorrow)/i,
      ],
      entityType: 'date',
    },
    {
      name: 'time',
      type: 'string',
      description: 'Time to check',
      required: false,
      extractionPatterns: [/at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i],
      entityType: 'time',
    },
  ],

  confidence: {
    baseScore: 0.8,
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
      toolId: 'calendar_check_availability',
      args,
      delegateTo: 'domains/calendar',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const calendarTools: SemanticToolDefinition[] = [
  listCalendarTool,
  createEventTool,
  checkAvailabilityTool,
];
