/**
 * Smart Home Tool Definitions for Semantic Router
 *
 * Routes smart home and IoT device queries - lights, thermostat, etc.
 *
 * @module tools/semantic-router/tool-definitions/smart-home
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// LIGHTS CONTROL
// ============================================================================

export const lightsControlTool: SemanticToolDefinition = {
  id: 'smarthome_lights',
  name: 'Lights Control',
  description: 'Control smart lights - turn on/off, dim, change color.',
  shortDescription: 'control lights',
  category: 'smart-home',

  triggers: {
    phrases: [
      'turn on the lights',
      'turn off the lights',
      'dim the lights',
      'lights on',
      'lights off',
      'set the lights',
      'change light color',
      'brighten the room',
    ],
    patterns: [
      /^(?:turn|switch)\s+(?:the\s+)?lights?\s+(?:on|off)/i,
      /^lights?\s+(?:on|off)/i,
      /^(?:dim|brighten)\s+(?:the\s+)?lights?/i,
      /^(?:set|change)\s+(?:the\s+)?lights?\s+(?:to\s+)?/i,
      /^(?:turn|make)\s+(?:the\s+)?(?:room|bedroom|living\s+room)\s+(?:lights?\s+)?(?:brighter|dimmer)/i,
    ],
    keywords: [
      { word: 'lights', weight: 1.0 },
      { word: 'light', weight: 1.0 },
      { word: 'lamp', weight: 0.9 },
      { word: 'dim', weight: 0.8 },
      { word: 'brighten', weight: 0.8 },
      { word: 'brightness', weight: 0.8 },
    ],
    antiKeywords: ['daylight', 'sunlight', 'light rain'],
  },

  examples: [
    'Turn on the lights',
    'Lights off',
    'Dim the bedroom lights',
    'Set lights to 50%',
    'Turn the lights blue',
    'Brighten the living room',
  ],

  counterExamples: [
    'What time is it?',
    'Light rain expected',
    'Daylight savings',
  ],

  arguments: [
    {
      name: 'action',
      type: 'string',
      description: 'Light action',
      required: false,
      enumValues: ['on', 'off', 'dim', 'brighten', 'color'],
      extractionPatterns: [
        /lights?\s+(on|off)/i,
        /(dim|brighten)\s+(?:the\s+)?lights?/i,
      ],
    },
    {
      name: 'room',
      type: 'string',
      description: 'Room to control',
      required: false,
      extractionPatterns: [
        /(bedroom|living\s*room|kitchen|bathroom|office|hallway)\s+lights?/i,
        /lights?\s+(?:in\s+)?(?:the\s+)?(bedroom|living\s*room|kitchen|bathroom|office)/i,
      ],
    },
    {
      name: 'brightness',
      type: 'number',
      description: 'Brightness level (0-100)',
      required: false,
      extractionPatterns: [
        /(?:to\s+)?(\d+)\s*(?:%|percent)/i,
      ],
    },
    {
      name: 'color',
      type: 'string',
      description: 'Light color',
      required: false,
      extractionPatterns: [
        /(?:to\s+)?(red|blue|green|yellow|purple|orange|white|warm|cool)/i,
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
      toolId: 'controlLights',
      args,
      delegateTo: 'domains/smart-home',
    };
  },
};

// ============================================================================
// THERMOSTAT CONTROL
// ============================================================================

export const thermostatControlTool: SemanticToolDefinition = {
  id: 'smarthome_thermostat',
  name: 'Thermostat Control',
  description: 'Control thermostat - set temperature, heating, cooling.',
  shortDescription: 'control temperature',
  category: 'smart-home',

  triggers: {
    phrases: [
      'set the temperature',
      'turn up the heat',
      'turn down the ac',
      "it's too cold",
      "it's too hot",
      'adjust thermostat',
      'make it warmer',
      'make it cooler',
    ],
    patterns: [
      /^(?:set|change|adjust)\s+(?:the\s+)?(?:temperature|thermostat)/i,
      /^(?:turn\s+)?(?:up|down)\s+(?:the\s+)?(?:heat|ac|air|thermostat)/i,
      /^(?:it(?:'s| is)|i(?:'m| am))\s+(?:too\s+)?(?:cold|hot|warm)/i,
      /^(?:make\s+it|turn\s+it)\s+(?:warmer|cooler|hotter|colder)/i,
      /^set\s+(?:the\s+)?(?:temperature|thermostat)\s+to\s+\d+/i,
    ],
    keywords: [
      { word: 'temperature', weight: 1.0 },
      { word: 'thermostat', weight: 1.0 },
      { word: 'heat', weight: 0.9 },
      { word: 'ac', weight: 0.9 },
      { word: 'air conditioning', weight: 0.9 },
      { word: 'cold', weight: 0.6 },
      { word: 'hot', weight: 0.6 },
      { word: 'warm', weight: 0.6 },
    ],
    antiKeywords: ['weather', 'outside', 'forecast'],
  },

  examples: [
    'Set the temperature to 72',
    'Turn up the heat',
    "It's too cold in here",
    'Make it warmer',
    'Turn down the AC',
    'Adjust the thermostat',
  ],

  counterExamples: [
    "What's the weather?",
    'Temperature outside',
    'Weather forecast',
  ],

  arguments: [
    {
      name: 'temperature',
      type: 'number',
      description: 'Target temperature',
      required: false,
      extractionPatterns: [
        /(?:to\s+)?(\d+)\s*(?:degrees|°)?/i,
      ],
    },
    {
      name: 'action',
      type: 'string',
      description: 'Thermostat action',
      required: false,
      enumValues: ['warmer', 'cooler', 'heat', 'cool', 'auto', 'off'],
      extractionPatterns: [
        /(warmer|cooler|hotter|colder)/i,
        /(?:turn\s+on\s+(?:the\s+)?)(heat|ac|air)/i,
      ],
    },
    {
      name: 'adjustment',
      type: 'string',
      description: 'Direction to adjust',
      required: false,
      enumValues: ['up', 'down'],
      extractionPatterns: [
        /turn\s+(up|down)/i,
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
      toolId: 'controlThermostat',
      args,
      delegateTo: 'domains/smart-home',
    };
  },
};

// ============================================================================
// LOCKS & SECURITY
// ============================================================================

export const locksControlTool: SemanticToolDefinition = {
  id: 'smarthome_locks',
  name: 'Locks Control',
  description: 'Control smart locks and check door status.',
  shortDescription: 'control locks',
  category: 'smart-home',

  triggers: {
    phrases: [
      'lock the door',
      'unlock the door',
      'is the door locked',
      'check the locks',
      'secure the house',
      'lock up',
    ],
    patterns: [
      /^(?:lock|unlock)\s+(?:the\s+)?(?:front\s+)?door/i,
      /^(?:is\s+)?(?:the\s+)?(?:front\s+)?door\s+(?:locked|unlocked)/i,
      /^(?:check|verify)\s+(?:the\s+)?locks?/i,
      /^(?:lock|secure)\s+(?:up|the\s+house)/i,
    ],
    keywords: [
      { word: 'lock', weight: 1.0 },
      { word: 'unlock', weight: 1.0 },
      { word: 'door', weight: 0.8 },
      { word: 'secure', weight: 0.7 },
    ],
    antiKeywords: ['screen lock', 'phone lock', 'password'],
  },

  examples: [
    'Lock the front door',
    'Is the door locked?',
    'Unlock the back door',
    'Check all the locks',
    'Secure the house',
    'Lock up for the night',
  ],

  counterExamples: [
    'Lock my phone',
    'Screen lock',
    'Password lock',
  ],

  arguments: [
    {
      name: 'action',
      type: 'string',
      description: 'Lock action',
      required: false,
      enumValues: ['lock', 'unlock', 'check'],
      extractionPatterns: [
        /^(lock|unlock)/i,
      ],
    },
    {
      name: 'door',
      type: 'string',
      description: 'Which door',
      required: false,
      enumValues: ['front', 'back', 'garage', 'all'],
      extractionPatterns: [
        /(front|back|garage|side)\s+door/i,
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
      toolId: 'controlLocks',
      args,
      delegateTo: 'domains/smart-home',
    };
  },
};

// ============================================================================
// GENERAL DEVICE CONTROL
// ============================================================================

export const deviceControlTool: SemanticToolDefinition = {
  id: 'smarthome_devices',
  name: 'Device Control',
  description: 'Control other smart home devices - TV, speakers, etc.',
  shortDescription: 'control devices',
  category: 'smart-home',

  triggers: {
    phrases: [
      'turn on the tv',
      'turn off the tv',
      'start the robot vacuum',
      'turn on the fan',
      'close the blinds',
      'open the garage',
    ],
    patterns: [
      /^(?:turn|switch)\s+(?:on|off)\s+(?:the\s+)?(?:tv|television|fan|vacuum)/i,
      /^(?:open|close)\s+(?:the\s+)?(?:blinds|curtains|shades|garage)/i,
      /^(?:start|stop)\s+(?:the\s+)?(?:robot\s+)?(?:vacuum|roomba)/i,
    ],
    keywords: [
      { word: 'tv', weight: 0.9 },
      { word: 'fan', weight: 0.9 },
      { word: 'vacuum', weight: 0.9 },
      { word: 'blinds', weight: 0.9 },
      { word: 'garage', weight: 0.8 },
      { word: 'curtains', weight: 0.8 },
    ],
    antiKeywords: ['fan of', 'tv show recommendation'],
  },

  examples: [
    'Turn on the TV',
    'Close the blinds',
    'Start the robot vacuum',
    'Turn off the fan',
    'Open the garage door',
    'Turn on the fireplace',
  ],

  counterExamples: [
    "I'm a fan of that",
    'TV show recommendation',
  ],

  arguments: [
    {
      name: 'device',
      type: 'string',
      description: 'Device to control',
      required: false,
      extractionPatterns: [
        /(?:turn|switch)\s+(?:on|off)\s+(?:the\s+)?(.+?)$/i,
        /(?:open|close)\s+(?:the\s+)?(.+?)$/i,
      ],
    },
    {
      name: 'action',
      type: 'string',
      description: 'Action to take',
      required: false,
      enumValues: ['on', 'off', 'open', 'close', 'start', 'stop'],
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
      toolId: 'controlDevice',
      args,
      delegateTo: 'domains/smart-home',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const smartHomeTools: SemanticToolDefinition[] = [
  lightsControlTool,
  thermostatControlTool,
  locksControlTool,
  deviceControlTool,
];
