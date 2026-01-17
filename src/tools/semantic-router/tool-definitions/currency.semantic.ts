/**
 * Currency Tool Definitions for Semantic Router
 *
 * Routes currency conversion queries - exchange rates, conversions.
 *
 * @module tools/semantic-router/tool-definitions/currency
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// CONVERT CURRENCY
// ============================================================================

export const convertCurrencyTool: SemanticToolDefinition = {
  id: 'currency_convert',
  name: 'Convert Currency',
  description: 'Convert between currencies with real-time exchange rates.',
  shortDescription: 'convert currency',
  category: 'finance',

  triggers: {
    phrases: [
      'convert dollars to',
      'convert euros to',
      'how much is in',
      'dollars to euros',
      'euros to dollars',
      'yen to dollars',
      'pounds to dollars',
      'currency conversion',
      'exchange rate',
    ],
    patterns: [
      /^(?:convert|change)\s+\$?(\d+(?:\.\d{2})?)\s*(?:dollars?|usd)?\s+(?:to|into)\s+(\w+)/i,
      /^(?:how\s+much\s+is)\s+\$?(\d+(?:\.\d{2})?)\s*(\w+)\s+in\s+(\w+)/i,
      /^(?:what(?:'s| is))\s+\$?(\d+(?:\.\d{2})?)\s*(?:dollars?|usd|euros?|eur|pounds?|gbp)?\s+(?:in|to)\s+(\w+)/i,
      /^(\d+(?:\.\d{2})?)\s*(\w+)\s+(?:to|in|into)\s+(\w+)/i,
    ],
    keywords: [
      { word: 'convert', weight: 0.8 },
      { word: 'dollars', weight: 0.9 },
      { word: 'euros', weight: 0.9 },
      { word: 'pounds', weight: 0.9 },
      { word: 'yen', weight: 0.9 },
      { word: 'currency', weight: 1.0 },
      { word: 'exchange', weight: 0.8 },
      { word: 'forex', weight: 0.9 },
    ],
    antiKeywords: ['temperature', 'miles', 'kilometers', 'fahrenheit', 'celsius'],
  },

  examples: [
    'Convert 100 dollars to euros',
    'How much is 50 euros in dollars?',
    "What's 1000 yen in USD?",
    '100 GBP to USD',
    'Convert 500 pounds to euros',
  ],

  counterExamples: [
    'Convert miles to kilometers',
    'Convert Fahrenheit to Celsius',
    'What is 100 degrees in Fahrenheit?',
  ],

  arguments: [
    {
      name: 'amount',
      type: 'number',
      description: 'Amount to convert',
      required: true,
      extractionPatterns: [/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/],
    },
    {
      name: 'fromCurrency',
      type: 'string',
      description: 'Source currency code (USD, EUR, etc.)',
      required: true,
      extractionPatterns: [
        /(?:convert|from)\s+\$?\d+(?:\.\d{2})?\s*(\w{3}|\w+)/i,
        /(\w{3})\s+to\s+\w{3}/i,
      ],
    },
    {
      name: 'toCurrency',
      type: 'string',
      description: 'Target currency code',
      required: true,
      extractionPatterns: [/(?:to|into|in)\s+(\w{3}|\w+)$/i],
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
      toolId: 'convertCurrency',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// GET EXCHANGE RATE
// ============================================================================

export const getExchangeRateTool: SemanticToolDefinition = {
  id: 'currency_rate',
  name: 'Get Exchange Rate',
  description: 'Get current exchange rate between two currencies.',
  shortDescription: 'check exchange rate',
  category: 'finance',

  triggers: {
    phrases: [
      'exchange rate',
      "what's the rate",
      'dollar to euro rate',
      'current exchange rate',
      'forex rate',
    ],
    patterns: [
      /^(?:what(?:'s| is))\s+(?:the\s+)?(?:current\s+)?(?:exchange\s+)?rate\s+(?:for|between|from)\s+(\w+)/i,
      /^(?:what(?:'s| is))\s+(?:the\s+)?(\w+)\s+(?:to|vs)\s+(\w+)\s+(?:exchange\s+)?rate/i,
      /^(?:how\s+(?:much|many))\s+(\w+)\s+(?:per|to\s+(?:one|1))\s+(\w+)/i,
    ],
    keywords: [
      { word: 'exchange rate', weight: 1.0 },
      { word: 'forex', weight: 0.9 },
      { word: 'rate', weight: 0.7 },
      { word: 'currency', weight: 0.8 },
    ],
    antiKeywords: ['interest rate', 'mortgage', 'loan'],
  },

  examples: [
    "What's the exchange rate for USD to EUR?",
    'Dollar to pound rate',
    'Current euro exchange rate',
    'How many yen per dollar?',
  ],

  counterExamples: ["What's the interest rate?", 'Mortgage rate', 'Convert 100 dollars to euros'],

  arguments: [
    {
      name: 'fromCurrency',
      type: 'string',
      description: 'Base currency code',
      required: true,
    },
    {
      name: 'toCurrency',
      type: 'string',
      description: 'Target currency code',
      required: true,
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
      toolId: 'getExchangeRate',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// LIST CURRENCIES
// ============================================================================

export const listCurrenciesTool: SemanticToolDefinition = {
  id: 'currency_list',
  name: 'List Currencies',
  description: 'List available currencies for conversion.',
  shortDescription: 'list currencies',
  category: 'finance',

  triggers: {
    phrases: [
      'what currencies',
      'list currencies',
      'available currencies',
      'supported currencies',
      'which currencies',
    ],
    patterns: [
      /^(?:what|which)\s+currencies\s+(?:do\s+you\s+support|are\s+available|can\s+(?:you|I)\s+convert)/i,
      /^(?:list|show)\s+(?:all\s+)?(?:available\s+)?currencies/i,
    ],
    keywords: [
      { word: 'currencies', weight: 1.0 },
      { word: 'list', weight: 0.6 },
      { word: 'available', weight: 0.5 },
      { word: 'supported', weight: 0.6 },
    ],
    antiKeywords: [],
  },

  examples: [
    'What currencies can you convert?',
    'List available currencies',
    'Which currencies do you support?',
  ],

  counterExamples: ['Convert dollars to euros', "What's the exchange rate?"],

  arguments: [],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.2,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'listCurrencies',
      args,
      delegateTo: 'domains/simple-utilities',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const currencyTools: SemanticToolDefinition[] = [
  convertCurrencyTool,
  getExchangeRateTool,
  listCurrenciesTool,
];
