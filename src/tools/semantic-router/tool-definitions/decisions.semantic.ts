/**
 * Decisions Tool Definitions for Semantic Router
 *
 * Routes decision-making queries - help with choices, trade-offs,
 * and important life decisions.
 *
 * @module tools/semantic-router/tool-definitions/decisions
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// DECISION HELP
// ============================================================================

export const decisionHelpTool: SemanticToolDefinition = {
  id: 'decision_help',
  name: 'Decision Help',
  description: 'Help make decisions by exploring options, trade-offs, and values.',
  shortDescription: 'help me decide',
  category: 'decisions',

  triggers: {
    phrases: [
      "i can't decide",
      'help me decide',
      'should I',
      "don't know what to do",
      'torn between',
      'weighing options',
      'big decision',
      'hard choice',
      'what should I do',
    ],
    patterns: [
      /^(?:i(?:'m| am)?|i(?:'ve| have)?\s+been)\s+(?:struggling\s+(?:to|with)|(?:can(?:'t|not)))\s+decide/i,
      /^(?:help\s+me\s+)?decide\s+(?:between|whether|if)/i,
      /^should\s+i\s+(.+)\s+or\s+(.+)/i,
      /^(?:i(?:'m| am)?)\s+(?:torn|stuck)\s+(?:between|on)/i,
      /^(?:i\s+)?(?:don(?:'t| not)|can(?:'t|not))\s+(?:figure\s+out|know)\s+what\s+to\s+do/i,
    ],
    keywords: [
      { word: 'decide', weight: 1.0 },
      { word: 'decision', weight: 1.0 },
      { word: 'choice', weight: 0.9 },
      { word: 'should', weight: 0.7 },
      { word: 'torn', weight: 0.8 },
      { word: 'options', weight: 0.7 },
      { word: 'dilemma', weight: 0.9 },
    ],
    antiKeywords: [],
  },

  examples: [
    "I can't decide whether to take the job",
    'Help me decide between two apartments',
    'Should I move or stay?',
    "I'm torn between two options",
    "I don't know what to do",
    'Big decision ahead',
    'Weighing my options',
  ],

  counterExamples: ['I made a decision', 'Decision is final'],

  arguments: [
    {
      name: 'decisionType',
      type: 'string',
      description: 'Type of decision',
      required: false,
      enumValues: ['career', 'relationship', 'financial', 'life', 'daily'],
    },
    {
      name: 'options',
      type: 'string',
      description: 'Options being considered',
      required: false,
      extractionPatterns: [
        /(?:between|choosing)\s+(.+?)\s+(?:and|or)\s+(.+?)$/i,
        /should\s+i\s+(.+?)\s+or\s+(.+?)$/i,
      ],
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
      toolId: 'decisionHelp',
      args,
      delegateTo: 'domains/decisions',
    };
  },
};

// ============================================================================
// PRO/CON LIST
// ============================================================================

export const proConListTool: SemanticToolDefinition = {
  id: 'decision_procon',
  name: 'Pro/Con List',
  description: 'Create a pros and cons list to evaluate options.',
  shortDescription: 'pros and cons',
  category: 'decisions',

  triggers: {
    phrases: [
      'pros and cons',
      'make a list',
      'advantages and disadvantages',
      'weighing pros and cons',
      'evaluate options',
      'list the benefits',
    ],
    patterns: [
      /^(?:make|create|help\s+me\s+(?:make|create))\s+(?:a\s+)?(?:pros?\s+(?:and|&)\s+cons?|list)/i,
      /^(?:what\s+are\s+the)\s+(?:pros?\s+(?:and|&)\s+cons?|advantages)/i,
      /^(?:help\s+me\s+)?(?:weigh|evaluate)\s+(?:the\s+)?(?:options|pros)/i,
    ],
    keywords: [
      { word: 'pros', weight: 1.0 },
      { word: 'cons', weight: 1.0 },
      { word: 'advantages', weight: 0.9 },
      { word: 'disadvantages', weight: 0.9 },
      { word: 'benefits', weight: 0.8 },
      { word: 'drawbacks', weight: 0.8 },
      { word: 'trade-offs', weight: 0.9 },
    ],
    antiKeywords: [],
  },

  examples: [
    'Make a pros and cons list',
    'What are the pros and cons of moving?',
    'Help me weigh the advantages',
    'Evaluate the trade-offs',
    'List the benefits and drawbacks',
  ],

  counterExamples: ['I already made a list'],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      description: 'What to evaluate',
      required: false,
      extractionPatterns: [
        /(?:pros\s+(?:and|&)\s+cons\s+(?:of|for))\s+(.+?)$/i,
        /(?:evaluate|weigh)\s+(.+?)$/i,
      ],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.2,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'proConList',
      args,
      delegateTo: 'domains/decisions',
    };
  },
};

// ============================================================================
// VALUES ALIGNMENT
// ============================================================================

export const valuesAlignmentTool: SemanticToolDefinition = {
  id: 'decision_values',
  name: 'Values Alignment',
  description: 'Explore how a decision aligns with personal values and priorities.',
  shortDescription: 'check values alignment',
  category: 'decisions',

  triggers: {
    phrases: [
      'align with my values',
      "what's important to me",
      'values check',
      'what matters most',
      'priority check',
      'does this fit who I am',
      'authentic choice',
    ],
    patterns: [
      /^(?:does|will)\s+(?:this|it)\s+align\s+(?:with\s+)?(?:my\s+)?values/i,
      /^(?:what(?:'s| is)|what\s+are)\s+(?:important|matters?)\s+(?:to\s+me|most)/i,
      /^(?:help\s+me\s+)?(?:check|understand)\s+(?:my\s+)?(?:values|priorities)/i,
      /^(?:is\s+this|am\s+i)\s+(?:being\s+)?(?:true|authentic)/i,
    ],
    keywords: [
      { word: 'values', weight: 1.0 },
      { word: 'priorities', weight: 0.9 },
      { word: 'important', weight: 0.7 },
      { word: 'matters', weight: 0.7 },
      { word: 'authentic', weight: 0.8 },
      { word: 'true to', weight: 0.8 },
      { word: 'align', weight: 0.9 },
    ],
    antiKeywords: [],
  },

  examples: [
    'Does this align with my values?',
    "What's most important to me here?",
    'Help me understand my priorities',
    'Is this authentic to who I am?',
    'Values check on this decision',
    'I want to stay true to what matters',
  ],

  counterExamples: ["What's my horoscope?", 'Financial values'],

  arguments: [
    {
      name: 'context',
      type: 'string',
      description: 'Context for values check',
      required: false,
      extractionPatterns: [/values?\s+(?:check\s+)?(?:on|for|about)\s+(.+?)$/i],
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
      toolId: 'valuesAlignment',
      args,
      delegateTo: 'domains/decisions',
    };
  },
};

// ============================================================================
// REGRET MINIMIZATION
// ============================================================================

export const regretMinimizationTool: SemanticToolDefinition = {
  id: 'decision_regret',
  name: 'Regret Minimization',
  description: 'Use the regret minimization framework for big decisions.',
  shortDescription: 'minimize regret',
  category: 'decisions',

  triggers: {
    phrases: [
      'will I regret',
      'regret this',
      'look back on this',
      'when I am old',
      "what if I don't",
      'miss my chance',
      'now or never',
    ],
    patterns: [
      /^(?:will|would)\s+i\s+regret/i,
      /^(?:am|will)\s+i\s+(?:going\s+to\s+)?(?:regret|miss)/i,
      /^(?:what\s+(?:will|would))\s+i\s+(?:think|feel)\s+(?:in\s+)?(?:10|20|30)\s+years/i,
      /^(?:is\s+this|am\s+i\s+missing)\s+(?:my\s+)?(?:only\s+)?(?:chance|opportunity)/i,
    ],
    keywords: [
      { word: 'regret', weight: 1.0 },
      { word: 'miss', weight: 0.7 },
      { word: 'chance', weight: 0.7 },
      { word: 'opportunity', weight: 0.7 },
      { word: 'look back', weight: 0.9 },
      { word: 'years', weight: 0.5 },
    ],
    antiKeywords: [],
  },

  examples: [
    'Will I regret not taking this job?',
    'What will I think in 10 years?',
    'Am I missing my chance?',
    "Will I look back and wish I'd tried?",
    'Is this now or never?',
  ],

  counterExamples: ['I regret what I did', 'Past regrets'],

  arguments: [
    {
      name: 'decision',
      type: 'string',
      description: 'The decision being considered',
      required: false,
      extractionPatterns: [
        /regret\s+(?:not\s+)?(?:taking|doing|choosing)\s+(.+?)$/i,
        /miss\s+(?:my\s+)?(?:chance\s+(?:to|for)|opportunity\s+(?:to|for))\s+(.+?)$/i,
      ],
    },
    {
      name: 'timeframe',
      type: 'string',
      description: 'Future timeframe to consider',
      required: false,
      extractionPatterns: [/(?:in\s+)?(\d+)\s+years/i],
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
      toolId: 'regretMinimization',
      args,
      delegateTo: 'domains/decisions',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const decisionsTools: SemanticToolDefinition[] = [
  decisionHelpTool,
  proConListTool,
  valuesAlignmentTool,
  regretMinimizationTool,
];
