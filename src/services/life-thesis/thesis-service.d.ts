/**
 * Life Thesis Service
 *
 * Manages the storage, retrieval, and reminding of life theses.
 * A thesis captures your "why" when you're motivated, so it can be recalled
 * when you're struggling.
 */
import type { LifeThesis, ThesisDomain, ThesisReminder } from './types.js';
/**
 * Save a new thesis.
 */
export declare function saveThesis(userId: string, domain: ThesisDomain, type: string, thesis: string, options: {
    expectedOutcomes: string[];
    knownChallenges?: string[];
    successIndicators?: string[];
    exitCriteria?: {
        conditions: string[];
        timeLimit?: string;
    };
    emotionalState?: {
        atCreation: 'excited' | 'determined' | 'hopeful' | 'nervous' | 'committed' | 'desperate';
        confidenceLevel: number;
        motivationSource: string;
    };
    reviewSchedule?: 'weekly' | 'monthly' | 'quarterly' | 'on_struggle';
    domainData?: Record<string, unknown>;
}): Promise<LifeThesis>;
/**
 * Get a specific thesis by ID.
 */
export declare function getThesis(userId: string, thesisId: string): Promise<LifeThesis | null>;
/**
 * Get all theses for a domain.
 */
export declare function getThesesByDomain(userId: string, domain: ThesisDomain): Promise<LifeThesis[]>;
/**
 * Get all theses for a user.
 */
export declare function getAllTheses(userId: string): Promise<LifeThesis[]>;
/**
 * Update a thesis with new information.
 */
export declare function updateThesis(userId: string, thesisId: string, update: {
    note: string;
    stillValid: boolean;
    newConfidence?: number;
    trigger?: 'scheduled_review' | 'struggle_moment' | 'milestone' | 'change_in_circumstances';
}): Promise<LifeThesis | null>;
/**
 * Invalidate a thesis (mark as no longer valid).
 */
export declare function invalidateThesis(userId: string, thesisId: string, reason: string): Promise<void>;
/**
 * Generate a reminder for a thesis.
 * This is what gets shown when someone is struggling.
 */
export declare function generateReminder(userId: string, domain: ThesisDomain, currentSituation: string, emotionalState?: string): Promise<ThesisReminder | null>;
/**
 * Save an investment thesis (Peter's domain).
 */
export declare function saveInvestmentThesis(userId: string, symbol: string, thesis: string, options: {
    purchasePrice?: number;
    catalysts: string[];
    risks: string[];
    priceTarget?: number;
    timeHorizon?: string;
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
/**
 * Save a habit thesis (Maya's domain).
 */
export declare function saveHabitThesis(userId: string, habitName: string, thesis: string, options: {
    description: string;
    cue: string;
    routine: string;
    reward: string;
    identity: string;
    challenges: string[];
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
/**
 * Save a goal thesis (Jordan's domain).
 */
export declare function saveGoalThesis(userId: string, goalName: string, thesis: string, options: {
    targetDate?: Date;
    metric?: {
        name: string;
        current: number;
        target: number;
        unit: string;
    };
    milestones?: {
        percentage: number;
        description: string;
    }[];
    sacrifices?: string[];
    stakeholders?: string[];
    challenges: string[];
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
/**
 * Save a career thesis.
 */
export declare function saveCareerThesis(userId: string, thesis: string, options: {
    role?: string;
    company?: string;
    path?: string;
    values: string[];
    tradeoffs: string[];
    growthAreas: string[];
    timeframe?: string;
    challenges: string[];
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
/**
 * Save a relationship thesis.
 */
export declare function saveRelationshipThesis(userId: string, personName: string, thesis: string, options: {
    relationshipType: 'partner' | 'family' | 'friend' | 'colleague' | 'mentor' | 'other';
    whatYouLove: string[];
    whatsChallenging: string[];
    howYouGrow: string[];
    boundaries?: string[];
    commitments?: string[];
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
/**
 * Save a health thesis.
 */
export declare function saveHealthThesis(userId: string, thesis: string, options: {
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
    challenges: string[];
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
/**
 * Save a decision thesis.
 */
export declare function saveDecisionThesis(userId: string, decision: string, thesis: string, options: {
    alternatives: string[];
    pros: string[];
    cons: string[];
    dealBreakers: string[];
    stakeholders?: string[];
    reversible: boolean;
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
/**
 * Save a boundary thesis.
 */
export declare function saveBoundaryThesis(userId: string, thesis: string, options: {
    boundary: string;
    withWhom: string;
    triggerSituation: string;
    whatYouNeed: string;
    whatYouWontAccept: string;
    consequences?: string;
    howToEnforce: string;
    challenges: string[];
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
/**
 * Save a commitment thesis.
 */
export declare function saveCommitmentThesis(userId: string, commitment: string, thesis: string, options: {
    toWhom: string;
    duration?: string;
    conditions?: string[];
    whatItCosts: string;
    whatYouGain: string;
    renewalCriteria?: string;
    challenges: string[];
    confidence: number;
    motivationSource: string;
}): Promise<LifeThesis>;
//# sourceMappingURL=thesis-service.d.ts.map