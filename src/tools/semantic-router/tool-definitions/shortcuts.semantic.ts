/**
 * Shortcuts Tool Definitions for Semantic Router
 *
 * Cross-domain shortcuts for common voice assistant commands.
 *
 * @module tools/semantic-router/tool-definitions/shortcuts
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// QUICK ALARM
// ============================================================================

export const quickAlarmTool: SemanticToolDefinition = {
  id: 'shortcuts_alarm',
  name: 'Quick Alarm',
  description: 'Set an alarm quickly - delegates to alarm-tools.',
  shortDescription: 'set alarm',
  category: 'utility',

  triggers: {
    phrases: [
      'set an alarm',
      'wake me up',
      'alarm for',
      'set alarm',
      'alarm at',
      'morning alarm',
      'wake up at',
    ],
    patterns: [
      /^(?:set\s+)?(?:an?\s+)?alarm\s+(?:for\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /^wake\s+me\s+(?:up\s+)?(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+alarm/i,
    ],
    keywords: [
      { word: 'alarm', weight: 1.0 },
      { word: 'wake', weight: 0.9 },
      { word: 'morning', weight: 0.7 },
      { word: 'am', weight: 0.6 },
      { word: 'pm', weight: 0.6 },
    ],
    antiKeywords: ['timer', 'reminder', 'calendar'],
  },

  examples: [
    'Set an alarm for 7am',
    'Wake me up at 6:30',
    "Set alarm for 8 o'clock",
    'Morning alarm at 7',
  ],

  counterExamples: [
    'Set a timer for 5 minutes',
    'Remind me at 7pm',
    'Add meeting at 7am to calendar',
  ],

  arguments: [
    {
      name: 'time',
      type: 'string',
      description: 'Time for the alarm',
      required: true,
      extractionPatterns: [
        /(?:alarm\s+(?:for\s+)?|at\s+|up\s+at\s+)(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
        /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      ],
    },
    {
      name: 'label',
      type: 'string',
      description: 'Label for the alarm',
      required: false,
      extractionPatterns: [/(?:for|called|named)\s+"?([^"]+)"?$/i],
    },
  ],

  confidence: {
    baseScore: 0.9,
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
      toolId: 'quickAlarm',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// QUICK TIMER
// ============================================================================

export const quickTimerTool: SemanticToolDefinition = {
  id: 'shortcuts_timer',
  name: 'Quick Timer',
  description: 'Set a timer quickly - delegates to timer-tools.',
  shortDescription: 'set timer',
  category: 'utility',

  triggers: {
    phrases: ['set a timer', 'timer for', 'minute timer', 'start timer', 'countdown'],
    patterns: [
      /^(?:set\s+)?(?:a\s+)?timer\s+(?:for\s+)?(\d+)\s*(minute|second|hour)/i,
      /^(\d+)\s*(minute|second|hour)\s+timer/i,
      /^(?:start\s+)?countdown\s+(?:for\s+)?(\d+)/i,
    ],
    keywords: [
      { word: 'timer', weight: 1.0 },
      { word: 'countdown', weight: 0.9 },
      { word: 'minute', weight: 0.7 },
      { word: 'second', weight: 0.7 },
    ],
    antiKeywords: ['alarm', 'wake', 'reminder'],
  },

  examples: [
    'Set a timer for 5 minutes',
    '10 minute timer',
    'Timer for 30 seconds',
    'Start countdown for 2 hours',
  ],

  counterExamples: ['Set an alarm for 7am', 'Remind me in 5 minutes', 'Wake me up'],

  arguments: [
    {
      name: 'duration',
      type: 'string',
      description: 'Duration for the timer',
      required: true,
      extractionPatterns: [
        /(?:timer\s+(?:for\s+)?|for\s+)(\d+\s*(?:minute|second|hour)s?)/i,
        /^(\d+\s*(?:minute|second|hour)s?)/i,
      ],
    },
    {
      name: 'label',
      type: 'string',
      description: 'What the timer is for',
      required: false,
      extractionPatterns: [/(?:for|called)\s+"?([^"]+)"?$/i],
    },
  ],

  confidence: {
    baseScore: 0.9,
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
      toolId: 'quickTimer',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// QUICK WEATHER
// ============================================================================

export const quickWeatherTool: SemanticToolDefinition = {
  id: 'shortcuts_weather',
  name: 'Quick Weather',
  description: 'Get weather quickly - delegates to weather domain.',
  shortDescription: 'get weather',
  category: 'information',

  triggers: {
    phrases: [
      "what's the weather",
      'weather today',
      'is it going to rain',
      'how cold is it',
      'temperature',
      'forecast',
      'weather in',
    ],
    patterns: [
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?weather(?:\s+(?:like|today|in\s+.+))?/i,
      /^(?:is\s+it\s+)?(?:going\s+to\s+)?(?:rain|snow|be\s+(?:hot|cold|warm))/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:temperature|temp)/i,
      /^(?:weather\s+)?forecast/i,
    ],
    keywords: [
      { word: 'weather', weight: 1.0 },
      { word: 'temperature', weight: 0.9 },
      { word: 'forecast', weight: 0.9 },
      { word: 'rain', weight: 0.8 },
      { word: 'cold', weight: 0.7 },
      { word: 'hot', weight: 0.7 },
    ],
    antiKeywords: ['music', 'play', 'calendar'],
  },

  examples: [
    "What's the weather?",
    'Weather in New York',
    'Is it going to rain today?',
    "What's the temperature?",
    'Weather forecast',
  ],

  counterExamples: ['Play rain sounds', "What's the weather channel?", 'Weather report music'],

  arguments: [
    {
      name: 'location',
      type: 'string',
      description: 'Location for weather',
      required: false,
      extractionPatterns: [
        /weather\s+(?:in|for)\s+(.+)/i,
        /(?:temperature|forecast)\s+(?:in|for)\s+(.+)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
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
      toolId: 'quickWeather',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// QUICK MUSIC
// ============================================================================

export const quickMusicTool: SemanticToolDefinition = {
  id: 'shortcuts_music',
  name: 'Quick Music',
  description: 'Play music quickly - delegates to music domain.',
  shortDescription: 'play music',
  category: 'entertainment',

  triggers: {
    phrases: [
      'play some music',
      'play music',
      'put on some',
      'play something',
      'i want to hear',
      'play',
    ],
    patterns: [
      /^play\s+(?:some\s+)?(?:music|.+\s+music)/i,
      /^(?:put|turn)\s+on\s+(?:some\s+)?(.+)/i,
      /^play\s+(.+)/i,
      /^i\s+want\s+to\s+(?:hear|listen\s+to)\s+(.+)/i,
    ],
    keywords: [
      { word: 'play', weight: 0.9 },
      { word: 'music', weight: 1.0 },
      { word: 'listen', weight: 0.8 },
      { word: 'song', weight: 0.8 },
      { word: 'jazz', weight: 0.7 },
      { word: 'rock', weight: 0.7 },
    ],
    antiKeywords: ['video', 'movie', 'game', 'alarm', 'timer'],
  },

  examples: [
    'Play some jazz',
    'Play relaxing music',
    'Put on some rock',
    'I want to hear classical music',
    'Play Taylor Swift',
  ],

  counterExamples: ['Play a game', 'Play a video', 'Play a movie', 'Set alarm to play music'],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'What to play',
      required: true,
      extractionPatterns: [
        /play\s+(?:some\s+)?(.+)/i,
        /(?:put|turn)\s+on\s+(?:some\s+)?(.+)/i,
        /(?:hear|listen\s+to)\s+(.+)/i,
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
      toolId: 'quickMusic',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// QUICK CALENDAR
// ============================================================================

export const quickCalendarTool: SemanticToolDefinition = {
  id: 'shortcuts_calendar',
  name: 'Quick Calendar',
  description: 'Check or add calendar events - delegates to calendar domain.',
  shortDescription: 'check calendar',
  category: 'calendar',

  triggers: {
    phrases: [
      "what's on my calendar",
      'my schedule',
      'calendar today',
      'add to calendar',
      'schedule',
      'events today',
      'what do I have',
    ],
    patterns: [
      /^(?:what(?:'s| is|'s))\s+(?:on\s+)?my\s+(?:calendar|schedule)/i,
      /^(?:show|check)\s+(?:my\s+)?(?:calendar|schedule)/i,
      /^(?:add|put|schedule)\s+(.+)\s+(?:to|on)\s+(?:my\s+)?calendar/i,
      /^what\s+(?:do\s+I\s+have|am\s+I\s+doing)\s+(?:today|tomorrow)/i,
    ],
    keywords: [
      { word: 'calendar', weight: 1.0 },
      { word: 'schedule', weight: 0.9 },
      { word: 'appointment', weight: 0.8 },
      { word: 'meeting', weight: 0.8 },
      { word: 'event', weight: 0.7 },
    ],
    antiKeywords: ['reminder', 'alarm', 'timer'],
  },

  examples: [
    "What's on my calendar today?",
    'Show my schedule for tomorrow',
    'Add lunch with Sarah to calendar',
    'What do I have this week?',
  ],

  counterExamples: ['Set a reminder', 'Set an alarm', 'What time is it?'],

  arguments: [
    {
      name: 'action',
      type: 'string',
      description: 'Check or add',
      required: false,
      enumValues: ['check', 'add', 'list'],
      extractionPatterns: [/(add|schedule|put)/i, /(show|check|what)/i],
    },
    {
      name: 'date',
      type: 'string',
      description: 'Date for calendar',
      required: false,
      extractionPatterns: [/(?:today|tomorrow|this\s+week|next\s+\w+)/i],
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
      toolId: 'quickCalendar',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// QUICK SMART HOME
// ============================================================================

export const quickSmartHomeTool: SemanticToolDefinition = {
  id: 'shortcuts_smarthome',
  name: 'Quick Smart Home',
  description: 'Control smart home devices - delegates to smart-home domain.',
  shortDescription: 'control smart home',
  category: 'smart-home',

  triggers: {
    phrases: [
      'turn on the lights',
      'turn off the lights',
      'set thermostat',
      'lock the door',
      'lights on',
      'lights off',
    ],
    patterns: [
      /^(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(?:lights?|lamp)/i,
      /^(?:lights?|lamp)\s+(on|off)/i,
      /^(?:set|change)\s+(?:the\s+)?(?:thermostat|temperature)\s+(?:to\s+)?(\d+)/i,
      /^(?:lock|unlock)\s+(?:the\s+)?(?:door|front\s+door)/i,
    ],
    keywords: [
      { word: 'lights', weight: 1.0 },
      { word: 'thermostat', weight: 1.0 },
      { word: 'lock', weight: 0.9 },
      { word: 'turn', weight: 0.7 },
      { word: 'temperature', weight: 0.8 },
    ],
    antiKeywords: ['music', 'timer', 'alarm', 'calendar'],
  },

  examples: [
    'Turn on the lights',
    'Lights off',
    'Set thermostat to 72',
    'Lock the front door',
    'Turn off the living room lights',
  ],

  counterExamples: ['Play some light music', 'Set a timer', 'Temperature in New York'],

  arguments: [
    {
      name: 'command',
      type: 'string',
      description: 'What to do',
      required: true,
      extractionPatterns: [/^(.+)$/i],
    },
    {
      name: 'room',
      type: 'string',
      description: 'Which room',
      required: false,
      extractionPatterns: [
        /(?:in\s+(?:the\s+)?|the\s+)?(living\s+room|bedroom|kitchen|bathroom|office)/i,
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
      toolId: 'quickSmartHome',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const shortcutsTools: SemanticToolDefinition[] = [
  quickAlarmTool,
  quickTimerTool,
  quickWeatherTool,
  quickMusicTool,
  quickCalendarTool,
  quickSmartHomeTool,
];
