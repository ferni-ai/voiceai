/**
 * Persona Quirks Context Builder
 *
 * Makes quirks, habits, and personality traits surface naturally
 * throughout the conversation - not just in greetings.
 *
 * This creates those magical "human" moments:
 * - "Hold on, let me refill my coffee..." (habit)
 * - "You know what I think about that?" (strong opinion)
 * - "I'm terrible at this, but..." (weakness - relatable)
 * - "Don't tell anyone, but..." (guilty pleasure - intimate)
 *
 * Quirks are revealed based on:
 * 1. Relationship stage - deeper reveals for trusted relationships
 * 2. Conversation context - relevant quirks based on topic
 * 3. Random natural moments - occasional unprompted reveals
 * 4. Turn count - don't reveal everything at once
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildPersonaQuirksContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildPersonaQuirksContext };
//# sourceMappingURL=persona-quirks.d.ts.map