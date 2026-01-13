/**
 * Ambient Mode Service
 *
 * > "Better than human means being there even when we're not talking."
 *
 * Continuous background presence that knows where you are, what time it is,
 * and gently nudges when it matters.
 *
 * ## Privacy First
 *
 * - Location is coarse (home/work/gym), not exact coordinates
 * - All tracking is opt-in
 * - User sets quiet hours
 * - Nudges are gentle, never pushy
 *
 * ## What We Know
 *
 * | Context | How Ferni Uses It |
 * |---------|-------------------|
 * | Time of day | "It's late, how are you sleeping?" |
 * | Location type | "How was the gym?" |
 * | Post-meeting | "How'd that meeting go?" |
 * | Commute | "Got a moment while traveling?" |
 *
 * ## Usage
 *
 * ```typescript
 * import { ambientMode } from './services/ambient-mode';
 *
 * // Handle sync from mobile app
 * const response = await ambientMode.handleSync(request);
 *
 * // Get context for LLM
 * const context = await ambientMode.getContextInjection(userId);
 * ```
 *
 * @module services/ambient-mode
 */
export type { AmbientState, AmbientNudge, NudgeType, AmbientPreferences, AmbientContext, AmbientSyncRequest, AmbientSyncResponse, AmbientRule, AmbientCondition, LearnedLocation, AmbientInsights, } from './types.js';
export { storeAmbientState, getAmbientState, getAmbientPreferences, updateAmbientPreferences, evaluateNudge, handleAmbientSync, buildAmbientContext, getAmbientContextInjection, ambientStateManager, } from './ambient-state-manager.js';
import { handleAmbientSync, getAmbientState, getAmbientPreferences, updateAmbientPreferences, buildAmbientContext, getAmbientContextInjection, evaluateNudge } from './ambient-state-manager.js';
/**
 * Unified Ambient Mode API
 */
export declare const ambientMode: {
    /**
     * Handle ambient sync from mobile app
     */
    handleSync: typeof handleAmbientSync;
    /**
     * Get current ambient state for user
     */
    getState: typeof getAmbientState;
    /**
     * Get user's ambient preferences
     */
    getPreferences: typeof getAmbientPreferences;
    /**
     * Update user's ambient preferences
     */
    updatePreferences: typeof updateAmbientPreferences;
    /**
     * Build ambient context for a user
     */
    buildContext: typeof buildAmbientContext;
    /**
     * Get ambient context injection for LLM
     */
    getContextInjection: typeof getAmbientContextInjection;
    /**
     * Evaluate if a nudge should be sent
     */
    evaluateNudge: typeof evaluateNudge;
    /**
     * Check if ambient mode is enabled for user
     */
    isEnabled: (userId: string) => Promise<boolean>;
    /**
     * Enable ambient mode for user
     */
    enable: (userId: string) => Promise<void>;
    /**
     * Disable ambient mode for user
     */
    disable: (userId: string) => Promise<void>;
    /**
     * Set quiet hours for user
     */
    setQuietHours: (userId: string, startTime: string, endTime: string) => Promise<void>;
};
import type { ContextInjection } from '../../intelligence/context-builders/core/types.js';
/**
 * Build ambient awareness context injection
 *
 * Priority: 72 (below visual at 74, above general at 70)
 */
export declare function buildAmbientModeInjection(userId: string): Promise<ContextInjection | null>;
export default ambientMode;
//# sourceMappingURL=index.d.ts.map