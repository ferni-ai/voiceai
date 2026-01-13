/**
 * Natural Discovery Context Builder
 *
 * "Better Than Human" principle: A good friend doesn't give you a menu of
 * conversation topics. They notice things and bring them up naturally.
 *
 * This builder injects gentle "wondering" prompts that encourage Ferni to
 * naturally discover dreams, values, and goals through conversation - not surveys.
 *
 * Key insight: The superhuman services need DATA to work. But asking directly
 * ("What are your goals?") feels like software. This builder suggests natural
 * ways to surface these topics in conversation.
 *
 * @module intelligence/context-builders/session/natural-discovery
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildNaturalDiscoveryContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildNaturalDiscoveryContext };
//# sourceMappingURL=natural-discovery.d.ts.map