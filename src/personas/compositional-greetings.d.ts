/**
 * Compositional Greeting System
 *
 * Instead of picking pre-written templates, this system COMPOSES greetings
 * from atomic building blocks at runtime. This creates exponential variety
 * from a small set of pieces.
 *
 * Structure: [Opening] + [Recognition] + [Activity/Moment] + [Transition] + [Closer]
 *
 * Each persona defines their own atoms in greeting-atoms.json, keeping them on-brand
 * while still getting exponential variety.
 *
 * Example: 16 openings × 8 recognitions × 10 activities × 9 transitions × 15 closers
 *        = 172,800 unique combinations per persona (vs ~15 templates)
 */
import type { BundleRuntimeEngine } from './bundles/runtime.js';
import type { PersonaConfig } from './types.js';
export interface GreetingContext {
    personaName: string;
    userName?: string;
    isReturningUser: boolean;
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
    isWeekend: boolean;
    dayOfWeek: string;
    caughtDoing?: string;
    physicalMoment?: string;
}
interface WeightedOption {
    text: string;
    weight: number;
    minRelationship?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    timeOfDay?: Array<'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night'>;
    requiresName?: boolean;
    requiresCaughtDoing?: boolean;
    returningOnly?: boolean;
    newOnly?: boolean;
    isWeekend?: boolean;
}
/**
 * Compose a greeting from atomic building blocks
 *
 * "BETTER THAN HUMAN" - Compositional greetings now have:
 * - Breath before words (~30%)
 * - Speed arc (slower opener → normal question)
 * - Patient landing pause after question
 * - Time-of-day awareness (softer for late night)
 */
export declare function composeGreeting(ctx: GreetingContext, atoms?: WeightedOption[][]): string;
/**
 * Generate a compositional greeting using persona-specific atoms
 */
export declare function generateCompositionalGreeting(runtime: BundleRuntimeEngine | null, persona: PersonaConfig, options?: {
    userName?: string;
    isReturningUser?: boolean;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    /** Session ID for variety tracking - prevents repetitive quirks */
    sessionId?: string;
}): Promise<string | null>;
/**
 * Clear the atoms cache (useful for hot reload in development)
 */
export declare function clearAtomsCache(): void;
export {};
//# sourceMappingURL=compositional-greetings.d.ts.map