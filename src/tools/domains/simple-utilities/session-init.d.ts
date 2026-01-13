/**
 * Session Initialization for Simple Utilities
 *
 * Call this when a user session starts to:
 * 1. Load their preferences from Firestore
 * 2. Hydrate the in-memory pattern store
 * 3. Check for proactive suggestions
 * 4. Register voice callback handlers
 *
 * This is what makes Ferni remember you across sessions.
 */
import { type VoiceCallback } from './voice-callbacks.js';
interface SessionState {
    userId: string;
    initialized: boolean;
    preferencesLoaded: boolean;
    proactiveOffersReady: boolean;
    lifeContextLoaded: boolean;
}
/**
 * Initialize utilities for a user session
 * Call this at conversation start
 */
export declare function initializeUtilitiesForSession(userId: string, options?: {
    voiceHandler?: (callback: VoiceCallback) => Promise<void>;
    skipProactive?: boolean;
}): Promise<{
    proactiveOpener: string | null;
    upcomingMilestones: Array<{
        event: string;
        daysRemaining: number;
    }>;
    suggestedTimers: Array<{
        minutes: number;
        label: string;
    }>;
}>;
/**
 * End a user session and sync patterns to Firestore
 */
export declare function endUtilitiesSession(userId: string): Promise<void>;
/**
 * Check if session is initialized
 */
export declare function isSessionInitialized(userId: string): boolean;
/**
 * Get session state (for debugging)
 */
export declare function getSessionState(userId: string): SessionState | undefined;
/**
 * Hook to call at conversation start
 * Returns a proactive message if appropriate
 */
export declare function onConversationStart(userId: string, voiceHandler?: (callback: VoiceCallback) => Promise<void>): Promise<string | null>;
/**
 * Hook to call when conversation ends
 */
export declare function onConversationEnd(userId: string): Promise<void>;
/**
 * Hook for periodic proactive checks during long conversations
 */
export declare function onConversationTick(userId: string, turnCount: number, lastActivityMinutes: number): Promise<string | null>;
declare const _default: {
    initializeUtilitiesForSession: typeof initializeUtilitiesForSession;
    endUtilitiesSession: typeof endUtilitiesSession;
    isSessionInitialized: typeof isSessionInitialized;
    getSessionState: typeof getSessionState;
    onConversationStart: typeof onConversationStart;
    onConversationEnd: typeof onConversationEnd;
    onConversationTick: typeof onConversationTick;
};
export default _default;
export type { VoiceCallback } from './voice-callbacks.js';
export type { ProactiveOffer, ProactiveContext } from './proactive-hooks.js';
//# sourceMappingURL=session-init.d.ts.map