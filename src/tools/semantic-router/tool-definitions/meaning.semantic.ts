/**
 * Meaning & Purpose Semantic Routing
 *
 * Routes for purpose exploration, values clarification, and existential reflection.
 * Core "Better Than Human" features for deep life guidance.
 *
 * Routes to: domains/meaning
 * Tools: clarifyValues, purposeExploration, meaningMaking, existentialReflection,
 *        legacyPlanning, spiritualExploration, valueConflictResolution,
 *        lifePurposeStatement, meaningfulWork, philosophicalDialogue,
 *        moralDilemmaNavigation, authenticLiving
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// CLARIFY VALUES
// ============================================================================

export const clarifyValuesTool: SemanticToolDefinition = {
  id: 'meaning_clarify_values',
  name: 'Clarify Values',
  description: 'Help identify and clarify core values.',
  shortDescription: 'clarify your values',
  category: 'life-planning',
  priority: 1,

  triggers: {
    phrases: [
      'what are my values',
      'clarify my values',
      'what do I value',
      'core values',
      'what matters most to me',
      "what's important to me",
      'my priorities',
      'figure out my values',
    ],
    patterns: [
      /\bwhat\s+(are\s+)?(my\s+)?values\b/i,
      /\bclarify\s+(my\s+)?values\b/i,
      /\bwhat\s+(do\s+)?I\s+value\b/i,
      /\bwhat\s+(matters|is important)\s+(most\s+)?to\s+me\b/i,
    ],
    keywords: [
      { word: 'values', weight: 1.0 },
      { word: 'value', weight: 0.9 },
      { word: 'matters', weight: 0.8 },
      { word: 'important', weight: 0.8 },
      { word: 'priorities', weight: 0.85 },
      { word: 'core', weight: 0.75 },
    ],
    antiKeywords: ['stock value', 'monetary value', 'property values'],
  },

  examples: [
    'Help me clarify my core values',
    'What matters most to me?',
    'I want to figure out what I really value',
  ],

  counterExamples: ["What's the value of this stock?"],

  arguments: [
    { name: 'context', type: 'string', required: false, description: 'Why exploring values' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.07,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'clarifyValues',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// PURPOSE EXPLORATION
// ============================================================================

export const purposeExplorationTool: SemanticToolDefinition = {
  id: 'meaning_purpose',
  name: 'Purpose Exploration',
  description: 'Explore life purpose and calling.',
  shortDescription: 'find your purpose',
  category: 'life-planning',
  priority: 1,

  triggers: {
    phrases: [
      'what is my purpose',
      'find my purpose',
      'why am I here',
      'what is my calling',
      'my life purpose',
      'what am I meant to do',
      'find meaning in life',
      "what's the point",
    ],
    patterns: [
      /\bwhat\s+(is\s+)?(my\s+)?purpose\b/i,
      /\bfind\s+(my\s+)?purpose\b/i,
      /\bwhy\s+am\s+I\s+here\b/i,
      /\bwhat\s+(am\s+)?I\s+(meant|supposed)\s+to\s+do\b/i,
    ],
    keywords: [
      { word: 'purpose', weight: 1.0 },
      { word: 'calling', weight: 0.95 },
      { word: 'meant to', weight: 0.85 },
      { word: 'why am I here', weight: 0.9 },
      { word: 'meaning', weight: 0.85 },
    ],
    antiKeywords: ['on purpose', 'purpose of this meeting'],
  },

  examples: [
    "I don't know what my purpose is",
    'Help me find my purpose in life',
    'Why am I here? What am I meant to do?',
  ],

  counterExamples: ['I did that on purpose'],

  arguments: [
    {
      name: 'currentSituation',
      type: 'string',
      required: false,
      description: 'Where they are now',
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'purposeExploration',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// MEANING MAKING
// ============================================================================

export const meaningMakingTool: SemanticToolDefinition = {
  id: 'meaning_making',
  name: 'Meaning Making',
  description: 'Find meaning in experiences and suffering.',
  shortDescription: 'find meaning in experiences',
  category: 'life-planning',
  priority: 1,

  triggers: {
    phrases: [
      'what does this mean',
      'find meaning in suffering',
      'make sense of this',
      'why did this happen',
      'there must be a reason',
      'meaning in pain',
      'learn from this',
      'grow from this',
    ],
    patterns: [
      /\bfind\s+meaning\s+in\b/i,
      /\bmake\s+sense\s+of\s+this\b/i,
      /\bwhy\s+did\s+this\s+happen\b/i,
      /\bmeaning\s+in\s+(pain|suffering|loss)\b/i,
    ],
    keywords: [
      { word: 'meaning', weight: 0.95 },
      { word: 'sense', weight: 0.8 },
      { word: 'reason', weight: 0.75 },
      { word: 'why', weight: 0.7 },
      { word: 'learn', weight: 0.75 },
      { word: 'grow', weight: 0.75 },
    ],
    antiKeywords: ['word meaning', 'definition'],
  },

  examples: [
    "I'm trying to find meaning in what happened to me",
    'Why did this happen to me?',
    'How do I make sense of this suffering?',
  ],

  counterExamples: ["What's the meaning of this word?"],

  arguments: [
    { name: 'experience', type: 'string', required: false, description: 'What happened' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'meaningMaking',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// EXISTENTIAL REFLECTION
// ============================================================================

export const existentialReflectionTool: SemanticToolDefinition = {
  id: 'meaning_existential',
  name: 'Existential Reflection',
  description: 'Explore existential questions and concerns.',
  shortDescription: 'existential questions',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'existential crisis',
      'what is the meaning of life',
      'does anything matter',
      'nothing matters',
      'existential dread',
      'why does anything exist',
      'facing mortality',
      "what's it all for",
    ],
    patterns: [
      /\bexistential\s+(crisis|dread|anxiety)\b/i,
      /\bmeaning\s+of\s+life\b/i,
      /\b(does|nothing)\s+(anything\s+)?matter(s)?\b/i,
      /\bfacing\s+(my\s+)?mortality\b/i,
    ],
    keywords: [
      { word: 'existential', weight: 1.0 },
      { word: 'meaning of life', weight: 0.95 },
      { word: 'matters', weight: 0.8 },
      { word: 'mortality', weight: 0.9 },
      { word: 'exist', weight: 0.75 },
    ],
    antiKeywords: ['existential philosophy class'],
  },

  examples: [
    "I'm having an existential crisis",
    'What is the meaning of life?',
    'I feel like nothing matters',
  ],

  counterExamples: ["I'm taking a class on existential philosophy"],

  arguments: [
    { name: 'trigger', type: 'string', required: false, description: 'What prompted this' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'existentialReflection',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// LEGACY PLANNING
// ============================================================================

export const legacyPlanningTool: SemanticToolDefinition = {
  id: 'meaning_legacy',
  name: 'Legacy Planning',
  description: 'Reflect on legacy and lasting impact.',
  shortDescription: 'plan your legacy',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'what will I leave behind',
      'my legacy',
      'how will I be remembered',
      'lasting impact',
      'what I want to be remembered for',
      'contribution to the world',
      'leave a mark',
    ],
    patterns: [
      /\bmy\s+legacy\b/i,
      /\bleave\s+(behind|a mark)\b/i,
      /\bhow\s+will\s+I\s+be\s+remembered\b/i,
      /\blasting\s+impact\b/i,
    ],
    keywords: [
      { word: 'legacy', weight: 1.0 },
      { word: 'remembered', weight: 0.9 },
      { word: 'leave behind', weight: 0.9 },
      { word: 'impact', weight: 0.85 },
      { word: 'contribution', weight: 0.8 },
    ],
    antiKeywords: ['legacy code', 'legacy system'],
  },

  examples: [
    'What will my legacy be?',
    'How do I want to be remembered?',
    'I want to leave a lasting impact',
  ],

  counterExamples: ['How do I deal with legacy code?'],

  arguments: [
    { name: 'domain', type: 'string', required: false, description: 'Family, work, community' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'legacyPlanning',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// SPIRITUAL EXPLORATION
// ============================================================================

export const spiritualExplorationTool: SemanticToolDefinition = {
  id: 'meaning_spiritual',
  name: 'Spiritual Exploration',
  description: 'Explore spirituality and transcendence.',
  shortDescription: 'spiritual exploration',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'spiritual journey',
      'explore spirituality',
      'connection to something greater',
      'find my faith',
      'spiritual practice',
      'transcendence',
      'higher power',
      'soul searching',
    ],
    patterns: [
      /\bspiritual\s+(journey|exploration|practice)\b/i,
      /\bfind\s+(my\s+)?faith\b/i,
      /\bhigher\s+power\b/i,
      /\bsoul\s+searching\b/i,
    ],
    keywords: [
      { word: 'spiritual', weight: 1.0 },
      { word: 'faith', weight: 0.9 },
      { word: 'soul', weight: 0.85 },
      { word: 'transcendence', weight: 0.9 },
      { word: 'sacred', weight: 0.85 },
      { word: 'divine', weight: 0.85 },
    ],
    antiKeywords: ['not spiritual', "don't believe"],
  },

  examples: [
    "I'm on a spiritual journey",
    'I want to explore spirituality',
    'I feel a connection to something greater',
  ],

  counterExamples: ["I'm not spiritual at all"],

  arguments: [
    { name: 'background', type: 'string', required: false, description: 'Religious background' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'spiritualExploration',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// VALUE CONFLICT RESOLUTION
// ============================================================================

export const valueConflictResolutionTool: SemanticToolDefinition = {
  id: 'meaning_value_conflict',
  name: 'Value Conflict Resolution',
  description: 'Navigate conflicts between values.',
  shortDescription: 'resolve value conflicts',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'values conflict',
      'torn between',
      "can't have both",
      'competing priorities',
      'values clash',
      'which is more important',
      'sacrifice one for the other',
    ],
    patterns: [
      /\bvalues?\s+(conflict|clash)\b/i,
      /\btorn\s+between\b/i,
      /\bcan't\s+have\s+both\b/i,
      /\bcompeting\s+(priorities|values)\b/i,
    ],
    keywords: [
      { word: 'conflict', weight: 0.85 },
      { word: 'torn', weight: 0.9 },
      { word: 'competing', weight: 0.8 },
      { word: 'sacrifice', weight: 0.85 },
      { word: 'both', weight: 0.7 },
      { word: 'choose', weight: 0.75 },
    ],
    antiKeywords: ['resolved conflict', 'no conflict'],
  },

  examples: [
    "I'm torn between my career and my family",
    'My values are in conflict',
    "I feel like I can't have both things I want",
  ],

  counterExamples: ["I've resolved my value conflict"],

  arguments: [
    { name: 'values', type: 'string', required: false, description: 'Which values conflict' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'valueConflictResolution',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// LIFE PURPOSE STATEMENT
// ============================================================================

export const lifePurposeStatementTool: SemanticToolDefinition = {
  id: 'meaning_purpose_statement',
  name: 'Life Purpose Statement',
  description: 'Create a personal purpose statement.',
  shortDescription: 'create purpose statement',
  category: 'life-planning',
  priority: 3,

  triggers: {
    phrases: [
      'purpose statement',
      'personal mission',
      'life mission statement',
      'write my purpose',
      'define my mission',
      'articulate my purpose',
    ],
    patterns: [
      /\b(purpose|mission)\s+statement\b/i,
      /\bpersonal\s+mission\b/i,
      /\bwrite\s+(my\s+)?purpose\b/i,
      /\bdefine\s+(my\s+)?mission\b/i,
    ],
    keywords: [
      { word: 'statement', weight: 0.85 },
      { word: 'mission', weight: 0.9 },
      { word: 'purpose', weight: 0.9 },
      { word: 'write', weight: 0.7 },
      { word: 'define', weight: 0.75 },
      { word: 'articulate', weight: 0.8 },
    ],
    antiKeywords: ['company mission', 'business purpose'],
  },

  examples: [
    'Help me write a personal purpose statement',
    'I want to create my life mission statement',
  ],

  counterExamples: ["What's our company mission statement?"],

  arguments: [
    { name: 'values', type: 'string', required: false, description: 'Core values' },
    { name: 'purpose', type: 'string', required: false, description: 'Sensed purpose' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'lifePurposeStatement',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// MEANINGFUL WORK
// ============================================================================

export const meaningfulWorkTool: SemanticToolDefinition = {
  id: 'meaning_work',
  name: 'Meaningful Work',
  description: 'Find meaning and purpose in work.',
  shortDescription: 'meaningful work',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'meaningful work',
      'work feels meaningless',
      'purpose in my job',
      'find meaning at work',
      'my work matters',
      'why do I do this job',
      'is my work making a difference',
    ],
    patterns: [
      /\bmeaningful\s+work\b/i,
      /\bwork\s+feels?\s+meaningless\b/i,
      /\bpurpose\s+(in|at)\s+(my\s+)?job\b/i,
      /\bfind\s+meaning\s+(at|in)\s+work\b/i,
    ],
    keywords: [
      { word: 'meaningful', weight: 0.95 },
      { word: 'work', weight: 0.7 },
      { word: 'job', weight: 0.7 },
      { word: 'purpose', weight: 0.85 },
      { word: 'difference', weight: 0.8 },
      { word: 'matters', weight: 0.8 },
    ],
    antiKeywords: ['looking for work', 'job search'],
  },

  examples: [
    'I want more meaningful work',
    'My work feels meaningless',
    'How do I find purpose in my job?',
  ],

  counterExamples: ["I'm looking for work"],

  arguments: [{ name: 'currentWork', type: 'string', required: false, description: 'Current job' }],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'meaningfulWork',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// PHILOSOPHICAL DIALOGUE
// ============================================================================

export const philosophicalDialogueTool: SemanticToolDefinition = {
  id: 'meaning_philosophical',
  name: 'Philosophical Dialogue',
  description: 'Engage in philosophical discussion.',
  shortDescription: 'philosophical discussion',
  category: 'life-planning',
  priority: 3,

  triggers: {
    phrases: [
      'philosophy of life',
      'think deeply about',
      'philosophical question',
      'ponder life',
      'big questions',
      'contemplate existence',
      'nature of reality',
    ],
    patterns: [
      /\bphilosoph(y|ical)\s+of\s+life\b/i,
      /\bthink\s+deeply\s+about\b/i,
      /\bbig\s+questions\b/i,
      /\bnature\s+of\s+(reality|existence|being)\b/i,
    ],
    keywords: [
      { word: 'philosophy', weight: 0.95 },
      { word: 'philosophical', weight: 0.95 },
      { word: 'ponder', weight: 0.85 },
      { word: 'contemplate', weight: 0.85 },
      { word: 'existence', weight: 0.8 },
    ],
    antiKeywords: ['philosophy class', 'philosophy degree'],
  },

  examples: [
    'I want to discuss the big questions',
    "What's your philosophy of life?",
    'Help me contemplate the nature of existence',
  ],

  counterExamples: ["I'm taking a philosophy class"],

  arguments: [{ name: 'topic', type: 'string', required: false, description: 'Topic to explore' }],

  confidence: {
    baseScore: 0.78,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'philosophicalDialogue',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// MORAL DILEMMA NAVIGATION
// ============================================================================

export const moralDilemmaNavigationTool: SemanticToolDefinition = {
  id: 'meaning_moral_dilemma',
  name: 'Moral Dilemma Navigation',
  description: 'Navigate complex moral or ethical dilemmas.',
  shortDescription: 'navigate moral dilemma',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'moral dilemma',
      'ethical dilemma',
      "don't know what's right",
      "what's the right thing to do",
      'torn about what to do',
      'is it wrong to',
      'ethical question',
    ],
    patterns: [
      /\b(moral|ethical)\s+dilemma\b/i,
      /\bwhat's\s+the\s+right\s+thing\s+to\s+do\b/i,
      /\b(don't|do not)\s+know\s+what's\s+right\b/i,
      /\bis\s+it\s+(wrong|right)\s+to\b/i,
    ],
    keywords: [
      { word: 'moral', weight: 0.95 },
      { word: 'ethical', weight: 0.95 },
      { word: 'dilemma', weight: 0.9 },
      { word: 'right', weight: 0.75 },
      { word: 'wrong', weight: 0.75 },
      { word: 'should', weight: 0.7 },
    ],
    antiKeywords: ['hypothetical', 'trolley problem'],
  },

  examples: [
    'I have a moral dilemma',
    "I don't know what the right thing to do is",
    'Is it wrong to tell a lie to protect someone?',
  ],

  counterExamples: ["It's just a hypothetical moral dilemma"],

  arguments: [{ name: 'dilemma', type: 'string', required: false, description: 'The dilemma' }],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'moralDilemmaNavigation',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// AUTHENTIC LIVING
// ============================================================================

export const authenticLivingTool: SemanticToolDefinition = {
  id: 'meaning_authentic',
  name: 'Authentic Living',
  description: 'Live more authentically and true to self.',
  shortDescription: 'live authentically',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'be more authentic',
      'true to myself',
      'living a lie',
      'not being myself',
      'authentic life',
      'be who I really am',
      'stop pretending',
      'show my true self',
    ],
    patterns: [
      /\bbe\s+(more\s+)?authentic\b/i,
      /\btrue\s+to\s+myself\b/i,
      /\bliving\s+a\s+lie\b/i,
      /\bnot\s+being\s+myself\b/i,
    ],
    keywords: [
      { word: 'authentic', weight: 1.0 },
      { word: 'true', weight: 0.85 },
      { word: 'real', weight: 0.8 },
      { word: 'myself', weight: 0.75 },
      { word: 'pretending', weight: 0.85 },
      { word: 'genuine', weight: 0.9 },
    ],
    antiKeywords: ['authentic food', 'authentic product'],
  },

  examples: [
    'I want to be more authentic',
    "I feel like I'm not being true to myself",
    "I'm tired of pretending to be someone I'm not",
  ],

  counterExamples: ['Is this an authentic product?'],

  arguments: [
    { name: 'context', type: 'string', required: false, description: 'Where feeling inauthentic' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/meaning',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'authenticLiving',
      args,
      delegateTo: 'domains/meaning',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const meaningTools: SemanticToolDefinition[] = [
  clarifyValuesTool,
  purposeExplorationTool,
  meaningMakingTool,
  existentialReflectionTool,
  legacyPlanningTool,
  spiritualExplorationTool,
  valueConflictResolutionTool,
  lifePurposeStatementTool,
  meaningfulWorkTool,
  philosophicalDialogueTool,
  moralDilemmaNavigationTool,
  authenticLivingTool,
];
