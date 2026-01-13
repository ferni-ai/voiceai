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
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'LifeExpectancy' });
// ============================================================================
// ACTUARIAL DATA (2023 SSA Period Life Table)
// ============================================================================
// Life expectancy by age and sex (US data, 2023 estimates)
// Source: Social Security Administration Period Life Table
const LIFE_TABLE_MALE = {
    0: 76.1,
    5: 71.5,
    10: 66.5,
    15: 61.6,
    20: 56.8,
    25: 52.1,
    30: 47.4,
    35: 42.7,
    40: 38.1,
    45: 33.6,
    50: 29.2,
    55: 25.0,
    60: 21.1,
    65: 17.5,
    70: 14.2,
    75: 11.2,
    80: 8.5,
    85: 6.3,
    90: 4.6,
    95: 3.3,
    100: 2.4,
};
const LIFE_TABLE_FEMALE = {
    0: 81.2,
    5: 76.5,
    10: 71.5,
    15: 66.6,
    20: 61.7,
    25: 56.8,
    30: 52.0,
    35: 47.1,
    40: 42.3,
    45: 37.6,
    50: 33.0,
    55: 28.5,
    60: 24.2,
    65: 20.1,
    70: 16.3,
    75: 12.8,
    80: 9.7,
    85: 7.1,
    90: 5.1,
    95: 3.6,
    100: 2.6,
};
// Survival probability to age X given current age (simplified)
const SURVIVAL_PROBABILITY = {
    // From age 30, probability of reaching...
    30: { 50: 0.96, 60: 0.92, 70: 0.84, 80: 0.67, 90: 0.32, 100: 0.04 },
    40: { 50: 0.97, 60: 0.93, 70: 0.86, 80: 0.70, 90: 0.35, 100: 0.05 },
    50: { 60: 0.95, 70: 0.88, 80: 0.73, 90: 0.38, 100: 0.06 },
    60: { 70: 0.91, 80: 0.77, 90: 0.42, 100: 0.08 },
    70: { 80: 0.82, 90: 0.48, 100: 0.10 },
    80: { 90: 0.55, 100: 0.14 },
};
// Health factor adjustments (simplified, evidence-based estimates)
const HEALTH_ADJUSTMENTS = {
    smoker: -10, // years
    exerciseNone: -3,
    exerciseOccasional: 0,
    exerciseRegular: +2,
    exerciseDaily: +4,
    bmiUnderweight: -2, // BMI < 18.5
    bmiNormal: 0, // BMI 18.5-24.9
    bmiOverweight: -1, // BMI 25-29.9
    bmiObese: -4, // BMI 30+
    chronicCondition: -2, // per major condition
};
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Calculate life expectancy based on actuarial data
 */
export function calculateLifeExpectancy(input) {
    const now = new Date();
    const currentAge = Math.floor((now.getTime() - input.birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    // Get base life expectancy from table
    const lifeTable = input.sex === 'male' ? LIFE_TABLE_MALE : LIFE_TABLE_FEMALE;
    // Find closest age in table
    const ages = Object.keys(lifeTable)
        .map(Number)
        .sort((a, b) => a - b);
    let closestAge = ages[0];
    for (const age of ages) {
        if (age <= currentAge)
            closestAge = age;
        else
            break;
    }
    let expectedYearsRemaining = lifeTable[closestAge] - (currentAge - closestAge);
    // Apply health adjustments
    if (input.healthFactors) {
        const { smoker, exerciseFrequency, bmi, chronicConditions } = input.healthFactors;
        if (smoker) {
            expectedYearsRemaining += HEALTH_ADJUSTMENTS.smoker;
        }
        if (exerciseFrequency) {
            const exerciseKey = `exercise${exerciseFrequency.charAt(0).toUpperCase()}${exerciseFrequency.slice(1)}`;
            if (exerciseKey in HEALTH_ADJUSTMENTS) {
                expectedYearsRemaining += HEALTH_ADJUSTMENTS[exerciseKey];
            }
        }
        if (bmi) {
            if (bmi < 18.5)
                expectedYearsRemaining += HEALTH_ADJUSTMENTS.bmiUnderweight;
            else if (bmi < 25)
                expectedYearsRemaining += HEALTH_ADJUSTMENTS.bmiNormal;
            else if (bmi < 30)
                expectedYearsRemaining += HEALTH_ADJUSTMENTS.bmiOverweight;
            else
                expectedYearsRemaining += HEALTH_ADJUSTMENTS.bmiObese;
        }
        if (chronicConditions) {
            expectedYearsRemaining +=
                HEALTH_ADJUSTMENTS.chronicCondition * Math.min(chronicConditions.length, 3);
        }
    }
    // Ensure reasonable bounds
    expectedYearsRemaining = Math.max(1, Math.min(expectedYearsRemaining, 60));
    const expectedTotalYears = currentAge + expectedYearsRemaining;
    // Calculate survival probabilities
    const survivalProbabilities = [];
    const probTable = SURVIVAL_PROBABILITY[closestAge] || {};
    for (const [targetAge, prob] of Object.entries(probTable)) {
        const age = Number(targetAge);
        if (age > currentAge) {
            survivalProbabilities.push({ age, probability: prob });
        }
    }
    // Calculate concrete time units
    const daysRemaining = Math.round(expectedYearsRemaining * 365.25);
    const timeRemaining = {
        days: daysRemaining,
        weeks: Math.round(expectedYearsRemaining * 52),
        months: Math.round(expectedYearsRemaining * 12),
        summers: Math.round(expectedYearsRemaining),
        christmases: Math.round(expectedYearsRemaining),
        tuesdays: Math.round(expectedYearsRemaining * 52),
        fullMoons: Math.round(expectedYearsRemaining * 12.37),
    };
    // Generate wisdom context
    const context = generateWisdomContext(currentAge, expectedYearsRemaining);
    log.debug({ currentAge, expectedYearsRemaining, sex: input.sex }, 'Calculated life expectancy');
    return {
        expectedYearsRemaining,
        expectedTotalYears,
        survivalProbabilities,
        timeRemaining,
        context,
    };
}
function generateWisdomContext(currentAge, yearsRemaining) {
    if (currentAge < 30) {
        return 'You are in the spring of life. The seeds you plant now will determine your harvest.';
    }
    else if (currentAge < 50) {
        return 'You are in the summer of life. Full strength, full responsibility. Use it wisely.';
    }
    else if (currentAge < 70) {
        return 'You are in the autumn of life. The harvest is being gathered. What matters most?';
    }
    else {
        return 'You are in the winter of life. Wisdom deepens. Legacy clarifies. Every moment is precious.';
    }
}
// ============================================================================
// MORTALITY PERSPECTIVES (Nayan's Superhuman Tool)
// ============================================================================
/**
 * Generate a mortality perspective for a specific situation
 *
 * "Better than Human" - Makes abstract mortality concrete and actionable
 */
export function generateMortalityPerspective(situation, lifeExpectancy, additionalContext) {
    const { timeRemaining, expectedYearsRemaining } = lifeExpectancy;
    // Parent visits perspective
    if (additionalContext?.parentAge && additionalContext?.visitFrequency) {
        const parentExpectancy = calculateParentExpectancy(additionalContext.parentAge);
        const visitsPerYear = additionalContext.visitFrequency === 'weekly'
            ? 52
            : additionalContext.visitFrequency === 'monthly'
                ? 12
                : additionalContext.visitFrequency === 'quarterly'
                    ? 4
                    : 1;
        const visitsRemaining = Math.round(parentExpectancy * visitsPerYear);
        return {
            statement: `At your current visit rate, you have approximately ${visitsRemaining} visits left with your parent.`,
            wisdom: 'Time with loved ones is not infinite. The number is knowable. The question is: how do you want to spend those visits?',
            prompt: `If you had exactly ${visitsRemaining} more conversations with them, what would you want to say?`,
        };
    }
    // Tuesdays perspective
    if (situation.toLowerCase().includes('someday') || situation.toLowerCase().includes('later')) {
        return {
            statement: `You have roughly ${timeRemaining.tuesdays.toLocaleString()} Tuesdays left.`,
            wisdom: '"Someday" is not on the calendar. Today is.',
            prompt: 'What if you started this Tuesday instead of "someday"?',
        };
    }
    // Career perspective
    if (situation.toLowerCase().includes('career') || situation.toLowerCase().includes('work')) {
        const workingYearsLeft = Math.max(0, 65 - (80 - expectedYearsRemaining));
        const workingMondays = workingYearsLeft * 50; // ~50 work weeks per year
        return {
            statement: `You have approximately ${workingMondays.toLocaleString()} work Mondays left.`,
            wisdom: 'Your career is not forever. It is a season. Are you spending it on what matters?',
            prompt: `If this job ends in ${workingYearsLeft} years, what do you want to have built?`,
        };
    }
    // Health perspective
    if (situation.toLowerCase().includes('health') || situation.toLowerCase().includes('exercise')) {
        return {
            statement: `Regular exercise could add 3-5 quality years to your life - that's ${(3.5 * 365).toLocaleString()} more sunrises.`,
            wisdom: 'Your body is the only home you will live in your entire life. How are you maintaining it?',
            prompt: 'What could you do today to earn more days?',
        };
    }
    // Default perspective
    return {
        statement: `You have approximately ${timeRemaining.days.toLocaleString()} days remaining. ${timeRemaining.summers} more summers. ${timeRemaining.christmases} more Christmases.`,
        wisdom: 'The number of days is finite and knowable. This is not morbid - it is clarifying.',
        prompt: 'Knowing this, what becomes more important? What becomes less?',
    };
}
function calculateParentExpectancy(parentAge) {
    // Simplified: average life expectancy remaining for someone of that age
    const table = LIFE_TABLE_FEMALE; // Use female as more conservative estimate
    const ages = Object.keys(table)
        .map(Number)
        .sort((a, b) => a - b);
    let closestAge = ages[0];
    for (const age of ages) {
        if (age <= parentAge)
            closestAge = age;
        else
            break;
    }
    return table[closestAge] - (parentAge - closestAge);
}
// ============================================================================
// TIME UNIT CALCULATIONS
// ============================================================================
/**
 * Calculate remaining instances of a specific event
 */
export function calculateRemainingInstances(lifeExpectancy, eventType) {
    const { expectedYearsRemaining } = lifeExpectancy;
    const calculations = {
        christmas: {
            count: Math.round(expectedYearsRemaining),
            wisdom: "Each Christmas is a gift you've already been given. How many more will you receive?",
        },
        birthday: {
            count: Math.round(expectedYearsRemaining),
            wisdom: 'A birthday is not just a year older - it is a year less. Celebrate accordingly.',
        },
        summer: {
            count: Math.round(expectedYearsRemaining),
            wisdom: 'Summer is finite. The warmth you feel will not last forever. Savor it.',
        },
        fullMoon: {
            count: Math.round(expectedYearsRemaining * 12.37),
            wisdom: 'The moon has risen for 4.5 billion years. You will see it only a few hundred more times.',
        },
        tuesday: {
            count: Math.round(expectedYearsRemaining * 52),
            wisdom: 'Tuesday seems ordinary. But you only have so many. What will you do with this one?',
        },
        weekend: {
            count: Math.round(expectedYearsRemaining * 52),
            wisdom: 'Weekends feel endless when you are young. They become precious when you count them.',
        },
        sunrise: {
            count: Math.round(expectedYearsRemaining * 365.25),
            wisdom: 'You have seen perhaps 10,000 sunrises. You may see 10,000 more. Have you really SEEN any of them?',
        },
        conversation: {
            count: Math.round(expectedYearsRemaining * 365 * 10), // ~10 meaningful conversations per day
            wisdom: 'Every conversation is a chance to connect. How many have you wasted on small talk?',
        },
    };
    return calculations[eventType] || { count: 0, wisdom: '' };
}
// ============================================================================
// SUPERHUMAN MOMENT GENERATOR
// ============================================================================
/**
 * Generate a superhuman mortality insight for Nayan
 *
 * Used in context injection to provide perspective
 */
export function generateSuperhumanMortalityMoment(lifeExpectancy, currentTopic) {
    const { timeRemaining, context } = lifeExpectancy;
    // Topic-specific moments
    if (currentTopic?.toLowerCase().includes('procrastinat')) {
        return `You have ${timeRemaining.tuesdays.toLocaleString()} Tuesdays left. Is "I'll do it later" really what you want to say ${Math.round(timeRemaining.tuesdays / 52)} years from now?`;
    }
    if (currentTopic?.toLowerCase().includes('parent') || currentTopic?.toLowerCase().includes('family')) {
        return `Time with family is countable. Finite. Knowable. What would you say if you knew exactly how many conversations were left?`;
    }
    if (currentTopic?.toLowerCase().includes('someday')) {
        return `"Someday" does not exist. There are only ${timeRemaining.days.toLocaleString()} days. Today is one of them.`;
    }
    // Random profound moment
    const moments = [
        `You have ${timeRemaining.summers} more summers. Not infinite. Countable. How will you spend them?`,
        `${timeRemaining.fullMoons} more full moons. The ancients tracked these. Do you even notice them?`,
        context,
    ];
    return moments[Math.floor(Math.random() * moments.length)];
}
export default {
    calculateLifeExpectancy,
    generateMortalityPerspective,
    calculateRemainingInstances,
    generateSuperhumanMortalityMoment,
};
//# sourceMappingURL=life-expectancy.js.map