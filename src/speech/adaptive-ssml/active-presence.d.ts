/**
 * Active Presence System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module creates the feeling of being HEARD without constant verbal feedback.
 * Instead of many "mm-hmms", it focuses on:
 *
 * 1. **Content Echoing** - Repeating back key words/phrases they said
 * 2. **Thoughtful Opening Pauses** - A beat before responding that shows thinking
 * 3. **Energy Matching** - Starting at their energy level
 * 4. **Completion Markers** - Subtle acknowledgment at turn end
 *
 * Key insight: Humans feel heard when you REFERENCE what they said, not when
 * you make sounds WHILE they talk.
 *
 * @module speech/adaptive-ssml/active-presence
 */
export interface ActivePresenceContext {
    /** Session ID for coordination */
    sessionId: string;
    /** The user's message (what they just said) */
    userMessage: string;
    /** The agent's response (before enhancement) */
    agentResponse: string;
    /** User's detected energy level */
    userEnergy?: 'low' | 'medium' | 'high';
    /** User's detected emotion */
    userEmotion?: string;
    /** Topic weight */
    topicWeight?: 'light' | 'medium' | 'heavy';
    /** Turn count */
    turnCount?: number;
    /** Persona ID */
    personaId?: string;
    /** Was this a long user message? (indicates deep sharing) */
    isLongMessage?: boolean;
    /** Did user mention something specific/personal? */
    hasPersonalContent?: boolean;
}
export interface ActivePresenceResult {
    /** Enhanced response text */
    text: string;
    /** What enhancements were applied */
    appliedEnhancements: string[];
    /** Opening pause duration (ms) */
    openingPauseMs: number;
    /** Did we add an echo? */
    hasEcho: boolean;
    /** The echoed phrase (if any) */
    echoedPhrase?: string;
}
/**
 * Enhance response with active presence markers.
 *
 * This creates the feeling of being heard through:
 * - Echoing key phrases from what they said
 * - Energy-matched opening sounds
 * - Thoughtful pauses that show processing
 *
 * @param context - Context about the conversation
 * @returns Enhanced response with presence markers
 */
export declare function addActivePresence(context: ActivePresenceContext): ActivePresenceResult;
export declare function resetActivePresenceSession(sessionId: string): void;
export declare function resetAllActivePresenceSessions(): void;
declare const _default: {
    addActivePresence: typeof addActivePresence;
    resetActivePresenceSession: typeof resetActivePresenceSession;
    resetAllActivePresenceSessions: typeof resetAllActivePresenceSessions;
};
export default _default;
//# sourceMappingURL=active-presence.d.ts.map