/**
 * Alarm Tool Definitions for Semantic Router
 *
 * Routes alarm queries - wake-up alarms, recurring alarms, snooze.
 * Different from timers: alarms are time-of-day based and can recur.
 *
 * @module tools/semantic-router/tool-definitions/alarms
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SET ALARM
// ============================================================================

export const setAlarmTool: SemanticToolDefinition = {
  id: 'alarms_set',
  name: 'Set Alarm',
  description: 'Set a wake-up alarm or recurring alarm for a specific time.',
  shortDescription: 'set an alarm',
  category: 'utility',

  triggers: {
    phrases: [
      'set an alarm',
      'set alarm for',
      'wake me up at',
      'wake me up',
      'alarm for',
      'alarm at',
      'set my alarm',
      'morning alarm',
      'daily alarm',
    ],
    patterns: [
      /^set\s+(?:an?\s+)?alarm\s+(?:for\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /^wake\s+me\s+(?:up\s+)?(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /^(?:i\s+(?:need|want)\s+)?(?:an?\s+)?alarm\s+(?:for|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /^alarm\s+(?:for\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    ],
    keywords: [
      { word: 'alarm', weight: 1.0 },
      { word: 'wake', weight: 0.9 },
      { word: 'wake up', weight: 0.95 },
      { word: 'morning', weight: 0.7 },
      { word: 'daily', weight: 0.6 },
      { word: 'recurring', weight: 0.7 },
      { word: 'weekday', weight: 0.6 },
    ],
    antiKeywords: ['timer', 'minutes', 'countdown', 'remind'],
  },

  examples: [
    'Set an alarm for 7am',
    'Wake me up at 6:30',
    'Set alarm for 8 AM every weekday',
    'Set a daily alarm for 7:00 AM',
    'Wake me up at 9 on weekends',
  ],

  counterExamples: ['Set a timer for 10 minutes', 'Remind me in 5 minutes', 'Timer for pasta'],

  arguments: [
    {
      name: 'time',
      type: 'string',
      description: 'Time for the alarm (HH:MM format or natural language)',
      required: true,
      extractionPatterns: [
        /(?:for|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
        /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:alarm|every|daily)/i,
      ],
    },
    {
      name: 'label',
      type: 'string',
      description: 'Label for the alarm',
      required: false,
      extractionPatterns: [
        /(?:called|labeled|named)\s+["\']?(.+?)["\']?$/i,
        /(?:for|to)\s+(.+?)(?:\s+at|\s+every|$)/i,
      ],
    },
    {
      name: 'repeat',
      type: 'string',
      description: 'Repeat pattern',
      required: false,
      enumValues: ['once', 'daily', 'weekdays', 'weekends', 'custom'],
      extractionPatterns: [
        /(daily|every\s+day|weekdays?|weekends?|every\s+(?:mon|tue|wed|thu|fri|sat|sun))/i,
      ],
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
      toolId: 'setAlarm',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// GET ALARMS
// ============================================================================

export const getAlarmsTool: SemanticToolDefinition = {
  id: 'alarms_list',
  name: 'Get Alarms',
  description: 'List all your alarms.',
  shortDescription: 'show my alarms',
  category: 'utility',

  triggers: {
    phrases: [
      'show my alarms',
      'list alarms',
      'what alarms',
      'my alarms',
      'check alarms',
      'view alarms',
    ],
    patterns: [
      /^(?:show|list|view|check)\s+(?:my\s+)?alarms?/i,
      /^what\s+alarms?\s+(?:do\s+i\s+have|are\s+set)/i,
      /^(?:do\s+i\s+have\s+)?(?:any\s+)?alarms?\s+set/i,
    ],
    keywords: [
      { word: 'alarms', weight: 1.0 },
      { word: 'alarm', weight: 0.9 },
      { word: 'list', weight: 0.5 },
      { word: 'show', weight: 0.5 },
      { word: 'check', weight: 0.5 },
    ],
    antiKeywords: ['set', 'create', 'delete', 'cancel', 'snooze'],
  },

  examples: ['Show my alarms', 'What alarms do I have?', 'List all my alarms', 'Check my alarms'],

  counterExamples: ['Set an alarm for 7am', 'Delete my alarm', 'Snooze'],

  arguments: [
    {
      name: 'includeDisabled',
      type: 'boolean',
      description: 'Include disabled alarms',
      required: false,
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'getAlarms',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// DELETE ALARM
// ============================================================================

export const deleteAlarmTool: SemanticToolDefinition = {
  id: 'alarms_delete',
  name: 'Delete Alarm',
  description: 'Delete or cancel an alarm.',
  shortDescription: 'delete alarm',
  category: 'utility',

  triggers: {
    phrases: [
      'delete alarm',
      'cancel alarm',
      'remove alarm',
      'turn off alarm',
      'disable alarm',
      'stop alarm',
    ],
    patterns: [
      /^(?:delete|cancel|remove|turn\s+off|disable)\s+(?:my\s+)?(?:the\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\s*alarm/i,
      /^(?:delete|cancel|remove)\s+alarm\s+(?:for\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    ],
    keywords: [
      { word: 'delete', weight: 0.9 },
      { word: 'cancel', weight: 0.9 },
      { word: 'remove', weight: 0.8 },
      { word: 'turn off', weight: 0.8 },
      { word: 'disable', weight: 0.7 },
      { word: 'alarm', weight: 1.0 },
    ],
    antiKeywords: ['set', 'create', 'snooze'],
  },

  examples: [
    'Delete my 7am alarm',
    'Cancel the morning alarm',
    'Turn off my alarm',
    'Remove the weekday alarm',
  ],

  counterExamples: ['Set an alarm', 'Snooze alarm', 'Show my alarms'],

  arguments: [
    {
      name: 'alarmId',
      type: 'string',
      description: 'ID of the alarm to delete',
      required: false,
    },
    {
      name: 'time',
      type: 'string',
      description: 'Time of the alarm to delete',
      required: false,
      extractionPatterns: [
        /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*alarm/i,
        /alarm\s+(?:for\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      ],
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
      toolId: 'deleteAlarm',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// SNOOZE ALARM
// ============================================================================

export const snoozeAlarmTool: SemanticToolDefinition = {
  id: 'alarms_snooze',
  name: 'Snooze Alarm',
  description: 'Snooze a ringing alarm for a few more minutes.',
  shortDescription: 'snooze alarm',
  category: 'utility',

  triggers: {
    phrases: [
      'snooze',
      'snooze alarm',
      'five more minutes',
      '5 more minutes',
      'few more minutes',
      'let me sleep',
    ],
    patterns: [
      /^snooze(?:\s+(?:the\s+)?alarm)?/i,
      /^(?:give\s+me|i\s+need)\s+(?:a\s+)?(?:few|5|five|10|ten)\s+more\s+minutes/i,
      /^(?:let\s+me\s+)?sleep\s+(?:a\s+)?(?:few|5|five|10|ten)\s+(?:more\s+)?minutes/i,
    ],
    keywords: [
      { word: 'snooze', weight: 1.0 },
      { word: 'more minutes', weight: 0.9 },
      { word: 'sleep', weight: 0.6 },
      { word: 'alarm', weight: 0.7 },
    ],
    antiKeywords: ['set', 'create', 'delete', 'cancel'],
  },

  examples: ['Snooze', 'Snooze alarm', 'Give me 5 more minutes', 'Let me sleep a few more minutes'],

  counterExamples: ['Set an alarm', 'Delete alarm', 'Show alarms'],

  arguments: [
    {
      name: 'minutes',
      type: 'number',
      description: 'Minutes to snooze (default 9)',
      required: false,
      extractionPatterns: [/(\d+)\s+(?:more\s+)?minutes/i],
    },
    {
      name: 'alarmId',
      type: 'string',
      description: 'ID of alarm to snooze',
      required: false,
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'snoozeAlarm',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const alarmsTools: SemanticToolDefinition[] = [
  setAlarmTool,
  getAlarmsTool,
  deleteAlarmTool,
  snoozeAlarmTool,
];
