/**
 * Builder-Level Prioritization System
 *
 * PERFORMANCE OPTIMIZATION: Extends fast-conditional-loading with builder-level
 * scoring to further reduce the number of builders run per turn.
 *
 * Phase 2 optimization from FUTURE-OPTIMIZATIONS.md:
 * - Impact: 20-30% reduction in context build time
 * - Current: Category-level filtering runs ~20-30 builders per turn
 * - Target: Builder-level prioritization runs ~10-15 builders per turn
 *
 * How it works:
 * 1. After category filtering, score each builder by intent/topic relevance
 * 2. Skip builders with low relevance scores (below threshold)
 * 3. Always run "core" builders that are universally needed
 *
 * @module intelligence/context-builders/builder-prioritization
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ContextBuilder, ContextBuilderInput, ConversationAnalysis } from './index.js';
import { BuilderCategory as BC } from './core/categories.js';

const log = createLogger({ module: 'BuilderPrioritization' });

// ============================================================================
// TYPES
// ============================================================================

export interface BuilderRelevanceScore {
  builderName: string;
  score: number; // 0-1, higher = more relevant
  reason: string;
  isCore: boolean; // Core builders always run
}

export interface PrioritizationResult {
  selectedBuilders: ContextBuilder[];
  skippedBuilders: string[];
  totalScored: number;
  avgRelevanceScore: number;
  coreBuilderCount: number;
}

export interface PrioritizationConfig {
  /** Minimum relevance score to run a builder (0-1) */
  relevanceThreshold: number;
  /** If true, log detailed prioritization decisions */
  debug: boolean;
  /** If true, skip prioritization and run all builders */
  disabled: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

let config: PrioritizationConfig = {
  relevanceThreshold: 0.3,
  debug: process.env.DEBUG_BUILDER_PRIORITIZATION === 'true',
  disabled: process.env.DISABLE_BUILDER_PRIORITIZATION === 'true',
};

export function setPrioritizationConfig(newConfig: Partial<PrioritizationConfig>): void {
  config = { ...config, ...newConfig };
}

export function getPrioritizationConfig(): PrioritizationConfig {
  return { ...config };
}

// ============================================================================
// CORE BUILDERS (Always Run)
// ============================================================================

/**
 * Builders that should ALWAYS run regardless of relevance scoring.
 * These are essential for safety, identity, and basic functionality.
 */
const CORE_BUILDERS = new Set([
  // SAFETY - Always run for user protection
  'crisis',
  'wellbeing-context',
  'principal-alignment',

  // PERSONA - Always run for identity consistency
  'persona-identity',
  'persona-mood',

  // CONTEXT - Always run for basic situational awareness
  'intent',
  'topics',
  'session-flow',

  // EMOTIONAL - Always run for emotional awareness
  'emotional',
  'voice-mismatch-critical',

  // HUMANIZING - Always run for natural speech
  'unified-humanizing',
  'tool-humanization',
]);

// ============================================================================
// INTENT/TOPIC → BUILDER RELEVANCE MAPPING
// ============================================================================

/**
 * Maps detected intents to relevant builders.
 * Format: intent → builder names that are highly relevant for that intent
 */
const INTENT_TO_BUILDERS: Record<string, string[]> = {
  // Seeking advice triggers coaching and cognitive builders
  seeking_advice: [
    'coaching-context',
    'life-coaching-context',
    'scientific-coaching',
    'therapeutic-frameworks',
    'behavioral-economics',
    'methodology',
    'cognitive',
    'cognitive-quirks',
    'cognitive-distortions',
    'cognitive-insights',
    'deep-understanding',
  ],

  // Handoff requests need team-related builders
  handoff_request: [
    'team-availability',
    'team-dynamics',
    'handoff',
    'role-boundaries',
    'ferni-coordinator-intelligence',
  ],

  // Sharing feelings needs emotional and memory builders
  sharing_feelings: [
    'celebration',
    'celebration-growth',
    'voice-emotion',
    'advanced-voice-emotion',
    'energy-awareness',
    'energy-mirroring',
    'human-listening',
    'deep-relationship',
    'commitment-follow-up',
  ],

  // Greetings need memory and persona builders
  greeting: [
    'unified-memory-orchestrator',
    'persona-memory',
    'conversation-recap',
    'cross-session-reflection',
    'first-meeting-magic',
    'acquaintance-deepening',
  ],

  // Questions about calendar/scheduling
  scheduling: [
    'calendar-awareness',
    'contact-awareness',
    'message-review-awareness',
    'alex-communication-insights',
    'temporal-intelligence',
  ],

  // Asking about habits
  habit_discussion: [
    'maya-habit-insights',
    'maya-coaching-insights',
    'daily-rituals',
    'commitment-follow-up',
  ],

  // Financial topics
  financial: [
    'peter-research-insights',
    'financial-prediction',
  ],

  // Goal/planning discussion
  goal_planning: [
    'jordan-milestone-insights',
    'personal-journey',
    'anticipation',
    'life-context-synthesis',
  ],

  // Life wisdom/reflection
  reflection: [
    'nayan-wisdom-insights',
    'wisdom-synthesis',
    'deep-understanding',
    'pattern-surfacing',
    'superhuman-insights',
  ],
};

/**
 * Maps detected topics to relevant builders.
 * Topics are extracted from conversation analysis.
 */
const TOPIC_TO_BUILDERS: Record<string, string[]> = {
  // Music/entertainment
  music: ['music', 'music-emotion-offers', 'engagement', 'engagement-context'],
  song: ['music', 'music-emotion-offers'],
  play: ['music', 'music-emotion-offers', 'game-context'],

  // Games and fun
  game: ['game-context', 'engagement', 'storytelling'],
  fun: ['game-context', 'engagement', 'storytelling', 'persona-playful'],
  story: ['storytelling', 'engagement'],

  // Calendar and scheduling
  calendar: ['calendar-awareness', 'alex-communication-insights', 'temporal-intelligence'],
  schedule: ['calendar-awareness', 'message-review-awareness', 'temporal-intelligence'],
  meeting: ['calendar-awareness', 'contact-awareness'],
  appointment: ['calendar-awareness', 'message-review-awareness'],

  // Habits and routines
  habit: ['maya-habit-insights', 'maya-coaching-insights', 'daily-rituals'],
  routine: ['maya-habit-insights', 'daily-rituals'],
  morning: ['daily-rituals', 'temporal-intelligence'],
  exercise: ['maya-habit-insights', 'biometrics'],
  sleep: ['maya-habit-insights', 'biometrics'],

  // Financial topics
  money: ['peter-research-insights', 'financial-prediction'],
  finance: ['peter-research-insights', 'financial-prediction'],
  stock: ['peter-research-insights', 'financial-prediction'],
  investment: ['peter-research-insights', 'financial-prediction'],
  budget: ['peter-research-insights'],

  // Goals and planning
  goal: ['jordan-milestone-insights', 'anticipation', 'personal-journey'],
  plan: ['jordan-milestone-insights', 'calendar-awareness', 'temporal-intelligence'],
  milestone: ['jordan-milestone-insights', 'celebration', 'celebration-growth'],

  // Work and career
  work: ['career-awareness', 'linkedin-awareness', 'calendar-awareness'],
  job: ['career-awareness', 'linkedin-awareness'],
  career: ['career-awareness', 'linkedin-awareness'],

  // Relationships
  relationship: ['social-relationships', 'deep-relationship', 'relationship-behaviors'],
  friend: ['social-relationships', 'contact-awareness', 'outreach-awareness'],
  family: ['social-relationships', 'contact-awareness'],

  // Health and wellbeing
  health: ['biometrics', 'wellbeing-context', 'physical-presence'],
  stress: ['wellbeing-context', 'somatic-context', 'cognitive-distortions'],
  anxiety: ['wellbeing-context', 'cognitive-distortions', 'therapeutic-frameworks'],

  // Weather and world
  weather: ['world-awareness', 'situational-awareness'],

  // Tech/device context
  phone: ['device-awareness', 'macos-context'],
  computer: ['device-awareness', 'macos-context'],
};

// ============================================================================
// PERSONA-SPECIFIC BUILDERS
// ============================================================================

/**
 * Maps persona IDs to their specialized builders.
 * These get boosted relevance when that persona is active.
 */
const PERSONA_BUILDERS: Record<string, string[]> = {
  ferni: [
    'ferni-personality',
    'ferni-coordinator-intelligence',
    'team-availability',
    'team-dynamics',
    'handoff',
    'cameo-opportunities',
    'cameo-unlock',
  ],
  peter: [
    'peter-research-insights',
    'financial-prediction',
  ],
  maya: [
    'maya-habit-insights',
    'maya-coaching-insights',
    'daily-rituals',
  ],
  jordan: [
    'jordan-milestone-insights',
    'anticipation',
    'personal-journey',
  ],
  alex: [
    'alex-communication-insights',
    'calendar-awareness',
    'message-review-awareness',
    'contact-awareness',
  ],
  nayan: [
    'nayan-wisdom-insights',
    'wisdom-synthesis',
    'life-context-synthesis',
  ],
};

// ============================================================================
// RELEVANCE SCORING
// ============================================================================

/**
 * Calculate relevance score for a builder based on current context.
 *
 * Scoring factors:
 * 1. Core builder → 1.0 (always runs)
 * 2. Intent match → +0.4
 * 3. Topic match → +0.3 per matching topic
 * 4. Persona match → +0.3
 * 5. Base score for non-matched → 0.2
 */
function calculateBuilderRelevance(
  builder: ContextBuilder,
  input: ContextBuilderInput
): BuilderRelevanceScore {
  const builderName = builder.name;

  // Core builders always run
  if (CORE_BUILDERS.has(builderName)) {
    return {
      builderName,
      score: 1.0,
      reason: 'core_builder',
      isCore: true,
    };
  }

  let score = 0.2; // Base score for all non-core builders
  const reasons: string[] = [];

  const analysis = input.analysis;
  const personaId = input.persona?.identity?.id;

  // Intent matching
  const primaryIntent = analysis?.intent?.primary;
  if (primaryIntent) {
    const intentBuilders = INTENT_TO_BUILDERS[primaryIntent];
    if (intentBuilders?.includes(builderName)) {
      score += 0.4;
      reasons.push(`intent:${primaryIntent}`);
    }
  }

  // Topic matching
  const detectedTopics = analysis?.topics?.detected || [];
  for (const topic of detectedTopics) {
    const topicLower = topic.toLowerCase();
    const topicBuilders = TOPIC_TO_BUILDERS[topicLower];
    if (topicBuilders?.includes(builderName)) {
      score += 0.3;
      reasons.push(`topic:${topicLower}`);
      break; // Only count first matching topic
    }
  }

  // Check user text for topic keywords if no topics detected
  if (detectedTopics.length === 0 && input.userText) {
    const textLower = input.userText.toLowerCase();
    for (const [keyword, topicBuilders] of Object.entries(TOPIC_TO_BUILDERS)) {
      if (textLower.includes(keyword) && topicBuilders.includes(builderName)) {
        score += 0.25;
        reasons.push(`keyword:${keyword}`);
        break;
      }
    }
  }

  // Persona matching
  if (personaId) {
    const personaBuilders = PERSONA_BUILDERS[personaId];
    if (personaBuilders?.includes(builderName)) {
      score += 0.3;
      reasons.push(`persona:${personaId}`);
    }
  }

  // Cap score at 1.0
  score = Math.min(score, 1.0);

  return {
    builderName,
    score,
    reason: reasons.length > 0 ? reasons.join('+') : 'base',
    isCore: false,
  };
}

// ============================================================================
// MAIN PRIORITIZATION FUNCTION
// ============================================================================

/**
 * Prioritize builders based on relevance to current context.
 *
 * This function takes the builders already filtered by category and further
 * filters them by intent/topic relevance scoring.
 *
 * @param builders - Builders already filtered by category
 * @param input - Current context input
 * @returns Prioritization result with selected builders
 */
export function prioritizeBuilders(
  builders: ContextBuilder[],
  input: ContextBuilderInput
): PrioritizationResult {
  // If disabled, return all builders
  if (config.disabled) {
    return {
      selectedBuilders: builders,
      skippedBuilders: [],
      totalScored: builders.length,
      avgRelevanceScore: 1.0,
      coreBuilderCount: builders.filter((b) => CORE_BUILDERS.has(b.name)).length,
    };
  }

  const scores: BuilderRelevanceScore[] = [];
  const selectedBuilders: ContextBuilder[] = [];
  const skippedBuilders: string[] = [];

  // Score all builders
  for (const builder of builders) {
    const relevance = calculateBuilderRelevance(builder, input);
    scores.push(relevance);

    // Select if score meets threshold or is core builder
    if (relevance.score >= config.relevanceThreshold || relevance.isCore) {
      selectedBuilders.push(builder);
    } else {
      skippedBuilders.push(builder.name);
    }
  }

  // Calculate average score
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const avgScore = scores.length > 0 ? totalScore / scores.length : 0;

  // Count core builders
  const coreCount = scores.filter((s) => s.isCore).length;

  // Debug logging
  if (config.debug && skippedBuilders.length > 0) {
    log.debug(
      {
        selected: selectedBuilders.length,
        skipped: skippedBuilders.length,
        skippedNames: skippedBuilders.slice(0, 5), // First 5
        avgScore: avgScore.toFixed(2),
        intent: input.analysis?.intent?.primary,
        topics: input.analysis?.topics?.detected?.slice(0, 3),
      },
      'Builder prioritization result'
    );
  }

  return {
    selectedBuilders,
    skippedBuilders,
    totalScored: scores.length,
    avgRelevanceScore: avgScore,
    coreBuilderCount: coreCount,
  };
}

// ============================================================================
// METRICS
// ============================================================================

interface PrioritizationMetrics {
  totalRuns: number;
  totalBuildersScored: number;
  totalBuildersSkipped: number;
  avgBuildersPerTurn: number;
  avgSkipRate: number;
  avgRelevanceScore: number;
}

const metrics: PrioritizationMetrics = {
  totalRuns: 0,
  totalBuildersScored: 0,
  totalBuildersSkipped: 0,
  avgBuildersPerTurn: 0,
  avgSkipRate: 0,
  avgRelevanceScore: 0,
};

const recentResults: { selected: number; skipped: number; avgScore: number }[] = [];

/**
 * Record a prioritization result for metrics tracking.
 */
export function recordPrioritizationResult(result: PrioritizationResult): void {
  metrics.totalRuns++;
  metrics.totalBuildersScored += result.totalScored;
  metrics.totalBuildersSkipped += result.skippedBuilders.length;

  recentResults.push({
    selected: result.selectedBuilders.length,
    skipped: result.skippedBuilders.length,
    avgScore: result.avgRelevanceScore,
  });

  // Keep only last 100 samples
  if (recentResults.length > 100) {
    recentResults.shift();
  }

  // Update running averages
  if (recentResults.length > 0) {
    const totalSelected = recentResults.reduce((sum, r) => sum + r.selected, 0);
    const totalSkipped = recentResults.reduce((sum, r) => sum + r.skipped, 0);
    const totalAvgScore = recentResults.reduce((sum, r) => sum + r.avgScore, 0);

    metrics.avgBuildersPerTurn = totalSelected / recentResults.length;
    metrics.avgSkipRate = totalSkipped / (totalSelected + totalSkipped);
    metrics.avgRelevanceScore = totalAvgScore / recentResults.length;
  }
}

/**
 * Get prioritization metrics.
 */
export function getPrioritizationMetrics(): PrioritizationMetrics {
  return { ...metrics };
}

/**
 * Reset prioritization metrics (for testing).
 */
export function resetPrioritizationMetrics(): void {
  metrics.totalRuns = 0;
  metrics.totalBuildersScored = 0;
  metrics.totalBuildersSkipped = 0;
  metrics.avgBuildersPerTurn = 0;
  metrics.avgSkipRate = 0;
  metrics.avgRelevanceScore = 0;
  recentResults.length = 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  prioritizeBuilders,
  recordPrioritizationResult,
  getPrioritizationMetrics,
  resetPrioritizationMetrics,
  setPrioritizationConfig,
  getPrioritizationConfig,
  CORE_BUILDERS,
};
