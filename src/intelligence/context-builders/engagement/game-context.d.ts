/**
 * 🎮 Game Context Builder
 *
 * Injects game state into LLM context so it knows when to:
 * - Route user guesses to submitGameAnswer tool
 * - Use game-appropriate tone
 * - Reference scores, rounds, etc.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build game context injection
 */
declare function buildGameContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildGameContext };
export default buildGameContext;
//# sourceMappingURL=game-context.d.ts.map