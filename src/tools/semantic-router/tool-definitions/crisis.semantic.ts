/**
 * Crisis Tool Definitions for Semantic Router
 *
 * SAFETY-CRITICAL: Routes urgent mental health and crisis queries
 * to appropriate support resources and personas.
 *
 * @module tools/semantic-router/tool-definitions/crisis
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// CRISIS SUPPORT - IMMEDIATE HELP (Routes to domains/crisis)
// ============================================================================

export const crisisSupportTool: SemanticToolDefinition = {
  id: 'crisis_support',
  name: 'Crisis Support',
  description: 'Provide immediate crisis support resources and compassionate response.',
  shortDescription: 'get crisis help',
  category: 'crisis',
  priority: 100, // SAFETY-CRITICAL: Always prioritize crisis detection

  triggers: {
    phrases: [
      "i'm in crisis",
      'i need help',
      'i want to hurt myself',
      'i want to die',
      "i can't go on",
      "i don't want to live",
      'thinking about suicide',
      'suicidal thoughts',
      'end my life',
      'kill myself',
      "i'm not okay",
      'i need someone',
      'emergency',
      'urgent help',
    ],
    patterns: [
      /^i(?:'m| am)?\s+(?:in\s+)?(?:a\s+)?crisis/i,
      /^i\s+(?:want|need)\s+to\s+(?:hurt|harm)\s+(?:myself|me)/i,
      /^i\s+(?:want|wish)\s+(?:i\s+was|to\s+be)\s+dead/i,
      /^(?:thinking|thought)\s+(?:about|of)\s+(?:suicide|ending|killing)/i,
      /^i\s+(?:can(?:'t|not)|don(?:'t| not))\s+(?:go\s+on|take\s+it|handle)/i,
      /^(?:i\s+)?need\s+(?:help|someone)\s+(?:right\s+)?now/i,
      /^(?:i(?:'m| am)?\s+)?(?:not\s+)?(?:okay|ok|alright)/i,
    ],
    keywords: [
      { word: 'crisis', weight: 1.0 },
      { word: 'suicide', weight: 1.0 },
      { word: 'suicidal', weight: 1.0 },
      { word: 'hurt myself', weight: 1.0 },
      { word: 'kill myself', weight: 1.0 },
      { word: 'die', weight: 0.8 },
      { word: 'dead', weight: 0.8 },
      { word: 'emergency', weight: 0.9 },
      { word: 'urgent', weight: 0.7 },
      { word: "can't go on", weight: 0.9 },
      { word: 'end it', weight: 0.9 },
      { word: 'harm', weight: 0.8 },
    ],
    antiKeywords: [], // Never deprioritize crisis signals
  },

  examples: [
    "I'm in crisis right now",
    "I'm having suicidal thoughts",
    'I need help immediately',
    "I don't want to live anymore",
    "I can't take it anymore",
    'I want to hurt myself',
    "I'm not okay",
    'I need someone to talk to urgently',
  ],

  counterExamples: ["I'm feeling a bit down", 'Having a rough day', 'Work is stressful'],

  arguments: [
    {
      name: 'urgencyLevel',
      type: 'string',
      description: 'Detected urgency level',
      required: false,
      enumValues: ['immediate', 'high', 'moderate'],
    },
  ],

  confidence: {
    baseScore: 0.95, // High base score - prioritize safety
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.0,
    negativeKeywordPenalty: 0.0, // Never penalize
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'crisisSupport',
      args: { urgencyLevel: 'immediate', ...args },
      delegateTo: 'domains/crisis',
    };
  },
};

// ============================================================================
// HUMAN TRANSFER TOOLS (Routes to domains/human-transfer)
// ============================================================================

/**
 * Evaluate Human Transfer - Assesses if user needs professional help
 * SAFETY-CRITICAL: Routes to human-transfer domain for professional escalation
 */
export const evaluateHumanTransferTool: SemanticToolDefinition = {
  id: 'evaluate_human_transfer',
  name: 'Evaluate Human Transfer',
  description: 'Assess if the user would benefit from connecting with a human professional.',
  shortDescription: 'evaluate need for professional help',
  category: 'crisis',
  priority: 98, // Just below immediate crisis - evaluates transfer need

  triggers: {
    phrases: [
      'i need a therapist',
      'i need professional help',
      'i should see someone',
      'i need to talk to a real person',
      'this is beyond what you can help with',
      "i've been depressed for months",
      "i've been struggling for weeks",
      'i think i need real help',
      'can you connect me with someone',
      'i need a counselor',
      'i should see a doctor',
      'i need psychiatric help',
    ],
    patterns: [
      /^i\s+(?:think\s+)?(?:i\s+)?need\s+(?:a\s+)?(?:real\s+)?(?:therapist|counselor|psychiatrist|professional)/i,
      /^(?:i've|i have)\s+been\s+(?:depressed|anxious|struggling)\s+for\s+(?:weeks|months|a\s+long\s+time)/i,
      /^(?:can|could)\s+you\s+(?:help\s+me\s+)?(?:find|connect|refer)\s+(?:me\s+to\s+)?(?:a\s+)?(?:therapist|professional)/i,
      /^i\s+(?:should|need\s+to)\s+(?:see|talk\s+to)\s+(?:a\s+)?(?:doctor|professional|someone\s+real)/i,
    ],
    keywords: [
      { word: 'therapist', weight: 1.0 },
      { word: 'counselor', weight: 1.0 },
      { word: 'psychiatrist', weight: 1.0 },
      { word: 'professional help', weight: 1.0 },
      { word: 'real person', weight: 0.9 },
      { word: 'doctor', weight: 0.7 },
      { word: 'struggling for', weight: 0.8 },
      { word: 'depressed for months', weight: 0.9 },
      { word: 'beyond', weight: 0.6 },
      { word: 'refer', weight: 0.8 },
    ],
    antiKeywords: [], // Never deprioritize professional help requests
  },

  examples: [
    'I think I need to see a therapist',
    "I've been depressed for months",
    'Can you help me find a counselor?',
    'I need professional help',
    'This is beyond what I think you can help with',
    'I should talk to a real person about this',
    "I've been struggling for weeks and need professional support",
  ],

  counterExamples: [
    "I'm feeling a bit stressed today",
    'Work has been busy lately',
    'Having a rough week',
  ],

  arguments: [
    {
      name: 'userStatement',
      type: 'string',
      description: 'What the user said that triggered evaluation',
      required: true,
    },
    {
      name: 'context',
      type: 'string',
      description: 'Additional conversation context',
      required: false,
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.08,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.0, // Never penalize
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'evaluateHumanTransfer',
      args,
      delegateTo: 'domains/human-transfer',
    };
  },
};

/**
 * Quick Crisis Resources - Immediate resources for acute crisis
 * SAFETY-CRITICAL: Provides 988, DV hotline, etc.
 */
export const quickCrisisResourcesTool: SemanticToolDefinition = {
  id: 'quick_crisis_resources',
  name: 'Quick Crisis Resources',
  description: 'Provide immediate crisis resources like 988, DV hotline, etc.',
  shortDescription: 'crisis resources',
  category: 'crisis',
  priority: 99, // Very high - just below immediate crisis

  triggers: {
    phrases: [
      'give me crisis resources',
      'what number can i call',
      'hotline number',
      'crisis line',
      'suicide hotline',
      'dv hotline',
      'domestic violence hotline',
      'abuse hotline',
      'who can i call',
      'emergency resources',
      '988',
      'crisis text line',
    ],
    patterns: [
      /^(?:what(?:'s| is)\s+(?:the\s+)?)?(?:crisis|suicide|dv|abuse)\s+(?:hotline|line|number)/i,
      /^(?:give|get)\s+(?:me\s+)?(?:crisis|emergency)\s+(?:resources|numbers|contacts)/i,
      /^(?:i\s+need|where\s+can\s+i\s+(?:find|get)|what(?:'s| is))\s+(?:the\s+)?(?:number|hotline)\s+(?:for|to\s+call)/i,
      /^(?:who|what)\s+can\s+i\s+call\s+(?:right\s+now|in\s+an\s+emergency)/i,
    ],
    keywords: [
      { word: 'crisis hotline', weight: 1.0 },
      { word: 'suicide hotline', weight: 1.0 },
      { word: '988', weight: 1.0 },
      { word: 'crisis line', weight: 1.0 },
      { word: 'dv hotline', weight: 1.0 },
      { word: 'domestic violence', weight: 0.9 },
      { word: 'abuse hotline', weight: 0.9 },
      { word: 'emergency resources', weight: 0.8 },
      { word: 'who can i call', weight: 0.8 },
    ],
    antiKeywords: [], // Never deprioritize crisis resources
  },

  examples: [
    "What's the suicide hotline number?",
    'Give me crisis resources',
    'What is 988?',
    'I need the domestic violence hotline',
    'Who can I call right now?',
    'Crisis line number',
    'Emergency resources please',
  ],

  counterExamples: ['Customer service hotline', 'Tech support number', 'Restaurant phone number'],

  arguments: [
    {
      name: 'situation',
      type: 'string',
      description: 'Type of crisis situation',
      required: false,
      enumValues: [
        'suicidal-thoughts',
        'self-harm',
        'domestic-violence',
        'mental-health',
        'substance-abuse',
        'general-crisis',
      ],
    },
  ],

  confidence: {
    baseScore: 0.92,
    patternMatchBonus: 0.06,
    keywordDensityMultiplier: 1.0,
    negativeKeywordPenalty: 0.0, // Never penalize
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'quickCrisisResources',
      args,
      delegateTo: 'domains/human-transfer',
    };
  },
};

/**
 * Connect to Human Expert - Warm handoff to professional
 * SAFETY-CRITICAL: Connects user to therapist, legal, financial, or medical help
 */
export const connectToHumanExpertTool: SemanticToolDefinition = {
  id: 'connect_to_human_expert',
  name: 'Connect to Human Expert',
  description: 'Initiate warm handoff to a human professional.',
  shortDescription: 'connect to professional',
  category: 'crisis',
  priority: 95, // High priority but after evaluation

  triggers: {
    phrases: [
      'connect me to a therapist',
      'find me a counselor',
      'help me find a doctor',
      'i want to speak to someone',
      'transfer me to a professional',
      'get me professional help',
      'help me schedule with a therapist',
      'find me a lawyer',
      'connect me with legal help',
      'i need financial advice',
    ],
    patterns: [
      /^(?:connect|transfer|refer)\s+me\s+(?:to|with)\s+(?:a\s+)?(?:therapist|counselor|professional|doctor|lawyer)/i,
      /^(?:find|get|help\s+me\s+(?:find|get))\s+(?:me\s+)?(?:a\s+)?(?:therapist|counselor|professional|doctor)/i,
      /^i\s+(?:want|need)\s+to\s+(?:speak|talk)\s+(?:to|with)\s+(?:a\s+)?(?:real\s+)?(?:person|professional|therapist)/i,
      /^(?:help\s+me\s+)?(?:schedule|book)\s+(?:with|an\s+appointment\s+with)\s+(?:a\s+)?(?:therapist|doctor)/i,
    ],
    keywords: [
      { word: 'connect me', weight: 0.9 },
      { word: 'transfer me', weight: 0.9 },
      { word: 'refer me', weight: 0.9 },
      { word: 'find me a', weight: 0.8 },
      { word: 'speak to someone', weight: 0.8 },
      { word: 'real person', weight: 0.7 },
      { word: 'schedule', weight: 0.6 },
      { word: 'appointment', weight: 0.6 },
    ],
    antiKeywords: ['chatbot'], // Might be expressing frustration with AI
  },

  examples: [
    'Connect me to a therapist',
    'Help me find a counselor',
    'I want to speak to a real person',
    'Transfer me to professional help',
    'Can you help me schedule with a doctor?',
    'Find me legal help',
    'I need to talk to someone real about this',
  ],

  counterExamples: [
    'Tell me about therapists',
    'What does a counselor do?',
    'How do I become a therapist?',
  ],

  arguments: [
    {
      name: 'transferType',
      type: 'string',
      description: 'Type of professional to connect with',
      required: true,
      enumValues: ['therapy', 'legal', 'financial', 'medical', 'crisis'],
    },
    {
      name: 'userConsent',
      type: 'string',
      description: 'Level of information sharing consent',
      required: false,
      enumValues: ['full', 'minimal', 'none'],
    },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.1,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'connectToHumanExpert',
      args,
      delegateTo: 'domains/human-transfer',
    };
  },
};

// ============================================================================
// SAFETY PLANNING
// ============================================================================

export const safetyPlanningTool: SemanticToolDefinition = {
  id: 'safety_planning',
  name: 'Safety Planning',
  description: 'Help create or review a safety plan for difficult moments.',
  shortDescription: 'safety planning help',
  category: 'crisis',

  triggers: {
    phrases: [
      'safety plan',
      'crisis plan',
      'what to do when',
      'coping strategies',
      'when i feel overwhelmed',
      'emergency contacts',
      'warning signs',
    ],
    patterns: [
      /^(?:help\s+(?:me\s+)?)?(?:create|make|build)\s+(?:a\s+)?safety\s+plan/i,
      /^(?:what|who)\s+(?:should|can)\s+i\s+(?:do|call)\s+(?:when|if)/i,
      /^(?:i\s+need|help\s+with)\s+(?:a\s+)?(?:safety|crisis|coping)\s+plan/i,
    ],
    keywords: [
      { word: 'safety plan', weight: 1.0 },
      { word: 'crisis plan', weight: 0.9 },
      { word: 'coping', weight: 0.7 },
      { word: 'emergency contacts', weight: 0.8 },
      { word: 'warning signs', weight: 0.8 },
    ],
    antiKeywords: [],
  },

  examples: [
    'Help me create a safety plan',
    'What should I do when I feel overwhelmed?',
    'I need to set up emergency contacts',
    'What are my warning signs?',
    'Review my crisis plan with me',
  ],

  counterExamples: ['Plan my weekend', 'Safety features in cars'],

  arguments: [
    {
      name: 'planType',
      type: 'string',
      description: 'Type of safety planning needed',
      required: false,
      enumValues: ['create', 'review', 'update'],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.2,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'safetyPlanning',
      args,
      delegateTo: 'domains/crisis',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const crisisTools: SemanticToolDefinition[] = [
  // Crisis domain tools (grounding, resources, de-escalation)
  crisisSupportTool,
  safetyPlanningTool,
  // Human-transfer domain tools (professional escalation)
  evaluateHumanTransferTool,
  quickCrisisResourcesTool,
  connectToHumanExpertTool,
];
