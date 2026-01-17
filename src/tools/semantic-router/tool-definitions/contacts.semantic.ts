/**
 * Contact Relationship Tool Definitions for Semantic Router
 *
 * Semantic routing for contact management queries.
 * Routes to contact relationship tools for CRUD operations.
 *
 * @module tools/semantic-router/tool-definitions/contacts
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// SAVE / ADD CONTACT
// ============================================================================

export const saveContactTool: SemanticToolDefinition = {
  id: 'contact_save',
  name: 'Save Contact',
  description: 'Add a new contact or update existing contact information.',
  shortDescription: 'save a contact',
  category: 'communication',

  triggers: {
    phrases: [
      'add a contact',
      'save a contact',
      'new contact',
      'add contact',
      'save contact',
      'create a contact',
      'remember this person',
      'add them to my contacts',
      // Family/relationship number patterns
      "my mom's number is",
      "my dad's number is",
      "my sister's number is",
      "my brother's number is",
      "my wife's number is",
      "my husband's number is",
      "mom's phone number",
      "dad's phone number",
      "save my mom's number",
      "save my dad's number",
      "remember my mom's number",
    ],
    patterns: [
      /^(?:add|save|create)\s+(?:a\s+)?(?:new\s+)?contact/i,
      /^(?:add|save)\s+(.+)\s+(?:as\s+)?(?:a\s+)?contact/i,
      /^(?:remember|save)\s+(?:this\s+)?person/i,
      /^add\s+(?:them|him|her)\s+to\s+(?:my\s+)?contacts/i,
      /^(?:new\s+)?contact\s+for\s+(.+)/i,
      // "my [relationship]'s number/phone is [number]"
      /^my\s+(\w+(?:'s)?)\s+(?:phone\s+)?number\s+is\s+(.+)/i,
      // "[relationship]'s number is [number]" (e.g., "mom's number is 555-1234")
      /^(\w+)(?:'s)?\s+(?:phone\s+)?number\s+is\s+(.+)/i,
      // "save/remember my [relationship]'s number"
      /^(?:save|remember)\s+(?:my\s+)?(\w+)(?:'s)?\s+(?:phone\s+)?number/i,
      // "my [relationship] is [number]" (informal)
      /^my\s+(\w+)(?:'s)?\s+(?:phone|number|cell)\s+is\s+(.+)/i,
    ],
    keywords: [
      { word: 'add', weight: 0.8 },
      { word: 'save', weight: 0.8 },
      { word: 'contact', weight: 1.0 },
      { word: 'new', weight: 0.6 },
      { word: 'create', weight: 0.7 },
      { word: 'person', weight: 0.5 },
      // Family/relationship keywords
      { word: 'mom', weight: 0.9 },
      { word: 'dad', weight: 0.9 },
      { word: 'mother', weight: 0.9 },
      { word: 'father', weight: 0.9 },
      { word: 'sister', weight: 0.9 },
      { word: 'brother', weight: 0.9 },
      { word: 'wife', weight: 0.9 },
      { word: 'husband', weight: 0.9 },
      { word: 'number', weight: 0.7 },
      { word: 'phone', weight: 0.7 },
    ],
    antiKeywords: ['call', 'text', 'email', 'message', 'what', 'who', 'list', 'show'],
  },

  examples: [
    'Add John to my contacts',
    'Save Sarah as a contact',
    'Create a new contact for Mike',
    'Add them to my contacts',
    "Remember this person - it's my neighbor Tom",
    'New contact: Jane Doe, jane@email.com',
    // Family number examples
    "My mom's number is 555-123-4567",
    "My dad's phone number is 555-987-6543",
    "Save my sister's number: 555-111-2222",
    "Mom's number is 555-333-4444",
  ],

  counterExamples: [
    'Call my contact John',
    'Text Sarah',
    'Who are my contacts?',
    'List all contacts',
    "What's John's phone number?",
  ],

  arguments: [
    {
      name: 'name',
      type: 'string',
      description: 'Name of the contact (can be a relationship like "mom" or a proper name)',
      required: true,
      extractionPatterns: [
        /add\s+(.+?)\s+(?:to|as)/i,
        /save\s+(.+?)\s+(?:to|as)/i,
        /contact\s+(?:for|named?)\s+(.+)/i,
        // Extract relationship from "my [relationship]'s number is" patterns
        /^my\s+(\w+?)(?:'s)?\s+(?:phone\s+)?number\s+is/i,
        /^(\w+?)(?:'s)?\s+(?:phone\s+)?number\s+is/i,
        /^(?:save|remember)\s+(?:my\s+)?(\w+?)(?:'s)?\s+(?:phone\s+)?number/i,
      ],
      entityType: 'person',
    },
    {
      name: 'phone',
      type: 'string',
      description: 'Phone number',
      required: false,
      extractionPatterns: [
        // "number is 555-123-4567"
        /number\s+is\s+([0-9\-\(\)\s\+\.]+)/i,
        // "phone is 555-123-4567"
        /phone\s+is\s+([0-9\-\(\)\s\+\.]+)/i,
        // ": 555-123-4567" (after colon)
        /:\s*([0-9\-\(\)\s\+\.]+)/i,
        // Standalone phone number at end
        /\s([0-9]{3}[\-\.\s]?[0-9]{3}[\-\.\s]?[0-9]{4})$/i,
      ],
    },
    {
      name: 'relationship',
      type: 'string',
      description: 'Relationship type',
      required: false,
      enumValues: ['family', 'friend', 'colleague', 'acquaintance', 'professional', 'other'],
      extractionPatterns: [
        /(?:my|as\s+(?:a|my))\s+(friend|colleague|family|boss|coworker)/i,
        // Auto-detect family relationships
        /\b(mom|dad|mother|father|sister|brother|wife|husband|aunt|uncle|grandma|grandpa|grandmother|grandfather)\b/i,
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
      toolId: 'saveContact',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// GET CONTACT INFO
// ============================================================================

export const getContactInfoTool: SemanticToolDefinition = {
  id: 'contact_info',
  name: 'Get Contact Info',
  description: 'Get detailed information about a specific contact.',
  shortDescription: 'look up a contact',
  category: 'communication',

  triggers: {
    phrases: [
      "what's their number",
      "what's their email",
      'tell me about',
      'contact info for',
      'what do you know about',
      'who is',
      'look up',
      "what's the info on",
    ],
    patterns: [
      /^(?:what(?:'s| is)|get|show)\s+(?:the\s+)?(?:info|information|details)\s+(?:for|about|on)\s+(.+)/i,
      /^(?:what(?:'s| is))\s+(.+?)(?:'s)?\s+(?:phone|number|email|address)/i,
      /^(?:tell\s+me\s+about|who\s+is)\s+(.+)/i,
      /^look\s+up\s+(.+)/i,
      /^(?:contact|info)\s+(?:for|on)\s+(.+)/i,
    ],
    keywords: [
      { word: 'info', weight: 0.9 },
      { word: 'number', weight: 0.8 },
      { word: 'email', weight: 0.8 },
      { word: 'contact', weight: 0.7 },
      { word: 'lookup', weight: 0.9 },
      { word: 'details', weight: 0.8 },
    ],
    antiKeywords: ['add', 'save', 'create', 'call', 'text', 'message', 'all', 'list'],
  },

  examples: [
    "What's John's phone number?",
    'Tell me about Sarah',
    "What's the email for Mike?",
    'Look up my colleague Jane',
    'Contact info for the dentist',
    'Who is Dr. Smith?',
  ],

  counterExamples: [
    'Add a contact',
    'Call John',
    'Text Sarah',
    'List all my contacts',
    'Who needs attention?',
  ],

  arguments: [
    {
      name: 'name',
      type: 'string',
      description: 'Name or identifier of the contact',
      required: true,
      extractionPatterns: [
        /(?:info|details)\s+(?:for|about|on)\s+(.+)/i,
        /(?:about|is)\s+(.+)/i,
        /look\s+up\s+(.+)/i,
        /(.+?)(?:'s)?\s+(?:phone|email|number)/i,
      ],
      entityType: 'person',
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
      toolId: 'getContactInfo',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// LIST CONTACTS / CONTACTS NEEDING ATTENTION
// ============================================================================

export const listContactsTool: SemanticToolDefinition = {
  id: 'contact_list',
  name: 'List Contacts',
  description: 'List contacts or see who needs attention.',
  shortDescription: 'list contacts',
  category: 'communication',

  triggers: {
    phrases: [
      'list my contacts',
      'show my contacts',
      'who are my contacts',
      'all contacts',
      'my contacts',
      'who needs attention',
      "who haven't I talked to",
      'who should I reach out to',
    ],
    patterns: [
      /^(?:list|show|display|get)\s+(?:all\s+)?(?:my\s+)?contacts/i,
      /^who\s+(?:are|is)\s+(?:in\s+)?my\s+contacts/i,
      /^(?:my|all)\s+contacts/i,
      /^who\s+(?:needs|need)\s+(?:my\s+)?attention/i,
      /^who\s+(?:should|do)\s+i\s+(?:reach\s+out\s+to|contact|call)/i,
      /^who\s+(?:haven(?:'t|'t)|have\s+not)\s+i\s+(?:talked|spoken|reached)/i,
    ],
    keywords: [
      { word: 'list', weight: 0.9 },
      { word: 'contacts', weight: 1.0 },
      { word: 'show', weight: 0.8 },
      { word: 'all', weight: 0.6 },
      { word: 'attention', weight: 0.8 },
      { word: 'reach', weight: 0.7 },
    ],
    antiKeywords: ['add', 'save', 'call', 'text', 'email', "what's", 'specific'],
  },

  examples: [
    'List my contacts',
    'Show all my contacts',
    'Who are my contacts?',
    'Who needs attention?',
    "Who haven't I talked to lately?",
    'Who should I reach out to?',
  ],

  counterExamples: ['Add a contact', "What's John's number?", 'Call Sarah', 'Tell me about Mike'],

  arguments: [
    {
      name: 'filter',
      type: 'string',
      description: 'Filter type for contacts',
      required: false,
      enumValues: ['all', 'attention', 'family', 'friends', 'colleagues'],
      extractionPatterns: [/needs?\s+(attention)/i, /my\s+(family|friends|colleagues)/i],
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
    // Route to appropriate tool based on filter
    const filter = args.filter as string | undefined;
    if (filter === 'attention') {
      return {
        success: true,
        toolId: 'getContactsNeedingAttention',
        args,
        delegateTo: 'domains/communication',
      };
    }
    return {
      success: true,
      toolId: 'getContactInsights',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// RECORD INTERACTION
// ============================================================================

export const recordInteractionTool: SemanticToolDefinition = {
  id: 'contact_interaction',
  name: 'Record Contact Interaction',
  description: 'Log an interaction with a contact - calls, messages, meetings, gifts, etc.',
  shortDescription: 'log an interaction',
  category: 'communication',

  triggers: {
    phrases: [
      'i just talked to',
      'i met with',
      'i called',
      'i texted',
      'i had lunch with',
      'i sent a gift to',
      'i received a gift from',
      'log a call with',
      'record that i',
      'we had dinner',
    ],
    patterns: [
      /^(?:i\s+)?(?:just\s+)?(?:talked|spoke|chatted)\s+(?:to|with)\s+(.+)/i,
      /^(?:i\s+)?(?:met|hung\s+out)\s+with\s+(.+)/i,
      /^(?:i\s+)?(?:called|texted|emailed)\s+(.+)/i,
      /^(?:i\s+)?(?:had\s+)?(?:lunch|dinner|coffee|drinks)\s+with\s+(.+)/i,
      /^(?:i\s+)?(?:sent|gave)\s+(?:a\s+)?(?:gift|card)\s+to\s+(.+)/i,
      /^(?:i\s+)?(?:received|got)\s+(?:a\s+)?(?:gift|card)\s+from\s+(.+)/i,
      /^(?:log|record)\s+(?:a\s+)?(?:call|meeting|hangout)\s+with\s+(.+)/i,
      /^(?:we\s+)?had\s+(?:a\s+)?(?:meeting|lunch|dinner|call)\s+(?:with\s+)?(.+)?/i,
    ],
    keywords: [
      { word: 'talked', weight: 0.9 },
      { word: 'called', weight: 0.9 },
      { word: 'texted', weight: 0.9 },
      { word: 'met', weight: 0.9 },
      { word: 'lunch', weight: 0.8 },
      { word: 'dinner', weight: 0.8 },
      { word: 'gift', weight: 0.8 },
      { word: 'log', weight: 0.9 },
      { word: 'record', weight: 0.9 },
    ],
    antiKeywords: ['want', 'should', 'need', 'reminder', 'follow'],
  },

  examples: [
    'I just talked to John',
    'I had lunch with Sarah yesterday',
    'I called my mom',
    'I sent a gift to Mike',
    'Log a meeting with Jane',
    'We had coffee this morning',
    'I texted my sister',
  ],

  counterExamples: [
    'I should call John',
    'Remind me to text Sarah',
    'I need to follow up with Mike',
    'Set a follow-up with Jane',
  ],

  arguments: [
    {
      name: 'contactName',
      type: 'string',
      description: 'Name of the contact',
      required: true,
      extractionPatterns: [
        /(?:with|to|from)\s+(.+?)(?:\s+(?:yesterday|today|this))?$/i,
        /(?:called|texted|emailed)\s+(.+?)(?:\s+(?:yesterday|today))?$/i,
      ],
      entityType: 'person',
    },
    {
      name: 'type',
      type: 'string',
      description: 'Type of interaction',
      required: false,
      enumValues: [
        'call',
        'text',
        'email',
        'meeting',
        'lunch',
        'dinner',
        'coffee',
        'gift_given',
        'gift_received',
      ],
      extractionPatterns: [
        /(?:had\s+)?(lunch|dinner|coffee|meeting)/i,
        /(called|texted|emailed)/i,
        /(?:sent|gave)\s+(?:a\s+)?gift/i,
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
      toolId: 'recordContactInteraction',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// SET FOLLOW-UP
// ============================================================================

export const setFollowUpTool: SemanticToolDefinition = {
  id: 'contact_followup_set',
  name: 'Set Contact Follow-up',
  description: 'Set a follow-up reminder for a contact.',
  shortDescription: 'set a follow-up',
  category: 'communication',

  triggers: {
    phrases: [
      'remind me to call',
      'remind me to text',
      'remind me to reach out to',
      'follow up with',
      'set a follow-up',
      'i need to call',
      'i should text',
      'check in with',
    ],
    patterns: [
      /^remind\s+me\s+to\s+(?:call|text|email|reach\s+out\s+to|contact)\s+(.+)/i,
      /^(?:set\s+)?(?:a\s+)?follow[\s-]?up\s+with\s+(.+)/i,
      /^(?:i\s+)?(?:need|should|want)\s+to\s+(?:call|text|reach\s+out\s+to)\s+(.+)/i,
      /^check\s+in\s+with\s+(.+)/i,
      /^don(?:'t|ot)\s+let\s+me\s+forget\s+to\s+(?:call|text|contact)\s+(.+)/i,
    ],
    keywords: [
      { word: 'remind', weight: 1.0 },
      { word: 'follow-up', weight: 1.0 },
      { word: 'followup', weight: 1.0 },
      { word: 'check in', weight: 0.9 },
      { word: 'need to', weight: 0.7 },
      { word: 'should', weight: 0.6 },
    ],
    antiKeywords: ['just', 'talked', 'met', 'called', 'texted', 'complete', 'done'],
  },

  examples: [
    'Remind me to call John next week',
    'Follow up with Sarah about the project',
    'I need to text Mike tomorrow',
    'Set a follow-up with my boss',
    "Check in with mom - it's been a while",
    "Don't let me forget to reach out to Jane",
  ],

  counterExamples: [
    'I just called John',
    'I talked to Sarah today',
    "I'm done following up with Mike",
    'Complete the follow-up with Jane',
  ],

  arguments: [
    {
      name: 'contactName',
      type: 'string',
      description: 'Name of the contact',
      required: true,
      extractionPatterns: [
        /(?:call|text|email|contact|reach\s+out\s+to)\s+(.+?)(?:\s+(?:next|tomorrow|about))?$/i,
        /follow[\s-]?up\s+with\s+(.+?)(?:\s+about)?/i,
        /check\s+in\s+with\s+(.+)/i,
      ],
      entityType: 'person',
    },
    {
      name: 'reason',
      type: 'string',
      description: 'Reason for follow-up',
      required: false,
      extractionPatterns: [/about\s+(?:the\s+)?(.+)/i],
    },
    {
      name: 'dueDate',
      type: 'string',
      description: 'When to follow up',
      required: false,
      extractionPatterns: [/(tomorrow|next\s+week|in\s+\d+\s+days?|monday|tuesday|wednesday)/i],
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
      toolId: 'setContactFollowUp',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// COMPLETE FOLLOW-UP
// ============================================================================

export const completeFollowUpTool: SemanticToolDefinition = {
  id: 'contact_followup_complete',
  name: 'Complete Contact Follow-up',
  description: 'Mark a follow-up as completed.',
  shortDescription: 'complete a follow-up',
  category: 'communication',

  triggers: {
    phrases: [
      'completed the follow-up',
      'done following up',
      'followed up with',
      'finished checking in',
      'mark follow-up complete',
      'i reached out to',
    ],
    patterns: [
      /^(?:i\s+)?(?:completed|finished|done\s+with)\s+(?:the\s+)?follow[\s-]?up\s+(?:with\s+)?(.+)?/i,
      /^(?:i\s+)?followed\s+up\s+with\s+(.+)/i,
      /^mark\s+(?:the\s+)?follow[\s-]?up\s+(?:with\s+)?(.+?)?\s*(?:as\s+)?(?:complete|done)/i,
      /^(?:i\s+)?(?:finally\s+)?(?:reached\s+out|got\s+in\s+touch)\s+(?:to|with)\s+(.+)/i,
    ],
    keywords: [
      { word: 'complete', weight: 1.0 },
      { word: 'done', weight: 0.9 },
      { word: 'finished', weight: 0.9 },
      { word: 'followed up', weight: 1.0 },
      { word: 'reached out', weight: 0.8 },
    ],
    antiKeywords: ['remind', 'need to', 'should', 'set', 'want to'],
  },

  examples: [
    'I followed up with John',
    'Mark the follow-up with Sarah as complete',
    'Done following up with Mike',
    'I finally reached out to Jane',
    'Completed my check-in with mom',
  ],

  counterExamples: [
    'Remind me to follow up with John',
    'I need to reach out to Sarah',
    'Set a follow-up with Mike',
  ],

  arguments: [
    {
      name: 'contactName',
      type: 'string',
      description: 'Name of the contact',
      required: true,
      extractionPatterns: [
        /follow[\s-]?up\s+(?:with\s+)?(.+?)(?:\s+as)?$/i,
        /(?:reached\s+out|got\s+in\s+touch)\s+(?:to|with)\s+(.+)/i,
      ],
      entityType: 'person',
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
      toolId: 'completeContactFollowUp',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// GET INTERACTION HISTORY
// ============================================================================

export const getInteractionHistoryTool: SemanticToolDefinition = {
  id: 'contact_history',
  name: 'Get Contact History',
  description: 'View the history of interactions with a contact.',
  shortDescription: 'view contact history',
  category: 'communication',

  triggers: {
    phrases: [
      'history with',
      'when did I last',
      'last time I talked to',
      'interaction history',
      'timeline with',
      'our conversations',
      'when we last',
    ],
    patterns: [
      /^(?:show|get|what(?:'s| is))\s+(?:the\s+)?(?:history|timeline)\s+(?:with|for)\s+(.+)/i,
      /^when\s+(?:did|was)\s+(?:the\s+)?last\s+time\s+(?:i|we)\s+(?:talked|spoke|met)\s+(?:to|with)?\s*(.+)?/i,
      /^(?:our|my)\s+(?:conversation|interaction)\s+history\s+with\s+(.+)/i,
      /^when\s+(?:did\s+)?(?:i|we)\s+last\s+(?:talk|speak|meet)\s+(?:to|with)\s+(.+)/i,
    ],
    keywords: [
      { word: 'history', weight: 1.0 },
      { word: 'timeline', weight: 0.9 },
      { word: 'last', weight: 0.8 },
      { word: 'when', weight: 0.7 },
      { word: 'interactions', weight: 0.9 },
      { word: 'conversations', weight: 0.8 },
    ],
    antiKeywords: ['add', 'save', 'call', 'text', 'remind'],
  },

  examples: [
    'Show my history with John',
    'When did I last talk to Sarah?',
    'Interaction timeline with Mike',
    'Our conversation history with Jane',
    'When was the last time we met?',
  ],

  counterExamples: ['Add a contact', 'Call John', 'Remind me to text Sarah'],

  arguments: [
    {
      name: 'contactName',
      type: 'string',
      description: 'Name of the contact',
      required: true,
      extractionPatterns: [
        /(?:history|timeline)\s+(?:with|for)\s+(.+)/i,
        /(?:talk|spoke|met)\s+(?:to|with)\s+(.+)/i,
      ],
      entityType: 'person',
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
      toolId: 'getContactInteractionHistory',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// GET CONTACT STATS / INSIGHTS
// ============================================================================

export const getContactStatsTool: SemanticToolDefinition = {
  id: 'contact_stats',
  name: 'Get Contact Stats',
  description: 'Get relationship insights and statistics for a contact.',
  shortDescription: 'relationship stats',
  category: 'communication',

  triggers: {
    phrases: [
      'relationship with',
      'how is my relationship',
      'stats for',
      'insights about',
      'how often do I',
      'patterns with',
    ],
    patterns: [
      /^(?:how\s+is\s+)?(?:my\s+)?relationship\s+with\s+(.+)/i,
      /^(?:get|show)\s+(?:relationship\s+)?(?:stats|insights)\s+(?:for|about)\s+(.+)/i,
      /^how\s+often\s+do\s+(?:i|we)\s+(?:talk|connect|interact)\s+(?:with\s+)?(.+)?/i,
      /^(?:analyze|understand)\s+(?:my\s+)?(?:relationship|connection)\s+with\s+(.+)/i,
    ],
    keywords: [
      { word: 'relationship', weight: 1.0 },
      { word: 'stats', weight: 0.9 },
      { word: 'insights', weight: 0.9 },
      { word: 'patterns', weight: 0.8 },
      { word: 'often', weight: 0.7 },
      { word: 'analyze', weight: 0.8 },
    ],
    antiKeywords: ['add', 'save', 'call', 'text', 'remind', 'history'],
  },

  examples: [
    'How is my relationship with John?',
    'Get stats for Sarah',
    'Insights about my connection with Mike',
    'How often do I talk to Jane?',
    'Analyze my relationship with my sister',
  ],

  counterExamples: ['History with John', 'Add a contact', 'Remind me to call Sarah'],

  arguments: [
    {
      name: 'contactName',
      type: 'string',
      description: 'Name of the contact',
      required: true,
      extractionPatterns: [
        /(?:relationship|connection)\s+with\s+(.+)/i,
        /(?:stats|insights)\s+(?:for|about)\s+(.+)/i,
        /(?:talk|connect)\s+(?:with\s+)?(.+)/i,
      ],
      entityType: 'person',
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
      toolId: 'getContactStats',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// RELATIONSHIP INSIGHTS (GENERAL)
// ============================================================================

export const getRelationshipInsightsTool: SemanticToolDefinition = {
  id: 'contact_insights',
  name: 'Get Relationship Insights',
  description: 'Get overall relationship insights - who needs attention, overdue follow-ups.',
  shortDescription: 'relationship insights',
  category: 'communication',

  triggers: {
    phrases: [
      'relationship insights',
      'who needs attention',
      'overdue follow-ups',
      'neglected relationships',
      'relationship health',
      'who am I neglecting',
    ],
    patterns: [
      /^(?:get|show|what\s+are)\s+(?:my\s+)?relationship\s+insights/i,
      /^who\s+(?:needs|need)\s+(?:my\s+)?attention/i,
      /^(?:any\s+)?overdue\s+follow[\s-]?ups/i,
      /^who\s+(?:am\s+i|have\s+i\s+been)\s+neglecting/i,
      /^(?:how\s+are\s+)?my\s+relationships?\s+(?:doing|health)/i,
    ],
    keywords: [
      { word: 'insights', weight: 1.0 },
      { word: 'attention', weight: 0.9 },
      { word: 'overdue', weight: 0.9 },
      { word: 'neglecting', weight: 0.8 },
      { word: 'relationships', weight: 0.8 },
      { word: 'health', weight: 0.7 },
    ],
    antiKeywords: ['specific', 'john', 'sarah', 'add', 'save'],
  },

  examples: [
    'Give me relationship insights',
    'Who needs my attention?',
    'Any overdue follow-ups?',
    'Who am I neglecting?',
    'How are my relationships doing?',
    'Relationship health check',
  ],

  counterExamples: [
    'How is my relationship with John?',
    "What's Sarah's email?",
    'Add a new contact',
  ],

  arguments: [],

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
      toolId: 'getContactInsights',
      args,
      delegateTo: 'domains/communication',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const contactsTools: SemanticToolDefinition[] = [
  saveContactTool,
  getContactInfoTool,
  listContactsTool,
  recordInteractionTool,
  setFollowUpTool,
  completeFollowUpTool,
  getInteractionHistoryTool,
  getContactStatsTool,
  getRelationshipInsightsTool,
];
