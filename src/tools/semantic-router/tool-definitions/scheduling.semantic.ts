/**
 * Scheduling Tool Definitions for Semantic Router
 *
 * Routes scheduling queries - schedule texts, calls, emails for later delivery.
 *
 * @module tools/semantic-router/tool-definitions/scheduling
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SCHEDULE TEXT MESSAGE
// ============================================================================

export const scheduleTextTool: SemanticToolDefinition = {
  id: 'scheduling_text',
  name: 'Schedule Text',
  description: 'Schedule a text message to be sent at a specific time.',
  shortDescription: 'schedule text',
  category: 'communication',

  triggers: {
    phrases: [
      'text me tomorrow',
      'text me at',
      'send me a text',
      'text me later',
      'remind me by text',
      'text myself',
      'schedule a text',
      'send a text tomorrow',
      'text me in the morning',
      'message me at',
    ],
    patterns: [
      /^(?:text|message|sms)\s+(?:me|myself)\s+(?:at|tomorrow|later|in\s+\d+)/i,
      /^(?:send|schedule)\s+(?:me\s+)?(?:a\s+)?(?:text|message|sms)\s+(?:at|tomorrow|later|in)/i,
      /^(?:text|message)\s+.+\s+(?:at|tomorrow|on|next)/i,
      /^remind\s+me\s+(?:by|via|with)\s+(?:text|sms)/i,
    ],
    keywords: [
      { word: 'text', weight: 1.0 },
      { word: 'sms', weight: 1.0 },
      { word: 'message', weight: 0.8 },
      { word: 'tomorrow', weight: 0.6 },
      { word: 'later', weight: 0.5 },
      { word: 'schedule', weight: 0.7 },
      { word: 'remind', weight: 0.5 },
      { word: 'morning', weight: 0.4 },
      { word: 'afternoon', weight: 0.4 },
      { word: 'evening', weight: 0.4 },
    ],
    antiKeywords: ['call', 'email', 'read', 'check', 'now', 'immediately'],
  },

  examples: [
    'Text me tomorrow at 9am to call the doctor',
    'Send me a text in 2 hours about the meeting',
    "Text myself next Monday saying don't forget to pay bills",
    'Remind me by text at 3pm to pick up groceries',
    "Schedule a text to myself for Friday: it's payday!",
  ],

  counterExamples: [
    'Text John right now',
    'Send a text immediately',
    'Read my texts',
    'Call me tomorrow',
    'Email me at 9am',
  ],

  arguments: [
    {
      name: 'message',
      type: 'string',
      description: 'The content of the text message',
      required: true,
      extractionPatterns: [
        /(?:saying|about|that|to)\s+(.+?)(?:\s*$)/i,
        /(?:text|message)\s+.+?(?:at|tomorrow|in\s+\d+).+?(?:saying|about|that|to)\s+(.+)/i,
      ],
    },
    {
      name: 'when',
      type: 'string',
      description: 'When to send the text (natural language time)',
      required: true,
      extractionPatterns: [/(?:at|tomorrow|in\s+\d+\s*(?:hour|minute|day)|next\s+\w+|on\s+\w+)/i],
    },
    {
      name: 'recipient',
      type: 'string',
      description: 'Who to send the text to (defaults to self)',
      required: false,
      extractionPatterns: [/(?:text|message)\s+(\w+)\s+(?:at|tomorrow)/i],
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
      toolId: 'scheduleMessage',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// SCHEDULE PHONE CALL
// ============================================================================

export const scheduleCallTool: SemanticToolDefinition = {
  id: 'scheduling_call',
  name: 'Schedule Call',
  description: 'Schedule a phone call reminder for a specific time.',
  shortDescription: 'schedule call',
  category: 'communication',

  triggers: {
    phrases: [
      'call me at',
      'call me tomorrow',
      'give me a call',
      'wake up call',
      'call me in the morning',
      'call me later',
      'schedule a call',
      'phone call at',
      'ring me at',
    ],
    patterns: [
      /^call\s+me\s+(?:at|tomorrow|later|in\s+\d+)/i,
      /^(?:give|schedule)\s+(?:me\s+)?a?\s*(?:wake\s+up\s+)?call\s+(?:at|tomorrow)/i,
      /^(?:ring|phone)\s+me\s+(?:at|tomorrow|later)/i,
      /^(?:wake|alarm)\s+(?:me\s+)?(?:up\s+)?(?:with\s+)?(?:a\s+)?call/i,
    ],
    keywords: [
      { word: 'call', weight: 1.0 },
      { word: 'phone', weight: 0.9 },
      { word: 'ring', weight: 0.8 },
      { word: 'wake', weight: 0.7 },
      { word: 'tomorrow', weight: 0.5 },
      { word: 'morning', weight: 0.5 },
      { word: 'schedule', weight: 0.6 },
    ],
    antiKeywords: ['text', 'email', 'message', 'make a call to'],
  },

  examples: [
    'Call me at 2pm to remind me about the meeting',
    'Give me a wake up call tomorrow at 7am',
    'Schedule a call for 8pm tonight',
    "Call me in 30 minutes if I haven't left yet",
    'Ring me tomorrow morning at 6',
  ],

  counterExamples: [
    'Make a call to John',
    'Call the doctor',
    'Text me at 2pm',
    'Email me tomorrow',
    'Schedule a meeting call',
  ],

  arguments: [
    {
      name: 'message',
      type: 'string',
      description: 'What to say when the call is answered',
      required: true,
      extractionPatterns: [
        /(?:to\s+remind|about|saying)\s+(.+?)(?:\s*$)/i,
        /call.+?(?:at|tomorrow).+?(?:to|about|saying)\s+(.+)/i,
      ],
    },
    {
      name: 'when',
      type: 'string',
      description: 'When to make the call',
      required: true,
      extractionPatterns: [/(?:at|tomorrow|in\s+\d+\s*(?:hour|minute)|next\s+\w+)/i],
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
      toolId: 'scheduleCall',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// SCHEDULE EMAIL
// ============================================================================

export const scheduleEmailTool: SemanticToolDefinition = {
  id: 'scheduling_email',
  name: 'Schedule Email',
  description: 'Schedule an email to be sent at a specific time.',
  shortDescription: 'schedule email',
  category: 'communication',

  triggers: {
    phrases: [
      'email me tomorrow',
      'email me at',
      'send me an email',
      'email me later',
      'remind me by email',
      'schedule an email',
      'email myself',
    ],
    patterns: [
      /^email\s+me\s+(?:at|tomorrow|later|in\s+\d+|next)/i,
      /^(?:send|schedule)\s+(?:me\s+)?an?\s*email\s+(?:at|tomorrow|later)/i,
      /^remind\s+me\s+(?:by|via|with)\s+email/i,
    ],
    keywords: [
      { word: 'email', weight: 1.0 },
      { word: 'mail', weight: 0.7 },
      { word: 'tomorrow', weight: 0.5 },
      { word: 'schedule', weight: 0.6 },
      { word: 'remind', weight: 0.4 },
      { word: 'later', weight: 0.4 },
    ],
    antiKeywords: ['text', 'call', 'sms', 'read', 'check', 'inbox'],
  },

  examples: [
    'Email me Friday morning with the project summary',
    'Send me an email next week about renewing my subscription',
    'Schedule an email for Monday about the deadline',
    'Email myself tomorrow at 9am about the dentist',
    'Remind me by email at 5pm to submit the report',
  ],

  counterExamples: [
    'Send an email now',
    'Check my email',
    'Read my emails',
    'Text me tomorrow',
    'Call me at 5pm',
  ],

  arguments: [
    {
      name: 'subject',
      type: 'string',
      description: 'Email subject line',
      required: false,
      extractionPatterns: [/(?:subject|about)\s*[:=]?\s*(.+?)(?:\s+(?:at|tomorrow|on))/i],
    },
    {
      name: 'message',
      type: 'string',
      description: 'Email body content',
      required: true,
      extractionPatterns: [/(?:about|saying|with)\s+(.+?)(?:\s*$)/i],
    },
    {
      name: 'when',
      type: 'string',
      description: 'When to send the email',
      required: true,
      extractionPatterns: [
        /(?:at|tomorrow|in\s+\d+|next\s+\w+|on\s+\w+|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i,
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
      toolId: 'scheduleEmail',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// SEND MESSAGE NOW (IMMEDIATE)
// ============================================================================

export const sendMessageNowTool: SemanticToolDefinition = {
  id: 'scheduling_send_now',
  name: 'Send Message Now',
  description: 'Send an immediate text message.',
  shortDescription: 'send text now',
  category: 'communication',

  triggers: {
    phrases: [
      'text me that',
      'send that to my phone',
      'text me the summary',
      'send it to my phone',
      'text me this',
      'sms me that',
    ],
    patterns: [
      /^(?:text|sms)\s+me\s+(?:that|this|the)/i,
      /^send\s+(?:that|this|it)\s+to\s+my\s+(?:phone|cell)/i,
      /^(?:text|message)\s+me\s+(?:the\s+)?(?:summary|recap|details|info)/i,
    ],
    keywords: [
      { word: 'text', weight: 1.0 },
      { word: 'sms', weight: 1.0 },
      { word: 'send', weight: 0.8 },
      { word: 'phone', weight: 0.6 },
      { word: 'that', weight: 0.4 },
      { word: 'this', weight: 0.4 },
    ],
    antiKeywords: ['tomorrow', 'later', 'at', 'schedule', 'in an hour', 'next week'],
  },

  examples: [
    'Text me that',
    'Send that to my phone',
    'Text me the summary',
    'SMS me this information',
  ],

  counterExamples: [
    'Text me tomorrow',
    'Send a text at 5pm',
    'Schedule a text for later',
    'Text me in an hour',
  ],

  arguments: [
    {
      name: 'message',
      type: 'string',
      description: 'The message to send',
      required: true,
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'sendMessageNow',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// LIST SCHEDULED
// ============================================================================

export const listScheduledTool: SemanticToolDefinition = {
  id: 'scheduling_list',
  name: 'List Scheduled',
  description: 'View all pending scheduled messages, calls, and emails.',
  shortDescription: 'list scheduled',
  category: 'communication',

  triggers: {
    phrases: [
      'what do I have scheduled',
      'show my scheduled',
      'pending messages',
      'pending texts',
      'what reminders',
      'scheduled messages',
      'queued messages',
      "what's queued up",
    ],
    patterns: [
      /^(?:what|show|list)\s+(?:do\s+i\s+have\s+)?scheduled/i,
      /^(?:pending|queued)\s+(?:messages|texts|emails|calls)/i,
      /^(?:what|show)\s+(?:are\s+)?my\s+(?:scheduled|pending)\s+(?:messages|texts|emails)/i,
    ],
    keywords: [
      { word: 'scheduled', weight: 1.0 },
      { word: 'pending', weight: 0.9 },
      { word: 'queued', weight: 0.9 },
      { word: 'upcoming', weight: 0.7 },
      { word: 'messages', weight: 0.5 },
      { word: 'list', weight: 0.4 },
    ],
    antiKeywords: ['send', 'create', 'new', 'cancel', 'delete'],
  },

  examples: [
    'What do I have scheduled?',
    'Show my pending messages',
    "What's queued up?",
    'List my scheduled texts',
    'Any upcoming scheduled messages?',
  ],

  counterExamples: [
    'Schedule a text',
    'Cancel my scheduled text',
    'Send a new message',
    'Create a reminder',
  ],

  arguments: [],

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
      toolId: 'listScheduled',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// CANCEL SCHEDULED
// ============================================================================

export const cancelScheduledTool: SemanticToolDefinition = {
  id: 'scheduling_cancel',
  name: 'Cancel Scheduled',
  description: 'Cancel a pending scheduled message, call, or email.',
  shortDescription: 'cancel scheduled',
  category: 'communication',

  triggers: {
    phrases: [
      'cancel my scheduled',
      "don't send that",
      'remove scheduled',
      'delete scheduled',
      'cancel the text',
      "don't text me",
      'cancel the call',
      'cancel the email',
      'never mind the text',
    ],
    patterns: [
      /^(?:cancel|delete|remove)\s+(?:my\s+)?(?:scheduled|pending)\s+(?:text|message|call|email)/i,
      /^(?:don'?t|do\s+not)\s+(?:send|text|call|email)/i,
      /^(?:cancel|remove|delete)\s+(?:the|that)\s+(?:text|message|call|email)/i,
      /^never\s+mind\s+the\s+(?:text|message|call|email)/i,
    ],
    keywords: [
      { word: 'cancel', weight: 1.0 },
      { word: 'delete', weight: 0.9 },
      { word: 'remove', weight: 0.9 },
      { word: "don't", weight: 0.8 },
      { word: 'scheduled', weight: 0.6 },
      { word: 'pending', weight: 0.5 },
    ],
    antiKeywords: ['schedule', 'create', 'send', 'new'],
  },

  examples: [
    'Cancel my scheduled text',
    "Don't send that reminder",
    'Delete the scheduled call',
    'Remove the pending email',
    'Never mind the text tomorrow',
  ],

  counterExamples: [
    'Schedule a text',
    'Send the message',
    'Create a new reminder',
    'What do I have scheduled?',
  ],

  arguments: [
    {
      name: 'which',
      type: 'string',
      description: 'Which scheduled item to cancel (number or description)',
      required: false,
      extractionPatterns: [
        /(?:cancel|delete|remove)\s+(?:the\s+)?(?:number\s+)?(\d+)/i,
        /(?:cancel|delete|remove)\s+(?:the\s+)?(.+?)\s+(?:text|message|call|email)/i,
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
      toolId: 'cancelScheduled',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// SAVE CONTACT INFO
// ============================================================================

export const saveContactInfoTool: SemanticToolDefinition = {
  id: 'scheduling_save_contact',
  name: 'Save Contact Info',
  description: "Save the user's phone number or email for scheduling.",
  shortDescription: 'save contact',
  category: 'communication',

  triggers: {
    phrases: [
      'my number is',
      'my phone is',
      'my email is',
      'save my number',
      'save my phone',
      'save my email',
      'here is my number',
      "here's my email",
    ],
    patterns: [
      /^my\s+(?:phone\s+)?(?:number|phone)\s+is\s+.+/i,
      /^my\s+email\s+(?:address\s+)?is\s+.+/i,
      /^(?:save|remember)\s+my\s+(?:phone|number|email)/i,
      /^(?:here(?:'s|\s+is))\s+my\s+(?:phone|number|email)/i,
    ],
    keywords: [
      { word: 'number', weight: 0.9 },
      { word: 'phone', weight: 0.9 },
      { word: 'email', weight: 0.9 },
      { word: 'save', weight: 0.6 },
      { word: 'remember', weight: 0.5 },
    ],
    antiKeywords: ['call', 'text', 'schedule', "someone's"],
  },

  examples: [
    'My number is 555-123-4567',
    'My email is john@example.com',
    'Save my phone: 555-987-6543',
    "Here's my email: jane@example.com",
  ],

  counterExamples: [
    "John's number is 555-1234",
    'Call that number',
    'Text that email',
    "Remember Sarah's phone",
  ],

  arguments: [
    {
      name: 'phone',
      type: 'string',
      description: 'Phone number',
      required: false,
      extractionPatterns: [/(?:number|phone)\s+(?:is\s+)?([0-9\-\(\)\s\+]+)/i],
    },
    {
      name: 'email',
      type: 'string',
      description: 'Email address',
      required: false,
      extractionPatterns: [/(?:email)\s+(?:is\s+)?([^\s]+@[^\s]+)/i],
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.15,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.3,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'saveContactInfo',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// INTELLIGENT SCHEDULING: GET OPTIMAL SEND TIME
// ============================================================================

export const getOptimalSendTimeTool: SemanticToolDefinition = {
  id: 'scheduling_optimal_time',
  name: 'Get Optimal Send Time',
  description:
    'Get ML-recommended best time to reach a contact based on learned response patterns.',
  shortDescription: 'best time to reach',
  category: 'communication',

  triggers: {
    phrases: [
      "when's the best time to reach",
      'best time to text',
      'best time to call',
      'best time to email',
      'when does she usually respond',
      'when does he usually respond',
      'when do they usually respond',
      'optimal time to reach',
      'when should I text',
      'when should I call',
      'when should I email',
      'when is a good time',
      'what time does',
    ],
    patterns: [
      /^(?:when|what)(?:'s|\s+is)\s+(?:the\s+)?(?:best|optimal|good)\s+time\s+(?:to\s+)?(?:reach|contact|text|call|email)\s+(.+)/i,
      /^when\s+(?:does|do)\s+(.+?)\s+(?:usually\s+)?respond/i,
      /^when\s+should\s+I\s+(?:text|call|email|message|reach)\s+(.+)/i,
      /^(?:best|optimal)\s+time\s+(?:to\s+)?(?:reach|contact|text|call|email)/i,
    ],
    keywords: [
      { word: 'best', weight: 1.0 },
      { word: 'optimal', weight: 1.0 },
      { word: 'time', weight: 0.8 },
      { word: 'reach', weight: 0.8 },
      { word: 'respond', weight: 0.9 },
      { word: 'when', weight: 0.6 },
      { word: 'usually', weight: 0.7 },
    ],
    antiKeywords: ['schedule', 'send', 'now', 'at', 'tomorrow'],
  },

  examples: [
    "When's the best time to reach Sarah?",
    'What time does John usually respond?',
    'When should I text my mom?',
    "What's the optimal time to email my boss?",
    'Best time to call the doctor?',
    'When do they usually respond?',
  ],

  counterExamples: [
    'Text Sarah at 5pm',
    'Call John tomorrow',
    'Schedule an email for Monday',
    'Send the message now',
    'What time is it?',
  ],

  arguments: [
    {
      name: 'contactName',
      type: 'string',
      description: 'Name of the person to check timing for',
      required: true,
      extractionPatterns: [
        /(?:reach|text|call|email|contact)\s+(.+?)(?:\s*\?|$)/i,
        /(?:does|do)\s+(.+?)\s+(?:usually\s+)?respond/i,
        /should\s+I\s+(?:text|call|email)\s+(.+?)(?:\s*\?|$)/i,
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
      toolId: 'getOptimalSendTime',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// INTELLIGENT SCHEDULING: SCHEDULE AT BEST TIME
// ============================================================================

export const scheduleAtBestTimeTool: SemanticToolDefinition = {
  id: 'scheduling_best_time',
  name: 'Schedule At Best Time',
  description: 'Schedule a message for the ML-recommended optimal time.',
  shortDescription: 'schedule at best time',
  category: 'communication',

  triggers: {
    phrases: [
      'text at the best time',
      'send at the best time',
      'email at the best time',
      'call at the best time',
      'text when they respond',
      'send when likely to respond',
      'schedule for optimal time',
      'text at optimal time',
      'message when available',
      "text when she's around",
      "message when he's free",
    ],
    patterns: [
      /^(?:text|send|email|call|message)\s+(?:.+?\s+)?(?:at\s+(?:the\s+)?)?(?:best|optimal)\s+time/i,
      /^(?:text|send|email|message)\s+(?:.+?\s+)?when\s+(?:they|she|he)(?:'re|'s|\s+(?:are|is))?\s+(?:likely\s+to\s+)?(?:respond|available|around|free)/i,
      /^schedule\s+(?:this\s+)?(?:for\s+)?(?:the\s+)?(?:best|optimal)\s+time/i,
      /^(?:text|email|message)\s+(?:.+?\s+)?when\s+(?:they|she|he)\s+usually\s+respond/i,
    ],
    keywords: [
      { word: 'best', weight: 1.0 },
      { word: 'optimal', weight: 1.0 },
      { word: 'time', weight: 0.6 },
      { word: 'respond', weight: 0.8 },
      { word: 'likely', weight: 0.7 },
      { word: 'available', weight: 0.6 },
      { word: 'usually', weight: 0.6 },
    ],
    antiKeywords: ['at 5pm', 'tomorrow at', 'in 2 hours', 'next monday at'],
  },

  examples: [
    'Text Sarah at the best time',
    'Send this to John when he usually responds',
    "Email my boss at the optimal time saying I'll be late",
    "Schedule this text for the best time: don't forget the meeting",
    'Message mom when she usually responds',
    "Text them when they're likely to see it",
  ],

  counterExamples: [
    'Text Sarah at 5pm',
    'Send this tomorrow at 9am',
    'Email John in 2 hours',
    'Schedule for Monday morning',
    "When's the best time to reach them?",
  ],

  arguments: [
    {
      name: 'message',
      type: 'string',
      description: 'The message content to send',
      required: true,
      extractionPatterns: [
        /(?:saying|about|that|:)\s+(.+?)(?:\s*$)/i,
        /(?:text|email|message)\s+.+?(?:at\s+(?:best|optimal)\s+time)\s+(?:saying|about|that|:)\s+(.+)/i,
      ],
    },
    {
      name: 'contactName',
      type: 'string',
      description: 'Name of the recipient',
      required: true,
      extractionPatterns: [
        /(?:text|email|message|send\s+to)\s+(\w+)\s+(?:at|when)/i,
        /(?:text|send|email)\s+(?:this\s+to\s+)?(\w+)/i,
      ],
    },
    {
      name: 'channel',
      type: 'string',
      description: 'How to send: text, email, or call',
      required: false,
      extractionPatterns: [/^(text|email|call|message)/i],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'scheduleAtBestTime',
      args,
      delegateTo: 'domains/scheduling',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const schedulingTools: SemanticToolDefinition[] = [
  scheduleTextTool,
  scheduleCallTool,
  scheduleEmailTool,
  sendMessageNowTool,
  listScheduledTool,
  cancelScheduledTool,
  saveContactInfoTool,
  // Intelligent scheduling tools
  getOptimalSendTimeTool,
  scheduleAtBestTimeTool,
];
