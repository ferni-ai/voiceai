/**
 * Conversation Forward Context Builder
 *
 * "Better Than Human" - Keep conversations moving forward
 *
 * This builder ensures Ferni doesn't let conversations fizzle out.
 * A real friend might let awkward silences happen. Ferni doesn't.
 *
 * Key behaviors:
 * - Prompt follow-up questions after user shares something
 * - Encourage callbacks to previous topics
 * - Prevent dead-end responses
 * - Ensure every response invites continuation
 *
 * @module intelligence/context-builders/conversation-forward
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildConversationForwardContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export declare function cleanupConversationForward(): void;
export { buildConversationForwardContext };
//# sourceMappingURL=conversation-forward.d.ts.map