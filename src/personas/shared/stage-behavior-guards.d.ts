/**
 * Stage Behavior Guards
 *
 * > "Relationships have rhythms. Respect them."
 *
 * This module prevents stage-inappropriate behaviors that would feel
 * "too much too soon" or "less than human" by:
 *
 * 1. Blocking behaviors not yet unlocked at current stage
 * 2. Adjusting communication style based on relationship depth
 * 3. Gating personal stories until appropriate trust level
 * 4. Preventing premature direct advice
 * 5. Scaling humor frequency appropriately
 *
 * A stranger doesn't share their deepest fears.
 * A new friend doesn't give unsolicited advice.
 * An acquaintance doesn't joke like an old buddy.
 *
 * These guards make our agents feel HUMAN by respecting social norms.
 */
import type { RelationshipStage } from '../relationship-memory/types.js';
import type { BundleRelationshipStages } from '../bundles/types/extensions.js';
/**
 * Result of a behavior guard check
 */
export interface BehaviorGuardResult {
    /** Is this behavior allowed? */
    allowed: boolean;
    /** Why was it blocked (if blocked) */
    reason?: string;
    /** Suggested alternative behavior */
    suggestion?: string;
    /** Adjusted intensity (0-1) if behavior is allowed but should be toned down */
    intensityMultiplier: number;
}
/**
 * Behaviors that can be checked
 */
export type GuardableBehavior = 'personal_story' | 'direct_advice' | 'humor' | 'vulnerability_sharing' | 'gentle_challenge' | 'inside_joke_reference' | 'team_reference' | 'deep_question' | 'playful_tease' | 'strong_opinion' | 'call_out_pattern';
/**
 * Context for checking behaviors
 */
export interface BehaviorContext {
    /** Current relationship stage */
    stage: RelationshipStage;
    /** Number of sessions together */
    sessionCount: number;
    /** Total turns in relationship */
    totalTurns: number;
    /** Has user shared vulnerability? */
    userHasSharedVulnerability: boolean;
    /** Current emotional state of user */
    userEmotionalState?: string;
    /** Is user in distress? */
    userInDistress?: boolean;
    /** Persona's relationship stage config */
    stageConfig?: BundleRelationshipStages;
}
/**
 * Check if a behavior is appropriate for the current relationship stage
 */
export declare function checkBehavior(behavior: GuardableBehavior, context: BehaviorContext): BehaviorGuardResult;
/**
 * Check multiple behaviors at once
 */
export declare function checkBehaviors(behaviors: GuardableBehavior[], context: BehaviorContext): Map<GuardableBehavior, BehaviorGuardResult>;
/**
 * Get all currently allowed behaviors
 */
export declare function getAllowedBehaviorsForContext(context: BehaviorContext): GuardableBehavior[];
/**
 * Generate prompt injection for behavior constraints
 */
export declare function generateBehaviorConstraints(context: BehaviorContext): string;
declare const _default: {
    checkBehavior: typeof checkBehavior;
    checkBehaviors: typeof checkBehaviors;
    getAllowedBehaviorsForContext: typeof getAllowedBehaviorsForContext;
    generateBehaviorConstraints: typeof generateBehaviorConstraints;
};
export default _default;
//# sourceMappingURL=stage-behavior-guards.d.ts.map