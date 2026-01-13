/**
 * Life Expectancy Service
 *
 * Provides mortality perspective for Nayan (Wisdom Guide).
 * "Better than Human" - Concrete, personalized mortality awareness.
 *
 * This is NOT morbid - it's clarifying. The Stoic memento mori made personal.
 *
 * "You said you'd spend more time with your parents 'someday.'
 * At current visit rates, you have roughly 60 visits left.
 * Is that how you want to spend them?"
 *
 * Data Sources:
 * - Social Security Administration actuarial tables
 * - WHO life tables
 * - CDC NVSS (National Vital Statistics System)
 *
 * @module services/wisdom/life-expectancy
 */
export interface LifeExpectancyInput {
    birthDate: Date;
    sex: 'male' | 'female';
    country?: string;
    healthFactors?: {
        smoker?: boolean;
        exerciseFrequency?: 'none' | 'occasional' | 'regular' | 'daily';
        bmi?: number;
        chronicConditions?: string[];
    };
}
export interface LifeExpectancyResult {
    /** Expected remaining years */
    expectedYearsRemaining: number;
    /** Expected total lifespan in years */
    expectedTotalYears: number;
    /** Probability of reaching various ages */
    survivalProbabilities: {
        age: number;
        probability: number;
    }[];
    /** Concrete time units remaining */
    timeRemaining: {
        days: number;
        weeks: number;
        months: number;
        summers: number;
        christmases: number;
        tuesdays: number;
        fullMoons: number;
    };
    /** Wisdom context */
    context: string;
}
export interface MortalityPerspective {
    /** The concrete perspective */
    statement: string;
    /** The reframe */
    wisdom: string;
    /** Action prompt */
    prompt: string;
}
/**
 * Calculate life expectancy based on actuarial data
 */
export declare function calculateLifeExpectancy(input: LifeExpectancyInput): LifeExpectancyResult;
/**
 * Generate a mortality perspective for a specific situation
 *
 * "Better than Human" - Makes abstract mortality concrete and actionable
 */
export declare function generateMortalityPerspective(situation: string, lifeExpectancy: LifeExpectancyResult, additionalContext?: {
    parentAge?: number;
    visitFrequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    activityType?: string;
}): MortalityPerspective;
/**
 * Calculate remaining instances of a specific event
 */
export declare function calculateRemainingInstances(lifeExpectancy: LifeExpectancyResult, eventType: 'christmas' | 'birthday' | 'summer' | 'fullMoon' | 'tuesday' | 'weekend' | 'sunrise' | 'conversation'): {
    count: number;
    wisdom: string;
};
/**
 * Generate a superhuman mortality insight for Nayan
 *
 * Used in context injection to provide perspective
 */
export declare function generateSuperhumanMortalityMoment(lifeExpectancy: LifeExpectancyResult, currentTopic?: string): string | null;
declare const _default: {
    calculateLifeExpectancy: typeof calculateLifeExpectancy;
    generateMortalityPerspective: typeof generateMortalityPerspective;
    calculateRemainingInstances: typeof calculateRemainingInstances;
    generateSuperhumanMortalityMoment: typeof generateSuperhumanMortalityMoment;
};
export default _default;
//# sourceMappingURL=life-expectancy.d.ts.map