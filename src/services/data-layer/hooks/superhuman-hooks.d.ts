/**
 * Superhuman Services Hooks
 *
 * Auto-indexing hooks for "Better than Human" capabilities.
 * These represent what no human friend could consistently provide.
 *
 * @module services/data-layer/hooks/superhuman-hooks
 */
import type { DreamEntity, LifeChapterEntity, ValuesAlignmentEntity, CapacityStateEntity } from '../types.js';
/**
 * Track user's dreams and aspirations
 * Only indexes active dreams (skips deferred, achieved, abandoned)
 */
export declare const onDreamChange: import("../hook-generator.js").DomainHook<DreamEntity>;
/**
 * Track chapters of user's life story
 */
export declare const onLifeChapterChange: import("../hook-generator.js").DomainHook<LifeChapterEntity>;
/**
 * Track user's values and alignment
 */
export declare const onValuesAlignmentChange: import("../hook-generator.js").DomainHook<ValuesAlignmentEntity>;
/**
 * Track user's energy and burnout levels
 */
export declare const onCapacityStateChange: import("../hook-generator.js").DomainHook<CapacityStateEntity>;
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
export declare const onRelationshipMilestoneChange: import("../hook-generator.js").DomainHook<RelationshipMilestoneEntity>;
interface SeasonalPatternEntity {
    pattern: string;
    season: 'spring' | 'summer' | 'fall' | 'winter' | 'holiday' | 'anniversary';
    observation: string;
    recommendation?: string;
}
/**
 * Track seasonal patterns and awareness
 */
export declare const onSeasonalPatternChange: import("../hook-generator.js").DomainHook<SeasonalPatternEntity>;
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
export declare const onEmotionalFirstAidChange: import("../hook-generator.js").DomainHook<EmotionalFirstAidEntity>;
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
export declare const onPredictiveInsightChange: import("../hook-generator.js").DomainHook<PredictiveInsightEntity>;
interface CommitmentKeeperEntity {
    commitment: string;
    madeOn: string;
    status: 'pending' | 'completed' | 'overdue' | 'forgiven';
    remindersSent?: number;
}
/**
 * Track commitment keeping
 * Only indexes pending/overdue commitments (skips completed/forgiven)
 */
export declare const onCommitmentKeeperChange: import("../hook-generator.js").DomainHook<CommitmentKeeperEntity>;
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
export declare const onRelationshipNetworkChange: import("../hook-generator.js").DomainHook<RelationshipNetworkEntity>;
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
export declare const onConflictMemoryChange: import("../hook-generator.js").DomainHook<ConflictMemoryEntity>;
interface RecoveryMilestoneEntity {
    milestone: string;
    recoveryFrom: string;
    significance: string;
    date?: string;
}
/**
 * Track recovery milestones
 */
export declare const onRecoveryMilestoneChange: import("../hook-generator.js").DomainHook<RecoveryMilestoneEntity>;
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
export declare const onMoodPatternChange: import("../hook-generator.js").DomainHook<MoodPatternEntity>;
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
export declare const onEnergyPatternChange: import("../hook-generator.js").DomainHook<EnergyPatternEntity>;
export declare const superhumanHooks: {
    onDreamChange: import("../hook-generator.js").DomainHook<DreamEntity>;
    onLifeChapterChange: import("../hook-generator.js").DomainHook<LifeChapterEntity>;
    onValuesAlignmentChange: import("../hook-generator.js").DomainHook<ValuesAlignmentEntity>;
    onCapacityStateChange: import("../hook-generator.js").DomainHook<CapacityStateEntity>;
    onRelationshipMilestoneChange: import("../hook-generator.js").DomainHook<RelationshipMilestoneEntity>;
    onSeasonalPatternChange: import("../hook-generator.js").DomainHook<SeasonalPatternEntity>;
    onEmotionalFirstAidChange: import("../hook-generator.js").DomainHook<EmotionalFirstAidEntity>;
    onPredictiveInsightChange: import("../hook-generator.js").DomainHook<PredictiveInsightEntity>;
    onCommitmentKeeperChange: import("../hook-generator.js").DomainHook<CommitmentKeeperEntity>;
    onRelationshipNetworkChange: import("../hook-generator.js").DomainHook<RelationshipNetworkEntity>;
    onConflictMemoryChange: import("../hook-generator.js").DomainHook<ConflictMemoryEntity>;
    onRecoveryMilestoneChange: import("../hook-generator.js").DomainHook<RecoveryMilestoneEntity>;
    onMoodPatternChange: import("../hook-generator.js").DomainHook<MoodPatternEntity>;
    onEnergyPatternChange: import("../hook-generator.js").DomainHook<EnergyPatternEntity>;
};
export default superhumanHooks;
//# sourceMappingURL=superhuman-hooks.d.ts.map