/**
 * Behavioral Economics Nudge Engine
 *
 * Phase 31: Use psychology of choice to help people change.
 * Based on Thaler & Sunstein's nudge theory, Kahneman's work,
 * and implementation intention research.
 *
 * CORE INSIGHT: People don't make rational decisions.
 * We can design choice environments that make good choices easier.
 *
 * @module NudgeEngine
 */
/**
 * Load user's nudge data from persistence.
 * Call this at session start.
 */
export declare function loadUserNudgeData(userId: string): Promise<void>;
/**
 * Flush pending changes for a user.
 */
export declare function flushUserNudgeData(userId: string): Promise<void>;
/**
 * Clear user's nudge data from memory and persistence.
 */
export declare function clearUserNudgeData(userId: string): Promise<void>;
export type NudgeType = 'default_setting' | 'social_proof' | 'commitment_device' | 'implementation_intention' | 'loss_framing' | 'gain_framing' | 'temporal_reframing' | 'identity_alignment' | 'friction_reduction' | 'friction_addition' | 'salience' | 'feedback' | 'chunking' | 'anchoring';
export interface Nudge {
    id: string;
    type: NudgeType;
    targetBehavior: string;
    strategy: string;
    script: string;
    timing: 'immediate' | 'delayed' | 'contextual';
    effectiveness: number;
}
export interface CommitmentDevice {
    id: string;
    userId: string;
    type: 'social' | 'financial' | 'identity' | 'temporal';
    commitment: string;
    createdAt: Date;
    deadline?: Date;
    stakes?: string;
    witnesses?: string[];
    status: 'active' | 'fulfilled' | 'broken';
}
export interface ImplementationIntention {
    id: string;
    userId: string;
    goal: string;
    situation: string;
    behavior: string;
    formula: string;
    createdAt: Date;
    timesTriggered: number;
    successRate: number;
}
export interface NudgeContext {
    userId: string;
    goalType: 'health' | 'productivity' | 'relationship' | 'financial' | 'growth' | 'habit';
    currentStage: 'considering' | 'planning' | 'acting' | 'maintaining';
    barriers?: string[];
    motivationLevel: number;
    pastAttempts?: number;
}
/**
 * Select the best nudges for a given context.
 */
export declare function selectNudges(context: NudgeContext): Nudge[];
/**
 * Create an implementation intention.
 */
export declare function createImplementationIntention(userId: string, goal: string, situation: string, behavior: string): ImplementationIntention;
/**
 * Create a commitment device.
 */
export declare function createCommitment(userId: string, commitment: string, options?: {
    type?: CommitmentDevice['type'];
    deadline?: Date;
    stakes?: string;
    witnesses?: string[];
}): CommitmentDevice;
/**
 * Record intention trigger and outcome.
 */
export declare function recordIntentionOutcome(userId: string, intentionId: string, succeeded: boolean): void;
/**
 * Update commitment status.
 */
export declare function updateCommitmentStatus(userId: string, commitmentId: string, status: CommitmentDevice['status']): void;
/**
 * Get user's active commitments.
 */
export declare function getActiveCommitments(userId: string): CommitmentDevice[];
/**
 * Get user's implementation intentions.
 */
export declare function getImplementationIntentions(userId: string): ImplementationIntention[];
/**
 * Generate nudge-based context for LLM.
 */
export declare function getNudgeContextInjection(context: NudgeContext): string;
/**
 * Generate implementation intention prompt.
 */
export declare function generateIntentionPrompt(goal: string): string;
export declare const nudgeEngine: {
    select: typeof selectNudges;
    createIntention: typeof createImplementationIntention;
    createCommitment: typeof createCommitment;
    recordOutcome: typeof recordIntentionOutcome;
    updateCommitment: typeof updateCommitmentStatus;
    getCommitments: typeof getActiveCommitments;
    getIntentions: typeof getImplementationIntentions;
    getContext: typeof getNudgeContextInjection;
    generatePrompt: typeof generateIntentionPrompt;
    loadUserData: typeof loadUserNudgeData;
    flushUserData: typeof flushUserNudgeData;
    clearUserData: typeof clearUserNudgeData;
};
export default nudgeEngine;
//# sourceMappingURL=nudge-engine.d.ts.map