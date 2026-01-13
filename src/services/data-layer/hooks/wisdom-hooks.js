/**
 * Wisdom & Philosophy Hooks
 *
 * Auto-indexing hooks for wisdom, values, and life philosophy data.
 * Nayan's domain - deep existential and meaning-making content.
 *
 * @module services/data-layer/hooks/wisdom-hooks
 */
import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
// ============================================================================
// WISDOM INSIGHTS
// ============================================================================
/**
 * Track captured wisdom
 */
export const onWisdomInsightChange = createDomainHook({
    storeType: 'wisdom',
    entityType: 'wisdom_insight',
    contentBuilder: (w) => joinNonEmpty([
        `Wisdom: ${w.insight}.`,
        formatField('Source', w.source),
        `Category: ${w.category}.`,
        w.resonanceLevel ? `Resonance: ${w.resonanceLevel}/10.` : '',
    ]),
    metadataExtractor: (w) => ({
        category: w.category,
        resonanceLevel: w.resonanceLevel,
    }),
});
// ============================================================================
// LIFE LESSONS
// ============================================================================
/**
 * Track lessons learned
 */
export const onLifeLessonChange = createDomainHook({
    storeType: 'wisdom',
    entityType: 'life_lesson',
    contentBuilder: (l) => joinNonEmpty([
        `Life lesson: ${l.lesson}.`,
        `From experience: ${l.experience}.`,
        formatField('Application area', l.applicationArea),
    ]),
    metadataExtractor: (l) => ({
        applicationArea: l.applicationArea,
        dateOfRealization: l.dateOfRealization,
    }),
});
/**
 * Track life thesis elements
 */
export const onLifeThesisComponentChange = createDomainHook({
    storeType: 'wisdom',
    entityType: 'life_thesis_component',
    contentBuilder: (l) => joinNonEmpty([
        `Life thesis (${l.category}): ${l.component}.`,
        `Description: ${l.description}.`,
        `Confidence: ${l.confidence}.`,
    ]),
    metadataExtractor: (l) => ({
        category: l.category,
        confidence: l.confidence,
    }),
});
/**
 * Track articulated values
 */
export const onValueStatementChange = createDomainHook({
    storeType: 'wisdom',
    entityType: 'value_statement',
    contentBuilder: (v) => joinNonEmpty([
        `Core value: ${v.value}.`,
        `Meaning: ${v.meaning}.`,
        `Evidence: ${v.evidence.join('; ')}.`,
    ]),
    metadataExtractor: (v) => ({
        ranking: v.ranking,
    }),
});
/**
 * Track purpose discovery journey
 */
export const onPurposeExplorationChange = createDomainHook({
    storeType: 'wisdom',
    entityType: 'purpose_exploration',
    contentBuilder: (p) => joinNonEmpty([
        `Purpose exploration: ${p.exploration}.`,
        `Triggered by: ${p.trigger}.`,
        `Insights: ${p.insights.join('; ')}.`,
        `Clarity: ${p.clarity}.`,
    ]),
    metadataExtractor: (p) => ({
        clarity: p.clarity,
    }),
});
/**
 * Track paradigm shifts
 */
export const onPerspectiveShiftChange = createDomainHook({
    storeType: 'wisdom',
    entityType: 'perspective_shift',
    contentBuilder: (p) => joinNonEmpty([
        `Perspective shift: From "${p.from}" to "${p.to}".`,
        `Catalyst: ${p.catalyst}.`,
        `Impact: ${p.impact}.`,
    ]),
    metadataExtractor: (p) => ({
        permanent: p.permanent,
    }),
});
/**
 * Track big questions pondered
 */
export const onExistentialQuestionChange = createDomainHook({
    storeType: 'wisdom',
    entityType: 'existential_question',
    contentBuilder: (e) => joinNonEmpty([
        `Big question: ${e.question}`,
        `Context: ${e.context}.`,
        formatField('Current thinking', e.currentThinking),
    ]),
    metadataExtractor: (e) => ({
        resolved: e.resolved,
    }),
});
/**
 * Track thoughts about legacy
 */
export const onLegacyThoughtChange = createDomainHook({
    storeType: 'wisdom',
    entityType: 'legacy_thought',
    contentBuilder: (l) => joinNonEmpty([
        `Legacy thought (${l.category}): ${l.thought}.`,
        `Significance: ${l.significance}.`,
        formatField('Actionable', l.actionable),
    ]),
    metadataExtractor: (l) => ({
        category: l.category,
    }),
});
/**
 * Track recurring emotional patterns
 */
export const onEmotionalPatternChange = createDomainHook({
    storeType: 'emotional',
    entityType: 'emotional_pattern',
    contentBuilder: (e) => joinNonEmpty([
        `Emotional pattern: ${e.pattern}.`,
        `Triggers: ${e.triggers.join(', ')}.`,
        `Frequency: ${e.frequency}. Impact: ${e.impact}.`,
    ]),
    metadataExtractor: (e) => ({
        frequency: e.frequency,
        impact: e.impact,
        awareness: e.awareness,
    }),
});
/**
 * Track mood triggers
 */
export const onMoodTriggerChange = createDomainHook({
    storeType: 'emotional',
    entityType: 'mood_trigger',
    contentBuilder: (m) => joinNonEmpty([
        `Mood trigger: ${m.trigger}.`,
        `Effect: ${m.moodEffect} (${m.intensity}).`,
        formatField('Context', m.context),
    ]),
    metadataExtractor: (m) => ({
        moodEffect: m.moodEffect,
        intensity: m.intensity,
    }),
});
/**
 * Track coping strategies
 */
export const onCopingStrategyChange = createDomainHook({
    storeType: 'emotional',
    entityType: 'coping_strategy',
    contentBuilder: (c) => joinNonEmpty([
        `Coping strategy: ${c.strategy}.`,
        `For: ${c.forSituation}.`,
        `Effectiveness: ${c.effectiveness}. ${c.healthy ? 'Healthy.' : 'Less healthy.'}`,
    ]),
    metadataExtractor: (c) => ({
        effectiveness: c.effectiveness,
        healthy: c.healthy,
    }),
});
/**
 * Track what brings joy
 */
export const onJoyTriggerChange = createDomainHook({
    storeType: 'emotional',
    entityType: 'joy_trigger',
    contentBuilder: (j) => joinNonEmpty([
        `Joy trigger: ${j.trigger}.`,
        `Context: ${j.context}.`,
        `Intensity: ${j.intensity}.`,
    ]),
    metadataExtractor: (j) => ({
        intensity: j.intensity,
        shareable: j.shareable,
    }),
});
// ============================================================================
// EXPORTS
// ============================================================================
export const wisdomHooks = {
    onWisdomInsightChange,
    onLifeLessonChange,
    onLifeThesisComponentChange,
    onValueStatementChange,
    onPurposeExplorationChange,
    onPerspectiveShiftChange,
    onExistentialQuestionChange,
    onLegacyThoughtChange,
    onEmotionalPatternChange,
    onMoodTriggerChange,
    onCopingStrategyChange,
    onJoyTriggerChange,
};
export default wisdomHooks;
//# sourceMappingURL=wisdom-hooks.js.map