/**
 * Voice Memos Tool Definitions for Semantic Router
 *
 * Routes voice memo/recording queries - save, play, list, delete memos.
 *
 * @module tools/semantic-router/tool-definitions/voice-memos
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SAVE VOICE MEMO
// ============================================================================

export const saveVoiceMemoTool: SemanticToolDefinition = {
  id: 'voice_memo_save',
  name: 'Save Voice Memo',
  description: 'Save a voice memo with a title and content.',
  shortDescription: 'save a memo',
  category: 'productivity',

  triggers: {
    phrases: [
      'save a memo',
      'save a voice memo',
      'record a memo',
      'make a memo',
      'take a memo',
      'save this note',
      'record this',
      'remember this',
      'save a recording',
    ],
    patterns: [
      /^(?:save|record|make|take)\s+(?:a\s+)?(?:voice\s+)?memo/i,
      /^(?:save|record)\s+(?:this|a)\s+(?:voice\s+)?(?:note|recording)/i,
      /^memo\s*:\s*(.+)/i,
      /^(?:i\s+(?:want|need)\s+to\s+)?(?:save|record)\s+(?:a\s+)?memo/i,
    ],
    keywords: [
      { word: 'memo', weight: 1.0 },
      { word: 'voice memo', weight: 1.0 },
      { word: 'recording', weight: 0.8 },
      { word: 'save', weight: 0.7 },
      { word: 'record', weight: 0.8 },
      { word: 'remember', weight: 0.6 },
    ],
    antiKeywords: ['play', 'list', 'delete', 'email', 'text', 'music', 'song', 'spotify'],
  },

  examples: [
    'Save a memo',
    'Record a voice memo about the meeting',
    'Make a memo called grocery ideas',
    'Save this: remember to call the dentist',
  ],

  counterExamples: ['Play my memo', 'Delete the memo', 'List my memos', 'Send a voice message'],

  arguments: [
    {
      name: 'title',
      type: 'string',
      description: 'Title or subject of the memo',
      required: true,
      extractionPatterns: [/(?:called|titled|about)\s+(.+?)(?:\s*$)/i, /memo\s*:\s*(.+?)(?:\s*$)/i],
    },
    {
      name: 'transcript',
      type: 'string',
      description: 'The content of the memo',
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
      toolId: 'saveVoiceMemo',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// LIST VOICE MEMOS
// ============================================================================

export const listVoiceMemosTool: SemanticToolDefinition = {
  id: 'voice_memo_list',
  name: 'List Voice Memos',
  description: 'List all saved voice memos.',
  shortDescription: 'list memos',
  category: 'productivity',

  triggers: {
    phrases: [
      'list my memos',
      'show my memos',
      'what memos do I have',
      'my voice memos',
      'all my memos',
      'show recordings',
    ],
    patterns: [
      /^(?:list|show|view)\s+(?:my\s+)?(?:voice\s+)?memos/i,
      /^(?:what|which)\s+(?:voice\s+)?memos\s+do\s+i\s+have/i,
      /^(?:my|all)\s+(?:voice\s+)?memos/i,
    ],
    keywords: [
      { word: 'memos', weight: 1.0 },
      { word: 'list', weight: 0.7 },
      { word: 'show', weight: 0.6 },
      { word: 'all', weight: 0.5 },
      { word: 'recordings', weight: 0.8 },
    ],
    antiKeywords: ['save', 'record', 'delete', 'play', 'music', 'song', 'spotify'],
  },

  examples: ['List my memos', 'Show all my voice memos', 'What memos do I have?', 'My memos'],

  counterExamples: ['Save a memo', 'Play the memo', 'Delete all memos'],

  arguments: [
    {
      name: 'limit',
      type: 'number',
      description: 'Max memos to show',
      required: false,
    },
    {
      name: 'tag',
      type: 'string',
      description: 'Filter by tag',
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
      toolId: 'listVoiceMemos',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// RECALL/PLAY VOICE MEMO
// ============================================================================

export const recallVoiceMemoTool: SemanticToolDefinition = {
  id: 'voice_memo_recall',
  name: 'Recall Voice Memo',
  description: 'Recall and read back a specific voice memo.',
  shortDescription: 'play a memo',
  category: 'productivity',

  triggers: {
    phrases: [
      'play my memo',
      'play the memo',
      'recall memo',
      'what was that memo',
      'read my memo',
      'find my memo',
      'play recording',
    ],
    patterns: [
      /^(?:play|recall|read|find)\s+(?:my\s+)?(?:the\s+)?(?:voice\s+)?memo\s+(?:about|called|titled)\s+(.+)/i,
      /^(?:what\s+(?:was|did)\s+)?(?:my|the)\s+(?:voice\s+)?memo\s+(?:about|say)/i,
      /^(?:play|read)\s+(?:back\s+)?(?:the\s+)?(.+?)\s+memo/i,
    ],
    keywords: [
      { word: 'play', weight: 0.7 }, // Lower weight to avoid music conflicts
      { word: 'memo', weight: 1.0 },
      { word: 'voice memo', weight: 1.0 },
      { word: 'recall', weight: 0.9 },
      { word: 'read', weight: 0.7 },
      { word: 'find', weight: 0.6 },
      { word: 'recording', weight: 0.8 },
    ],
    antiKeywords: [
      'save',
      'record',
      'delete',
      'list',
      'all',
      'music',
      'song',
      'spotify',
      'jazz',
      'rock',
    ],
  },

  examples: [
    'Play my memo about groceries',
    'What was that memo about the meeting?',
    'Recall the dentist memo',
    'Read back my last memo',
  ],

  counterExamples: ['Save a memo', 'Delete the memo', 'List all memos'],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'Title or keyword to search for',
      required: true,
      extractionPatterns: [
        /(?:about|called|titled)\s+(.+?)(?:\s*$)/i,
        /(?:play|recall|find)\s+(?:the\s+)?(.+?)\s+memo/i,
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
      toolId: 'recallVoiceMemo',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// DELETE VOICE MEMO
// ============================================================================

export const deleteVoiceMemoTool: SemanticToolDefinition = {
  id: 'voice_memo_delete',
  name: 'Delete Voice Memo',
  description: 'Delete a saved voice memo.',
  shortDescription: 'delete a memo',
  category: 'productivity',

  triggers: {
    phrases: ['delete memo', 'delete the memo', 'remove memo', 'clear memo', 'delete recording'],
    patterns: [
      /^(?:delete|remove|clear)\s+(?:my\s+)?(?:the\s+)?(?:voice\s+)?memo\s+(?:about|called|titled)?\s*(.+)/i,
      /^(?:get\s+rid\s+of|erase)\s+(?:the\s+)?(.+?)\s+memo/i,
    ],
    keywords: [
      { word: 'delete', weight: 1.0 },
      { word: 'remove', weight: 0.9 },
      { word: 'memo', weight: 0.9 },
      { word: 'clear', weight: 0.7 },
      { word: 'erase', weight: 0.8 },
    ],
    antiKeywords: ['save', 'record', 'play', 'list'],
  },

  examples: [
    'Delete the grocery memo',
    'Remove my memo about the meeting',
    'Clear the dentist memo',
  ],

  counterExamples: ['Save a memo', 'Play the memo', 'List memos'],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'Title or keyword to identify the memo to delete',
      required: true,
      extractionPatterns: [
        /(?:delete|remove|clear)\s+(?:my\s+)?(?:the\s+)?(?:voice\s+)?memo\s+(?:about|called|titled)?\s*(.+?)(?:\s*$)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.3,
  },

  // Destructive operation - always confirm before executing
  requiresConfirmation: true,

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'deleteVoiceMemo',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// SEARCH VOICE MEMOS
// ============================================================================

export const searchVoiceMemosTool: SemanticToolDefinition = {
  id: 'voice_memo_search',
  name: 'Search Voice Memos',
  description: 'Search through voice memos for specific content.',
  shortDescription: 'search memos',
  category: 'productivity',

  triggers: {
    phrases: [
      'search memos',
      'search my memos',
      'find in memos',
      'memo that mentions',
      'which memo said',
    ],
    patterns: [
      /^(?:search|find)\s+(?:my\s+)?(?:voice\s+)?memos?\s+(?:for|about)\s+(.+)/i,
      /^(?:which|what)\s+memo\s+(?:said|mentioned|contains)\s+(.+)/i,
    ],
    keywords: [
      { word: 'search', weight: 0.9 },
      { word: 'find', weight: 0.8 },
      { word: 'memo', weight: 1.0 },
      { word: 'memos', weight: 1.0 },
      { word: 'mentioned', weight: 0.7 },
    ],
    antiKeywords: ['save', 'record', 'delete', 'text', 'email', 'music', 'song', 'spotify'],
  },

  examples: [
    'Search memos for meeting notes',
    'Find memos about groceries',
    'Which memo mentioned the dentist?',
  ],

  counterExamples: ['Save a memo', 'Search my texts', 'Search emails'],

  arguments: [
    {
      name: 'query',
      type: 'string',
      description: 'Text to search for',
      required: true,
      extractionPatterns: [/(?:for|about|mentioned|contains)\s+(.+?)(?:\s*$)/i],
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
      toolId: 'searchVoiceMemos',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const voiceMemosTools: SemanticToolDefinition[] = [
  saveVoiceMemoTool,
  listVoiceMemosTool,
  recallVoiceMemoTool,
  deleteVoiceMemoTool,
  searchVoiceMemosTool,
];
