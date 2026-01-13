/**
 * Session Recovery Handler
 *
 * Provides proactive user communication when self-healing recovers from errors.
 * This is the "human touch" that makes Ferni feel genuinely present.
 *
 * Philosophy: When something goes wrong, Ferni acknowledges it warmly
 * and redirects focus back to the user - because their experience matters most.
 */
export interface RecoveryContext {
    wasInConversation: boolean;
    lastUserMessage?: string;
    errorType: string;
    phase: string;
    autoRecovered: boolean;
}
interface SessionLike {
    say: (text: string, options?: {
        allowInterruptions?: boolean;
    }) => Promise<void> | void;
}
/**
 * Communicate recovery to user in a warm, human way
 * @param sessionId - If provided, uses coordinated speech; otherwise falls back to direct session.say
 */
export declare function communicateRecovery(session: SessionLike, error: Error, context: RecoveryContext, sessionId?: string): Promise<boolean>;
/**
 * Register recovery handlers for a session
 *
 * This wraps common session events to automatically communicate
 * recovery when the self-healing system fixes issues.
 */
export declare function createRecoveryAwareSession(session: SessionLike, options?: {
    sessionId?: string;
    onRecoverySpoken?: (message: string) => void;
}): SessionLike & {
    notifyRecovery: (error: Error, context: Partial<RecoveryContext>) => Promise<boolean>;
};
/**
 * Pre-defined recovery phrases for common scenarios
 *
 * These are warmer, more conversational versions that feel genuinely Ferni.
 */
export declare const RECOVERY_PHRASES: {
    readonly quickBlip: readonly ["Little hiccup there - I'm back!", "Oops, lost you for a sec. I'm here now!", "That was weird - anyway, I'm back!"];
    readonly noticeableDelay: readonly ["Sorry about that pause - had a small technical moment. What were you saying?", "Okay, I'm back! Had a little brain freeze there. Where were we?", "That took a second - my brain needed a quick reset. I'm all ears now!"];
    readonly reconnected: readonly ["Hey, I'm back! We got disconnected for a moment there.", "Okay we're reconnected! Sorry about that little interruption.", "I'm back online! These things happen sometimes with voice calls."];
    readonly reducedMode: readonly ["I'm running a bit light right now, but I'm still here for you.", "Things are a bit simplified on my end, but let's keep going.", "I'm in a simpler mode right now - but still fully present!"];
};
/**
 * Get a random phrase from a category
 */
export declare function getRecoveryPhrase(category: keyof typeof RECOVERY_PHRASES): string;
export {};
//# sourceMappingURL=session-recovery.d.ts.map