/**
 * Coaching & Growth Hooks
 *
 * Auto-indexing hooks for coaching insights and personal growth data.
 * Tracks breakthroughs, patterns, and growth edges.
 *
 * @module services/data-layer/hooks/coaching-hooks
 */
import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
// ============================================================================
// COACHING INSIGHTS
// ============================================================================
/**
 * Track AI coaching observations
 */
export const onCoachingInsightChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'coaching_insight',
    contentBuilder: (c) => joinNonEmpty([
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
export const onBreakthroughMomentChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'breakthrough_moment',
    contentBuilder: (b) => joinNonEmpty([
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
export const onStuckPatternChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'stuck_pattern',
    contentBuilder: (s) => joinNonEmpty([
        `Stuck pattern: ${s.pattern}.`,
        `Context: ${s.context}.`,
        `Frequency: ${s.frequency}.`,
        s.attempts?.length ? `Previous attempts: ${s.attempts.join(', ')}.` : '',
    ]),
    metadataExtractor: (s) => ({
        frequency: s.frequency,
    }),
});
/**
 * Track perspective shifts offered
 */
export const onReframeSuggestionChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'reframe_suggestion',
    contentBuilder: (r) => joinNonEmpty([
        `Reframe offered: "${r.reframe}".`,
        `Original: "${r.originalPerspective}".`,
        r.accepted ? 'Accepted.' : 'Not accepted.',
        formatField('Impact', r.impact),
    ]),
    metadataExtractor: (r) => ({
        accepted: r.accepted,
    }),
});
/**
 * Track current growth areas
 */
export const onGrowthEdgeChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'growth_edge',
    contentBuilder: (g) => joinNonEmpty([
        `Growth edge: ${g.area}.`,
        `Current: ${g.currentState}.`,
        `Target: ${g.targetState}.`,
        g.obstacles?.length ? `Obstacles: ${g.obstacles.join(', ')}.` : '',
    ]),
    metadataExtractor: (g) => ({
        area: g.area,
    }),
});
/**
 * Track identified user strengths
 */
export const onStrengthIdentifiedChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'strength_identified',
    contentBuilder: (s) => joinNonEmpty([
        `Strength: ${s.strength}.`,
        `Evidence: ${s.evidence}.`,
        `Category: ${s.category}.`,
        formatField('How to leverage', s.howToLeverage),
    ]),
    metadataExtractor: (s) => ({
        category: s.category,
    }),
});
/**
 * Track identified blind spots
 */
export const onBlindSpotChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'blind_spot',
    contentBuilder: (b) => joinNonEmpty([
        `Blind spot: ${b.blindSpot}.`,
        `Observation: ${b.observation}.`,
        `Impact: ${b.impact}.`,
    ]),
    metadataExtractor: (b) => ({
        surfacedGently: b.surfacedGently,
    }),
});
/**
 * Track accountability items
 */
export const onAccountabilityItemChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'accountability_item',
    contentBuilder: (a) => joinNonEmpty([
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
/**
 * Track attempted behavior changes
 */
export const onBehaviorChangeEntity = createDomainHook({
    storeType: 'coaching',
    entityType: 'behavior_change',
    contentBuilder: (b) => joinNonEmpty([
        `Behavior change: ${b.behavior}.`,
        `From: ${b.from}. To: ${b.to}.`,
        formatField('Trigger', b.trigger),
        `Progress: ${b.progress}.`,
    ]),
    metadataExtractor: (b) => ({
        progress: b.progress,
    }),
});
/**
 * Track what motivates the user
 */
export const onMotivationInsightChange = createDomainHook({
    storeType: 'coaching',
    entityType: 'motivation_insight',
    contentBuilder: (m) => joinNonEmpty([
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
//# sourceMappingURL=coaching-hooks.js.map