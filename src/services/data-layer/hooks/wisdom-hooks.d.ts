/**
 * Wisdom & Philosophy Hooks
 *
 * Auto-indexing hooks for wisdom, values, and life philosophy data.
 * Nayan's domain - deep existential and meaning-making content.
 *
 * @module services/data-layer/hooks/wisdom-hooks
 */
import type { WisdomInsightEntity, LifeLessonEntity } from '../types.js';
/**
 * Track captured wisdom
 */
export declare const onWisdomInsightChange: import("../hook-generator.js").DomainHook<WisdomInsightEntity>;
/**
 * Track lessons learned
 */
export declare const onLifeLessonChange: import("../hook-generator.js").DomainHook<LifeLessonEntity>;
interface LifeThesisComponentEntity {
    component: string;
    category: 'purpose' | 'values' | 'vision' | 'principles' | 'legacy';
    description: string;
    confidence: 'exploring' | 'developing' | 'confident';
}
/**
 * Track life thesis elements
 */
export declare const onLifeThesisComponentChange: import("../hook-generator.js").DomainHook<LifeThesisComponentEntity>;
interface ValueStatementEntity {
    value: string;
    meaning: string;
    evidence: string[];
    ranking?: number;
}
/**
 * Track articulated values
 */
export declare const onValueStatementChange: import("../hook-generator.js").DomainHook<ValueStatementEntity>;
interface PurposeExplorationEntity {
    exploration: string;
    trigger: string;
    insights: string[];
    clarity: 'confused' | 'searching' | 'glimpsing' | 'clear';
}
/**
 * Track purpose discovery journey
 */
export declare const onPurposeExplorationChange: import("../hook-generator.js").DomainHook<PurposeExplorationEntity>;
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
export declare const onPerspectiveShiftChange: import("../hook-generator.js").DomainHook<PerspectiveShiftEntity>;
interface ExistentialQuestionEntity {
    question: string;
    context: string;
    currentThinking?: string;
    resolved?: boolean;
}
/**
 * Track big questions pondered
 */
export declare const onExistentialQuestionChange: import("../hook-generator.js").DomainHook<ExistentialQuestionEntity>;
interface LegacyThoughtEntity {
    thought: string;
    category: 'impact' | 'memory' | 'contribution' | 'relationships' | 'values';
    significance: string;
    actionable?: string;
}
/**
 * Track thoughts about legacy
 */
export declare const onLegacyThoughtChange: import("../hook-generator.js").DomainHook<LegacyThoughtEntity>;
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
export declare const onEmotionalPatternChange: import("../hook-generator.js").DomainHook<EmotionalPatternEntity>;
interface MoodTriggerEntity {
    trigger: string;
    moodEffect: 'positive' | 'negative' | 'anxious' | 'calm' | 'energized' | 'drained';
    intensity: 'mild' | 'moderate' | 'strong';
    context?: string;
}
/**
 * Track mood triggers
 */
export declare const onMoodTriggerChange: import("../hook-generator.js").DomainHook<MoodTriggerEntity>;
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
export declare const onCopingStrategyChange: import("../hook-generator.js").DomainHook<CopingStrategyEntity>;
interface JoyTriggerEntity {
    trigger: string;
    context: string;
    intensity: 'small' | 'moderate' | 'profound';
    shareable?: boolean;
}
/**
 * Track what brings joy
 */
export declare const onJoyTriggerChange: import("../hook-generator.js").DomainHook<JoyTriggerEntity>;
export declare const wisdomHooks: {
    onWisdomInsightChange: import("../hook-generator.js").DomainHook<WisdomInsightEntity>;
    onLifeLessonChange: import("../hook-generator.js").DomainHook<LifeLessonEntity>;
    onLifeThesisComponentChange: import("../hook-generator.js").DomainHook<LifeThesisComponentEntity>;
    onValueStatementChange: import("../hook-generator.js").DomainHook<ValueStatementEntity>;
    onPurposeExplorationChange: import("../hook-generator.js").DomainHook<PurposeExplorationEntity>;
    onPerspectiveShiftChange: import("../hook-generator.js").DomainHook<PerspectiveShiftEntity>;
    onExistentialQuestionChange: import("../hook-generator.js").DomainHook<ExistentialQuestionEntity>;
    onLegacyThoughtChange: import("../hook-generator.js").DomainHook<LegacyThoughtEntity>;
    onEmotionalPatternChange: import("../hook-generator.js").DomainHook<EmotionalPatternEntity>;
    onMoodTriggerChange: import("../hook-generator.js").DomainHook<MoodTriggerEntity>;
    onCopingStrategyChange: import("../hook-generator.js").DomainHook<CopingStrategyEntity>;
    onJoyTriggerChange: import("../hook-generator.js").DomainHook<JoyTriggerEntity>;
};
export default wisdomHooks;
//# sourceMappingURL=wisdom-hooks.d.ts.map