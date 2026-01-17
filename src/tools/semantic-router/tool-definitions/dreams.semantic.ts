/**
 * Dreams & Aspirations Semantic Routing
 *
 * Routes for bucket lists, life dreams, and aspiration tracking.
 * Helps users connect with their deepest desires and track progress.
 *
 * Routes to: domains/dreams
 * Tools: dreamClarification, bucketListBuilder, dreamTimeline,
 *        dreamObstacles, dreamProgress, dreamAccountability,
 *        dreamCelebration, dreamReconnection
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// DREAM CLARIFICATION
// ============================================================================

export const dreamClarificationTool: SemanticToolDefinition = {
  id: 'dreams_clarify',
  name: 'Dream Clarification',
  description: 'Help clarify and articulate life dreams.',
  shortDescription: 'clarify your dreams',
  category: 'life-planning',
  priority: 1,

  triggers: {
    phrases: [
      'what do I really want',
      'figure out my dreams',
      'what are my dreams',
      'what do I want out of life',
      "I don't know what I want",
      'clarify my dreams',
      'what should I do with my life',
      'find my passion',
    ],
    patterns: [
      /\bwhat\s+(do\s+)?I\s+(really\s+)?want\b/i,
      /\bfigure\s+out\s+(my\s+)?dreams\b/i,
      /\bwhat\s+(are\s+)?my\s+dreams\b/i,
      /\b(don't|do not)\s+know\s+what\s+I\s+want\b/i,
    ],
    keywords: [
      { word: 'dreams', weight: 0.9 },
      { word: 'want', weight: 0.75 },
      { word: 'passion', weight: 0.85 },
      { word: 'desire', weight: 0.8 },
      { word: 'aspiration', weight: 0.9 },
      { word: 'life', weight: 0.6 },
    ],
    antiKeywords: ['had a dream last night', 'dream I had', 'nightmare'],
  },

  examples: [
    "I don't know what I really want in life",
    'Help me figure out my dreams',
    'What do I want out of life?',
  ],

  counterExamples: ['I had a weird dream last night', "I had a nightmare I can't shake"],

  arguments: [
    { name: 'domain', type: 'string', required: false, description: 'Career, personal, etc.' },
    {
      name: 'currentSituation',
      type: 'string',
      required: false,
      description: 'Where they are now',
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/dreams',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'dreamClarification',
      args,
      delegateTo: 'domains/dreams',
    };
  },
};

// ============================================================================
// BUCKET LIST BUILDER
// ============================================================================

export const bucketListBuilderTool: SemanticToolDefinition = {
  id: 'dreams_bucket_list',
  name: 'Bucket List Builder',
  description: 'Create and manage a bucket list.',
  shortDescription: 'build bucket list',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'bucket list',
      'things to do before I die',
      'life list',
      'things I want to experience',
      'dream list',
      'add to my bucket list',
      'what should be on my bucket list',
    ],
    patterns: [
      /\bbucket\s+list\b/i,
      /\bthings\s+to\s+do\s+before\s+I\s+die\b/i,
      /\blife\s+(goals?\s+)?list\b/i,
      /\bwant\s+to\s+experience\b/i,
    ],
    keywords: [
      { word: 'bucket list', weight: 1.0 },
      { word: 'before I die', weight: 0.95 },
      { word: 'experience', weight: 0.75 },
      { word: 'life list', weight: 0.9 },
      { word: 'dreams', weight: 0.8 },
    ],
    antiKeywords: ['completed my bucket list', 'finished bucket list'],
  },

  examples: [
    'Help me create a bucket list',
    'I want to add skydiving to my bucket list',
    'What should be on my bucket list?',
  ],

  counterExamples: ["I've completed my entire bucket list"],

  arguments: [
    { name: 'category', type: 'string', required: false, description: 'Travel, adventure, etc.' },
    { name: 'item', type: 'string', required: false, description: 'Specific item to add' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.07,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/dreams',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'bucketListBuilder',
      args,
      delegateTo: 'domains/dreams',
    };
  },
};

// ============================================================================
// DREAM TIMELINE
// ============================================================================

export const dreamTimelineTool: SemanticToolDefinition = {
  id: 'dreams_timeline',
  name: 'Dream Timeline',
  description: 'Create a timeline for achieving dreams.',
  shortDescription: 'plan dream timeline',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'plan my dreams',
      'timeline for my goals',
      'when should I achieve this',
      'roadmap for my dreams',
      'path to my dreams',
      'steps to my dream',
      'how do I get there',
    ],
    patterns: [
      /\bplan\s+(my\s+)?dreams\b/i,
      /\btimeline\s+(for\s+)?(my\s+)?goals\b/i,
      /\broadmap\s+(for|to)\s+(my\s+)?dreams\b/i,
      /\bpath\s+to\s+(my\s+)?dreams\b/i,
    ],
    keywords: [
      { word: 'timeline', weight: 0.9 },
      { word: 'plan', weight: 0.8 },
      { word: 'roadmap', weight: 0.9 },
      { word: 'path', weight: 0.8 },
      { word: 'steps', weight: 0.75 },
      { word: 'achieve', weight: 0.8 },
    ],
    antiKeywords: ['already planned', 'have a timeline'],
  },

  examples: [
    'Help me create a timeline for my dreams',
    'What steps do I need to take to achieve my goal?',
    'Create a roadmap for my dreams',
  ],

  counterExamples: ['I already have a plan in place'],

  arguments: [
    { name: 'dream', type: 'string', required: false, description: 'Which dream to plan' },
    { name: 'timeframe', type: 'string', required: false, description: 'Desired timeframe' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/dreams',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'dreamTimeline',
      args,
      delegateTo: 'domains/dreams',
    };
  },
};

// ============================================================================
// DREAM OBSTACLES
// ============================================================================

export const dreamObstaclesTool: SemanticToolDefinition = {
  id: 'dreams_obstacles',
  name: 'Dream Obstacles',
  description: 'Identify and address obstacles to dreams.',
  shortDescription: 'overcome dream obstacles',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      "what's stopping me",
      "I can't achieve my dreams",
      'obstacles to my dreams',
      "why can't I reach my goals",
      'something holding me back',
      'barriers to my dreams',
      'stuck on my dreams',
    ],
    patterns: [
      /\bwhat's\s+stopping\s+me\b/i,
      /\b(can't|cannot)\s+achieve\s+(my\s+)?dreams\b/i,
      /\bobstacles?\s+to\s+(my\s+)?dreams\b/i,
      /\bholding\s+me\s+back\b/i,
    ],
    keywords: [
      { word: 'obstacle', weight: 0.95 },
      { word: 'stopping', weight: 0.85 },
      { word: 'barrier', weight: 0.9 },
      { word: 'stuck', weight: 0.8 },
      { word: 'cant', weight: 0.75 },
      { word: 'holding back', weight: 0.85 },
    ],
    antiKeywords: ['overcame obstacles', 'no obstacles'],
  },

  examples: [
    "What's stopping me from achieving my dreams?",
    'Something is holding me back from my goals',
    "I feel stuck and can't reach my dreams",
  ],

  counterExamples: ['I overcame all obstacles to my dream'],

  arguments: [
    { name: 'dream', type: 'string', required: false, description: 'Which dream' },
    { name: 'perceivedObstacle', type: 'string', required: false, description: 'Known obstacle' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/dreams',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'dreamObstacles',
      args,
      delegateTo: 'domains/dreams',
    };
  },
};

// ============================================================================
// DREAM PROGRESS
// ============================================================================

export const dreamProgressTool: SemanticToolDefinition = {
  id: 'dreams_progress',
  name: 'Dream Progress',
  description: 'Track and review progress toward dreams.',
  shortDescription: 'track dream progress',
  category: 'life-planning',
  priority: 3,

  triggers: {
    phrases: [
      'progress on my dreams',
      'how am I doing on my goals',
      'track my dream progress',
      'check in on my dreams',
      'review my progress',
      'am I making progress',
    ],
    patterns: [
      /\bprogress\s+(on\s+)?(my\s+)?dreams\b/i,
      /\bhow\s+am\s+I\s+doing\s+on\s+(my\s+)?goals\b/i,
      /\btrack\s+(my\s+)?dream\s+progress\b/i,
      /\breview\s+(my\s+)?progress\b/i,
    ],
    keywords: [
      { word: 'progress', weight: 0.95 },
      { word: 'track', weight: 0.85 },
      { word: 'review', weight: 0.8 },
      { word: 'check in', weight: 0.8 },
      { word: 'doing', weight: 0.6 },
    ],
    antiKeywords: ['no progress', 'havent started'],
  },

  examples: [
    'Check in on my dream progress',
    'How am I doing on my goals?',
    'Help me track my progress toward my dreams',
  ],

  counterExamples: ["I haven't made any progress"],

  arguments: [
    { name: 'dream', type: 'string', required: false, description: 'Which dream to review' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/dreams',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'dreamProgress',
      args,
      delegateTo: 'domains/dreams',
    };
  },
};

// ============================================================================
// DREAM ACCOUNTABILITY
// ============================================================================

export const dreamAccountabilityTool: SemanticToolDefinition = {
  id: 'dreams_accountability',
  name: 'Dream Accountability',
  description: 'Set up accountability for pursuing dreams.',
  shortDescription: 'dream accountability',
  category: 'life-planning',
  priority: 3,

  triggers: {
    phrases: [
      'hold me accountable',
      'accountability for my dreams',
      'I need accountability',
      'keep me on track',
      'check in with me on my goals',
      'make sure I follow through',
    ],
    patterns: [
      /\bhold\s+me\s+accountable\b/i,
      /\baccountability\s+(for\s+)?(my\s+)?dreams\b/i,
      /\bkeep\s+me\s+on\s+track\b/i,
      /\bfollow\s+through\b/i,
    ],
    keywords: [
      { word: 'accountability', weight: 1.0 },
      { word: 'accountable', weight: 0.95 },
      { word: 'track', weight: 0.8 },
      { word: 'check in', weight: 0.8 },
      { word: 'follow through', weight: 0.85 },
    ],
    antiKeywords: ['dont need accountability', 'self-motivated'],
  },

  examples: [
    'Hold me accountable for my dreams',
    'I need someone to keep me on track',
    'Can you check in with me on my goals?',
  ],

  counterExamples: ["I don't need accountability, I'm self-motivated"],

  arguments: [
    { name: 'dream', type: 'string', required: false, description: 'Which dream' },
    { name: 'frequency', type: 'string', required: false, description: 'How often to check in' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/dreams',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'dreamAccountability',
      args,
      delegateTo: 'domains/dreams',
    };
  },
};

// ============================================================================
// DREAM CELEBRATION
// ============================================================================

export const dreamCelebrationTool: SemanticToolDefinition = {
  id: 'dreams_celebration',
  name: 'Dream Celebration',
  description: 'Celebrate achieving a dream or milestone.',
  shortDescription: 'celebrate dream achieved',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'I did it',
      'I achieved my dream',
      'I reached my goal',
      'dream came true',
      'I finally did it',
      'accomplished my goal',
      'bucket list item complete',
    ],
    patterns: [
      /\bI\s+(did|achieved|reached|accomplished)\s+(it|my\s+(dream|goal))\b/i,
      /\bdream\s+came\s+true\b/i,
      /\bfinally\s+did\s+it\b/i,
      /\bbucket\s+list\s+item\s+complete\b/i,
    ],
    keywords: [
      { word: 'achieved', weight: 0.95 },
      { word: 'accomplished', weight: 0.95 },
      { word: 'did it', weight: 0.9 },
      { word: 'came true', weight: 0.95 },
      { word: 'complete', weight: 0.85 },
      { word: 'reached', weight: 0.85 },
    ],
    antiKeywords: ['didnt achieve', 'failed to'],
  },

  examples: [
    'I finally achieved my dream!',
    'My dream came true today',
    'I completed a bucket list item!',
  ],

  counterExamples: ["I didn't achieve my goal"],

  arguments: [
    { name: 'dream', type: 'string', required: false, description: 'What was achieved' },
    { name: 'feelings', type: 'string', required: false, description: 'How they feel' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/dreams',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'dreamCelebration',
      args,
      delegateTo: 'domains/dreams',
    };
  },
};

// ============================================================================
// DREAM RECONNECTION
// ============================================================================

export const dreamReconnectionTool: SemanticToolDefinition = {
  id: 'dreams_reconnection',
  name: 'Dream Reconnection',
  description: 'Reconnect with lost or forgotten dreams.',
  shortDescription: 'reconnect with dreams',
  category: 'life-planning',
  priority: 2,

  triggers: {
    phrases: [
      'forgot my dreams',
      'lost touch with my dreams',
      'what happened to my dreams',
      'gave up on my dreams',
      'used to have dreams',
      'reconnect with my dreams',
      'remember what I wanted',
    ],
    patterns: [
      /\bforgot\s+(my\s+)?dreams\b/i,
      /\blost\s+touch\s+with\s+(my\s+)?dreams\b/i,
      /\bgave\s+up\s+on\s+(my\s+)?dreams\b/i,
      /\bused\s+to\s+have\s+dreams\b/i,
    ],
    keywords: [
      { word: 'forgot', weight: 0.85 },
      { word: 'lost', weight: 0.8 },
      { word: 'gave up', weight: 0.9 },
      { word: 'used to', weight: 0.8 },
      { word: 'reconnect', weight: 0.9 },
      { word: 'remember', weight: 0.8 },
    ],
    antiKeywords: ['never had dreams', 'never forget'],
  },

  examples: [
    "I've lost touch with my dreams",
    'I gave up on my dreams years ago',
    'Help me reconnect with what I used to want',
  ],

  counterExamples: ['I never had any dreams'],

  arguments: [
    { name: 'timeframe', type: 'string', required: false, description: 'When dreams were lost' },
    { name: 'context', type: 'string', required: false, description: 'What happened' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/dreams',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'dreamReconnection',
      args,
      delegateTo: 'domains/dreams',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const dreamsTools: SemanticToolDefinition[] = [
  dreamClarificationTool,
  bucketListBuilderTool,
  dreamTimelineTool,
  dreamObstaclesTool,
  dreamProgressTool,
  dreamAccountabilityTool,
  dreamCelebrationTool,
  dreamReconnectionTool,
];
