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
import { onDreamChange, onLifeChapterChange, onValuesAlignmentChange, onCapacityStateChange, onRelationshipMilestoneChange, onSeasonalPatternChange, onPredictiveInsightChange, } from '../hooks/superhuman-hooks.js';
const log = createLogger({ module: 'SuperhumanIntegration' });
/**
 * Index a dream to semantic memory
 * @deprecated Use `onDreamChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexDream(userId, dream, changeType = 'update') {
    // Skip deferred or abandoned dreams
    if (dream.status === 'deferred' || dream.status === 'abandoned') {
        log.debug({ id: dream.id }, 'Skipping inactive dream');
        return;
    }
    // Use the standardized hook
    onDreamChange(userId, dream.id, {
        dream: dream.dream,
        category: dream.category,
        status: dream.status,
        steps: dream.steps,
        lastRevisited: new Date().toISOString(),
    }, changeType);
    log.debug({ userId, id: dream.id }, 'Dream indexed via hook');
}
/**
 * Remove a dream from semantic index (when achieved/abandoned)
 */
export function deindexDream(userId, dreamId) {
    onStoreChange({
        storeType: 'superhuman',
        changeType: 'delete',
        userId,
        entityType: 'dream',
        entityId: dreamId,
        content: '',
    });
    log.debug({ userId, id: dreamId }, 'Dream removed from index');
}
/**
 * Index a life chapter (always indexed - life narrative)
 * @deprecated Use `onLifeChapterChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexLifeChapter(userId, chapter, changeType = 'update') {
    // Use the standardized hook
    onLifeChapterChange(userId, chapter.id, {
        title: chapter.title,
        period: chapter.period?.start
            ? `${chapter.period.start} to ${chapter.period.end || 'present'}`
            : undefined,
        themes: chapter.themes || [],
        keyMoments: [chapter.summary],
        lessonsLearned: [],
    }, changeType);
    log.debug({ userId, id: chapter.id }, 'Life chapter indexed via hook');
}
/**
 * Index a values alignment check (always indexed)
 * @deprecated Use `onValuesAlignmentChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexValuesAlignment(userId, alignment, changeType = 'update') {
    // Use the standardized hook
    onValuesAlignmentChange(userId, alignment.id, {
        value: alignment.value,
        alignmentScore: alignment.alignment === 'aligned' ? 0.9 : 0.5,
        recentExamples: alignment.recentActions || [],
        tension: alignment.evidence,
    }, changeType);
    log.debug({ userId, id: alignment.id }, 'Values alignment indexed via hook');
}
// Map old level names to new entity level names
function mapCapacityLevel(level) {
    const mapping = {
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
export function indexCapacityState(userId, state, changeType = 'update') {
    // Use the standardized hook
    onCapacityStateChange(userId, state.id, {
        level: mapCapacityLevel(state.level),
        factors: state.factors || [],
        recommendation: state.recommendation || '',
        timestamp: new Date().toISOString(),
    }, changeType);
    log.debug({ userId, id: state.id }, 'Capacity state indexed via hook');
}
/**
 * Index a relationship milestone (never forget anniversaries)
 * @deprecated Use `onRelationshipMilestoneChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexRelationshipMilestone(userId, milestone, changeType = 'update') {
    // Use the standardized hook
    onRelationshipMilestoneChange(userId, milestone.id, {
        milestone: milestone.milestone,
        relationship: milestone.contactName,
        significance: milestone.notes || '',
        date: milestone.date || new Date().toISOString(),
        celebrated: false,
    }, changeType);
    log.debug({ userId, id: milestone.id }, 'Relationship milestone indexed via hook');
}
/**
 * Index a seasonal pattern (anticipate struggles)
 * @deprecated Use `onSeasonalPatternChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexSeasonalPattern(userId, pattern, changeType = 'update') {
    // Use the standardized hook
    onSeasonalPatternChange(userId, pattern.id, {
        pattern: pattern.pattern,
        season: pattern.season || 'spring',
        observation: pattern.triggers?.join(', ') || '',
        recommendation: pattern.strategies?.join(', ') || '',
    }, changeType);
    log.debug({ userId, id: pattern.id }, 'Seasonal pattern indexed via hook');
}
/**
 * Index a predictive coaching insight
 * @deprecated Use `onPredictiveInsightChange` from `../hooks/superhuman-hooks.js` instead
 */
export function indexPredictiveCoaching(userId, prediction, changeType = 'update') {
    // Use the standardized hook
    onPredictiveInsightChange(userId, prediction.id, {
        prediction: prediction.prediction,
        basis: prediction.basedOn?.join(', ') || '',
        confidence: prediction.confidence > 0.7 ? 'high' : prediction.confidence > 0.4 ? 'medium' : 'low',
        actionSuggestion: prediction.suggestedAction,
    }, changeType);
    log.debug({ userId, id: prediction.id }, 'Predictive coaching indexed via hook');
}
/**
 * Index an emotional first aid intervention
 */
export function indexEmotionalFirstAid(userId, intervention, changeType = 'update') {
    const contentParts = [
        `Emotional first aid: ${intervention.situation}.`,
        `Emotion: ${intervention.emotionDetected}.`,
        `Intervention: ${intervention.interventionUsed}.`,
        intervention.outcome ? `Outcome: ${intervention.outcome}.` : '',
    ].filter(Boolean);
    onStoreChange({
        storeType: 'superhuman',
        changeType,
        userId,
        entityType: 'emotional_first_aid',
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
export function deindexLifeChapter(userId, chapterId) {
    onStoreChange({
        storeType: 'superhuman',
        changeType: 'delete',
        userId,
        entityType: 'life_chapter',
        entityId: chapterId,
        content: '',
    });
    log.debug({ userId, id: chapterId }, 'Life chapter removed from index');
}
/**
 * Remove a values alignment from semantic index
 */
export function deindexValuesAlignment(userId, alignmentId) {
    onStoreChange({
        storeType: 'superhuman',
        changeType: 'delete',
        userId,
        entityType: 'values_alignment',
        entityId: alignmentId,
        content: '',
    });
    log.debug({ userId, id: alignmentId }, 'Values alignment removed from index');
}
/**
 * Remove a capacity state from semantic index
 */
export function deindexCapacityState(userId, stateId) {
    onStoreChange({
        storeType: 'superhuman',
        changeType: 'delete',
        userId,
        entityType: 'capacity_state',
        entityId: stateId,
        content: '',
    });
    log.debug({ userId, id: stateId }, 'Capacity state removed from index');
}
/**
 * Remove a relationship milestone from semantic index
 */
export function deindexRelationshipMilestone(userId, milestoneId) {
    onStoreChange({
        storeType: 'superhuman',
        changeType: 'delete',
        userId,
        entityType: 'relationship_milestone',
        entityId: milestoneId,
        content: '',
    });
    log.debug({ userId, id: milestoneId }, 'Relationship milestone removed from index');
}
/**
 * Remove a seasonal pattern from semantic index
 */
export function deindexSeasonalPattern(userId, patternId) {
    onStoreChange({
        storeType: 'superhuman',
        changeType: 'delete',
        userId,
        entityType: 'seasonal_pattern',
        entityId: patternId,
        content: '',
    });
    log.debug({ userId, id: patternId }, 'Seasonal pattern removed from index');
}
/**
 * Remove a predictive coaching insight from semantic index
 */
export function deindexPredictiveCoaching(userId, predictionId) {
    onStoreChange({
        storeType: 'superhuman',
        changeType: 'delete',
        userId,
        entityType: 'predictive_insight',
        entityId: predictionId,
        content: '',
    });
    log.debug({ userId, id: predictionId }, 'Predictive coaching removed from index');
}
/**
 * Remove an emotional first aid intervention from semantic index
 */
export function deindexEmotionalFirstAid(userId, interventionId) {
    onStoreChange({
        storeType: 'superhuman',
        changeType: 'delete',
        userId,
        entityType: 'emotional_first_aid',
        entityId: interventionId,
        content: '',
    });
    log.debug({ userId, id: interventionId }, 'Emotional first aid removed from index');
}
//# sourceMappingURL=superhuman-integration.js.map