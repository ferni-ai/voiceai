/**
 * Trauma Support Semantic Routing
 *
 * SAFETY-CRITICAL: These routes handle trauma-related conversations.
 * Must be trauma-informed, avoid retraumatization, and prioritize safety.
 *
 * Routes to: domains/trauma-support
 * Tools: traumaAwareSupport, groundingExercise, windowOfTolerance,
 *        traumaEducation, traumaTimeline, supportSystemMapping, professionalResourceFinder
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// TRAUMA-AWARE SUPPORT
// ============================================================================

export const traumaAwareSupportTool: SemanticToolDefinition = {
  id: 'trauma_aware_support',
  name: 'Trauma-Aware Support',
  description: 'Provide compassionate, trauma-informed support.',
  shortDescription: 'trauma support',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      "I've been through trauma",
      'I have trauma',
      'I was traumatized',
      'traumatic experience',
      'something bad happened to me',
      'I survived',
      "I'm a survivor",
      'what happened to me',
      'my past',
    ],
    patterns: [
      /\b(have|had|experienced)\s+trauma\b/i,
      /\btraumatic\s+(experience|event|thing)\b/i,
      /\b(I'm|I am)\s+a\s+survivor\b/i,
      /\bwhat\s+happened\s+to\s+me\b/i,
    ],
    keywords: [
      { word: 'trauma', weight: 1.0 },
      { word: 'traumatic', weight: 0.95 },
      { word: 'survivor', weight: 0.9 },
      { word: 'ptsd', weight: 0.9 },
      { word: 'traumatized', weight: 0.95 },
      { word: 'abuse', weight: 0.85 },
    ],
    antiKeywords: ['movie trauma', 'fictional', 'character trauma'],
  },

  examples: [
    "I'm dealing with trauma from my childhood",
    'I experienced something traumatic',
    "I'm a trauma survivor",
  ],

  counterExamples: [
    'The movie had a lot of trauma in it',
    'I learned about trauma in psychology class',
  ],

  arguments: [
    { name: 'readiness', type: 'string', required: false, description: 'How ready to discuss' },
    {
      name: 'currentState',
      type: 'string',
      required: false,
      description: 'Current emotional state',
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/trauma-support',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'traumaAwareSupport',
      args,
      delegateTo: 'domains/trauma-support',
    };
  },
};

// ============================================================================
// GROUNDING EXERCISE
// ============================================================================

export const groundingExerciseTool: SemanticToolDefinition = {
  id: 'trauma_grounding',
  name: 'Grounding Exercise',
  description: 'Guide through grounding exercises for dysregulation or flashbacks.',
  shortDescription: 'grounding for trauma',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      "I'm triggered",
      'I feel triggered',
      'having a flashback',
      'I need grounding',
      'help me ground',
      "I'm dissociating",
      "I don't feel real",
      'not in my body',
      'feeling detached',
      "I'm spiraling",
    ],
    patterns: [
      /\b(feeling|feel|am)\s+triggered\b/i,
      /\bhaving\s+a\s+flashback\b/i,
      /\b(need|help me)\s+ground(ing)?\b/i,
      /\b(dissociating|dissociated)\b/i,
      /\bnot\s+(in\s+)?(my\s+)?body\b/i,
    ],
    keywords: [
      { word: 'triggered', weight: 1.0 },
      { word: 'flashback', weight: 1.0 },
      { word: 'grounding', weight: 0.95 },
      { word: 'dissociating', weight: 0.95 },
      { word: 'detached', weight: 0.85 },
      { word: 'spiraling', weight: 0.8 },
    ],
    antiKeywords: ['already grounded', 'feel better'],
  },

  examples: [
    "I'm feeling triggered and need help grounding",
    "I'm having a flashback",
    "I feel like I'm dissociating",
  ],

  counterExamples: [
    'I grounded myself and feel better',
    'The movie triggered me a bit but I am okay',
  ],

  arguments: [
    { name: 'intensity', type: 'string', required: false, description: 'Mild to severe' },
    { name: 'location', type: 'string', required: false, description: 'Where they are' },
  ],

  confidence: {
    baseScore: 0.92,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/trauma-support',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'groundingExercise',
      args,
      delegateTo: 'domains/trauma-support',
    };
  },
};

// ============================================================================
// WINDOW OF TOLERANCE
// ============================================================================

export const windowOfToleranceTool: SemanticToolDefinition = {
  id: 'trauma_window_of_tolerance',
  name: 'Window of Tolerance',
  description: 'Help understand and expand window of tolerance.',
  shortDescription: 'window of tolerance help',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'window of tolerance',
      'easily overwhelmed',
      "I can't handle stress",
      'nervous system dysregulated',
      'hypervigilant',
      'always on edge',
      'shut down when stressed',
      'freeze response',
    ],
    patterns: [
      /\bwindow\s+of\s+tolerance\b/i,
      /\b(easily|quickly)\s+overwhelmed\b/i,
      /\b(hypervigilant|hyperaroused)\b/i,
      /\b(freeze|shutdown)\s+(response|mode)\b/i,
    ],
    keywords: [
      { word: 'overwhelmed', weight: 0.9 },
      { word: 'dysregulated', weight: 0.95 },
      { word: 'hypervigilant', weight: 1.0 },
      { word: 'freeze', weight: 0.85 },
      { word: 'shutdown', weight: 0.85 },
      { word: 'edge', weight: 0.7 },
    ],
    antiKeywords: ['feeling regulated', 'calm now'],
  },

  examples: [
    'My window of tolerance is so small',
    "I'm hypervigilant all the time",
    'I freeze when stressed',
  ],

  counterExamples: ["I've expanded my window of tolerance in therapy"],

  arguments: [
    { name: 'currentState', type: 'string', required: false, description: 'Hyper or hypo aroused' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/trauma-support',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'windowOfTolerance',
      args,
      delegateTo: 'domains/trauma-support',
    };
  },
};

// ============================================================================
// TRAUMA EDUCATION
// ============================================================================

export const traumaEducationTool: SemanticToolDefinition = {
  id: 'trauma_education',
  name: 'Trauma Education',
  description: 'Provide psychoeducation about trauma and its effects.',
  shortDescription: 'learn about trauma',
  category: 'wellness',
  priority: 3,

  triggers: {
    phrases: [
      'why do I react this way',
      'understand my trauma response',
      'is this normal after trauma',
      'how trauma affects the brain',
      'trauma symptoms',
      'what is ptsd',
      'am I traumatized',
      'effects of trauma',
    ],
    patterns: [
      /\bunderstand\s+(my\s+)?trauma\b/i,
      /\bwhy\s+(do\s+)?I\s+react\s+this\s+way\b/i,
      /\b(is\s+this|are\s+these)\s+normal\s+after\s+trauma\b/i,
      /\bhow\s+trauma\s+affects\b/i,
    ],
    keywords: [
      { word: 'understand', weight: 0.7 },
      { word: 'learn', weight: 0.7 },
      { word: 'normal', weight: 0.6 },
      { word: 'effects', weight: 0.75 },
      { word: 'symptoms', weight: 0.8 },
      { word: 'ptsd', weight: 0.9 },
    ],
    antiKeywords: ['teaching about', 'class on'],
  },

  examples: [
    'Why do I react this way after what happened',
    'Is it normal to feel this way after trauma',
    'How does trauma affect the brain',
  ],

  counterExamples: ["I'm teaching a class about trauma"],

  arguments: [
    {
      name: 'topic',
      type: 'string',
      required: false,
      description: 'Specific aspect to learn about',
    },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/trauma-support',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'traumaEducation',
      args,
      delegateTo: 'domains/trauma-support',
    };
  },
};

// ============================================================================
// TRAUMA TIMELINE
// ============================================================================

export const traumaTimelineTool: SemanticToolDefinition = {
  id: 'trauma_timeline',
  name: 'Trauma Timeline',
  description: 'Help create a trauma timeline for processing.',
  shortDescription: 'trauma timeline',
  category: 'wellness',
  priority: 4,

  triggers: {
    phrases: [
      'map my trauma',
      'trauma timeline',
      'history of what happened',
      'piece together my past',
      'understand what happened to me',
      'make sense of my history',
    ],
    patterns: [
      /\btrauma\s+timeline\b/i,
      /\bmap\s+(my\s+)?trauma\b/i,
      /\bpiece\s+together\s+(my\s+)?past\b/i,
      /\bhistory\s+of\s+what\s+happened\b/i,
    ],
    keywords: [
      { word: 'timeline', weight: 0.9 },
      { word: 'map', weight: 0.8 },
      { word: 'history', weight: 0.75 },
      { word: 'piece together', weight: 0.85 },
      { word: 'understand', weight: 0.7 },
    ],
    antiKeywords: ['completed timeline', 'already mapped'],
  },

  examples: [
    'Help me create a trauma timeline',
    "I'm trying to piece together what happened to me",
  ],

  counterExamples: ['I finished my trauma timeline in therapy'],

  arguments: [
    { name: 'readiness', type: 'string', required: false, description: 'Readiness level' },
    { name: 'support', type: 'string', required: false, description: 'Current support system' },
  ],

  confidence: {
    baseScore: 0.78,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/trauma-support',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'traumaTimeline',
      args,
      delegateTo: 'domains/trauma-support',
    };
  },
};

// ============================================================================
// SUPPORT SYSTEM MAPPING
// ============================================================================

export const supportSystemMappingTool: SemanticToolDefinition = {
  id: 'trauma_support_system',
  name: 'Support System Mapping',
  description: 'Help identify and strengthen support system.',
  shortDescription: 'map support system',
  category: 'wellness',
  priority: 3,

  triggers: {
    phrases: [
      "I don't have support",
      'who can I turn to',
      'need support system',
      'build a support network',
      'feel alone in this',
      'no one understands',
      'who can I tell',
      'safe people',
    ],
    patterns: [
      /\b(don't|no)\s+have\s+(a\s+)?support\b/i,
      /\bwho\s+can\s+I\s+(turn|talk)\s+to\b/i,
      /\bbuild\s+(a\s+)?support\s+(system|network)\b/i,
      /\bfeel\s+alone\b/i,
    ],
    keywords: [
      { word: 'support', weight: 0.9 },
      { word: 'network', weight: 0.8 },
      { word: 'alone', weight: 0.85 },
      { word: 'turn to', weight: 0.8 },
      { word: 'safe people', weight: 0.9 },
      { word: 'understands', weight: 0.75 },
    ],
    antiKeywords: ['great support', 'wonderful network'],
  },

  examples: [
    "I don't have anyone to support me through this",
    'Who can I turn to when I am struggling',
    'I feel so alone in dealing with this',
  ],

  counterExamples: ['I have a great support system'],

  arguments: [
    { name: 'currentSupports', type: 'string', required: false, description: 'Current supports' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/trauma-support',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'supportSystemMapping',
      args,
      delegateTo: 'domains/trauma-support',
    };
  },
};

// ============================================================================
// PROFESSIONAL RESOURCE FINDER
// ============================================================================

export const professionalResourceFinderTool: SemanticToolDefinition = {
  id: 'trauma_professional_resources',
  name: 'Professional Resource Finder',
  description: 'Help find professional trauma support resources.',
  shortDescription: 'find trauma therapist',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'find a trauma therapist',
      'need professional help',
      'trauma-informed therapist',
      'emdr therapist',
      'therapy for trauma',
      'professional support for trauma',
      'who can help me with trauma',
    ],
    patterns: [
      /\bfind\s+(a\s+)?trauma\s+therapist\b/i,
      /\btrauma-informed\s+(therapist|therapy|care)\b/i,
      /\b(emdr|cbt|somatic)\s+(therapist|therapy)\b/i,
      /\bprofessional\s+(help|support)\s+(for|with)\s+trauma\b/i,
    ],
    keywords: [
      { word: 'therapist', weight: 0.9 },
      { word: 'professional', weight: 0.85 },
      { word: 'emdr', weight: 1.0 },
      { word: 'trauma-informed', weight: 1.0 },
      { word: 'therapy', weight: 0.85 },
      { word: 'counselor', weight: 0.85 },
    ],
    antiKeywords: ['already seeing', 'current therapist'],
  },

  examples: [
    'Help me find a trauma-informed therapist',
    "I need professional help for what I've been through",
    'Looking for an EMDR therapist',
  ],

  counterExamples: ["I'm already seeing a trauma therapist"],

  arguments: [
    { name: 'location', type: 'string', required: false, description: 'Where they are located' },
    { name: 'preferences', type: 'string', required: false, description: 'Therapy preferences' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/trauma-support',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'professionalResourceFinder',
      args,
      delegateTo: 'domains/trauma-support',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const traumaSupportTools: SemanticToolDefinition[] = [
  traumaAwareSupportTool,
  groundingExerciseTool,
  windowOfToleranceTool,
  traumaEducationTool,
  traumaTimelineTool,
  supportSystemMappingTool,
  professionalResourceFinderTool,
];
