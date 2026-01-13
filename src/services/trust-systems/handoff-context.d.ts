/**
 * Team Handoff Context
 *
 * Passes trust context when handing off to other team members.
 * Maya should know about boundaries. Peter should know what topics are sensitive.
 *
 * Philosophy: When you introduce a friend to another friend, you might whisper
 * "hey, don't mention their ex" - this system does that automatically.
 *
 * @module HandoffContext
 */
export interface HandoffTrustContext {
    userId: string;
    /** Persona receiving the handoff */
    targetPersonaId: string;
    /** Persona handing off */
    sourcePersonaId: string;
    /** Critical warnings - things to definitely avoid */
    criticalWarnings: Array<{
        type: 'boundary' | 'sensitive_topic' | 'recent_distress';
        topic: string;
        reason: string;
    }>;
    /** Things to be careful about */
    sensitiveAreas: Array<{
        topic: string;
        approach: string;
    }>;
    /** Helpful context for building rapport */
    rapportBuilders: Array<{
        type: 'shared_moment' | 'callback' | 'win' | 'growth';
        content: string;
        suggestion: string;
    }>;
    /** User's communication preferences */
    communicationStyle: {
        probingDepth: 'high' | 'medium' | 'low';
        celebrationStyle: 'enthusiastic' | 'understated' | 'reflective';
        preferredPace: 'quick' | 'thoughtful' | 'varies';
    };
    /** Pending things to follow up on */
    pendingFollowUps: Array<{
        type: 'intention' | 'win' | 'growth';
        description: string;
        whenStated?: Date;
    }>;
    /** Summary for LLM context injection */
    contextSummary: string;
}
export interface PersonaSpecificContext {
    /** What this persona should know */
    relevant: string[];
    /** What this persona probably doesn't need */
    irrelevant: string[];
    /** Special instructions for this persona */
    instructions: string[];
}
/**
 * Build handoff context for a specific persona
 */
export declare function buildHandoffContext(userId: string, sourcePersonaId: string, targetPersonaId: string): HandoffTrustContext;
/**
 * Get minimal handoff warnings (for quick context)
 */
export declare function getHandoffWarnings(userId: string): string[];
/**
 * Format handoff context for injection into LLM instructions
 */
export declare function formatHandoffForLLM(context: HandoffTrustContext): string;
/**
 * Create a brief handoff note for the receiving persona
 */
export declare function createHandoffNote(context: HandoffTrustContext): string;
declare const _default: {
    buildHandoffContext: typeof buildHandoffContext;
    getHandoffWarnings: typeof getHandoffWarnings;
    formatHandoffForLLM: typeof formatHandoffForLLM;
    createHandoffNote: typeof createHandoffNote;
};
export default _default;
//# sourceMappingURL=handoff-context.d.ts.map