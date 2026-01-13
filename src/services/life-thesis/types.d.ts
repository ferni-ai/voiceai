/**
 * Life Thesis Types
 *
 * A "thesis" is your reason for doing something, captured when you're motivated
 * and clear-headed, so it can be recalled when you're struggling.
 *
 * This pattern works across ALL life domains - not just investments.
 */
/**
 * Core thesis structure - applies to any domain.
 */
export interface LifeThesis {
    id: string;
    domain: ThesisDomain;
    type: string;
    createdAt: Date;
    updatedAt: Date;
    thesis: string;
    expectedOutcomes: string[];
    knownChallenges: string[];
    successIndicators: string[];
    exitCriteria?: {
        conditions: string[];
        timeLimit?: string;
    };
    emotionalState: {
        atCreation: 'excited' | 'determined' | 'hopeful' | 'nervous' | 'committed' | 'desperate';
        confidenceLevel: number;
        motivationSource: string;
    };
    updates: ThesisUpdate[];
    reviewSchedule?: 'weekly' | 'monthly' | 'quarterly' | 'on_struggle';
    lastReviewed?: Date;
    domainData: Record<string, unknown>;
}
export interface ThesisUpdate {
    date: Date;
    note: string;
    stillValid: boolean;
    newConfidence?: number;
    trigger?: 'scheduled_review' | 'struggle_moment' | 'milestone' | 'change_in_circumstances';
}
/**
 * All supported thesis domains.
 */
export type ThesisDomain = 'investment' | 'habit' | 'goal' | 'career' | 'relationship' | 'health' | 'learning' | 'decision' | 'boundary' | 'commitment';
/**
 * Investment thesis (Peter's domain).
 */
export interface InvestmentThesisData {
    symbol: string;
    purchasePrice?: number;
    purchaseDate: Date;
    catalysts: string[];
    risks: string[];
    priceTarget?: number;
    timeHorizon?: string;
}
/**
 * Habit thesis (Maya's domain).
 */
export interface HabitThesisData {
    habitName: string;
    habitDescription: string;
    cue: string;
    routine: string;
    reward: string;
    currentStreak?: number;
    longestStreak?: number;
    relatedIdentity: string;
}
/**
 * Goal thesis (Jordan's domain).
 */
export interface GoalThesisData {
    goalName: string;
    targetDate?: Date;
    targetMetric?: {
        name: string;
        current: number;
        target: number;
        unit: string;
    };
    milestones: {
        percentage: number;
        description: string;
        reached?: boolean;
        reachedAt?: Date;
    }[];
    stakeholders?: string[];
    sacrifices?: string[];
}
/**
 * Career thesis.
 */
export interface CareerThesisData {
    role?: string;
    company?: string;
    path?: string;
    values: string[];
    tradeoffs: string[];
    growthAreas: string[];
    timeframe?: string;
}
/**
 * Relationship thesis.
 */
export interface RelationshipThesisData {
    personName: string;
    relationshipType: 'partner' | 'family' | 'friend' | 'colleague' | 'mentor' | 'other';
    whatYouLove: string[];
    whatsChallenging: string[];
    howYouGrow: string[];
    boundariesSet?: string[];
    commitments?: string[];
}
/**
 * Health thesis.
 */
export interface HealthThesisData {
    area: 'exercise' | 'nutrition' | 'sleep' | 'mental_health' | 'substance' | 'medical' | 'other';
    currentState: string;
    targetState: string;
    approach: string;
    doctorAdvised?: boolean;
    measurables?: {
        name: string;
        baseline: number;
        target: number;
        unit: string;
    }[];
}
/**
 * Learning thesis.
 */
export interface LearningThesisData {
    subject: string;
    approach: 'self-study' | 'course' | 'mentor' | 'practice' | 'immersion';
    resources: string[];
    timeCommitment: string;
    applicationGoal: string;
    competencyTarget: string;
}
/**
 * Decision thesis (for big decisions).
 */
export interface DecisionThesisData {
    decision: string;
    alternatives: string[];
    pros: string[];
    cons: string[];
    dealBreakers: string[];
    stakeholders?: string[];
    reversible: boolean;
    confidenceAtDecision: number;
}
/**
 * Boundary thesis.
 */
export interface BoundaryThesisData {
    boundary: string;
    withWhom: string;
    triggerSituation: string;
    whatYouNeed: string;
    whatYouWontAccept: string;
    consequences?: string;
    howToEnforce: string;
}
/**
 * Commitment thesis.
 */
export interface CommitmentThesisData {
    commitment: string;
    toWhom: string;
    duration?: string;
    conditions?: string[];
    whatItCosts: string;
    whatYouGain: string;
    renewalCriteria?: string;
}
/**
 * Reminder context - what to show when someone is struggling.
 */
export interface ThesisReminder {
    thesis: LifeThesis;
    daysSinceCreation: number;
    context: {
        currentSituation: string;
        emotionalState?: string;
    };
    questions: string[];
    encouragement: string;
}
//# sourceMappingURL=types.d.ts.map