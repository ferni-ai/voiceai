/**
 * Mortality Perspective Context Builder
 *
 * Provides Nayan (Wisdom Guide) with concrete mortality awareness.
 * "Better than Human" - The Stoic memento mori made personal and actionable.
 *
 * This is NOT morbid - it's clarifying. When you know the number of Tuesdays left,
 * you stop wasting them.
 *
 * Superhuman Capabilities:
 * - Concrete time remaining calculations
 * - Parent/family visit countdowns
 * - "Someday" to "today" reframes
 * - Seasonal and cyclical awareness
 *
 * @module intelligence/context-builders/mortality-perspective
 */
import { type LifeExpectancyResult } from '../../../services/wisdom/life-expectancy.js';
interface MortalityContext {
    /** User's calculated life expectancy */
    lifeExpectancy: LifeExpectancyResult | null;
    /** Relevant mortality perspective for current topic */
    perspective: {
        statement: string;
        wisdom: string;
        prompt: string;
    } | null;
    /** Concrete time calculations */
    timeRemaining: {
        summers: number;
        christmases: number;
        tuesdays: number;
        fullMoons: number;
    } | null;
    /** Formatted context for LLM */
    contextString: string;
}
interface UserMortalityProfile {
    birthDate: Date;
    sex: 'male' | 'female';
    parentAges?: {
        mother?: number;
        father?: number;
    };
    healthFactors?: {
        smoker?: boolean;
        exerciseFrequency?: 'none' | 'occasional' | 'regular' | 'daily';
    };
}
/**
 * Detect if conversation warrants mortality perspective
 */
declare function detectMortalityRelevance(text: string): {
    relevant: boolean;
    topic?: string;
    parentMentioned?: boolean;
};
/**
 * Build mortality perspective context for Nayan
 *
 * Called during context injection when Nayan is discussing relevant topics
 */
export declare function buildMortalityPerspectiveContext(userId: string, recentTranscript: string, userProfile?: UserMortalityProfile): Promise<MortalityContext | null>;
/**
 * Generate superhuman mortality moment for Nayan
 *
 * Used for proactive wisdom during conversation
 */
export declare function generateSuperhumanWisdomMoment(userProfile: UserMortalityProfile, currentTopic?: string): string | null;
/**
 * Calculate remaining instances of specific life events
 *
 * "You have 40 more Christmases. How do you want to spend them?"
 */
export declare function calculateConcreteRemaining(userProfile: UserMortalityProfile, eventType: 'christmas' | 'birthday' | 'summer' | 'fullMoon' | 'tuesday' | 'weekend' | 'sunrise'): {
    count: number;
    wisdom: string;
} | null;
/**
 * Calculate remaining visits with a parent
 *
 * "At your current visit rate, you have roughly 60 visits left with your parent."
 */
export declare function calculateParentVisitsRemaining(parentAge: number, visitFrequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'): {
    visits: number;
    wisdom: string;
} | null;
declare const _default: {
    buildMortalityPerspectiveContext: typeof buildMortalityPerspectiveContext;
    generateSuperhumanWisdomMoment: typeof generateSuperhumanWisdomMoment;
    calculateConcreteRemaining: typeof calculateConcreteRemaining;
    calculateParentVisitsRemaining: typeof calculateParentVisitsRemaining;
    detectMortalityRelevance: typeof detectMortalityRelevance;
};
export default _default;
//# sourceMappingURL=mortality-perspective.d.ts.map