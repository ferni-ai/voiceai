/**
 * Coaching & Growth Hooks
 *
 * Auto-indexing hooks for coaching insights and personal growth data.
 * Tracks breakthroughs, patterns, and growth edges.
 *
 * @module services/data-layer/hooks/coaching-hooks
 */
import type { CoachingInsightEntity, BreakthroughMomentEntity, StuckPatternEntity } from '../types.js';
/**
 * Track AI coaching observations
 */
export declare const onCoachingInsightChange: import("../hook-generator.js").DomainHook<CoachingInsightEntity>;
/**
 * Track aha moments and breakthroughs
 */
export declare const onBreakthroughMomentChange: import("../hook-generator.js").DomainHook<BreakthroughMomentEntity>;
/**
 * Track recurring blockers and stuck patterns
 */
export declare const onStuckPatternChange: import("../hook-generator.js").DomainHook<StuckPatternEntity>;
interface ReframeSuggestionEntity {
    originalPerspective: string;
    reframe: string;
    accepted: boolean;
    impact?: string;
}
/**
 * Track perspective shifts offered
 */
export declare const onReframeSuggestionChange: import("../hook-generator.js").DomainHook<ReframeSuggestionEntity>;
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
export declare const onGrowthEdgeChange: import("../hook-generator.js").DomainHook<GrowthEdgeEntity>;
interface StrengthIdentifiedEntity {
    strength: string;
    evidence: string;
    category: 'character' | 'skill' | 'talent' | 'knowledge';
    howToLeverage?: string;
}
/**
 * Track identified user strengths
 */
export declare const onStrengthIdentifiedChange: import("../hook-generator.js").DomainHook<StrengthIdentifiedEntity>;
interface BlindSpotEntity {
    blindSpot: string;
    observation: string;
    impact: string;
    surfacedGently: boolean;
}
/**
 * Track identified blind spots
 */
export declare const onBlindSpotChange: import("../hook-generator.js").DomainHook<BlindSpotEntity>;
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
export declare const onAccountabilityItemChange: import("../hook-generator.js").DomainHook<AccountabilityItemEntity>;
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
export declare const onBehaviorChangeEntity: import("../hook-generator.js").DomainHook<BehaviorChangeEntity>;
interface MotivationInsightEntity {
    insight: string;
    context: string;
    motivationType: 'intrinsic' | 'extrinsic' | 'purpose' | 'fear' | 'growth';
}
/**
 * Track what motivates the user
 */
export declare const onMotivationInsightChange: import("../hook-generator.js").DomainHook<MotivationInsightEntity>;
export declare const coachingHooks: {
    onCoachingInsightChange: import("../hook-generator.js").DomainHook<CoachingInsightEntity>;
    onBreakthroughMomentChange: import("../hook-generator.js").DomainHook<BreakthroughMomentEntity>;
    onStuckPatternChange: import("../hook-generator.js").DomainHook<StuckPatternEntity>;
    onReframeSuggestionChange: import("../hook-generator.js").DomainHook<ReframeSuggestionEntity>;
    onGrowthEdgeChange: import("../hook-generator.js").DomainHook<GrowthEdgeEntity>;
    onStrengthIdentifiedChange: import("../hook-generator.js").DomainHook<StrengthIdentifiedEntity>;
    onBlindSpotChange: import("../hook-generator.js").DomainHook<BlindSpotEntity>;
    onAccountabilityItemChange: import("../hook-generator.js").DomainHook<AccountabilityItemEntity>;
    onBehaviorChangeEntity: import("../hook-generator.js").DomainHook<BehaviorChangeEntity>;
    onMotivationInsightChange: import("../hook-generator.js").DomainHook<MotivationInsightEntity>;
};
export default coachingHooks;
//# sourceMappingURL=coaching-hooks.d.ts.map