/**
 * Outreach Decision Engine
 *
 * The brain that decides WHEN, WHY, WHO, HOW, and WHAT to say for proactive outreach.
 *
 * This engine orchestrates all outreach decisions, ensuring:
 * - Right timing (learned patterns + preferences)
 * - Right persona (who should reach out)
 * - Right channel (call vs text vs email)
 * - Right message (persona-specific voice)
 * - Right frequency (rate limiting)
 */
import { EventEmitter } from 'events';
import { type OutreachChannel } from './persona-voice-generator.js';
import { type CheckInType } from './onboarding-checkin-arc.js';
export type { OutreachTriggerType, OutreachPriority, OutreachTrigger, OutreachDecision, UserOutreachState, DecisionEngineConfig, } from './decision-engine-types.js';
import type { OutreachTrigger, OutreachDecision, UserOutreachState, DecisionEngineConfig } from './decision-engine-types.js';
declare class OutreachDecisionEngine extends EventEmitter {
    private config;
    private intervalId;
    private running;
    constructor(config?: Partial<DecisionEngineConfig>);
    start(): void;
    stop(): void;
    /**
     * Add a new outreach trigger to be processed
     */
    addTrigger(trigger: Omit<OutreachTrigger, 'id' | 'createdAt'>): string;
    /**
     * Cancel a pending trigger
     */
    cancelTrigger(triggerId: string): boolean;
    /**
     * Get pending triggers for a user
     */
    getPendingTriggers(userId: string): OutreachTrigger[];
    /**
     * Get a specific trigger by ID
     */
    getTrigger(triggerId: string): OutreachTrigger | undefined;
    /**
     * Check for pending onboarding check-ins and create triggers
     * Should be called periodically by the scheduled job
     */
    checkOnboardingTriggers(userId: string): Promise<string[]>;
    /**
     * Mark an onboarding check-in as sent (called after successful outreach)
     */
    markOnboardingCheckInSent(userId: string, checkInType: CheckInType, responseReceived?: boolean): void;
    /**
     * Get or create user outreach state (sync - uses cache or creates default)
     * For hydrated data from Firestore, call loadUserStateFromFirestore first
     */
    getUserState(userId: string): UserOutreachState;
    /**
     * Load user state from Firestore (async - call for full hydration)
     */
    loadUserStateFromFirestore(userId: string): Promise<UserOutreachState>;
    /**
     * Update user outreach state
     */
    updateUserState(userId: string, updates: Partial<UserOutreachState>): void;
    /**
     * Update user preferences
     */
    updateUserPreferences(userId: string, preferences: Partial<UserOutreachState['preferences']>): void;
    /**
     * Update user context (from conversation analysis)
     */
    updateUserContext(userId: string, context: Partial<UserOutreachState['context']>): void;
    /**
     * Record that we reached out to a user
     */
    recordOutreach(userId: string): void;
    /**
     * Persist user state to Firestore (fire and forget)
     */
    private persistUserState;
    private createDefaultUserState;
    /**
     * Process all pending triggers
     */
    private processPendingTriggers;
    /**
     * Process a single trigger and make a decision
     */
    private processTrigger;
    private createDecision;
    private recordDecision;
    private evaluateTiming;
    private findNextOptimalTime;
    private getNextDay;
    private getNextWeek;
    private selectChannel;
    private getChannelForTriggerType;
    /**
     * Determine if a trigger should use group outreach (multiple personas)
     */
    private isGroupOutreachTrigger;
    /**
     * Route trigger to appropriate group outreach handler
     */
    private routeToGroupOutreach;
    private buildOutreachContext;
    /**
     * Get user's name from context aggregator or profile
     */
    private getUserNameFromContext;
    private determineTone;
    /**
     * Get outreach history for a user (sync - uses cache)
     */
    getOutreachHistory(userId: string, limit?: number): OutreachDecision[];
    /**
     * Load outreach history from Firestore (async)
     */
    loadOutreachHistoryFromFirestore(userId: string, limit?: number): Promise<OutreachDecision[]>;
    /**
     * Get analytics for outreach effectiveness
     */
    getAnalytics(userId: string): {
        totalSent: number;
        totalSkipped: number;
        totalDeferred: number;
        byChannel: Record<OutreachChannel, number>;
        byTrigger: Record<string, number>;
    };
    /**
     * Clear all data for a user (for testing or privacy)
     */
    clearUserData(userId: string): void;
    /**
     * Load pending triggers for a user from Firestore
     */
    loadUserTriggersFromFirestore(userId: string): Promise<OutreachTrigger[]>;
    /**
     * Reset weekly counters (call this weekly via cron)
     */
    resetWeeklyCounters(): void;
    /**
     * Get all user IDs in the system
     */
    getAllUserIds(): string[];
    /**
     * Prune history older than a cutoff date
     */
    pruneHistory(userId: string, cutoffDate: Date): number;
    /**
     * Alias for clearUserData (for consistency)
     */
    clearUserState(userId: string): void;
}
export declare function getOutreachDecisionEngine(config?: Partial<DecisionEngineConfig>): OutreachDecisionEngine;
export declare function startOutreachDecisionEngine(config?: Partial<DecisionEngineConfig>): OutreachDecisionEngine;
export declare function stopOutreachDecisionEngine(): void;
export { OutreachDecisionEngine };
declare const _default: {
    getOutreachDecisionEngine: typeof getOutreachDecisionEngine;
    startOutreachDecisionEngine: typeof startOutreachDecisionEngine;
    stopOutreachDecisionEngine: typeof stopOutreachDecisionEngine;
};
export default _default;
//# sourceMappingURL=decision-engine.d.ts.map