/**
 * Planning Coordination Intelligence
 *
 * "Your wedding planner doesn't check if you can afford it or if you're too busy."
 *
 * This service coordinates event planning with other life domains:
 * - Financial readiness check (from Peter/financial data)
 * - Calendar capacity check (from Alex/calendar data)
 * - Energy/habit alignment (from Maya/habit data)
 * - Life stage context (from Nayan/wisdom data)
 *
 * Better Than Human: We see the whole picture before suggesting you plan something.
 *
 * @module services/superhuman/planning-coordination
 */
export interface FinancialReadiness {
    /** Can they afford this event at the planned budget? */
    canAfford: boolean;
    /** How healthy is their current budget? (0-100) */
    budgetHealth: number;
    /** Are they saving toward this? */
    savingsVelocity: 'none' | 'slow' | 'on_track' | 'ahead';
    /** Emergency fund status */
    emergencyFundStatus: 'none' | 'partial' | 'adequate' | 'strong';
    /** Any financial concerns */
    concerns: string[];
    /** Recommendations */
    recommendations: string[];
}
export interface CalendarCapacity {
    /** Overall capacity rating (0-100) */
    capacityScore: number;
    /** Calendar density for planning window */
    calendarDensity: 'light' | 'moderate' | 'busy' | 'overloaded';
    /** Conflicts in the planning window */
    conflicts: Array<{
        date: string;
        event: string;
        severity: 'minor' | 'moderate' | 'major';
    }>;
    /** Best windows for planning activities */
    bestPlanningWindows: Array<{
        start: string;
        end: string;
        reason: string;
    }>;
    /** Recommendations */
    recommendations: string[];
}
export interface EnergyAlignment {
    /** Current energy level (0-100) */
    currentEnergy: number;
    /** Energy trend */
    energyTrend: 'declining' | 'stable' | 'improving';
    /** Habits that support event planning */
    supportingHabits: string[];
    /** Habits at risk during heavy planning */
    atRiskHabits: string[];
    /** Burnout risk assessment */
    burnoutRisk: 'low' | 'moderate' | 'high';
    /** Recommendations */
    recommendations: string[];
}
export interface LifeStageContext {
    /** Current life stage */
    currentStage: string;
    /** How this event fits the stage */
    fitWithStage: 'perfect_fit' | 'good_fit' | 'neutral' | 'potential_stress';
    /** Values this aligns with */
    valuesAlignment: string[];
    /** Potential conflicts with life priorities */
    potentialConflicts: string[];
    /** Wisdom/perspective notes */
    wisdomNotes: string[];
}
export interface PlanningReadinessAssessment {
    /** Overall readiness score (0-100) */
    overallScore: number;
    /** Traffic light assessment */
    status: 'green' | 'yellow' | 'red';
    /** Individual domain assessments */
    financial: FinancialReadiness;
    calendar: CalendarCapacity;
    energy: EnergyAlignment;
    lifeStage: LifeStageContext;
    /** Summary recommendation */
    summary: string;
    /** Action items before proceeding */
    actionItems: string[];
    /** Best time to start planning */
    recommendedStartTime: string;
}
export interface PlanningCoordinationProfile {
    userId: string;
    /** Cached assessments */
    recentAssessments: Array<{
        eventType: string;
        budget: number;
        assessedAt: string;
        result: PlanningReadinessAssessment;
    }>;
    /** User's planning style preferences */
    planningStyle: {
        preferredLeadTime: 'minimal' | 'moderate' | 'extensive';
        stressResponse: 'energized' | 'neutral' | 'stressed';
        delegationComfort: 'prefers_control' | 'selective_delegation' | 'happy_to_delegate';
    };
    lastUpdated: string;
}
declare function loadCoordinationProfile(userId: string): Promise<PlanningCoordinationProfile | null>;
/**
 * Check planning readiness across all domains
 */
export declare function checkPlanningReadiness(userId: string, eventType: string, budget: number, eventDate?: string): Promise<PlanningReadinessAssessment>;
/**
 * Quick check - just returns status without full assessment
 */
export declare function quickReadinessCheck(userId: string, budget: number): Promise<{
    status: 'green' | 'yellow' | 'red';
    reason: string;
}>;
/**
 * Check if an event aligns with current goals
 * INTEGRATED: Uses real commitment keeper and dream keeper services
 */
export declare function checkGoalAlignment(userId: string, eventType: string, eventPurpose: string): Promise<{
    aligned: boolean;
    supportingGoals: string[];
    potentialConflicts: string[];
    recommendation: string;
}>;
/**
 * Build context string for LLM injection
 */
export declare function buildPlanningCoordinationContext(userId: string, eventType?: string, budget?: number): Promise<string>;
export declare const planningCoordination: {
    checkPlanningReadiness: typeof checkPlanningReadiness;
    quickReadinessCheck: typeof quickReadinessCheck;
    checkGoalAlignment: typeof checkGoalAlignment;
    buildPlanningCoordinationContext: typeof buildPlanningCoordinationContext;
    loadCoordinationProfile: typeof loadCoordinationProfile;
};
export default planningCoordination;
//# sourceMappingURL=planning-coordination.d.ts.map