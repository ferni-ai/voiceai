/**
 * Wisdom & Philosophy Hooks
 *
 * Auto-indexing hooks for wisdom, values, and life philosophy data.
 * Nayan's domain - deep existential and meaning-making content.
 *
 * @module services/data-layer/hooks/wisdom-hooks
 */

import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
import type { WisdomInsightEntity, LifeLessonEntity } from '../types.js';

// ============================================================================
// WISDOM INSIGHTS
// ============================================================================

/**
 * Track captured wisdom
 */
export const onWisdomInsightChange = createDomainHook<WisdomInsightEntity>({
  storeType: 'wisdom',
  entityType: 'wisdom_insight',
  contentBuilder: (w) =>
    joinNonEmpty([
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
export const onLifeLessonChange = createDomainHook<LifeLessonEntity>({
  storeType: 'wisdom',
  entityType: 'life_lesson',
  contentBuilder: (l) =>
    joinNonEmpty([
      `Life lesson: ${l.lesson}.`,
      `From experience: ${l.experience}.`,
      formatField('Application area', l.applicationArea),
    ]),
  metadataExtractor: (l) => ({
    applicationArea: l.applicationArea,
    dateOfRealization: l.dateOfRealization,
  }),
});

// ============================================================================
// ADDITIONAL WISDOM HOOKS
// ============================================================================

interface LifeThesisComponentEntity {
  component: string;
  category: 'purpose' | 'values' | 'vision' | 'principles' | 'legacy';
  description: string;
  confidence: 'exploring' | 'developing' | 'confident';
}

/**
 * Track life thesis elements
 */
export const onLifeThesisComponentChange = createDomainHook<LifeThesisComponentEntity>({
  storeType: 'wisdom',
  entityType: 'life_thesis_component',
  contentBuilder: (l) =>
    joinNonEmpty([
      `Life thesis (${l.category}): ${l.component}.`,
      `Description: ${l.description}.`,
      `Confidence: ${l.confidence}.`,
    ]),
  metadataExtractor: (l) => ({
    category: l.category,
    confidence: l.confidence,
  }),
});

interface ValueStatementEntity {
  value: string;
  meaning: string;
  evidence: string[];
  ranking?: number;
}

/**
 * Track articulated values
 */
export const onValueStatementChange = createDomainHook<ValueStatementEntity>({
  storeType: 'wisdom',
  entityType: 'value_statement',
  contentBuilder: (v) =>
    joinNonEmpty([
      `Core value: ${v.value}.`,
      `Meaning: ${v.meaning}.`,
      `Evidence: ${v.evidence.join('; ')}.`,
    ]),
  metadataExtractor: (v) => ({
    ranking: v.ranking,
  }),
});

interface PurposeExplorationEntity {
  exploration: string;
  trigger: string;
  insights: string[];
  clarity: 'confused' | 'searching' | 'glimpsing' | 'clear';
}

/**
 * Track purpose discovery journey
 */
export const onPurposeExplorationChange = createDomainHook<PurposeExplorationEntity>({
  storeType: 'wisdom',
  entityType: 'purpose_exploration',
  contentBuilder: (p) =>
    joinNonEmpty([
      `Purpose exploration: ${p.exploration}.`,
      `Triggered by: ${p.trigger}.`,
      `Insights: ${p.insights.join('; ')}.`,
      `Clarity: ${p.clarity}.`,
    ]),
  metadataExtractor: (p) => ({
    clarity: p.clarity,
  }),
});

interface PerspectiveShiftEntity {
  from: string;
  to: string;
  catalyst: string;
  impact: string;
  permanent?: boolean;
}

/**
 * Track paradigm shifts
 */
export const onPerspectiveShiftChange = createDomainHook<PerspectiveShiftEntity>({
  storeType: 'wisdom',
  entityType: 'perspective_shift',
  contentBuilder: (p) =>
    joinNonEmpty([
      `Perspective shift: From "${p.from}" to "${p.to}".`,
      `Catalyst: ${p.catalyst}.`,
      `Impact: ${p.impact}.`,
    ]),
  metadataExtractor: (p) => ({
    permanent: p.permanent,
  }),
});

interface ExistentialQuestionEntity {
  question: string;
  context: string;
  currentThinking?: string;
  resolved?: boolean;
}

/**
 * Track big questions pondered
 */
export const onExistentialQuestionChange = createDomainHook<ExistentialQuestionEntity>({
  storeType: 'wisdom',
  entityType: 'existential_question',
  contentBuilder: (e) =>
    joinNonEmpty([
      `Big question: ${e.question}`,
      `Context: ${e.context}.`,
      formatField('Current thinking', e.currentThinking),
    ]),
  metadataExtractor: (e) => ({
    resolved: e.resolved,
  }),
});

interface LegacyThoughtEntity {
  thought: string;
  category: 'impact' | 'memory' | 'contribution' | 'relationships' | 'values';
  significance: string;
  actionable?: string;
}

/**
 * Track thoughts about legacy
 */
export const onLegacyThoughtChange = createDomainHook<LegacyThoughtEntity>({
  storeType: 'wisdom',
  entityType: 'legacy_thought',
  contentBuilder: (l) =>
    joinNonEmpty([
      `Legacy thought (${l.category}): ${l.thought}.`,
      `Significance: ${l.significance}.`,
      formatField('Actionable', l.actionable),
    ]),
  metadataExtractor: (l) => ({
    category: l.category,
  }),
});

// ============================================================================
// EMOTIONAL HOOKS (Cross-domain)
// ============================================================================

interface EmotionalPatternEntity {
  pattern: string;
  triggers: string[];
  frequency: 'rare' | 'occasional' | 'frequent' | 'constant';
  impact: 'positive' | 'negative' | 'mixed';
  awareness: 'low' | 'moderate' | 'high';
}

/**
 * Track recurring emotional patterns
 */
export const onEmotionalPatternChange = createDomainHook<EmotionalPatternEntity>({
  storeType: 'emotional',
  entityType: 'emotional_pattern',
  contentBuilder: (e) =>
    joinNonEmpty([
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

interface MoodTriggerEntity {
  trigger: string;
  moodEffect: 'positive' | 'negative' | 'anxious' | 'calm' | 'energized' | 'drained';
  intensity: 'mild' | 'moderate' | 'strong';
  context?: string;
}

/**
 * Track mood triggers
 */
export const onMoodTriggerChange = createDomainHook<MoodTriggerEntity>({
  storeType: 'emotional',
  entityType: 'mood_trigger',
  contentBuilder: (m) =>
    joinNonEmpty([
      `Mood trigger: ${m.trigger}.`,
      `Effect: ${m.moodEffect} (${m.intensity}).`,
      formatField('Context', m.context),
    ]),
  metadataExtractor: (m) => ({
    moodEffect: m.moodEffect,
    intensity: m.intensity,
  }),
});

interface CopingStrategyEntity {
  strategy: string;
  forSituation: string;
  effectiveness: 'low' | 'medium' | 'high';
  healthy: boolean;
  notes?: string;
}

/**
 * Track coping strategies
 */
export const onCopingStrategyChange = createDomainHook<CopingStrategyEntity>({
  storeType: 'emotional',
  entityType: 'coping_strategy',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Coping strategy: ${c.strategy}.`,
      `For: ${c.forSituation}.`,
      `Effectiveness: ${c.effectiveness}. ${c.healthy ? 'Healthy.' : 'Less healthy.'}`,
    ]),
  metadataExtractor: (c) => ({
    effectiveness: c.effectiveness,
    healthy: c.healthy,
  }),
});

interface JoyTriggerEntity {
  trigger: string;
  context: string;
  intensity: 'small' | 'moderate' | 'profound';
  shareable?: boolean;
}

/**
 * Track what brings joy
 */
export const onJoyTriggerChange = createDomainHook<JoyTriggerEntity>({
  storeType: 'emotional',
  entityType: 'joy_trigger',
  contentBuilder: (j) =>
    joinNonEmpty([
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
