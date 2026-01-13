/**
 * Conversation Recap Context Builder
 *
 * Helps personas remember and reference what's been discussed:
 * - "Where were we?" - Resume conversation naturally
 * - Reference earlier topics when relevant
 * - Create continuity across conversation turns
 *
 * This makes the AI feel like it has a coherent memory
 * of the conversation rather than just responding to the last message.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare const RECAP_PATTERNS: RegExp[];
declare const TOPIC_CALLBACK_PATTERNS: RegExp[];
declare function buildConversationRecap(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildConversationRecap, RECAP_PATTERNS, TOPIC_CALLBACK_PATTERNS };
//# sourceMappingURL=conversation-recap.d.ts.map