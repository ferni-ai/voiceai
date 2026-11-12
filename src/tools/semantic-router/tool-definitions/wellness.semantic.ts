/**
 * Wellness Tool Definitions for Semantic Router
 *
 * Semantic routing for wellness, grounding, and mental health support.
 * These tools are boosted when voice emotion detects stress/anxiety.
 *
 * @module tools/semantic-router/tool-definitions/wellness
 */

import type {
  SemanticToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../types.js';

// No turn with risk language may get a wellness pattern hit: the crisis tools own those.
// Every trigger of the two tools below goes through riskGuarded(), including their former
// plain phrases (a phrase can't carry a guard). Stems catch word forms ("killing", "hanged").
// Patterns run on normalizeText output, which rewrites a straight-apostrophe "can't" to
// "cannot" and "n't" to " not"; curly apostrophes pass through unchanged.
//
// A word list has a known limit: risk said without any of these words (joined, elongated
// or contextual forms) still gets a hit when the turn also has a mild phrase. Broader mild
// patterns wait for the crisis check before ranking (task #15), so they can't take the
// head from a crisis tool.
const RISK_TERMS = [
  // Self-harm and suicide, with word forms
  String.raw`kill\w*`,
  'kms',
  String.raw`suicid\w*`,
  String.raw`unaliv\w*`,
  String.raw`di(?:e|es|ed)`,
  'dying',
  'dead',
  'death',
  String.raw`hurt\w*\s+(?:myself|me)`,
  String.raw`harm\w*\s+myself`,
  String.raw`self[-\s]?harm\w*`,
  String.raw`cut\w*\s+myself`,
  String.raw`hang\w*\s+myself`,
  String.raw`shoot\w*\s+myself`,
  String.raw`slit\w*`,
  'wrists?',
  String.raw`overdos\w*`,
  'pills',
  String.raw`jump(?:s|ed|ing)?`,
  // Indirect forms
  String.raw`better\s+off\s+without\s+me`,
  String.raw`not\s+(?:want\s+to\s+)?(?:be\s+)?here\s+anymore`,
  String.raw`disappear\w*`,
  String.raw`end\w*\s+(?:it|things|everything|my\s+life)`,
  String.raw`can(?:not|['’]?t)\s+(?:go\s+on|(?:do\s+this|take\s+it)\s+anymore)`,
  String.raw`no\s+(?:point|reason\s+to\s+live)`,
  'alive',
  'live',
  String.raw`wake\s+up`,
  'safe',
  'gone',
  // Risk phrases of the crisis sites that share words with a mild phrase below
  String.raw`struggling\s+for`,
  String.raw`depressed\s+for\s+(?:weeks|months|years)`,
  // Spanish
  String.raw`matar\w*`,
  String.raw`morir\w*`,
  String.raw`muert[oa]s?`,
  String.raw`quitarme\s+la\s+vida`,
  String.raw`hacerme\s+da[ñn]o`,
  String.raw`no\s+quiero\s+vivir`,
  'pastillas',
];
const NOT_RISK = String.raw`(?![\s\S]*\b(?:${RISK_TERMS.join('|')})\b)`;

/** Prefix the risk guard: an anchored pattern stays anchored, any other matches anywhere. */
export function riskGuarded(pattern: RegExp): RegExp {
  const body = pattern.source.startsWith('^')
    ? pattern.source.slice(1)
    : String.raw`[\s\S]*?(?:${pattern.source})`;
  return new RegExp(`^${NOT_RISK}${body}`, pattern.flags);
}

/** Whole-word phrases as one regex (the registry's phrase match, as a pattern). */
const anyPhrase = (...phrases: string[]): RegExp =>
  new RegExp(
    String.raw`\b(?:${phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\b`,
    'i'
  );

// ============================================================================
// GROUNDING EXERCISE
// ============================================================================

export const groundingExerciseTool: SemanticToolDefinition = {
  id: 'grounding_exercise',
  name: 'Grounding Exercise',
  description:
    'Guides through a grounding exercise to help with anxiety, stress, or feeling overwhelmed.',
  shortDescription: 'do a grounding exercise',
  category: 'wellness',
  // Offer, don't auto-run: a mild line gets a hint and the companion asks first (fe, #3733).
  requiresConfirmation: true,

  triggers: {
    patterns: [
      anyPhrase(
        "I'm anxious",
        "I'm stressed",
        'feeling overwhelmed',
        'need to calm down',
        'help me relax',
        'grounding exercise',
        'breathing exercise',
        "I'm panicking",
        'having a panic attack',
        'calm me down'
      ),
      /^i(?:'m| am)\s+(?:feeling\s+)?(?:anxious|stressed|overwhelmed|panicking)/i,
      /^(?:i\s+)?need\s+(?:to\s+)?(?:calm\s+down|relax|ground\s+myself)/i,
      /^(?:help|can\s+you\s+help)\s+me\s+(?:calm\s+down|relax|feel\s+better)/i,
      /^(?:do\s+)?(?:a\s+)?(?:grounding|breathing|calming)\s+exercise/i,
      /^(?:i(?:'m| am)\s+)?having\s+(?:a\s+)?(?:panic\s+attack|anxiety\s+attack)/i,
    ].map(riskGuarded),
    keywords: [
      { word: 'anxious', weight: 1.0 },
      { word: 'anxiety', weight: 1.0 },
      { word: 'stressed', weight: 0.9 },
      { word: 'stress', weight: 0.9 },
      { word: 'overwhelmed', weight: 0.9 },
      { word: 'panic', weight: 1.0 },
      { word: 'calm', weight: 0.8 },
      { word: 'relax', weight: 0.7 },
      { word: 'breathe', weight: 0.8 },
      { word: 'breathing', weight: 0.8 },
      { word: 'grounding', weight: 1.0 },
    ],
    antiKeywords: [],
  },

  examples: [
    "I'm feeling really anxious",
    'Help me calm down',
    "I'm having a panic attack",
    'I need a grounding exercise',
    "I'm so stressed out",
    'Can you help me relax?',
    'Do a breathing exercise with me',
    "I'm overwhelmed",
    'I need to calm down',
    "I can't stop my racing thoughts",
  ],

  counterExamples: [
    "I'm excited about the party",
    'Tell me a joke',
    "What's the weather?",
    'Play some music',
  ],

  arguments: [
    {
      name: 'type',
      type: 'string',
      description: 'Type of exercise',
      required: false,
      enumValues: ['breathing', '5-4-3-2-1', 'body_scan', 'progressive_relaxation'],
      extractionPatterns: [/(breathing|body\s+scan|progressive|5-4-3-2-1)/i],
    },
  ],

  confidence: {
    baseScore: 0.9,
    patternMatchBonus: 0.05,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.2,
  },

  // This tool gets boosted when voice emotion shows stress
  contextBoosts: {
    emotionBoost: {
      condition: 'stress > 0.6 || anxiety > 0',
      boost: 0.2,
    },
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'grounding_exercise',
      args,
      delegateTo: 'domains/wellness',
    };
  },
};

// ============================================================================
// WELLNESS CHECK-IN
// ============================================================================

export const wellnessCheckinTool: SemanticToolDefinition = {
  id: 'wellness_checkin',
  name: 'Wellness Check-in',
  description: 'A supportive check-in about how you are feeling emotionally and mentally.',
  shortDescription: 'check in on wellness',
  category: 'wellness',
  // Offer, don't auto-run: a mild line gets a hint and the companion asks first (fe, #3733).
  requiresConfirmation: true,

  triggers: {
    patterns: [
      anyPhrase(
        "I'm not okay",
        "I'm struggling",
        'having a hard time',
        "I don't feel good",
        'feeling down',
        'feeling sad',
        'feeling depressed',
        "I'm hurting",
        'need someone to talk to'
      ),
      /^i(?:'m| am)\s+(?:not\s+)?(?:okay|alright|doing\s+well)/i,
      /^i(?:'m| am)\s+(?:feeling\s+)?(?:sad|down|depressed|blue|low)/i,
      /^i(?:'m| am)\s+(?:struggling|hurting|having\s+a\s+hard\s+time)/i,
      /^(?:i\s+)?need\s+(?:someone\s+)?to\s+talk\s+(?:to)?/i,
      /^(?:i\s+)?(?:don(?:'t|ot)\s+)?feel\s+(?:good|great|well)/i,
    ].map(riskGuarded),
    keywords: [
      { word: 'sad', weight: 0.9 },
      { word: 'depressed', weight: 1.0 },
      { word: 'struggling', weight: 0.9 },
      { word: 'hurting', weight: 0.9 },
      { word: 'down', weight: 0.7 },
      { word: 'lonely', weight: 0.9 },
      { word: 'alone', weight: 0.8 },
      { word: 'hard time', weight: 0.8 },
      { word: 'difficult', weight: 0.6 },
    ],
    antiKeywords: ['joke', 'music', 'weather', 'calendar'],
  },

  examples: [
    "I'm not doing okay",
    "I'm feeling really sad today",
    'I need someone to talk to',
    "I'm struggling",
    "I'm having a hard time",
    "I don't feel good emotionally",
    "I'm feeling down",
    "I'm hurting inside",
    'I feel alone',
    "I'm going through something difficult",
  ],

  counterExamples: [
    "I'm doing great!",
    'Tell me a joke',
    "What's on my calendar?",
    'Play some music',
  ],

  arguments: [],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.3,
    negativeKeywordPenalty: 0.2,
  },

  contextBoosts: {
    emotionBoost: {
      condition: 'stress > 0.5 || anxiety > 0 || valence < 0.3',
      boost: 0.15,
    },
  },

  execute: async (
    _args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'wellness_checkin',
      args: {},
      delegateTo: 'domains/wellness',
    };
  },
};

// ============================================================================
// SLEEP / REST
// ============================================================================

export const sleepHelpTool: SemanticToolDefinition = {
  id: 'sleep_help',
  name: 'Sleep Help',
  description: 'Help with sleep issues, insomnia, or relaxation before bed.',
  shortDescription: 'help with sleep',
  category: 'wellness',

  triggers: {
    phrases: [
      "can't sleep",
      "can't fall asleep",
      'trouble sleeping',
      'help me sleep',
      'insomnia',
      'tired but wired',
      'bedtime routine',
      'wind down',
    ],
    patterns: [
      /^i\s+can(?:'t|not)\s+(?:fall\s+)?sleep/i,
      /^(?:i(?:'m| am)\s+)?having\s+trouble\s+sleeping/i,
      /^help\s+me\s+(?:fall\s+)?(?:asleep|sleep|relax)/i,
      /^(?:i\s+)?need\s+(?:help\s+)?(?:to\s+)?(?:wind\s+down|relax|sleep)/i,
      /^(?:i(?:'m| am)\s+)?(?:tired\s+but\s+can(?:'t|not)\s+sleep|exhausted)/i,
    ],
    keywords: [
      { word: 'sleep', weight: 1.0 },
      { word: 'insomnia', weight: 1.0 },
      { word: 'tired', weight: 0.7 },
      { word: 'bedtime', weight: 0.9 },
      { word: 'rest', weight: 0.7 },
      { word: 'relax', weight: 0.6 },
      { word: 'exhausted', weight: 0.8 },
      { word: 'awake', weight: 0.7 },
    ],
    antiKeywords: ['calendar', 'meeting', 'work', 'email'],
  },

  examples: [
    "I can't sleep",
    'Help me fall asleep',
    "I'm having trouble sleeping",
    'I have insomnia',
    "I'm tired but can't sleep",
    'Help me wind down',
    'I need help relaxing before bed',
    "I'm exhausted but wired",
  ],

  counterExamples: [
    'I slept great!',
    "What's on my calendar?",
    'Send an email',
    'Play energizing music',
  ],

  arguments: [
    {
      name: 'type',
      type: 'string',
      description: 'Type of sleep help',
      required: false,
      enumValues: ['guided_relaxation', 'sleep_story', 'breathing', 'tips'],
    },
  ],

  confidence: {
    baseScore: 0.85,
    patternMatchBonus: 0.1,
    keywordDensityMultiplier: 1.2,
    negativeKeywordPenalty: 0.3,
  },

  contextBoosts: {
    timeBoost: {
      // Boost at night (9pm-6am)
      hours: [21, 22, 23, 0, 1, 2, 3, 4, 5],
      boost: 0.1,
    },
  },

  execute: async (
    args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    return {
      success: true,
      toolId: 'sleep_help',
      args,
      delegateTo: 'domains/wellness',
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

// NOTE: Sleep tools are handled by health.semantic.ts (analyzeSleepPattern, suggestSleepHygiene)
// to avoid routing conflicts. Sleep is a physical health domain concern.
export const wellnessTools: SemanticToolDefinition[] = [
  groundingExerciseTool,
  wellnessCheckinTool,
  // sleepHelpTool removed - consolidated into health domain (see HEALTH-HOME-WELLNESS-AUDIT.md)
];
