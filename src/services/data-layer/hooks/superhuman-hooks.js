/**
 * Superhuman Services Hooks
 *
 * Auto-indexing hooks for "Better than Human" capabilities.
 * These represent what no human friend could consistently provide.
 *
 * @module services/data-layer/hooks/superhuman-hooks
 */
import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';
// ============================================================================
// DREAM KEEPER
// ============================================================================
/**
 * Track user's dreams and aspirations
 * Only indexes active dreams (skips deferred, achieved, abandoned)
 */
export const onDreamChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'dream',
    contentBuilder: (d) => joinNonEmpty([
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
    // Only index active dreams - achieved/deferred/abandoned are no longer relevant
    shouldSkip: (d) => d.status !== 'active',
});
// ============================================================================
// LIFE NARRATIVE
// ============================================================================
/**
 * Track chapters of user's life story
 */
export const onLifeChapterChange = createDomainHook({
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
export const onValuesAlignmentChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'values_alignment',
    contentBuilder: (v) => joinNonEmpty([`Value: ${v.value}.`, `Alignment: ${v.alignment}.`, `Evidence: ${v.evidence}.`]),
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
export const onCapacityStateChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'capacity_state',
    contentBuilder: (c) => joinNonEmpty([
        `Capacity level: ${c.level}.`,
        `Factors: ${c.factors.join(', ')}.`,
        `Recommendation: ${c.recommendation}.`,
    ]),
    metadataExtractor: (c) => ({
        level: c.level,
        timestamp: c.timestamp,
    }),
});
/**
 * Track relationship milestones
 */
export const onRelationshipMilestoneChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'relationship_milestone',
    contentBuilder: (r) => joinNonEmpty([
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
/**
 * Track seasonal patterns and awareness
 */
export const onSeasonalPatternChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'seasonal_pattern',
    contentBuilder: (s) => joinNonEmpty([
        `Seasonal pattern: ${s.pattern}.`,
        `Season: ${s.season}.`,
        `Observation: ${s.observation}.`,
        formatField('Recommendation', s.recommendation),
    ]),
    metadataExtractor: (s) => ({
        season: s.season,
    }),
});
/**
 * Track crisis support moments
 */
export const onEmotionalFirstAidChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'emotional_first_aid',
    contentBuilder: (e) => joinNonEmpty([
        `Emotional support: ${e.situation}.`,
        `Support provided: ${e.support}.`,
        formatField('Outcome', e.outcome),
    ]),
    metadataExtractor: (e) => ({
        followUpNeeded: e.followUpNeeded,
        date: e.date,
    }),
});
/**
 * Track predictive coaching insights
 */
export const onPredictiveInsightChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'predictive_insight',
    contentBuilder: (p) => joinNonEmpty([
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
/**
 * Track commitment keeping
 * Only indexes pending/overdue commitments (skips completed/forgiven)
 */
export const onCommitmentKeeperChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'commitment_keeper',
    contentBuilder: (c) => joinNonEmpty([
        `Commitment tracked: ${c.commitment}.`,
        `Made on: ${formatDate(c.madeOn)}.`,
        `Status: ${c.status}.`,
    ]),
    metadataExtractor: (c) => ({
        status: c.status,
        remindersSent: c.remindersSent,
    }),
    // Only index active commitments - completed/forgiven are no longer relevant for reminders
    shouldSkip: (c) => c.status === 'completed' || c.status === 'forgiven',
});
/**
 * Track social network mapping
 */
export const onRelationshipNetworkChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'relationship_network',
    contentBuilder: (r) => joinNonEmpty([
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
/**
 * Track conflict resolution history
 */
export const onConflictMemoryChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'conflict_memory',
    contentBuilder: (c) => joinNonEmpty([
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
/**
 * Track recovery milestones
 */
export const onRecoveryMilestoneChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'recovery_milestone',
    contentBuilder: (r) => joinNonEmpty([
        `Recovery milestone: ${r.milestone}.`,
        `Recovering from: ${r.recoveryFrom}.`,
        `Significance: ${r.significance}.`,
    ]),
    metadataExtractor: (r) => ({
        recoveryFrom: r.recoveryFrom,
        date: r.date,
    }),
});
/**
 * Track mood patterns for emotional prediction
 */
export const onMoodPatternChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'emotional_pattern',
    contentBuilder: (m) => joinNonEmpty([
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
/**
 * Track energy patterns for optimal timing
 */
export const onEnergyPatternChange = createDomainHook({
    storeType: 'superhuman',
    entityType: 'capacity_state',
    contentBuilder: (e) => joinNonEmpty([
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
//# sourceMappingURL=superhuman-hooks.js.map