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
  description:
    'Leave a voicemail or make a quick call to a business/service. For personal contacts (family, friends), use conversational call instead.',
  shortDescription: 'leave a voicemail or call a business',
  category: 'telephony',

  triggers: {
    phrases: [
      // VOICEMAIL-specific phrases
      'leave a message',
      'leave a voicemail',
      'call and leave a message',
      'leave voicemail',
      'send a voicemail',
      // BUSINESS/SERVICE calls
      'call my doctor',
      'call the doctor',
      'call the restaurant',
      'call the bank',
      'call customer service',
      'call the office',
      'call support',
      'phone the dentist',
      'dial customer support',
      // Generic call (lower priority - will be overridden by conversational for family)
      'make a call',
      'place a call',
      'phone call',
    ],
    patterns: [
      // Voicemail patterns (high priority)
      /^(?:leave|send)\s+(?:a\s+)?(?:voice\s*)?(?:message|voicemail)\s+(?:for|to)\s+(.+)/i,
      /^(?:call)\s+(.+)\s+and\s+leave\s+(?:a\s+)?(?:message|voicemail)/i,
      // Business/service patterns
      /^(?:call|phone)\s+(?:the\s+)?(doctor|dentist|restaurant|bank|office|pharmacy|hospital|clinic|support|customer\s+service)/i,
      /^(?:call|phone)\s+my\s+(doctor|dentist|lawyer|accountant|therapist)/i,
      // Phone number patterns (business-like)
      /^(?:dial|call)\s+(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /^(?:call|dial)\s+(\+\d{1,3}\s?\d{10,})/i,
    ],
    keywords: [
      // Voicemail keywords (highest priority for this tool)
      { word: 'voicemail', weight: 1.0 },
      { word: 'leave a message', weight: 1.0 },
      { word: 'leave message', weight: 0.95 },
      // Business keywords
      { word: 'doctor', weight: 0.8 },
      { word: 'dentist', weight: 0.8 },
      { word: 'restaurant', weight: 0.8 },
      { word: 'bank', weight: 0.8 },
      { word: 'office', weight: 0.7 },
      { word: 'customer service', weight: 0.8 },
      { word: 'support', weight: 0.7 },
      // Generic (lower weight)
      { word: 'call', weight: 0.5 },
      { word: 'phone', weight: 0.5 },
      { word: 'dial', weight: 0.6 },
    ],
    // ANTI-KEYWORDS: Personal contacts should go to telephony_converse!
    antiKeywords: [
      'video',
      'zoom',
      'meeting',
      'text message',
      'sms',
      // Family members → conversational call
      'mom',
      'mother',
      'dad',
      'father',
      'grandma',
      'grandmother',
      'grandpa',
      'grandfather',
      'sister',
      'brother',
      'wife',
      'husband',
      'partner',
      'son',
      'daughter',
      'parents',
      'friend',
      // Intent keywords → conversational call
      'check in',
      'check on',
      'talk to',
      'chat with',
      'catch up',
    ],
  },

  examples: [
    // Voicemail examples
    'Leave a message for the doctor',
    'Leave a voicemail at the office',
    'Call and leave a message for customer service',
    'Leave voicemail saying I will be late',
    // Business examples
    'Call the restaurant',
    'Phone my doctor',
    'Call the bank about my account',
    'Dial customer support',
    'Call the dentist to reschedule',
    'Phone the pharmacy',
    'Make a call to the office',
    'Dial 555-1234',
  ],

  counterExamples: [
    'Set up a Zoom call',
    'Text mom',
    'Send a text message',
    'Video call',
    // Personal contacts should NOT match this tool
    'Call my mom',
    'Call my dad',
    'Phone my sister',
    'Call my friend',
    'Talk to my parents',
    'Check in on grandma',
  ],

  arguments: [
    {
      name: 'contact',
      type: 'string',
      description: 'Person or place to call',
      required: true,
      extractionPatterns: [
        /(?:call|phone|dial)\s+(?:my\s+)?(.+?)(?:\s+please)?$/i,
        /call\s+to\s+(.+)/i,
        /(?:leave|send)\s+(?:a\s+)?(?:voice\s*)?(?:message|voicemail)\s+(?:for|to)\s+(?:my\s+)?(.+?)(?:\s+saying)?/i,
      ],
    },
    {
      name: 'phoneNumber',
      type: 'string',
      description: 'Phone number if provided',
      required: false,
      extractionPatterns: [/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/, /(\+\d{1,3}\s?\d{10,})/],
    },
    {
      name: 'message',
      type: 'string',
      description: 'Message to leave as voicemail',
      required: false,
      extractionPatterns: [
        /saying\s+["']?(.+?)["']?$/i,
        /message[:\s]+["']?(.+?)["']?$/i,
        /tell\s+(?:them|her|him)\s+["']?(.+?)["']?$/i,
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
      toolId: 'makePhoneCall',
      args,
      delegateTo: 'domains/telephony',
    };
  },
};

// ============================================================================
// CONVERSATIONAL CALL (Ferni talks to someone)
// ============================================================================

export const conversationalCallTool: SemanticToolDefinition = {
  id: 'telephony_converse',
  name: 'Conversational Call',
  description:
    'Have Ferni call someone and have a real two-way conversation, then report back. Use for personal contacts like family and friends.',
  shortDescription: 'have a conversation with someone',
  category: 'telephony',

  triggers: {
    phrases: [
      // Explicit conversation phrases
      'call and check in',
      'call and talk to',
      'have a conversation with',
      'talk to',
      'check in on',
      'call and see how',
      'call and chat',
      'have ferni call',
      'can you call and',
      'call my mom and check',
      'call and introduce yourself',
      // NATURAL LANGUAGE: Simple "call [family member]" phrases
      'call my mom',
      'call my dad',
      'call my mother',
      'call my father',
      'call my parents',
      'call my grandma',
      'call my grandmother',
      'call my grandpa',
      'call my grandfather',
      'call my sister',
      'call my brother',
      'call my friend',
      'call my wife',
      'call my husband',
      'call my partner',
      'call my son',
      'call my daughter',
      // Possessive variations
      "call mom's phone",
      "call my mom's phone",
      "call my mom's number",
      'call mom for me',
      'call my mom for me',
      'phone my mom',
      'ring my mom',
      // Question forms
      'can you call my mom',
      'could you call my mom',
      'would you call my mom',
      'will you call my mom',
    ],
    patterns: [
      // Original patterns with "and X"
      /^(?:call|phone)\s+(?:my\s+)?(.+?)\s+and\s+(?:check\s+(?:in|on)|talk|chat|see\s+how|catch\s+up)/i,
      /^(?:have\s+(?:a\s+)?)?(?:conversation|chat)\s+with\s+(?:my\s+)?(.+)/i,
      /^(?:talk|chat|speak)\s+(?:to|with)\s+(?:my\s+)?(.+)/i,
      /^check\s+(?:in\s+)?on\s+(?:my\s+)?(.+)/i,
      /^(?:have\s+)?ferni\s+(?:call|talk\s+to|chat\s+with)\s+(?:my\s+)?(.+)/i,
      /^(?:can\s+you\s+)?call\s+(?:my\s+)?(.+?)\s+and\s+(?:introduce|say\s+hi|check)/i,
      /^i\s+want\s+you\s+to\s+(?:call|talk\s+to)\s+(?:my\s+)?(.+)/i,
      // NEW: Personal relationship patterns (no "and X" required!)
      /^(?:call|phone|ring)\s+(?:my\s+)?(mom|mother|dad|father|grandma|grandmother|grandpa|grandfather|sister|brother|friend|wife|husband|partner|son|daughter|parents)/i,
      /^(?:can|could|would|will)\s+you\s+(?:call|phone)\s+(?:my\s+)?(mom|mother|dad|father|grandma|grandmother|grandpa|grandfather|sister|brother|friend|wife|husband|partner|son|daughter|parents)/i,
      // "How do we call X" pattern (catches the original failed phrase!)
      /^(?:how\s+(?:do|can)\s+(?:we|i|you)\s+)?(?:call|phone)\s+(?:my\s+)?(mom|mother|dad|father|grandma|grandmother|grandpa|grandfather|sister|brother|friend|wife|husband|partner|son|daughter|parents)/i,
      // "call X's phone/number" pattern
      /^(?:call|phone)\s+(?:my\s+)?(?:mom|mother|dad|father|grandma|grandmother|grandpa|grandfather|sister|brother|friend|wife|husband|partner|son|daughter|parents)(?:'s)?\s+(?:phone|number|cell)/i,
    ],
    keywords: [
      // Explicit intent keywords
      { word: 'check in', weight: 1.0 },
      { word: 'check on', weight: 1.0 },
      { word: 'talk to', weight: 0.9 },
      { word: 'chat with', weight: 0.9 },
      { word: 'have a conversation', weight: 1.0 },
      { word: 'introduce yourself', weight: 0.9 },
      { word: 'catch up', weight: 0.9 },
      { word: 'see how', weight: 0.8 },
      // RELATIONSHIP KEYWORDS: Personal contacts → conversational call
      { word: 'mom', weight: 0.85 },
      { word: 'mother', weight: 0.85 },
      { word: 'dad', weight: 0.85 },
      { word: 'father', weight: 0.85 },
      { word: 'grandma', weight: 0.85 },
      { word: 'grandmother', weight: 0.85 },
      { word: 'grandpa', weight: 0.85 },
      { word: 'grandfather', weight: 0.85 },
      { word: 'sister', weight: 0.8 },
      { word: 'brother', weight: 0.8 },
      { word: 'friend', weight: 0.75 },
      { word: 'wife', weight: 0.85 },
      { word: 'husband', weight: 0.85 },
      { word: 'partner', weight: 0.8 },
      { word: 'son', weight: 0.85 },
      { word: 'daughter', weight: 0.85 },
      { word: 'parents', weight: 0.85 },
    ],
    // These indicate a simple call/voicemail, not a conversation
    antiKeywords: ['leave a message', 'voicemail', 'leave a voicemail', 'and tell them'],
  },

  // RICH EXAMPLES for embedding matching (semantic similarity)
  examples: [
    // Original examples
    'Call my mom and check in on her',
    'Have a conversation with Sarah',
    'Talk to my dad about his birthday',
    'Check in on grandma',
    'Can you call my friend and see how they are doing?',
    'Have Ferni call my sister',
    'Call John and introduce yourself',
    'Chat with my brother about the holiday',
    'I want you to call my mom and catch up with her',
    // NEW: Natural language examples for embedding matching
    'Call my mom',
    'Call my dad',
    'Can you call my mom?',
    'Would you call my parents?',
    'Phone my grandma',
    'Ring my sister',
    'Call my friend for me',
    "Call my mom's phone number",
    "How do we call my mom's phone number?",
    'I need to talk to my mom',
    'Get my mom on the phone',
    'Connect me with my dad',
    'Reach out to my grandmother',
    'Give my brother a call',
    'Call home',
    'Call my family',
  ],

  counterExamples: [
    'Call mom and leave a message',
    'Leave a voicemail for dad',
    'Call the restaurant', // Business call, not personal conversation
    'Phone my doctor', // Appointment, not conversation
    'Call the bank',
    'Phone customer service',
    'Call the office',
    'Dial the support line',
  ],

  arguments: [
    {
      name: 'contact',
      type: 'string',
      description: 'Person to have a conversation with',
      required: true,
      extractionPatterns: [
        /(?:call|talk\s+to|chat\s+with|check\s+(?:in\s+)?on)\s+(?:my\s+)?(.+?)(?:\s+and|\s+about|$)/i,
        /conversation\s+with\s+(?:my\s+)?(.+?)(?:\s+about|$)/i,
        /ferni\s+(?:call|talk\s+to)\s+(?:my\s+)?(.+?)(?:\s+and|$)/i,
      ],
    },
    {
      name: 'purpose',
      type: 'string',
      description: 'What to talk about or check on',
      required: false,
      extractionPatterns: [
        /and\s+(.+?)$/i,
        /about\s+(.+?)$/i,
        /to\s+(?:check|see|talk\s+about)\s+(.+?)$/i,
      ],
    },
    {
      name: 'tone',
      type: 'string',
      description: 'Conversation tone',
      required: false,
      enumValues: ['warm', 'casual', 'professional', 'celebratory'],
    },
  ],

  confidence: {
    baseScore: 0.95, // High confidence when matched - prioritize over simple call
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'callAndConverse',
      args,
      delegateTo: 'scheduling-executor', // Routes to our scheduling executor
    };
  },
};

// ============================================================================
// CALL ON BEHALF (Agent handles full conversation)
// ============================================================================

export const callOnBehalfTool: SemanticToolDefinition = {
  id: 'telephony_call_on_behalf',
  name: 'Call On Behalf',
  description:
    'Make a phone call on behalf of the user to accomplish a specific task. Agent handles the full conversation autonomously - scheduling appointments, making reservations, resolving issues, etc.',
  shortDescription: 'have Ferni make a call and handle it for you',
  category: 'telephony',

  triggers: {
    phrases: [
      // Explicit "on behalf" language
      'call on my behalf',
      'call for me',
      'make a call for me',
      'handle the call',
      'call and handle',
      // Appointment/scheduling patterns
      'call to reschedule',
      'call to schedule',
      'call to cancel',
      'call to book',
      'call to confirm',
      'call to change',
      // Objective-driven patterns with "to"
      'call my doctor to',
      'call the doctor to',
      'call the dentist to',
      'call the restaurant to',
      'call the bank to',
      'call and reschedule',
      'call and book',
      'call and make a reservation',
      'call and schedule',
      'call and cancel',
      // Business calls with objectives
      'call the pharmacy to',
      'call the insurance to',
      'call customer service to',
      // Delegation language
      'can you call and',
      'would you call and',
      'please call and',
      'I need you to call',
    ],
    patterns: [
      // "Call X to Y" - objective-driven calls
      /^(?:call|phone)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+(?:to|and)\s+(reschedule|schedule|cancel|book|confirm|change|ask|inquire|request|check\s+on|follow\s+up)/i,
      // "Make a reservation at X"
      /^(?:make|book)\s+(?:a\s+)?(?:reservation|appointment)\s+(?:at|with)\s+(.+)/i,
      // "Reschedule my appointment with X"
      /^(?:reschedule|cancel|change|confirm)\s+(?:my\s+)?(?:appointment|reservation)\s+(?:at|with)\s+(.+)/i,
      // "Call and [action]"
      /^(?:call|phone)\s+(.+?)\s+and\s+(?:ask|tell|let|have)\s+(?:them|him|her)/i,
      // "I need you to call X"
      /^(?:i\s+need\s+(?:you\s+)?to\s+)?(?:call|phone)\s+(.+?)\s+(?:to|and|about)/i,
      // Explicit delegation
      /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:call|phone)\s+(.+?)\s+(?:to|and|for\s+me)/i,
    ],
    keywords: [
      // Objective keywords (very high weight)
      { word: 'reschedule', weight: 1.0 },
      { word: 'schedule', weight: 0.95 },
      { word: 'book', weight: 0.95 },
      { word: 'cancel', weight: 0.95 },
      { word: 'confirm', weight: 0.9 },
      { word: 'reservation', weight: 0.95 },
      { word: 'appointment', weight: 0.95 },
      // Delegation keywords
      { word: 'for me', weight: 0.8 },
      { word: 'on my behalf', weight: 1.0 },
      { word: 'handle', weight: 0.85 },
      // Business targets
      { word: 'doctor', weight: 0.7 },
      { word: 'dentist', weight: 0.7 },
      { word: 'restaurant', weight: 0.7 },
      { word: 'pharmacy', weight: 0.7 },
      { word: 'insurance', weight: 0.7 },
      { word: 'bank', weight: 0.6 },
    ],
    // These should NOT trigger on-behalf calls
    antiKeywords: [
      'voicemail',
      'leave a message',
      'just call', // Simple call without objective
      'video call',
      'zoom',
      'meeting',
    ],
  },

  // Examples for semantic matching
  examples: [
    // Healthcare
    'Call my doctor to reschedule my appointment',
    'Call the dentist to cancel my cleaning',
    'Call the pharmacy to check on my prescription',
    'Reschedule my appointment with Dr. Smith',
    'Call and schedule a checkup for next week',
    // Restaurant
    'Call the restaurant to make a reservation',
    'Book a table at Olive Garden for tonight',
    'Call and change our reservation to 8pm',
    'Make a reservation for 4 at 7pm',
    // Business
    'Call the bank to dispute a charge',
    'Call customer service to resolve my issue',
    'Call the insurance company to ask about my claim',
    'Call and follow up on my order',
    // Delegation
    'Can you call and handle this for me?',
    'I need you to call and sort this out',
    'Would you call and take care of this?',
    'Call on my behalf to get this resolved',
  ],

  counterExamples: [
    // Simple calls without objective → makeCallTool
    'Call the doctor',
    'Phone my dentist',
    // Voicemail → makeCallTool
    'Leave a message for the doctor',
    'Call and leave a voicemail',
    // Personal calls → conversationalCallTool
    'Call my mom',
    'Check in on grandma',
    'Call my friend',
    // Callbacks → requestCallbackTool
    'Have them call me back',
    'Request a callback',
  ],

  arguments: [
    {
      name: 'contact',
      type: 'string',
      description: 'Business, service, or person to call',
      required: true,
      extractionPatterns: [
        /(?:call|phone)\s+(?:my\s+)?(?:the\s+)?(.+?)\s+(?:to|and)/i,
        /(?:appointment|reservation)\s+(?:at|with)\s+(?:my\s+)?(?:the\s+)?(.+?)$/i,
        /(?:reschedule|cancel|change)\s+(?:my\s+)?(?:appointment\s+)?(?:at|with)\s+(.+?)$/i,
      ],
    },
    {
      name: 'purpose',
      type: 'string',
      description: 'What the agent should accomplish',
      required: true,
      extractionPatterns: [/(?:to|and)\s+(.+?)$/i, /(?:about|regarding|for)\s+(.+?)$/i],
    },
    {
      name: 'callType',
      type: 'string',
      description: 'Type of call for script selection',
      required: false,
      enumValues: ['healthcare', 'restaurant', 'business', 'personal'],
    },
    {
      name: 'preferredTime',
      type: 'string',
      description: 'Preferred appointment/reservation time if mentioned',
      required: false,
      extractionPatterns: [
        /(?:for|at|to)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
        /(tomorrow|today|next\s+(?:week|monday|tuesday|wednesday|thursday|friday))/i,
        /(this\s+(?:week|morning|afternoon|evening))/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.95, // High base score - this is the autonomous call handler
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'callOnBehalf',
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
  callOnBehalfTool, // Highest priority - objective-driven calls (doctor to reschedule, restaurant to book)
  conversationalCallTool, // Personal contacts with conversational intent (family, friends)
  makeCallTool, // Simple business calls and voicemails
  requestCallbackTool,
  voicemailTool,
];
