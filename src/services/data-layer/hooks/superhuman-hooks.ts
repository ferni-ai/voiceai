/**
 * Superhuman Services Hooks
 *
 * Auto-indexing hooks for "Better than Human" capabilities.
 * These represent what no human friend could consistently provide.
 *
 * @module services/data-layer/hooks/superhuman-hooks
 */

import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';
import type {
  DreamEntity,
  LifeChapterEntity,
  ValuesAlignmentEntity,
  CapacityStateEntity,
} from '../types.js';

// ============================================================================
// DREAM KEEPER
// ============================================================================

/**
 * Track user's dreams and aspirations
 */
export const onDreamChange = createDomainHook<DreamEntity>({
  storeType: 'superhuman',
  entityType: 'dream',
  contentBuilder: (d) =>
    joinNonEmpty([
      `Dream: ${d.dream}.`,
      `Category: ${d.category}.`,
      formatField('Timeframe', d.timeframe),
      d.steps?.length ? `Steps: ${d.steps.join(', ')}.` : '',
    ]),
  metadataExtractor: (d) => ({
    category: d.category,
    timeframe: d.timeframe,
    status: d.status,
  }),
  shouldSkip: (d) => d.status === 'deferred',
});

// ============================================================================
// LIFE NARRATIVE
// ============================================================================

/**
 * Track chapters of user's life story
 */
export const onLifeChapterChange = createDomainHook<LifeChapterEntity>({
  storeType: 'superhuman',
  entityType: 'life_chapter',
  contentBuilder: (c) => {
    // Handle period as string or object
    const periodStr = c.period
      ? typeof c.period === 'string'
        ? c.period
        : `${formatDate(c.period.start)}${c.period.end ? ` - ${formatDate(c.period.end)}` : ' - present'}`
      : '';
    return joinNonEmpty([
      `Life chapter: "${c.title}".`,
      c.summary,
      periodStr ? `Period: ${periodStr}.` : '',
      `Themes: ${c.themes.join(', ')}.`,
    ]);
  },
  metadataExtractor: (c) => ({
    themes: c.themes,
    periodStart: c.period && typeof c.period === 'object' ? c.period.start : c.period,
    periodEnd: c.period && typeof c.period === 'object' ? c.period.end : undefined,
  }),
});

// ============================================================================
// VALUES ALIGNMENT
// ============================================================================

/**
 * Track user's values and alignment
 */
export const onValuesAlignmentChange = createDomainHook<ValuesAlignmentEntity>({
  storeType: 'superhuman',
  entityType: 'values_alignment',
  contentBuilder: (v) =>
    joinNonEmpty([`Value: ${v.value}.`, `Alignment: ${v.alignment}.`, `Evidence: ${v.evidence}.`]),
  metadataExtractor: (v) => ({
    alignment: v.alignment,
    lastChecked: v.lastChecked,
  }),
});

// ============================================================================
// CAPACITY GUARDIAN
// ============================================================================

/**
 * Track user's energy and burnout levels
 */
export const onCapacityStateChange = createDomainHook<CapacityStateEntity>({
  storeType: 'superhuman',
  entityType: 'capacity_state',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Capacity level: ${c.level}.`,
      `Factors: ${c.factors.join(', ')}.`,
      `Recommendation: ${c.recommendation}.`,
    ]),
  metadataExtractor: (c) => ({
    level: c.level,
    timestamp: c.timestamp,
  }),
});

// ============================================================================
// ADDITIONAL SUPERHUMAN HOOKS
// ============================================================================

interface RelationshipMilestoneEntity {
  milestone: string;
  relationship: string;
  significance: string;
  date?: string;
  celebrated?: boolean;
}

/**
 * Track relationship milestones
 */
export const onRelationshipMilestoneChange = createDomainHook<RelationshipMilestoneEntity>({
  storeType: 'superhuman',
  entityType: 'relationship_milestone',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Relationship milestone: ${r.milestone}.`,
      `With: ${r.relationship}.`,
      `Significance: ${r.significance}.`,
      formatField('Date', r.date),
    ]),
  metadataExtractor: (r) => ({
    relationship: r.relationship,
    celebrated: r.celebrated,
    date: r.date,
  }),
});

interface SeasonalPatternEntity {
  pattern: string;
  season: 'spring' | 'summer' | 'fall' | 'winter' | 'holiday' | 'anniversary';
  observation: string;
  recommendation?: string;
}

/**
 * Track seasonal patterns and awareness
 */
export const onSeasonalPatternChange = createDomainHook<SeasonalPatternEntity>({
  storeType: 'superhuman',
  entityType: 'seasonal_pattern',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Seasonal pattern: ${s.pattern}.`,
      `Season: ${s.season}.`,
      `Observation: ${s.observation}.`,
      formatField('Recommendation', s.recommendation),
    ]),
  metadataExtractor: (s) => ({
    season: s.season,
  }),
});

interface EmotionalFirstAidEntity {
  situation: string;
  support: string;
  outcome?: string;
  date?: string;
  followUpNeeded?: boolean;
}

/**
 * Track crisis support moments
 */
export const onEmotionalFirstAidChange = createDomainHook<EmotionalFirstAidEntity>({
  storeType: 'superhuman',
  entityType: 'emotional_first_aid',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Emotional support: ${e.situation}.`,
      `Support provided: ${e.support}.`,
      formatField('Outcome', e.outcome),
    ]),
  metadataExtractor: (e) => ({
    followUpNeeded: e.followUpNeeded,
    date: e.date,
  }),
});

interface PredictiveInsightEntity {
  prediction: string;
  basis: string;
  confidence: 'low' | 'medium' | 'high';
  timeframe?: string;
  actionSuggestion?: string;
}

/**
 * Track predictive coaching insights
 */
export const onPredictiveInsightChange = createDomainHook<PredictiveInsightEntity>({
  storeType: 'superhuman',
  entityType: 'predictive_insight',
  contentBuilder: (p) =>
    joinNonEmpty([
      `Prediction: ${p.prediction}.`,
      `Based on: ${p.basis}.`,
      `Confidence: ${p.confidence}.`,
      formatField('Suggested action', p.actionSuggestion),
    ]),
  metadataExtractor: (p) => ({
    confidence: p.confidence,
    timeframe: p.timeframe,
  }),
});

interface CommitmentKeeperEntity {
  commitment: string;
  madeOn: string;
  status: 'pending' | 'completed' | 'overdue' | 'forgiven';
  remindersSent?: number;
}

/**
 * Track commitment keeping
 */
export const onCommitmentKeeperChange = createDomainHook<CommitmentKeeperEntity>({
  storeType: 'superhuman',
  entityType: 'commitment_keeper',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Commitment tracked: ${c.commitment}.`,
      `Made on: ${formatDate(c.madeOn)}.`,
      `Status: ${c.status}.`,
    ]),
  metadataExtractor: (c) => ({
    status: c.status,
    remindersSent: c.remindersSent,
  }),
  shouldSkip: (c) => c.status === 'forgiven',
});

interface RelationshipNetworkEntity {
  person: string;
  relationship: string;
  connectionStrength: 'weak' | 'moderate' | 'strong' | 'core';
  lastContact?: string;
  notes?: string;
}

/**
 * Track social network mapping
 */
export const onRelationshipNetworkChange = createDomainHook<RelationshipNetworkEntity>({
  storeType: 'superhuman',
  entityType: 'relationship_network',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Person: ${r.person}.`,
      `Relationship: ${r.relationship}.`,
      `Connection strength: ${r.connectionStrength}.`,
      formatField('Notes', r.notes),
    ]),
  metadataExtractor: (r) => ({
    connectionStrength: r.connectionStrength,
    lastContact: r.lastContact,
  }),
});

interface ConflictMemoryEntity {
  conflict: string;
  parties: string[];
  resolution?: string;
  lessonsLearned?: string;
  status: 'active' | 'resolved' | 'recurring';
}

/**
 * Track conflict resolution history
 */
export const onConflictMemoryChange = createDomainHook<ConflictMemoryEntity>({
  storeType: 'superhuman',
  entityType: 'conflict_memory',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Conflict: ${c.conflict}.`,
      `Parties: ${c.parties.join(', ')}.`,
      `Status: ${c.status}.`,
      formatField('Resolution', c.resolution),
      formatField('Lessons learned', c.lessonsLearned),
    ]),
  metadataExtractor: (c) => ({
    status: c.status,
    parties: c.parties,
  }),
});

interface RecoveryMilestoneEntity {
  milestone: string;
  recoveryFrom: string;
  significance: string;
  date?: string;
}

/**
 * Track recovery milestones
 */
export const onRecoveryMilestoneChange = createDomainHook<RecoveryMilestoneEntity>({
  storeType: 'superhuman',
  entityType: 'recovery_milestone',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Recovery milestone: ${r.milestone}.`,
      `Recovering from: ${r.recoveryFrom}.`,
      `Significance: ${r.significance}.`,
    ]),
  metadataExtractor: (r) => ({
    recoveryFrom: r.recoveryFrom,
    date: r.date,
  }),
});

// ============================================================================
// MOOD CALENDAR
// ============================================================================

interface MoodPatternEntity {
  mood: string;
  intensity: number;
  dayOfWeek: number;
  hourOfDay: number;
  context?: string;
}

/**
 * Track mood patterns for emotional prediction
 */
export const onMoodPatternChange = createDomainHook<MoodPatternEntity>({
  storeType: 'superhuman',
  entityType: 'emotional_pattern',
  contentBuilder: (m) =>
    joinNonEmpty([
      `Mood: ${m.mood} (intensity ${Math.round(m.intensity * 100)}%).`,
      `Day: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][m.dayOfWeek]}.`,
      `Time: ${m.hourOfDay}:00.`,
      formatField('Context', m.context),
    ]),
  metadataExtractor: (m) => ({
    mood: m.mood,
    intensity: m.intensity,
    dayOfWeek: m.dayOfWeek,
    hourOfDay: m.hourOfDay,
  }),
});

// ============================================================================
// ENERGY WAVE MAPPING
// ============================================================================

interface EnergyPatternEntity {
  conversationType: string;
  dayOfWeek: number;
  hourOfDay: number;
  engagement: number;
  outcome: 'positive' | 'neutral' | 'negative';
}

/**
 * Track energy patterns for optimal timing
 */
export const onEnergyPatternChange = createDomainHook<EnergyPatternEntity>({
  storeType: 'superhuman',
  entityType: 'capacity_state',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Conversation type: ${e.conversationType}.`,
      `Day: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][e.dayOfWeek]}.`,
      `Time: ${e.hourOfDay}:00.`,
      `Engagement: ${Math.round(e.engagement * 100)}%.`,
      `Outcome: ${e.outcome}.`,
    ]),
  metadataExtractor: (e) => ({
    conversationType: e.conversationType,
    engagement: e.engagement,
    outcome: e.outcome,
  }),
});

// ============================================================================
// EXPORTS
// ============================================================================

export const superhumanHooks = {
  onDreamChange,
  onLifeChapterChange,
  onValuesAlignmentChange,
  onCapacityStateChange,
  onRelationshipMilestoneChange,
  onSeasonalPatternChange,
  onEmotionalFirstAidChange,
  onPredictiveInsightChange,
  onCommitmentKeeperChange,
  onRelationshipNetworkChange,
  onConflictMemoryChange,
  onRecoveryMilestoneChange,
  onMoodPatternChange,
  onEnergyPatternChange,
};

export default superhumanHooks;
