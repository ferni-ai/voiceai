/**
 * Semantic Experiment Router
 *
 * Intelligently routes users to relevant experiments based on:
 * - Semantic tags and categories
 * - User context and intent
 * - Experiment eligibility rules
 * - Mutual exclusion groups
 *
 * Unlike hard-coded experiment placement, this enables experiments
 * to be discovered based on meaning - a "superhuman" capability that
 * allows experiments to compose naturally.
 *
 * @module experiments/semantic-router
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { UserContext } from './contextual-selector.js';

const log = createLogger({ module: 'semantic-router' });

// ============================================================================
// Types
// ============================================================================

export interface ExperimentMetadata {
  id: string;
  name: string;
  tags: string[]; // Semantic tags like 'onboarding', 'engagement', 'trust'
  categories: string[]; // Higher-level categories
  intent: string[]; // User intents this experiment addresses
  priority: number; // Higher = more important (0-100)
  status: 'draft' | 'running' | 'paused' | 'graduated' | 'stopped';

  // Eligibility
  eligibility: EligibilityRules;

  // Mutual exclusion
  mutualExclusionGroup?: string; // Only one experiment per group per user
  conflictsWith?: string[]; // Specific experiments that can't run together

  // Targeting
  targetAudience?: AudienceDefinition;

  // Metadata
  createdAt: number;
  owner?: string;
  description?: string;
}

export interface EligibilityRules {
  minSessionCount?: number;
  maxSessionCount?: number;
  isNewUser?: boolean;
  requiredSegments?: string[];
  excludedSegments?: string[];
  geoTargets?: string[]; // Country codes
  deviceTargets?: Array<'mobile' | 'tablet' | 'desktop'>;
  timeWindowStart?: number; // Hour of day (0-23)
  timeWindowEnd?: number;
  dayOfWeekTargets?: number[]; // 0-6, Sunday = 0
  trafficPercentage?: number; // 0-100, for gradual rollout
}

export interface AudienceDefinition {
  segments: string[];
  customRules?: CustomRule[];
}

export interface CustomRule {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains';
  value: unknown;
}

export interface RoutingContext extends UserContext {
  currentPage?: string;
  currentIntent?: string;
  userSegments?: string[];
  activeExperiments?: string[]; // Already enrolled experiments
  sessionId?: string;
  userId?: string;
}

export interface RoutingResult {
  experimentId: string;
  score: number; // How well this experiment matches (0-1)
  matchedTags: string[];
  matchedIntents: string[];
  reason: string;
}

export interface RoutingDecision {
  selectedExperiments: RoutingResult[];
  excludedExperiments: Array<{
    experimentId: string;
    reason: string;
  }>;
  totalCandidates: number;
}

// ============================================================================
// Semantic Matching
// ============================================================================

/**
 * Calculate semantic similarity between two tag sets
 * Uses Jaccard similarity with weighted tags
 */
export function calculateTagSimilarity(queryTags: string[], experimentTags: string[]): number {
  if (queryTags.length === 0 || experimentTags.length === 0) return 0;

  const querySet = new Set(queryTags.map((t) => t.toLowerCase()));
  const expSet = new Set(experimentTags.map((t) => t.toLowerCase()));

  // Calculate intersection
  const intersection = [...querySet].filter((t) => expSet.has(t));

  // Jaccard similarity: intersection / union
  const union = new Set([...querySet, ...expSet]);
  return intersection.length / union.size;
}

/**
 * Calculate intent match score
 * Returns 1 for exact match, 0.5 for partial, 0 for no match
 */
export function calculateIntentMatch(queryIntent: string, experimentIntents: string[]): number {
  const normalizedQuery = queryIntent.toLowerCase().trim();

  for (const intent of experimentIntents) {
    const normalizedIntent = intent.toLowerCase().trim();

    // Exact match
    if (normalizedIntent === normalizedQuery) return 1;

    // Partial match (query is substring of intent or vice versa)
    if (normalizedIntent.includes(normalizedQuery) || normalizedQuery.includes(normalizedIntent)) {
      return 0.7;
    }

    // Word overlap
    const queryWords = new Set(normalizedQuery.split(/\s+/));
    const intentWords = new Set(normalizedIntent.split(/\s+/));
    const overlap = [...queryWords].filter((w) => intentWords.has(w)).length;
    if (overlap > 0) {
      return 0.3 + (0.3 * overlap) / Math.max(queryWords.size, intentWords.size);
    }
  }

  return 0;
}

// ============================================================================
// Eligibility Checking
// ============================================================================

/**
 * Check if a user/context is eligible for an experiment
 */
export function checkEligibility(
  experiment: ExperimentMetadata,
  context: RoutingContext
): { eligible: boolean; reason?: string } {
  const rules = experiment.eligibility;

  // Status check
  if (experiment.status !== 'running') {
    return { eligible: false, reason: `Experiment status is ${experiment.status}` };
  }

  // Session count
  if (rules.minSessionCount !== undefined && context.sessionCount !== undefined) {
    if (context.sessionCount < rules.minSessionCount) {
      return { eligible: false, reason: 'Below minimum session count' };
    }
  }
  if (rules.maxSessionCount !== undefined && context.sessionCount !== undefined) {
    if (context.sessionCount > rules.maxSessionCount) {
      return { eligible: false, reason: 'Above maximum session count' };
    }
  }

  // New user check
  if (rules.isNewUser !== undefined && context.isNewUser !== undefined) {
    if (rules.isNewUser !== context.isNewUser) {
      return {
        eligible: false,
        reason: rules.isNewUser ? 'New users only' : 'Returning users only',
      };
    }
  }

  // Segment checks
  if (rules.requiredSegments && context.userSegments) {
    const hasRequired = rules.requiredSegments.some((s) => context.userSegments!.includes(s));
    if (!hasRequired) {
      return { eligible: false, reason: 'Missing required segment' };
    }
  }
  if (rules.excludedSegments && context.userSegments) {
    const hasExcluded = rules.excludedSegments.some((s) => context.userSegments!.includes(s));
    if (hasExcluded) {
      return { eligible: false, reason: 'In excluded segment' };
    }
  }

  // Geographic targeting
  if (rules.geoTargets && rules.geoTargets.length > 0 && context.country) {
    if (!rules.geoTargets.includes(context.country)) {
      return { eligible: false, reason: 'Outside geographic target' };
    }
  }

  // Device targeting
  if (rules.deviceTargets && rules.deviceTargets.length > 0 && context.device) {
    if (!rules.deviceTargets.includes(context.device)) {
      return { eligible: false, reason: 'Device not targeted' };
    }
  }

  // Time window
  if (
    rules.timeWindowStart !== undefined &&
    rules.timeWindowEnd !== undefined &&
    context.localHour !== undefined
  ) {
    const hour = context.localHour;
    if (rules.timeWindowStart <= rules.timeWindowEnd) {
      // Normal window (e.g., 9-17)
      if (hour < rules.timeWindowStart || hour > rules.timeWindowEnd) {
        return { eligible: false, reason: 'Outside time window' };
      }
    } else {
      // Overnight window (e.g., 20-6)
      if (hour < rules.timeWindowStart && hour > rules.timeWindowEnd) {
        return { eligible: false, reason: 'Outside time window' };
      }
    }
  }

  // Day of week
  if (
    rules.dayOfWeekTargets &&
    rules.dayOfWeekTargets.length > 0 &&
    context.dayOfWeek !== undefined
  ) {
    if (!rules.dayOfWeekTargets.includes(context.dayOfWeek)) {
      return { eligible: false, reason: 'Day of week not targeted' };
    }
  }

  // Traffic percentage (deterministic based on userId)
  if (rules.trafficPercentage !== undefined && rules.trafficPercentage < 100) {
    const hash = hashUserId(context.userId || context.sessionId || 'anonymous');
    const bucket = hash % 100;
    if (bucket >= rules.trafficPercentage) {
      return { eligible: false, reason: 'Outside traffic allocation' };
    }
  }

  return { eligible: true };
}

/**
 * Simple hash function for deterministic bucketing
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// Mutual Exclusion
// ============================================================================

/**
 * Filter out experiments that conflict with already active ones
 */
export function filterMutualExclusions(
  candidates: ExperimentMetadata[],
  activeExperiments: string[]
): Array<{ experiment: ExperimentMetadata; excluded: boolean; reason?: string }> {
  // Build lookup of active experiment groups
  const activeGroups = new Set<string>();
  const activeIds = new Set(activeExperiments);

  // We need the metadata for active experiments too, but we might not have it
  // In production, this would come from a cache/store

  return candidates.map((experiment) => {
    // Check direct conflicts
    if (experiment.conflictsWith) {
      const conflict = experiment.conflictsWith.find((id) => activeIds.has(id));
      if (conflict) {
        return {
          experiment,
          excluded: true,
          reason: `Conflicts with active experiment ${conflict}`,
        };
      }
    }

    // Check mutual exclusion groups
    if (experiment.mutualExclusionGroup && activeGroups.has(experiment.mutualExclusionGroup)) {
      return {
        experiment,
        excluded: true,
        reason: `Mutual exclusion group ${experiment.mutualExclusionGroup}`,
      };
    }

    // Add this experiment's group to active groups for subsequent checks
    if (experiment.mutualExclusionGroup) {
      activeGroups.add(experiment.mutualExclusionGroup);
    }

    return { experiment, excluded: false };
  });
}

// ============================================================================
// Main Routing Functions
// ============================================================================

/**
 * Route to experiments based on semantic query
 */
export function routeByTags(
  queryTags: string[],
  experiments: ExperimentMetadata[],
  context: RoutingContext,
  limit: number = 5
): RoutingDecision {
  const results: RoutingResult[] = [];
  const excluded: Array<{ experimentId: string; reason: string }> = [];

  // First pass: check eligibility and calculate scores
  for (const experiment of experiments) {
    const eligibility = checkEligibility(experiment, context);

    if (!eligibility.eligible) {
      excluded.push({
        experimentId: experiment.id,
        reason: eligibility.reason || 'Not eligible',
      });
      continue;
    }

    // Calculate semantic score
    const tagScore = calculateTagSimilarity(queryTags, experiment.tags);
    const categoryScore = calculateTagSimilarity(queryTags, experiment.categories);
    const intentScore = context.currentIntent
      ? calculateIntentMatch(context.currentIntent, experiment.intent)
      : 0;

    // Combined score with weights
    const score =
      tagScore * 0.4 + categoryScore * 0.2 + intentScore * 0.3 + (experiment.priority / 100) * 0.1;

    if (score > 0.1) {
      // Minimum threshold
      results.push({
        experimentId: experiment.id,
        score,
        matchedTags: queryTags.filter((t) =>
          experiment.tags.map((et) => et.toLowerCase()).includes(t.toLowerCase())
        ),
        matchedIntents: context.currentIntent
          ? experiment.intent.filter((i) =>
              i.toLowerCase().includes(context.currentIntent!.toLowerCase())
            )
          : [],
        reason: `Score: ${score.toFixed(3)} (tags: ${tagScore.toFixed(2)}, category: ${categoryScore.toFixed(2)}, intent: ${intentScore.toFixed(2)})`,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply mutual exclusion filtering
  const filteredResults: RoutingResult[] = [];
  const activeGroups = new Set<string>();

  for (const result of results) {
    const experiment = experiments.find((e) => e.id === result.experimentId)!;

    // Check active experiments
    if (context.activeExperiments?.includes(experiment.id)) {
      // Already enrolled, keep it
      filteredResults.push(result);
      if (experiment.mutualExclusionGroup) {
        activeGroups.add(experiment.mutualExclusionGroup);
      }
      continue;
    }

    // Check mutual exclusion
    if (experiment.mutualExclusionGroup && activeGroups.has(experiment.mutualExclusionGroup)) {
      excluded.push({
        experimentId: experiment.id,
        reason: `Mutual exclusion: ${experiment.mutualExclusionGroup}`,
      });
      continue;
    }

    filteredResults.push(result);
    if (experiment.mutualExclusionGroup) {
      activeGroups.add(experiment.mutualExclusionGroup);
    }

    if (filteredResults.length >= limit) break;
  }

  log.debug(
    {
      queryTags,
      candidates: experiments.length,
      eligible: results.length,
      selected: filteredResults.length,
    },
    'Semantic routing complete'
  );

  return {
    selectedExperiments: filteredResults.slice(0, limit),
    excludedExperiments: excluded,
    totalCandidates: experiments.length,
  };
}

/**
 * Route by user intent
 */
export function routeByIntent(
  intent: string,
  experiments: ExperimentMetadata[],
  context: RoutingContext,
  limit: number = 3
): RoutingDecision {
  return routeByTags([intent], experiments, { ...context, currentIntent: intent }, limit);
}

/**
 * Get all experiments for a page/location
 */
export function getExperimentsForPage(
  page: string,
  experiments: ExperimentMetadata[],
  context: RoutingContext
): RoutingDecision {
  // Pages are typically tagged with page-specific tags
  const pageTags = [page, `page:${page}`, `location:${page}`];

  return routeByTags(pageTags, experiments, { ...context, currentPage: page }, 10);
}

// ============================================================================
// Experiment Registry Helpers
// ============================================================================

/**
 * Create experiment metadata with defaults
 */
export function createExperimentMetadata(
  partial: Partial<ExperimentMetadata> & { id: string; name: string }
): ExperimentMetadata {
  return {
    tags: [],
    categories: [],
    intent: [],
    priority: 50,
    status: 'draft',
    eligibility: {},
    createdAt: Date.now(),
    ...partial,
  };
}

/**
 * Validate experiment metadata
 */
export function validateExperimentMetadata(metadata: ExperimentMetadata): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!metadata.id || metadata.id.length < 3) {
    errors.push('ID must be at least 3 characters');
  }

  if (!metadata.name || metadata.name.length < 3) {
    errors.push('Name must be at least 3 characters');
  }

  if (metadata.tags.length === 0) {
    errors.push('At least one tag is required');
  }

  if (metadata.priority < 0 || metadata.priority > 100) {
    errors.push('Priority must be between 0 and 100');
  }

  if (
    metadata.eligibility.trafficPercentage !== undefined &&
    (metadata.eligibility.trafficPercentage < 0 || metadata.eligibility.trafficPercentage > 100)
  ) {
    errors.push('Traffic percentage must be between 0 and 100');
  }

  return { valid: errors.length === 0, errors };
}

export default {
  calculateTagSimilarity,
  calculateIntentMatch,
  checkEligibility,
  filterMutualExclusions,
  routeByTags,
  routeByIntent,
  getExperimentsForPage,
  createExperimentMetadata,
  validateExperimentMetadata,
};
