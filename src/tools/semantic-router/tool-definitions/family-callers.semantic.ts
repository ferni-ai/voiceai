/**
 * Family Caller Tool Definitions for Semantic Router
 *
 * Semantic routing for family phone caller capabilities:
 * - Leave messages for sponsor
 * - Check for messages from family
 * - Create coordinated reminders
 *
 * These tools enable family members who call via phone to:
 * 1. Leave messages: "Tell Seth I'm thinking of him"
 * 2. Create reminders: "Remind Seth about Sunday dinner"
 *
 * And sponsors to:
 * 1. Check messages: "Do I have any messages from Mom?"
 *
 * @module tools/semantic-router/tool-definitions/family-callers
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// LEAVE MESSAGE FOR SPONSOR
// ============================================================================

export const leaveMessageTool: SemanticToolDefinition = {
  id: 'family_leave_message',
  name: 'Leave Message for Sponsor',
  description:
    'Leave a message for the sponsor (the person who set up this account). Used by family callers.',
  shortDescription: 'leave a message',
  category: 'family',
  priority: 1,

  triggers: {
    phrases: [
      'tell him',
      'tell her',
      'tell them',
      'tell seth',
      'let him know',
      'let her know',
      'let them know',
      'pass along',
      'give them a message',
      'give him a message',
      'give her a message',
      'send a message',
      'leave a message',
      'say hi to',
      'say hello to',
    ],
    patterns: [
      /\btell\s+(him|her|them|my\s+(?:son|daughter|husband|wife))\s+(?:that\s+)?(.+)/i,
      /\blet\s+(him|her|them)\s+know\s+(?:that\s+)?(.+)/i,
      /\bpass\s+(?:along|on)\s+(?:that\s+)?(.+)/i,
      /\bgive\s+(him|her|them)\s+a\s+message/i,
      /\bleave\s+(?:a\s+)?message\s+(?:for\s+)?(.+)/i,
      /\bsay\s+(hi|hello)\s+to\s+(.+)/i,
    ],
    keywords: [
      { word: 'tell', weight: 1.0 },
      { word: 'message', weight: 0.95 },
      { word: 'pass along', weight: 0.9 },
      { word: 'let know', weight: 0.9 },
      { word: 'say hi', weight: 0.85 },
      { word: 'say hello', weight: 0.85 },
    ],
    antiKeywords: ['tell me', 'tell ferni', 'what did', 'message from'],
  },

  examples: [
    "Tell Seth I'm thinking of him",
    'Let him know I called',
    'Pass along that dinner is at 5',
    'Tell her I love her',
    "Leave a message saying I'll call back",
    'Say hi to Seth for me',
    "Let them know I'm doing well",
  ],

  counterExamples: [
    'Tell me about the weather',
    'Tell Ferni to remember this',
    'What did Seth say?',
    'Do I have any messages?',
  ],

  arguments: [
    {
      name: 'messageContent',
      type: 'string',
      description: 'The message to leave',
      required: true,
      extractionPatterns: [
        /tell\s+(?:him|her|them)\s+(?:that\s+)?(.+)$/i,
        /let\s+(?:him|her|them)\s+know\s+(?:that\s+)?(.+)$/i,
        /pass\s+(?:along|on)\s+(?:that\s+)?(.+)$/i,
      ],
    },
    {
      name: 'recipientName',
      type: 'string',
      description: 'Who the message is for',
      required: false,
      extractionPatterns: [/tell\s+(\w+)\s+/i, /message\s+for\s+(\w+)/i],
    },
  ],

  confidence: {
    baseScore: 0.92,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'leaveMessageForSponsor',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// CHECK FAMILY MESSAGES (for sponsors)
// ============================================================================

export const checkMessagesTool: SemanticToolDefinition = {
  id: 'family_check_messages',
  name: 'Check Family Messages',
  description:
    'Check for pending messages from family members. Used by sponsors to see what family has left.',
  shortDescription: 'check messages',
  category: 'family',
  priority: 1,

  triggers: {
    phrases: [
      'do I have messages',
      'any messages',
      'did anyone call',
      'messages from mom',
      'messages from dad',
      'messages from family',
      'did mom call',
      'did dad call',
      'anyone leave a message',
      'check my messages',
      'any calls',
    ],
    patterns: [
      /\b(?:do\s+I\s+have|any|check)\s+(?:any\s+)?messages?\b/i,
      /\bdid\s+(?:anyone|mom|dad|my\s+(?:mother|father))\s+(?:call|leave)/i,
      /\bmessages?\s+from\s+(?:mom|dad|family|my)/i,
      /\banyone\s+(?:call|leave\s+a\s+message)/i,
      /\bany\s+(?:calls|messages)\s+(?:for\s+me)?/i,
    ],
    keywords: [
      { word: 'messages', weight: 1.0 },
      { word: 'call', weight: 0.85 },
      { word: 'mom', weight: 0.8 },
      { word: 'dad', weight: 0.8 },
      { word: 'family', weight: 0.8 },
      { word: 'anyone', weight: 0.7 },
    ],
    antiKeywords: ['tell', 'leave a message', 'send a message'],
  },

  examples: [
    'Do I have any messages?',
    'Did anyone call for me?',
    'Any messages from mom?',
    'Did my mom call?',
    'Check my messages',
    'Anyone leave a message?',
    'Did family try to reach me?',
  ],

  counterExamples: ['Tell Seth I called', 'Leave a message for him', 'Send a message to mom'],

  arguments: [
    {
      name: 'fromName',
      type: 'string',
      description: 'Filter messages from specific person',
      required: false,
      extractionPatterns: [/messages?\s+from\s+(\w+)/i, /did\s+(\w+)\s+(?:call|leave)/i],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'checkFamilyMessages',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// COORDINATED REMINDER (family creates reminder for sponsor)
// ============================================================================

export const coordinatedReminderTool: SemanticToolDefinition = {
  id: 'family_coordinated_reminder',
  name: 'Create Coordinated Reminder',
  description: 'Create a reminder for the sponsor that is attributed to you (the family caller).',
  shortDescription: 'remind them',
  category: 'family',
  priority: 1,

  triggers: {
    phrases: [
      'remind him',
      'remind her',
      'remind them',
      'remind seth',
      'make sure he remembers',
      'make sure she remembers',
      "don't let him forget",
      "don't let her forget",
      'remind my son',
      'remind my daughter',
    ],
    patterns: [
      /\bremind\s+(him|her|them|my\s+(?:son|daughter|husband|wife))\s+(?:about\s+|to\s+)?(.+)/i,
      /\bmake\s+sure\s+(he|she|they)\s+(?:remember|doesn't forget)\s*(.+)?/i,
      /\bdon't\s+let\s+(him|her|them)\s+forget\s*(.+)?/i,
    ],
    keywords: [
      { word: 'remind', weight: 1.0 },
      { word: 'remember', weight: 0.85 },
      { word: 'forget', weight: 0.8 },
      { word: 'make sure', weight: 0.75 },
    ],
    antiKeywords: ['remind me', 'remind ferni', 'set a reminder for me'],
  },

  examples: [
    'Remind Seth about Sunday dinner at 5',
    'Remind him to call me back',
    "Make sure she doesn't forget the appointment",
    "Remind my son about the doctor's appointment tomorrow",
    "Don't let him forget to take his medicine",
    'Remind them about the family reunion',
  ],

  counterExamples: [
    'Remind me to call mom',
    'Set a reminder for me',
    'Remind Ferni about my meeting',
  ],

  arguments: [
    {
      name: 'reminderMessage',
      type: 'string',
      description: 'What to remind them about',
      required: true,
      extractionPatterns: [
        /remind\s+(?:him|her|them)\s+(?:about\s+|to\s+)?(.+)$/i,
        /make\s+sure\s+(?:he|she|they)\s+(?:remember|doesn't forget)\s+(.+)$/i,
        /don't\s+let\s+(?:him|her|them)\s+forget\s+(.+)$/i,
      ],
    },
    {
      name: 'reminderTime',
      type: 'string',
      description: 'When to deliver the reminder',
      required: false,
      extractionPatterns: [
        /(?:at|by|before)\s+([\d:]+\s*(?:am|pm)?)/i,
        /(?:tomorrow|today|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i,
        /(?:in\s+\d+\s+(?:hour|minute|day)s?)/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.06,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'createCoordinatedReminder',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// SHARE WITH FAMILY (sponsor to family)
// ============================================================================

export const shareWithFamilyTool: SemanticToolDefinition = {
  id: 'family_share_update',
  name: 'Share with Family',
  description: 'Share an update or message with a family member that Ferni will deliver.',
  shortDescription: 'share with family',
  category: 'family',
  priority: 1,

  triggers: {
    phrases: [
      'tell my mom',
      'tell my dad',
      'let my mom know',
      'let my dad know',
      'share with my mom',
      'share with my dad',
      'tell my parents',
      'let my parents know',
    ],
    patterns: [
      /\btell\s+my\s+(mom|dad|mother|father|parents?)\s+(?:that\s+)?(.+)/i,
      /\blet\s+my\s+(mom|dad|mother|father|parents?)\s+know\s+(?:that\s+)?(.+)/i,
      /\bshare\s+with\s+(?:my\s+)?(mom|dad|mother|father|parents?)\s+(?:that\s+)?(.+)/i,
    ],
    keywords: [
      { word: 'tell my', weight: 1.0 },
      { word: 'let my', weight: 0.95 },
      { word: 'share with', weight: 0.9 },
      { word: 'mom', weight: 0.8 },
      { word: 'dad', weight: 0.8 },
      { word: 'parents', weight: 0.8 },
    ],
    antiKeywords: ['remind my', 'call my', 'message from'],
  },

  examples: [
    "Tell my mom I'm doing great",
    'Let my dad know I got the promotion',
    "Share with my parents that I'm feeling better",
    "Tell my mom I'm thinking of her",
  ],

  counterExamples: ['Remind my mom about dinner', 'Call my mom', 'Messages from mom'],

  arguments: [
    {
      name: 'message',
      type: 'string',
      description: 'What to share',
      required: true,
      extractionPatterns: [
        /tell\s+my\s+(?:mom|dad|mother|father|parents?)\s+(?:that\s+)?(.+)$/i,
        /let\s+my\s+(?:mom|dad|mother|father|parents?)\s+know\s+(?:that\s+)?(.+)$/i,
      ],
    },
    {
      name: 'familyMember',
      type: 'string',
      description: 'Who to share with',
      required: true,
      extractionPatterns: [/\bmy\s+(mom|dad|mother|father|parents?)\b/i],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'shareWithFamily',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// REQUEST CHECK-IN (sponsor asks Ferni to check on family)
// ============================================================================

export const requestCheckInTool: SemanticToolDefinition = {
  id: 'family_request_checkin',
  name: 'Request Family Check-In',
  description: 'Ask Ferni to check in on a family member during their next conversation.',
  shortDescription: 'check on family',
  category: 'family',
  priority: 1,

  triggers: {
    phrases: [
      'check on my mom',
      'check on my dad',
      'check in on my mom',
      'check in on my dad',
      'see how my mom is',
      'see how my dad is',
      'how is my mom doing',
      'how is my dad doing',
      'make sure my mom is okay',
    ],
    patterns: [
      /\bcheck\s+(?:in\s+)?on\s+my\s+(mom|dad|mother|father|parents?)/i,
      /\bsee\s+how\s+my\s+(mom|dad|mother|father)\s+is\b/i,
      /\bhow\s+is\s+my\s+(mom|dad|mother|father)\s+doing\b/i,
      /\bmake\s+sure\s+my\s+(mom|dad|mother|father)\s+is\s+(?:ok|okay|alright)/i,
    ],
    keywords: [
      { word: 'check on', weight: 1.0 },
      { word: 'check in', weight: 0.95 },
      { word: 'see how', weight: 0.9 },
      { word: 'how is', weight: 0.85 },
      { word: 'make sure', weight: 0.8 },
      { word: 'mom', weight: 0.7 },
      { word: 'dad', weight: 0.7 },
    ],
    antiKeywords: ['tell my', 'remind my', 'message'],
  },

  examples: [
    'Can you check on my mom?',
    'Check in on my dad tomorrow',
    'See how my mom is doing',
    'Make sure my dad is okay',
    'How is my mom doing?',
  ],

  counterExamples: ['Tell my mom something', 'Remind my dad', 'Messages from mom'],

  arguments: [
    {
      name: 'familyMember',
      type: 'string',
      description: 'Who to check on',
      required: true,
      extractionPatterns: [/\bmy\s+(mom|dad|mother|father|parents?)\b/i],
    },
    {
      name: 'reason',
      type: 'string',
      description: 'Why to check on them',
      required: false,
    },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.06,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/family',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'requestFamilyCheckIn',
      args,
      delegateTo: 'domains/family',
    };
  },
};

// ============================================================================
// TOOL COLLECTION
// ============================================================================

export const familyCallerTools: SemanticToolDefinition[] = [
  // Phone caller tools
  leaveMessageTool,
  checkMessagesTool,
  coordinatedReminderTool,
  // Sponsor sharing tools
  shareWithFamilyTool,
  requestCheckInTool,
];
