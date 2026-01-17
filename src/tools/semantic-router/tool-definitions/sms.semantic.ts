/**
 * SMS Reading Tool Definitions for Semantic Router
 *
 * Routes SMS/text message reading queries - view messages, check inbox, search texts.
 *
 * @module tools/semantic-router/tool-definitions/sms
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// READ SMS MESSAGES
// ============================================================================

export const readSMSTool: SemanticToolDefinition = {
  id: 'sms_read',
  name: 'Read SMS',
  description: 'Read recent text messages. Can filter by contact or show all conversations.',
  shortDescription: 'read texts',
  category: 'communication',

  triggers: {
    phrases: [
      'read my texts',
      'read my messages',
      'check my texts',
      'check my messages',
      'show my texts',
      'show my messages',
      'any texts from',
      'messages from',
      'what did they text',
    ],
    patterns: [
      /^(?:read|check|show)(?:\s+me)?\s+(?:my\s+)?(?:text(?:s)?|message(?:s)?|sms)/i,
      /^(?:any|what(?:'s| are))\s+(?:new\s+)?(?:text(?:s)?|message(?:s)?)/i,
      /^(?:text(?:s)?|message(?:s)?)\s+from\s+(.+)/i,
      /^what\s+did\s+(.+?)\s+(?:text|message|say)/i,
    ],
    keywords: [
      { word: 'text', weight: 1.0 },
      { word: 'texts', weight: 1.0 },
      { word: 'message', weight: 0.9 },
      { word: 'messages', weight: 0.9 },
      { word: 'sms', weight: 1.0 },
      { word: 'inbox', weight: 0.8 },
      { word: 'read', weight: 0.6 },
    ],
    antiKeywords: [
      'send',
      'write',
      'email',
      'call',
      'gmail',
      'mail',
      'slack',
      'discord',
      'memo',
      'voice memo',
    ],
  },

  examples: [
    'Read my texts',
    'Any new messages?',
    'Show messages from Mom',
    'What did John text me?',
    'Check my inbox',
  ],

  counterExamples: ['Send a text to Mom', 'Text John hello', 'Check my email', 'Call Mom'],

  arguments: [
    {
      name: 'contact',
      type: 'string',
      description: 'Contact name or phone number to filter by',
      required: false,
      extractionPatterns: [
        /(?:from|with)\s+(.+?)(?:\s*$)/i,
        /what\s+did\s+(.+?)\s+(?:text|message|say)/i,
      ],
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Max messages to show',
      required: false,
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
      toolId: 'readSMS',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// CHECK NEW MESSAGES
// ============================================================================

export const checkNewMessagesTool: SemanticToolDefinition = {
  id: 'sms_check_new',
  name: 'Check New Messages',
  description: 'Check if there are any new text messages.',
  shortDescription: 'check for new texts',
  category: 'communication',

  triggers: {
    phrases: [
      'any new texts',
      'any new messages',
      'did I get any texts',
      'did anyone text me',
      'new text messages',
      'unread texts',
      'unread messages',
    ],
    patterns: [
      /^(?:any|do\s+i\s+have)\s+(?:new\s+)?(?:text(?:s)?|message(?:s)?)/i,
      /^did\s+(?:i\s+get|anyone)\s+(?:any\s+)?(?:new\s+)?(?:text(?:s)?|message(?:s)?)/i,
      /^(?:new|unread)\s+(?:text(?:s)?|message(?:s)?)/i,
    ],
    keywords: [
      { word: 'new', weight: 0.8 },
      { word: 'texts', weight: 1.0 },
      { word: 'messages', weight: 0.9 },
      { word: 'unread', weight: 0.9 },
      { word: 'inbox', weight: 0.7 },
    ],
    antiKeywords: [
      'send',
      'write',
      'old',
      'previous',
      'email',
      'gmail',
      'mail',
      'slack',
      'discord',
      'memo',
      'voice memo',
    ],
  },

  examples: [
    'Any new texts?',
    'Did anyone text me?',
    'Do I have new messages?',
    'Check for new texts',
  ],

  counterExamples: ['Read my old texts', 'Send a new text', 'Show all messages'],

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
      toolId: 'checkNewMessages',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// SEARCH MESSAGES
// ============================================================================

export const searchMessagesTool: SemanticToolDefinition = {
  id: 'sms_search',
  name: 'Search Messages',
  description: 'Search through text messages for specific content.',
  shortDescription: 'search texts',
  category: 'communication',

  triggers: {
    phrases: [
      'search texts for',
      'search messages for',
      'find text about',
      'find message about',
      'text where',
      'message that says',
    ],
    patterns: [
      /^(?:search|find)\s+(?:my\s+)?(?:text(?:s)?|message(?:s)?)\s+(?:for|about|with)\s+(.+)/i,
      /^(?:find|look\s+for)\s+(?:a\s+)?(?:text|message)\s+(?:that\s+)?(?:says?|mentions?|about)\s+(.+)/i,
      /^which\s+(?:text|message)\s+(?:said|mentioned)\s+(.+)/i,
    ],
    keywords: [
      { word: 'search', weight: 0.9 },
      { word: 'find', weight: 0.8 },
      { word: 'text', weight: 0.9 },
      { word: 'message', weight: 0.9 },
      { word: 'mentioned', weight: 0.7 },
    ],
    antiKeywords: [
      'send',
      'write',
      'email',
      'gmail',
      'mail',
      'memo',
      'voice memo',
      'slack',
      'discord',
    ],
  },

  examples: [
    'Search texts for address',
    'Find message about dinner',
    'Which text mentioned the party?',
    'Look for a text that says meeting',
  ],

  counterExamples: ['Send a text about dinner', 'Search my emails', 'Find contacts'],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'Text to search for',
      required: true,
      extractionPatterns: [/(?:for|about|with|says?|mentions?)\s+(.+?)(?:\s*$)/i],
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Max results',
      required: false,
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
      toolId: 'searchMessages',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const smsTools: SemanticToolDefinition[] = [
  readSMSTool,
  checkNewMessagesTool,
  searchMessagesTool,
];
