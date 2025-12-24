/**
 * Self-Compassion Semantic Routing
 *
 * Routes for inner critic work, self-kindness, and self-worth.
 * Core "Better Than Human" emotional intelligence features.
 *
 * Routes to: domains/self-compassion
 * Tools: innerCriticDialogue, selfCompassionBreak, imposterSyndrome,
 *        perfectionism, shame, selfForgiveness, selfWorth, bodyImageCompassion,
 *        comparisonTrap, selfTalk, selfCareGuidance, boundarySupport
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// ============================================================================
// INNER CRITIC DIALOGUE
// ============================================================================

export const innerCriticDialogueTool: SemanticToolDefinition = {
  id: 'self_compassion_inner_critic',
  name: 'Inner Critic Dialogue',
  description: 'Work with the inner critic in a compassionate way.',
  shortDescription: 'inner critic work',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      "I'm so hard on myself",
      'my inner critic',
      "I can't stop criticizing myself",
      "I'm my own worst enemy",
      'negative self-talk',
      "I'm never good enough",
      'I hate myself',
      'beating myself up',
    ],
    patterns: [
      /\b(so|too)\s+hard\s+on\s+myself\b/i,
      /\binner\s+critic\b/i,
      /\b(can't|cannot)\s+stop\s+criticizing\s+myself\b/i,
      /\bmy\s+own\s+worst\s+enemy\b/i,
      /\bnever\s+good\s+enough\b/i,
    ],
    keywords: [
      { word: 'inner critic', weight: 1.0 },
      { word: 'self-criticism', weight: 0.95 },
      { word: 'hard on myself', weight: 0.9 },
      { word: 'beat myself up', weight: 0.9 },
      { word: 'hate myself', weight: 0.85 },
    ],
    antiKeywords: ['stopped criticizing', 'used to be hard on'],
  },

  examples: [
    "I'm so hard on myself all the time",
    'My inner critic never shuts up',
    'I hate myself for making that mistake',
  ],

  counterExamples: ['I used to be hard on myself but not anymore'],

  arguments: [
    { name: 'criticalVoice', type: 'string', required: false, description: 'What the critic says' },
    { name: 'trigger', type: 'string', required: false, description: 'What triggered it' },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.1,
    negativeKeywordPenalty: 0.5,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'innerCriticDialogue',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// SELF-COMPASSION BREAK
// ============================================================================

export const selfCompassionBreakTool: SemanticToolDefinition = {
  id: 'self_compassion_break',
  name: 'Self-Compassion Break',
  description: 'Guide through a self-compassion practice.',
  shortDescription: 'self-compassion practice',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      'be kinder to myself',
      'self-compassion',
      'treat myself better',
      'need compassion for myself',
      'be gentle with myself',
      'show myself kindness',
      'compassion practice',
    ],
    patterns: [
      /\bbe\s+(kinder|gentler|nicer)\s+to\s+myself\b/i,
      /\bself-compassion\b/i,
      /\btreat\s+myself\s+better\b/i,
      /\bshow\s+myself\s+(kindness|compassion)\b/i,
    ],
    keywords: [
      { word: 'self-compassion', weight: 1.0 },
      { word: 'kindness', weight: 0.85 },
      { word: 'gentle', weight: 0.8 },
      { word: 'treat myself', weight: 0.85 },
      { word: 'compassion', weight: 0.9 },
    ],
    antiKeywords: ['compassion for others', 'help others'],
  },

  examples: [
    'How do I practice self-compassion?',
    'I need to be kinder to myself',
    'Help me show myself some compassion',
  ],

  counterExamples: ['How do I show compassion to my partner?'],

  arguments: [
    { name: 'situation', type: 'string', required: false, description: 'Current struggle' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.07,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'selfCompassionBreak',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// IMPOSTER SYNDROME
// ============================================================================

export const imposterSyndromeTool: SemanticToolDefinition = {
  id: 'self_compassion_imposter',
  name: 'Imposter Syndrome',
  description: 'Address imposter syndrome and feeling like a fraud.',
  shortDescription: 'imposter syndrome help',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'imposter syndrome',
      'feel like a fraud',
      "I'm a fake",
      "I don't deserve this",
      "they're going to find out",
      "I don't belong here",
      'everyone is smarter than me',
      'faking it',
    ],
    patterns: [
      /\bimposter\s+syndrome\b/i,
      /\bfeel\s+like\s+a\s+(fraud|fake|phony)\b/i,
      /\bthey're\s+going\s+to\s+find\s+out\b/i,
      /\bdon't\s+(belong|deserve)\b/i,
    ],
    keywords: [
      { word: 'imposter', weight: 1.0 },
      { word: 'fraud', weight: 0.95 },
      { word: 'fake', weight: 0.9 },
      { word: 'phony', weight: 0.9 },
      { word: 'dont belong', weight: 0.85 },
      { word: 'dont deserve', weight: 0.85 },
    ],
    antiKeywords: ['overcame imposter', 'used to feel like a fraud'],
  },

  examples: [
    'I have terrible imposter syndrome',
    'I feel like a fraud at work',
    "I don't deserve this promotion",
  ],

  counterExamples: ['I overcame my imposter syndrome'],

  arguments: [
    { name: 'context', type: 'string', required: false, description: 'Where feeling this' },
    { name: 'evidence', type: 'string', required: false, description: 'What makes them feel this' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'imposterSyndrome',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// PERFECTIONISM
// ============================================================================

export const perfectionismSelfCompassionTool: SemanticToolDefinition = {
  id: 'self_compassion_perfectionism',
  name: 'Perfectionism',
  description: 'Address perfectionism and impossible standards.',
  shortDescription: 'perfectionism help',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      "I'm a perfectionist",
      'has to be perfect',
      "can't accept anything less than perfect",
      'impossibly high standards',
      "good enough isn't good enough",
      'fear of not being perfect',
      'paralyzed by perfectionism',
    ],
    patterns: [
      /\bperfectionist\b/i,
      /\bhas\s+to\s+be\s+perfect\b/i,
      /\b(impossibly\s+)?high\s+standards\b/i,
      /\bgood\s+enough\s+(isn't|is not)\s+good\s+enough\b/i,
    ],
    keywords: [
      { word: 'perfectionist', weight: 1.0 },
      { word: 'perfect', weight: 0.85 },
      { word: 'standards', weight: 0.75 },
      { word: 'flawless', weight: 0.9 },
      { word: 'never enough', weight: 0.85 },
    ],
    antiKeywords: ['recovering perfectionist', 'let go of perfect'],
  },

  examples: [
    "I'm such a perfectionist it's paralyzing me",
    'Everything has to be perfect or I feel like a failure',
    'My standards are impossibly high',
  ],

  counterExamples: ["I'm a recovering perfectionist"],

  arguments: [
    { name: 'area', type: 'string', required: false, description: 'Where perfectionism shows up' },
  ],

  confidence: {
    baseScore: 0.83,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'perfectionism',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// SHAME
// ============================================================================

export const shameTool: SemanticToolDefinition = {
  id: 'self_compassion_shame',
  name: 'Shame',
  description: 'Process shame and unworthiness.',
  shortDescription: 'work through shame',
  category: 'wellness',
  priority: 1,

  triggers: {
    phrases: [
      'I feel so ashamed',
      "I'm ashamed of myself",
      'deep shame',
      "I'm a bad person",
      "I'm worthless",
      'I feel like garbage',
      'I disgust myself',
      "I'm unworthy",
    ],
    patterns: [
      /\bfeel\s+(so\s+)?ashamed\b/i,
      /\bashamed\s+of\s+(myself|me)\b/i,
      /\b(I'm|I am)\s+(a\s+)?bad\s+person\b/i,
      /\b(I'm|I am)\s+(worthless|unworthy)\b/i,
    ],
    keywords: [
      { word: 'shame', weight: 1.0 },
      { word: 'ashamed', weight: 1.0 },
      { word: 'worthless', weight: 0.95 },
      { word: 'unworthy', weight: 0.95 },
      { word: 'bad person', weight: 0.9 },
      { word: 'garbage', weight: 0.85 },
    ],
    antiKeywords: ['released shame', 'worked through shame'],
  },

  examples: [
    "I'm so ashamed of myself",
    'I feel deep shame about what I did',
    'I feel like a worthless person',
  ],

  counterExamples: ["I've worked through my shame in therapy"],

  arguments: [
    { name: 'source', type: 'string', required: false, description: 'Source of shame' },
    { name: 'intensity', type: 'string', required: false, description: 'How intense' },
  ],

  confidence: {
    baseScore: 0.88,
    patternMatchBonus: 0.07,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.45,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'shame',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// SELF-FORGIVENESS
// ============================================================================

export const selfForgivenessTool: SemanticToolDefinition = {
  id: 'self_compassion_forgiveness',
  name: 'Self-Forgiveness',
  description: 'Guide through self-forgiveness process.',
  shortDescription: 'forgive yourself',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      "I can't forgive myself",
      'forgive myself',
      "I'll never forgive myself",
      "can't let go of what I did",
      'I made a terrible mistake',
      "can't move past this",
      'self-forgiveness',
    ],
    patterns: [
      /\b(can't|cannot)\s+forgive\s+myself\b/i,
      /\bneed\s+to\s+forgive\s+myself\b/i,
      /\bself-forgiveness\b/i,
      /\b(can't|cannot)\s+(let\s+go|move\s+past)\b/i,
    ],
    keywords: [
      { word: 'forgive', weight: 0.95 },
      { word: 'forgiveness', weight: 0.95 },
      { word: 'let go', weight: 0.8 },
      { word: 'move past', weight: 0.8 },
      { word: 'mistake', weight: 0.75 },
      { word: 'regret', weight: 0.8 },
    ],
    antiKeywords: ['forgave myself', 'already forgiven'],
  },

  examples: [
    "I can't forgive myself for what I did",
    'How do I practice self-forgiveness?',
    "I'll never let go of this mistake",
  ],

  counterExamples: ["I've forgiven myself and moved on"],

  arguments: [
    { name: 'action', type: 'string', required: false, description: 'What happened' },
    { name: 'timeframe', type: 'string', required: false, description: 'How long ago' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'selfForgiveness',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// SELF-WORTH
// ============================================================================

export const selfWorthTool: SemanticToolDefinition = {
  id: 'self_compassion_worth',
  name: 'Self-Worth',
  description: 'Build and strengthen sense of self-worth.',
  shortDescription: 'build self-worth',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      "I don't feel worthy",
      'low self-worth',
      "I'm not good enough",
      "I don't matter",
      'feel valuable',
      'worthy of love',
      "I don't deserve good things",
      'self-worth',
    ],
    patterns: [
      /\b(don't|do not)\s+feel\s+worthy\b/i,
      /\blow\s+self-worth\b/i,
      /\b(I'm|I am)\s+not\s+good\s+enough\b/i,
      /\b(don't|do not)\s+(deserve|matter)\b/i,
    ],
    keywords: [
      { word: 'worthy', weight: 0.95 },
      { word: 'worth', weight: 0.9 },
      { word: 'matter', weight: 0.8 },
      { word: 'deserve', weight: 0.85 },
      { word: 'valuable', weight: 0.8 },
      { word: 'enough', weight: 0.75 },
    ],
    antiKeywords: ['feel worthy', 'know my worth'],
  },

  examples: [
    "I don't feel worthy of good things",
    'How do I build self-worth?',
    "I don't feel like I matter",
  ],

  counterExamples: ['I know my worth now'],

  arguments: [
    { name: 'context', type: 'string', required: false, description: 'Where feeling unworthy' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'selfWorth',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// BODY IMAGE COMPASSION
// ============================================================================

export const bodyImageCompassionTool: SemanticToolDefinition = {
  id: 'self_compassion_body_image',
  name: 'Body Image Compassion',
  description: 'Address body image struggles with compassion.',
  shortDescription: 'body image support',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'hate my body',
      "I'm ugly",
      "I'm fat",
      'body image issues',
      "don't like how I look",
      'disgusted with my body',
      'feel ugly',
      'body shame',
    ],
    patterns: [
      /\bhate\s+(my\s+)?body\b/i,
      /\b(I'm|I am|feel)\s+(ugly|fat|disgusting)\b/i,
      /\bbody\s+(image|shame)\b/i,
      /\bdon't\s+like\s+how\s+I\s+look\b/i,
    ],
    keywords: [
      { word: 'body', weight: 0.8 },
      { word: 'ugly', weight: 0.9 },
      { word: 'fat', weight: 0.85 },
      { word: 'appearance', weight: 0.75 },
      { word: 'look', weight: 0.7 },
      { word: 'weight', weight: 0.8 },
    ],
    antiKeywords: ['love my body', 'body positive', 'accept my body'],
  },

  examples: [
    'I hate my body',
    'I have terrible body image issues',
    "I'm disgusted when I look in the mirror",
  ],

  counterExamples: ["I'm learning to love my body"],

  arguments: [
    { name: 'specifics', type: 'string', required: false, description: 'Specific concerns' },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'bodyImageCompassion',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// COMPARISON TRAP
// ============================================================================

export const comparisonTrapTool: SemanticToolDefinition = {
  id: 'self_compassion_comparison',
  name: 'Comparison Trap',
  description: 'Address the trap of comparing to others.',
  shortDescription: 'stop comparing yourself',
  category: 'wellness',
  priority: 3,

  triggers: {
    phrases: [
      'comparing myself to others',
      'everyone is doing better than me',
      "why can't I be like them",
      'jealous of others',
      'social media comparison',
      'everyone has it together except me',
      "I'm behind in life",
    ],
    patterns: [
      /\bcomparing\s+(myself|me)\s+to\b/i,
      /\beveryone\s+(is|seems)\s+(doing\s+)?better\b/i,
      /\bwhy\s+can't\s+I\s+be\s+like\b/i,
      /\bbehind\s+in\s+life\b/i,
    ],
    keywords: [
      { word: 'comparing', weight: 0.95 },
      { word: 'comparison', weight: 0.95 },
      { word: 'jealous', weight: 0.85 },
      { word: 'behind', weight: 0.8 },
      { word: 'everyone else', weight: 0.85 },
    ],
    antiKeywords: ['stopped comparing', 'dont compare anymore'],
  },

  examples: [
    'I keep comparing myself to everyone on social media',
    'Everyone is doing better than me',
    'I feel so behind in life compared to my friends',
  ],

  counterExamples: ["I've stopped comparing myself to others"],

  arguments: [{ name: 'context', type: 'string', required: false, description: 'Where comparing' }],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'comparisonTrap',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// SELF-TALK
// ============================================================================

export const selfTalkTool: SemanticToolDefinition = {
  id: 'self_compassion_self_talk',
  name: 'Self-Talk',
  description: 'Help improve internal self-talk.',
  shortDescription: 'improve self-talk',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      'negative self-talk',
      'what I say to myself',
      'change how I talk to myself',
      'inner voice',
      'speak to myself harshly',
      'internal dialogue',
      'kinder to myself in my head',
    ],
    patterns: [
      /\bnegative\s+self-talk\b/i,
      /\bhow\s+I\s+talk\s+to\s+myself\b/i,
      /\binner\s+voice\b/i,
      /\binternal\s+dialogue\b/i,
    ],
    keywords: [
      { word: 'self-talk', weight: 1.0 },
      { word: 'inner voice', weight: 0.9 },
      { word: 'talk to myself', weight: 0.85 },
      { word: 'internal', weight: 0.75 },
      { word: 'head', weight: 0.6 },
    ],
    antiKeywords: ['positive self-talk', 'kind to myself'],
  },

  examples: ['I have terrible negative self-talk', 'How do I change the way I talk to myself?'],

  counterExamples: ['My self-talk has improved a lot'],

  arguments: [
    { name: 'currentPattern', type: 'string', required: false, description: 'Current self-talk' },
  ],

  confidence: {
    baseScore: 0.8,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'selfTalk',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// SELF-CARE GUIDANCE
// ============================================================================

export const selfCareGuidanceTool: SemanticToolDefinition = {
  id: 'self_compassion_self_care',
  name: 'Self-Care Guidance',
  description: 'Guide towards meaningful self-care practices.',
  shortDescription: 'self-care guidance',
  category: 'wellness',
  priority: 3,

  triggers: {
    phrases: [
      'self-care',
      'take care of myself',
      'prioritize myself',
      'I never put myself first',
      'me time',
      'neglecting myself',
      'care for myself',
    ],
    patterns: [
      /\bself-care\b/i,
      /\btake\s+care\s+of\s+myself\b/i,
      /\bprioritize\s+(myself|me)\b/i,
      /\bnever\s+put\s+myself\s+first\b/i,
    ],
    keywords: [
      { word: 'self-care', weight: 1.0 },
      { word: 'care for myself', weight: 0.9 },
      { word: 'prioritize', weight: 0.8 },
      { word: 'me time', weight: 0.85 },
      { word: 'first', weight: 0.6 },
    ],
    antiKeywords: ['good at self-care', 'already prioritize'],
  },

  examples: [
    "I'm terrible at self-care",
    'I need to learn to put myself first',
    "I've been neglecting myself",
  ],

  counterExamples: ["I'm good at taking care of myself now"],

  arguments: [
    { name: 'barriers', type: 'string', required: false, description: 'What gets in the way' },
  ],

  confidence: {
    baseScore: 0.78,
    patternMatchBonus: 0.12,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.35,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'selfCareGuidance',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// BOUNDARY SUPPORT
// ============================================================================

export const boundarySupportTool: SemanticToolDefinition = {
  id: 'self_compassion_boundaries',
  name: 'Boundary Support',
  description: 'Help with setting and maintaining personal boundaries.',
  shortDescription: 'set boundaries',
  category: 'wellness',
  priority: 2,

  triggers: {
    phrases: [
      "I can't say no",
      'set boundaries',
      'people pleaser',
      'everyone walks all over me',
      "I don't have boundaries",
      'learning to say no',
      'boundary issues',
      'feel guilty saying no',
    ],
    patterns: [
      /\b(can't|cannot)\s+say\s+no\b/i,
      /\bset\s+boundaries\b/i,
      /\bpeople\s+pleaser\b/i,
      /\bwalk(s|ed)?\s+(all\s+)?over\s+me\b/i,
      /\bfeel\s+guilty\s+saying\s+no\b/i,
    ],
    keywords: [
      { word: 'boundaries', weight: 0.95 },
      { word: 'say no', weight: 0.9 },
      { word: 'people pleaser', weight: 0.95 },
      { word: 'limits', weight: 0.8 },
      { word: 'guilty', weight: 0.75 },
    ],
    antiKeywords: ['good at boundaries', 'strong boundaries'],
  },

  examples: [
    "I can't say no to anyone",
    "I'm a people pleaser and it's exhausting",
    'I need help setting boundaries',
  ],

  counterExamples: ['I have good boundaries now'],

  arguments: [
    { name: 'relationship', type: 'string', required: false, description: 'With whom' },
    { name: 'situation', type: 'string', required: false, description: 'Specific situation' },
  ],

  confidence: {
    baseScore: 0.82,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.15,
    negativeKeywordPenalty: 0.4,
  },

  delegateTo: 'domains/self-compassion',
  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'boundarySupport',
      args,
      delegateTo: 'domains/self-compassion',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const selfCompassionTools: SemanticToolDefinition[] = [
  innerCriticDialogueTool,
  selfCompassionBreakTool,
  imposterSyndromeTool,
  perfectionismSelfCompassionTool,
  shameTool,
  selfForgivenessTool,
  selfWorthTool,
  bodyImageCompassionTool,
  comparisonTrapTool,
  selfTalkTool,
  selfCareGuidanceTool,
  boundarySupportTool,
];
