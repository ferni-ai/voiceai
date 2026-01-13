/**
 * Thread Context Builder
 *
 * Injects conversation thread context into the LLM system prompt.
 * This ensures continuity across channels and agent handoffs.
 *
 * @module intelligence/context-builders/session/thread-context
 */
import type { PersonaId } from '../../../personas/types.js';
export interface ThreadContextInjection {
    /** Formatted context for LLM system prompt */
    content: string;
    /** Priority for injection ordering */
    priority: number;
    /** Whether this is a response to outreach */
    isOutreachResponse: boolean;
    /** The thread ID if one exists */
    threadId?: string;
}
/**
 * Build thread context for injection into the LLM.
 * Call this at the start of a voice session.
 */
export declare function buildThreadContext(userId: string, agentId: PersonaId, options?: {
    sessionId?: string;
    fromNotification?: boolean;
}): Promise<ThreadContextInjection | null>;
/**
 * Build a simple continuation hint for system prompt.
 * Use this if full thread context is too heavy.
 */
export declare function buildContinuationHint(userId: string, agentId: PersonaId): Promise<string | null>;
/**
 * Register with the main context builder.
 * Call this during startup.
 */
export declare function registerThreadContextBuilder(): void;
export declare const threadContextBuilder: {
    build: typeof buildThreadContext;
    buildHint: typeof buildContinuationHint;
    register: typeof registerThreadContextBuilder;
};
//# sourceMappingURL=thread-context.d.ts.map