/**
 * Coaching & Growth Hooks
 *
 * Auto-indexing hooks for coaching insights and personal growth data.
 * Tracks breakthroughs, patterns, and growth edges.
 *
 * @module services/data-layer/hooks/coaching-hooks
 */

import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
import type {
  CoachingInsightEntity,
  BreakthroughMomentEntity,
  StuckPatternEntity,
} from '../types.js';

// ============================================================================
// COACHING INSIGHTS
// ============================================================================

/**
 * Track AI coaching observations
 */
export const onCoachingInsightChange = createDomainHook<CoachingInsightEntity>({
  storeType: 'coaching',
  entityType: 'coaching_insight',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Coaching insight: ${c.insight}.`,
      `Context: ${c.context}.`,
      `Category: ${c.category}.`,
      c.actionable ? 'Actionable.' : '',
    ]),
  metadataExtractor: (c) => ({
    category: c.category,
    personaId: c.personaId,
    actionable: c.actionable,
  }),
});

// ============================================================================
// BREAKTHROUGH MOMENTS
// ============================================================================

/**
 * Track aha moments and breakthroughs
 */
export const onBreakthroughMomentChange = createDomainHook<BreakthroughMomentEntity>({
  storeType: 'coaching',
  entityType: 'breakthrough_moment',
  contentBuilder: (b) =>
    joinNonEmpty([
      `Breakthrough: ${b.description}.`,
      `Triggered by: ${b.trigger}.`,
      `Impact: ${b.impact}.`,
    ]),
  metadataExtractor: (b) => ({
    date: b.date,
  }),
});

// ============================================================================
// STUCK PATTERNS
// ============================================================================

/**
 * Track recurring blockers and stuck patterns
 */
export const onStuckPatternChange = createDomainHook<StuckPatternEntity>({
  storeType: 'coaching',
  entityType: 'stuck_pattern',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Stuck pattern: ${s.pattern}.`,
      `Context: ${s.context}.`,
      `Frequency: ${s.frequency}.`,
      s.attempts?.length ? `Previous attempts: ${s.attempts.join(', ')}.` : '',
    ]),
  metadataExtractor: (s) => ({
    frequency: s.frequency,
  }),
});

// ============================================================================
// ADDITIONAL COACHING HOOKS
// ============================================================================

interface ReframeSuggestionEntity {
  originalPerspective: string;
  reframe: string;
  accepted: boolean;
  impact?: string;
}

/**
 * Track perspective shifts offered
 */
export const onReframeSuggestionChange = createDomainHook<ReframeSuggestionEntity>({
  storeType: 'coaching',
  entityType: 'reframe_suggestion',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Reframe offered: "${r.reframe}".`,
      `Original: "${r.originalPerspective}".`,
      r.accepted ? 'Accepted.' : 'Not accepted.',
      formatField('Impact', r.impact),
    ]),
  metadataExtractor: (r) => ({
    accepted: r.accepted,
  }),
});

interface GrowthEdgeEntity {
  area: string;
  currentState: string;
  targetState: string;
  obstacles?: string[];
  strategies?: string[];
}

/**
 * Track current growth areas
 */
export const onGrowthEdgeChange = createDomainHook<GrowthEdgeEntity>({
  storeType: 'coaching',
  entityType: 'growth_edge',
  contentBuilder: (g) =>
    joinNonEmpty([
      `Growth edge: ${g.area}.`,
      `Current: ${g.currentState}.`,
      `Target: ${g.targetState}.`,
      g.obstacles?.length ? `Obstacles: ${g.obstacles.join(', ')}.` : '',
    ]),
  metadataExtractor: (g) => ({
    area: g.area,
  }),
});

interface StrengthIdentifiedEntity {
  strength: string;
  evidence: string;
  category: 'character' | 'skill' | 'talent' | 'knowledge';
  howToLeverage?: string;
}

/**
 * Track identified user strengths
 */
export const onStrengthIdentifiedChange = createDomainHook<StrengthIdentifiedEntity>({
  storeType: 'coaching',
  entityType: 'strength_identified',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Strength: ${s.strength}.`,
      `Evidence: ${s.evidence}.`,
      `Category: ${s.category}.`,
      formatField('How to leverage', s.howToLeverage),
    ]),
  metadataExtractor: (s) => ({
    category: s.category,
  }),
});

interface BlindSpotEntity {
  blindSpot: string;
  observation: string;
  impact: string;
  surfacedGently: boolean;
}

/**
 * Track identified blind spots
 */
export const onBlindSpotChange = createDomainHook<BlindSpotEntity>({
  storeType: 'coaching',
  entityType: 'blind_spot',
  contentBuilder: (b) =>
    joinNonEmpty([
      `Blind spot: ${b.blindSpot}.`,
      `Observation: ${b.observation}.`,
      `Impact: ${b.impact}.`,
    ]),
  metadataExtractor: (b) => ({
    surfacedGently: b.surfacedGently,
  }),
});

interface AccountabilityItemEntity {
  item: string;
  agreedOn: string;
  dueDate?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'missed';
  checkIns?: number;
}

/**
 * Track accountability items
 */
export const onAccountabilityItemChange = createDomainHook<AccountabilityItemEntity>({
  storeType: 'coaching',
  entityType: 'accountability_item',
  contentBuilder: (a) =>
    joinNonEmpty([
      `Accountability: ${a.item}.`,
      `Agreed on: ${a.agreedOn}.`,
      formatField('Due', a.dueDate),
      `Status: ${a.status}.`,
    ]),
  metadataExtractor: (a) => ({
    status: a.status,
    checkIns: a.checkIns,
  }),
  shouldSkip: (a) => a.status === 'completed',
});

interface BehaviorChangeEntity {
  behavior: string;
  from: string;
  to: string;
  trigger?: string;
  progress: 'starting' | 'practicing' | 'habitual' | 'mastered';
}

/**
 * Track attempted behavior changes
 */
export const onBehaviorChangeEntity = createDomainHook<BehaviorChangeEntity>({
  storeType: 'coaching',
  entityType: 'behavior_change',
  contentBuilder: (b) =>
    joinNonEmpty([
      `Behavior change: ${b.behavior}.`,
      `From: ${b.from}. To: ${b.to}.`,
      formatField('Trigger', b.trigger),
      `Progress: ${b.progress}.`,
    ]),
  metadataExtractor: (b) => ({
    progress: b.progress,
  }),
});

interface MotivationInsightEntity {
  insight: string;
  context: string;
  motivationType: 'intrinsic' | 'extrinsic' | 'purpose' | 'fear' | 'growth';
}

/**
 * Track what motivates the user
 */
export const onMotivationInsightChange = createDomainHook<MotivationInsightEntity>({
  storeType: 'coaching',
  entityType: 'motivation_insight',
  contentBuilder: (m) =>
    joinNonEmpty([
      `Motivation: ${m.insight}.`,
      `Context: ${m.context}.`,
      `Type: ${m.motivationType}.`,
    ]),
  metadataExtractor: (m) => ({
    motivationType: m.motivationType,
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const coachingHooks = {
  onCoachingInsightChange,
  onBreakthroughMomentChange,
  onStuckPatternChange,
  onReframeSuggestionChange,
  onGrowthEdgeChange,
  onStrengthIdentifiedChange,
  onBlindSpotChange,
  onAccountabilityItemChange,
  onBehaviorChangeEntity,
  onMotivationInsightChange,
};

export default coachingHooks;
