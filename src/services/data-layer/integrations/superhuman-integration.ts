/**
 * Superhuman Services Integration for Semantic Data Layer
 *
 * CONSOLIDATED: This file now wraps domain hooks for backward compatibility.
 * New code should use hooks directly from `../hooks/superhuman-hooks.js`.
 *
 * @module data-layer/integrations/superhuman-integration
 * @deprecated Import from `../hooks/superhuman-hooks.js` instead
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { onStoreChange } from '../store-hooks.js';
import type { EntityType, StoreType, ChangeType } from '../types.js';
import {
  onDreamChange,
  onLifeChapterChange,
  onValuesAlignmentChange,
  onCapacityStateChange,
  onRelationshipMilestoneChange,
  onSeasonalPatternChange,
  onPredictiveInsightChange,
} from '../hooks/superhuman-hooks.js';

const log = createLogger({ module: 'SuperhumanIntegration' });

// ============================================================================
// DREAM INDEXING
// ============================================================================

interface DreamForIndex {
  id: string;
  dream: string;
  category: string;
  timeframe?: string;
  status: string;
  steps?: string[];
  obstacles?: string[];
}

/**
 * Index a dream to semantic memory
 * @deprecated Use `onDreamChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexDream(
  userId: string,
  dream: DreamForIndex,
  changeType: ChangeType = 'update'
): void {
  // Skip deferred or abandoned dreams
  if (dream.status === 'deferred' || dream.status === 'abandoned') {
    log.debug({ id: dream.id }, 'Skipping inactive dream');
    return;
  }

  // Use the standardized hook
  onDreamChange(
    userId,
    dream.id,
    {
      dream: dream.dream,
      category: dream.category,
      status: dream.status as 'dreaming' | 'planning' | 'pursuing' | 'achieved' | 'released',
      steps: dream.steps,
      lastRevisited: new Date().toISOString(),
    },
    changeType
  );

  log.debug({ userId, id: dream.id }, 'Dream indexed via hook');
}

/**
 * Remove a dream from semantic index (when achieved/abandoned)
 */
export function deindexDream(userId: string, dreamId: string): void {
  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType: 'delete',
    userId,
    entityType: 'dream' as EntityType,
    entityId: dreamId,
    content: '',
  });

  log.debug({ userId, id: dreamId }, 'Dream removed from index');
}

// ============================================================================
// LIFE CHAPTER INDEXING
// ============================================================================

interface LifeChapterForIndex {
  id: string;
  title: string;
  summary: string;
  period?: { start: string; end?: string };
  themes?: string[];
  significance?: number;
}

/**
 * Index a life chapter (always indexed - life narrative)
 * @deprecated Use `onLifeChapterChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexLifeChapter(
  userId: string,
  chapter: LifeChapterForIndex,
  changeType: ChangeType = 'update'
): void {
  // Use the standardized hook
  onLifeChapterChange(
    userId,
    chapter.id,
    {
      title: chapter.title,
      period: chapter.period?.start
        ? `${chapter.period.start} to ${chapter.period.end || 'present'}`
        : undefined,
      themes: chapter.themes || [],
      keyMoments: [chapter.summary],
      lessonsLearned: [],
    },
    changeType
  );

  log.debug({ userId, id: chapter.id }, 'Life chapter indexed via hook');
}

// ============================================================================
// VALUES ALIGNMENT INDEXING
// ============================================================================

interface ValuesAlignmentForIndex {
  id: string;
  value: string;
  alignment: string;
  evidence?: string;
  recentActions?: string[];
}

/**
 * Index a values alignment check (always indexed)
 * @deprecated Use `onValuesAlignmentChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexValuesAlignment(
  userId: string,
  alignment: ValuesAlignmentForIndex,
  changeType: ChangeType = 'update'
): void {
  // Use the standardized hook
  onValuesAlignmentChange(
    userId,
    alignment.id,
    {
      value: alignment.value,
      alignmentScore: alignment.alignment === 'aligned' ? 0.9 : 0.5,
      recentExamples: alignment.recentActions || [],
      tension: alignment.evidence,
    },
    changeType
  );

  log.debug({ userId, id: alignment.id }, 'Values alignment indexed via hook');
}

// ============================================================================
// CAPACITY STATE INDEXING
// ============================================================================

interface CapacityStateForIndex {
  id: string;
  level: 'optimal' | 'good' | 'moderate' | 'low' | 'critical';
  factors?: string[];
  recommendation?: string;
}

// Map old level names to new entity level names
function mapCapacityLevel(
  level: CapacityStateForIndex['level']
): 'depleted' | 'low' | 'moderate' | 'good' | 'thriving' {
  const mapping: Record<
    CapacityStateForIndex['level'],
    'depleted' | 'low' | 'moderate' | 'good' | 'thriving'
  > = {
    critical: 'depleted',
    low: 'low',
    moderate: 'moderate',
    good: 'good',
    optimal: 'thriving',
  };
  return mapping[level];
}

/**
 * Index a capacity state (burnout prevention)
 * @deprecated Use `onCapacityStateChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexCapacityState(
  userId: string,
  state: CapacityStateForIndex,
  changeType: ChangeType = 'update'
): void {
  // Use the standardized hook
  onCapacityStateChange(
    userId,
    state.id,
    {
      level: mapCapacityLevel(state.level),
      factors: state.factors || [],
      recommendation: state.recommendation || '',
      timestamp: new Date().toISOString(),
    },
    changeType
  );

  log.debug({ userId, id: state.id }, 'Capacity state indexed via hook');
}

// ============================================================================
// RELATIONSHIP MILESTONE INDEXING
// ============================================================================

interface RelationshipMilestoneForIndex {
  id: string;
  contactName: string;
  milestone: string;
  date?: string;
  notes?: string;
}

/**
 * Index a relationship milestone (never forget anniversaries)
 * @deprecated Use `onRelationshipMilestoneChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexRelationshipMilestone(
  userId: string,
  milestone: RelationshipMilestoneForIndex,
  changeType: ChangeType = 'update'
): void {
  // Use the standardized hook
  onRelationshipMilestoneChange(
    userId,
    milestone.id,
    {
      milestone: milestone.milestone,
      relationship: milestone.contactName,
      significance: milestone.notes || '',
      date: milestone.date || new Date().toISOString(),
      celebrated: false,
    },
    changeType
  );

  log.debug({ userId, id: milestone.id }, 'Relationship milestone indexed via hook');
}

// ============================================================================
// SEASONAL PATTERN INDEXING
// ============================================================================

interface SeasonalPatternForIndex {
  id: string;
  pattern: string;
  season?: string;
  triggers?: string[];
  strategies?: string[];
}

/**
 * Index a seasonal pattern (anticipate struggles)
 * @deprecated Use `onSeasonalPatternChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexSeasonalPattern(
  userId: string,
  pattern: SeasonalPatternForIndex,
  changeType: ChangeType = 'update'
): void {
  // Use the standardized hook
  onSeasonalPatternChange(
    userId,
    pattern.id,
    {
      pattern: pattern.pattern,
      season: (pattern.season as 'spring' | 'summer' | 'fall' | 'winter') || 'spring',
      observation: pattern.triggers?.join(', ') || '',
      recommendation: pattern.strategies?.join(', ') || '',
    },
    changeType
  );

  log.debug({ userId, id: pattern.id }, 'Seasonal pattern indexed via hook');
}

// ============================================================================
// PREDICTIVE COACHING INDEXING
// ============================================================================

interface PredictiveCoachingForIndex {
  id: string;
  prediction: string;
  confidence: number;
  basedOn?: string[];
  suggestedAction?: string;
}

/**
 * Index a predictive coaching insight
 * @deprecated Use `onPredictiveInsightChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexPredictiveCoaching(
  userId: string,
  prediction: PredictiveCoachingForIndex,
  changeType: ChangeType = 'update'
): void {
  // Use the standardized hook
  onPredictiveInsightChange(
    userId,
    prediction.id,
    {
      prediction: prediction.prediction,
      basis: prediction.basedOn?.join(', ') || '',
      confidence:
        prediction.confidence > 0.7 ? 'high' : prediction.confidence > 0.4 ? 'medium' : 'low',
      actionSuggestion: prediction.suggestedAction,
    },
    changeType
  );

  log.debug({ userId, id: prediction.id }, 'Predictive coaching indexed via hook');
}

// ============================================================================
// EMOTIONAL FIRST AID INDEXING
// ============================================================================

interface EmotionalFirstAidForIndex {
  id: string;
  situation: string;
  emotionDetected: string;
  interventionUsed: string;
  outcome?: string;
}

/**
 * Index an emotional first aid intervention
 */
export function indexEmotionalFirstAid(
  userId: string,
  intervention: EmotionalFirstAidForIndex,
  changeType: ChangeType = 'update'
): void {
  const contentParts = [
    `Emotional first aid: ${intervention.situation}.`,
    `Emotion: ${intervention.emotionDetected}.`,
    `Intervention: ${intervention.interventionUsed}.`,
    intervention.outcome ? `Outcome: ${intervention.outcome}.` : '',
  ].filter(Boolean);

  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType,
    userId,
    entityType: 'emotional_first_aid' as EntityType,
    entityId: intervention.id,
    content: contentParts.join(' '),
    metadata: {
      emotionDetected: intervention.emotionDetected,
    },
  });

  log.debug({ userId, id: intervention.id }, 'Emotional first aid indexed');
}

// ============================================================================
// DEINDEX FUNCTIONS
// ============================================================================

/**
 * Remove a life chapter from semantic index
 */
export function deindexLifeChapter(userId: string, chapterId: string): void {
  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType: 'delete',
    userId,
    entityType: 'life_chapter' as EntityType,
    entityId: chapterId,
    content: '',
  });

  log.debug({ userId, id: chapterId }, 'Life chapter removed from index');
}

/**
 * Remove a values alignment from semantic index
 */
export function deindexValuesAlignment(userId: string, alignmentId: string): void {
  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType: 'delete',
    userId,
    entityType: 'values_alignment' as EntityType,
    entityId: alignmentId,
    content: '',
  });

  log.debug({ userId, id: alignmentId }, 'Values alignment removed from index');
}

/**
 * Remove a capacity state from semantic index
 */
export function deindexCapacityState(userId: string, stateId: string): void {
  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType: 'delete',
    userId,
    entityType: 'capacity_state' as EntityType,
    entityId: stateId,
    content: '',
  });

  log.debug({ userId, id: stateId }, 'Capacity state removed from index');
}

/**
 * Remove a relationship milestone from semantic index
 */
export function deindexRelationshipMilestone(userId: string, milestoneId: string): void {
  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType: 'delete',
    userId,
    entityType: 'relationship_milestone' as EntityType,
    entityId: milestoneId,
    content: '',
  });

  log.debug({ userId, id: milestoneId }, 'Relationship milestone removed from index');
}

/**
 * Remove a seasonal pattern from semantic index
 */
export function deindexSeasonalPattern(userId: string, patternId: string): void {
  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType: 'delete',
    userId,
    entityType: 'seasonal_pattern' as EntityType,
    entityId: patternId,
    content: '',
  });

  log.debug({ userId, id: patternId }, 'Seasonal pattern removed from index');
}

/**
 * Remove a predictive coaching insight from semantic index
 */
export function deindexPredictiveCoaching(userId: string, predictionId: string): void {
  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType: 'delete',
    userId,
    entityType: 'predictive_insight' as EntityType,
    entityId: predictionId,
    content: '',
  });

  log.debug({ userId, id: predictionId }, 'Predictive coaching removed from index');
}

/**
 * Remove an emotional first aid intervention from semantic index
 */
export function deindexEmotionalFirstAid(userId: string, interventionId: string): void {
  onStoreChange({
    storeType: 'superhuman' as StoreType,
    changeType: 'delete',
    userId,
    entityType: 'emotional_first_aid' as EntityType,
    entityId: interventionId,
    content: '',
  });

  log.debug({ userId, id: interventionId }, 'Emotional first aid removed from index');
}
