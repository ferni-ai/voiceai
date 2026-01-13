/**
 * Firestore Persistence for Superhuman Tools
 *
 * Integrates with the existing Firestore infrastructure for production.
 * Falls back to in-memory storage when Firestore is unavailable.
 *
 * Schema:
 * - bogle_users/{userId}/superhuman/decisions          → DecisionRecord[]
 * - bogle_users/{userId}/superhuman/sleep              → SleepData[]
 * - bogle_users/{userId}/superhuman/energy             → EnergyData[]
 * - bogle_users/{userId}/superhuman/performance        → PeakPerformanceProfile
 * - bogle_users/{userId}/superhuman/claims             → VerifiedClaim[]
 * - bogle_users/{userId}/superhuman/goals              → GoalProgress[]
 * - bogle_users/{userId}/superhuman/habits             → HabitRecord[]
 * - bogle_users/{userId}/superhuman/experiments        → PersonalExperiment[]
 * - bogle_users/{userId}/superhuman/beliefs            → BeliefTracker[]
 * - bogle_users/{userId}/superhuman/hypotheses         → Hypothesis[]
 * - bogle_users/{userId}/superhuman/spending           → SpendingRecord[]
 * - bogle_users/{userId}/superhuman/relationships      → Relationship[]
 * - bogle_users/{userId}/superhuman/interactions       → Interaction[]
 *
 * @module tools/domains/research/superhuman-tools/firestore-persistence
 */
import type { DecisionRecord, PeakPerformanceProfile, GoalProgress, PersonalExperiment, BeliefTracker, Hypothesis, SpendingRecord, Relationship, Interaction } from './types.js';
export declare function saveDecision(userId: string, decision: DecisionRecord): Promise<void>;
export declare function loadDecisions(userId: string): Promise<DecisionRecord[]>;
export declare function updateDecision(userId: string, decisionId: string, update: Partial<DecisionRecord>): Promise<void>;
export interface SleepData {
    date: Date;
    hours: number;
    quality: number;
}
export declare function saveSleepData(userId: string, data: SleepData): Promise<void>;
export declare function loadSleepData(userId: string): Promise<SleepData[]>;
export interface EnergyData {
    date: Date;
    hour: number;
    level: number;
}
export declare function saveEnergyData(userId: string, data: EnergyData): Promise<void>;
export declare function loadEnergyData(userId: string): Promise<EnergyData[]>;
export declare function savePerformanceProfile(userId: string, profile: PeakPerformanceProfile): Promise<void>;
export declare function loadPerformanceProfile(userId: string): Promise<PeakPerformanceProfile | null>;
export declare function saveGoalProgress(userId: string, goal: GoalProgress): Promise<void>;
export declare function loadGoalProgress(userId: string, goalId?: string): Promise<GoalProgress[]>;
export interface HabitRecord {
    id: string;
    name: string;
    type: string;
    startDate: Date;
    streak: number;
    longestStreak: number;
    completions: Date[];
    breaks: {
        date: Date;
        reason?: string;
    }[];
    status: 'active' | 'abandoned' | 'completed';
}
export declare function saveHabit(userId: string, habit: HabitRecord): Promise<void>;
export declare function loadHabits(userId: string): Promise<HabitRecord[]>;
export declare function saveExperiment(userId: string, experiment: PersonalExperiment): Promise<void>;
export declare function loadExperiments(userId: string): Promise<PersonalExperiment[]>;
export declare function saveBelief(userId: string, belief: BeliefTracker): Promise<void>;
export declare function loadBeliefs(userId: string): Promise<BeliefTracker[]>;
export declare function saveHypothesis(userId: string, hypothesis: Hypothesis): Promise<void>;
export declare function loadHypotheses(userId: string): Promise<Hypothesis[]>;
export declare function saveSpendingRecord(userId: string, record: SpendingRecord): Promise<void>;
export declare function loadSpendingRecords(userId: string): Promise<SpendingRecord[]>;
export declare function saveRelationship(userId: string, relationship: Relationship): Promise<void>;
export declare function loadRelationships(userId: string): Promise<Relationship[]>;
export declare function saveInteraction(userId: string, interaction: Interaction): Promise<void>;
export declare function loadInteractions(userId: string): Promise<Interaction[]>;
export interface VerifiedClaim {
    claim: string;
    verdict: 'verified' | 'partially_true' | 'misleading' | 'false' | 'unverifiable';
    confidence: number;
    verifiedAt: Date;
    sources: string[];
}
export declare function saveVerifiedClaim(userId: string, claim: VerifiedClaim): Promise<void>;
export declare function loadVerifiedClaims(userId: string): Promise<VerifiedClaim[]>;
/**
 * Extract userId from LiveKit agent context
 *
 * The context structure in LiveKit agents:
 * - ctx.session.userData.userId - Primary location
 * - ctx.room.name - Fallback (room name often contains userId)
 * - ctx.userId - Direct property (from ToolContext)
 */
export declare function getUserIdFromContext(ctx: unknown): string | null;
/**
 * Get sessionId from context
 */
export declare function getSessionIdFromContext(ctx: unknown): string | null;
//# sourceMappingURL=firestore-persistence.d.ts.map