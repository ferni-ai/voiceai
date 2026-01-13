/**
 * Family Messages Context Builder
 *
 * Injects pending family messages into the sponsor's conversation context.
 * This enables Ferni to naturally deliver messages from family members
 * during the sponsor's next conversation.
 *
 * Example:
 * - Mom calls and says "Tell Seth I'm thinking of him"
 * - Message is stored as pending
 * - Next time Seth talks to Ferni, this builder injects:
 *   "Your mom left you a message: 'I'm thinking of you'"
 * - Ferni naturally weaves this into the conversation
 *
 * @module intelligence/context-builders/external/family-messages-context
 */
import { type ContextBuilder } from '../index.js';
/**
 * Family messages context builder.
 * Injects pending messages from family phone callers for the sponsor.
 */
export declare const familyMessagesContextBuilder: ContextBuilder;
export default familyMessagesContextBuilder;
//# sourceMappingURL=family-messages-context.d.ts.map