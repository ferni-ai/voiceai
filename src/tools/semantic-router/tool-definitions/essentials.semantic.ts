/**
 * Essentials Tool Definitions for Semantic Router
 *
 * Core voice assistant features: capabilities discovery, quick capture, preferences.
 *
 * @module tools/semantic-router/tool-definitions/essentials
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// WHAT CAN YOU DO - Capabilities Discovery
// ============================================================================

export const whatCanYouDoTool: SemanticToolDefinition = {
  id: 'essentials_capabilities',
  name: 'What Can You Do',
  description: 'Discover what Ferni can help with - capabilities overview.',
  shortDescription: 'show capabilities',
  category: 'utility',

  triggers: {
    phrases: [
      'what can you do',
      'what are you capable of',
      'what can you help with',
      'how can you help me',
      'what do you do',
      'tell me what you can do',
      'show me your capabilities',
      'what are your features',
      'help me understand what you do',
      'what can I ask you',
    ],
    patterns: [
      /^what\s+(?:can\s+you|are\s+you\s+able\s+to)\s+(?:do|help\s+with)/i,
      /^(?:show|tell)\s+me\s+(?:what\s+you\s+can\s+do|your\s+capabilities)/i,
      /^how\s+can\s+you\s+help(?:\s+me)?/i,
      /^what\s+(?:do\s+you\s+do|are\s+you\s+for)/i,
      /^what\s+(?:kind\s+of\s+)?things\s+can\s+you\s+do/i,
    ],
    keywords: [
      { word: 'capabilities', weight: 0.9 },
      { word: 'features', weight: 0.8 },
      { word: 'help', weight: 0.6 },
      { word: 'do', weight: 0.5 },
      { word: 'able', weight: 0.6 },
    ],
    antiKeywords: ['timer', 'reminder', 'music', 'weather'],
  },

  examples: [
    'What can you do?',
    'What are you capable of?',
    'How can you help me?',
    'Show me your features',
    'What can I ask you?',
    'Tell me what you do',
  ],

  counterExamples: [
    'Set a timer',
    'What is the weather?',
    'Play music',
    'What time is it?',
  ],

  arguments: [
    {
      name: 'category',
      type: 'string',
      description: 'Category to focus on',
      required: false,
      enumValues: ['all', 'productivity', 'coaching', 'fun', 'smart-home', 'communication', 'finance', 'wellness'],
      extractionPatterns: [
        /(?:help\s+with|about)\s+(productivity|coaching|fun|smart.?home|communication|finance|wellness)/i,
      ],
    },
    {
      name: 'quickVersion',
      type: 'boolean',
      description: 'Short overview vs detailed',
      required: false,
      extractionPatterns: [/(quick|brief|short|overview)/i],
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
      toolId: 'whatCanYouDo',
      args: { category: args.category || 'all', quickVersion: args.quickVersion || false },
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// QUICK CAPTURE - Brain Dump
// ============================================================================

export const quickCaptureTool: SemanticToolDefinition = {
  id: 'essentials_capture',
  name: 'Quick Capture',
  description: 'Capture a thought and auto-route it to the right place.',
  shortDescription: 'capture a thought',
  category: 'utility',

  triggers: {
    phrases: [
      'remember this',
      "don't let me forget",
      'note to self',
      'I need to remember',
      'capture this',
      'save this thought',
      'brain dump',
      'just jot down',
      'quick note',
      'remind me about',
    ],
    patterns: [
      /^(?:remember|capture|save)\s+(?:this|that)/i,
      /^(?:don(?:'t| not))\s+let\s+me\s+forget/i,
      /^(?:note|memo)\s+to\s+(?:self|me)/i,
      /^i\s+(?:need\s+to|want\s+to|should)\s+remember/i,
      /^(?:brain|thought)\s+dump/i,
      /^(?:jot|write)\s+(?:this\s+)?down/i,
    ],
    keywords: [
      { word: 'remember', weight: 0.9 },
      { word: 'capture', weight: 0.8 },
      { word: 'forget', weight: 0.8 },
      { word: 'note', weight: 0.7 },
      { word: 'save', weight: 0.6 },
      { word: 'jot', weight: 0.7 },
    ],
    antiKeywords: ['what did I', 'recall', 'search'],
  },

  examples: [
    'Remember this: I need to call mom',
    "Don't let me forget to buy milk",
    'Note to self: check the garden',
    'Brain dump: I have three ideas',
    'Capture this thought',
    'Save this for later',
  ],

  counterExamples: [
    'What did I say earlier?',
    'Search my notes',
    'Find my reminders',
    'Recall what I told you',
  ],

  arguments: [
    {
      name: 'thought',
      type: 'string',
      description: 'The thought to capture',
      required: true,
      extractionPatterns: [
        /(?:remember|capture|save)(?:\s+this)?:\s*(.+)/i,
        /(?:note|memo)\s+to\s+(?:self|me):\s*(.+)/i,
        /(?:don(?:'t| not))\s+let\s+me\s+forget\s+(?:to\s+)?(.+)/i,
      ],
    },
    {
      name: 'urgency',
      type: 'string',
      description: 'How urgent',
      required: false,
      enumValues: ['now', 'soon', 'someday', 'just-remember'],
      extractionPatterns: [
        /(urgent|asap|right\s+away|now)/i,
        /(soon|later|eventually)/i,
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
      toolId: 'quickCapture',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// RECENT CONTEXT - Conversation Recall
// ============================================================================

export const recentContextTool: SemanticToolDefinition = {
  id: 'essentials_context',
  name: 'Recent Context',
  description: 'Recall what we talked about recently.',
  shortDescription: 'recall recent conversations',
  category: 'utility',

  triggers: {
    phrases: [
      'what did we talk about',
      'what did I say',
      'what were we discussing',
      'remind me what we talked about',
      'recall our conversation',
      'what did you remember',
      'summarize our chat',
      'what have we discussed',
    ],
    patterns: [
      /^what\s+(?:did\s+we|have\s+we)\s+(?:talk|talked|discuss)/i,
      /^what\s+(?:did\s+I|have\s+I)\s+(?:say|said|mention)/i,
      /^(?:remind|tell)\s+me\s+what\s+we\s+(?:talked|discussed)/i,
      /^(?:recall|summarize)\s+(?:our|the)\s+(?:conversation|chat)/i,
      /^what\s+do\s+you\s+(?:remember|know)\s+about/i,
    ],
    keywords: [
      { word: 'talked', weight: 0.9 },
      { word: 'discussed', weight: 0.9 },
      { word: 'conversation', weight: 0.8 },
      { word: 'recall', weight: 0.8 },
      { word: 'remember', weight: 0.7 },
      { word: 'said', weight: 0.6 },
    ],
    antiKeywords: ['set', 'create', 'play'],
  },

  examples: [
    'What did we talk about yesterday?',
    'Remind me what we discussed',
    'What did I say about my goals?',
    'Summarize our recent conversations',
    'What do you remember about my habits?',
  ],

  counterExamples: [
    'Set a reminder',
    'Create a note',
    'What can you do?',
    'Play music',
  ],

  arguments: [
    {
      name: 'timeframe',
      type: 'string',
      description: 'How far back to look',
      required: false,
      enumValues: ['today', 'yesterday', 'this-week', 'last-week', 'this-month', 'all-time'],
      extractionPatterns: [
        /(today|yesterday|this\s+week|last\s+week|this\s+month)/i,
      ],
    },
    {
      name: 'topic',
      type: 'string',
      description: 'Specific topic to recall',
      required: false,
      extractionPatterns: [
        /(?:about|regarding|on)\s+(?:my\s+)?(.+?)(?:\s+please)?$/i,
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
      toolId: 'recentContext',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// SET PREFERENCE - User Preferences
// ============================================================================

export const setPreferenceTool: SemanticToolDefinition = {
  id: 'essentials_preference',
  name: 'Set Preference',
  description: 'Set user preferences like units, nickname, etc.',
  shortDescription: 'set preference',
  category: 'utility',

  triggers: {
    phrases: [
      'call me',
      'my name is',
      'use celsius',
      'use fahrenheit',
      'use metric',
      'use imperial',
      'prefer',
      'set my preference',
      'change my settings',
    ],
    patterns: [
      /^(?:call|address)\s+me\s+(?:as\s+)?(.+)/i,
      /^(?:my\s+)?name\s+is\s+(.+)/i,
      /^(?:use|switch\s+to)\s+(celsius|fahrenheit|metric|imperial)/i,
      /^(?:I\s+)?prefer\s+(.+)/i,
      /^(?:set|change)\s+(?:my\s+)?(?:preference|setting)/i,
    ],
    keywords: [
      { word: 'call me', weight: 1.0 },
      { word: 'name', weight: 0.8 },
      { word: 'prefer', weight: 0.9 },
      { word: 'celsius', weight: 0.9 },
      { word: 'fahrenheit', weight: 0.9 },
      { word: 'metric', weight: 0.8 },
      { word: 'setting', weight: 0.7 },
    ],
    antiKeywords: ['weather', 'timer', 'remind'],
  },

  examples: [
    'Call me Alex',
    'Use celsius please',
    'I prefer metric units',
    'My name is Sarah',
    'Switch to 24 hour time',
  ],

  counterExamples: [
    "What's the temperature?",
    'Set a timer',
    'Remind me to call Alex',
    'What do you call this?',
  ],

  arguments: [
    {
      name: 'type',
      type: 'string',
      description: 'Type of preference',
      required: false,
      enumValues: ['temperature', 'distance', 'time-format', 'nickname', 'timezone', 'language', 'voice-speed'],
      extractionPatterns: [
        /(temperature|distance|time|timezone|language|speed)/i,
      ],
    },
    {
      name: 'value',
      type: 'string',
      description: 'Preference value',
      required: true,
      extractionPatterns: [
        /(?:call\s+me|name\s+is)\s+(.+)/i,
        /(?:use|prefer)\s+(.+)/i,
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
      toolId: 'setPreference',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const essentialsTools: SemanticToolDefinition[] = [
  whatCanYouDoTool,
  quickCaptureTool,
  recentContextTool,
  setPreferenceTool,
];

