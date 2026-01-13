/**
 * Ripple Effect Prediction - Better Than Human v4
 *
 * > "We see how one change will cascade through your whole life."
 *
 * SUPERHUMAN CAPABILITY: Predict how a change in one life domain
 * will ripple into other domains.
 *
 * Humans experience life holistically but think about it in silos.
 * A promotion at work affects their relationship. A fight with their
 * partner affects their focus at work. A health scare affects everything.
 *
 * We can:
 * - Track cross-domain influence patterns
 * - Predict cascade effects before they happen
 * - Identify leverage points (small changes, big impact)
 * - Warn about negative spirals early
 *
 * @module intelligence/predictive/ripple-effect-prediction
 */
/** Life domains we track */
export type LifeDomain = 'work' | 'relationships' | 'health' | 'finances' | 'family' | 'social' | 'mental_health' | 'physical_health' | 'creativity' | 'spirituality' | 'personal_growth' | 'growth' | 'habits' | 'energy' | 'sleep' | 'self_care';
/** Event that can trigger ripples */
export interface DomainEvent {
    domain: LifeDomain;
    eventType: EventType;
    magnitude: number;
    description: string;
    timestamp: number;
}
export type EventType = 'promotion' | 'demotion' | 'new_project' | 'deadline_pressure' | 'conflict_at_work' | 'job_change' | 'work_success' | 'work_failure' | 'relationship_start' | 'relationship_end' | 'major_conflict' | 'reconciliation' | 'deepening_connection' | 'growing_apart' | 'health_scare' | 'health_improvement' | 'injury' | 'chronic_issue' | 'fitness_milestone' | 'family_crisis' | 'family_celebration' | 'family_conflict' | 'caregiving_burden' | 'family_change' | 'financial_stress' | 'financial_relief' | 'major_expense' | 'windfall' | 'loss' | 'achievement' | 'transition' | 'routine_change' | 'external_stressor';
/** Predicted ripple effect */
export interface RipplePrediction {
    /** Source event */
    sourceEvent: DomainEvent;
    /** Predicted effects on other domains */
    ripples: Array<{
        targetDomain: LifeDomain;
        effect: RippleEffect;
        probability: number;
        timeframe: 'immediate' | 'days' | 'weeks' | 'months';
        magnitude: number;
        reasoning: string;
        mitigationOpportunity?: string;
    }>;
    /** Overall cascade risk */
    cascadeRisk: 'low' | 'moderate' | 'high' | 'critical';
    /** Key leverage points */
    leveragePoints: Array<{
        domain: LifeDomain;
        action: string;
        impact: number;
    }>;
    /** Warning if negative spiral detected */
    spiralWarning?: {
        domains: LifeDomain[];
        description: string;
        breakPoints: string[];
    };
}
export type RippleEffect = 'increased_stress' | 'decreased_stress' | 'time_reduction' | 'time_increase' | 'energy_drain' | 'energy_boost' | 'attention_shift' | 'neglect' | 'improvement' | 'decline' | 'conflict_spillover' | 'mood_impact' | 'motivation_change' | 'routine_disruption' | 'financial_impact';
/**
 * Record a domain event and predict ripples
 *
 * @param userId - User ID
 * @param event - The event that occurred
 * @returns Ripple prediction
 */
export declare function recordDomainEvent(userId: string, event: Omit<DomainEvent, 'timestamp'>): RipplePrediction;
/**
 * Record observed ripple effect (for learning)
 *
 * @param userId - User ID
 * @param sourceEvent - Original event
 * @param observedEffect - What actually happened
 */
export declare function recordObservedRipple(userId: string, sourceEvent: DomainEvent, observedEffect: {
    targetDomain: LifeDomain;
    effect: RippleEffect;
    magnitude: number;
    delayHours: number;
}): void;
/**
 * Update domain state directly (without event)
 *
 * @param userId - User ID
 * @param domain - Domain to update
 * @param health - New health value (0-1)
 */
export declare function updateDomainHealth(userId: string, domain: LifeDomain, health: number): void;
/**
 * Get current ripple status for all domains
 *
 * @param userId - User ID
 * @returns Current state and active ripples
 */
export declare function getRippleStatus(userId: string): {
    domainStates: Array<{
        domain: LifeDomain;
        health: number;
        trend: string;
    }>;
    activeRipples: RipplePrediction[];
    overallRisk: 'low' | 'moderate' | 'high';
};
/**
 * Predict cascading effects of a hypothetical event
 *
 * @param userId - User ID
 * @param hypotheticalEvent - Event to simulate
 * @returns What would happen
 */
export declare function simulateRipples(userId: string, hypotheticalEvent: Omit<DomainEvent, 'timestamp'>): RipplePrediction;
/**
 * Build ripple effect context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export declare function buildRippleContext(userId: string): string;
export declare const rippleEffectPrediction: {
    recordDomainEvent: typeof recordDomainEvent;
    recordObservedRipple: typeof recordObservedRipple;
    updateDomainHealth: typeof updateDomainHealth;
    getRippleStatus: typeof getRippleStatus;
    simulateRipples: typeof simulateRipples;
    buildRippleContext: typeof buildRippleContext;
};
export default rippleEffectPrediction;
//# sourceMappingURL=ripple-effect-prediction.d.ts.map