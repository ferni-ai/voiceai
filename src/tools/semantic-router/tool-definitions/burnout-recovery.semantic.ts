/**
 * Burnout Recovery Semantic Routing
 *
 * Routes for identifying and recovering from burnout.
 * Overlaps with career domain but focuses on recovery and prevention.
 *
 * Routes to: domains/burnout-recovery
 * Tools: assessBurnout, planRecovery, setWorkBoundaries, restoreEnergy, burnoutPrevention
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// BURNOUT ASSESSMENT
// ============================================================================

export const assessBurnoutTool: SemanticToolDefinition = {
  id: 'burnout_assess',
  name: 'Assess Burnout',
  description: 'Help assess level and type of burnout.',
  shortDescription: 'burnout assessment',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      "I'm burned out",
      "I'm burnt out",
      'I have burnout',
      'am I burned out',
      'completely exhausted from work',
      'I have nothing left to give',
      "I can't do this anymore",
      'running on empty',
      'totally depleted',
    ],
    patterns: [
      /\b(I'm|I am)\s+(burned?|burnt)\s+out\b/i,
      /\b(have|experiencing)\s+burnout\b/i,
      /\bcompletely\s+exhausted\s+(from|at)\s+work\b/i,
      /\brunning\s+on\s+empty\b/i,
    ],
    keywords: [
      { word: 'burnout', weight: 1.0 },
      { word: 'burned', weight: 0.95 },
      { word: 'burnt', weight: 0.95 },
      { word: 'exhausted', weight: 0.85 },
      { word: 'depleted', weight: 0.9 },
      { word: 'nothing left', weight: 0.85 },
    ],
    antiKeywords: ['recovered from burnout', 'was burned out', 'avoiding burnout'],
  },

  examples: [
    "I think I'm completely burned out",
    "I'm running on empty and can't keep going",
    'Am I experiencing burnout?',
  ],

  counterExamples: [
    'I recovered from burnout last year',
    "I'm worried about burnout but feel okay now",
  ],

  arguments: [
    { name: 'duration', type: 'string', required: false, description: 'How long feeling this way' },
    { name: 'domain', type: 'string', required: false, description: 'Work, parenting, caregiving' },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/burnout-recovery',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'assessBurnout',
      args,
      delegateTo: 'domains/burnout-recovery',
    };
  },
};

// ============================================================================
// PLAN RECOVERY
// ============================================================================

export const planRecoveryTool: SemanticToolDefinition = {
  id: 'burnout_plan_recovery',
  name: 'Plan Burnout Recovery',
  description: 'Create a recovery plan for burnout.',
  shortDescription: 'burnout recovery plan',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'recover from burnout',
      'burnout recovery',
      'how to heal from burnout',
      'get over burnout',
      'come back from burnout',
      'burnout recovery plan',
      'heal from exhaustion',
    ],
    patterns: [
      /\brecover(y|ing)?\s+(from\s+)?burnout\b/i,
      /\bhow\s+to\s+(heal|recover)\s+from\s+burnout\b/i,
      /\bburnout\s+recovery\s+(plan|strategy)\b/i,
    ],
    keywords: [
      { word: 'recovery', weight: 0.9 },
      { word: 'recover', weight: 0.9 },
      { word: 'heal', weight: 0.85 },
      { word: 'healing', weight: 0.85 },
      { word: 'restore', weight: 0.8 },
      { word: 'come back', weight: 0.75 },
    ],
    antiKeywords: ['fully recovered', 'already recovering'],
  },

  examples: [
    'How do I recover from burnout?',
    'Help me create a burnout recovery plan',
    'I need to heal from this exhaustion',
  ],

  counterExamples: ["I've already recovered from burnout"],

  arguments: [
    {
      name: 'timeline',
      type: 'string',
      required: false,
      description: 'Time available for recovery',
    },
    { name: 'constraints', type: 'string', required: false, description: "Can't quit job, etc." },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/burnout-recovery',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'planRecovery',
      args,
      delegateTo: 'domains/burnout-recovery',
    };
  },
};

// ============================================================================
// WORK BOUNDARIES
// ============================================================================

export const setWorkBoundariesTool: SemanticToolDefinition = {
  id: 'burnout_work_boundaries',
  name: 'Set Work Boundaries',
  description: 'Help establish healthy work boundaries.',
  shortDescription: 'work boundaries',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'set work boundaries',
      'work life balance',
      "can't stop working",
      'always working',
      'work is taking over',
      'say no at work',
      'boundaries with boss',
      "work won't leave me alone",
      'disconnect from work',
    ],
    patterns: [
      /\bset\s+(work\s+)?boundaries\b/i,
      /\bwork\s+life\s+balance\b/i,
      /\b(can't|cannot)\s+stop\s+working\b/i,
      /\bwork\s+(is\s+)?(taking\s+over|consuming)\b/i,
      /\bsay\s+no\s+(at|to)\s+work\b/i,
    ],
    keywords: [
      { word: 'boundaries', weight: 0.95 },
      { word: 'balance', weight: 0.85 },
      { word: 'disconnect', weight: 0.8 },
      { word: 'say no', weight: 0.85 },
      { word: 'limits', weight: 0.8 },
      { word: 'separate', weight: 0.75 },
    ],
    antiKeywords: ['good boundaries', 'healthy balance'],
  },

  examples: [
    'I need help setting work boundaries',
    'Work is consuming my entire life',
    'How do I say no to my boss without consequences',
  ],

  counterExamples: ['I have good work-life balance now'],

  arguments: [
    { name: 'situation', type: 'string', required: false, description: 'Work situation details' },
    {
      name: 'concerns',
      type: 'string',
      required: false,
      description: 'Fears about setting limits',
    },
  ],

  confidence: {
    baseScore: 0.83,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/burnout-recovery',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'setWorkBoundaries',
      args,
      delegateTo: 'domains/burnout-recovery',
    };
  },
};

// ============================================================================
// RESTORE ENERGY
// ============================================================================

export const restoreEnergyTool: SemanticToolDefinition = {
  id: 'burnout_restore_energy',
  name: 'Restore Energy',
  description: 'Help restore energy and vitality after depletion.',
  shortDescription: 'restore energy',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'no energy left',
      'completely drained',
      'restore my energy',
      'get my energy back',
      'feel empty',
      'nothing left in the tank',
      'emotionally depleted',
      'physically exhausted',
    ],
    patterns: [
      /\bno\s+energy\s+(left|anymore)\b/i,
      /\b(completely|totally)\s+(drained|depleted)\b/i,
      /\brestore\s+(my\s+)?energy\b/i,
      /\bget\s+(my\s+)?energy\s+back\b/i,
    ],
    keywords: [
      { word: 'energy', weight: 0.9 },
      { word: 'drained', weight: 0.9 },
      { word: 'depleted', weight: 0.9 },
      { word: 'empty', weight: 0.8 },
      { word: 'exhausted', weight: 0.85 },
      { word: 'restore', weight: 0.85 },
    ],
    antiKeywords: ['full of energy', 'energized'],
  },

  examples: [
    'I have no energy left for anything',
    'How do I restore my energy?',
    "I'm completely drained emotionally and physically",
  ],

  counterExamples: ["I'm feeling energized today"],

  arguments: [
    { name: 'type', type: 'string', required: false, description: 'Physical, emotional, mental' },
    { name: 'timeframe', type: 'string', required: false, description: 'How long depleted' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/burnout-recovery',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'restoreEnergy',
      args,
      delegateTo: 'domains/burnout-recovery',
    };
  },
};

// ============================================================================
// BURNOUT PREVENTION
// ============================================================================

export const burnoutPreventionTool: SemanticToolDefinition = {
  id: 'burnout_prevention',
  name: 'Burnout Prevention',
  description: 'Strategies to prevent burnout before it happens.',
  shortDescription: 'prevent burnout',
  category: 'wellness',
  priority: 3,

  triggers: {
    phrases: [
      'prevent burnout',
      'avoid burnout',
      'heading toward burnout',
      "don't want to burn out",
      'sustainable pace',
      'not burn out again',
      'early signs of burnout',
      'prevent exhaustion',
    ],
    patterns: [
      /\b(prevent|avoid)\s+burnout\b/i,
      /\bheading\s+(toward|for)\s+burnout\b/i,
      /\bnot\s+burn\s+out\s+again\b/i,
      /\bearly\s+signs\s+(of\s+)?burnout\b/i,
    ],
    keywords: [
      { word: 'prevent', weight: 0.9 },
      { word: 'avoid', weight: 0.85 },
      { word: 'sustainable', weight: 0.8 },
      { word: 'early signs', weight: 0.85 },
      { word: 'heading toward', weight: 0.8 },
    ],
    antiKeywords: ['already burned out', 'experiencing burnout'],
  },

  examples: [
    'How can I prevent burnout?',
    "I feel like I'm heading toward burnout",
    "I don't want to burn out again",
  ],

  counterExamples: ["I'm currently burned out"],

  arguments: [
    { name: 'currentLoad', type: 'string', required: false, description: 'Current workload' },
    { name: 'warningSigns', type: 'string', required: false, description: 'Signs noticing' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/burnout-recovery',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'burnoutPrevention',
      args,
      delegateTo: 'domains/burnout-recovery',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const burnoutRecoveryTools: SemanticToolDefinition[] = [
  assessBurnoutTool,
  planRecoveryTool,
  setWorkBoundariesTool,
  restoreEnergyTool,
  burnoutPreventionTool,
];
