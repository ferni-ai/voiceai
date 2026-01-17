/**
 * Communication Tool Definitions for Semantic Router
 *
 * Routes communication-related queries - sending messages, scheduling,
 * drafting difficult messages, communication coaching.
 *
 * Note: SMS reading is handled by sms.semantic.ts
 *
 * @module tools/semantic-router/tool-definitions/communication
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SEND MESSAGE (Email or SMS)
// ============================================================================

export const sendMessageTool: SemanticToolDefinition = {
  id: 'comm_send_message',
  name: 'Send Message',
  description: 'Send a message via email or SMS.',
  shortDescription: 'send message',
  category: 'communication',

  triggers: {
    phrases: [
      'send a message',
      'send an email',
      'send a text',
      'email someone',
      'text someone',
      'message to',
      'write to',
      'send to',
    ],
    patterns: [
      /^(?:send|write)\s+(?:an?\s+)?(?:email|text|message)\s+to\s+(.+)/i,
      /^(?:email|text|message)\s+(.+?)(?:\s+(?:saying|about|that|and\s+say))/i,
      /^(?:tell|let)\s+(.+?)\s+(?:that|know|about)/i,
      /^(?:can\s+you\s+)?(?:send|write)\s+(?:to\s+)?(.+)/i,
    ],
    keywords: [
      { word: 'send', weight: 0.9 },
      { word: 'email', weight: 1.0 },
      { word: 'text', weight: 0.9 },
      { word: 'message', weight: 0.8 },
      { word: 'write', weight: 0.7 },
      { word: 'tell', weight: 0.6 },
    ],
    antiKeywords: [
      'read',
      'check',
      'show',
      'list',
      'any new',
      'memo',
      'voice memo',
      'draft',
      'help me write',
    ],
  },

  examples: [
    'Send an email to John about the meeting',
    "Text Mom that I'll be late",
    'Message Sarah saying happy birthday',
    'Email my boss about the project update',
  ],

  counterExamples: [
    'Read my texts',
    'Check my email',
    'Show messages from John',
    'Help me draft an email',
  ],

  arguments: [
    {
      name: 'channel',
      type: 'string',
      description: 'Communication channel (email or sms)',
      required: false,
      extractionPatterns: [/(email|text|sms)/i],
    },
    {
      name: 'to',
      type: 'string',
      description: 'Recipient email address or phone number',
      required: true,
      extractionPatterns: [
        /to\s+(.+?)(?:\s+(?:saying|about|that|and)|\s*$)/i,
        /^(?:email|text|message)\s+(.+?)(?:\s+(?:saying|about|that))/i,
      ],
    },
    {
      name: 'message',
      type: 'string',
      description: 'Message content',
      required: false,
      extractionPatterns: [/(?:saying|that|about)\s+(.+?)(?:\s*$)/i],
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
      toolId: 'sendMessage',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// SCHEDULE REMINDER
// ============================================================================

export const scheduleReminderTool: SemanticToolDefinition = {
  id: 'comm_schedule_reminder',
  name: 'Schedule Reminder',
  description: 'Set a reminder or schedule a calendar event.',
  shortDescription: 'set reminder',
  category: 'communication',

  triggers: {
    phrases: [
      'set a reminder',
      'remind me',
      'schedule a reminder',
      "don't let me forget",
      'alert me',
      'notification for',
    ],
    patterns: [
      /^(?:set|create|add)\s+(?:a\s+)?reminder\s+(?:to|for|about)\s+(.+)/i,
      /^remind\s+me\s+(?:to|about|that)\s+(.+)/i,
      /^(?:don't\s+let\s+me\s+forget|alert\s+me)\s+(?:to|about)\s+(.+)/i,
      /^(?:reminder|remind)\s*:\s*(.+)/i,
    ],
    keywords: [
      { word: 'remind', weight: 1.0 },
      { word: 'reminder', weight: 1.0 },
      { word: 'alert', weight: 0.8 },
      { word: 'notify', weight: 0.8 },
      { word: 'forget', weight: 0.7 },
      { word: 'remember', weight: 0.7 },
    ],
    antiKeywords: ['calendar', 'meeting', 'event', 'appointment', 'alarm', 'timer'],
  },

  examples: [
    'Remind me to call Mom tomorrow',
    'Set a reminder to take medication at 8pm',
    "Don't let me forget the dentist appointment",
    'Remind me about the project deadline next week',
  ],

  counterExamples: [
    'Schedule a meeting',
    'Create a calendar event',
    'Set an alarm',
    'Book an appointment',
  ],

  arguments: [
    {
      name: 'title',
      type: 'string',
      description: 'What to be reminded about',
      required: true,
      extractionPatterns: [/(?:to|about|that)\s+(.+?)(?:\s+(?:at|on|in|tomorrow|next)|\s*$)/i],
    },
    {
      name: 'when',
      type: 'string',
      description: 'When to remind',
      required: false,
      extractionPatterns: [/(?:at|on|in)\s+(.+?)(?:\s*$)/i, /(tomorrow|today|tonight|next\s+\w+)/i],
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
      toolId: 'scheduleReminder',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// DRAFT MESSAGE (Coaching)
// ============================================================================

export const draftMessageTool: SemanticToolDefinition = {
  id: 'comm_draft_message',
  name: 'Draft Message',
  description:
    'Help draft any difficult message: asking for a raise, setting boundaries, giving feedback.',
  shortDescription: 'draft message',
  category: 'communication',

  triggers: {
    phrases: [
      'help me write',
      'draft a message',
      'write a message',
      'help me say',
      'how do I say',
      'how should I respond',
      'write an email',
      'draft an email',
    ],
    patterns: [
      /^(?:help\s+me\s+)?(?:write|draft|compose)\s+(?:a\s+)?(?:message|email|text|response)/i,
      /^how\s+(?:do|should|can)\s+i\s+(?:say|tell|write|respond)/i,
      /^(?:help\s+me\s+)?(?:say|tell)\s+(?:someone|them|him|her)\s+(.+)/i,
      /^(?:i\s+need\s+to|want\s+to)\s+(?:write|send)\s+(?:a\s+)?(?:difficult|hard|tough)/i,
    ],
    keywords: [
      { word: 'draft', weight: 1.0 },
      { word: 'write', weight: 0.8 },
      { word: 'help me', weight: 0.7 },
      { word: 'how do i say', weight: 0.9 },
      { word: 'compose', weight: 0.8 },
      { word: 'respond', weight: 0.7 },
      { word: 'difficult', weight: 0.6 },
    ],
    antiKeywords: ['send', 'read', 'check', 'memo', 'practice', 'roleplay'],
  },

  examples: [
    'Help me write an email asking for a raise',
    'How do I say no to this request?',
    'Draft a message setting boundaries with my coworker',
    'Help me respond to this difficult email',
  ],

  counterExamples: [
    'Send an email',
    'Read my messages',
    'Practice a conversation',
    'Roleplay a difficult talk',
  ],

  arguments: [
    {
      name: 'situation',
      type: 'string',
      description: 'The situation or context',
      required: true,
    },
    {
      name: 'recipient',
      type: 'string',
      description: 'Who the message is for',
      required: false,
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
      toolId: 'draftMessage',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// ROLE PLAY CONVERSATION (Coaching)
// ============================================================================

export const rolePlayConversationTool: SemanticToolDefinition = {
  id: 'comm_roleplay',
  name: 'Role-Play Conversation',
  description: 'Role-play a conversation before having it. Build confidence by practicing.',
  shortDescription: 'practice conversation',
  category: 'communication',

  triggers: {
    phrases: [
      'practice a conversation',
      'roleplay',
      'role play',
      'practice talking',
      'rehearse',
      'help me prepare for a conversation',
      'practice what to say',
    ],
    patterns: [
      /^(?:practice|roleplay|role\s*play|rehearse)\s+(?:a\s+)?(?:conversation|talk|discussion)/i,
      /^(?:help\s+me\s+)?(?:practice|prepare\s+for)\s+(?:a\s+)?(?:difficult|hard|tough)\s+(?:conversation|talk)/i,
      /^(?:can\s+you\s+)?(?:be|play|act\s+as)\s+(?:my|the)\s+(.+?)\s+(?:so\s+i\s+can\s+practice)/i,
      /^(?:i\s+need\s+to\s+)?practice\s+(?:what\s+to\s+)?say/i,
    ],
    keywords: [
      { word: 'practice', weight: 1.0 },
      { word: 'roleplay', weight: 1.0 },
      { word: 'role play', weight: 1.0 },
      { word: 'rehearse', weight: 0.9 },
      { word: 'prepare', weight: 0.7 },
      { word: 'conversation', weight: 0.7 },
    ],
    antiKeywords: ['send', 'draft', 'write', 'email', 'text', 'read'],
  },

  examples: [
    'Practice a salary negotiation',
    'Role play a difficult conversation with my manager',
    'Help me rehearse asking for time off',
    'Can you be my boss so I can practice?',
  ],

  counterExamples: ['Send an email', 'Draft a message', 'Write a response', 'Read my texts'],

  arguments: [
    {
      name: 'scenario',
      type: 'string',
      description: 'The scenario to practice',
      required: true,
    },
    {
      name: 'counterpart',
      type: 'string',
      description: "Who you'll be talking to (boss, coworker, etc.)",
      required: false,
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
      toolId: 'rolePlayConversation',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// ANALYZE MESSAGE
// ============================================================================

export const analyzeMessageTool: SemanticToolDefinition = {
  id: 'comm_analyze_message',
  name: 'Analyze Message',
  description: 'Analyze messages for tone, clarity, and effectiveness.',
  shortDescription: 'analyze message',
  category: 'communication',

  triggers: {
    phrases: [
      'analyze this message',
      'review my message',
      'check the tone',
      'is this too harsh',
      'does this sound okay',
      'what do you think of this message',
      'how does this sound',
    ],
    patterns: [
      /^(?:analyze|review|check)\s+(?:this\s+)?(?:my\s+)?(?:message|email|text|response)/i,
      /^(?:is|does)\s+this\s+(?:sound|seem)\s+(?:okay|good|too\s+\w+)/i,
      /^(?:what\s+do\s+you\s+think|how\s+does\s+this\s+sound)/i,
      /^(?:check|review)\s+(?:the\s+)?tone\s+of/i,
    ],
    keywords: [
      { word: 'analyze', weight: 1.0 },
      { word: 'review', weight: 0.9 },
      { word: 'tone', weight: 0.9 },
      { word: 'check', weight: 0.7 },
      { word: 'sound', weight: 0.6 },
      { word: 'harsh', weight: 0.7 },
      { word: 'friendly', weight: 0.6 },
    ],
    antiKeywords: ['send', 'draft', 'write', 'read', 'practice'],
  },

  examples: [
    'Analyze this email before I send it',
    'Is this message too harsh?',
    'Review my response for tone',
    'Does this sound professional enough?',
  ],

  counterExamples: [
    'Send this email',
    'Draft a message',
    'Read my texts',
    'Practice a conversation',
  ],

  arguments: [
    {
      name: 'message',
      type: 'string',
      description: 'The message to analyze',
      required: true,
    },
    {
      name: 'mode',
      type: 'string',
      description: 'Analysis mode (review, incoming, transform, tone_check)',
      required: false,
    },
  ],

  confidence: {
    baseScore: 0.8,
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
      toolId: 'analyzeMessage',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// COMMUNICATION STRATEGY
// ============================================================================

export const communicationStrategyTool: SemanticToolDefinition = {
  id: 'comm_strategy',
  name: 'Communication Strategy',
  description: 'Plan a comprehensive communication strategy for complex situations.',
  shortDescription: 'communication strategy',
  category: 'communication',

  triggers: {
    phrases: [
      'communication strategy',
      'plan my communication',
      'how should I approach this',
      'strategy for talking to',
      'plan for this conversation',
    ],
    patterns: [
      /^(?:plan|create|develop)\s+(?:a\s+)?communication\s+strategy/i,
      /^how\s+should\s+i\s+approach\s+(?:this|talking\s+to)/i,
      /^(?:communication|conversation)\s+(?:plan|strategy)\s+for/i,
      /^(?:what(?:'s|s)?|what\s+is)\s+(?:the\s+)?best\s+(?:way|approach)\s+to\s+(?:communicate|talk)/i,
    ],
    keywords: [
      { word: 'strategy', weight: 1.0 },
      { word: 'plan', weight: 0.8 },
      { word: 'approach', weight: 0.8 },
      { word: 'communication', weight: 0.8 },
      { word: 'navigate', weight: 0.7 },
      { word: 'handle', weight: 0.6 },
    ],
    antiKeywords: ['send', 'draft', 'write', 'read', 'practice', 'roleplay'],
  },

  examples: [
    'Help me plan a communication strategy with my team',
    'How should I approach this difficult conversation?',
    'Create a strategy for talking to my manager about promotion',
    "What's the best approach to communicate this change?",
  ],

  counterExamples: ['Send an email', 'Draft a message', 'Practice a conversation'],

  arguments: [
    {
      name: 'situation',
      type: 'string',
      description: 'The complex situation',
      required: true,
    },
    {
      name: 'stakeholders',
      type: 'string',
      description: 'Who is involved',
      required: false,
    },
  ],

  confidence: {
    baseScore: 0.8,
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
      toolId: 'communicationStrategy',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// BUILD ASSERTIVENESS
// ============================================================================

export const buildAssertivenessTool: SemanticToolDefinition = {
  id: 'comm_assertiveness',
  name: 'Build Assertive Response',
  description: 'Help respond more assertively to situations.',
  shortDescription: 'be more assertive',
  category: 'communication',

  triggers: {
    phrases: [
      'be more assertive',
      'say no',
      'stand up for myself',
      'push back on',
      'set boundaries',
      'speak up',
      'assert myself',
    ],
    patterns: [
      /^(?:help\s+me\s+)?(?:be\s+more\s+)?assertive/i,
      /^how\s+(?:do|can)\s+i\s+(?:say\s+no|stand\s+up|push\s+back|set\s+boundaries)/i,
      /^(?:i\s+need\s+to|want\s+to)\s+(?:say\s+no|stand\s+up|push\s+back|set\s+boundaries)/i,
      /^(?:help\s+me\s+)?(?:speak\s+up|assert\s+myself)/i,
    ],
    keywords: [
      { word: 'assertive', weight: 1.0 },
      { word: 'say no', weight: 1.0 },
      { word: 'boundaries', weight: 0.9 },
      { word: 'stand up', weight: 0.9 },
      { word: 'push back', weight: 0.8 },
      { word: 'speak up', weight: 0.8 },
      { word: 'confident', weight: 0.7 },
    ],
    antiKeywords: ['send', 'draft', 'read', 'schedule', 'remind'],
  },

  examples: [
    'Help me be more assertive with my coworker',
    'How do I say no to this request?',
    'I need to push back on this deadline',
    'Help me set boundaries with my family',
  ],

  counterExamples: ['Send an email', 'Draft a message', 'Schedule a reminder'],

  arguments: [
    {
      name: 'situation',
      type: 'string',
      description: 'The situation requiring assertiveness',
      required: true,
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
      toolId: 'buildAssertiveness',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// PLAN FOLLOW-UP
// ============================================================================

export const planFollowUpTool: SemanticToolDefinition = {
  id: 'comm_follow_up',
  name: 'Plan Follow-Up',
  description: "Plan a follow-up strategy when you've gotten no response.",
  shortDescription: 'follow up',
  category: 'communication',

  triggers: {
    phrases: [
      'follow up',
      "they haven't responded",
      'no response',
      'how to follow up',
      'should I follow up',
      'send a follow-up',
    ],
    patterns: [
      /^(?:how\s+(?:do|should|can)\s+i\s+)?follow\s+up/i,
      /^(?:they|he|she)\s+(?:haven't|hasn't|didn't)\s+respond/i,
      /^(?:no|still\s+no)\s+response\s+(?:from|to)/i,
      /^(?:should\s+i|when\s+(?:do|should)\s+i)\s+follow\s+up/i,
      /^(?:send|write)\s+(?:a\s+)?follow[-\s]?up/i,
    ],
    keywords: [
      { word: 'follow up', weight: 1.0 },
      { word: 'follow-up', weight: 1.0 },
      { word: 'no response', weight: 0.9 },
      { word: "haven't responded", weight: 0.9 },
      { word: 'check in', weight: 0.7 },
      { word: 'bump', weight: 0.6 },
    ],
    antiKeywords: ['send', 'draft', 'read', 'schedule', 'remind me'],
  },

  examples: [
    'How should I follow up on my job application?',
    "They haven't responded to my email",
    'No response from the client - what should I do?',
    'Should I send a follow-up?',
  ],

  counterExamples: ['Send an email', 'Set a reminder', 'Read my messages'],

  arguments: [
    {
      name: 'context',
      type: 'string',
      description: "What you're following up on",
      required: true,
    },
    {
      name: 'recipient',
      type: 'string',
      description: 'Who to follow up with',
      required: false,
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
      toolId: 'planFollowUp',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const communicationTools: SemanticToolDefinition[] = [
  sendMessageTool,
  scheduleReminderTool,
  draftMessageTool,
  rolePlayConversationTool,
  analyzeMessageTool,
  communicationStrategyTool,
  buildAssertivenessTool,
  planFollowUpTool,
];
