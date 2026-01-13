/**
 * Social Relationships Context Builder
 *
 * Injects relationship awareness from the social graph.
 * "Better than Human" - remember everyone important to you.
 *
 * Superhuman Capabilities:
 * - "You haven't mentioned Sarah in 3 weeks - everything okay?"
 * - "You always seem happier after talking to your brother"
 * - "Today's your mom's birthday - how are you feeling about it?"
 *
 * Privacy-First: Only tracks names mentioned IN conversation, never accesses contacts.
 *
 * @module intelligence/context-builders/social-relationships
 */
import { type ContextBuilder } from '../index.js';
/**
 * Social Relationships Context Builder
 *
 * Priority: 55 (after core emotional, before personalization)
 */
export declare const socialRelationshipsBuilder: ContextBuilder;
/**
 * Clear session mentions on session end
 */
export declare function clearSessionMentions(sessionId: string): void;
export default socialRelationshipsBuilder;
//# sourceMappingURL=social-relationships.d.ts.map