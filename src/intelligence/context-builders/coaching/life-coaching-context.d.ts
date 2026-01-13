/**
 * Life Coaching Context Builder
 *
 * Injects persona-voiced phrases from life coaching domain behavior JSON files
 * into the LLM context when relevant topics are detected.
 *
 * DOMAINS SUPPORTED:
 * - second-chances: Fresh starts, reinvention, rebuilding after setbacks
 * - connection: Loneliness, belonging, adult friendship, community
 * - difficult-conversations: Hard talks, boundaries, practice mode
 * - life-transitions: Major changes, identity shifts, dual emotions
 * - quiet-growth: Rest, maintenance, anti-hustle, sufficiency
 *
 * BETTER-THAN-HUMAN CAPABILITIES:
 * - Hold hope when they can't
 * - Validate loneliness without fixing
 * - Practice difficult conversations infinitely
 * - Honor dual emotions (happy AND sad)
 * - Celebrate maintenance as success
 *
 * @module LifeCoachingContextBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
type LifeCoachingDomain = 'secondChances' | 'connection' | 'difficultConversations' | 'lifeTransitions' | 'quietGrowth';
interface DetectedDomain {
    domain: LifeCoachingDomain;
    confidence: number;
    triggers: string[];
}
declare function detectLifeCoachingDomains(userText: string, emotion?: string, topics?: string[]): DetectedDomain[];
declare function buildLifeCoachingContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildLifeCoachingContext, detectLifeCoachingDomains };
//# sourceMappingURL=life-coaching-context.d.ts.map