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
// EXPORT ALL HANDOFF TOOLS
// ============================================================================

export const handoffTools: SemanticToolDefinition[] = [handoffTool, habitHelpTool];
