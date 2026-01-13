/**
 * Contextual Laughter Timing
 *
 * Determines when the agent should laugh based on conversation mood and context.
 * This isn't about detecting user laughter - it's about when Ferni should add
 * natural laughs to their own speech.
 *
 * > "Better than human" - Knows exactly when a laugh would feel natural and warm.
 *
 * Key insight: Humans laugh for social bonding, not just at jokes.
 * The right laugh at the right time creates connection. The wrong laugh
 * during a heavy moment breaks trust.
 *
 * @module speech/adaptive-ssml/contextual-laughter
 */
export interface LaughterContext {
    /** Agent's response text to analyze */
    responseText: string;
    /** User's last message */
    userMessage?: string;
    /** User's detected emotion */
    userEmotion?: string;
    /** User's energy level */
    userEnergy?: 'low' | 'medium' | 'high';
    /** Topic weight: light, medium, heavy */
    topicWeight?: 'light' | 'medium' | 'heavy';
    /** Current turn count */
    turnCount?: number;
    /** Recent conversation topics */
    recentTopics?: string[];
    /** Persona ID */
    personaId?: string;
    /** Did the user just laugh? */
    userJustLaughed?: boolean;
    /** Comfort level with user (0-1) */
    comfortLevel?: number;
    /** Relationship stage */
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'close_friend';
}
export interface LaughterDecision {
    /** Should add laughter? */
    shouldLaugh: boolean;
    /** Type of laugh to add */
    laughType: 'full' | 'soft' | 'chuckle' | 'warm' | 'self-deprecating' | 'none';
    /** Where to place the laugh */
    placement: 'before' | 'after' | 'inline' | 'end';
    /** The actual SSML/text to insert */
    laughText: string;
    /** Position in text to insert (character index), or -1 for end */
    insertPosition: number;
    /** Reason for decision */
    reason: string;
    /** Confidence in decision (0-1) */
    confidence: number;
}
/**
 * Different types of laughs and their representations.
 * We use synthesized text for most laughs because Cartesia's [laughter]
 * bracket notation uses stock audio that doesn't match persona voice.
 */
declare const LAUGH_TYPES: {
    readonly full: {
        readonly variants: readonly ["haha", "ha ha", "[laughter]"];
        readonly ssmlWrapper: "<break time=\"100ms\"/>{laugh}<break time=\"150ms\"/>";
        readonly minComfort: 0.3;
    };
    readonly soft: {
        readonly variants: readonly ["heh", "hah"];
        readonly ssmlWrapper: "<break time=\"80ms\"/>{laugh}<break time=\"100ms\"/>";
        readonly minComfort: 0.2;
    };
    readonly chuckle: {
        readonly variants: readonly ["heh", "mm heh"];
        readonly ssmlWrapper: "{laugh}<break time=\"80ms\"/>";
        readonly minComfort: 0.2;
    };
    readonly warm: {
        readonly variants: readonly ["aw", "heh"];
        readonly ssmlWrapper: "<emotion value=\"affectionate\"/>{laugh}<break time=\"100ms\"/>";
        readonly minComfort: 0.4;
    };
    readonly 'self-deprecating': {
        readonly variants: readonly ["heh", "ha", "okay, that was bad"];
        readonly ssmlWrapper: "{laugh}<break time=\"120ms\"/>";
        readonly minComfort: 0.3;
    };
};
/**
 * Persona-specific laughter tendencies.
 *
 * HUMANIZATION FIX (Dec 2025): Significantly reduced laugh probabilities
 * and increased minTurnsBetweenLaughs. Real humans laugh about once every
 * 2-3 minutes in conversation, not every few exchanges. Over-laughing
 * feels performative and undermines trust.
 */
declare const PERSONA_LAUGH_STYLES: Record<string, PersonaLaughStyle>;
interface PersonaLaughStyle {
    laughProbabilityBase: number;
    preferredTypes: Array<'full' | 'soft' | 'chuckle' | 'warm' | 'self-deprecating'>;
    laughAfterOwnJokes: boolean;
    laughWithUser: boolean;
    selfDeprecatingFrequency: number;
    minTurnsBetweenLaughs: number;
}
/**
 * Reset session laugh history.
 */
export declare function resetLaughterSession(sessionId: string): void;
/**
 * Decide whether and how to add laughter to agent response.
 *
 * @param context - Conversation and response context
 * @param sessionId - Session ID for tracking
 * @returns Decision about whether/how to add laughter
 */
export declare function decideLaughter(context: LaughterContext, sessionId?: string): LaughterDecision;
/**
 * Apply laughter decision to response text.
 *
 * @param text - Original response text
 * @param decision - Laughter decision
 * @returns Text with laughter inserted
 */
export declare function applyLaughter(text: string, decision: LaughterDecision): string;
/**
 * One-step function to add contextual laughter to response.
 *
 * @param responseText - Agent's response text
 * @param context - Conversation context
 * @param sessionId - Session ID for tracking
 * @returns Enhanced text with laughter (if appropriate)
 */
export declare function addContextualLaughter(responseText: string, context: Omit<LaughterContext, 'responseText'>, sessionId?: string): {
    text: string;
    decision: LaughterDecision;
};
export { LAUGH_TYPES, PERSONA_LAUGH_STYLES, type PersonaLaughStyle };
//# sourceMappingURL=contextual-laughter.d.ts.map