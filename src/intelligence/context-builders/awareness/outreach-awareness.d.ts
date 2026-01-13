/**
 * Outreach Awareness Context Builder
 *
 * Injects proactive outreach opportunities into Ferni's context.
 * This enables Ferni to naturally suggest reaching out to people:
 *
 * "Hey, I noticed your mom's birthday is in 3 days. Want me to send her something?"
 * "You usually talk to Sarah more often. Should we check in on her?"
 *
 * Works for all personas but is especially relevant for Ferni and Alex.
 *
 * @module intelligence/context-builders/outreach-awareness
 */
import type { ContextBuilder } from '../core/types.js';
/**
 * Outreach Awareness Context Builder
 *
 * Surfaces upcoming birthdays, anniversaries, and outreach opportunities
 * so Ferni can proactively suggest communication.
 */
export declare const outreachAwarenessBuilder: ContextBuilder;
/**
 * Get a nudge to potentially insert at the start of a conversation
 * Use this when the user hasn't spoken yet or at natural transition points
 */
export declare function getConversationStarterNudge(userId: string): Promise<string | null>;
/**
 * Get outreach context for use in communication tools
 */
export declare function getOutreachContextForTools(userId: string): Promise<{
    summary: string;
    upcomingDates: Array<{
        name: string;
        type: string;
        daysAway: number;
    }>;
    needsAttention: string[];
}>;
export default outreachAwarenessBuilder;
//# sourceMappingURL=outreach-awareness.d.ts.map