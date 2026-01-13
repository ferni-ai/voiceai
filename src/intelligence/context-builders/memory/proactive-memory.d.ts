/**
 * Proactive Memory Context Builder
 *
 * Makes the agent spontaneously recall relevant memories about the user.
 * Creates that magical "I was just thinking about you" feeling.
 *
 * Features:
 * - Follow-up on previous conversations
 * - Goal progress check-ins
 * - Key moment callbacks
 * - Relationship anniversaries
 * - Emotional pattern awareness
 *
 * This makes conversations feel continuous and deeply personal.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
import { type ProactiveMemory } from '../../../services/memory/memory-management.js';
/**
 * Format a proactive memory for injection into the prompt
 */
declare function formatMemoryForPrompt(memory: ProactiveMemory): string;
/**
 * Build proactive memory context injections
 */
declare function buildProactiveMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Build voice recognition context (if voice sketch matches)
 */
declare function buildVoiceRecognitionContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Combined proactive memory and voice recognition builder
 */
declare function buildProactiveContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildProactiveMemoryContext, buildVoiceRecognitionContext, buildProactiveContext, formatMemoryForPrompt, };
declare const _default: {
    buildProactiveMemoryContext: typeof buildProactiveMemoryContext;
    buildVoiceRecognitionContext: typeof buildVoiceRecognitionContext;
    buildProactiveContext: typeof buildProactiveContext;
};
export default _default;
//# sourceMappingURL=proactive-memory.d.ts.map