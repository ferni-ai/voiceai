/**
 * Health Diagnosis Semantic Routing
 *
 * SAFETY-CRITICAL: These routes handle users processing medical diagnoses.
 * Must be compassionate, avoid medical advice, and prioritize emotional support.
 *
 * Routes to: domains/health-diagnosis
 * Tools: diagnosisShock, chronicIllnessLife, invisibleIllness, tellingOthers
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// DIAGNOSIS SHOCK
// ============================================================================

export const diagnosisShockTool: SemanticToolDefinition = {
  id: 'health_diagnosis_shock',
  name: 'Diagnosis Shock Support',
  description: 'Support someone processing a new medical diagnosis.',
  shortDescription: 'diagnosis support',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      'I just got diagnosed',
      'the doctor told me I have',
      'I found out I have',
      'just received a diagnosis',
      'they found something',
      'test results came back',
      'I have cancer',
      'I have diabetes',
      'I was diagnosed with',
      'processing my diagnosis',
    ],
    patterns: [
      /\b(just\s+)?(got|received|have)\s+(a\s+)?diagnos(is|ed)\b/i,
      /\bdoctor\s+(told|said)\s+I\s+have\b/i,
      /\bfound\s+out\s+I\s+have\b/i,
      /\btest\s+results\s+(came|are)\b/i,
      /\bI\s+have\s+(cancer|diabetes|ms|lupus|crohn's|fibromyalgia)\b/i,
    ],
    keywords: [
      { word: 'diagnosis', weight: 1.0 },
      { word: 'diagnosed', weight: 1.0 },
      { word: 'doctor', weight: 0.7 },
      { word: 'test results', weight: 0.9 },
      { word: 'found out', weight: 0.8 },
      { word: 'cancer', weight: 0.95 },
      { word: 'diabetes', weight: 0.85 },
      { word: 'chronic', weight: 0.8 },
    ],
    antiKeywords: ['hypothetical', 'character in', 'movie about'],
  },

  examples: [
    'I just got diagnosed with diabetes',
    'The doctor told me I have cancer',
    'My test results came back and they found something',
  ],

  counterExamples: [
    'I diagnosed the problem with my car',
    "What's your diagnosis of the situation?",
  ],

  arguments: [
    { name: 'diagnosisType', type: 'string', required: false, description: 'Type of diagnosis' },
    { name: 'timeframe', type: 'string', required: false, description: 'When they received it' },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/health-diagnosis',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'diagnosisShock',
      args,
      delegateTo: 'domains/health-diagnosis',
    };
  },
};

// ============================================================================
// CHRONIC ILLNESS LIFE
// ============================================================================

export const chronicIllnessLifeTool: SemanticToolDefinition = {
  id: 'health_chronic_illness',
  name: 'Chronic Illness Support',
  description: 'Support for living with a chronic illness.',
  shortDescription: 'chronic illness support',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'living with my illness',
      'chronic illness',
      'chronic condition',
      'managing my health condition',
      'life with my disease',
      'autoimmune disease',
      "it's hard being sick all the time",
      'chronic pain',
      "I'll never be healthy again",
    ],
    patterns: [
      /\bchronic\s+(illness|condition|disease|pain)\b/i,
      /\bliving\s+with\s+(my\s+)?(illness|condition|disease)\b/i,
      /\bautoimmune\s+(disease|condition)\b/i,
      /\bsick\s+all\s+the\s+time\b/i,
    ],
    keywords: [
      { word: 'chronic', weight: 1.0 },
      { word: 'illness', weight: 0.9 },
      { word: 'autoimmune', weight: 0.95 },
      { word: 'flare', weight: 0.85 },
      { word: 'remission', weight: 0.85 },
      { word: 'symptoms', weight: 0.75 },
    ],
    antiKeywords: ['recovering', 'cured', 'all better'],
  },

  examples: [
    "It's hard living with my chronic illness",
    "I'm having another flare up",
    'Managing my autoimmune disease is exhausting',
  ],

  counterExamples: ['I had a cold but I am all better now'],

  arguments: [
    { name: 'condition', type: 'string', required: false, description: 'The chronic condition' },
    { name: 'currentState', type: 'string', required: false, description: 'Flare/remission status' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/health-diagnosis',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'chronicIllnessLife',
      args,
      delegateTo: 'domains/health-diagnosis',
    };
  },
};

// ============================================================================
// INVISIBLE ILLNESS
// ============================================================================

export const invisibleIllnessTool: SemanticToolDefinition = {
  id: 'health_invisible_illness',
  name: 'Invisible Illness Support',
  description: 'Support for those with conditions others cannot see.',
  shortDescription: 'invisible illness',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      "you don't look sick",
      'but you look fine',
      'invisible illness',
      "no one believes I'm sick",
      "people think I'm faking",
      "they don't understand my condition",
      'hidden disability',
      'looking healthy but feeling awful',
    ],
    patterns: [
      /\b(don't|doesn't)\s+look\s+sick\b/i,
      /\binvisible\s+(illness|condition|disability)\b/i,
      /\b(people|they)\s+think\s+I'?m\s+faking\b/i,
      /\bhidden\s+(illness|disability|condition)\b/i,
    ],
    keywords: [
      { word: 'invisible', weight: 1.0 },
      { word: 'hidden', weight: 0.9 },
      { word: 'look fine', weight: 0.95 },
      { word: 'faking', weight: 0.85 },
      { word: 'understand', weight: 0.7 },
      { word: 'believe', weight: 0.75 },
    ],
    antiKeywords: ['visible injury', 'obvious'],
  },

  examples: [
    "People keep telling me I don't look sick",
    "It's hard when no one believes I am in pain",
    'My illness is invisible but very real',
  ],

  counterExamples: ['I have a visible injury everyone can see'],

  arguments: [
    { name: 'situation', type: 'string', required: false, description: 'Current situation' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/health-diagnosis',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'invisibleIllness',
      args,
      delegateTo: 'domains/health-diagnosis',
    };
  },
};

// ============================================================================
// TELLING OTHERS
// ============================================================================

export const tellingOthersTool: SemanticToolDefinition = {
  id: 'health_telling_others',
  name: 'Telling Others About Diagnosis',
  description: 'Support for communicating health conditions to others.',
  shortDescription: 'telling others about illness',
  category: 'wellness',
  priority: 3,

  triggers: {
    phrases: [
      'how do I tell people',
      'telling my family about my diagnosis',
      'should I tell my boss',
      'tell my kids about my illness',
      'disclosing my condition',
      'when to share my diagnosis',
      "I don't know how to tell them",
      'afraid to tell anyone',
    ],
    patterns: [
      /\bhow\s+(do\s+)?I\s+tell\s+(people|family|friends|boss|kids)\b/i,
      /\btelling\s+(my\s+)?(family|friends|boss|kids)\s+about\b/i,
      /\b(disclose|disclosing)\s+(my\s+)?(condition|illness|diagnosis)\b/i,
      /\bafraid\s+to\s+tell\b/i,
    ],
    keywords: [
      { word: 'tell', weight: 0.9 },
      { word: 'disclose', weight: 0.95 },
      { word: 'share', weight: 0.8 },
      { word: 'family', weight: 0.75 },
      { word: 'boss', weight: 0.8 },
      { word: 'afraid', weight: 0.7 },
    ],
    antiKeywords: ['already told', 'everyone knows'],
  },

  examples: [
    'How do I tell my kids about my cancer diagnosis',
    "I'm afraid to tell my boss about my condition",
    "I don't know how to share my diagnosis with my family",
  ],

  counterExamples: ["I already told everyone and they're supportive"],

  arguments: [
    { name: 'audience', type: 'string', required: false, description: 'Who they want to tell' },
    { name: 'condition', type: 'string', required: false, description: 'The condition to disclose' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/health-diagnosis',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'tellingOthers',
      args,
      delegateTo: 'domains/health-diagnosis',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const healthDiagnosisTools: SemanticToolDefinition[] = [
  diagnosisShockTool,
  chronicIllnessLifeTool,
  invisibleIllnessTool,
  tellingOthersTool,
];
