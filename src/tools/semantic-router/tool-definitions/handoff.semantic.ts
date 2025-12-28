/**
 * Handoff Tool Definitions for Semantic Router
 *
 * Tools for transferring between personas.
 *
 * @module tools/semantic-router/tool-definitions/handoff
 */

import type { SemanticToolDefinition, ToolExecutionResult } from '../types.js';

// ============================================================================
// PERSONA HANDOFF TOOL
// ============================================================================

const PERSONAS = ['maya', 'peter', 'alex', 'jordan', 'nayan', 'ferni'];

export const handoffTool: SemanticToolDefinition = {
  id: 'handoff',
  name: 'Transfer to Persona',
  description:
    'Transfers the conversation to a specific team member. Maya helps with habits, Peter with research, Alex with communication, Jordan with planning, Nayan with philosophy, and Ferni is the general life coach.',
  shortDescription: 'transfer to a team member',
  category: 'handoff',

  triggers: {
    phrases: [
      // Direct commands
      'talk to maya',
      'talk to peter',
      'talk to alex',
      'talk to jordan',
      'talk to nayan',
      'talk to ferni',
      'transfer me to',
      'hand me off to',
      'switch to',
      // Polite requests (Gemini problem phrases)
      'can I speak with',
      'could I speak with',
      'can I talk to',
      'could I talk to',
      'can you transfer me to',
      'could you transfer me to',
      'would you transfer me to',
      // Conversational
      'let me talk to',
      "i'd like to talk to",
      'i want to talk to',
      "i'd like to speak with",
      'i want to speak with',
      // Shorthand
      'get me maya',
      'get me peter',
      'connect me to',
    ],
    patterns: [
      // Direct commands
      /(?:talk|speak|transfer|hand\s*off|switch)\s+(?:me\s+)?(?:to|with)\s+(\w+)/i,
      // Polite requests (CRITICAL - Gemini problem patterns)
      /(?:can|could|would|will)\s+(?:you\s+)?(?:transfer|connect|get)\s+(?:me\s+)?(?:to\s+)?(\w+)/i,
      /(?:can|could)\s+i\s+(?:talk|speak)\s+(?:to|with)\s+(\w+)/i,
      // Desire expressions
      /let\s+me\s+(?:talk|speak)\s+(?:to|with)\s+(\w+)/i,
      /i(?:'d|\s+would)\s+like\s+to\s+(?:talk|speak)\s+(?:to|with)\s+(\w+)/i,
      /i\s+(?:want|need)\s+to\s+(?:talk|speak)\s+(?:to|with)\s+(\w+)/i,
      // Shorthand
      /(?:get|connect)\s+me\s+(?:to\s+)?(\w+)/i,
      /\b(maya|peter|alex|jordan|nayan|ferni)\b/i, // Just the name
    ],
    keywords: [
      { word: 'talk', weight: 0.7 },
      { word: 'speak', weight: 0.7 },
      { word: 'transfer', weight: 0.9 },
      { word: 'handoff', weight: 0.9 },
      { word: 'switch', weight: 0.8 },
      { word: 'maya', weight: 1.0 },
      { word: 'peter', weight: 1.0 },
      { word: 'alex', weight: 1.0 },
      { word: 'jordan', weight: 1.0 },
      { word: 'nayan', weight: 1.0 },
      // Domain keywords that suggest personas
      { word: 'habits', weight: 0.6 }, // Maya
      { word: 'routine', weight: 0.5 }, // Maya
      { word: 'research', weight: 0.6 }, // Peter
      { word: 'data', weight: 0.4 }, // Peter
      { word: 'communication', weight: 0.5 }, // Alex
      { word: 'email', weight: 0.4 }, // Alex
      { word: 'planning', weight: 0.5 }, // Jordan
      { word: 'event', weight: 0.4 }, // Jordan
      { word: 'philosophy', weight: 0.6 }, // Nayan
      { word: 'wisdom', weight: 0.5 }, // Nayan
      { word: 'meaning', weight: 0.4 }, // Nayan
    ],
  },

  examples: [
    'talk to Maya',
    'can I speak with Peter?',
    'transfer me to Alex',
    'I want to talk to Jordan about planning',
    'let me talk to Nayan',
    'switch to Ferni',
    'hand me off to Maya for habit coaching',
    "I need Peter's help with research",
    'I want to work on my habits', // Implies Maya
    'I have some planning to do', // Implies Jordan
    'I want to discuss the meaning of life', // Implies Nayan
  ],

  counterExamples: ["who's Maya?", 'tell me about the team', 'what can Peter help with?'],

  arguments: [
    {
      name: 'targetPersona',
      type: 'string',
      description: 'The persona to transfer to',
      required: true,
      enumValues: PERSONAS,
      extractionPatterns: [
        /(?:talk|speak|transfer|hand\s*off|switch)\s+(?:me\s+)?(?:to|with)\s+(\w+)/i,
        /\b(maya|peter|alex|jordan|nayan|ferni)\b/i,
      ],
    },
    {
      name: 'reason',
      type: 'string',
      description: 'Reason for the handoff',
      required: false,
      extractionPatterns: [
        /(?:about|regarding|for|to\s+(?:discuss|work\s+on|help\s+with))\s+(.+?)(?:\s+(?:with|and)|$)/i,
      ],
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    const target = ((args.targetPersona as string) || '').toLowerCase();

    if (!PERSONAS.includes(target)) {
      return {
        success: false,
        error: `Unknown persona: ${target}`,
        naturalResponse: `I'm not sure who ${target} is. Our team includes Maya, Peter, Alex, Jordan, Nayan, and Ferni.`,
      };
    }

    const greetings: Record<string, string> = {
      maya: "Connecting you with Maya, she'll help with your habits and routines.",
      peter: "Connecting you with Peter, he's great with research and data.",
      alex: "Connecting you with Alex, they're here to help with communication.",
      jordan: "Connecting you with Jordan, she'll help with planning and events.",
      nayan: 'Connecting you with Nayan, he brings wisdom and perspective.',
      ferni: "I'm Ferni, I'm right here! How can I help?",
    };

    return {
      success: true,
      data: { targetPersona: target, reason: args.reason },
      naturalResponse: greetings[target],
      speakImmediately: true,
      sideEffects: ['persona_handoff'],
    };
  },

  priority: 95, // Handoffs are important
  requiresConfirmation: false, // Don't ask, just do it
  tags: ['navigation', 'persona', 'team'],
};

// ============================================================================
// DOMAIN-BASED IMPLICIT HANDOFF
// ============================================================================

// These could be separate tools for domain-specific triggers
// that implicitly suggest a persona handoff

export const habitHelpTool: SemanticToolDefinition = {
  id: 'handoff_maya_implicit',
  name: 'Habit Help (Maya)',
  description: 'User wants help with habits or routines - suggest Maya',
  shortDescription: 'get habit coaching from Maya',
  category: 'handoff',

  triggers: {
    phrases: [
      'help with habits',
      'build a habit',
      'morning routine',
      'evening routine',
      'habit tracking',
      'start a new habit',
    ],
    patterns: [
      /\b(?:build|start|create|develop|work\s+on)\s+(?:a\s+)?(?:new\s+)?habit/i,
      /\b(?:morning|evening|daily|weekly)\s+routine/i,
      /\bhabit\s+(?:tracking|building|coaching)/i,
    ],
    keywords: [
      { word: 'habit', weight: 1.0 },
      { word: 'routine', weight: 0.9 },
      { word: 'morning', weight: 0.5 },
      { word: 'evening', weight: 0.5 },
      { word: 'daily', weight: 0.4 },
      { word: 'tracking', weight: 0.4 },
      { word: 'build', weight: 0.3 },
    ],
  },

  examples: [
    'I want to build a new habit',
    'help me with my morning routine',
    'I need to work on my habits',
    "I can't stick to my routine",
    'how do I start exercising daily',
  ],

  arguments: [
    {
      name: 'targetPersona',
      type: 'string',
      description: 'Always Maya for habit help',
      required: true,
      defaultValue: 'maya',
    },
    {
      name: 'topic',
      type: 'string',
      description: 'The habit or routine topic',
      required: false,
      extractionPatterns: [
        /(?:help\s+(?:me\s+)?with|build|start|create|work\s+on)\s+(?:a\s+)?(?:new\s+)?(.+?)(?:\s+habit|\s+routine|$)/i,
      ],
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    return {
      success: true,
      data: { targetPersona: 'maya', topic: args.topic },
      naturalResponse:
        'That sounds like something Maya would be great at helping with. Let me connect you with her.',
      speakImmediately: true,
      sideEffects: ['persona_handoff_suggested'],
    };
  },

  priority: 80,
  tags: ['navigation', 'persona', 'habits'],
};

// ============================================================================
// RESEARCH-BASED IMPLICIT HANDOFF (PETER)
// ============================================================================

export const researchHelpTool: SemanticToolDefinition = {
  id: 'handoff_peter_implicit',
  name: 'Research Help (Peter)',
  description:
    'User wants help with research, learning, or deep-diving into topics - suggest Peter',
  shortDescription: 'get research help from Peter',
  category: 'handoff',

  triggers: {
    phrases: [
      'help with research',
      'deep dive into',
      'learn about',
      'understand how',
      'find out about',
      'look into',
      'need to research',
    ],
    patterns: [
      /\b(?:research|learn\s+about|understand|deep\s+dive|look\s+into)\s+(.+)/i,
      /\b(?:how|why)\s+(?:does|do|did)\s+(.+)\s+(?:work|happen)/i,
      /\b(?:find|figure)\s+out\s+(?:about\s+)?(.+)/i,
    ],
    keywords: [
      { word: 'research', weight: 1.0 },
      { word: 'learn', weight: 0.7 },
      { word: 'understand', weight: 0.6 },
      { word: 'curious', weight: 0.7 },
      { word: 'deep dive', weight: 0.9 },
      { word: 'explore', weight: 0.6 },
      { word: 'data', weight: 0.5 },
      { word: 'analysis', weight: 0.6 },
    ],
  },

  examples: [
    'I want to research this topic',
    'help me understand how this works',
    'I need to deep dive into investing',
    "I'm curious about the stock market",
    'can you help me learn about AI',
    'I want to look into nutrition science',
  ],

  arguments: [
    {
      name: 'targetPersona',
      type: 'string',
      description: 'Always Peter for research help',
      required: true,
      defaultValue: 'peter',
    },
    {
      name: 'topic',
      type: 'string',
      description: 'The research topic',
      required: false,
      extractionPatterns: [
        /(?:research|learn\s+about|understand|deep\s+dive\s+into|look\s+into)\s+(.+?)(?:\s+for|$)/i,
      ],
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    return {
      success: true,
      data: { targetPersona: 'peter', topic: args.topic },
      naturalResponse:
        "That's right up Peter's alley - he loves going deep on topics. Let me connect you with him.",
      speakImmediately: true,
      sideEffects: ['persona_handoff_suggested'],
    };
  },

  priority: 80,
  tags: ['navigation', 'persona', 'research'],
};

// ============================================================================
// COMMUNICATION-BASED IMPLICIT HANDOFF (ALEX)
// ============================================================================

export const communicationHelpTool: SemanticToolDefinition = {
  id: 'handoff_alex_implicit',
  name: 'Communication Help (Alex)',
  description:
    'User wants help with communication, difficult conversations, or message crafting - suggest Alex',
  shortDescription: 'get communication help from Alex',
  category: 'handoff',

  triggers: {
    phrases: [
      'difficult conversation',
      'how to tell',
      'how to say',
      'need to confront',
      'set boundaries',
      'write an email',
      'draft a message',
      'communicate better',
    ],
    patterns: [
      /\bhow\s+(?:do\s+i|to|should\s+i)\s+(?:tell|say|ask|confront)\s+(.+)/i,
      /\b(?:difficult|hard|tough)\s+conversation/i,
      /\b(?:write|draft|compose)\s+(?:an?\s+)?(?:email|message|text|letter)/i,
      /\b(?:set|establish|maintain)\s+(?:a\s+)?boundar(?:y|ies)/i,
    ],
    keywords: [
      { word: 'conversation', weight: 0.8 },
      { word: 'communicate', weight: 0.9 },
      { word: 'boundaries', weight: 1.0 },
      { word: 'confront', weight: 0.9 },
      { word: 'email', weight: 0.7 },
      { word: 'message', weight: 0.6 },
      { word: 'tell them', weight: 0.8 },
      { word: 'conflict', weight: 0.8 },
    ],
  },

  examples: [
    'I need to have a difficult conversation with my boss',
    "how do I tell my friend I'm upset",
    'help me set boundaries with my family',
    'I need to write an email to my landlord',
    'how should I bring up this issue',
    'I want to communicate better with my partner',
  ],

  arguments: [
    {
      name: 'targetPersona',
      type: 'string',
      description: 'Always Alex for communication help',
      required: true,
      defaultValue: 'alex',
    },
    {
      name: 'topic',
      type: 'string',
      description: 'The communication challenge',
      required: false,
      extractionPatterns: [
        /(?:tell|say\s+to|confront|talk\s+to)\s+(?:my\s+)?(\w+)\s+(?:about|that)/i,
        /(?:email|message|text)\s+(?:to\s+)?(?:my\s+)?(\w+)/i,
      ],
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    return {
      success: true,
      data: { targetPersona: 'alex', topic: args.topic },
      naturalResponse:
        'Alex is fantastic at navigating these kinds of conversations. Let me connect you.',
      speakImmediately: true,
      sideEffects: ['persona_handoff_suggested'],
    };
  },

  priority: 80,
  tags: ['navigation', 'persona', 'communication'],
};

// ============================================================================
// PLANNING-BASED IMPLICIT HANDOFF (JORDAN)
// ============================================================================

export const planningHelpTool: SemanticToolDefinition = {
  id: 'handoff_jordan_implicit',
  name: 'Planning Help (Jordan)',
  description: 'User wants help with events, planning, travel, or milestones - suggest Jordan',
  shortDescription: 'get planning help from Jordan',
  category: 'handoff',

  triggers: {
    phrases: [
      'plan an event',
      'plan a trip',
      'plan a party',
      'organize an event',
      'wedding planning',
      'birthday party',
      'vacation planning',
      'milestone planning',
    ],
    patterns: [
      /\b(?:plan|organize|arrange)\s+(?:an?\s+)?(?:event|party|trip|vacation|wedding|celebration)/i,
      /\b(?:birthday|anniversary|graduation|retirement)\s+(?:party|celebration|event)/i,
      /\b(?:travel|trip|vacation)\s+(?:planning|to\s+\w+)/i,
    ],
    keywords: [
      { word: 'plan', weight: 0.8 },
      { word: 'event', weight: 0.9 },
      { word: 'party', weight: 0.8 },
      { word: 'trip', weight: 0.7 },
      { word: 'vacation', weight: 0.8 },
      { word: 'wedding', weight: 1.0 },
      { word: 'birthday', weight: 0.7 },
      { word: 'celebration', weight: 0.8 },
      { word: 'milestone', weight: 0.7 },
    ],
  },

  examples: [
    "I'm planning a birthday party",
    'help me plan my vacation',
    "I need to organize a friend's wedding shower",
    "I'm planning a trip to Europe",
    'help me plan a celebration',
    "it's my anniversary next month",
  ],

  arguments: [
    {
      name: 'targetPersona',
      type: 'string',
      description: 'Always Jordan for planning help',
      required: true,
      defaultValue: 'jordan',
    },
    {
      name: 'eventType',
      type: 'string',
      description: 'The type of event or plan',
      required: false,
      extractionPatterns: [
        /(?:plan(?:ning)?|organize)\s+(?:an?\s+)?(.+?)(?:\s+for|$)/i,
        /\b(wedding|birthday|trip|vacation|party|celebration|anniversary)\b/i,
      ],
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    return {
      success: true,
      data: { targetPersona: 'jordan', eventType: args.eventType },
      naturalResponse: 'Jordan is amazing at making moments special. Let me connect you with her.',
      speakImmediately: true,
      sideEffects: ['persona_handoff_suggested'],
    };
  },

  priority: 80,
  tags: ['navigation', 'persona', 'planning'],
};

// ============================================================================
// WISDOM-BASED IMPLICIT HANDOFF (NAYAN)
// ============================================================================

export const wisdomHelpTool: SemanticToolDefinition = {
  id: 'handoff_nayan_implicit',
  name: 'Wisdom & Philosophy Help (Nayan)',
  description:
    'User wants help with deep questions, meaning, philosophy, or long-term perspective - suggest Nayan',
  shortDescription: 'get wisdom and perspective from Nayan',
  category: 'handoff',

  triggers: {
    phrases: [
      'meaning of life',
      'purpose in life',
      'existential question',
      'feeling lost',
      'who am I',
      'what matters',
      'big picture',
      'long-term thinking',
      'life philosophy',
    ],
    patterns: [
      /\bwhat(?:'s|\s+is)\s+(?:the\s+)?(?:point|purpose|meaning)\s+(?:of|in)\s+(?:life|all\s+this)/i,
      /\b(?:feeling|feel)\s+(?:lost|stuck|empty|meaningless)/i,
      /\bwho\s+am\s+i/i,
      /\bwhat\s+(?:really\s+)?matters(?:\s+in\s+life)?/i,
      /\b(?:big|bigger)\s+picture/i,
    ],
    keywords: [
      { word: 'meaning', weight: 1.0 },
      { word: 'purpose', weight: 1.0 },
      { word: 'wisdom', weight: 0.9 },
      { word: 'philosophy', weight: 0.9 },
      { word: 'existential', weight: 1.0 },
      { word: 'spiritual', weight: 0.8 },
      { word: 'lost', weight: 0.6 },
      { word: 'perspective', weight: 0.7 },
      { word: 'mortality', weight: 0.9 },
      { word: 'legacy', weight: 0.8 },
    ],
  },

  examples: [
    "what's the meaning of life",
    "I'm feeling lost in life",
    'I need some perspective',
    'what really matters in the end',
    "I'm having an existential crisis",
    'I want to talk about my legacy',
    'help me see the big picture',
    "I don't know what my purpose is",
  ],

  arguments: [
    {
      name: 'targetPersona',
      type: 'string',
      description: 'Always Nayan for wisdom and philosophy',
      required: true,
      defaultValue: 'nayan',
    },
    {
      name: 'topic',
      type: 'string',
      description: 'The philosophical or existential topic',
      required: false,
      extractionPatterns: [
        /(?:meaning|purpose|point)\s+(?:of|in)\s+(.+)/i,
        /\bfeeling\s+(.+?)(?:\s+in\s+life|$)/i,
      ],
    },
  ],

  execute: async (args): Promise<ToolExecutionResult> => {
    return {
      success: true,
      data: { targetPersona: 'nayan', topic: args.topic },
      naturalResponse:
        'Nayan has a way of seeing the deeper patterns. Let me connect you with him.',
      speakImmediately: true,
      sideEffects: ['persona_handoff_suggested'],
    };
  },

  priority: 80,
  tags: ['navigation', 'persona', 'wisdom', 'philosophy'],
};

// ============================================================================
// EXPORT ALL HANDOFF TOOLS
// ============================================================================

export const handoffTools: SemanticToolDefinition[] = [
  handoffTool,
  habitHelpTool,
  researchHelpTool,
  communicationHelpTool,
  planningHelpTool,
  wisdomHelpTool,
];
