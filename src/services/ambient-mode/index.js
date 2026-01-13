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
import { createLogger } from '../../utils/safe-logger.js';
// Re-export state manager functions
export { storeAmbientState, getAmbientState, getAmbientPreferences, updateAmbientPreferences, evaluateNudge, handleAmbientSync, buildAmbientContext, getAmbientContextInjection, ambientStateManager, } from './ambient-state-manager.js';
const log = createLogger({ module: 'ambient-mode' });
// ============================================================================
// UNIFIED API
// ============================================================================
import { handleAmbientSync, getAmbientState, getAmbientPreferences, updateAmbientPreferences, buildAmbientContext, getAmbientContextInjection, evaluateNudge, } from './ambient-state-manager.js';
/**
 * Unified Ambient Mode API
 */
export const ambientMode = {
    /**
     * Handle ambient sync from mobile app
     */
    handleSync: handleAmbientSync,
    /**
     * Get current ambient state for user
     */
    getState: getAmbientState,
    /**
     * Get user's ambient preferences
     */
    getPreferences: getAmbientPreferences,
    /**
     * Update user's ambient preferences
     */
    updatePreferences: updateAmbientPreferences,
    /**
     * Build ambient context for a user
     */
    buildContext: buildAmbientContext,
    /**
     * Get ambient context injection for LLM
     */
    getContextInjection: getAmbientContextInjection,
    /**
     * Evaluate if a nudge should be sent
     */
    evaluateNudge,
    /**
     * Check if ambient mode is enabled for user
     */
    isEnabled: async (userId) => {
        const prefs = await getAmbientPreferences(userId);
        return prefs?.enabled ?? false;
    },
    /**
     * Enable ambient mode for user
     */
    enable: async (userId) => {
        await updateAmbientPreferences(userId, {
            enabled: true,
            allowLocation: true,
            allowActivityDetection: true,
            allowPushNudges: true,
            maxNudgesPerDay: 3,
            allowedNudgeTypes: [
                'morning_checkin',
                'evening_reflection',
                'post_meeting',
                'workout_encouragement',
            ],
        });
        log.info({ userId }, 'Ambient mode enabled');
    },
    /**
     * Disable ambient mode for user
     */
    disable: async (userId) => {
        await updateAmbientPreferences(userId, {
            enabled: false,
        });
        log.info({ userId }, 'Ambient mode disabled');
    },
    /**
     * Set quiet hours for user
     */
    setQuietHours: async (userId, startTime, // HH:MM
    endTime // HH:MM
    ) => {
        await updateAmbientPreferences(userId, {
            quietHoursStart: startTime,
            quietHoursEnd: endTime,
        });
        log.info({ userId, startTime, endTime }, 'Quiet hours set');
    },
};
/**
 * Build ambient awareness context injection
 *
 * Priority: 72 (below visual at 74, above general at 70)
 */
export async function buildAmbientModeInjection(userId) {
    try {
        const context = await buildAmbientContext(userId);
        if (!context.hasAmbientData) {
            return null;
        }
        const content = await getAmbientContextInjection(userId);
        if (!content)
            return null;
        return {
            id: 'ambient-mode',
            source: 'ambient-mode',
            content,
            priority: 'standard',
            category: 'better-than-human',
            confidence: 0.8,
        };
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Failed to build ambient mode injection');
        return null;
    }
}
export default ambientMode;
//# sourceMappingURL=index.js.map