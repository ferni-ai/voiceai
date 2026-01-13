/**
 * Anticipatory Planning Intelligence
 *
 * "No one else sees your life transitions coming before you do."
 *
 * This service detects upcoming life transitions from conversation patterns
 * and cross-team data, suggesting planning before users think to ask:
 * - Empty nest approaching (kids' graduation dates, college talk)
 * - Retirement window (age, mentions of "when I retire")
 * - Major anniversaries coming
 * - Life stage shifts (newlywed → family planning, career peak → legacy planning)
 *
 * Better Than Human: We see patterns across all conversations and can anticipate
 * life transitions that humans don't consciously track.
 *
 * @module services/superhuman/anticipatory-planning
 */
export type LifeTransition = 'empty_nest' | 'retirement' | 'new_parent' | 'wedding_planning' | 'career_change' | 'relocation' | 'health_journey' | 'divorce_transition' | 'loss_grief' | 'financial_milestone' | 'education_milestone' | 'relationship_milestone' | 'starting_business' | 'downsizing' | 'caregiving' | 'recovery_journey';
export interface TransitionSignal {
    /** Type of transition detected */
    transition: LifeTransition;
    /** Keywords/phrases that triggered detection */
    triggers: string[];
    /** When this signal was detected */
    detectedAt: string;
    /** Source of signal (conversation, memory, cross-team) */
    source: 'conversation' | 'memory' | 'cross_team' | 'inferred';
    /** Confidence weight (0-1) */
    weight: number;
}
export interface TransitionPrediction {
    /** Type of transition */
    transition: LifeTransition;
    /** Overall confidence (0-1) */
    confidence: number;
    /** Estimated timeframe */
    estimatedTimeframe: string;
    /** All signals contributing to this prediction */
    signals: TransitionSignal[];
    /** Suggested planning topics */
    suggestedPlanning: string[];
    /** Questions to gently explore */
    exploratoryQuestions: string[];
    /** Team members who could help */
    relevantTeamMembers: Array<{
        persona: string;
        why: string;
    }>;
    /** When prediction was last updated */
    updatedAt: string;
}
export interface AnticipatedMilestone {
    /** What milestone is anticipated */
    milestone: string;
    /** Associated transition */
    relatedTransition: LifeTransition;
    /** Estimated date range */
    estimatedDateRange: {
        earliest: string;
        latest: string;
    };
    /** Confidence level */
    confidence: number;
    /** Why we think this is coming */
    reasoning: string[];
    /** Planning suggestions */
    planningSuggestions: string[];
}
export interface AnticipatoryPlanningProfile {
    userId: string;
    /** User's known demographics (optional) */
    demographics?: {
        birthYear?: number;
        kidsAges?: number[];
        yearsAtCurrentJob?: number;
        relationshipDuration?: number;
    };
    /** All detected signals */
    signals: TransitionSignal[];
    /** Current predictions */
    predictions: TransitionPrediction[];
    /** Anticipated milestones */
    anticipatedMilestones: AnticipatedMilestone[];
    /** Transitions we've already surfaced to the user */
    surfacedTransitions: Array<{
        transition: LifeTransition;
        surfacedAt: string;
        userResponse: 'acknowledged' | 'not_ready' | 'inaccurate' | 'unknown';
    }>;
    lastUpdated: string;
}
declare function loadAnticipatoryProfile(userId: string): Promise<AnticipatoryPlanningProfile | null>;
/**
 * Detect transition signals from user text
 */
export declare function detectTransitionSignals(text: string): Array<{
    transition: LifeTransition;
    triggers: string[];
    weight: number;
}>;
/**
 * Record a transition signal from conversation analysis
 */
export declare function recordTransitionSignal(userId: string, transition: LifeTransition, triggers: string[], source?: TransitionSignal['source']): Promise<void>;
/**
 * Update user demographics for better predictions
 */
export declare function updateDemographics(userId: string, demographics: Partial<AnticipatoryPlanningProfile['demographics']>): Promise<void>;
/**
 * Get transitions worth discussing with the user
 */
export declare function getAnticipatedTransitions(userId: string, minConfidence?: number): Promise<TransitionPrediction[]>;
/**
 * Mark a transition as surfaced to the user
 */
export declare function markTransitionSurfaced(userId: string, transition: LifeTransition, userResponse?: 'acknowledged' | 'not_ready' | 'inaccurate' | 'unknown'): Promise<void>;
/**
 * Build context string for LLM injection
 */
export declare function buildAnticipatoryPlanningContext(userId: string): Promise<string>;
export declare const anticipatoryPlanning: {
    detectTransitionSignals: typeof detectTransitionSignals;
    recordTransitionSignal: typeof recordTransitionSignal;
    updateDemographics: typeof updateDemographics;
    getAnticipatedTransitions: typeof getAnticipatedTransitions;
    markTransitionSurfaced: typeof markTransitionSurfaced;
    buildAnticipatoryPlanningContext: typeof buildAnticipatoryPlanningContext;
    loadAnticipatoryProfile: typeof loadAnticipatoryProfile;
};
export default anticipatoryPlanning;
//# sourceMappingURL=anticipatory-planning.d.ts.map