/**
 * Persona Playful Mode Context Builder
 *
 * Injects persona-specific humor, observations, and personality
 * into responses when appropriate. Makes each team member feel
 * distinctly human with their own sense of humor.
 *
 * NOTE: Playful content now lives in persona bundles (JSON).
 * These inline functions provide basic fallback content.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build playful context for Alex (Communication Specialist)
 */
declare function buildAlexPlayfulContext(userText: string): ContextInjection[];
/**
 * Build playful context for Maya (Life Habits Coach)
 */
declare function buildMayaPlayfulContext(userText: string): ContextInjection[];
/**
 * Build playful context for Jordan (Life's Firsts Coordinator)
 */
declare function buildJordanPlayfulContext(userText: string): ContextInjection[];
/**
 * Build playful/witty context for Ferni
 *
 * PHILOSOPHY: Ferni should be charming from the START, not after turn 6.
 * Real humans are playful immediately - that's how connection forms.
 *
 * Probabilities have been SIGNIFICANTLY increased because:
 * - The old 8-15% meant Ferni rarely felt fun
 * - Users complained Ferni felt robotic
 * - We want CONSISTENT personality, not occasional glimpses
 */
declare function buildFerniPlayfulContext(input: ContextBuilderInput): ContextInjection[];
/**
 * Build persona-specific playful context
 */
declare function buildPersonaPlayfulContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildPersonaPlayfulContext, buildFerniPlayfulContext, buildAlexPlayfulContext, buildMayaPlayfulContext, buildJordanPlayfulContext, };
//# sourceMappingURL=persona-playful.d.ts.map