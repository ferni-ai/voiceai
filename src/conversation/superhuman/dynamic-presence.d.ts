/**
 * Dynamic Presence Expressions
 *
 * Replaces static "I'm sitting with this" phrases with contextual,
 * genuinely human responses that vary based on what was actually said.
 *
 * The problem: "Sitting with" became therapy-speak. Real humans don't
 * repeatedly say "I'm sitting with this" - they express presence through:
 * - Specific references to what was said
 * - Physical/embodied language
 * - Genuine curiosity about details
 * - Noticing and reflecting back
 *
 * This module generates varied, contextual presence expressions.
 *
 * @module conversation/superhuman/dynamic-presence
 */
export interface PresenceContext {
    /** What the user just said (for specific references) */
    lastUserMessage?: string;
    /** Key topics or details mentioned */
    mentionedDetails?: string[];
    /** Emotional tone of what they shared */
    emotionalTone?: 'heavy' | 'light' | 'neutral' | 'excited' | 'vulnerable';
    /** How long we've been talking */
    turnCount?: number;
    /** Is this late night? */
    isLateNight?: boolean;
    /** What we were discussing */
    topic?: string;
    /** Session ID for variety tracking */
    sessionId?: string;
}
export type PresenceStyle = 'through_specificity' | 'through_physicality' | 'through_noticing' | 'through_breath' | 'through_curiosity';
/**
 * Extract a specific detail from user message to reference
 * This makes presence feel specific, not generic
 */
declare function extractSpecificReference(message: string): string | null;
/**
 * Detect topic category from message
 */
declare function detectTopic(message: string): string;
/**
 * Generate a dynamic, contextual presence expression
 *
 * This replaces static "I'm sitting with this" with varied,
 * context-aware expressions that feel genuinely human.
 */
export declare function generatePresenceExpression(context: PresenceContext): string;
/**
 * Generate a simple presence acknowledgment (minimal)
 * For when less is more
 */
export declare function generateMinimalPresence(): string;
/**
 * Check if a phrase is the overused "sitting with" pattern
 */
export declare function isSittingWithCliche(phrase: string): boolean;
/**
 * Rewrite a "sitting with" phrase to something more dynamic
 */
export declare function rewriteSittingWithPhrase(originalPhrase: string, context: PresenceContext): string;
declare const _default: {
    generatePresenceExpression: typeof generatePresenceExpression;
    generateMinimalPresence: typeof generateMinimalPresence;
    isSittingWithCliche: typeof isSittingWithCliche;
    rewriteSittingWithPhrase: typeof rewriteSittingWithPhrase;
    extractSpecificReference: typeof extractSpecificReference;
    detectTopic: typeof detectTopic;
};
export default _default;
//# sourceMappingURL=dynamic-presence.d.ts.map