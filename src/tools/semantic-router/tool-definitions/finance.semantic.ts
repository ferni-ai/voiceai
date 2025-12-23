/**
 * Finance Tool Definitions for Semantic Router
 *
 * Routes financial queries - budgeting, bills, calculations, banking.
 *
 * @module tools/semantic-router/tool-definitions/finance
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// BUDGET CHECK / SPENDING REVIEW
// ============================================================================

export const budgetCheckTool: SemanticToolDefinition = {
  id: 'finance_budget',
  name: 'Budget Check',
  description: 'Check budget status, spending categories, or review finances.',
  shortDescription: 'check your budget',
  category: 'finance',

  triggers: {
    phrases: [
      'check my budget',
      'how much have I spent',
      'spending review',
      'budget status',
      'where did my money go',
      'spending breakdown',
      'how am I doing financially',
      'review my spending',
    ],
    patterns: [
      /^(?:check|show|review)?\s*(?:my\s+)?(?:budget|spending)/i,
      /^how\s+much\s+(?:have\s+)?i\s+spent/i,
      /^where\s+(?:did|does|is)\s+my\s+money\s+go/i,
      /^(?:what(?:'s| is))\s+my\s+(?:budget|spending)\s+(?:like|status)/i,
    ],
    keywords: [
      { word: 'budget', weight: 1.0 },
      { word: 'spending', weight: 0.9 },
      { word: 'spent', weight: 0.8 },
      { word: 'money', weight: 0.6 },
      { word: 'finances', weight: 0.8 },
      { word: 'expenses', weight: 0.8 },
    ],
    antiKeywords: ['stock', 'invest', 'market', 'trade'],
  },

  examples: [
    'Check my budget',
    'How much have I spent this month?',
    'Where did my money go?',
    'Show me my spending breakdown',
    'Review my finances',
    "What's my budget status?",
  ],

  counterExamples: [
    'Buy some stocks',
    'How is the market?',
    'Invest in crypto',
  ],

  arguments: [
    {
      name: 'period',
      type: 'string',
      description: 'Time period for budget review',
      required: false,
      enumValues: ['today', 'this_week', 'this_month', 'last_month', 'this_year'],
      extractionPatterns: [
        /(today|this\s+week|this\s+month|last\s+month|this\s+year)/i,
      ],
    },
    {
      name: 'category',
      type: 'string',
      description: 'Spending category to focus on',
      required: false,
      extractionPatterns: [
        /(?:on|for)\s+(food|groceries|dining|entertainment|shopping|transport|utilities)/i,
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
      toolId: 'checkBudget',
      args,
      delegateTo: 'domains/finance',
    };
  },
};

// ============================================================================
// BILL TRACKING / REMINDERS
// ============================================================================

export const billTrackingTool: SemanticToolDefinition = {
  id: 'finance_bills',
  name: 'Bill Tracking',
  description: 'Track bills, set reminders, or check upcoming payments.',
  shortDescription: 'manage bills',
  category: 'finance',

  triggers: {
    phrases: [
      'when is my rent due',
      'upcoming bills',
      'bill reminders',
      'pay my bills',
      'what bills do I have',
      'when do I need to pay',
      'add a bill',
      'track a bill',
    ],
    patterns: [
      /^(?:when\s+is|what(?:'s| is))\s+(?:my\s+)?(?:\w+\s+)?(?:bill|payment|rent)\s+due/i,
      /^(?:show|check|list)\s+(?:my\s+)?(?:upcoming\s+)?bills/i,
      /^(?:add|track|create)\s+(?:a\s+)?(?:new\s+)?bill/i,
      /^(?:remind\s+me\s+(?:to|about)|set\s+(?:a\s+)?reminder\s+for)\s+(?:my\s+)?bill/i,
    ],
    keywords: [
      { word: 'bill', weight: 1.0 },
      { word: 'bills', weight: 1.0 },
      { word: 'due', weight: 0.7 },
      { word: 'payment', weight: 0.8 },
      { word: 'rent', weight: 0.8 },
      { word: 'utility', weight: 0.7 },
      { word: 'subscription', weight: 0.7 },
    ],
    antiKeywords: ['restaurant', 'receipt', 'stock'],
  },

  examples: [
    'When is my rent due?',
    'Show my upcoming bills',
    'Remind me about the electric bill',
    'What bills do I have this week?',
    'Add a new bill for internet',
    'Track my subscription payments',
  ],

  counterExamples: [
    'Pay for dinner',
    'What did I spend at the restaurant?',
  ],

  arguments: [
    {
      name: 'billName',
      type: 'string',
      description: 'Name of the bill',
      required: false,
      extractionPatterns: [
        /(?:my\s+)?(\w+)\s+(?:bill|payment)/i,
        /(?:bill|payment)\s+(?:for|called)\s+(\w+)/i,
      ],
    },
    {
      name: 'action',
      type: 'string',
      description: 'Action to take',
      required: false,
      enumValues: ['list', 'add', 'remind', 'pay'],
      extractionPatterns: [/(add|track|remind|pay|list|show)/i],
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
      toolId: 'trackBills',
      args,
      delegateTo: 'domains/finance',
    };
  },
};

// ============================================================================
// CALCULATOR / MATH
// ============================================================================

export const calculatorTool: SemanticToolDefinition = {
  id: 'finance_calculator',
  name: 'Calculator',
  description: 'Perform calculations - math, tips, splits, conversions.',
  shortDescription: 'calculate something',
  category: 'finance',

  triggers: {
    phrases: [
      'calculate',
      "what's the tip",
      'split the bill',
      'how much is',
      'divide by',
      'multiply',
      'percentage of',
      'convert',
    ],
    patterns: [
      /^(?:calculate|compute|figure\s+out)\s+(.+)/i,
      /^(?:what(?:'s| is))\s+(\d+)\s*(?:\+|-|\*|\/|plus|minus|times|divided)/i,
      /^(?:split|divide)\s+(?:the\s+)?(?:bill|check)/i,
      /^(?:what(?:'s| is))\s+(?:the\s+)?(?:tip|gratuity)/i,
      /^(?:convert|how\s+much\s+is)\s+\d+/i,
    ],
    keywords: [
      { word: 'calculate', weight: 1.0 },
      { word: 'tip', weight: 0.9 },
      { word: 'split', weight: 0.8 },
      { word: 'percent', weight: 0.8 },
      { word: 'divide', weight: 0.7 },
      { word: 'multiply', weight: 0.7 },
      { word: 'convert', weight: 0.7 },
    ],
    antiKeywords: [],
  },

  examples: [
    'Calculate 15% tip on $45',
    'Split the bill 4 ways',
    "What's 20% of 80?",
    'Divide 100 by 3',
    'Convert 50 dollars to euros',
  ],

  counterExamples: [
    'What time is it?',
    'Calculate my horoscope',
  ],

  arguments: [
    {
      name: 'expression',
      type: 'string',
      description: 'Math expression or question',
      required: false,
      extractionPatterns: [
        /calculate\s+(.+)/i,
        /(?:what(?:'s| is))\s+(.+)/i,
      ],
    },
    {
      name: 'calculationType',
      type: 'string',
      description: 'Type of calculation',
      required: false,
      enumValues: ['tip', 'split', 'percentage', 'conversion', 'general'],
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.2,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'calculator',
      args,
      delegateTo: 'domains/finance',
    };
  },
};

// ============================================================================
// SAVINGS GOALS
// ============================================================================

export const savingsGoalTool: SemanticToolDefinition = {
  id: 'finance_savings',
  name: 'Savings Goals',
  description: 'Track savings goals, set targets, monitor progress.',
  shortDescription: 'track savings',
  category: 'finance',

  triggers: {
    phrases: [
      'savings goal',
      'save money',
      'saving for',
      'how much have I saved',
      'savings progress',
      'set a savings goal',
      'emergency fund',
    ],
    patterns: [
      /^(?:set|create|add)\s+(?:a\s+)?savings\s+goal/i,
      /^(?:how\s+much\s+)?(?:have\s+)?i\s+saved/i,
      /^(?:i(?:'m| am)?|i\s+want\s+to)\s+sav(?:e|ing)\s+(?:up\s+)?for/i,
      /^(?:check|show)\s+(?:my\s+)?savings/i,
    ],
    keywords: [
      { word: 'savings', weight: 1.0 },
      { word: 'save', weight: 0.9 },
      { word: 'saved', weight: 0.8 },
      { word: 'goal', weight: 0.6 },
      { word: 'emergency fund', weight: 0.9 },
      { word: 'nest egg', weight: 0.8 },
    ],
    antiKeywords: ['spend', 'budget', 'invest'],
  },

  examples: [
    'Set a savings goal for vacation',
    'How much have I saved?',
    "I'm saving for a new car",
    'Check my emergency fund progress',
    'Add $100 to my savings',
  ],

  counterExamples: [
    'Check my budget',
    'How much did I spend?',
    'Invest in stocks',
  ],

  arguments: [
    {
      name: 'goalName',
      type: 'string',
      description: 'Name of the savings goal',
      required: false,
      extractionPatterns: [
        /(?:for|goal\s+(?:for|called))\s+(?:a\s+)?(.+?)$/i,
        /saving\s+for\s+(?:a\s+)?(.+?)$/i,
      ],
    },
    {
      name: 'amount',
      type: 'number',
      description: 'Amount to save or add',
      required: false,
      extractionPatterns: [/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/],
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
      toolId: 'savingsGoal',
      args,
      delegateTo: 'domains/finance',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const financeTools: SemanticToolDefinition[] = [
  budgetCheckTool,
  billTrackingTool,
  calculatorTool,
  savingsGoalTool,
];
