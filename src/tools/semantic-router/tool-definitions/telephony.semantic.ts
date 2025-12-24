/**
 * Telephony Tool Definitions for Semantic Router
 *
 * Routes phone call and callback-related queries.
 *
 * @module tools/semantic-router/tool-definitions/telephony
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// MAKE A PHONE CALL
// ============================================================================

export const makeCallTool: SemanticToolDefinition = {
  id: 'telephony_call',
  name: 'Make Phone Call',
  description: 'Initiate a phone call to a contact or number.',
  shortDescription: 'make a call',
  category: 'telephony',

  triggers: {
    phrases: [
      'call',
      'phone',
      'dial',
      'ring',
      'make a call',
      'call mom',
      'call my doctor',
      'phone call',
    ],
    patterns: [
      /^(?:call|phone|dial|ring)\s+(.+)/i,
      /^(?:make|place)\s+(?:a\s+)?(?:phone\s+)?call\s+(?:to\s+)?(.+)/i,
      /^(?:can\s+you\s+)?(?:call|phone)\s+(.+)\s+(?:for\s+me)?/i,
      /^i\s+(?:need|want)\s+to\s+(?:call|phone)\s+(.+)/i,
    ],
    keywords: [
      { word: 'call', weight: 1.0 },
      { word: 'phone', weight: 0.9 },
      { word: 'dial', weight: 0.9 },
      { word: 'ring', weight: 0.7 },
    ],
    antiKeywords: ['video', 'zoom', 'meeting', 'message', 'text'],
  },

  examples: [
    'Call mom',
    'Phone my doctor',
    'Make a call to John',
    'Dial 555-1234',
    'Can you call the restaurant for me?',
    'I need to call my dentist',
  ],

  counterExamples: ['Set up a Zoom call', 'Text mom', 'Send a message', 'Video call'],

  arguments: [
    {
      name: 'contact',
      type: 'string',
      description: 'Person or place to call',
      required: true,
      extractionPatterns: [
        /(?:call|phone|dial)\s+(?:my\s+)?(.+?)(?:\s+please)?$/i,
        /call\s+to\s+(.+)/i,
      ],
    },
    {
      name: 'phoneNumber',
      type: 'string',
      description: 'Phone number if provided',
      required: false,
      extractionPatterns: [/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/, /(\+\d{1,3}\s?\d{10,})/],
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
      toolId: 'makePhoneCall',
      args,
      delegateTo: 'domains/telephony',
    };
  },
};

// ============================================================================
// REQUEST CALLBACK
// ============================================================================

export const requestCallbackTool: SemanticToolDefinition = {
  id: 'telephony_callback',
  name: 'Request Callback',
  description: 'Request a callback from a business or service.',
  shortDescription: 'request a callback',
  category: 'telephony',

  triggers: {
    phrases: [
      'request a callback',
      'have them call me',
      'call me back',
      'get a callback',
      'schedule a call',
      'they should call me',
    ],
    patterns: [
      /^(?:request|get|schedule)\s+(?:a\s+)?callback/i,
      /^(?:have|ask)\s+them\s+(?:to\s+)?call\s+me/i,
      /^(?:i\s+want|i(?:'d| would)\s+like)\s+(?:a\s+)?callback/i,
      /^(?:can\s+(?:you|they))\s+call\s+me\s+back/i,
    ],
    keywords: [
      { word: 'callback', weight: 1.0 },
      { word: 'call back', weight: 1.0 },
      { word: 'call me', weight: 0.8 },
      { word: 'return call', weight: 0.9 },
    ],
    antiKeywords: ['make a call', 'dial'],
  },

  examples: [
    'Request a callback from the bank',
    'Have them call me back',
    'I want a callback about my order',
    'Schedule a call with support',
    'Can they call me tomorrow?',
  ],

  counterExamples: ['Call the bank', 'I want to call them', 'Dial customer service'],

  arguments: [
    {
      name: 'business',
      type: 'string',
      description: 'Business or service to request callback from',
      required: false,
      extractionPatterns: [
        /callback\s+(?:from|with)\s+(?:the\s+)?(.+?)$/i,
        /(?:have|ask)\s+(.+?)\s+(?:to\s+)?call/i,
      ],
    },
    {
      name: 'preferredTime',
      type: 'string',
      description: 'Preferred time for callback',
      required: false,
      extractionPatterns: [
        /(?:at|around|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
        /(tomorrow|today|this\s+(?:morning|afternoon|evening))/i,
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
      toolId: 'requestCallback',
      args,
      delegateTo: 'domains/telephony',
    };
  },
};

// ============================================================================
// CHECK VOICEMAIL
// ============================================================================

export const voicemailTool: SemanticToolDefinition = {
  id: 'telephony_voicemail',
  name: 'Check Voicemail',
  description: 'Check or manage voicemail messages.',
  shortDescription: 'check voicemail',
  category: 'telephony',

  triggers: {
    phrases: [
      'check voicemail',
      'any voicemails',
      'my messages',
      'listen to voicemail',
      'play voicemail',
      'new messages',
    ],
    patterns: [
      /^(?:check|play|listen\s+to)\s+(?:my\s+)?voicemail/i,
      /^(?:do\s+i\s+have\s+)?(?:any\s+)?(?:new\s+)?(?:voicemail|messages)/i,
      /^(?:what|who)\s+(?:are\s+)?(?:my\s+)?(?:voicemail|messages)/i,
    ],
    keywords: [
      { word: 'voicemail', weight: 1.0 },
      { word: 'messages', weight: 0.7 },
      { word: 'missed call', weight: 0.8 },
    ],
    antiKeywords: ['text', 'email', 'send'],
  },

  examples: [
    'Check my voicemail',
    'Any new voicemails?',
    'Play my messages',
    'Do I have any missed calls?',
    'Listen to voicemail from mom',
  ],

  counterExamples: ['Check my email', 'Read my texts', 'Send a message'],

  arguments: [
    {
      name: 'action',
      type: 'string',
      description: 'Voicemail action',
      required: false,
      enumValues: ['check', 'play', 'delete'],
    },
    {
      name: 'from',
      type: 'string',
      description: 'Filter by sender',
      required: false,
      extractionPatterns: [/voicemail\s+(?:from|by)\s+(.+?)$/i],
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
      toolId: 'checkVoicemail',
      args,
      delegateTo: 'domains/telephony',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const telephonyTools: SemanticToolDefinition[] = [
  makeCallTool,
  requestCallbackTool,
  voicemailTool,
];
