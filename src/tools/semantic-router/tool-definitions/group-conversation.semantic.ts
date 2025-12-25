/**
 * Group Conversation Tool Definitions for Semantic Router
 *
 * Tools for multi-participant voice conversations:
 * - Team Roundtables (multiple AI personas)
 * - Conference Calls (user + agent + external person via SIP)
 *
 * @module tools/semantic-router/tool-definitions/group-conversation
 */

import type {
  SemanticToolDefinition,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// START TEAM ROUNDTABLE
// ============================================================================

export const startRoundtableTool: SemanticToolDefinition = {
  id: 'startRoundtable',
  name: 'Start Team Roundtable',
  description:
    'Starts a conversation with multiple AI personas for a focused discussion. Available personas: Peter (research/finance), Maya (habits/productivity), Alex (communication/organization), Jordan (milestones/planning), Nayan (wisdom/philosophy).',
  shortDescription: 'start a team roundtable discussion',
  category: 'handoff',

  triggers: {
    phrases: [
      'start a roundtable',
      'team roundtable',
      'bring in the team',
      'group discussion',
      'talk to multiple personas',
      'roundtable discussion',
      'get everyone together',
      'multi-persona chat',
      'team meeting',
    ],
    patterns: [
      /^(?:start|begin|have)\s+(?:a\s+)?(?:team\s+)?roundtable/i,
      /^(?:bring|get)\s+(?:in\s+)?(?:the\s+)?team/i,
      /^(?:talk\s+to|chat\s+with)\s+(?:multiple|several)\s+(?:personas?|team\s+members?)/i,
      /^(?:i\s+want|let's)\s+(?:a\s+)?(?:group|team)\s+(?:discussion|chat|meeting)/i,
      /^(?:discuss|talk\s+about)\s+.+\s+with\s+(?:the\s+)?(?:whole\s+)?team/i,
      /^(?:can|could)\s+(?:i|we)\s+(?:talk|chat)\s+(?:to|with)\s+(?:peter|maya|alex|jordan|nayan)\s+and\s+/i,
    ],
    keywords: [
      { word: 'roundtable', weight: 1.0 },
      { word: 'team', weight: 0.8 },
      { word: 'discussion', weight: 0.7 },
      { word: 'group', weight: 0.7 },
      { word: 'multiple', weight: 0.6 },
      { word: 'together', weight: 0.5 },
      { word: 'personas', weight: 0.8 },
      { word: 'meeting', weight: 0.5 },
    ],
    antiKeywords: ['call', 'phone', 'invite', 'external'], // Distinguish from conference calls
  },

  examples: [
    'start a roundtable with Peter and Maya',
    'let\'s have a team discussion about my career',
    'bring in the team to discuss my finances',
    'I want to talk to Peter, Maya, and Jordan together',
    'roundtable discussion about my goals',
    'get everyone together for a chat',
    'can we do a group brainstorm',
    'discuss my relationship with the whole team',
    'team meeting about my habits',
  ],

  counterExamples: [
    'call my friend Sarah',
    'transfer to Peter',
    'invite someone to the call',
    'hang up',
    'end the conversation',
  ],

  arguments: [
    {
      name: 'personas',
      type: 'array',
      description: 'Array of persona IDs to invite',
      required: true,
      extractionPatterns: [
        /(?:with|and)\s+(peter|maya|alex|jordan|nayan)/gi,
        /(peter|maya|alex|jordan|nayan)(?:\s+(?:and|,)\s+)?(peter|maya|alex|jordan|nayan)?/gi,
      ],
      enumValues: ['peter-john', 'maya-habits', 'alex-chen', 'jordan-taylor', 'nayan-sharma'],
    },
    {
      name: 'topic',
      type: 'string',
      description: 'The topic or question to discuss',
      required: false,
      extractionPatterns: [
        /(?:about|discuss|regarding)\s+(.+?)(?:\s+with|\s*$)/i,
        /(?:talk\s+about|discuss)\s+(.+)/i,
      ],
    },
    {
      name: 'collaborationMode',
      type: 'string',
      description: 'How the personas should interact',
      required: false,
      enumValues: ['discussion', 'debate', 'brainstorm', 'interview'],
      defaultValue: 'discussion',
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    const personas = args.personas || ['peter-john', 'maya-habits'];
    const topic = args.topic;

    return {
      success: true,
      data: {
        action: 'START_ROUNDTABLE',
        personas,
        topic,
        collaborationMode: args.collaborationMode || 'discussion',
      },
      naturalResponse: `Starting a roundtable${topic ? ` about ${topic}` : ''}...`,
      speakImmediately: true,
      sideEffects: ['roundtable_started'],
    };
  },

  priority: 85,
  tags: ['group', 'roundtable', 'team', 'multi-agent'],
};

// ============================================================================
// INVITE EXTERNAL PARTICIPANT (SIP CALL)
// ============================================================================

export const inviteParticipantTool: SemanticToolDefinition = {
  id: 'inviteParticipant',
  name: 'Invite External Participant',
  description:
    'Calls someone on their phone and adds them to the current conversation via SIP dial-out.',
  shortDescription: 'invite someone to the conversation',
  category: 'telephony',

  triggers: {
    phrases: [
      'call my friend',
      'invite someone',
      'add someone to the call',
      'bring someone in',
      'conference call',
      'three-way call',
      'dial out',
      'call and connect',
    ],
    patterns: [
      /^(?:call|dial)\s+(?:my\s+)?(?:friend|mom|dad|wife|husband|partner|colleague)\s+(.+)/i,
      /^(?:invite|add|bring)\s+(.+?)\s+(?:to|into)\s+(?:the\s+)?(?:call|conversation)/i,
      /^(?:let's|can\s+we)\s+(?:call|include|add)\s+(.+)/i,
      /^(?:start|make)\s+(?:a\s+)?(?:conference|three-way|group)\s+call/i,
    ],
    keywords: [
      { word: 'call', weight: 0.8 },
      { word: 'invite', weight: 1.0 },
      { word: 'add', weight: 0.7 },
      { word: 'conference', weight: 0.9 },
      { word: 'three-way', weight: 0.9 },
      { word: 'dial', weight: 0.7 },
      { word: 'phone', weight: 0.6 },
    ],
    antiKeywords: ['roundtable', 'persona', 'team', 'peter', 'maya', 'alex', 'jordan', 'nayan'],
  },

  examples: [
    'call my friend Sarah',
    'invite John to this conversation',
    'add my mom to the call',
    'let\'s include my colleague Mike',
    'start a conference call with my partner',
    'dial my friend at 555-1234',
    'bring my wife into this chat',
    'three-way call with my dad',
  ],

  counterExamples: [
    'start a roundtable',
    'talk to Peter',
    'transfer to Maya',
    'hang up',
    'end the call',
  ],

  arguments: [
    {
      name: 'phoneNumber',
      type: 'string',
      description: 'The phone number to call',
      required: true,
      extractionPatterns: [
        /(\+?\d[\d\s\-\(\)\.]{8,})/,
        /(?:at|number)\s*[:\s]?\s*(\+?\d[\d\s\-\(\)\.]{8,})/i,
      ],
    },
    {
      name: 'name',
      type: 'string',
      description: 'The name of the person being called',
      required: true,
      entityType: 'person',
      extractionPatterns: [
        /(?:call|invite|add)\s+(?:my\s+)?(?:friend|colleague|)?\s*(\w+)/i,
        /(?:named?|called?)\s+(\w+)/i,
      ],
    },
    {
      name: 'relationship',
      type: 'string',
      description: 'How the user knows this person',
      required: false,
      extractionPatterns: [
        /my\s+(friend|mom|dad|mother|father|wife|husband|partner|colleague|coworker|boss)/i,
      ],
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    const name = args.name || 'them';
    const phoneNumber = args.phoneNumber;

    if (!phoneNumber) {
      return {
        success: false,
        error: 'Missing phone number',
        naturalResponse: `What's ${name}'s phone number?`,
        speakImmediately: true,
      };
    }

    return {
      success: true,
      data: {
        action: 'INVITE_PARTICIPANT',
        phoneNumber,
        name,
        relationship: args.relationship,
      },
      naturalResponse: `Calling ${name} now...`,
      speakImmediately: true,
      sideEffects: ['external_call_initiated'],
    };
  },

  priority: 80,
  tags: ['call', 'conference', 'sip', 'external'],
};

// ============================================================================
// END GROUP CONVERSATION
// ============================================================================

export const endGroupConversationTool: SemanticToolDefinition = {
  id: 'endGroupConversation',
  name: 'End Group Conversation',
  description:
    'Ends the current group conversation (roundtable or conference call) and returns to one-on-one mode.',
  shortDescription: 'end the group conversation',
  category: 'handoff',

  triggers: {
    phrases: [
      'end the roundtable',
      'end group conversation',
      'end the group chat',
      'dismiss the team',
      'back to just us',
      'just you and me',
      'end conference call',
      'hang up on everyone else',
      'wrap up the meeting',
    ],
    patterns: [
      /^(?:end|finish|close|wrap\s+up)\s+(?:the\s+)?(?:roundtable|group\s+conversation|team\s+chat|conference)/i,
      /^(?:dismiss|send\s+away)\s+(?:the\s+)?(?:team|others|everyone)/i,
      /^(?:back|return)\s+to\s+(?:just\s+)?(?:us|you\s+and\s+me|one-on-one)/i,
      /^(?:just|only)\s+(?:you\s+and\s+me|us\s+now)/i,
    ],
    keywords: [
      { word: 'end', weight: 0.8 },
      { word: 'finish', weight: 0.7 },
      { word: 'close', weight: 0.7 },
      { word: 'dismiss', weight: 0.8 },
      { word: 'wrap', weight: 0.6 },
      { word: 'roundtable', weight: 0.9 },
      { word: 'group', weight: 0.6 },
      { word: 'conference', weight: 0.7 },
    ],
    antiKeywords: ['start', 'begin', 'invite', 'add'],
  },

  examples: [
    'end the roundtable',
    'wrap up the team meeting',
    'dismiss the team',
    'back to just us',
    'end the conference call',
    'finish the group discussion',
    'just you and me now',
    'close the roundtable',
  ],

  counterExamples: [
    'start a roundtable',
    'invite someone',
    'add Maya to the call',
    'begin a group chat',
  ],

  arguments: [
    {
      name: 'reason',
      type: 'string',
      description: 'Why the conversation is ending',
      required: false,
      extractionPatterns: [
        /(?:because|since)\s+(.+)/i,
      ],
    },
    {
      name: 'summarize',
      type: 'boolean',
      description: 'Whether to provide a summary of the discussion',
      required: false,
      defaultValue: true,
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    return {
      success: true,
      data: {
        action: 'END_GROUP_CONVERSATION',
        summarize: args.summarize ?? true,
        reason: args.reason,
      },
      naturalResponse: args.summarize !== false
        ? "Wrapping up the conversation. Let me give everyone a quick goodbye."
        : "Ending the group conversation now.",
      speakImmediately: true,
      sideEffects: ['group_conversation_ended'],
    };
  },

  priority: 75,
  tags: ['end', 'close', 'roundtable', 'conference'],
};

// ============================================================================
// EXPORT ALL GROUP CONVERSATION TOOLS
// ============================================================================

export const groupConversationTools: SemanticToolDefinition[] = [
  startRoundtableTool,
  inviteParticipantTool,
  endGroupConversationTool,
];

