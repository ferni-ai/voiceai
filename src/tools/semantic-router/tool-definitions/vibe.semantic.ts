/**
 * Vibe Tool Definitions for Semantic Router
 *
 * Unified environment control - Music, Lights, Temperature
 * Common commands like "set the vibe to focus", "make it cozy", etc.
 *
 * @module tools/semantic-router/tool-definitions/vibe
 */

import type { SemanticToolDefinition, ToolExecutionResult } from '../types.js';

// ============================================================================
// SET VIBE TOOL
// ============================================================================

export const setVibeTool: SemanticToolDefinition = {
  id: 'setVibe',
  name: 'Set Vibe',
  description:
    'Sets the environment vibe - adjusts music, lights, and temperature together for a unified atmosphere. Available vibes: focus, relax, energize, sleep, social, morning, romantic, workout, movie, cooking, reading, creative, meditation, gaming, dinner.',
  shortDescription: 'set the environment vibe',
  category: 'smart-home',

  triggers: {
    phrases: [
      'set the vibe',
      'set vibe',
      'change the vibe',
      'set the mood',
      'set the atmosphere',
      'make it cozy',
      'make it romantic',
      'time to focus',
      'need to relax',
      'help me focus',
      'getting ready for bed',
      'wind down',
      'time to work',
      'set up for a party',
      'movie night',
      'date night',
    ],
    patterns: [
      /^(?:set|change)\s+(?:the\s+)?(?:vibe|mood|atmosphere)\s+(?:to\s+)?(.+)/i,
      /^(?:i\s+)?(?:need|want)\s+(?:to\s+)?(?:relax|focus|energize|sleep|work)/i,
      /^(?:time\s+to|let's)\s+(?:relax|focus|work|sleep|party|cook|read)/i,
      /^(?:make\s+it|set\s+it|turn\s+it)\s+(?:cozy|romantic|bright|dim)/i,
      /^(?:help\s+me)\s+(?:focus|relax|sleep|work|concentrate)/i,
      /^(?:getting\s+ready\s+for|setting\s+up\s+for)\s+(?:bed|sleep|work|party|dinner)/i,
    ],
    keywords: [
      { word: 'vibe', weight: 1.0 },
      { word: 'mood', weight: 0.9 },
      { word: 'atmosphere', weight: 0.8 },
      { word: 'ambiance', weight: 0.8 },
      { word: 'focus', weight: 0.7 },
      { word: 'relax', weight: 0.7 },
      { word: 'sleep', weight: 0.6 },
      { word: 'work', weight: 0.5 },
      { word: 'cozy', weight: 0.7 },
      { word: 'romantic', weight: 0.7 },
      { word: 'energize', weight: 0.6 },
      { word: 'party', weight: 0.6 },
      { word: 'meditation', weight: 0.6 },
      { word: 'workout', weight: 0.5 },
    ],
    antiKeywords: ['lights', 'temperature', 'thermostat', 'music', 'spotify'], // Use specific tools
  },

  examples: [
    'set the vibe to focus',
    'set the mood to romantic',
    'I need to relax',
    'time to focus',
    'make it cozy',
    'set up for movie night',
    'help me concentrate',
    'getting ready for bed',
    'set the vibe for a party',
    'wind down time',
    'time to work',
    'let me relax',
    'create a romantic atmosphere',
    'meditation mode',
    'workout vibe',
  ],

  counterExamples: [
    'turn on the lights',
    'set temperature to 72',
    'play some music',
    'dim the lights',
  ],

  arguments: [
    {
      name: 'vibe',
      type: 'string',
      description: 'The vibe preset to activate',
      required: true,
      extractionPatterns: [
        /(?:set|change)\s+(?:the\s+)?(?:vibe|mood|atmosphere)\s+(?:to\s+)?(.+)/i,
        /(?:time\s+to|let's)\s+(\w+)/i,
        /(?:need|want)\s+(?:to\s+)?(\w+)/i,
        /(?:make\s+it|set\s+it)\s+(\w+)/i,
      ],
      enumValues: [
        'focus',
        'relax',
        'energize',
        'sleep',
        'social',
        'morning',
        'romantic',
        'workout',
        'movie',
        'cooking',
        'reading',
        'creative',
        'meditation',
        'gaming',
        'dinner',
      ],
      defaultValue: 'focus',
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    const vibe = args.vibe || 'focus';

    return {
      success: true,
      data: { vibe, activated: true },
      naturalResponse: `Setting the vibe to ${vibe}`,
      speakImmediately: true,
      sideEffects: ['vibe_activated'],
    };
  },

  priority: 90,
  tags: ['vibe', 'environment', 'smart-home', 'ambiance'],
};

// ============================================================================
// GET ENVIRONMENT STATUS TOOL
// ============================================================================

export const getEnvironmentStatusTool: SemanticToolDefinition = {
  id: 'getEnvironmentStatus',
  name: 'Get Environment Status',
  description: 'Gets the current status of the environment - music, lights, and temperature.',
  shortDescription: 'check environment status',
  category: 'smart-home',

  triggers: {
    phrases: [
      "what's the vibe",
      'whats the vibe',
      "how's the environment",
      'environment status',
      "what's playing",
      "what's the temperature",
      'check the vibe',
    ],
    patterns: [
      /^(?:what'?s|how'?s)\s+(?:the\s+)?(?:vibe|environment|atmosphere)/i,
      /^(?:check|get)\s+(?:the\s+)?(?:vibe|environment|status)/i,
    ],
    keywords: [
      { word: 'vibe', weight: 0.8 },
      { word: 'environment', weight: 0.8 },
      { word: 'status', weight: 0.6 },
      { word: 'current', weight: 0.5 },
    ],
    antiKeywords: ['set', 'change', 'adjust'],
  },

  examples: [
    "what's the vibe right now",
    'check the environment',
    "how's the vibe",
    "what's the current atmosphere",
    'environment status',
  ],

  counterExamples: ['set the vibe', 'change the mood', 'adjust the lights'],

  arguments: [],

  execute: async (): Promise<ToolExecutionResult> => {
    return {
      success: true,
      naturalResponse: 'Checking the current environment...',
      speakImmediately: true,
    };
  },

  priority: 70,
  tags: ['vibe', 'status', 'environment'],
};

// ============================================================================
// ADJUST LIGHTS TOOL
// ============================================================================

export const adjustLightsTool: SemanticToolDefinition = {
  id: 'adjustLights',
  name: 'Adjust Lights',
  description: 'Quickly adjust light brightness or turn lights on/off.',
  shortDescription: 'adjust the lights',
  category: 'smart-home',

  triggers: {
    phrases: [
      'dim the lights',
      'turn on the lights',
      'turn off the lights',
      'lights on',
      'lights off',
      'brighten the lights',
      'lower the lights',
    ],
    patterns: [
      /^(?:dim|brighten|lower|raise)\s+(?:the\s+)?lights/i,
      /^(?:turn|switch)\s+(?:the\s+)?lights\s+(?:on|off)/i,
      /^lights\s+(?:on|off|dim|bright)/i,
      /^set\s+(?:the\s+)?lights?\s+(?:to\s+)?(\d+)/i,
    ],
    keywords: [
      { word: 'lights', weight: 1.0 },
      { word: 'dim', weight: 0.9 },
      { word: 'brighten', weight: 0.8 },
      { word: 'brightness', weight: 0.7 },
    ],
    antiKeywords: ['vibe', 'mood', 'temperature'],
  },

  examples: [
    'dim the lights',
    'turn on the lights',
    'turn off the lights',
    'brighten up',
    'set lights to 50%',
    'lower the lights a bit',
    'lights off',
    'lights on',
  ],

  counterExamples: ['set the vibe', 'adjust temperature', 'set the mood'],

  arguments: [
    {
      name: 'action',
      type: 'string',
      description: 'What to do with the lights',
      required: true,
      enumValues: ['on', 'off', 'dim', 'brighten', 'set'],
      extractionPatterns: [
        /(?:turn|switch)\s+(?:the\s+)?lights\s+(on|off)/i,
        /(dim|brighten|lower|raise)\s+(?:the\s+)?lights/i,
        /lights\s+(on|off)/i,
      ],
    },
    {
      name: 'brightness',
      type: 'number',
      description: 'Brightness level 0-100',
      required: false,
      extractionPatterns: [/(?:to\s+)?(\d+)\s*%?/i, /brightness\s+(?:to\s+)?(\d+)/i],
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    const action = args.action || 'dim';
    const brightness = args.brightness;

    let response = '';
    if (action === 'off') {
      response = 'Turning off the lights';
    } else if (action === 'on') {
      response = 'Turning on the lights';
    } else if (action === 'dim') {
      response = 'Dimming the lights';
    } else if (action === 'brighten') {
      response = 'Brightening the lights';
    } else if (brightness !== undefined) {
      response = `Setting lights to ${brightness}%`;
    }

    return {
      success: true,
      data: { action, brightness },
      naturalResponse: response,
      speakImmediately: true,
    };
  },

  priority: 85,
  tags: ['lights', 'smart-home', 'brightness'],
};

// ============================================================================
// LIST VIBES TOOL
// ============================================================================

export const listVibesTool: SemanticToolDefinition = {
  id: 'listVibes',
  name: 'List Available Vibes',
  description: 'Lists all available vibe presets.',
  shortDescription: 'list available vibes',
  category: 'smart-home',

  triggers: {
    phrases: [
      'what vibes do you have',
      'list vibes',
      'show vibes',
      'available vibes',
      'what moods can you set',
      'vibe options',
    ],
    patterns: [
      /^(?:what|which)\s+(?:vibes?|moods?)\s+(?:do\s+you\s+have|are\s+available)/i,
      /^(?:list|show|get)\s+(?:the\s+)?(?:vibes?|moods?|presets?)/i,
    ],
    keywords: [
      { word: 'vibes', weight: 0.9 },
      { word: 'list', weight: 0.7 },
      { word: 'available', weight: 0.6 },
      { word: 'options', weight: 0.6 },
      { word: 'presets', weight: 0.6 },
    ],
    antiKeywords: ['set', 'change'],
  },

  examples: [
    'what vibes do you have',
    'list the available vibes',
    'show me the mood options',
    'what can you set the vibe to',
    'vibe presets',
  ],

  counterExamples: ['set the vibe to focus', 'change the mood'],

  arguments: [],

  execute: async (): Promise<ToolExecutionResult> => {
    return {
      success: true,
      naturalResponse:
        'Here are the available vibes: focus, relax, energize, sleep, social, morning, romantic, workout, movie, cooking, reading, creative, meditation, gaming, and dinner.',
      speakImmediately: true,
    };
  },

  priority: 60,
  tags: ['vibe', 'list', 'presets'],
};

// ============================================================================
// EXPORT ALL VIBE TOOLS
// ============================================================================

export const vibeTools: SemanticToolDefinition[] = [
  setVibeTool,
  getEnvironmentStatusTool,
  adjustLightsTool,
  listVibesTool,
];
