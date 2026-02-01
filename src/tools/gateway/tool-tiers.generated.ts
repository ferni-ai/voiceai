/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from: tool-tiers.json
 * Generated at: 2026-01-30T11:12:57.776Z
 * Generator: scripts/generate-tool-tiers.js
 *
 * This file is imported directly - NO JSON parsing at runtime!
 * Edit tool-tiers.json and run: pnpm build:tool-tiers
 */

import type { ToolDomain } from '../registry/types.js';

// ============================================================================
// CONFIGURATION VERSION
// ============================================================================

export const TOOL_TIERS_VERSION = '1.0.0' as const;

// ============================================================================
// TIER 0: INSTANT (Always in memory, 0ms latency)
// ============================================================================

/** Domains that are ALWAYS loaded at process start */
export const TIER_0_DOMAINS: readonly ToolDomain[] = [
  'memory',
  'handoff',
  'entertainment',
  'awareness',
  'behavior',
] as const;

/** Critical tools that MUST be available instantly */
export const TIER_0_CRITICAL_TOOLS: readonly string[] = [
  'playMusic',
  'musicControl',
  'musicInfo',
  'musicProvider',
  'rememberAboutUser',
  'recallFromMemory',
  'handoffToMaya',
  'handoffToPeter',
  'handoffToJordan',
  'handoffToAlex',
  'handoffToNayan',
  'handoffToFerni',
] as const;

/** Fast lookup set for Tier 0 domains */
export const TIER_0_DOMAIN_SET: ReadonlySet<ToolDomain> = new Set(TIER_0_DOMAINS);

/** Fast lookup set for critical tools */
export const CRITICAL_TOOLS_SET: ReadonlySet<string> = new Set(TIER_0_CRITICAL_TOOLS);

// ============================================================================
// TIER 1: PRELOADED (Loaded at session start, <100ms)
// ============================================================================

/** Domains loaded at session start for all users */
export const TIER_1_DOMAINS: readonly ToolDomain[] = [
  'calendar',
  'scheduling',
  'telephony',
  'communication',
  'productivity',
  'habits',
  'information',
  'simple-utilities',
  'family',
] as const;

/** Conditional domains based on user profile */
export const TIER_1_CONDITIONAL: Readonly<Record<string, readonly ToolDomain[]>> = {
  userHasCalendarLinked: ['scheduling'],
  userHasSpotifyLinked: ['entertainment'],
  userInCrisis: ['crisis', 'trauma-support'],
} as const;

/** Fast lookup set for Tier 1 domains */
export const TIER_1_DOMAIN_SET: ReadonlySet<ToolDomain> = new Set(TIER_1_DOMAINS);

// ============================================================================
// TIER 2: PREDICTIVE (Context-based prefetch, <500ms)
// ============================================================================

export interface PredictiveRule {
  readonly id: string;
  readonly triggers: readonly string[];
  readonly triggerSet: ReadonlySet<string>;
  readonly timeCondition?: { readonly hours: readonly number[] };
  readonly domains: readonly ToolDomain[];
  readonly priority: 'high' | 'medium' | 'low';
  /** Pre-computed embedding for fast similarity matching */
  readonly embedding: readonly number[];
}

/** Predictive loading rules with pre-computed data */
export const PREDICTIVE_RULES: readonly PredictiveRule[] = [
  {
    id: 'grief-support',
    triggers: ['sad', 'loss', 'died', 'death', 'grieving', 'passed away', 'funeral'],
    triggerSet: new Set(['sad', 'loss', 'died', 'death', 'grieving', 'passed away', 'funeral']),
    domains: ['grief', 'meaning', 'presence'] as const,
    priority: 'high',
    embedding: [0.468521, 0.000000, 0.000000, 0.390434, 0.390434, 0.078087, 0.156174, 0.078087, 0.234261, 0.000000, 0.000000, 0.156174, 0.000000, 0.156174, 0.078087, 0.078087, 0.000000, 0.156174, 0.390434, 0.078087, 0.078087, 0.078087, 0.078087, 0.000000, 0.078087, 0.000000, 0.078087, 0.000000, 0.078087, 0.078087, 0.000000, 0.000000, 0.000000, 0.000000, 0.156174, 0.000000, 0.000000, 0.000000, 0.078087, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.078087, 0.000000, 0.000000, 0.078087, 0.078087, 0.000000, 0.000000, 0.078087, 0.078087, 0.000000, 0.000000, 0.078087, 0.078087, 0.078087, 0.078087, 0.000000, 0.000000, 0.078087, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.078087, 0.000000, 0.000000, 0.000000, 0.000000],
  },
  {
    id: 'career-help',
    triggers: ['job', 'career', 'interview', 'resume', 'work', 'boss', 'promotion'],
    triggerSet: new Set(['job', 'career', 'interview', 'resume', 'work', 'boss', 'promotion']),
    domains: ['career', 'decisions', 'learning'] as const,
    priority: 'medium',
    embedding: [0.076249, 0.152499, 0.076249, 0.000000, 0.457496, 0.000000, 0.000000, 0.000000, 0.228748, 0.076249, 0.076249, 0.000000, 0.152499, 0.152499, 0.457496, 0.076249, 0.000000, 0.457496, 0.228748, 0.152499, 0.076249, 0.076249, 0.152499, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.076249, 0.152499, 0.000000, 0.076249, 0.076249, 0.152499, 0.000000, 0.000000, 0.076249, 0.000000, 0.000000, 0.000000, 0.076249, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.076249, 0.000000, 0.000000, 0.076249, 0.000000, 0.000000, 0.000000, 0.000000, 0.076249, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.076249, 0.000000, 0.076249, 0.000000, 0.076249, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000],
  },
  {
    id: 'financial-help',
    triggers: ['money', 'budget', 'savings', 'debt', 'invest', 'bills', 'afford'],
    triggerSet: new Set(['money', 'budget', 'savings', 'debt', 'invest', 'bills', 'afford']),
    domains: ['finance', 'decisions'] as const,
    priority: 'medium',
    embedding: [0.183340, 0.275010, 0.000000, 0.275010, 0.366679, 0.183340, 0.183340, 0.000000, 0.275010, 0.000000, 0.000000, 0.183340, 0.091670, 0.275010, 0.183340, 0.000000, 0.000000, 0.091670, 0.366679, 0.275010, 0.091670, 0.183340, 0.000000, 0.000000, 0.091670, 0.000000, 0.000000, 0.000000, 0.183340, 0.000000, 0.000000, 0.091670, 0.091670, 0.000000, 0.000000, 0.000000, 0.091670, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.091670, 0.000000, 0.091670, 0.000000, 0.000000, 0.000000, 0.091670, 0.000000, 0.091670, 0.000000, 0.091670, 0.091670, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.091670, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000],
  },
  {
    id: 'health-wellness',
    triggers: ['health', 'exercise', 'workout', 'diet', 'weight', 'sleep', 'tired'],
    triggerSet: new Set(['health', 'exercise', 'workout', 'diet', 'weight', 'sleep', 'tired']),
    domains: ['health', 'wellness', 'habits'] as const,
    priority: 'medium',
    embedding: [0.074329, 0.000000, 0.074329, 0.148659, 0.668965, 0.000000, 0.074329, 0.222988, 0.297318, 0.000000, 0.074329, 0.148659, 0.000000, 0.000000, 0.148659, 0.074329, 0.000000, 0.222988, 0.148659, 0.371647, 0.074329, 0.000000, 0.148659, 0.074329, 0.000000, 0.000000, 0.074329, 0.074329, 0.000000, 0.074329, 0.000000, 0.000000, 0.074329, 0.074329, 0.074329, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.074329, 0.000000, 0.074329, 0.074329, 0.000000, 0.000000, 0.000000, 0.074329, 0.000000, 0.000000, 0.000000, 0.000000, 0.074329, 0.074329, 0.000000, 0.000000, 0.000000, 0.074329, 0.074329, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000],
  },
  {
    id: 'anxiety-support',
    triggers: ['anxious', 'anxiety', 'panic', 'stressed', 'overwhelmed', 'can\'t breathe'],
    triggerSet: new Set(['anxious', 'anxiety', 'panic', 'stressed', 'overwhelmed', 'can\'t breathe']),
    domains: ['presence', 'wellness', 'crisis'] as const,
    priority: 'high',
    embedding: [0.334077, 0.066815, 0.133631, 0.133631, 0.534522, 0.000000, 0.000000, 0.133631, 0.200446, 0.000000, 0.000000, 0.066815, 0.066815, 0.267261, 0.133631, 0.066815, 0.000000, 0.200446, 0.267261, 0.267261, 0.066815, 0.066815, 0.066815, 0.133631, 0.066815, 0.000000, 0.066815, 0.133631, 0.000000, 0.066815, 0.267261, 0.000000, 0.000000, 0.133631, 0.133631, 0.000000, 0.066815, 0.000000, 0.066815, 0.000000, 0.000000, 0.000000, 0.000000, 0.066815, 0.066815, 0.066815, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.066815, 0.000000, 0.000000, 0.000000, 0.000000, 0.066815, 0.000000, 0.000000, 0.000000, 0.066815, 0.066815, 0.066815, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.066815, 0.000000, 0.000000],
  },
  {
    id: 'relationship-help',
    triggers: ['relationship', 'partner', 'spouse', 'boyfriend', 'girlfriend', 'dating', 'breakup'],
    triggerSet: new Set(['relationship', 'partner', 'spouse', 'boyfriend', 'girlfriend', 'dating', 'breakup']),
    domains: ['relationships', 'connection', 'decisions'] as const,
    priority: 'medium',
    embedding: [0.242091, 0.121046, 0.000000, 0.181568, 0.363137, 0.121046, 0.121046, 0.060523, 0.363137, 0.000000, 0.060523, 0.121046, 0.000000, 0.302614, 0.181568, 0.242091, 0.000000, 0.423659, 0.181568, 0.181568, 0.121046, 0.000000, 0.000000, 0.000000, 0.060523, 0.000000, 0.000000, 0.000000, 0.060523, 0.060523, 0.000000, 0.060523, 0.000000, 0.121046, 0.000000, 0.121046, 0.000000, 0.121046, 0.121046, 0.000000, 0.000000, 0.000000, 0.000000, 0.060523, 0.060523, 0.000000, 0.060523, 0.060523, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.121046, 0.000000, 0.060523, 0.121046, 0.060523, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.060523, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.060523, 0.060523, 0.000000],
  },
  {
    id: 'play-games',
    triggers: ['game', 'play', 'bored', 'fun', 'tic tac toe', 'trivia'],
    triggerSet: new Set(['game', 'play', 'bored', 'fun', 'tic tac toe', 'trivia']),
    domains: ['games', 'play'] as const,
    priority: 'low',
    embedding: [0.444444, 0.111111, 0.222222, 0.111111, 0.333333, 0.111111, 0.111111, 0.000000, 0.333333, 0.000000, 0.000000, 0.111111, 0.111111, 0.111111, 0.222222, 0.111111, 0.000000, 0.222222, 0.000000, 0.444444, 0.111111, 0.111111, 0.000000, 0.000000, 0.111111, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.111111, 0.111111, 0.111111, 0.000000, 0.000000, 0.000000, 0.000000, 0.111111, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.111111, 0.000000, 0.000000, 0.111111, 0.000000, 0.000000, 0.000000, 0.000000, 0.111111, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.111111, 0.000000],
  },
  {
    id: 'late-night',
    triggers: [],
    triggerSet: new Set([]),
    timeCondition: { hours: [22, 23, 0, 1, 2, 3, 4, 5] },
    domains: ['presence', 'wellness', 'self-compassion'] as const,
    priority: 'low',
    embedding: [0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000],
  },
] as const;

/** Map from trigger word to rules (for O(1) lookup) */
export const TRIGGER_TO_RULES: ReadonlyMap<string, readonly PredictiveRule[]> = new Map([
  ['sad', PREDICTIVE_RULES.filter(r => ['grief-support'].includes(r.id))],
  ['loss', PREDICTIVE_RULES.filter(r => ['grief-support'].includes(r.id))],
  ['died', PREDICTIVE_RULES.filter(r => ['grief-support'].includes(r.id))],
  ['death', PREDICTIVE_RULES.filter(r => ['grief-support'].includes(r.id))],
  ['grieving', PREDICTIVE_RULES.filter(r => ['grief-support'].includes(r.id))],
  ['passed away', PREDICTIVE_RULES.filter(r => ['grief-support'].includes(r.id))],
  ['funeral', PREDICTIVE_RULES.filter(r => ['grief-support'].includes(r.id))],
  ['job', PREDICTIVE_RULES.filter(r => ['career-help'].includes(r.id))],
  ['career', PREDICTIVE_RULES.filter(r => ['career-help'].includes(r.id))],
  ['interview', PREDICTIVE_RULES.filter(r => ['career-help'].includes(r.id))],
  ['resume', PREDICTIVE_RULES.filter(r => ['career-help'].includes(r.id))],
  ['work', PREDICTIVE_RULES.filter(r => ['career-help'].includes(r.id))],
  ['boss', PREDICTIVE_RULES.filter(r => ['career-help'].includes(r.id))],
  ['promotion', PREDICTIVE_RULES.filter(r => ['career-help'].includes(r.id))],
  ['money', PREDICTIVE_RULES.filter(r => ['financial-help'].includes(r.id))],
  ['budget', PREDICTIVE_RULES.filter(r => ['financial-help'].includes(r.id))],
  ['savings', PREDICTIVE_RULES.filter(r => ['financial-help'].includes(r.id))],
  ['debt', PREDICTIVE_RULES.filter(r => ['financial-help'].includes(r.id))],
  ['invest', PREDICTIVE_RULES.filter(r => ['financial-help'].includes(r.id))],
  ['bills', PREDICTIVE_RULES.filter(r => ['financial-help'].includes(r.id))],
  ['afford', PREDICTIVE_RULES.filter(r => ['financial-help'].includes(r.id))],
  ['health', PREDICTIVE_RULES.filter(r => ['health-wellness'].includes(r.id))],
  ['exercise', PREDICTIVE_RULES.filter(r => ['health-wellness'].includes(r.id))],
  ['workout', PREDICTIVE_RULES.filter(r => ['health-wellness'].includes(r.id))],
  ['diet', PREDICTIVE_RULES.filter(r => ['health-wellness'].includes(r.id))],
  ['weight', PREDICTIVE_RULES.filter(r => ['health-wellness'].includes(r.id))],
  ['sleep', PREDICTIVE_RULES.filter(r => ['health-wellness'].includes(r.id))],
  ['tired', PREDICTIVE_RULES.filter(r => ['health-wellness'].includes(r.id))],
  ['anxious', PREDICTIVE_RULES.filter(r => ['anxiety-support'].includes(r.id))],
  ['anxiety', PREDICTIVE_RULES.filter(r => ['anxiety-support'].includes(r.id))],
  ['panic', PREDICTIVE_RULES.filter(r => ['anxiety-support'].includes(r.id))],
  ['stressed', PREDICTIVE_RULES.filter(r => ['anxiety-support'].includes(r.id))],
  ['overwhelmed', PREDICTIVE_RULES.filter(r => ['anxiety-support'].includes(r.id))],
  ['can\'t breathe', PREDICTIVE_RULES.filter(r => ['anxiety-support'].includes(r.id))],
  ['relationship', PREDICTIVE_RULES.filter(r => ['relationship-help'].includes(r.id))],
  ['partner', PREDICTIVE_RULES.filter(r => ['relationship-help'].includes(r.id))],
  ['spouse', PREDICTIVE_RULES.filter(r => ['relationship-help'].includes(r.id))],
  ['boyfriend', PREDICTIVE_RULES.filter(r => ['relationship-help'].includes(r.id))],
  ['girlfriend', PREDICTIVE_RULES.filter(r => ['relationship-help'].includes(r.id))],
  ['dating', PREDICTIVE_RULES.filter(r => ['relationship-help'].includes(r.id))],
  ['breakup', PREDICTIVE_RULES.filter(r => ['relationship-help'].includes(r.id))],
  ['game', PREDICTIVE_RULES.filter(r => ['play-games'].includes(r.id))],
  ['play', PREDICTIVE_RULES.filter(r => ['play-games'].includes(r.id))],
  ['bored', PREDICTIVE_RULES.filter(r => ['play-games'].includes(r.id))],
  ['fun', PREDICTIVE_RULES.filter(r => ['play-games'].includes(r.id))],
  ['tic tac toe', PREDICTIVE_RULES.filter(r => ['play-games'].includes(r.id))],
  ['trivia', PREDICTIVE_RULES.filter(r => ['play-games'].includes(r.id))],
]);

/** All trigger words as a Set for fast contains() checks */
export const ALL_TRIGGER_WORDS: ReadonlySet<string> = new Set([
  'sad',
  'loss',
  'died',
  'death',
  'grieving',
  'passed away',
  'funeral',
  'job',
  'career',
  'interview',
  'resume',
  'work',
  'boss',
  'promotion',
  'money',
  'budget',
  'savings',
  'debt',
  'invest',
  'bills',
  'afford',
  'health',
  'exercise',
  'workout',
  'diet',
  'weight',
  'sleep',
  'tired',
  'anxious',
  'anxiety',
  'panic',
  'stressed',
  'overwhelmed',
  'can\'t breathe',
  'relationship',
  'partner',
  'spouse',
  'boyfriend',
  'girlfriend',
  'dating',
  'breakup',
  'game',
  'play',
  'bored',
  'fun',
  'tic tac toe',
  'trivia',
]);

// ============================================================================
// TIER 3: ON-DEMAND (Load only when explicitly needed)
// ============================================================================

/** Domains that are only loaded when explicitly requested */
export const TIER_3_DOMAINS: readonly ToolDomain[] = [
  'legal-admin',
  'meal-planning',
  'finance',
  'research',
  'travel',
] as const;

/** Fast lookup set for on-demand domains */
export const TIER_3_DOMAIN_SET: ReadonlySet<ToolDomain> = new Set(TIER_3_DOMAINS);

// ============================================================================
// METRICS TARGETS
// ============================================================================

export const LOAD_TIME_TARGETS = {
  tier0: 0,
  tier1: 100,
  tier2: 500,
  tier3: 2000,
} as const;

// ============================================================================
// UTILITY FUNCTIONS (pre-compiled for speed)
// ============================================================================

/** Pre-computed session start domains (Tier 0 + Tier 1) */
export const SESSION_START_DOMAINS: readonly ToolDomain[] = [
  ...TIER_0_DOMAINS,
  ...TIER_1_DOMAINS,
] as const;

/**
 * Check if a domain is in a specific tier.
 * O(1) lookup using pre-built Sets.
 */
export function getDomainTier(domain: ToolDomain): 0 | 1 | 2 | 3 | -1 {
  if (TIER_0_DOMAIN_SET.has(domain)) return 0;
  if (TIER_1_DOMAIN_SET.has(domain)) return 1;
  if (TIER_3_DOMAIN_SET.has(domain)) return 3;
  return 2; // Default to predictive tier
}

/**
 * Check if a tool is critical (must be instantly available).
 * O(1) lookup.
 */
export function isCriticalTool(toolId: string): boolean {
  return CRITICAL_TOOLS_SET.has(toolId);
}

/**
 * Get all Tier 0 + Tier 1 domains (for session start).
 * Pre-computed, just returns array reference.
 */
export function getSessionStartDomains(): readonly ToolDomain[] {
  return SESSION_START_DOMAINS;
}

// ============================================================================
// FAST PREDICTION (No API calls, microsecond latency)
// ============================================================================

/**
 * Fast keyword-based prediction.
 * Checks if any trigger words are present.
 *
 * @param words - Pre-tokenized words from transcript
 * @returns Matched rules sorted by priority
 */
export function predictFromWords(words: readonly string[]): PredictiveRule[] {
  const matched = new Set<PredictiveRule>();

  for (const word of words) {
    const rules = TRIGGER_TO_RULES.get(word);
    if (rules) {
      for (const rule of rules) {
        matched.add(rule);
      }
    }
  }

  // Sort by priority: high > medium > low
  return Array.from(matched).sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Compute embedding for input text.
 * Uses same algorithm as build-time embedding generation.
 * Runs in microseconds.
 */
export function computeTextEmbedding(text: string): number[] {
  const charFreq = new Map<string, number>();
  const lower = text.toLowerCase();

  // Unigrams
  for (const char of lower) {
    if (char >= 'a' && char <= 'z') {
      charFreq.set(char, (charFreq.get(char) || 0) + 1);
    }
  }

  // Bigrams
  for (let i = 0; i < lower.length - 1; i++) {
    const c1 = lower[i];
    const c2 = lower[i + 1];
    if (c1 >= 'a' && c1 <= 'z' && c2 >= 'a' && c2 <= 'z') {
      const bigram = c1 + c2;
      charFreq.set(bigram, (charFreq.get(bigram) || 0) + 1);
    }
  }

  // Convert to vector (must match build-time algorithm!)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const commonBigrams = [
    'th', 'he', 'in', 'er', 'an', 'on', 'or', 're', 'ed', 'nd',
    'es', 'en', 'at', 'to', 'nt', 'is', 'it', 'ou', 'ea', 'st',
    'ar', 'ng', 'al', 'te', 'co', 'de', 'ra', 'et', 'ti', 'sa',
    'ne', 'ri', 'se', 'le', 'of', 'as', 'me', 've', 'io', 'be',
    'om', 'ce', 'li', 'ha', 'ma', 'lo', 'ur', 'el', 'la', 'no',
  ];

  const vector: number[] = [];
  for (const char of alphabet) {
    vector.push(charFreq.get(char) || 0);
  }
  for (const bigram of commonBigrams) {
    vector.push(charFreq.get(bigram) || 0);
  }

  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    return vector.map((v) => v / magnitude);
  }
  return vector;
}

/**
 * Cosine similarity between two vectors.
 * Runs in microseconds.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Already normalized, so dot product = cosine similarity
}

/**
 * Semantic prediction using pre-computed embeddings.
 * Finds rules with similar trigger patterns.
 *
 * @param text - Input text
 * @param threshold - Minimum similarity (0-1)
 * @returns Rules above threshold, sorted by similarity
 */
export function predictSemantic(text: string, threshold = 0.3): Array<{ rule: PredictiveRule; similarity: number }> {
  const inputEmbedding = computeTextEmbedding(text);
  const matches: Array<{ rule: PredictiveRule; similarity: number }> = [];

  for (const rule of PREDICTIVE_RULES) {
    const similarity = cosineSimilarity(inputEmbedding, rule.embedding);
    if (similarity >= threshold) {
      matches.push({ rule, similarity });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}
