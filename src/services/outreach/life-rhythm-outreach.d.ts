/**
 * Life Rhythm Outreach Integration
 *
 * > "Better than human" - We remember your patterns and reach out BEFORE you struggle
 *
 * Connects the deep understanding life rhythm prediction system to proactive outreach.
 * This enables Ferni to anticipate when users need support based on learned patterns:
 *
 * - Weekly patterns (Monday blues, Sunday scaries)
 * - Monthly patterns (end-of-month stress, pay cycle)
 * - Seasonal patterns (SAD, holiday stress)
 * - Personal anniversaries and significant dates
 *
 * @module services/outreach/life-rhythm-outreach
 */
import { type RhythmPrediction } from '../../intelligence/life-rhythm-prediction.js';
import type { AgentId } from '../agent-bus.js';
export interface LifeRhythmOutreachConfig {
    /** Minimum confidence for triggering outreach */
    minConfidence: number;
    /** Minimum hours since last outreach */
    minHoursBetweenOutreach: number;
    /** Maximum outreach per user per day */
    maxPerDay: number;
    /** Enable/disable feature */
    enabled: boolean;
}
export interface LifeRhythmOutreachResult {
    triggered: boolean;
    prediction: RhythmPrediction | null;
    reason?: string;
    suggestedTime?: Date;
}
/**
 * Evaluate if a user should receive a life rhythm-based outreach
 *
 * @param userId - User to evaluate
 * @param config - Optional config overrides
 * @returns Result with whether to trigger and the prediction
 */
export declare function evaluateLifeRhythmOutreach(userId: string, config?: Partial<LifeRhythmOutreachConfig>): LifeRhythmOutreachResult;
/**
 * Trigger a life rhythm-based outreach for a user
 *
 * @param userId - User to reach out to
 * @param prediction - The rhythm prediction
 * @param personaId - Which persona should reach out (default: ferni)
 */
export declare function triggerLifeRhythmOutreach(userId: string, prediction: RhythmPrediction, personaId?: AgentId): Promise<boolean>;
/**
 * Generate an empathetic message based on life rhythm prediction
 *
 * @param prediction - The rhythm prediction
 * @returns A warm, human message
 */
export declare function generateLifeRhythmMessage(prediction: RhythmPrediction): string;
/**
 * Run life rhythm outreach evaluation for all registered users
 * Called by the daily outreach job
 *
 * @param getUserIds - Function to get active user IDs
 * @returns Number of outreach triggers created
 */
export declare function runDailyLifeRhythmOutreach(getUserIds: () => Promise<string[]>): Promise<{
    processed: number;
    triggered: number;
}>;
declare const _default: {
    evaluateLifeRhythmOutreach: typeof evaluateLifeRhythmOutreach;
    triggerLifeRhythmOutreach: typeof triggerLifeRhythmOutreach;
    generateLifeRhythmMessage: typeof generateLifeRhythmMessage;
    runDailyLifeRhythmOutreach: typeof runDailyLifeRhythmOutreach;
};
export default _default;
//# sourceMappingURL=life-rhythm-outreach.d.ts.map