/**
 * Topic-Based Builder Filter
 *
 * PERFORMANCE OPTIMIZATION: Skip context builders BEFORE evaluation
 * based on the detected conversation topic. This saves CPU cycles
 * by not even calling builders that won't provide relevant context.
 *
 * Example: If user asks about finances, skip health/visual memory builders
 *          If user discusses emotions, skip scientific coaching builders
 *
 * Savings: ~30-50ms per turn by avoiding unnecessary async operations
 *
 * @module agents/processors/topic-builder-filter
 */

import type { TopicCategory } from '../../intelligence/topic-tracker.js';

// ============================================================================
// BUILDER CATEGORIES
// ============================================================================

/**
 * All available context builders that can be filtered
 */
export type BuilderName =
  // TIER 1 - Critical (never skip)
  | 'behavioral-context'
  | 'human-transfer'
  // TIER 2 - Important (can skip based on topic)
  | 'scientific-coaching'
  | 'life-coaching'
  | 'trust-systems'
  | 'boundary-check'
  | 'live-superhuman'
  // TIER 3 - Optional (can skip aggressively)
  | 'health-awareness'
  | 'user-health'
  | 'visual-memory'
  | 'ambient-mode';

/**
 * Builders that should NEVER be skipped (safety/quality critical)
 */
const NEVER_SKIP: ReadonlySet<BuilderName> = new Set([
  'behavioral-context', // Essential for response quality
  'human-transfer', // Safety critical
  'trust-systems', // Core to relationship building
]);

// ============================================================================
// TOPIC → BUILDER RELEVANCE MAPPING
// ============================================================================

/**
 * Which builders are highly relevant for each topic category.
 * Builders NOT in this list for a category can be skipped.
 *
 * Philosophy: Only run builders that have a realistic chance
 * of providing useful context for the current topic.
 */
const TOPIC_BUILDER_RELEVANCE: Record<TopicCategory, ReadonlySet<BuilderName>> = {
  // Financial topics: focus on scientific/research context, skip health/visual
  financial: new Set([
    'behavioral-context',
    'human-transfer',
    'scientific-coaching', // Research, data-driven advice
    'trust-systems',
    'boundary-check', // Financial boundaries matter
    'live-superhuman',
  ]),

  // Market topics: similar to financial but more data-focused
  market: new Set([
    'behavioral-context',
    'human-transfer',
    'scientific-coaching',
    'trust-systems',
    'live-superhuman',
  ]),

  // Personal topics: life coaching, trust, boundaries highly relevant
  personal: new Set([
    'behavioral-context',
    'human-transfer',
    'life-coaching', // Goals, relationships
    'trust-systems',
    'boundary-check',
    'live-superhuman',
    'ambient-mode', // Context about where they are
  ]),

  // Emotional topics: trust and coaching are critical
  emotional: new Set([
    'behavioral-context',
    'human-transfer',
    'life-coaching',
    'trust-systems',
    'boundary-check',
    'live-superhuman',
  ]),

  // Planning topics: life coaching, scientific approach
  planning: new Set([
    'behavioral-context',
    'human-transfer',
    'scientific-coaching',
    'life-coaching',
    'trust-systems',
    'boundary-check',
    'live-superhuman',
    'ambient-mode', // Calendar/location context
  ]),

  // Education topics: scientific coaching relevant
  education: new Set([
    'behavioral-context',
    'human-transfer',
    'scientific-coaching',
    'life-coaching',
    'trust-systems',
    'live-superhuman',
  ]),

  // General/unknown: run everything to be safe
  general: new Set([
    'behavioral-context',
    'human-transfer',
    'scientific-coaching',
    'life-coaching',
    'trust-systems',
    'boundary-check',
    'live-superhuman',
    'health-awareness',
    'user-health',
    'visual-memory',
    'ambient-mode',
  ]),
};

// ============================================================================
// ADDITIONAL SIGNALS FOR SKIPPING
// ============================================================================

/**
 * Keywords that suggest health-related builders should run
 */
const HEALTH_KEYWORDS = [
  'sleep',
  'tired',
  'energy',
  'workout',
  'exercise',
  'steps',
  'heart',
  'health',
  'sick',
  'doctor',
  'medicine',
  'weight',
  'diet',
  'nutrition',
];

/**
 * Keywords that suggest visual memory should run
 */
const VISUAL_MEMORY_KEYWORDS = [
  'photo',
  'picture',
  'image',
  'screenshot',
  'showed you',
  'sent you',
  'look at',
  'remember when',
  'that picture',
];

/**
 * Keywords that suggest ambient mode should run
 */
const AMBIENT_MODE_KEYWORDS = [
  'where am i',
  'location',
  'home',
  'office',
  'work',
  'driving',
  'commute',
  'coffee shop',
  'meeting',
  'quiet',
];

// ============================================================================
// FILTER LOGIC
// ============================================================================

/**
 * Filter configuration returned by the topic analysis
 */
export interface BuilderFilterResult {
  /** Set of builders that should be skipped */
  skip: Set<BuilderName>;
  /** Set of builders that should run */
  run: Set<BuilderName>;
  /** Reason for the filtering decision */
  reason: string;
  /** Estimated savings in ms */
  estimatedSavingsMs: number;
}

/**
 * Determine which builders to skip based on topic and message content.
 *
 * @param topicCategory - Detected topic category
 * @param userText - Raw user message (for keyword analysis)
 * @param turnCount - Current turn number (early turns run more builders)
 * @returns Filter result with skip/run sets
 */
export function filterBuildersByTopic(
  topicCategory: TopicCategory | undefined,
  userText: string,
  turnCount = 0
): BuilderFilterResult {
  const category = topicCategory || 'general';
  const lowerText = userText.toLowerCase();

  // Start with the topic-based relevance set
  const relevantBuilders = new Set(TOPIC_BUILDER_RELEVANCE[category]);

  // Add back builders based on keyword signals in the message
  if (HEALTH_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    relevantBuilders.add('user-health');
    relevantBuilders.add('health-awareness');
  }

  if (VISUAL_MEMORY_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    relevantBuilders.add('visual-memory');
  }

  if (AMBIENT_MODE_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    relevantBuilders.add('ambient-mode');
  }

  // On early turns (0-2), be more conservative - run more builders
  // to establish context. After turn 2, we can be more aggressive.
  if (turnCount <= 2) {
    // Add all TIER 2 builders for early turns
    relevantBuilders.add('scientific-coaching');
    relevantBuilders.add('life-coaching');
    relevantBuilders.add('boundary-check');
    relevantBuilders.add('live-superhuman');
  }

  // Ensure NEVER_SKIP builders are always included
  for (const builder of NEVER_SKIP) {
    relevantBuilders.add(builder);
  }

  // Calculate which builders to skip
  const allBuilders: BuilderName[] = [
    'behavioral-context',
    'human-transfer',
    'scientific-coaching',
    'life-coaching',
    'trust-systems',
    'boundary-check',
    'live-superhuman',
    'health-awareness',
    'user-health',
    'visual-memory',
    'ambient-mode',
  ];

  const skip = new Set<BuilderName>();
  const run = new Set<BuilderName>();

  for (const builder of allBuilders) {
    if (relevantBuilders.has(builder)) {
      run.add(builder);
    } else {
      skip.add(builder);
    }
  }

  // Estimate savings: ~15ms per skipped async builder
  const estimatedSavingsMs = skip.size * 15;

  return {
    skip,
    run,
    reason: `Topic: ${category}, turns: ${turnCount}, skipping ${skip.size} builders`,
    estimatedSavingsMs,
  };
}

/**
 * Check if a specific builder should run based on the filter result.
 * Convenience method for use in Promise.all blocks.
 */
export function shouldRunBuilder(builder: BuilderName, filterResult: BuilderFilterResult): boolean {
  return filterResult.run.has(builder);
}

/**
 * Create a no-op promise that resolves immediately.
 * Used to replace skipped builders in Promise.all.
 */
export async function skipBuilder<T>(fallback: T): Promise<T> {
  return Promise.resolve(fallback);
}
