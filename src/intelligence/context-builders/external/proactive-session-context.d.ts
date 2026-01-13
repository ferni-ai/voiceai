/**
 * Proactive Session Context Builder
 *
 * When Ferni initiates a proactive check-in call (not user-initiated),
 * this builder injects WHY the call was triggered so Ferni can open
 * naturally and authentically.
 *
 * Triggers include:
 * - User hasn't been heard from in N days
 * - Important date approaching (birthday, anniversary)
 * - Mood concern from last session
 * - Commitment follow-up timing
 * - Seasonal/calendar awareness
 *
 * This is different from outbound-call-context.ts which handles
 * ON-BEHALF calls (calling a third party for the user).
 * This handles PROACTIVE calls TO the user.
 *
 * @module intelligence/context-builders/external/proactive-session-context
 */
import { type ContextBuilder } from '../index.js';
export type ProactiveTriggerType = 'silence' | 'birthday' | 'anniversary' | 'mood_concern' | 'commitment_followup' | 'seasonal' | 'milestone' | 'burnout_risk' | 'dream_dormant';
export interface ProactiveSessionContext {
    /** Why we initiated this call */
    triggerType: ProactiveTriggerType;
    /** Human-readable reason */
    triggerReason: string;
    /** Days since last session (if silence trigger) */
    daysSinceLastSession?: number;
    /** Last known emotional state */
    lastMood?: string;
    /** Last session summary */
    lastSessionSummary?: string;
    /** Specific date/event (for birthday, anniversary, etc.) */
    relatedDate?: {
        type: string;
        date: Date;
        description: string;
    };
    /** Related commitment (for followup trigger) */
    relatedCommitment?: {
        summary: string;
        madeOn: Date;
        dueDate?: Date;
    };
    /** Suggested opener style */
    openerStyle: 'warm' | 'celebratory' | 'gentle' | 'supportive' | 'curious';
    /** Specific opener suggestion */
    suggestedOpener?: string;
    /** Things to avoid in this call */
    avoidances?: string[];
    /** Persona initiating (usually Ferni) */
    initiatingPersona: string;
}
/**
 * Store proactive session context for a session.
 * Called by the outreach decision engine when initiating a proactive call.
 */
export declare function setProactiveSessionContext(sessionId: string, context: ProactiveSessionContext): void;
/**
 * Get proactive session context for a session.
 */
export declare function getProactiveSessionContext(sessionId: string): ProactiveSessionContext | undefined;
/**
 * Clear proactive session context after call completes.
 */
export declare function clearProactiveSessionContext(sessionId: string): void;
/**
 * Check if a session is a proactive outreach session.
 */
export declare function isProactiveSession(sessionId: string): boolean;
export declare const proactiveSessionContextBuilder: ContextBuilder;
export default proactiveSessionContextBuilder;
//# sourceMappingURL=proactive-session-context.d.ts.map