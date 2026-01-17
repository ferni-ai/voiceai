/**
 * Anger Management Semantic Routing
 *
 * Routes for processing and managing anger in healthy ways.
 * Focus on validation, physical release, and constructive channeling.
 *
 * Routes to: domains/anger
 * Tools: validateAnger, physicalRelease, coolDownTechnique, angerToAction,
 *        angerJournaling, identifyTriggers, assertiveCommunication, angerHistory
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// VALIDATE ANGER
// ============================================================================

export const validateAngerTool: SemanticToolDefinition = {
  id: 'anger_validate',
  name: 'Validate Anger',
  description: 'Validate and acknowledge anger as a legitimate emotion.',
  shortDescription: 'validate angry feelings',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      "I'm so angry",
      "I'm furious",
      "I'm pissed off",
      "I'm enraged",
      'I want to scream',
      'I could punch something',
      'I hate this',
      "I can't believe they did this",
    ],
    patterns: [
      /\b(I'm|I am)\s+(so\s+)?(angry|furious|pissed|enraged|livid|mad)\b/i,
      /\bI\s+(want|need)\s+to\s+(scream|punch|hit)\b/i,
      /\bI\s+(hate|despise)\s+(this|them|everything)\b/i,
      /\bhow\s+dare\s+(they|he|she)\b/i,
    ],
    keywords: [
      { word: 'angry', weight: 1.0 },
      { word: 'furious', weight: 1.0 },
      { word: 'rage', weight: 0.9 },
      { word: 'mad', weight: 0.8 },
      { word: 'pissed', weight: 0.9 },
      { word: 'hate', weight: 0.7 },
      { word: 'scream', weight: 0.6 },
      { word: 'frustrated', weight: 0.5 },
    ],
    antiKeywords: ['was angry', 'used to be angry', 'not angry anymore'],
  },

  examples: [
    "I'm so angry right now I could scream",
    "I'm furious at what my boss did",
    'I hate that this happened',
  ],

  counterExamples: ['I was angry yesterday but I am over it now', 'I used to get angry about this'],

  arguments: [
    { name: 'situation', type: 'string', required: false, description: 'What caused the anger' },
    { name: 'intensity', type: 'string', required: false, description: 'How intense is the anger' },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'validateAnger',
      args,
      delegateTo: 'domains/anger',
    };
  },
};

// ============================================================================
// PHYSICAL RELEASE
// ============================================================================

export const physicalReleaseTool: SemanticToolDefinition = {
  id: 'anger_physical_release',
  name: 'Physical Release',
  description: 'Guide physical release of anger energy.',
  shortDescription: 'release anger physically',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'I need to hit something',
      'I want to break something',
      'I need to let this out',
      'I need physical release',
      'I want to punch a wall',
      'explosive anger',
      'anger building up',
    ],
    patterns: [
      /\b(need|want)\s+to\s+(hit|punch|break|throw|smash)\b/i,
      /\blet\s+(this|it)\s+out\b/i,
      /\bphysical\s+release\b/i,
      /\banger\s+(building|bottled)\b/i,
    ],
    keywords: [
      { word: 'punch', weight: 0.9 },
      { word: 'hit', weight: 0.9 },
      { word: 'break', weight: 0.8 },
      { word: 'smash', weight: 0.8 },
      { word: 'release', weight: 0.7 },
      { word: 'explosive', weight: 0.7 },
      { word: 'physical', weight: 0.6 },
    ],
    antiKeywords: ['already exercised', 'feel better now'],
  },

  examples: [
    'I need to hit something right now',
    'I feel like I could break things',
    'My anger is building up and I need to release it',
  ],

  counterExamples: ['I went for a run and feel better'],

  arguments: [
    { name: 'available', type: 'string', required: false, description: 'What options they have' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'physicalRelease',
      args,
      delegateTo: 'domains/anger',
    };
  },
};

// ============================================================================
// COOL DOWN TECHNIQUE
// ============================================================================

export const coolDownTechniqueTool: SemanticToolDefinition = {
  id: 'anger_cool_down',
  name: 'Cool Down Technique',
  description: 'Guide through anger cool-down techniques.',
  shortDescription: 'cool down from anger',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      'help me calm down',
      'I need to cool off',
      'how do I calm down',
      'I need to chill out',
      'help me not explode',
      'before I say something I regret',
      'take a breath',
    ],
    patterns: [
      /\b(help\s+me|I need to)\s+(calm|cool)\s+(down|off)\b/i,
      /\bhow\s+do\s+I\s+(calm|cool)\s+(down|off)\b/i,
      /\bbefore\s+I\s+(explode|say\s+something|do\s+something)\b/i,
      /\bneed\s+to\s+(chill|relax|breathe)\b/i,
    ],
    keywords: [
      { word: 'calm', weight: 0.9 },
      { word: 'cool', weight: 0.8 },
      { word: 'chill', weight: 0.7 },
      { word: 'breathe', weight: 0.7 },
      { word: 'relax', weight: 0.6 },
      { word: 'explode', weight: 0.5 },
    ],
    antiKeywords: ['already calm', 'feeling better'],
  },

  examples: [
    'Help me calm down before I say something I regret',
    'I need to cool off right now',
    'How do I calm down when I am this angry',
  ],

  counterExamples: ['I have calmed down now'],

  arguments: [
    {
      name: 'timeAvailable',
      type: 'string',
      required: false,
      description: 'How much time they have',
    },
    { name: 'location', type: 'string', required: false, description: 'Where they are' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.07,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'coolDownTechnique',
      args,
      delegateTo: 'domains/anger',
    };
  },
};

// ============================================================================
// ANGER TO ACTION
// ============================================================================

export const angerToActionTool: SemanticToolDefinition = {
  id: 'anger_to_action',
  name: 'Anger To Action',
  description: 'Channel anger into constructive action.',
  shortDescription: 'channel anger productively',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'use this anger',
      'channel my anger',
      'do something about this',
      'turn anger into action',
      'make this anger useful',
      'righteous anger',
      'anger as fuel',
    ],
    patterns: [
      /\b(use|channel)\s+(this|my)\s+anger\b/i,
      /\bturn\s+anger\s+into\s+(action|something)\b/i,
      /\bdo\s+something\s+(about|with)\s+this\b/i,
      /\bmake\s+(this\s+)?anger\s+useful\b/i,
    ],
    keywords: [
      { word: 'channel', weight: 0.9 },
      { word: 'use', weight: 0.7 },
      { word: 'action', weight: 0.8 },
      { word: 'productive', weight: 0.7 },
      { word: 'constructive', weight: 0.7 },
      { word: 'fuel', weight: 0.6 },
    ],
    antiKeywords: ['suppress anger', 'ignore anger'],
  },

  examples: [
    'I want to channel this anger into something productive',
    'How can I use my anger constructively',
    'I want to do something about this situation',
  ],

  counterExamples: ['I just want to ignore my anger'],

  arguments: [
    { name: 'situation', type: 'string', required: false, description: 'What caused anger' },
    { name: 'resources', type: 'string', required: false, description: 'Resources available' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'angerToAction',
      args,
      delegateTo: 'domains/anger',
    };
  },
};

// ============================================================================
// ANGER JOURNALING
// ============================================================================

export const angerJournalingTool: SemanticToolDefinition = {
  id: 'anger_journaling',
  name: 'Anger Journaling',
  description: 'Guide anger journaling for processing.',
  shortDescription: 'journal about anger',
  category: 'wellness',
  priority: 3,

  triggers: {
    phrases: [
      'write about my anger',
      'journal my anger',
      'vent about this',
      'get it out on paper',
      'angry letter',
      'write it down',
      'process this anger',
    ],
    patterns: [
      /\b(write|journal)\s+(about\s+)?(my\s+)?anger\b/i,
      /\bvent\s+(about|on\s+paper)\b/i,
      /\bget\s+it\s+out\s+(on\s+paper|in\s+writing)\b/i,
      /\bangry\s+letter\b/i,
    ],
    keywords: [
      { word: 'journal', weight: 0.9 },
      { word: 'write', weight: 0.8 },
      { word: 'vent', weight: 0.7 },
      { word: 'letter', weight: 0.6 },
      { word: 'process', weight: 0.5 },
      { word: 'paper', weight: 0.4 },
    ],
    antiKeywords: ['already wrote', 'finished journaling'],
  },

  examples: [
    'I need to journal about my anger',
    'I want to vent about this on paper',
    'Help me write an angry letter I will never send',
  ],

  counterExamples: ['I already wrote about this'],

  arguments: [
    { name: 'format', type: 'string', required: false, description: 'Letter, free-write, etc.' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'angerJournaling',
      args,
      delegateTo: 'domains/anger',
    };
  },
};

// ============================================================================
// IDENTIFY TRIGGERS
// ============================================================================

export const identifyTriggersTool: SemanticToolDefinition = {
  id: 'anger_identify_triggers',
  name: 'Identify Anger Triggers',
  description: 'Help identify patterns and triggers for anger.',
  shortDescription: 'understand anger triggers',
  category: 'wellness',
  priority: 3,

  triggers: {
    phrases: [
      'why do I get so angry',
      'what triggers my anger',
      'anger patterns',
      'always angry about',
      'keeps making me angry',
      'understand my anger',
      'anger triggers',
    ],
    patterns: [
      /\bwhy\s+(do\s+)?I\s+get\s+(so\s+)?angry\b/i,
      /\bwhat\s+triggers\s+(my\s+)?anger\b/i,
      /\b(understand|figure\s+out)\s+(my\s+)?anger\b/i,
      /\banger\s+(patterns?|triggers?)\b/i,
    ],
    keywords: [
      { word: 'triggers', weight: 0.9 },
      { word: 'patterns', weight: 0.8 },
      { word: 'understand', weight: 0.7 },
      { word: 'why', weight: 0.5 },
      { word: 'always', weight: 0.4 },
      { word: 'keeps', weight: 0.4 },
    ],
    antiKeywords: ['know my triggers', 'figured out'],
  },

  examples: [
    'Why do I get so angry at little things',
    'I want to understand my anger triggers',
    'Help me see patterns in my anger',
  ],

  counterExamples: ['I already know what triggers my anger'],

  arguments: [
    {
      name: 'recentExamples',
      type: 'string',
      required: false,
      description: 'Recent anger incidents',
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'identifyTriggers',
      args,
      delegateTo: 'domains/anger',
    };
  },
};

// ============================================================================
// ASSERTIVE COMMUNICATION
// ============================================================================

export const assertiveCommunicationTool: SemanticToolDefinition = {
  id: 'anger_assertive_communication',
  name: 'Assertive Communication',
  description: 'Help express anger assertively without aggression.',
  shortDescription: 'express anger assertively',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'how do I tell them',
      'express my anger',
      'confront them about this',
      'say something without exploding',
      'stand up for myself',
      'not be passive aggressive',
      'communicate my anger',
    ],
    patterns: [
      /\bhow\s+(do|can)\s+I\s+(tell|express|communicate)\b/i,
      /\bconfront\s+(them|him|her)\b/i,
      /\bstand\s+up\s+for\s+myself\b/i,
      /\bwithout\s+(exploding|yelling|fighting)\b/i,
    ],
    keywords: [
      { word: 'express', weight: 0.8 },
      { word: 'communicate', weight: 0.8 },
      { word: 'confront', weight: 0.7 },
      { word: 'tell', weight: 0.5 },
      { word: 'assertive', weight: 0.9 },
      { word: 'stand up', weight: 0.6 },
    ],
    antiKeywords: ['already told them', 'confronted them'],
  },

  examples: [
    'How do I tell my partner I am angry without starting a fight',
    'I need to confront my coworker assertively',
    'Help me express my anger in a healthy way',
  ],

  counterExamples: ['I already talked to them about it'],

  arguments: [
    { name: 'situation', type: 'string', required: false, description: 'What needs addressing' },
    { name: 'relationship', type: 'string', required: false, description: 'Who it is with' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'assertiveCommunication',
      args,
      delegateTo: 'domains/anger',
    };
  },
};

// ============================================================================
// ANGER HISTORY
// ============================================================================

export const angerHistoryTool: SemanticToolDefinition = {
  id: 'anger_history',
  name: 'Anger History',
  description: 'Explore relationship with anger over time.',
  shortDescription: 'explore anger history',
  category: 'wellness',
  priority: 4,

  triggers: {
    phrases: [
      'always had anger issues',
      'anger runs in my family',
      'I learned to be angry',
      'where my anger comes from',
      'angry childhood',
      'relationship with anger',
      'history of anger',
    ],
    patterns: [
      /\balways\s+had\s+anger\b/i,
      /\banger\s+runs\s+in\s+(my|the)\s+family\b/i,
      /\bwhere\s+(my\s+)?anger\s+comes\s+from\b/i,
      /\brelationship\s+with\s+anger\b/i,
    ],
    keywords: [
      { word: 'history', weight: 0.8 },
      { word: 'always', weight: 0.6 },
      { word: 'family', weight: 0.7 },
      { word: 'childhood', weight: 0.8 },
      { word: 'learned', weight: 0.6 },
      { word: 'comes from', weight: 0.7 },
    ],
    antiKeywords: ['recent anger', 'just happened'],
  },

  examples: [
    'I have always had anger issues',
    'Anger runs in my family',
    'I want to understand where my anger comes from',
  ],

  counterExamples: ['This just happened today'],

  arguments: [{ name: 'timeframe', type: 'string', required: false, description: 'How far back' }],

  confidence: {
    baseScore: 0.78,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.35,
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'angerHistory',
      args,
      delegateTo: 'domains/anger',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const angerTools: SemanticToolDefinition[] = [
  validateAngerTool,
  physicalReleaseTool,
  coolDownTechniqueTool,
  angerToActionTool,
  angerJournalingTool,
  identifyTriggersTool,
  assertiveCommunicationTool,
  angerHistoryTool,
];
